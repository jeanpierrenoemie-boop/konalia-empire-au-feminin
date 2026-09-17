/**
 * Elite routes — Points ELITE and Revue Prioritaire
 * Only accessible to PARTICIPANTE_ELITE and NOEMIE_ADMIN.
 * Starter participants never reach these endpoints.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb, writeAudit } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin, requireElite } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth);

const POINT_TITLES = {
  1: 'Ta Direction',
  2: 'Ton Offre face au réel',
  3: 'La Suite',
};

/* ── GET /api/elite — own elite summary ─────────────────────────── */
router.get('/', requireElite, (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const sessions = db.prepare(
    `SELECT * FROM elite_sessions WHERE user_id = ? ORDER BY point_number, scheduled_at`
  ).all(uid);

  const revues = db.prepare(
    `SELECT * FROM elite_revues WHERE user_id = ? ORDER BY scheduled_at DESC`
  ).all(uid);

  const points = db.prepare(
    `SELECT * FROM elite_points WHERE user_id = ? ORDER BY created_at DESC`
  ).all(uid);

  const totalPoints = points.reduce((s, r) => s + r.points, 0);

  res.json({ sessions, revues, points, total_points: totalPoints });
});

/* ── ADMIN: GET /api/elite/admin/overview — all elite participants ─ */
router.get('/admin/overview', requireAdmin, (req, res) => {
  const db = getDb();
  const { cohort_id } = req.query;

  const users = cohort_id
    ? db.prepare(`
        SELECT u.id, u.first_name, u.email, u.tier,
               c.name AS cohort_name, up.cadre_step, up.sprint_number
        FROM users u
        JOIN enrollments e ON e.user_id = u.id AND e.cohort_id = ?
        JOIN cohorts c ON c.id = e.cohort_id
        LEFT JOIN user_progress up ON up.user_id = u.id AND up.cohort_id = e.cohort_id
        WHERE u.tier = 'ELITE'
      `).all(cohort_id)
    : db.prepare(`
        SELECT u.id, u.first_name, u.email, u.tier,
               c.name AS cohort_name, up.cadre_step, up.sprint_number
        FROM users u
        JOIN enrollments e ON e.user_id = u.id
        JOIN cohorts c ON c.id = e.cohort_id
        LEFT JOIN user_progress up ON up.user_id = u.id AND up.cohort_id = e.cohort_id
        WHERE u.tier = 'ELITE'
      `).all();

  res.json(users);
});

/* ── ADMIN: POST /api/elite/admin/sessions — schedule elite session ─ */
router.post('/admin/sessions', requireAdmin, (req, res) => {
  const db = getDb();
  const { user_id, cohort_id, point_number, scheduled_at } = req.body ?? {};

  if (!user_id || !cohort_id || !point_number) {
    return res.status(400).json({ error: 'user_id, cohort_id et point_number requis' });
  }
  if (![1, 2, 3].includes(Number(point_number))) {
    return res.status(400).json({ error: 'point_number doit être 1, 2 ou 3' });
  }

  const target = db.prepare(`SELECT tier FROM users WHERE id = ?`).get(user_id);
  if (!target) return res.status(404).json({ error: 'Participant introuvable' });
  if (target.tier !== 'ELITE') {
    return res.status(400).json({ error: 'Ce participant n\'est pas ELITE' });
  }

  const id = randomUUID();
  const num = Number(point_number);
  db.prepare(`
    INSERT INTO elite_sessions (id, cohort_id, user_id, point_number, title, scheduled_at, created_by)
    VALUES (?,?,?,?,?,?,?)
  `).run(id, cohort_id, user_id, num, POINT_TITLES[num], scheduled_at ?? null, req.user.id);

  writeAudit(db, {
    actorId: req.user.id,
    targetUserId: user_id,
    eventType: 'elite_session_scheduled',
    tableName: 'elite_sessions',
    recordId: id,
    afterState: { point_number: num, scheduled_at },
  });

  res.status(201).json(db.prepare(`SELECT * FROM elite_sessions WHERE id = ?`).get(id));
});

/* ── ADMIN: PATCH /api/elite/admin/sessions/:id — record/update ─── */
router.patch('/admin/sessions/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const session = db.prepare(`SELECT * FROM elite_sessions WHERE id = ?`).get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });

  const { status, notes, scheduled_at } = req.body ?? {};
  const updates = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (scheduled_at) updates.scheduled_at = scheduled_at;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE elite_sessions SET ${setClauses}, updated_at = ? WHERE id = ?`)
    .run(...Object.values(updates), new Date().toISOString(), req.params.id);

  if (status === 'done') {
    writeAudit(db, {
      actorId: req.user.id,
      targetUserId: session.user_id,
      eventType: 'elite_session_done',
      tableName: 'elite_sessions',
      recordId: session.id,
      afterState: { point_number: session.point_number, notes },
    });
  }

  res.json(db.prepare(`SELECT * FROM elite_sessions WHERE id = ?`).get(req.params.id));
});

/* ── ADMIN: POST /api/elite/admin/revues ─────────────────────────── */
router.post('/admin/revues', requireAdmin, (req, res) => {
  const db = getDb();
  const { user_id, scheduled_at } = req.body ?? {};

  if (!user_id || !scheduled_at) {
    return res.status(400).json({ error: 'user_id et scheduled_at requis' });
  }

  const target = db.prepare(`SELECT tier FROM users WHERE id = ?`).get(user_id);
  if (!target) return res.status(404).json({ error: 'Participant introuvable' });
  if (target.tier !== 'ELITE') {
    return res.status(400).json({ error: 'Ce participant n\'est pas ELITE' });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO elite_revues (id, user_id, scheduled_at, created_by)
    VALUES (?,?,?,?)
  `).run(id, user_id, scheduled_at, req.user.id);

  res.status(201).json(db.prepare(`SELECT * FROM elite_revues WHERE id = ?`).get(id));
});

/* ── ADMIN: PATCH /api/elite/admin/revues/:id ────────────────────── */
router.patch('/admin/revues/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const revue = db.prepare(`SELECT * FROM elite_revues WHERE id = ?`).get(req.params.id);
  if (!revue) return res.status(404).json({ error: 'Revue introuvable' });

  const { status, notes } = req.body ?? {};
  const updates = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE elite_revues SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), req.params.id);

  res.json(db.prepare(`SELECT * FROM elite_revues WHERE id = ?`).get(req.params.id));
});

/* ── ADMIN: POST /api/elite/admin/grant-points ───────────────────── */
router.post('/admin/grant-points', requireAdmin, (req, res) => {
  const db = getDb();
  const { user_id, points, reason, source_type } = req.body ?? {};

  if (!user_id || !points || !reason) {
    return res.status(400).json({ error: 'user_id, points et reason requis' });
  }

  const target = db.prepare(`SELECT tier FROM users WHERE id = ?`).get(user_id);
  if (!target) return res.status(404).json({ error: 'Participant introuvable' });
  if (target.tier !== 'ELITE') {
    return res.status(400).json({ error: 'Ce participant n\'est pas ELITE' });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO elite_points (id, user_id, points, reason, source_type, granted_by)
    VALUES (?,?,?,?,?,?)
  `).run(id, user_id, Number(points), reason,
    source_type ?? 'manual', req.user.id);

  writeAudit(db, {
    actorId: req.user.id,
    targetUserId: user_id,
    eventType: 'elite_points_grant',
    tableName: 'elite_points',
    recordId: id,
    afterState: { points: Number(points), reason },
  });

  res.status(201).json(db.prepare(`SELECT * FROM elite_points WHERE id = ?`).get(id));
});

export default router;
