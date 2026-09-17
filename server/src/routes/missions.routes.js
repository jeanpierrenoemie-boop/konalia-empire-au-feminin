/**
 * Missions Routes — Build 18B
 * Participant mission submission endpoints.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

/* ── GET /api/parcours/missions ─────────────────────────────── */
router.get('/missions', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const enrollment = await db.queryOne(`
    SELECT cohort_id FROM enrollments WHERE user_id = ? ORDER BY enrolled_at DESC LIMIT 1
  `, [userId]);
  const cohortId = enrollment?.cohort_id ?? null;

  const progress = await db.queryOne(`
    SELECT sprint_number FROM user_progress WHERE user_id = ? LIMIT 1
  `, [userId]);
  if (!progress) return res.json([]);

  const sprintNumber = progress.sprint_number;

  const missions = await db.queryAll(`
    SELECT m.*,
           ms.id AS submission_id,
           ms.status AS submission_status,
           ms.content AS submission_content,
           ms.reviewer_note,
           ms.reviewed_at
    FROM missions m
    LEFT JOIN mission_submissions ms ON ms.mission_id = m.id AND ms.user_id = ?
    WHERE m.sprint_number = ?
      AND (m.cohort_id IS NULL OR m.cohort_id = ?)
    ORDER BY m.sort_order, m.created_at
  `, [userId, sprintNumber, cohortId]);

  res.json(missions);
});

/* ── POST /api/parcours/missions/:missionId/submit ──────────── */
router.post('/missions/:missionId/submit', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;
  const { missionId } = req.params;
  const { content } = req.body ?? {};

  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'Le champ content est requis' });
  }

  const enrollment = await db.queryOne(`
    SELECT cohort_id FROM enrollments WHERE user_id = ? ORDER BY enrolled_at DESC LIMIT 1
  `, [userId]);
  const cohortId = enrollment?.cohort_id ?? null;

  const progress = await db.queryOne(`
    SELECT sprint_number FROM user_progress WHERE user_id = ? LIMIT 1
  `, [userId]);
  if (!progress) return res.status(400).json({ error: 'Aucune progression trouvée' });

  const mission = await db.queryOne(`
    SELECT * FROM missions WHERE id = ? AND (cohort_id IS NULL OR cohort_id = ?)
  `, [missionId, cohortId]);
  if (!mission) return res.status(404).json({ error: 'Mission introuvable ou non accessible' });

  if (mission.sprint_number !== progress.sprint_number) {
    return res.status(403).json({ error: 'Cette mission n\'appartient pas au sprint actif' });
  }

  const existing = await db.queryOne(`
    SELECT * FROM mission_submissions WHERE mission_id = ? AND user_id = ?
  `, [missionId, userId]);

  if (existing?.status === 'approved') {
    return res.status(409).json({ error: 'Cette soumission a déjà été approuvée' });
  }

  const now = new Date().toISOString();
  let submissionId;

  if (existing) {
    submissionId = existing.id;
    await db.execute(`
      UPDATE mission_submissions
      SET content = ?, status = 'submitted', updated_at = ?
      WHERE id = ?
    `, [String(content), now, existing.id]);
  } else {
    submissionId = randomUUID();
    await db.execute(`
      INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)
    `, [submissionId, missionId, userId, cohortId, String(content), now, now]);
  }

  await db.writeAudit({
    actorId: userId,
    targetUserId: userId,
    eventType: 'mission_submitted',
    tableName: 'mission_submissions',
    afterState: { mission_id: missionId, status: 'submitted' },
  });

  const submission = await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId]);
  return res.status(existing ? 200 : 201).json(submission);
});

export default router;
