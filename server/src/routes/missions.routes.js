/**
 * Missions Routes — Build 18B
 * Participant mission submission endpoints.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb, writeAudit } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

/* ── GET /api/parcours/missions ─────────────────────────────── */
router.get('/missions', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const enrollment = db.prepare(`
    SELECT cohort_id FROM enrollments WHERE user_id = ? ORDER BY enrolled_at DESC LIMIT 1
  `).get(userId);
  const cohortId = enrollment?.cohort_id ?? null;

  const progress = db.prepare(`
    SELECT sprint_number FROM user_progress WHERE user_id = ? LIMIT 1
  `).get(userId);
  if (!progress) return res.json([]);

  const sprintNumber = progress.sprint_number;

  const missions = db.prepare(`
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
  `).all(userId, sprintNumber, cohortId);

  res.json(missions);
});

/* ── POST /api/parcours/missions/:missionId/submit ──────────── */
router.post('/missions/:missionId/submit', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { missionId } = req.params;
  const { content } = req.body ?? {};

  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'Le champ content est requis' });
  }

  const enrollment = db.prepare(`
    SELECT cohort_id FROM enrollments WHERE user_id = ? ORDER BY enrolled_at DESC LIMIT 1
  `).get(userId);
  const cohortId = enrollment?.cohort_id ?? null;

  const progress = db.prepare(`
    SELECT sprint_number FROM user_progress WHERE user_id = ? LIMIT 1
  `).get(userId);
  if (!progress) return res.status(400).json({ error: 'Aucune progression trouvée' });

  const mission = db.prepare(`
    SELECT * FROM missions WHERE id = ? AND (cohort_id IS NULL OR cohort_id = ?)
  `).get(missionId, cohortId);
  if (!mission) return res.status(404).json({ error: 'Mission introuvable ou non accessible' });

  if (mission.sprint_number !== progress.sprint_number) {
    return res.status(403).json({ error: 'Cette mission n\'appartient pas au sprint actif' });
  }

  const existing = db.prepare(`
    SELECT * FROM mission_submissions WHERE mission_id = ? AND user_id = ?
  `).get(missionId, userId);

  if (existing?.status === 'approved') {
    return res.status(409).json({ error: 'Cette soumission a déjà été approuvée' });
  }

  const now = new Date().toISOString();
  let submissionId;

  if (existing) {
    submissionId = existing.id;
    db.prepare(`
      UPDATE mission_submissions
      SET content = ?, status = 'submitted', updated_at = ?
      WHERE id = ?
    `).run(String(content), now, existing.id);
  } else {
    submissionId = randomUUID();
    db.prepare(`
      INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)
    `).run(submissionId, missionId, userId, cohortId, String(content), now, now);
  }

  writeAudit(db, {
    actorId: userId,
    targetUserId: userId,
    eventType: 'mission_submitted',
    tableName: 'mission_submissions',
    afterState: { mission_id: missionId, status: 'submitted' },
  });

  const submission = db.prepare(`SELECT * FROM mission_submissions WHERE id = ?`).get(submissionId);
  res.status(existing ? 200 : 201).json(submission);
});

export default router;
