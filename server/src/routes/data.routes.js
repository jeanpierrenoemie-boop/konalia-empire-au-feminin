import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin, requireElite, denyTestInProduction } from '../middleware/requireRole.js';
import { requireOwnership, requireCohortAccess } from '../middleware/requireOwnership.js';

const router = Router();

/* Participant private data */
router.get('/participant/:recordId', requireAuth, denyTestInProduction, requireOwnership, async (req, res) => {
  const db = getAdapter();
  const record = await db.queryOne('SELECT * FROM participant_data WHERE id = ?', [req.params.recordId]);
  return res.json(record);
});

router.post('/participant', requireAuth, denyTestInProduction, async (req, res) => {
  const { data_type, content } = req.body ?? {};
  if (!data_type) return res.status(400).json({ error: 'data_type requis' });

  const db = getAdapter();
  const id = randomUUID();
  await db.execute(
    `INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, ?, ?)`,
    [id, req.user.id, data_type, JSON.stringify(content ?? {})]
  );

  return res.status(201).json({ id });
});

/* Cohort shared content */
router.get('/cohort/:contentId', requireAuth, requireCohortAccess, async (req, res) => {
  const db = getAdapter();
  const row = await db.queryOne('SELECT * FROM cohort_content WHERE id = ?', [req.params.contentId]);
  return res.json(row);
});

/* Elite-only route example */
router.get('/elite/extra', requireAuth, requireElite, (req, res) => {
  return res.json({ message: 'Contenu réservé ELITE', user: req.user.first_name });
});

/* Admin: all pilot records */
router.get('/admin/participants', requireAuth, requireAdmin, async (req, res) => {
  const db = getAdapter();
  const users = await db.queryAll(
    'SELECT id, email, role, tier, first_name, cohort_id, is_test, created_at, last_login FROM users',
    []
  );
  return res.json(users);
});

router.get('/admin/participant/:userId/data', requireAuth, requireAdmin, async (req, res) => {
  const db = getAdapter();
  const records = await db.queryAll(
    'SELECT * FROM participant_data WHERE owner_id = ?',
    [req.params.userId]
  );
  return res.json(records);
});

export default router;
