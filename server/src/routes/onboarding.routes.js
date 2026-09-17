import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';
import { writeAudit } from '../db.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DRAFT_TYPE = 'onboarding_draft';

/* ── GET /api/onboarding/state ─────────────────────────────────────
   Returns current onboarding state:
   { completed, draft, step }
   step = last completed section index (0 = not started)
────────────────────────────────────────────────────────────────── */
router.get('/state', (req, res) => {
  const db = getDb();

  const profile = db.prepare(
    'SELECT onboarding_completed FROM profiles WHERE user_id = ?'
  ).get(req.user.id);

  if (profile?.onboarding_completed) {
    return res.json({ completed: true, draft: null, step: null });
  }

  const draft = db.prepare(
    `SELECT content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`
  ).get(req.user.id, DRAFT_TYPE);

  const parsed = draft ? JSON.parse(draft.content) : null;
  return res.json({
    completed: false,
    draft: parsed,
    step: parsed?.lastCompletedStep ?? 0,
  });
});

/* ── PUT /api/onboarding/draft ─────────────────────────────────────
   Save partial answers. Body: { section, answers, lastCompletedStep }
   Merges into existing draft.
────────────────────────────────────────────────────────────────── */
router.put('/draft', (req, res) => {
  const { section, answers, lastCompletedStep } = req.body ?? {};

  if (!section || answers === undefined) {
    return res.status(400).json({ error: 'section et answers requis' });
  }

  const db = getDb();
  const existing = db.prepare(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`
  ).get(req.user.id, DRAFT_TYPE);

  const current = existing ? JSON.parse(existing.content) : { sections: {} };
  current.sections[section] = answers;
  current.lastCompletedStep = Math.max(current.lastCompletedStep ?? 0, lastCompletedStep ?? 0);

  const json = JSON.stringify(current);

  if (existing) {
    db.prepare(
      `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(json, existing.id);
  } else {
    db.prepare(
      `INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, ?, ?)`
    ).run(randomUUID(), req.user.id, DRAFT_TYPE, json);
  }

  return res.json({ ok: true, lastCompletedStep: current.lastCompletedStep });
});

/* ── POST /api/onboarding/complete ────────────────────────────────
   Finalize onboarding.
   Populates ONLY explicitly provided facts:
     - project_passport: project_name, vision, target_persona, core_problem
     - pilotage_state: initial priority
     - user_progress: C / S1 / in_progress
     - profiles: onboarding_completed = 1
   Does NOT infer strategic decisions.
────────────────────────────────────────────────────────────────── */
router.post('/complete', (req, res) => {
  const { sections } = req.body ?? {};

  if (!sections) {
    return res.status(400).json({ error: 'sections requis' });
  }

  const db = getDb();

  // Guard: already completed
  const profile = db.prepare(
    'SELECT onboarding_completed FROM profiles WHERE user_id = ?'
  ).get(req.user.id);
  if (profile?.onboarding_completed) {
    return res.status(409).json({ error: 'Onboarding déjà complété' });
  }

  // Cohort — find active enrollment
  const enrollment = db.prepare(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' LIMIT 1`
  ).get(req.user.id);
  const cohortId = enrollment?.cohort_id ?? null;

  const tx = db.transaction(() => {
    /* 1. project_passport — only explicitly provided facts */
    const a = sections.A ?? {};
    const e = sections.E ?? {};
    const passportId = randomUUID();

    const existingPassport = db.prepare(
      'SELECT id FROM project_passport WHERE user_id = ?'
    ).get(req.user.id);

    if (!existingPassport) {
      db.prepare(`
        INSERT INTO project_passport (id, user_id, project_name, vision, target_persona, core_problem)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        passportId,
        req.user.id,
        a.project_name ?? null,
        e.objective_j90 ?? null,      // vision = J90 objective explicitly stated
        a.target_persona ?? null,
        a.core_problem ?? null,
      );
    }

    /* 2. pilotage_state — initial priority: open step C */
    const existingPilotage = db.prepare(
      'SELECT id FROM pilotage_state WHERE user_id = ?'
    ).get(req.user.id);

    if (!existingPilotage) {
      const f = sections.F ?? {};
      db.prepare(`
        INSERT INTO pilotage_state (id, user_id, current_priority, priority_reason, next_action, updated_by_user)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        randomUUID(),
        req.user.id,
        'Démarrer le C.A.D.R.E. — Étape C : Clarifier',
        f.commitment ?? 'Début du parcours',
        'Ouvrir la première mission de l\'étape C',
      );
    }

    /* 3. user_progress — C / S1 / in_progress */
    if (cohortId) {
      const existingProgress = db.prepare(
        'SELECT id FROM user_progress WHERE user_id = ? AND cohort_id = ?'
      ).get(req.user.id, cohortId);

      if (!existingProgress) {
        db.prepare(`
          INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at)
          VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))
        `).run(randomUUID(), req.user.id, cohortId);
      }
    }

    /* 4. profiles — mark onboarding complete */
    const existingProfile = db.prepare(
      'SELECT user_id FROM profiles WHERE user_id = ?'
    ).get(req.user.id);

    if (existingProfile) {
      db.prepare(
        `UPDATE profiles SET onboarding_completed = 1, updated_at = datetime('now') WHERE user_id = ?`
      ).run(req.user.id);
    } else {
      db.prepare(`
        INSERT INTO profiles (user_id, onboarding_completed) VALUES (?, 1)
      `).run(req.user.id);
    }

    /* 5. cleanup draft */
    db.prepare(
      `DELETE FROM participant_data WHERE owner_id = ? AND data_type = ?`
    ).run(req.user.id, DRAFT_TYPE);
  });

  tx();

  return res.json({
    ok: true,
    nextStep: {
      path: '/cockpit',
      message: 'Ton parcours commence. L\'étape C est ouverte.',
    },
  });
});

export default router;
