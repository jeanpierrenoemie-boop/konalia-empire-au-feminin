import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb, writeAudit } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

/* ── GET /api/weekly-review/current ─────────────────────────── */
router.get('/current', (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const progress = db.prepare(
    `SELECT sprint_number, week_in_sprint, cohort_id FROM user_progress WHERE user_id = ? LIMIT 1`
  ).get(userId);

  if (!progress) return res.status(404).json({ error: 'Aucune progression trouvée' });

  const review = db.prepare(`
    SELECT * FROM weekly_reviews
    WHERE user_id = ? AND sprint_number = ? AND week_number = ?
  `).get(userId, progress.sprint_number, progress.week_in_sprint);

  return res.json({
    sprint_number: progress.sprint_number,
    week_number: progress.week_in_sprint,
    cohort_id: progress.cohort_id,
    review: review ?? null,
  });
});

/* ── GET /api/weekly-review ──────────────────────────────────── */
router.get('/', (req, res) => {
  const db = getDb();
  const reviews = db.prepare(
    `SELECT * FROM weekly_reviews WHERE user_id = ? ORDER BY sprint_number DESC, week_number DESC`
  ).all(req.user.id);
  return res.json(reviews);
});

/* ── POST /api/weekly-review ─────────────────────────────────── */
router.post('/', (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const { wins = '', blockers = '', next_week_focus = '', energy_level = null } = req.body ?? {};

  const progress = db.prepare(
    `SELECT sprint_number, week_in_sprint, cohort_id FROM user_progress WHERE user_id = ? LIMIT 1`
  ).get(userId);

  if (!progress) return res.status(400).json({ error: 'Aucune progression trouvée' });

  if (energy_level !== null && energy_level !== undefined) {
    const el = Number(energy_level);
    if (!Number.isInteger(el) || el < 1 || el > 5) {
      return res.status(400).json({ error: 'energy_level doit être entre 1 et 5' });
    }
  }

  const { sprint_number, week_in_sprint: week_number, cohort_id } = progress;

  const existing = db.prepare(
    `SELECT id, status FROM weekly_reviews WHERE user_id = ? AND sprint_number = ? AND week_number = ?`
  ).get(userId, sprint_number, week_number);

  if (existing?.status === 'submitted') {
    return res.status(409).json({ error: 'Cette revue a déjà été soumise' });
  }

  if (existing) {
    db.prepare(`
      UPDATE weekly_reviews SET wins = ?, blockers = ?, next_week_focus = ?, energy_level = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(wins, blockers, next_week_focus, energy_level ?? null, existing.id);
    const updated = db.prepare('SELECT * FROM weekly_reviews WHERE id = ?').get(existing.id);
    return res.json(updated);
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO weekly_reviews (id, user_id, cohort_id, sprint_number, week_number,
      wins, blockers, next_week_focus, energy_level, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(id, userId, cohort_id, sprint_number, week_number, wins, blockers, next_week_focus, energy_level ?? null);

  return res.status(201).json(db.prepare('SELECT * FROM weekly_reviews WHERE id = ?').get(id));
});

/* ── POST /api/weekly-review/:id/submit ──────────────────────── */
router.post('/:id/submit', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { id } = req.params;

  const review = db.prepare('SELECT * FROM weekly_reviews WHERE id = ? AND user_id = ?').get(id, userId);

  if (!review) return res.status(404).json({ error: 'Revue introuvable' });
  if (review.status === 'submitted') return res.status(409).json({ error: 'Déjà soumise' });

  db.prepare(`UPDATE weekly_reviews SET status = 'submitted', updated_at = datetime('now') WHERE id = ?`).run(id);

  writeAudit(db, {
    actorId: userId,
    eventType: 'weekly_review_submitted',
    targetUserId: userId,
    tableName: 'weekly_reviews',
    recordId: id,
    afterState: { sprint_number: review.sprint_number, week_number: review.week_number },
  });

  return res.json(db.prepare('SELECT * FROM weekly_reviews WHERE id = ?').get(id));
});

export default router;
