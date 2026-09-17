/**
 * Elite routes — Points ELITE and Revue Prioritaire
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
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
router.get('/', requireElite, async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const sessions = await db.queryAll(
    `SELECT * FROM elite_sessions WHERE user_id = ? ORDER BY point_number, scheduled_at`,
    [uid]
  );

  const revues = await db.queryAll(
    `SELECT * FROM elite_revues WHERE user_id = ? ORDER BY scheduled_at DESC`,
    [uid]
  );

  const points = await db.queryAll(
    `SELECT * FROM elite_points WHERE user_id = ? ORDER BY created_at DESC`,
    [uid]
  );

  const totalPoints = points.reduce((s, r) => s + r.points, 0);

  res.json({ sessions, revues, points, total_points: totalPoints });
});

/* ── ADMIN: GET /api/elite/admin/overview ─ */
router.get('/admin/overview', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const { cohort_id } = req.query;

  const users = cohort_id
    ? await db.queryAll(`
        SELECT u.id, u.first_name, u.email, u.tier,
               c.name AS cohort_name, up.cadre_step, up.sprint_number
        FROM users u
        JOIN enrollments e ON e.user_id = u.id AND e.cohort_id = ?
        JOIN cohorts c ON c.id = e.cohort_id
        LEFT JOIN user_progress up ON up.user_id = u.id AND up.cohort_id = e.cohort_id
        WHERE u.tier = 'ELITE'
      `, [cohort_id])
    : await db.queryAll(`
        SELECT u.id, u.first_name, u.email, u.tier,
               c.name AS cohort_name, up.cadre_step, up.sprint_number
        FROM users u
        JOIN enrollments e ON e.user_id = u.id
        JOIN cohorts c ON c.id = e.cohort_id
        LEFT JOIN user_progress up ON up.user_id = u.id AND up.cohort_id = e.cohort_id
        WHERE u.tier = 'ELITE'
      `, []);

  res.json(users);
});

/* ── ADMIN: POST /api/elite/admin/sessions ─ */
router.post('/admin/sessions', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const { user_id, cohort_id, point_number, scheduled_at } = req.body ?? {};

  if (!user_id || !cohort_id || !point_number) {
    return res.status(400).json({ error: 'user_id, cohort_id et point_number requis' });
  }
  if (![1, 2, 3].includes(Number(point_number))) {
    return res.status(400).json({ error: 'point_number doit être 1, 2 ou 3' });
  }

  const target = await db.queryOne(`SELECT tier FROM users WHERE id = ?`, [user_id]);
  if (!target) return res.status(404).json({ error: 'Participant introuvable' });
  if (target.tier !== 'ELITE') {
    return res.status(400).json({ error: 'Ce participant n\'est pas ELITE' });
  }

  const id = randomUUID();
  const num = Number(point_number);
  await db.execute(`
    INSERT INTO elite_sessions (id, cohort_id, user_id, point_number, title, scheduled_at, created_by)
    VALUES (?,?,?,?,?,?,?)
  `, [id, cohort_id, user_id, num, POINT_TITLES[num], scheduled_at ?? null, req.user.id]);

  await db.writeAudit({
    actorId: req.user.id,
    targetUserId: user_id,
    eventType: 'elite_session_scheduled',
    tableName: 'elite_sessions',
    recordId: id,
    afterState: { point_number: num, scheduled_at },
  });

  await db.notify({
    userId: user_id,
    type: 'elite_appointment',
    title: `Point ELITE #${num} planifié — ${POINT_TITLES[num]}`,
    body: scheduled_at ? `Prévu le ${new Date(scheduled_at).toLocaleDateString('fr-FR')}` : null,
  });
  return res.status(201).json(await db.queryOne(`SELECT * FROM elite_sessions WHERE id = ?`, [id]));
});

/* ── ADMIN: PATCH /api/elite/admin/sessions/:id ─ */
router.patch('/admin/sessions/:id', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const session = await db.queryOne(`SELECT * FROM elite_sessions WHERE id = ?`, [req.params.id]);
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
  await db.execute(`UPDATE elite_sessions SET ${setClauses}, updated_at = ? WHERE id = ?`,
    [...Object.values(updates), new Date().toISOString(), req.params.id]);

  if (status === 'done') {
    await db.writeAudit({
      actorId: req.user.id,
      targetUserId: session.user_id,
      eventType: 'elite_session_done',
      tableName: 'elite_sessions',
      recordId: session.id,
      afterState: { point_number: session.point_number, notes },
    });
  }

  return res.json(await db.queryOne(`SELECT * FROM elite_sessions WHERE id = ?`, [req.params.id]));
});

/* ── ADMIN: POST /api/elite/admin/revues ─ */
router.post('/admin/revues', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const { user_id, scheduled_at } = req.body ?? {};

  if (!user_id || !scheduled_at) {
    return res.status(400).json({ error: 'user_id et scheduled_at requis' });
  }

  const target = await db.queryOne(`SELECT tier FROM users WHERE id = ?`, [user_id]);
  if (!target) return res.status(404).json({ error: 'Participant introuvable' });
  if (target.tier !== 'ELITE') {
    return res.status(400).json({ error: 'Ce participant n\'est pas ELITE' });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO elite_revues (id, user_id, scheduled_at, created_by)
    VALUES (?,?,?,?)
  `, [id, user_id, scheduled_at, req.user.id]);

  return res.status(201).json(await db.queryOne(`SELECT * FROM elite_revues WHERE id = ?`, [id]));
});

/* ── ADMIN: PATCH /api/elite/admin/revues/:id ─ */
router.patch('/admin/revues/:id', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const revue = await db.queryOne(`SELECT * FROM elite_revues WHERE id = ?`, [req.params.id]);
  if (!revue) return res.status(404).json({ error: 'Revue introuvable' });

  const { status, notes } = req.body ?? {};
  const updates = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  await db.execute(`UPDATE elite_revues SET ${setClauses} WHERE id = ?`,
    [...Object.values(updates), req.params.id]);

  return res.json(await db.queryOne(`SELECT * FROM elite_revues WHERE id = ?`, [req.params.id]));
});

/* ── ADMIN: POST /api/elite/admin/grant-points ─ */
router.post('/admin/grant-points', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const { user_id, points, reason, source_type } = req.body ?? {};

  if (!user_id || !points || !reason) {
    return res.status(400).json({ error: 'user_id, points et reason requis' });
  }

  const target = await db.queryOne(`SELECT tier FROM users WHERE id = ?`, [user_id]);
  if (!target) return res.status(404).json({ error: 'Participant introuvable' });
  if (target.tier !== 'ELITE') {
    return res.status(400).json({ error: 'Ce participant n\'est pas ELITE' });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO elite_points (id, user_id, points, reason, source_type, granted_by)
    VALUES (?,?,?,?,?,?)
  `, [id, user_id, Number(points), reason,
    source_type ?? 'manual', req.user.id]);

  await db.writeAudit({
    actorId: req.user.id,
    targetUserId: user_id,
    eventType: 'elite_points_grant',
    tableName: 'elite_points',
    recordId: id,
    afterState: { points: Number(points), reason },
  });

  return res.status(201).json(await db.queryOne(`SELECT * FROM elite_points WHERE id = ?`, [id]));
});

export default router;
