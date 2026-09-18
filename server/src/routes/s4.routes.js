/**
 * S4 — VERROUILLE TA DIRECTION
 * Routes for S4 Direction Contract.
 *
 * Live data stored in participant_data with data_type = 's4_direction'.
 * Lock creates atomically: mission_submission + decisions row + proofs row.
 *
 * participant_data.content (JSON):
 * {
 *   version: 1,
 *   status: "draft" | "locked",
 *   s3_ref: string | null,           -- id of s3_arbitration participant_data row
 *   s3_snapshot_priority: {...},     -- snapshot of S3 priority path at start of S4
 *   direction: {
 *     formulation: string,           -- participant-confirmed Direction statement
 *     person: string,                -- prefilled from S3, confirmed
 *     problem: string,               -- prefilled from S3, confirmed
 *   },
 *   why_for_test: string,            -- prefilled from S3 why_priority, confirmed
 *   facts: string,                   -- prefilled from S3 decision_basis.facts
 *   facts_acknowledged: boolean,
 *   hypotheses: string,              -- prefilled from S3 decision_basis.hypotheses
 *   hypotheses_acknowledged: boolean,
 *   to_verify: string,               -- prefilled from S3 remaining_to_verify
 *   accepted_unknown: string,        -- prefilled from S3 accepted_unknown
 *   set_aside_paths: [...],          -- other retained S2 paths (not priority)
 *   reopening_conditions: {
 *     hypothesis_contradiction: string,
 *     major_constraint: string,
 *     new_information: string,
 *     acknowledged: { hypothesis_contradiction: bool, major_constraint: bool, new_information: bool }
 *   },
 *   participant_confirmed: boolean,
 *   confirmed_at: null | ISO string,
 *   mission_submission_id: null | string,
 *   decision_id: null | string,
 *   proof_id: null | string,
 * }
 *
 * Lock sequence (one transaction):
 *   1. Idempotency — if decision_id exists → return existing
 *   2. Supersession — if existing active project decision → supersede it
 *   3. INSERT decisions row (type: project, status: active)
 *   4. INSERT mission_submissions row
 *   5. INSERT proofs row (cadre_step: A, proof_type: note)
 *   6. UPDATE participant_data to status: locked
 *   7. writeAudit
 *
 * Constraints:
 *   - No Direction created on draft save.
 *   - No Direction created by COPILOTE.
 *   - participant_confirmed must be true before lock.
 *   - No duplicate active project decisions per user.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's4_direction';
const S3_DATA_TYPE = 's3_arbitration';

const REOPENING_KEYS = ['hypothesis_contradiction', 'major_constraint', 'new_information'];

/* ── Completeness check ─────────────────────────────────────────── */
function checkS4Completeness(data) {
  const dir = data.direction ?? {};

  if (!dir.formulation?.trim()) {
    return { ok: false, error: 'Formule ta Direction (ce que tu vas tester, pour qui, autour de quel problème).' };
  }
  if (!dir.person?.trim()) {
    return { ok: false, error: 'Précise la personne au cœur de ta Direction.' };
  }
  if (!dir.problem?.trim()) {
    return { ok: false, error: 'Précise le problème que ta Direction cherche à explorer.' };
  }
  if (!data.why_for_test?.trim()) {
    return { ok: false, error: 'Explique pourquoi cette Direction mérite d\'être testée.' };
  }
  if (!data.to_verify?.trim()) {
    return { ok: false, error: 'Indique ce qui reste à vérifier.' };
  }
  if (!data.accepted_unknown?.trim()) {
    return { ok: false, error: 'Indique ce que tu acceptes de ne pas encore savoir.' };
  }

  // facts and hypotheses: must have content OR acknowledged
  if (!data.facts?.trim() && !data.facts_acknowledged) {
    return { ok: false, error: 'Indique ce que tu sais (faits) — ou confirme que tu n\'as rien à ajouter.' };
  }
  if (!data.hypotheses?.trim() && !data.hypotheses_acknowledged) {
    return { ok: false, error: 'Indique tes hypothèses — ou confirme que tu n\'as rien à ajouter.' };
  }

  // reopening_conditions: all 3 required OR acknowledged
  const rc = data.reopening_conditions ?? {};
  const rcAck = rc.acknowledged ?? {};
  for (const key of REOPENING_KEYS) {
    const label = {
      hypothesis_contradiction: 'Hypothèse centrale contredite',
      major_constraint: 'Contrainte majeure',
      new_information: 'Information nouvelle significative',
    }[key];
    if (!rc[key]?.trim() && !rcAck[key]) {
      return { ok: false, error: `Définis la condition de réouverture "${label}" — ou confirme qu'elle n'est pas applicable.` };
    }
  }

  if (!data.participant_confirmed) {
    return { ok: false, error: 'Confirme que tu verrouilles cette Direction pour test.' };
  }

  return { ok: true, error: null };
}

/* ── Sanitize direction object ──────────────────────────────────── */
function sanitizeDirection(raw) {
  return {
    formulation: typeof raw?.formulation === 'string' ? raw.formulation : '',
    person: typeof raw?.person === 'string' ? raw.person : '',
    problem: typeof raw?.problem === 'string' ? raw.problem : '',
  };
}

/* ── Sanitize reopening conditions ─────────────────────────────── */
function sanitizeReopening(raw, current) {
  const ack = raw?.acknowledged ?? current?.acknowledged ?? {};
  const result = { acknowledged: {} };
  for (const key of REOPENING_KEYS) {
    result[key] = typeof raw?.[key] === 'string' ? raw[key] : (current?.[key] ?? '');
    result.acknowledged[key] = !!(raw?.acknowledged?.[key] ?? current?.acknowledged?.[key]);
  }
  return result;
}

/* ── Default live state ─────────────────────────────────────────── */
function defaultState() {
  return {
    version: 1,
    status: 'draft',
    s3_ref: null,
    s3_snapshot_priority: null,
    direction: { formulation: '', person: '', problem: '' },
    why_for_test: '',
    facts: '',
    facts_acknowledged: false,
    hypotheses: '',
    hypotheses_acknowledged: false,
    to_verify: '',
    accepted_unknown: '',
    set_aside_paths: [],
    reopening_conditions: {
      hypothesis_contradiction: '',
      major_constraint: '',
      new_information: '',
      acknowledged: { hypothesis_contradiction: false, major_constraint: false, new_information: false },
    },
    participant_confirmed: false,
    confirmed_at: null,
    mission_submission_id: null,
    decision_id: null,
    proof_id: null,
  };
}

/* ── GET /api/s4/direction ──────────────────────────────────────── */
router.get('/direction', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const s4Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  // Load live S3 for s3_changed detection + set_aside display
  const s3Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, S3_DATA_TYPE]
  );
  const s3Data = s3Row ? JSON.parse(s3Row.content) : null;
  const priorityPath = s3Data
    ? (s3Data.s2_snapshot_paths ?? []).find(p => p.id === s3Data.priority_path_id) ?? null
    : null;
  const setAsidePaths = s3Data
    ? (s3Data.s2_snapshot_paths ?? []).filter(p => p.id !== s3Data.priority_path_id)
    : [];

  if (!s4Row) {
    return res.json({ s4: null, priority_path: priorityPath, set_aside_paths: setAsidePaths });
  }

  const parsed = JSON.parse(s4Row.content);

  // Detect S3 change
  const s3Changed = parsed.s3_ref !== s3Row?.id
    || parsed.s3_snapshot_priority?.id !== priorityPath?.id;

  return res.json({
    s4: { id: s4Row.id, ...parsed, s3_changed: s3Changed, updated_at: s4Row.updated_at },
    priority_path: priorityPath,
    set_aside_paths: setAsidePaths,
  });
});

/* ── PUT /api/s4/direction ──────────────────────────────────────── */
router.put('/direction', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const {
    direction, why_for_test, facts, facts_acknowledged,
    hypotheses, hypotheses_acknowledged,
    to_verify, accepted_unknown, set_aside_paths,
    reopening_conditions, participant_confirmed,
    refresh_s3,
  } = req.body ?? {};

  // Load S3 — required
  const s3Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, S3_DATA_TYPE]
  );
  if (!s3Row) {
    return res.status(400).json({ error: 'Complète le Sprint 3 avant de commencer le Sprint 4.' });
  }
  const s3Data = JSON.parse(s3Row.content);
  if (s3Data.status !== 'complete' || !s3Data.priority_path_id) {
    return res.status(400).json({ error: 'Le Sprint 3 n\'est pas encore finalisé avec une piste prioritaire.' });
  }
  const livePriorityPath = (s3Data.s2_snapshot_paths ?? []).find(p => p.id === s3Data.priority_path_id) ?? null;
  const liveSetAsidePaths = (s3Data.s2_snapshot_paths ?? []).filter(p => p.id !== s3Data.priority_path_id);

  // Load existing S4
  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : defaultState();

  // If already locked, block re-edit of core fields
  if (current.status === 'locked') {
    return res.status(409).json({ error: 'Cette Direction est verrouillée. Elle ne peut plus être modifiée.' });
  }

  // Refresh S3 snapshot if requested or first time
  const shouldRefresh = refresh_s3 || !current.s3_ref || current.s3_ref !== s3Row.id;
  const snapshotPriority = shouldRefresh ? livePriorityPath : (current.s3_snapshot_priority ?? livePriorityPath);

  // Build merged state
  const merged = {
    version: 1,
    status: 'draft',
    s3_ref: s3Row.id,
    s3_snapshot_priority: snapshotPriority,
    direction: direction !== undefined ? sanitizeDirection(direction) : (current.direction ?? defaultState().direction),
    why_for_test: why_for_test !== undefined ? String(why_for_test ?? '') : current.why_for_test,
    facts: facts !== undefined ? String(facts ?? '') : current.facts,
    facts_acknowledged: facts_acknowledged !== undefined ? !!facts_acknowledged : current.facts_acknowledged,
    hypotheses: hypotheses !== undefined ? String(hypotheses ?? '') : current.hypotheses,
    hypotheses_acknowledged: hypotheses_acknowledged !== undefined ? !!hypotheses_acknowledged : current.hypotheses_acknowledged,
    to_verify: to_verify !== undefined ? String(to_verify ?? '') : current.to_verify,
    accepted_unknown: accepted_unknown !== undefined ? String(accepted_unknown ?? '') : current.accepted_unknown,
    set_aside_paths: shouldRefresh ? liveSetAsidePaths : (current.set_aside_paths ?? liveSetAsidePaths),
    reopening_conditions: reopening_conditions !== undefined
      ? sanitizeReopening(reopening_conditions, current.reopening_conditions)
      : (current.reopening_conditions ?? defaultState().reopening_conditions),
    participant_confirmed: participant_confirmed !== undefined ? !!participant_confirmed : current.participant_confirmed,
    confirmed_at: current.confirmed_at ?? null,
    mission_submission_id: current.mission_submission_id ?? null,
    decision_id: current.decision_id ?? null,
    proof_id: current.proof_id ?? null,
  };

  const json = JSON.stringify(merged);
  let id;

  if (existing) {
    id = existing.id;
    await db.execute(
      `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      [json, existing.id]
    );
  } else {
    id = randomUUID();
    await db.execute(
      `INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, ?, ?)`,
      [id, uid, DATA_TYPE, json]
    );
  }

  return res.json({ ok: true, s4: { id, ...merged } });
});

/* ── POST /api/s4/direction/lock — atomic Direction lock ────────── */
router.post('/direction/lock', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Sprint check
  const progress = await db.queryOne(
    `SELECT sprint_number FROM user_progress WHERE user_id = ? LIMIT 1`,
    [uid]
  );
  if (!progress || progress.sprint_number !== 4) {
    return res.status(400).json({ error: 'Cette action est uniquement disponible lors du Sprint 4.' });
  }

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucune Direction à verrouiller. Commence par remplir ton Contrat de Direction.' });
  }

  const data = JSON.parse(existing.content);

  // Idempotency — already locked
  if (data.status === 'locked' && data.decision_id) {
    const dec = await db.queryOne(`SELECT * FROM decisions WHERE id = ?`, [data.decision_id]);
    const sub = data.mission_submission_id
      ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [data.mission_submission_id])
      : null;
    return res.json({ ok: true, decision: dec ?? null, submission: sub ?? null, idempotent: true });
  }

  const completeness = checkS4Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  // Enrollment
  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  // Mission lookup
  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 4 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  // Existing active project decision (for supersession)
  const existingDecision = await db.queryOne(
    `SELECT id, title FROM decisions WHERE user_id = ? AND status = 'active' AND decision_type = 'project' ORDER BY created_at DESC LIMIT 1`,
    [uid]
  );

  const now = new Date().toISOString();
  const priorityPath = data.s3_snapshot_priority;
  const decisionContext = JSON.stringify({
    direction: data.direction,
    priority_path: priorityPath,
    s3_ref: data.s3_ref,
    set_aside_paths: data.set_aside_paths,
    reopening_conditions: data.reopening_conditions,
  });

  let decisionId, submissionId, proofId;

  try {
  await db.transaction(async tx => {
    // 1. Handle supersession or fresh insert
    decisionId = randomUUID();

    if (existingDecision) {
      // Supersede old decision
      await tx.execute(
        `UPDATE decisions SET status = 'superseded' WHERE id = ?`,
        [existingDecision.id]
      );
      await tx.execute(
        `INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, supersedes_id, status, facts_used, hypotheses, reopening_condition, created_at)
         VALUES (?, ?, 'project', ?, ?, ?, 4, 'A', ?, 'active', ?, ?, ?, ?)`,
        [
          decisionId, uid,
          'Direction validée pour test',
          decisionContext,
          data.why_for_test,
          existingDecision.id,
          data.facts ?? '',
          data.hypotheses ?? '',
          JSON.stringify(data.reopening_conditions),
          now,
        ]
      );
    } else {
      await tx.execute(
        `INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
         VALUES (?, ?, 'project', ?, ?, ?, 4, 'A', 'active', ?, ?, ?, ?)`,
        [
          decisionId, uid,
          'Direction validée pour test',
          decisionContext,
          data.why_for_test,
          data.facts ?? '',
          data.hypotheses ?? '',
          JSON.stringify(data.reopening_conditions),
          now,
        ]
      );
    }

    // 2. Mission submission
    if (mission) {
      submissionId = randomUUID();
      const submissionContent = JSON.stringify({
        type: 's4_direction_snapshot',
        s4_ref: existing.id,
        s3_ref: data.s3_ref,
        direction: data.direction,
        priority_path: priorityPath,
        why_for_test: data.why_for_test,
        facts: data.facts,
        facts_acknowledged: data.facts_acknowledged,
        hypotheses: data.hypotheses,
        hypotheses_acknowledged: data.hypotheses_acknowledged,
        to_verify: data.to_verify,
        accepted_unknown: data.accepted_unknown,
        set_aside_paths: data.set_aside_paths,
        reopening_conditions: data.reopening_conditions,
        decision_id: decisionId,
        confirmed_at: now,
        submitted_at: now,
      });

      const existingSub = await tx.queryOne(
        `SELECT id, status FROM mission_submissions WHERE mission_id = ? AND user_id = ?`,
        [mission.id, uid]
      );

      if (existingSub?.status === 'approved') {
        throw Object.assign(new Error('already_approved'), { status: 409 });
      }

      if (existingSub) {
        submissionId = existingSub.id;
        await tx.execute(
          `UPDATE mission_submissions SET content = ?, status = 'submitted', updated_at = ? WHERE id = ?`,
          [submissionContent, now, existingSub.id]
        );
      } else {
        await tx.execute(
          `INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)`,
          [submissionId, mission.id, uid, cohortId ?? '', submissionContent, now, now]
        );
      }
    }

    // 3. Proof #1 — MA DIRECTION
    proofId = randomUUID();
    const proofContent = JSON.stringify({
      type: 'MA DIRECTION',
      formulation: data.direction.formulation,
      person: data.direction.person,
      problem: data.direction.problem,
      why_for_test: data.why_for_test,
      facts: data.facts,
      hypotheses: data.hypotheses,
      to_verify: data.to_verify,
      accepted_unknown: data.accepted_unknown,
      reopening_conditions: data.reopening_conditions,
      confirmed_at: now,
      decision_id: decisionId,
      submission_id: submissionId ?? null,
    });

    await tx.execute(
      `INSERT INTO proofs (id, user_id, submission_id, proof_type, title, content, cadre_step, is_public, created_at, updated_at)
       VALUES (?, ?, ?, 'note', '01 — Ma Direction', ?, 'A', 0, ?, ?)`,
      [proofId, uid, submissionId ?? null, proofContent, now, now]
    );

    // 4. Update live S4 state
    const lockedContent = JSON.stringify({
      ...data,
      status: 'locked',
      confirmed_at: now,
      mission_submission_id: submissionId ?? null,
      decision_id: decisionId,
      proof_id: proofId,
    });
    await tx.execute(
      `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      [lockedContent, existing.id]
    );

    await tx.writeAudit({
      actorId: uid,
      targetUserId: uid,
      eventType: 'strategic_decision_change',
      tableName: 'decisions',
      afterState: { decision_id: decisionId, direction: data.direction.formulation, supersedes: existingDecision?.id ?? null },
    });
  });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: 'Cette mission a déjà été approuvée par Noémie et ne peut pas être soumise à nouveau.' });
    }
    throw err;
  }

  const decision = await db.queryOne(`SELECT * FROM decisions WHERE id = ?`, [decisionId]);
  const submission = submissionId
    ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId])
    : null;
  const proof = await db.queryOne(`SELECT * FROM proofs WHERE id = ?`, [proofId]);

  return res.json({ ok: true, decision, submission, proof });
});

export default router;
