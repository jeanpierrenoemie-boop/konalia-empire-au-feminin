import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

/* ── GET /api/preuves ── 5 structured proof sections */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  res.json(buildPreuves(db, userId));
});

/* ── GET /api/dossier ── full structured export (no PDF in V1) */
router.get('/dossier', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const user = db.prepare(`SELECT first_name, email FROM users WHERE id = ?`).get(userId);
  const passport = db.prepare(`SELECT * FROM project_passport WHERE user_id = ?`).get(userId);
  const decisions = db.prepare(`SELECT * FROM decisions WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
  const progress = db.prepare(`SELECT * FROM user_progress WHERE user_id = ? LIMIT 1`).get(userId);
  const passedSprints = db.prepare(`SELECT sprint_number, passed_at, method FROM sprint_gate_log WHERE user_id = ? ORDER BY sprint_number`).all(userId);

  res.json({
    meta: {
      generated_at: new Date().toISOString(),
      version: 'V1-pilot',
      participant: { name: user?.first_name ?? null, email: user?.email ?? null },
    },
    passeport: passport ?? null,
    preuves: buildPreuves(db, userId),
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
function buildPreuves(db, userId) {
  return {
    '01_ma_direction': buildDirection(db, userId),
    '02_mon_offre_test': buildOffreTest(db, userId),
    '03_mon_rapport_terrain': buildRapportTerrain(db, userId),
    '04_mon_bilan_controle': buildBilanControle(db, userId),
    '05_mon_plan_continuite': buildPlanContinuite(db, userId),
  };
}

/* 01 Ma Direction — strategic orientation proof */
function buildDirection(db, userId) {
  const passport = db.prepare(`
    SELECT project_name, vision, target_persona, core_problem FROM project_passport WHERE user_id = ?
  `).get(userId);

  const decisions = db.prepare(`
    SELECT id, decision_type, title, rationale, facts_used, hypotheses, created_at
    FROM decisions
    WHERE user_id = ? AND status = 'active'
      AND decision_type IN ('project','persona','scope','pivot')
    ORDER BY created_at DESC
  `).all(userId);

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

/* 02 Mon Offre Test — offer and revenue model proof */
function buildOffreTest(db, userId) {
  const passport = db.prepare(`
    SELECT proposed_solution, revenue_model FROM project_passport WHERE user_id = ?
  `).get(userId);

  const decisions = db.prepare(`
    SELECT id, decision_type, title, rationale, facts_used, created_at
    FROM decisions
    WHERE user_id = ? AND status = 'active'
      AND decision_type IN ('revenue','project')
    ORDER BY created_at DESC
  `).all(userId);

  const proofs = db.prepare(`
    SELECT id, proof_type, title, content, url, created_at
    FROM proofs WHERE user_id = ? AND cadre_step = 'D'
    ORDER BY created_at DESC
  `).all(userId);

  const missionSubmissions = db.prepare(`
    SELECT ms.id, ms.status, ms.content, ms.reviewed_at, m.title AS mission_title, m.sprint_number
    FROM mission_submissions ms
    JOIN missions m ON m.id = ms.mission_id
    WHERE ms.user_id = ? AND m.cadre_step = 'D'
      AND ms.status IN ('submitted','reviewed','approved')
    ORDER BY ms.created_at DESC
  `).all(userId);

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

/* 03 Mon Rapport Terrain — market field report */
function buildRapportTerrain(db, userId) {
  const contactStats = db.prepare(`
    SELECT status, COUNT(*) AS n FROM market_contacts WHERE user_id = ? GROUP BY status
  `).all(userId);

  const conversations = db.prepare(`
    SELECT mc.id, mc.title, mc.summary, mc.date_occurred, mc.format,
      c.name AS contact_name, c.status AS contact_status
    FROM market_conversations mc
    LEFT JOIN market_contacts c ON c.id = mc.contact_id
    WHERE mc.user_id = ?
    ORDER BY mc.date_occurred DESC
    LIMIT 20
  `).all(userId);

  const signalStats = db.prepare(`
    SELECT signal_type, strength, COUNT(*) AS n
    FROM market_signals WHERE user_id = ?
    GROUP BY signal_type, strength
    ORDER BY signal_type
  `).all(userId);

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

/* 04 Mon Bilan de Contrôle — progress and decisions audit */
function buildBilanControle(db, userId) {
  const progress = db.prepare(`SELECT * FROM user_progress WHERE user_id = ? LIMIT 1`).get(userId);

  const passedSprints = db.prepare(`
    SELECT sprint_number, cadre_step, passed_at, method
    FROM sprint_gate_log WHERE user_id = ? ORDER BY sprint_number
  `).all(userId);

  const weeklyReviews = db.prepare(`
    SELECT sprint_number, week_number, wins, blockers, energy_level, status, created_at
    FROM weekly_reviews WHERE user_id = ? AND status = 'submitted'
    ORDER BY sprint_number, week_number
  `).all(userId);

  const goNoGoDecisions = db.prepare(`
    SELECT id, title, rationale, facts_used, status, created_at
    FROM decisions WHERE user_id = ? AND decision_type = 'go_nogo'
    ORDER BY created_at DESC
  `).all(userId);

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

/* 05 Mon Plan de Continuité 90 — 90-day continuity plan */
function buildPlanContinuite(db, userId) {
  const passport = db.prepare(`
    SELECT vision FROM project_passport WHERE user_id = ?
  `).get(userId);

  const pilotage = db.prepare(`
    SELECT current_priority, next_action, duration_estimate, not_priority_now
    FROM pilotage_state WHERE user_id = ? LIMIT 1
  `).get(userId);

  const finalDecisions = db.prepare(`
    SELECT id, decision_type, title, rationale, facts_used, reopening_condition, created_at
    FROM decisions WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `).all(userId);

  const sprint12Submission = db.prepare(`
    SELECT ms.content, ms.status, ms.created_at
    FROM mission_submissions ms
    JOIN missions m ON m.id = ms.mission_id
    WHERE ms.user_id = ? AND m.sprint_number = 12
    ORDER BY ms.created_at DESC LIMIT 1
  `).get(userId);

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
