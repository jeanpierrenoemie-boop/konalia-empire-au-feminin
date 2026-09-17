import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

/* ── GET /api/cockpit ──────────────────────────────────────────────
   Returns all data needed to answer the 5 cockpit questions.
   All rows are scoped to req.user.id — no cross-user leakage.
───────────────────────────────────────────────────────────────── */
router.get('/', (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  /* 1. Current progress */
  const progress = db.prepare(`
    SELECT up.*, c.name AS cohort_name
    FROM user_progress up
    LEFT JOIN cohorts c ON c.id = up.cohort_id
    WHERE up.user_id = ?
    LIMIT 1
  `).get(uid);

  /* 2. Pilotage state */
  const pilotage = db.prepare(
    'SELECT * FROM pilotage_state WHERE user_id = ?'
  ).get(uid);

  /* 3. Current mission (active submission or first unsubmitted mission) */
  const currentMission = progress ? db.prepare(`
    SELECT m.id, m.title, m.description, m.mission_type, m.cadre_step, m.sprint_number,
           ms.status AS submission_status, ms.id AS submission_id
    FROM missions m
    LEFT JOIN mission_submissions ms ON ms.mission_id = m.id AND ms.user_id = ?
    WHERE (m.cohort_id = ? OR m.cohort_id IS NULL)
      AND m.cadre_step = ?
      AND (ms.status IS NULL OR ms.status IN ('draft','submitted'))
    ORDER BY m.sort_order ASC
    LIMIT 1
  `).get(uid, progress.cohort_id, progress.cadre_step) : null;

  /* 4. Proofs — count by type */
  const proofCounts = db.prepare(`
    SELECT proof_type, COUNT(*) as count
    FROM proofs
    WHERE user_id = ?
    GROUP BY proof_type
  `).all(uid);

  const PROOF_TYPES = ['screenshot', 'note', 'link', 'conversation', 'signal'];
  const proofs = PROOF_TYPES.map(t => ({
    type: t,
    count: proofCounts.find(p => p.proof_type === t)?.count ?? 0,
  }));
  const totalProofs = proofs.reduce((s, p) => s + p.count, 0);

  /* 5. Last validated decision (most recent) */
  const lastDecision = db.prepare(`
    SELECT id, decision_type, title, rationale, created_at
    FROM decisions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(uid);

  /* 6. Last market action (contact or conversation, most recent) */
  const lastContact = db.prepare(`
    SELECT name, status, created_at, 'contact' AS kind
    FROM market_contacts
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(uid);

  const lastConversation = db.prepare(`
    SELECT title, format, date_occurred AS created_at, 'conversation' AS kind
    FROM market_conversations
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(uid);

  let lastMarketAction = null;
  if (lastContact && lastConversation) {
    lastMarketAction = lastContact.created_at >= lastConversation.created_at
      ? lastContact : lastConversation;
  } else {
    lastMarketAction = lastContact ?? lastConversation ?? null;
  }

  /* 7. Parking ideas counts — PAS MAINTENANT block */
  const parkingRows = db.prepare(`
    SELECT dispersion_status, COUNT(*) AS n
    FROM parking_ideas WHERE user_id = ?
    GROUP BY dispersion_status
  `).all(uid);

  const parkingByStatus = {};
  for (const row of parkingRows) parkingByStatus[row.dispersion_status ?? 'PARKING'] = row.n;

  /* Legacy rows (no dispersion_status) count as PARKING */
  const parkingCount = (parkingByStatus['PARKING'] ?? 0)
    + (parkingByStatus['TESTER_PLUS_TARD'] ?? 0)
    + (parkingByStatus['null'] ?? 0);
  const agirMaintenantCount = parkingByStatus['AGIR_MAINTENANT'] ?? 0;

  /* 8. Project passport */
  const passport = db.prepare(`
    SELECT project_name, stage, vision
    FROM project_passport WHERE user_id = ?
  `).get(uid);

  /* 9. Support requests open */
  const openSupport = db.prepare(
    `SELECT COUNT(*) as count FROM support_requests WHERE user_id = ? AND status = 'open'`
  ).get(uid);

  return res.json({
    progress: progress ?? null,
    pilotage: pilotage ?? null,
    currentMission: currentMission ?? null,
    proofs,
    totalProofs,
    lastDecision: lastDecision ?? null,
    lastMarketAction: lastMarketAction ?? null,
    parkingCount,
    agirMaintenantCount,
    passport: passport ?? null,
    openSupportCount: openSupport?.count ?? 0,
  });
});

export default router;
