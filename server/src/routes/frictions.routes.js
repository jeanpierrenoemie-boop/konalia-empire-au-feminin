/**
 * Build 15: Filet Anti-Blocage — pilot friction reporting
 * Participants report blockers; admin reviews and acts.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb, writeAudit } from '../db.js';
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
router.post('/', (req, res) => {
  const db = getDb();
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
  db.prepare(`
    INSERT INTO pilot_frictions (id, user_id, friction, category, severity)
    VALUES (?,?,?,?,?)
  `).run(id, req.user.id, friction.trim(), category, severity);

  res.status(201).json(db.prepare(`SELECT * FROM pilot_frictions WHERE id = ?`).get(id));
});

/* ── GET /api/frictions — participant views own frictions ─────────── */
router.get('/', (req, res) => {
  const db = getDb();
  const frictions = db.prepare(`
    SELECT * FROM pilot_frictions
    WHERE user_id = ?
    ORDER BY reported_at DESC
  `).all(req.user.id);
  res.json(frictions);
});

/* ── Admin endpoints ──────────────────────────────────────────────── */

/* GET /api/frictions/admin — all frictions, optional filters */
router.get('/admin', requireAdmin, (req, res) => {
  const db = getDb();
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

  res.json(db.prepare(sql).all(...params));
});

/* PATCH /api/frictions/admin/:id — admin reviews a friction */
router.patch('/admin/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const friction = db.prepare(`SELECT * FROM pilot_frictions WHERE id = ?`).get(req.params.id);
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
  db.prepare(`UPDATE pilot_frictions SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), req.params.id);

  if (decision) {
    writeAudit(db, {
      actorId: req.user.id,
      targetUserId: friction.user_id,
      eventType: 'friction_review',
      tableName: 'pilot_frictions',
      recordId: friction.id,
      afterState: { decision, status, admin_response },
    });
  }

  res.json(db.prepare(`SELECT * FROM pilot_frictions WHERE id = ?`).get(req.params.id));
});

export default router;
