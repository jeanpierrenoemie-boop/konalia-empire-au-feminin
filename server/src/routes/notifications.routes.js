/**
 * Build 16: Action-driven notifications only.
 * No engagement pings, no streaks, no re-engagement.
 */
import { Router } from 'express';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

/* GET /api/notifications — unread count + recent list */
router.get('/', async (req, res) => {
  const db = getAdapter();
  const limit = Math.min(Number(req.query.limit ?? 30), 50);

  const items = await db.queryAll(`
    SELECT id, type, title, body, read, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [req.user.id, limit]);

  const unreadRow = await db.queryOne(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = FALSE`,
    [req.user.id]
  );

  res.json({ unread: unreadRow?.n ?? 0, items });
});

/* POST /api/notifications/:id/read — mark one read */
router.post('/:id/read', async (req, res) => {
  const db = getAdapter();
  const n = await db.queryOne(
    `SELECT id FROM notifications WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id]
  );
  if (!n) return res.status(404).json({ error: 'Notification introuvable' });

  await db.execute(`UPDATE notifications SET read = TRUE WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

/* POST /api/notifications/read-all — mark all read */
router.post('/read-all', async (req, res) => {
  const db = getAdapter();
  await db.execute(`UPDATE notifications SET read = TRUE WHERE user_id = ?`, [req.user.id]);
  res.json({ ok: true });
});

export default router;
