import { Router } from 'express';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

/* ── GET /api/preuves ── 5 structured proof sections */
router.get('/', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  res.json(await buildPreuves(db, userId));
});

/* ── GET /api/dossier ── full structured export (no PDF in V1) */
router.get('/dossier', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const user = await db.queryOne(`SELECT first_name, email FROM users WHERE id = ?`, [userId]);
  const passport = await db.queryOne(`SELECT * FROM project_passport WHERE user_id = ?`, [userId]);
  const decisions = await db.queryAll(`SELECT * FROM decisions WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
  const progress = await db.queryOne(`SELECT * FROM user_progress WHERE user_id = ? LIMIT 1`, [userId]);
  const passedSprints = await db.queryAll(`SELECT sprint_number, passed_at, method FROM sprint_gate_log WHERE user_id = ? ORDER BY sprint_number`, [userId]);

  res.json({
    meta: {
      generated_at: new Date().toISOString(),
      version: 'V1-pilot',
      participant: { name: user?.first_name ?? null, email: user?.email ?? null },
    },
    passeport: passport ?? null,
    preuves: await buildPreuves(db, userId),
    decisions: {
      active: decisions.filter(d => d.status === 'active'),
      historical: decisions.filter(d => d.status !== 'active'),
    },
    progression: {
      current: progress ?? null,
      passed_sprints: passedSprints,
    },
  });
});

/* ── Builder ── */
async function buildPreuves(db, userId) {
  return {
    '01_ma_direction': await buildDirection(db, userId),
    '02_mon_offre_test': await buildOffreTest(db, userId),
    '03_mon_rapport_terrain': await buildRapportTerrain(db, userId),
    '04_mon_bilan_controle': await buildBilanControle(db, userId),
    '05_mon_plan_continuite': await buildPlanContinuite(db, userId),
  };
}

/* 01 Ma Direction */
async function buildDirection(db, userId) {
  const passport = await db.queryOne(`
    SELECT project_name, vision, target_persona, core_problem FROM project_passport WHERE user_id = ?
  `, [userId]);

  const decisions = await db.queryAll(`
    SELECT id, decision_type, title, rationale, facts_used, hypotheses, created_at
    FROM decisions
    WHERE user_id = ? AND status = 'active'
      AND decision_type IN ('project','persona','scope','pivot')
    ORDER BY created_at DESC
  `, [userId]);

  const completeness = computeSectionCompleteness([
    passport?.project_name, passport?.vision, passport?.target_persona, passport?.core_problem,
    decisions.length > 0,
  ]);

  return {
    label: '01 — Ma Direction',
    completeness,
    passport_snapshot: passport ?? null,
    strategic_decisions: decisions,
  };
}

/* 02 Mon Offre Test */
async function buildOffreTest(db, userId) {
  const passport = await db.queryOne(`
    SELECT proposed_solution, revenue_model FROM project_passport WHERE user_id = ?
  `, [userId]);

  const decisions = await db.queryAll(`
    SELECT id, decision_type, title, rationale, facts_used, created_at
    FROM decisions
    WHERE user_id = ? AND status = 'active'
      AND decision_type IN ('revenue','project')
    ORDER BY created_at DESC
  `, [userId]);

  const proofs = await db.queryAll(`
    SELECT id, proof_type, title, content, url, created_at
    FROM proofs WHERE user_id = ? AND cadre_step = 'D'
    ORDER BY created_at DESC
  `, [userId]);

  const missionSubmissions = await db.queryAll(`
    SELECT ms.id, ms.status, ms.content, ms.reviewed_at, m.title AS mission_title, m.sprint_number
    FROM mission_submissions ms
    JOIN missions m ON m.id = ms.mission_id
    WHERE ms.user_id = ? AND m.cadre_step = 'D'
      AND ms.status IN ('submitted','reviewed','approved')
    ORDER BY ms.created_at DESC
  `, [userId]);

  const completeness = computeSectionCompleteness([
    passport?.proposed_solution,
    passport?.revenue_model,
    decisions.length > 0,
    proofs.length > 0 || missionSubmissions.length > 0,
  ]);

  return {
    label: '02 — Mon Offre Test',
    completeness,
    offer_snapshot: passport ?? null,
    decisions,
    proofs,
    mission_submissions: missionSubmissions,
  };
}

/* 03 Mon Rapport Terrain */
async function buildRapportTerrain(db, userId) {
  const contactStats = await db.queryAll(`
    SELECT status, COUNT(*) AS n FROM market_contacts WHERE user_id = ? GROUP BY status
  `, [userId]);

  const conversations = await db.queryAll(`
    SELECT mc.id, mc.title, mc.summary, mc.date_occurred, mc.format,
      c.name AS contact_name, c.status AS contact_status
    FROM market_conversations mc
    LEFT JOIN market_contacts c ON c.id = mc.contact_id
    WHERE mc.user_id = ?
    ORDER BY mc.date_occurred DESC
    LIMIT 20
  `, [userId]);

  const signalStats = await db.queryAll(`
    SELECT signal_type, strength, COUNT(*) AS n
    FROM market_signals WHERE user_id = ?
    GROUP BY signal_type, strength
    ORDER BY signal_type
  `, [userId]);

  const totalContacts = contactStats.reduce((s, r) => s + r.n, 0);
  const activeContacts = contactStats
    .filter(r => ['contacted','conversation_started','interested','meeting_done','converted'].includes(r.status))
    .reduce((s, r) => s + r.n, 0);

  const completeness = computeSectionCompleteness([
    totalContacts > 0,
    conversations.length > 0,
    signalStats.length > 0,
  ]);

  return {
    label: '03 — Mon Rapport Terrain',
    completeness,
    contacts: { total: totalContacts, active: activeContacts, by_status: contactStats },
    conversations: { total: conversations.length, list: conversations },
    signals: { by_type: signalStats, total: signalStats.reduce((s, r) => s + r.n, 0) },
  };
}

/* 04 Mon Bilan de Contrôle */
async function buildBilanControle(db, userId) {
  const progress = await db.queryOne(`SELECT * FROM user_progress WHERE user_id = ? LIMIT 1`, [userId]);

  const passedSprints = await db.queryAll(`
    SELECT sprint_number, cadre_step, passed_at, method
    FROM sprint_gate_log WHERE user_id = ? ORDER BY sprint_number
  `, [userId]);

  const weeklyReviews = await db.queryAll(`
    SELECT sprint_number, week_number, wins, blockers, energy_level, status, created_at
    FROM weekly_reviews WHERE user_id = ? AND status = 'submitted'
    ORDER BY sprint_number, week_number
  `, [userId]);

  const goNoGoDecisions = await db.queryAll(`
    SELECT id, title, rationale, facts_used, status, created_at
    FROM decisions WHERE user_id = ? AND decision_type = 'go_nogo'
    ORDER BY created_at DESC
  `, [userId]);

  const completeness = computeSectionCompleteness([
    passedSprints.length > 0,
    weeklyReviews.length > 0,
    goNoGoDecisions.length > 0,
  ]);

  return {
    label: '04 — Mon Bilan de Contrôle',
    completeness,
    current_sprint: progress?.sprint_number ?? null,
    current_cadre_step: progress?.cadre_step ?? null,
    passed_sprints: passedSprints,
    weekly_reviews: weeklyReviews,
    go_nogo_decisions: goNoGoDecisions,
  };
}

/* 05 Mon Plan de Continuité 90 */
async function buildPlanContinuite(db, userId) {
  const passport = await db.queryOne(`
    SELECT vision FROM project_passport WHERE user_id = ?
  `, [userId]);

  const pilotage = await db.queryOne(`
    SELECT current_priority, next_action, duration_estimate, not_priority_now
    FROM pilotage_state WHERE user_id = ? LIMIT 1
  `, [userId]);

  const finalDecisions = await db.queryAll(`
    SELECT id, decision_type, title, rationale, facts_used, reopening_condition, created_at
    FROM decisions WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `, [userId]);

  const sprint12Submission = await db.queryOne(`
    SELECT ms.content, ms.status, ms.created_at
    FROM mission_submissions ms
    JOIN missions m ON m.id = ms.mission_id
    WHERE ms.user_id = ? AND m.sprint_number = 12
    ORDER BY ms.created_at DESC LIMIT 1
  `, [userId]);

  const completeness = computeSectionCompleteness([
    passport?.vision,
    finalDecisions.length > 0,
    sprint12Submission != null,
  ]);

  return {
    label: '05 — Mon Plan de Continuité 90',
    completeness,
    objective_j90: passport?.vision ?? null,
    pilotage: pilotage ?? null,
    active_decisions: finalDecisions,
    sprint_12_submission: sprint12Submission ?? null,
  };
}

function computeSectionCompleteness(criteria) {
  const truthy = criteria.filter(Boolean).length;
  return Math.round((truthy / criteria.length) * 100);
}

export default router;
