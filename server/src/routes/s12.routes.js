/**
 * S12 — LA SUITE SOUS CONTRÔLE
 * Routes for S12 Continuity Plan (90-day plan).
 *
 * Doctrine: DÉCISION → CAP 90 JOURS → PRIORITÉ → PLAN → RYTHME → SUIVI → CHECKPOINTS
 * S12 transforms the S11 decision into a realistic 90-day action plan.
 *
 * Adapts to 3 S11 decision types:
 * - go: pursue the direction with progressive actions
 * - no_go: close properly, document learnings, choose next direction
 * - continue_tests: prioritize missing data, schedule re-evaluation
 *
 * Live data: participant_data with data_type = 's12_continuity_plan'
 * On submit: mission_submission + continuity strategic decision (idempotent)
 *
 * S12 NEW STRATEGIC DECISIONS: 1 (continuity)
 * S12 NEW REVENUE DECISIONS: 0
 * S12 NEW PROOFS: 0
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's12_continuity_plan';

/* ── Default state ──────────────────────────────────────────────── */
function defaultState() {
  return {
    version: 1,
    status: 'draft',
    source_refs: {
      s11_decision: null,
      s11_justification: null,
      s11_next_action: null,
      s11_signals: null,
      strategic_decision_id: null,
    },
    ninety_day_goal: '',
    ninety_day_goal_why: '',
    ninety_day_goal_observable: '',
    ninety_day_not_priority: '',
    priority: '',
    phases: {
      days_1_30: { objective: '', actions: '', observable_result: '', to_verify: '' },
      days_31_60: { objective: '', actions: '', observable_result: '', to_verify: '' },
      days_61_90: { objective: '', actions: '', observable_result: '', to_verify: '' },
    },
    weekly_rhythm: {
      hours_available: '',
      action_slots: '',
      terrain_actions_per_week: '',
      review_frequency: '',
    },
    tracking_indicators: [],
    checkpoints: {
      day_30: { what_done: '', what_observed: '', what_changed: '', still_uncertain: '', continue_adjust_or_reevaluate: '' },
      day_60: { what_done: '', what_observed: '', what_changed: '', still_uncertain: '', continue_adjust_or_reevaluate: '' },
      day_90: { what_done: '', what_observed: '', what_changed: '', still_uncertain: '', continue_adjust_or_reevaluate: '' },
    },
    reopening_conditions: '',
    friction_plan: {
      probable_obstacle: '',
      planned_response: '',
      minimum_action: '',
    },
    next_action: '',
    epistemic: {
      plan_not_prediction: false,
      objective_not_guarantee: false,
      commitment_not_certainty: false,
    },
    continuity_decision_id: null,
    submitted_at: null,
  };
}

/* ── Completeness check ─────────────────────────────────────────── */
function checkS12Completeness(data) {
  if (!data.ninety_day_goal?.trim()) {
    return { ok: false, error: 'Définis ton objectif principal pour les 90 prochains jours.' };
  }
  if (!data.priority?.trim()) {
    return { ok: false, error: 'Identifie ta priorité dominante pour ces 90 jours.' };
  }
  const phases = data.phases ?? {};
  const p1 = phases.days_1_30 ?? {};
  if (!p1.objective?.trim() || !p1.actions?.trim()) {
    return { ok: false, error: 'Remplis les objectifs et actions pour les 30 premiers jours.' };
  }
  if (!data.weekly_rhythm?.hours_available?.trim()) {
    return { ok: false, error: 'Indique le temps disponible chaque semaine.' };
  }
  if (!Array.isArray(data.tracking_indicators) || data.tracking_indicators.length === 0) {
    return { ok: false, error: 'Définis au moins un indicateur de suivi.' };
  }
  if (!data.next_action?.trim()) {
    return { ok: false, error: 'Indique ta prochaine action concrète.' };
  }
  const ep = data.epistemic ?? {};
  if (!ep.plan_not_prediction) {
    return { ok: false, error: 'Confirme que ton plan n\'est pas une prédiction.' };
  }
  if (!ep.objective_not_guarantee) {
    return { ok: false, error: 'Confirme que ton objectif n\'est pas une garantie.' };
  }
  if (!ep.commitment_not_certainty) {
    return { ok: false, error: 'Confirme que ton engagement n\'est pas une certitude.' };
  }
  return { ok: true, error: null };
}

/* ── Load source refs from S11 ───────────────────────────────────── */
async function loadS11Refs(db, userId) {
  const s11Row = await db.queryOne(
    `SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's11_real_decision' LIMIT 1`,
    [userId]
  );
  if (!s11Row) return null;
  try {
    const p = JSON.parse(s11Row.content);
    if (p.status !== 'submitted') return null;
    return {
      decision: p.decision ?? null,
      justification: p.justification ?? null,
      next_action: p.next_action ?? null,
      signals: p.signals ?? null,
      unknowns: p.unknowns ?? null,
      interpretation: p.interpretation ?? null,
      strategic_decision_id: p.strategic_decision_id ?? null,
    };
  } catch {
    return null;
  }
}

/* ── GET /api/s12/continuity-plan ────────────────────────────────── */
router.get('/continuity-plan', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const s11Refs = await loadS11Refs(db, uid);
  if (!s11Refs) {
    return res.status(400).json({ error: 'Le Sprint 11 doit être soumis avant de commencer le Sprint 12.' });
  }

  const s12Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  if (!s12Row) {
    return res.json({ s12: null, s11_refs: s11Refs });
  }

  const parsed = JSON.parse(s12Row.content);
  return res.json({
    s12: { id: s12Row.id, ...parsed, updated_at: s12Row.updated_at },
    s11_refs: s11Refs,
  });
});

/* ── PUT /api/s12/continuity-plan ────────────────────────────────── */
router.put('/continuity-plan', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : defaultState();

  if (current.status === 'submitted') {
    return res.status(409).json({ error: 'Ce plan a déjà été soumis. Il ne peut plus être modifié.' });
  }

  const {
    ninety_day_goal, ninety_day_goal_why, ninety_day_goal_observable,
    ninety_day_not_priority, priority, phases, weekly_rhythm,
    tracking_indicators, checkpoints, reopening_conditions,
    friction_plan, next_action, epistemic,
  } = req.body ?? {};

  function mergePhase(inPhase, currPhase) {
    if (!inPhase) return currPhase;
    return {
      objective: inPhase.objective !== undefined ? String(inPhase.objective ?? '') : currPhase.objective,
      actions: inPhase.actions !== undefined ? String(inPhase.actions ?? '') : currPhase.actions,
      observable_result: inPhase.observable_result !== undefined ? String(inPhase.observable_result ?? '') : currPhase.observable_result,
      to_verify: inPhase.to_verify !== undefined ? String(inPhase.to_verify ?? '') : currPhase.to_verify,
    };
  }

  function mergeCheckpoint(inCp, currCp) {
    if (!inCp) return currCp;
    return {
      what_done: inCp.what_done !== undefined ? String(inCp.what_done ?? '') : currCp.what_done,
      what_observed: inCp.what_observed !== undefined ? String(inCp.what_observed ?? '') : currCp.what_observed,
      what_changed: inCp.what_changed !== undefined ? String(inCp.what_changed ?? '') : currCp.what_changed,
      still_uncertain: inCp.still_uncertain !== undefined ? String(inCp.still_uncertain ?? '') : currCp.still_uncertain,
      continue_adjust_or_reevaluate: inCp.continue_adjust_or_reevaluate !== undefined ? String(inCp.continue_adjust_or_reevaluate ?? '') : currCp.continue_adjust_or_reevaluate,
    };
  }

  const merged = {
    version: 1,
    status: 'draft',
    source_refs: current.source_refs,
    ninety_day_goal: ninety_day_goal !== undefined ? String(ninety_day_goal ?? '') : current.ninety_day_goal,
    ninety_day_goal_why: ninety_day_goal_why !== undefined ? String(ninety_day_goal_why ?? '') : current.ninety_day_goal_why,
    ninety_day_goal_observable: ninety_day_goal_observable !== undefined ? String(ninety_day_goal_observable ?? '') : current.ninety_day_goal_observable,
    ninety_day_not_priority: ninety_day_not_priority !== undefined ? String(ninety_day_not_priority ?? '') : current.ninety_day_not_priority,
    priority: priority !== undefined ? String(priority ?? '') : current.priority,
    phases: phases !== undefined ? {
      days_1_30: mergePhase(phases.days_1_30, current.phases.days_1_30),
      days_31_60: mergePhase(phases.days_31_60, current.phases.days_31_60),
      days_61_90: mergePhase(phases.days_61_90, current.phases.days_61_90),
    } : current.phases,
    weekly_rhythm: weekly_rhythm !== undefined ? {
      hours_available: weekly_rhythm.hours_available !== undefined ? String(weekly_rhythm.hours_available ?? '') : current.weekly_rhythm.hours_available,
      action_slots: weekly_rhythm.action_slots !== undefined ? String(weekly_rhythm.action_slots ?? '') : current.weekly_rhythm.action_slots,
      terrain_actions_per_week: weekly_rhythm.terrain_actions_per_week !== undefined ? String(weekly_rhythm.terrain_actions_per_week ?? '') : current.weekly_rhythm.terrain_actions_per_week,
      review_frequency: weekly_rhythm.review_frequency !== undefined ? String(weekly_rhythm.review_frequency ?? '') : current.weekly_rhythm.review_frequency,
    } : current.weekly_rhythm,
    tracking_indicators: Array.isArray(tracking_indicators) ? tracking_indicators : current.tracking_indicators,
    checkpoints: checkpoints !== undefined ? {
      day_30: mergeCheckpoint(checkpoints.day_30, current.checkpoints.day_30),
      day_60: mergeCheckpoint(checkpoints.day_60, current.checkpoints.day_60),
      day_90: mergeCheckpoint(checkpoints.day_90, current.checkpoints.day_90),
    } : current.checkpoints,
    reopening_conditions: reopening_conditions !== undefined ? String(reopening_conditions ?? '') : current.reopening_conditions,
    friction_plan: friction_plan !== undefined ? {
      probable_obstacle: friction_plan.probable_obstacle !== undefined ? String(friction_plan.probable_obstacle ?? '') : current.friction_plan.probable_obstacle,
      planned_response: friction_plan.planned_response !== undefined ? String(friction_plan.planned_response ?? '') : current.friction_plan.planned_response,
      minimum_action: friction_plan.minimum_action !== undefined ? String(friction_plan.minimum_action ?? '') : current.friction_plan.minimum_action,
    } : current.friction_plan,
    next_action: next_action !== undefined ? String(next_action ?? '') : current.next_action,
    epistemic: epistemic !== undefined ? {
      plan_not_prediction: epistemic.plan_not_prediction !== undefined ? !!epistemic.plan_not_prediction : current.epistemic.plan_not_prediction,
      objective_not_guarantee: epistemic.objective_not_guarantee !== undefined ? !!epistemic.objective_not_guarantee : current.epistemic.objective_not_guarantee,
      commitment_not_certainty: epistemic.commitment_not_certainty !== undefined ? !!epistemic.commitment_not_certainty : current.epistemic.commitment_not_certainty,
    } : current.epistemic,
    continuity_decision_id: current.continuity_decision_id ?? null,
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

  return res.json({ ok: true, s12: { id, ...merged } });
});

/* ── POST /api/s12/continuity-plan/submit ────────────────────────── */
router.post('/continuity-plan/submit', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucun plan à soumettre. Commence par remplir ton Plan Continuité.' });
  }

  const data = JSON.parse(existing.content);

  if (data.status === 'submitted') {
    return res.status(409).json({ error: 'Ce plan a déjà été soumis.' });
  }

  const completeness = checkS12Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 12 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  const s11Refs = await loadS11Refs(db, uid);

  const now = new Date().toISOString();
  let submissionId = null;
  let continuityDecisionId = data.continuity_decision_id ?? null;

  await db.transaction(async tx => {
    // 1. Create or supersede continuity strategic decision
    const existingContinuity = await tx.queryOne(
      `SELECT id FROM decisions WHERE user_id = ? AND decision_type = 'continuity' AND sprint_number = 12 AND status = 'active'`,
      [uid]
    );

    const decisionTitle = _continuityTitle(s11Refs?.decision);

    if (existingContinuity) {
      continuityDecisionId = randomUUID();
      await tx.execute(
        `UPDATE decisions SET status = 'superseded' WHERE id = ?`,
        [existingContinuity.id]
      );
      await tx.execute(
        `INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, facts_used, sprint_number, cadre_step, supersedes_id, status)
         VALUES (?, ?, 'continuity', ?, ?, ?, ?, 12, 'E', ?, 'active')`,
        [
          continuityDecisionId,
          uid,
          decisionTitle,
          JSON.stringify({
            s11_decision: s11Refs?.decision ?? null,
            ninety_day_goal: data.ninety_day_goal,
            priority: data.priority,
            phases: data.phases,
          }),
          data.ninety_day_goal_why,
          JSON.stringify({
            s11_signals: s11Refs?.signals ?? null,
            tracking_indicators: data.tracking_indicators,
            reopening_conditions: data.reopening_conditions,
          }),
          existingContinuity.id,
        ]
      );
    } else {
      continuityDecisionId = randomUUID();
      await tx.execute(
        `INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, facts_used, sprint_number, cadre_step, status)
         VALUES (?, ?, 'continuity', ?, ?, ?, ?, 12, 'E', 'active')`,
        [
          continuityDecisionId,
          uid,
          decisionTitle,
          JSON.stringify({
            s11_decision: s11Refs?.decision ?? null,
            ninety_day_goal: data.ninety_day_goal,
            priority: data.priority,
            phases: data.phases,
          }),
          data.ninety_day_goal_why,
          JSON.stringify({
            s11_signals: s11Refs?.signals ?? null,
            tracking_indicators: data.tracking_indicators,
            reopening_conditions: data.reopening_conditions,
          }),
        ]
      );
    }

    // 2. Mission submission
    if (mission) {
      const snapshotContent = JSON.stringify({
        type: 's12_continuity_plan_snapshot',
        s12_ref: existing.id,
        s11_decision: s11Refs?.decision ?? null,
        ninety_day_goal: data.ninety_day_goal,
        priority: data.priority,
        phases: data.phases,
        weekly_rhythm: data.weekly_rhythm,
        tracking_indicators: data.tracking_indicators,
        checkpoints: data.checkpoints,
        reopening_conditions: data.reopening_conditions,
        friction_plan: data.friction_plan,
        next_action: data.next_action,
        epistemic: data.epistemic,
        continuity_decision_id: continuityDecisionId,
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
      continuity_decision_id: continuityDecisionId,
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
      eventType: 's12_continuity_plan_submitted',
      tableName: 'decisions',
      recordId: continuityDecisionId,
      afterState: {
        s11_decision: s11Refs?.decision ?? null,
        ninety_day_goal: data.ninety_day_goal,
        continuity_decision_id: continuityDecisionId,
        mission_submission_id: submissionId,
      },
    });
  });

  const submission = submissionId
    ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId])
    : null;

  return res.json({ ok: true, submission, continuity_decision_id: continuityDecisionId });
});

function _continuityTitle(s11Decision) {
  if (s11Decision === 'go') return 'PLAN 90 JOURS — Poursuivre cette piste';
  if (s11Decision === 'no_go') return 'PLAN 90 JOURS — Fermer proprement et repositionner';
  if (s11Decision === 'continue_tests') return 'PLAN 90 JOURS — Continuer les tests et réévaluer';
  return 'PLAN 90 JOURS — Suite sous contrôle';
}

export default router;
