/**
 * Build 16: Action-driven notifications only.
 * No engagement pings, no streaks, no re-engagement.
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

/* GET /api/notifications — unread count + recent list */
router.get('/', (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit ?? 30), 50);

  const items = db.prepare(`
    SELECT id, type, title, body, read, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(req.user.id, limit);

  const unread = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0`
  ).get(req.user.id).n;

  res.json({ unread, items });
});

/* POST /api/notifications/:id/read — mark one read */
router.post('/:id/read', (req, res) => {
  const db = getDb();
  const n = db.prepare(
    `SELECT id FROM notifications WHERE id = ? AND user_id = ?`
  ).get(req.params.id, req.user.id);
  if (!n) return res.status(404).json({ error: 'Notification introuvable' });

  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

/* POST /api/notifications/read-all — mark all read */
router.post('/read-all', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`).run(req.user.id);
  res.json({ ok: true });
});

export default router;
