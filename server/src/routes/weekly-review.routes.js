import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

/* ── GET /api/weekly-review/current ─────────────────────────── */
router.get('/current', async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const progress = await db.queryOne(
    `SELECT sprint_number, week_in_sprint, cohort_id FROM user_progress WHERE user_id = ? LIMIT 1`,
    [userId]
  );

  if (!progress) return res.status(404).json({ error: 'Aucune progression trouvée' });

  const review = await db.queryOne(`
    SELECT * FROM weekly_reviews
    WHERE user_id = ? AND sprint_number = ? AND week_number = ?
  `, [userId, progress.sprint_number, progress.week_in_sprint]);

  return res.json({
    sprint_number: progress.sprint_number,
    week_number: progress.week_in_sprint,
    cohort_id: progress.cohort_id,
    review: review ?? null,
  });
});

/* ── GET /api/weekly-review ──────────────────────────────────── */
router.get('/', async (req, res) => {
  const db = getAdapter();
  const reviews = await db.queryAll(
    `SELECT * FROM weekly_reviews WHERE user_id = ? ORDER BY sprint_number DESC, week_number DESC`,
    [req.user.id]
  );
  return res.json(reviews);
});

/* ── POST /api/weekly-review ─────────────────────────────────── */
router.post('/', async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const { wins = '', blockers = '', next_week_focus = '', energy_level = null } = req.body ?? {};

  const progress = await db.queryOne(
    `SELECT sprint_number, week_in_sprint, cohort_id FROM user_progress WHERE user_id = ? LIMIT 1`,
    [userId]
  );

  if (!progress) return res.status(400).json({ error: 'Aucune progression trouvée' });

  if (energy_level !== null && energy_level !== undefined) {
    const el = Number(energy_level);
    if (!Number.isInteger(el) || el < 1 || el > 5) {
      return res.status(400).json({ error: 'energy_level doit être entre 1 et 5' });
    }
  }

  const { sprint_number, week_in_sprint: week_number, cohort_id } = progress;

  const existing = await db.queryOne(
    `SELECT id, status FROM weekly_reviews WHERE user_id = ? AND sprint_number = ? AND week_number = ?`,
    [userId, sprint_number, week_number]
  );

  if (existing?.status === 'submitted') {
    return res.status(409).json({ error: 'Cette revue a déjà été soumise' });
  }

  if (existing) {
    await db.execute(`
      UPDATE weekly_reviews SET wins = ?, blockers = ?, next_week_focus = ?, energy_level = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [wins, blockers, next_week_focus, energy_level ?? null, existing.id]);
    const updated = await db.queryOne('SELECT * FROM weekly_reviews WHERE id = ?', [existing.id]);
    return res.json(updated);
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO weekly_reviews (id, user_id, cohort_id, sprint_number, week_number,
      wins, blockers, next_week_focus, energy_level, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `, [id, userId, cohort_id, sprint_number, week_number, wins, blockers, next_week_focus, energy_level ?? null]);

  return res.status(201).json(await db.queryOne('SELECT * FROM weekly_reviews WHERE id = ?', [id]));
});

/* ── POST /api/weekly-review/:id/submit ──────────────────────── */
router.post('/:id/submit', async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;
  const { id } = req.params;

  const review = await db.queryOne('SELECT * FROM weekly_reviews WHERE id = ? AND user_id = ?', [id, userId]);

  if (!review) return res.status(404).json({ error: 'Revue introuvable' });
  if (review.status === 'submitted') return res.status(409).json({ error: 'Déjà soumise' });

  await db.execute(`UPDATE weekly_reviews SET status = 'submitted', updated_at = datetime('now') WHERE id = ?`, [id]);

  await db.writeAudit({
    actorId: userId,
    eventType: 'weekly_review_submitted',
    targetUserId: userId,
    tableName: 'weekly_reviews',
    recordId: id,
    afterState: { sprint_number: review.sprint_number, week_number: review.week_number },
  });

  return res.json(await db.queryOne('SELECT * FROM weekly_reviews WHERE id = ?', [id]));
});

export default router;
