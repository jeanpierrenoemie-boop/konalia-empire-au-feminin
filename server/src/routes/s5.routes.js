/**
 * S5 — TA CIBLE & SON PROBLÈME
 * Routes for S5 Target & Problem Investigation.
 *
 * Live data stored in participant_data with data_type = 's5_target_problem'.
 * On submit: mission_submission created + snapshot stored. NO decisions, NO proofs.
 *
 * participant_data.content (JSON):
 * {
 *   version: 1,
 *   status: "draft" | "submitted",
 *   direction_ref: { decision_id, formulation, person, problem },
 *   target_test: { who, situation, recognition_signals, access_places },
 *   five_person_test: { answer, diagnosis, note },
 *   problem_to_investigate: { situation, difficulty, consequence, why_investigate },
 *   epistemic: { facts, facts_acknowledged, assumptions, assumptions_acknowledged, to_verify, to_verify_acknowledged },
 *   synthesis: string,
 *   submitted_at: null | ISO string
 * }
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's5_target_problem';
const VALID_FIVE_PERSON_ANSWERS = ['yes', 'unsure', 'no'];

/* ── Default state ──────────────────────────────────────────────── */
function defaultState() {
  return {
    version: 1,
    status: 'draft',
    direction_ref: { decision_id: null, formulation: '', person: '', problem: '' },
    target_test: { who: '', situation: '', recognition_signals: '', access_places: '' },
    five_person_test: { answer: null, diagnosis: [], note: '' },
    problem_to_investigate: { situation: '', difficulty: '', consequence: '', why_investigate: '' },
    epistemic: {
      facts: '', facts_acknowledged: false,
      assumptions: '', assumptions_acknowledged: false,
      to_verify: '', to_verify_acknowledged: false,
    },
    synthesis: '',
    submitted_at: null,
  };
}

/* ── Completeness check ─────────────────────────────────────────── */
function checkS5Completeness(data, activeDirection) {
  if (!activeDirection) {
    return { ok: false, error: 'Aucune Direction S4 active trouvée. Verrouille ta Direction avant de continuer.' };
  }

  const t = data.target_test ?? {};
  if (!t.who?.trim()) return { ok: false, error: 'Décris qui est ta cible test (Qui ?).' };
  if (!t.situation?.trim()) return { ok: false, error: 'Décris la situation de ta cible test.' };
  if (!t.recognition_signals?.trim()) return { ok: false, error: 'Indique comment tu reconnaîtrais une personne de cette cible.' };
  if (!t.access_places?.trim()) return { ok: false, error: 'Indique où tu peux trouver ces personnes concrètement.' };

  const fp = data.five_person_test ?? {};
  if (!VALID_FIVE_PERSON_ANSWERS.includes(fp.answer)) {
    return { ok: false, error: 'Réponds au Test des 5 (oui / pas sûre / non).' };
  }
  if (fp.answer === 'unsure' || fp.answer === 'no') {
    const hasDiagnosis = Array.isArray(fp.diagnosis) && fp.diagnosis.length > 0;
    const hasNote = typeof fp.note === 'string' && fp.note.trim();
    if (!hasDiagnosis && !hasNote) {
      return { ok: false, error: 'Pour un Test des 5 "pas sûre" ou "non", indique un diagnostic ou une note.' };
    }
  }

  const p = data.problem_to_investigate ?? {};
  if (!p.situation?.trim()) return { ok: false, error: 'Décris la situation du problème à investiguer.' };
  if (!p.difficulty?.trim()) return { ok: false, error: 'Décris la difficulté du problème à investiguer.' };
  if (!p.consequence?.trim()) return { ok: false, error: 'Décris la conséquence du problème à investiguer.' };
  if (!p.why_investigate?.trim()) return { ok: false, error: 'Explique pourquoi investiguer ce problème.' };

  const ep = data.epistemic ?? {};
  if (!ep.facts?.trim() && !ep.facts_acknowledged) {
    return { ok: false, error: 'Indique ce que tu sais (faits) — ou confirme que tu n\'as rien à ajouter.' };
  }
  if (!ep.assumptions?.trim() && !ep.assumptions_acknowledged) {
    return { ok: false, error: 'Indique tes suppositions — ou confirme que tu n\'as rien à ajouter.' };
  }
  if (!ep.to_verify?.trim() && !ep.to_verify_acknowledged) {
    return { ok: false, error: 'Indique ce que tu dois vérifier — ou confirme que tu n\'as rien à ajouter.' };
  }

  return { ok: true, error: null };
}

/* ── GET /api/s5/target-problem ─────────────────────────────────── */
router.get('/target-problem', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Load active S4 direction
  const activeDirection = await db.queryOne(
    `SELECT id, title, context FROM decisions WHERE user_id = ? AND status = 'active' AND decision_type IN ('project','pivot','scope') ORDER BY created_at DESC LIMIT 1`,
    [uid]
  );

  if (!activeDirection) {
    return res.status(400).json({ error: 'Aucune Direction S4 active. Verrouille ta Direction (Sprint 4) avant de commencer le Sprint 5.' });
  }

  let directionRef = { decision_id: activeDirection.id, formulation: '', person: '', problem: '' };
  try {
    const ctx = JSON.parse(activeDirection.context ?? '{}');
    directionRef = {
      decision_id: activeDirection.id,
      formulation: ctx.direction?.formulation ?? '',
      person: ctx.direction?.person ?? '',
      problem: ctx.direction?.problem ?? '',
    };
  } catch {}

  const s5Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  if (!s5Row) {
    return res.json({ s5: null, direction_ref: directionRef });
  }

  const parsed = JSON.parse(s5Row.content);
  return res.json({
    s5: { id: s5Row.id, ...parsed, updated_at: s5Row.updated_at },
    direction_ref: directionRef,
  });
});

/* ── PUT /api/s5/target-problem ─────────────────────────────────── */
router.put('/target-problem', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : defaultState();

  if (current.status === 'submitted') {
    return res.status(409).json({ error: 'Cette cible test a déjà été soumise. Elle ne peut plus être modifiée.' });
  }

  const {
    direction_ref, target_test, five_person_test,
    problem_to_investigate, epistemic, synthesis,
  } = req.body ?? {};

  // Merge incoming fields with existing state
  const merged = {
    version: 1,
    status: 'draft',
    direction_ref: direction_ref !== undefined
      ? { ...current.direction_ref, ...direction_ref }
      : current.direction_ref,
    target_test: target_test !== undefined
      ? { ...current.target_test, ...target_test }
      : current.target_test,
    five_person_test: five_person_test !== undefined
      ? {
          answer: five_person_test.answer !== undefined ? five_person_test.answer : current.five_person_test.answer,
          diagnosis: Array.isArray(five_person_test.diagnosis) ? five_person_test.diagnosis : current.five_person_test.diagnosis,
          note: five_person_test.note !== undefined ? String(five_person_test.note ?? '') : current.five_person_test.note,
        }
      : current.five_person_test,
    problem_to_investigate: problem_to_investigate !== undefined
      ? { ...current.problem_to_investigate, ...problem_to_investigate }
      : current.problem_to_investigate,
    epistemic: epistemic !== undefined
      ? {
          facts: epistemic.facts !== undefined ? String(epistemic.facts ?? '') : current.epistemic.facts,
          facts_acknowledged: epistemic.facts_acknowledged !== undefined ? !!epistemic.facts_acknowledged : current.epistemic.facts_acknowledged,
          assumptions: epistemic.assumptions !== undefined ? String(epistemic.assumptions ?? '') : current.epistemic.assumptions,
          assumptions_acknowledged: epistemic.assumptions_acknowledged !== undefined ? !!epistemic.assumptions_acknowledged : current.epistemic.assumptions_acknowledged,
          to_verify: epistemic.to_verify !== undefined ? String(epistemic.to_verify ?? '') : current.epistemic.to_verify,
          to_verify_acknowledged: epistemic.to_verify_acknowledged !== undefined ? !!epistemic.to_verify_acknowledged : current.epistemic.to_verify_acknowledged,
        }
      : current.epistemic,
    synthesis: synthesis !== undefined ? String(synthesis ?? '') : current.synthesis,
    submitted_at: current.submitted_at ?? null,
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

  return res.json({ ok: true, s5: { id, ...merged } });
});

/* ── POST /api/s5/target-problem/submit ─────────────────────────── */
router.post('/target-problem/submit', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucune cible test à soumettre. Commence par remplir ta Cible Test.' });
  }

  const data = JSON.parse(existing.content);

  // Load active S4 direction
  const activeDirection = await db.queryOne(
    `SELECT id, title, context FROM decisions WHERE user_id = ? AND status = 'active' AND decision_type IN ('project','pivot','scope') ORDER BY created_at DESC LIMIT 1`,
    [uid]
  );

  const completeness = checkS5Completeness(data, activeDirection);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  // Build direction_ref from active direction
  let directionRef = { decision_id: activeDirection.id, formulation: '', person: '', problem: '' };
  try {
    const ctx = JSON.parse(activeDirection.context ?? '{}');
    directionRef = {
      decision_id: activeDirection.id,
      formulation: ctx.direction?.formulation ?? '',
      person: ctx.direction?.person ?? '',
      problem: ctx.direction?.problem ?? '',
    };
  } catch {}

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 5 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  const now = new Date().toISOString();
  let submissionId = null;

  await db.transaction(async tx => {
    if (mission) {
      const snapshotContent = JSON.stringify({
        type: 's5_target_problem_snapshot',
        s5_ref: existing.id,
        direction_ref: directionRef,
        target_test: data.target_test,
        five_person_test: data.five_person_test,
        problem_to_investigate: data.problem_to_investigate,
        epistemic: data.epistemic,
        synthesis: data.synthesis,
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
          [snapshotContent, now, existingSub.id]
        );
      } else {
        submissionId = randomUUID();
        await tx.execute(
          `INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)`,
          [submissionId, mission.id, uid, cohortId ?? '', snapshotContent, now, now]
        );
      }
    }

    const submittedContent = JSON.stringify({
      ...data,
      status: 'submitted',
      direction_ref: directionRef,
      submitted_at: now,
      mission_submission_id: submissionId ?? null,
    });

    await tx.execute(
      `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      [submittedContent, existing.id]
    );

    await tx.writeAudit({
      actorId: uid,
      targetUserId: uid,
      eventType: 's5_target_problem_submitted',
      tableName: 'mission_submissions',
      afterState: { mission_submission_id: submissionId, direction_decision_id: directionRef.decision_id },
    });
  });

  const submission = submissionId
    ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId])
    : null;

  return res.json({ ok: true, submission });
});

export default router;
