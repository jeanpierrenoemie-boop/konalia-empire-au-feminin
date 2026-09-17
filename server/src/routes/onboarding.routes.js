import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DRAFT_TYPE = 'onboarding_draft';

/* ── GET /api/onboarding/state ─────────────────────────────────────
   Returns current onboarding state:
   { completed, draft, step }
   step = last completed section index (0 = not started)
────────────────────────────────────────────────────────────────── */
router.get('/state', async (req, res) => {
  const db = getAdapter();

  const profile = await db.queryOne(
    'SELECT onboarding_completed FROM profiles WHERE user_id = ?',
    [req.user.id]
  );

  if (profile?.onboarding_completed) {
    return res.json({ completed: true, draft: null, step: null });
  }

  const draft = await db.queryOne(
    `SELECT content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [req.user.id, DRAFT_TYPE]
  );

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
router.put('/draft', async (req, res) => {
  const { section, answers, lastCompletedStep } = req.body ?? {};

  if (!section || answers === undefined) {
    return res.status(400).json({ error: 'section et answers requis' });
  }

  const db = getAdapter();
  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [req.user.id, DRAFT_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : { sections: {} };
  current.sections[section] = answers;
  current.lastCompletedStep = Math.max(current.lastCompletedStep ?? 0, lastCompletedStep ?? 0);

  const json = JSON.stringify(current);

  if (existing) {
    await db.execute(
      `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      [json, existing.id]
    );
  } else {
    await db.execute(
      `INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, ?, ?)`,
      [randomUUID(), req.user.id, DRAFT_TYPE, json]
    );
  }

  return res.json({ ok: true, lastCompletedStep: current.lastCompletedStep });
});

/* ── POST /api/onboarding/complete ────────────────────────────────
   Finalize onboarding.
────────────────────────────────────────────────────────────────── */
router.post('/complete', async (req, res) => {
  const { sections } = req.body ?? {};

  if (!sections) {
    return res.status(400).json({ error: 'sections requis' });
  }

  const db = getAdapter();

  // Guard: already completed
  const profile = await db.queryOne(
    'SELECT onboarding_completed FROM profiles WHERE user_id = ?',
    [req.user.id]
  );
  if (profile?.onboarding_completed) {
    return res.status(409).json({ error: 'Onboarding déjà complété' });
  }

  // Cohort — find active enrollment
  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' LIMIT 1`,
    [req.user.id]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  await db.transaction(async tx => {
    /* 1. project_passport — only explicitly provided facts */
    const a = sections.A ?? {};
    const e = sections.E ?? {};
    const passportId = randomUUID();

    const existingPassport = await tx.queryOne(
      'SELECT id FROM project_passport WHERE user_id = ?',
      [req.user.id]
    );

    if (!existingPassport) {
      await tx.execute(`
        INSERT INTO project_passport (id, user_id, project_name, vision, target_persona, core_problem)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        passportId,
        req.user.id,
        a.project_name ?? null,
        e.objective_j90 ?? null,
        a.target_persona ?? null,
        a.core_problem ?? null,
      ]);
    }

    /* 2. pilotage_state — initial priority: open step C */
    const existingPilotage = await tx.queryOne(
      'SELECT id FROM pilotage_state WHERE user_id = ?',
      [req.user.id]
    );

    if (!existingPilotage) {
      const f = sections.F ?? {};
      await tx.execute(`
        INSERT INTO pilotage_state (id, user_id, current_priority, priority_reason, next_action, updated_by_user)
        VALUES (?, ?, ?, ?, ?, TRUE)
      `, [
        randomUUID(),
        req.user.id,
        'Démarrer le C.A.D.R.E. — Étape C : Clarifier',
        f.commitment ?? 'Début du parcours',
        'Ouvrir la première mission de l\'étape C',
      ]);
    }

    /* 3. user_progress — C / S1 / in_progress */
    if (cohortId) {
      const existingProgress = await tx.queryOne(
        'SELECT id FROM user_progress WHERE user_id = ? AND cohort_id = ?',
        [req.user.id, cohortId]
      );

      if (!existingProgress) {
        await tx.execute(`
          INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at)
          VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))
        `, [randomUUID(), req.user.id, cohortId]);
      }
    }

    /* 4. profiles — mark onboarding complete */
    const existingProfile = await tx.queryOne(
      'SELECT user_id FROM profiles WHERE user_id = ?',
      [req.user.id]
    );

    if (existingProfile) {
      await tx.execute(
        `UPDATE profiles SET onboarding_completed = TRUE, updated_at = datetime('now') WHERE user_id = ?`,
        [req.user.id]
      );
    } else {
      await tx.execute(`
        INSERT INTO profiles (user_id, onboarding_completed) VALUES (?, TRUE)
      `, [req.user.id]);
    }

    /* 5. cleanup draft */
    await tx.execute(
      `DELETE FROM participant_data WHERE owner_id = ? AND data_type = ?`,
      [req.user.id, DRAFT_TYPE]
    );
  });

  return res.json({
    ok: true,
    nextStep: {
      path: '/cockpit',
      message: 'Ton parcours commence. L\'étape C est ouverte.',
    },
  });
});

export default router;
