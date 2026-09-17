import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin, requireElite, denyTestInProduction } from '../middleware/requireRole.js';
import { requireOwnership, requireCohortAccess } from '../middleware/requireOwnership.js';

const router = Router();

/* Participant private data */
router.get('/participant/:recordId', requireAuth, denyTestInProduction, requireOwnership, (req, res) => {
  const db = getDb();
  const record = db.prepare('SELECT * FROM participant_data WHERE id = ?').get(req.params.recordId);
  return res.json(record);
});

router.post('/participant', requireAuth, denyTestInProduction, (req, res) => {
  const { data_type, content } = req.body ?? {};
  if (!data_type) return res.status(400).json({ error: 'data_type requis' });

  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, ?, ?)`
  ).run(id, req.user.id, data_type, JSON.stringify(content ?? {}));

  return res.status(201).json({ id });
});

/* Cohort shared content */
router.get('/cohort/:contentId', requireAuth, requireCohortAccess, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cohort_content WHERE id = ?').get(req.params.contentId);
  return res.json(row);
});

/* Elite-only route example */
router.get('/elite/extra', requireAuth, requireElite, (req, res) => {
  return res.json({ message: 'Contenu réservé ELITE', user: req.user.first_name });
});

/* Admin: all pilot records */
router.get('/admin/participants', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, email, role, tier, first_name, cohort_id, is_test, created_at, last_login FROM users'
  ).all();
  return res.json(users);
});

router.get('/admin/participant/:userId/data', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const records = db.prepare(
    'SELECT * FROM participant_data WHERE owner_id = ?'
  ).all(req.params.userId);
  return res.json(records);
});

export default router;
