import { Router } from 'express';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

/* ── GET /api/cockpit ──────────────────────────────────────────────
   Returns all data needed to answer the 5 cockpit questions.
   All rows are scoped to req.user.id — no cross-user leakage.
───────────────────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  /* 1. Current progress */
  const progress = await db.queryOne(`
    SELECT up.*, c.name AS cohort_name
    FROM user_progress up
    LEFT JOIN cohorts c ON c.id = up.cohort_id
    WHERE up.user_id = ?
    LIMIT 1
  `, [uid]);

  /* 2. Pilotage state */
  const pilotage = await db.queryOne(
    'SELECT * FROM pilotage_state WHERE user_id = ?',
    [uid]
  );

  /* 3. Current mission (active submission or first unsubmitted mission) */
  const currentMission = progress ? await db.queryOne(`
    SELECT m.id, m.title, m.description, m.mission_type, m.cadre_step, m.sprint_number,
           ms.status AS submission_status, ms.id AS submission_id
    FROM missions m
    LEFT JOIN mission_submissions ms ON ms.mission_id = m.id AND ms.user_id = ?
    WHERE (m.cohort_id = ? OR m.cohort_id IS NULL)
      AND m.cadre_step = ?
      AND (ms.status IS NULL OR ms.status IN ('draft','submitted'))
    ORDER BY m.sort_order ASC
    LIMIT 1
  `, [uid, progress.cohort_id, progress.cadre_step]) : null;

  /* 4. Proofs — count by type */
  const proofCounts = await db.queryAll(`
    SELECT proof_type, COUNT(*) as count
    FROM proofs
    WHERE user_id = ?
    GROUP BY proof_type
  `, [uid]);

  const PROOF_TYPES = ['screenshot', 'note', 'link', 'conversation', 'signal'];
  const proofs = PROOF_TYPES.map(t => ({
    type: t,
    count: proofCounts.find(p => p.proof_type === t)?.count ?? 0,
  }));
  const totalProofs = proofs.reduce((s, p) => s + p.count, 0);

  /* 5. Last validated decision (most recent) */
  const lastDecision = await db.queryOne(`
    SELECT id, decision_type, title, rationale, created_at
    FROM decisions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [uid]);

  /* 6. Last market action (contact or conversation, most recent) */
  const lastContact = await db.queryOne(`
    SELECT name, status, created_at, 'contact' AS kind
    FROM market_contacts
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [uid]);

  const lastConversation = await db.queryOne(`
    SELECT title, format, date_occurred AS created_at, 'conversation' AS kind
    FROM market_conversations
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [uid]);

  let lastMarketAction = null;
  if (lastContact && lastConversation) {
    lastMarketAction = lastContact.created_at >= lastConversation.created_at
      ? lastContact : lastConversation;
  } else {
    lastMarketAction = lastContact ?? lastConversation ?? null;
  }

  /* 7. Parking ideas counts — PAS MAINTENANT block */
  const parkingRows = await db.queryAll(`
    SELECT dispersion_status, COUNT(*) AS n
    FROM parking_ideas WHERE user_id = ?
    GROUP BY dispersion_status
  `, [uid]);

  const parkingByStatus = {};
  for (const row of parkingRows) parkingByStatus[row.dispersion_status ?? 'PARKING'] = row.n;

  const parkingCount = (parkingByStatus['PARKING'] ?? 0)
    + (parkingByStatus['TESTER_PLUS_TARD'] ?? 0)
    + (parkingByStatus['null'] ?? 0);
  const agirMaintenantCount = parkingByStatus['AGIR_MAINTENANT'] ?? 0;

  /* 8. Project passport */
  const passport = await db.queryOne(`
    SELECT project_name, stage, vision
    FROM project_passport WHERE user_id = ?
  `, [uid]);

  /* 9. Support requests open */
  const openSupport = await db.queryOne(
    `SELECT COUNT(*) as count FROM support_requests WHERE user_id = ? AND status = 'open'`,
    [uid]
  );

  /* 10. S1 inventory status — only relevant when on sprint 1 */
  let s1Inventory = null;
  if (progress?.sprint_number === 1) {
    const inv = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's1_inventory' LIMIT 1`,
      [uid]
    );
    if (inv) {
      const parsed = JSON.parse(inv.content);
      const sections = parsed.sections ?? {};
      const sectionsFilled = ['A','B','C','D','E'].filter(k => {
        const s = sections[k];
        if (Array.isArray(s)) return s.some(e => e && String(e).trim());
        if (s && typeof s === 'object') return Object.values(s).some(v => v && String(v).trim());
        return false;
      }).length;
      s1Inventory = {
        status: parsed.status ?? 'draft',
        sectionsFilled,
        hasObservation: !!(parsed.observation ?? '').trim(),
        updatedAt: inv.updated_at,
      };
    }
  }

  /* 11. S2 paths status — only relevant when on sprint 2 */
  let s2Paths = null;
  if (progress?.sprint_number === 2) {
    const s2Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths' LIMIT 1`,
      [uid]
    );
    if (s2Row) {
      const parsed = JSON.parse(s2Row.content);
      const paths = parsed.paths ?? [];
      s2Paths = {
        status: parsed.status ?? 'draft',
        totalPaths: paths.filter(p => p.status !== 'discarded').length,
        retainedPaths: paths.filter(p => p.status === 'retained').length,
        updatedAt: s2Row.updated_at,
      };
    }
  }

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
    s1Inventory,
    s2Paths,
  });
});

export default router;
