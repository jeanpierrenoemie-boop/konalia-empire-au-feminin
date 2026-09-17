/**
 * Build 15: Filet Anti-Blocage — pilot friction reporting
 * Participants report blockers; admin reviews and acts.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth);

const VALID_CATEGORIES = [
  'comprehension','navigation','technique','instruction',
  'surcharge','ia','gate','support','marche',
];
const VALID_SEVERITIES = ['VERT','ORANGE','ROUGE'];
const VALID_DECISIONS  = ['GARDER','AJUSTER','SUPPRIMER','OBSERVER'];

/* ── POST /api/frictions — participant reports a blocker ──────────── */
router.post('/', async (req, res) => {
  const db = getAdapter();
  const { category, friction, severity = 'VERT' } = req.body ?? {};

  if (!category || !friction?.trim()) {
    return res.status(400).json({ error: 'category et friction requis' });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category invalide. Valeurs: ${VALID_CATEGORIES.join(', ')}` });
  }
  if (!VALID_SEVERITIES.includes(severity)) {
    return res.status(400).json({ error: 'severity doit être VERT, ORANGE ou ROUGE' });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO pilot_frictions (id, user_id, friction, category, severity)
    VALUES (?,?,?,?,?)
  `, [id, req.user.id, friction.trim(), category, severity]);

  res.status(201).json(await db.queryOne(`SELECT * FROM pilot_frictions WHERE id = ?`, [id]));
});

/* ── GET /api/frictions — participant views own frictions ─────────── */
router.get('/', async (req, res) => {
  const db = getAdapter();
  const frictions = await db.queryAll(`
    SELECT * FROM pilot_frictions
    WHERE user_id = ?
    ORDER BY reported_at DESC
  `, [req.user.id]);
  res.json(frictions);
});

/* ── Admin endpoints ──────────────────────────────────────────────── */

/* GET /api/frictions/admin — all frictions, optional filters */
router.get('/admin', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const { status, severity, category } = req.query;

  let sql = `
    SELECT pf.*, u.first_name, u.email
    FROM pilot_frictions pf
    JOIN users u ON u.id = pf.user_id
    WHERE 1=1
  `;
  const params = [];

  if (status)   { sql += ` AND pf.status = ?`;   params.push(status); }
  if (severity) { sql += ` AND pf.severity = ?`; params.push(severity); }
  if (category) { sql += ` AND pf.category = ?`; params.push(category); }

  sql += ' ORDER BY CASE pf.severity WHEN \'ROUGE\' THEN 0 WHEN \'ORANGE\' THEN 1 ELSE 2 END, pf.reported_at DESC';

  res.json(await db.queryAll(sql, params));
});

/* PATCH /api/frictions/admin/:id — admin reviews a friction */
router.patch('/admin/:id', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const friction = await db.queryOne(`SELECT * FROM pilot_frictions WHERE id = ?`, [req.params.id]);
  if (!friction) return res.status(404).json({ error: 'Friction introuvable' });

  const { decision, admin_response, status } = req.body ?? {};

  if (decision && !VALID_DECISIONS.includes(decision)) {
    return res.status(400).json({ error: `decision invalide. Valeurs: ${VALID_DECISIONS.join(', ')}` });
  }
  if (status && !['open','in_progress','resolved'].includes(status)) {
    return res.status(400).json({ error: 'status invalide' });
  }

  const updates = {};
  if (decision)        updates.admin_decision = decision;
  if (admin_response !== undefined) updates.admin_response = admin_response;
  if (status)          updates.status = status;
  if (status === 'resolved' && !friction.resolved_at) {
    updates.resolved_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  await db.execute(
    `UPDATE pilot_frictions SET ${setClauses} WHERE id = ?`,
    [...Object.values(updates), req.params.id]
  );

  if (decision) {
    await db.writeAudit({
      actorId: req.user.id,
      targetUserId: friction.user_id,
      eventType: 'friction_review',
      tableName: 'pilot_frictions',
      recordId: friction.id,
      afterState: { decision, status, admin_response },
    });
  }
  if (admin_response !== undefined && admin_response?.trim()) {
    await db.notify({
      userId: friction.user_id,
      type: 'support_response',
      title: 'Réponse à ton signalement',
      body: admin_response.trim().slice(0, 120),
    });
  }

  res.json(await db.queryOne(`SELECT * FROM pilot_frictions WHERE id = ?`, [req.params.id]));
});

export default router;
