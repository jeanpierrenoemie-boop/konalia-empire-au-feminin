import { Router } from 'express';
import { getDb, writeAudit } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

/* ── GET /api/passeport ── */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const passport = db.prepare(`SELECT * FROM project_passport WHERE user_id = ?`).get(userId);
  const profile = db.prepare(`SELECT display_name, employment_status, sector, weekly_hours_available FROM profiles WHERE user_id = ?`).get(userId);
  const progress = db.prepare(`SELECT cadre_step, sprint_number, gate_status FROM user_progress WHERE user_id = ? LIMIT 1`).get(userId);

  const completeness = passport ? computeCompleteness(passport) : 0;

  res.json({ passport: passport ?? null, profile: profile ?? null, progress: progress ?? null, completeness });
});

/* ── PUT /api/passeport ── */
/* Updates project_passport fields that are NOT locked by validated decisions. */
router.put('/', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const ALLOWED = ['project_name', 'proposed_solution', 'revenue_model', 'stage', 'validation_score'];
  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ modifiable fourni' });
  }

  const existing = db.prepare(`SELECT id FROM project_passport WHERE user_id = ?`).get(userId);
  const before = existing ? db.prepare(`SELECT * FROM project_passport WHERE user_id = ?`).get(userId) : null;

  if (!existing) {
    return res.status(404).json({ error: 'Passeport introuvable — complète l\'onboarding d\'abord' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE project_passport SET ${setClauses}, updated_at = datetime('now') WHERE user_id = ?`)
    .run(...Object.values(updates), userId);

  writeAudit(db, {
    actorId: userId,
    targetUserId: userId,
    eventType: 'data_access',
    tableName: 'project_passport',
    recordId: existing.id,
    beforeState: before,
    afterState: { ...before, ...updates },
  });

  const updated = db.prepare(`SELECT * FROM project_passport WHERE user_id = ?`).get(userId);
  res.json({ passport: updated, completeness: computeCompleteness(updated) });
});

function computeCompleteness(p) {
  const fields = ['project_name', 'vision', 'target_persona', 'core_problem', 'proposed_solution', 'revenue_model'];
  const filled = fields.filter(f => p[f] && String(p[f]).trim().length > 0).length;
  return Math.round((filled / fields.length) * 100);
}

export default router;
