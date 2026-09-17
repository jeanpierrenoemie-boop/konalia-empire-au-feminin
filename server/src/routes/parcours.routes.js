import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SPRINTS, CADRE_PHASES } from '../curriculum.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  /* Active enrollment */
  const enrollment = db.prepare(`
    SELECT e.cohort_id FROM enrollments e
    WHERE e.user_id = ? ORDER BY e.enrolled_at DESC LIMIT 1
  `).get(userId);

  /* Current sprint progress (single row per user) */
  const currentProgress = db.prepare(`
    SELECT sprint_number, gate_status, week_in_sprint, unlocked_at
    FROM user_progress WHERE user_id = ? LIMIT 1
  `).get(userId);

  /* All passed sprints from gate log */
  const passedRows = db.prepare(`
    SELECT sprint_number, passed_at, method FROM sprint_gate_log WHERE user_id = ?
  `).all(userId);

  const passedMap = {};
  for (const row of passedRows) passedMap[row.sprint_number] = row;

  /* Determine effective state for each sprint */
  const sprints = SPRINTS.map(sprint => {
    const passed = passedMap[sprint.number];
    const isCurrent = currentProgress?.sprint_number === sprint.number;

    let state;
    if (passed) {
      state = 'passed'; // never re-locked once passed
    } else if (isCurrent) {
      state = currentProgress.gate_status;
    } else {
      state = 'locked';
    }

    return {
      number: sprint.number,
      cadre_step: sprint.cadre_step,
      title: sprint.title,
      result: sprint.result,
      understand: sprint.understand,
      mission: sprint.mission,
      support: sprint.support,
      deliverable: sprint.deliverable,
      unlock_reason: sprint.unlock_reason,
      state,
      week_in_sprint: isCurrent ? (currentProgress.week_in_sprint ?? null) : null,
      unlocked_at: passed?.passed_at ?? (isCurrent ? currentProgress.unlocked_at : null) ?? null,
    };
  });

  /* Current active sprint (first non-passed, non-locked) */
  const currentSprint = sprints.find(s => s.state === 'in_progress' || s.state === 'submitted')
    ?? sprints.find(s => s.state !== 'locked' && s.state !== 'passed')
    ?? null;

  /* Phases with completion counts */
  const phases = CADRE_PHASES.map(phase => {
    const phaseSpints = sprints.filter(s => s.cadre_step === phase.step);
    const passed = phaseSpints.filter(s => s.state === 'passed').length;
    const total = phaseSpints.length;
    const active = phaseSpints.some(s => s.state === 'in_progress' || s.state === 'submitted');
    const phaseState = passed === total ? 'done' : active ? 'active' : passed > 0 ? 'active' : 'upcoming';
    return {
      step: phase.step,
      label: phase.label,
      sprint_numbers: phase.sprints,
      passed_count: passed,
      total_count: total,
      state: phaseState,
    };
  });

  res.json({
    phases,
    sprints,
    currentSprintNumber: currentSprint?.number ?? null,
    cohortId: enrollment?.cohort_id ?? null,
  });
});

export default router;
