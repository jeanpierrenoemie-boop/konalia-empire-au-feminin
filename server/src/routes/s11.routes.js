/**
 * S11 — DÉCIDER À PARTIR DU RÉEL
 * Routes for S11 Real Decision.
 *
 * Doctrine: DONNÉES TERRAIN → SIGNAUX → INTERPRÉTATION → OPTIONS → DÉCISION → JUSTIFICATION
 * S11 installe la capacité de prendre une décision raisonnée depuis les données réelles.
 *
 * Live data stored in participant_data with data_type = 's11_real_decision'.
 * On submit: mission_submission created + go_nogo decision created (idempotent).
 *
 * Decision values: "go" | "no_go" | "continue_tests"
 * - go: les données disponibles justifient de continuer cette piste
 * - no_go: les données disponibles justifient de ne pas poursuivre dans cette forme
 * - continue_tests: données insuffisantes pour décider — continuer à tester avant de conclure
 *
 * S11 NEW STRATEGIC DECISIONS: 1 (go_nogo, idempotent)
 * S11 NEW REVENUE DECISIONS: 0
 * S11 NEW PROOFS: 0
 *
 * participant_data.content (JSON):
 * {
 *   version: 1,
 *   status: "draft" | "submitted",
 *   source_refs: { s8_field_test_id, s9_learning_review_id, s10_iteration_plan_id },
 *   observed_facts: [{ fact: string, source: string }],
 *   signals: {
 *     recurring: [string],
 *     contradictory: [string],
 *     insufficient: [string]
 *   },
 *   unknowns: [string],
 *   interpretation: string,
 *   options_considered: [string],
 *   decision: "go" | "no_go" | "continue_tests" | null,
 *   justification: string,
 *   next_action: string,
 *   epistemic: { facts, facts_acknowledged, assumptions, assumptions_acknowledged,
 *                to_verify, to_verify_acknowledged },
 *   strategic_decision_id: null | uuid,
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

const DATA_TYPE = 's11_real_decision';
const VALID_DECISIONS = ['go', 'no_go', 'continue_tests'];

/* ── Default state ──────────────────────────────────────────────── */
function defaultState() {
  return {
    version: 1,
    status: 'draft',
    source_refs: {
      s8_field_test_id: null,
      s9_learning_review_id: null,
      s10_iteration_plan_id: null,
    },
    observed_facts: [],
    signals: {
      recurring: [],
      contradictory: [],
      insufficient: [],
    },
    unknowns: [],
    interpretation: '',
    options_considered: [],
    decision: null,
    justification: '',
    next_action: '',
    epistemic: {
      facts: '', facts_acknowledged: false,
      assumptions: '', assumptions_acknowledged: false,
      to_verify: '', to_verify_acknowledged: false,
    },
    strategic_decision_id: null,
    submitted_at: null,
  };
}

/* ── Completeness check ─────────────────────────────────────────── */
function checkS11Completeness(data) {
  if (!data.interpretation?.trim()) {
    return { ok: false, error: 'Formule ton interprétation de ce que tu as observé.' };
  }
  if (!VALID_DECISIONS.includes(data.decision)) {
    return { ok: false, error: 'Choisis une décision (go / no_go / continue_tests).' };
  }
  if (!data.justification?.trim()) {
    return { ok: false, error: 'Explique pourquoi tu prends cette décision.' };
  }
  if (!data.next_action?.trim()) {
    return { ok: false, error: 'Indique ta prochaine action concrète.' };
  }

  const ep = data.epistemic ?? {};
  if (!ep.facts?.trim() && !ep.facts_acknowledged) {
    return { ok: false, error: 'Indique ce que tu sais — ou confirme que tu n\'as rien à ajouter.' };
  }
  if (!ep.assumptions?.trim() && !ep.assumptions_acknowledged) {
    return { ok: false, error: 'Indique tes suppositions — ou confirme que tu n\'as rien à ajouter.' };
  }
  if (!ep.to_verify?.trim() && !ep.to_verify_acknowledged) {
    return { ok: false, error: 'Indique ce que tu dois encore vérifier — ou confirme que tu n\'as rien à ajouter.' };
  }

  return { ok: true, error: null };
}

/* ── Load source refs from previous sprints ─────────────────────── */
async function loadSourceRefs(db, userId) {
  const [s8Row, s9Row, s10Row] = await Promise.all([
    db.queryOne(`SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's8_field_test' LIMIT 1`, [userId]),
    db.queryOne(`SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's9_learning_review' LIMIT 1`, [userId]),
    db.queryOne(`SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's10_iteration_plan' LIMIT 1`, [userId]),
  ]);

  let refs = { s8: null, s9: null, s10: null };

  if (s8Row) {
    try {
      const p = JSON.parse(s8Row.content);
      if (p.status === 'submitted') {
        refs.s8 = {
          id: s8Row.id,
          date: p.field_test?.date ?? null,
          outcome_type: p.field_test?.outcome?.type ?? null,
          what_i_learned: p.field_test?.what_i_learned ?? null,
          initial_reaction: p.field_test?.initial_reaction ?? null,
        };
      }
    } catch {}
  }

  if (s9Row) {
    try {
      const p = JSON.parse(s9Row.content);
      if (p.status === 'submitted') {
        refs.s9 = {
          id: s9Row.id,
          priority_hypothesis: p.hypothesis_to_test?.formulation ?? null,
          observations: (p.observations ?? []).slice(0, 5),
          keep: (p.keep ?? []).map(k => k.element ?? k),
        };
      }
    } catch {}
  }

  if (s10Row) {
    try {
      const p = JSON.parse(s10Row.content);
      if (p.status === 'submitted') {
        refs.s10 = {
          id: s10Row.id,
          hypothesis: p.iteration?.hypothesis ?? null,
          variable_under_test: p.iteration?.variable_under_test ?? null,
          completion_criterion: p.observation_criteria?.completion_criterion ?? null,
          data_to_observe: p.observation_criteria?.data_to_observe ?? null,
        };
      }
    } catch {}
  }

  return refs;
}

/* ── GET /api/s11/real-decision ─────────────────────────────────── */
router.get('/real-decision', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Require S10 to be submitted
  const s10Row = await db.queryOne(
    `SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's10_iteration_plan' LIMIT 1`,
    [uid]
  );
  let s10Submitted = false;
  try { s10Submitted = JSON.parse(s10Row?.content ?? '{}')?.status === 'submitted'; } catch {}
  if (!s10Submitted) {
    return res.status(400).json({ error: 'Le Sprint 10 doit être soumis avant de commencer le Sprint 11.' });
  }

  const sourceRefs = await loadSourceRefs(db, uid);

  const s11Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  if (!s11Row) {
    return res.json({ s11: null, source_refs: sourceRefs });
  }

  const parsed = JSON.parse(s11Row.content);
  return res.json({
    s11: { id: s11Row.id, ...parsed, updated_at: s11Row.updated_at },
    source_refs: sourceRefs,
  });
});

/* ── PUT /api/s11/real-decision ─────────────────────────────────── */
router.put('/real-decision', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : defaultState();

  if (current.status === 'submitted') {
    return res.status(409).json({ error: 'Cette décision a déjà été soumise. Elle ne peut plus être modifiée.' });
  }

  const {
    source_refs, observed_facts, signals, unknowns,
    interpretation, options_considered, decision,
    justification, next_action, epistemic,
  } = req.body ?? {};

  const merged = {
    version: 1,
    status: 'draft',
    source_refs: source_refs !== undefined
      ? { ...current.source_refs, ...source_refs }
      : current.source_refs,
    observed_facts: Array.isArray(observed_facts) ? observed_facts : current.observed_facts,
    signals: signals !== undefined
      ? {
          recurring: Array.isArray(signals.recurring) ? signals.recurring : current.signals.recurring,
          contradictory: Array.isArray(signals.contradictory) ? signals.contradictory : current.signals.contradictory,
          insufficient: Array.isArray(signals.insufficient) ? signals.insufficient : current.signals.insufficient,
        }
      : current.signals,
    unknowns: Array.isArray(unknowns) ? unknowns : current.unknowns,
    interpretation: interpretation !== undefined ? String(interpretation ?? '') : current.interpretation,
    options_considered: Array.isArray(options_considered) ? options_considered : current.options_considered,
    decision: decision !== undefined
      ? (VALID_DECISIONS.includes(decision) ? decision : null)
      : current.decision,
    justification: justification !== undefined ? String(justification ?? '') : current.justification,
    next_action: next_action !== undefined ? String(next_action ?? '') : current.next_action,
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
    strategic_decision_id: current.strategic_decision_id ?? null,
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

  return res.json({ ok: true, s11: { id, ...merged } });
});

/* ── POST /api/s11/real-decision/submit ─────────────────────────── */
router.post('/real-decision/submit', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucune décision à soumettre. Commence par remplir ta Décision.' });
  }

  const data = JSON.parse(existing.content);

  const completeness = checkS11Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 11 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  const now = new Date().toISOString();
  let submissionId = null;
  let strategicDecisionId = data.strategic_decision_id ?? null;

  try { await db.transaction(async tx => {
    // 1. Create or supersede go_nogo strategic decision
    const existingGoNogo = await tx.queryOne(
      `SELECT id FROM decisions WHERE user_id = ? AND decision_type = 'go_nogo' AND sprint_number = 11 AND status = 'active'`,
      [uid]
    );

    if (existingGoNogo) {
      // Supersede the existing S11 go_nogo decision
      strategicDecisionId = randomUUID();
      await tx.execute(
        `UPDATE decisions SET status = 'superseded' WHERE id = ?`,
        [existingGoNogo.id]
      );
      await tx.execute(
        `INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, facts_used, sprint_number, cadre_step, supersedes_id, status)
         VALUES (?, ?, 'go_nogo', ?, ?, ?, ?, 11, 'E', ?, 'active')`,
        [
          strategicDecisionId,
          uid,
          _decisionTitle(data.decision),
          JSON.stringify({ decision: data.decision, options_considered: data.options_considered }),
          data.justification,
          JSON.stringify({ observed_facts: data.observed_facts, signals: data.signals, unknowns: data.unknowns }),
          existingGoNogo.id,
        ]
      );
    } else {
      strategicDecisionId = randomUUID();
      await tx.execute(
        `INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, facts_used, sprint_number, cadre_step, status)
         VALUES (?, ?, 'go_nogo', ?, ?, ?, ?, 11, 'E', 'active')`,
        [
          strategicDecisionId,
          uid,
          _decisionTitle(data.decision),
          JSON.stringify({ decision: data.decision, options_considered: data.options_considered }),
          data.justification,
          JSON.stringify({ observed_facts: data.observed_facts, signals: data.signals, unknowns: data.unknowns }),
        ]
      );
    }

    // 2. Mission submission
    if (mission) {
      const snapshotContent = JSON.stringify({
        type: 's11_real_decision_snapshot',
        s11_ref: existing.id,
        source_refs: data.source_refs,
        observed_facts: data.observed_facts,
        signals: data.signals,
        unknowns: data.unknowns,
        interpretation: data.interpretation,
        options_considered: data.options_considered,
        decision: data.decision,
        justification: data.justification,
        next_action: data.next_action,
        epistemic: data.epistemic,
        strategic_decision_id: strategicDecisionId,
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

    // 3. Update participant_data
    const submittedContent = JSON.stringify({
      ...data,
      status: 'submitted',
      strategic_decision_id: strategicDecisionId,
      submitted_at: now,
      mission_submission_id: submissionId ?? null,
    });

    await tx.execute(
      `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      [submittedContent, existing.id]
    );

    // 4. Audit
    await tx.writeAudit({
      actorId: uid,
      targetUserId: uid,
      eventType: 's11_real_decision_submitted',
      tableName: 'decisions',
      recordId: strategicDecisionId,
      afterState: { decision: data.decision, strategic_decision_id: strategicDecisionId, mission_submission_id: submissionId },
    });
  }); } catch (err) { return res.status(err.status ?? 500).json({ error: err.message }); }

  const submission = submissionId
    ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId])
    : null;

  return res.json({ ok: true, submission, strategic_decision_id: strategicDecisionId });
});

function _decisionTitle(decision) {
  if (decision === 'go') return 'GO — Continuer cette piste';
  if (decision === 'no_go') return 'NO-GO — Ne pas poursuivre dans cette forme';
  if (decision === 'continue_tests') return 'CONTINUER LES TESTS — Données insuffisantes pour décider';
  return 'Décision Go/No-Go';
}

export default router;
