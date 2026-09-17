import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth);

/* ── helpers ─────────────────────────────────────────────────────── */

async function getEnrollment(db, userId) {
  return await db.queryOne(`
    SELECT e.cohort_id, up.cadre_step, up.sprint_number, up.week_in_sprint
    FROM enrollments e
    LEFT JOIN user_progress up ON up.user_id = e.user_id AND up.cohort_id = e.cohort_id
    WHERE e.user_id = ?
    LIMIT 1
  `, [userId]);
}

function hoursUntil(scheduledAt) {
  return (new Date(scheduledAt) - Date.now()) / 3_600_000;
}

async function labsForCohort(db, cohortId) {
  return await db.queryAll(
    `SELECT * FROM lab_sessions WHERE cohort_id = ? ORDER BY scheduled_at ASC`,
    [cohortId]
  );
}

/* ── GET /api/labs ───────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const enrollment = await getEnrollment(db, uid);
  if (!enrollment?.cohort_id) return res.json({ next_lab: null, accessible_labs: [] });

  const all = await labsForCohort(db, enrollment.cohort_id);

  const next = all.find(l => l.status === 'upcoming' || l.status === 'live');
  const accessible = all.filter(l => l.status === 'done');

  let next_lab = null;
  if (next) {
    const userPrelab = await db.queryOne(
      `SELECT * FROM lab_prelab WHERE lab_id = ? AND user_id = ?`,
      [next.id, uid]
    );
    next_lab = {
      ...next,
      resources: next.resources ? JSON.parse(next.resources) : [],
      hours_until: hoursUntil(next.scheduled_at),
      user_prelab: userPrelab ?? null,
      prelab_submitted: !!userPrelab,
    };
  }

  // Lazy pre-lab reminder: generate once if lab < 48h away and no prelab submitted
  if (next_lab && !next_lab.prelab_submitted && next_lab.hours_until > 0 && next_lab.hours_until < 48) {
    const alreadyNotified = await db.queryOne(`
      SELECT id FROM notifications
      WHERE user_id = ? AND type = 'prelab_reminder'
        AND body LIKE ? AND created_at > datetime('now', '-2 days')
    `, [uid, `%${next_lab.id}%`]);
    if (!alreadyNotified) {
      await db.notify({
        userId: uid,
        type: 'prelab_reminder',
        title: `Prépare ton Lab — ${next_lab.title}`,
        body: `${next_lab.id}|Dans ${Math.round(next_lab.hours_until)}h — soumets ta question prioritaire avant le Lab.`,
      });
    }
  }

  res.json({
    next_lab,
    accessible_labs: accessible.map(l => ({
      ...l,
      resources: l.resources ? JSON.parse(l.resources) : [],
    })),
  });
});

/* ── GET /api/labs/:labId/prelab ─────────────────────────────────── */
router.get('/:labId/prelab', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;
  const { labId } = req.params;

  const lab = await db.queryOne(`SELECT * FROM lab_sessions WHERE id = ?`, [labId]);
  if (!lab) return res.status(404).json({ error: 'Lab introuvable' });

  const enrollment = await getEnrollment(db, uid);
  if (!enrollment?.cohort_id || enrollment.cohort_id !== lab.cohort_id) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const prelab = await db.queryOne(
    `SELECT * FROM lab_prelab WHERE lab_id = ? AND user_id = ?`,
    [labId, uid]
  );

  res.json(prelab ?? null);
});

/* ── POST /api/labs/:labId/prelab ────────────────────────────────── */
router.post('/:labId/prelab', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;
  const { labId } = req.params;

  const lab = await db.queryOne(`SELECT * FROM lab_sessions WHERE id = ?`, [labId]);
  if (!lab) return res.status(404).json({ error: 'Lab introuvable' });

  if (lab.status === 'live' || lab.status === 'done') {
    return res.status(403).json({ error: 'Ce Lab est déjà commencé ou terminé' });
  }
  if (lab.status === 'cancelled') {
    return res.status(403).json({ error: 'Ce Lab a été annulé' });
  }

  const enrollment = await getEnrollment(db, uid);
  if (!enrollment?.cohort_id || enrollment.cohort_id !== lab.cohort_id) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  const {
    progress_since_last, planned_mission, deliverable, deliverable_status,
    decision_taken, current_blocker, priority_question, key_point,
    useful_to_group, authorise_case_use,
  } = req.body ?? {};

  if (!priority_question || !priority_question.trim()) {
    return res.status(400).json({ error: 'La question prioritaire est requise' });
  }

  if (deliverable_status && !['termine','en_cours','bloque'].includes(deliverable_status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  const hours = hoursUntil(lab.scheduled_at);
  const isLate = hours < 24 && hours > 0 ? 1 : 0;

  const existing = await db.queryOne(
    `SELECT id FROM lab_prelab WHERE lab_id = ? AND user_id = ?`,
    [labId, uid]
  );

  const now = new Date().toISOString();

  if (existing) {
    await db.execute(`
      UPDATE lab_prelab SET
        progress_since_last = ?, planned_mission = ?, deliverable = ?,
        deliverable_status = ?, decision_taken = ?, current_blocker = ?,
        priority_question = ?, key_point = ?, useful_to_group = ?,
        authorise_case_use = ?, submitted_at = ?, is_late = ?
      WHERE id = ?
    `, [
      progress_since_last ?? null, planned_mission ?? null, deliverable ?? null,
      deliverable_status ?? null, decision_taken ?? null, current_blocker ?? null,
      priority_question.trim(), key_point ?? null,
      useful_to_group != null ? (useful_to_group ? 1 : 0) : null,
      authorise_case_use != null ? (authorise_case_use ? 1 : 0) : null,
      now, isLate, existing.id
    ]);
    const updated = await db.queryOne(`SELECT * FROM lab_prelab WHERE id = ?`, [existing.id]);
    return res.json({ ok: true, prelab: updated, is_late: !!isLate });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO lab_prelab (
      id, lab_id, user_id,
      progress_since_last, planned_mission, deliverable, deliverable_status,
      decision_taken, current_blocker, priority_question, key_point,
      useful_to_group, authorise_case_use, submitted_at, is_late
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    id, labId, uid,
    progress_since_last ?? null, planned_mission ?? null, deliverable ?? null,
    deliverable_status ?? null, decision_taken ?? null, current_blocker ?? null,
    priority_question.trim(), key_point ?? null,
    useful_to_group != null ? (useful_to_group ? 1 : 0) : null,
    authorise_case_use != null ? (authorise_case_use ? 1 : 0) : null,
    now, isLate
  ]);

  const created = await db.queryOne(`SELECT * FROM lab_prelab WHERE id = ?`, [id]);
  return res.status(201).json({ ok: true, prelab: created, is_late: !!isLate });
});

/* ── ADMIN: GET /api/labs/admin/labs ─────────────────────────────── */
router.get('/admin/labs', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const { cohort_id } = req.query;
  const rows = cohort_id
    ? await db.queryAll(`SELECT * FROM lab_sessions WHERE cohort_id = ? ORDER BY scheduled_at ASC`, [cohort_id])
    : await db.queryAll(`SELECT * FROM lab_sessions ORDER BY scheduled_at ASC`, []);
  res.json(rows.map(l => ({ ...l, resources: l.resources ? JSON.parse(l.resources) : [] })));
});

/* ── ADMIN: POST /api/labs/admin/labs ────────────────────────────── */
router.post('/admin/labs', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const { cohort_id, title, topic, scheduled_at, duration_minutes } = req.body ?? {};

  if (!cohort_id || !title || !scheduled_at) {
    return res.status(400).json({ error: 'cohort_id, title et scheduled_at requis' });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO lab_sessions (id, cohort_id, title, topic, scheduled_at, duration_minutes, created_by)
    VALUES (?,?,?,?,?,?,?)
  `, [id, cohort_id, title, topic ?? null, scheduled_at,
    duration_minutes ?? 90, req.user.id]);

  const lab = await db.queryOne(`SELECT * FROM lab_sessions WHERE id = ?`, [id]);
  return res.status(201).json(lab);
});

/* ── ADMIN: PATCH /api/labs/admin/labs/:labId ────────────────────── */
router.patch('/admin/labs/:labId', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const { labId } = req.params;

  const lab = await db.queryOne(`SELECT * FROM lab_sessions WHERE id = ?`, [labId]);
  if (!lab) return res.status(404).json({ error: 'Lab introuvable' });

  const allowed = ['replay_url','resources','status','title','topic','scheduled_at','duration_minutes'];
  const updates = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }

  if (updates.resources && typeof updates.resources !== 'string') {
    updates.resources = JSON.stringify(updates.resources);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), new Date().toISOString(), labId];
  await db.execute(`UPDATE lab_sessions SET ${setClauses}, updated_at = ? WHERE id = ?`, values);

  const updated = await db.queryOne(`SELECT * FROM lab_sessions WHERE id = ?`, [labId]);
  return res.json({ ...updated, resources: updated.resources ? JSON.parse(updated.resources) : [] });
});

/* ── ADMIN: GET /api/labs/admin/labs/:labId/prelabs ──────────────── */
router.get('/admin/labs/:labId/prelabs', requireAdmin, async (req, res) => {
  const db = getAdapter();
  const { labId } = req.params;

  const lab = await db.queryOne(`SELECT * FROM lab_sessions WHERE id = ?`, [labId]);
  if (!lab) return res.status(404).json({ error: 'Lab introuvable' });

  const prelabs = await db.queryAll(`
    SELECT lp.*, u.first_name, u.email, u.tier
    FROM lab_prelab lp
    JOIN users u ON u.id = lp.user_id
    WHERE lp.lab_id = ?
    ORDER BY lp.submitted_at ASC
  `, [labId]);

  res.json({ lab, prelabs });
});

export default router;
