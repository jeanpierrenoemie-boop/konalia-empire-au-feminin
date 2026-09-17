import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb, writeAudit } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireRole.js';
import { SPRINTS, CADRE_PHASES } from '../curriculum.js';
import { evaluateGate } from '../gates.js';

const router = Router();

/* ── GET /api/parcours ──────────────────────────────────────── */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const enrollment = db.prepare(`
    SELECT e.cohort_id FROM enrollments e
    WHERE e.user_id = ? ORDER BY e.enrolled_at DESC LIMIT 1
  `).get(userId);

  const currentProgress = db.prepare(`
    SELECT sprint_number, gate_status, week_in_sprint, unlocked_at
    FROM user_progress WHERE user_id = ? LIMIT 1
  `).get(userId);

  const passedRows = db.prepare(`
    SELECT sprint_number, passed_at, method FROM sprint_gate_log WHERE user_id = ?
  `).all(userId);

  const passedMap = {};
  for (const row of passedRows) passedMap[row.sprint_number] = row;

  /* Sprint content: cohort-specific rows take priority over global (cohort_id IS NULL) */
  const cohortId = enrollment?.cohort_id ?? null;
  const contentRows = db.prepare(`
    SELECT sprint_number, result, understand, mission, support, deliverable, unlock_reason,
           cohort_id IS NULL AS is_global
    FROM sprint_content
    WHERE cohort_id = ? OR cohort_id IS NULL
    ORDER BY sprint_number, is_global ASC
  `).all(cohortId ?? null);
  const contentMap = {};
  for (const row of contentRows) {
    /* First seen wins per sprint_number (cohort-specific = is_global=0 sorts first) */
    if (!contentMap[row.sprint_number]) contentMap[row.sprint_number] = row;
  }

  const sprints = SPRINTS.map(sprint => {
    const passed = passedMap[sprint.number];
    const isCurrent = currentProgress?.sprint_number === sprint.number;

    let state;
    if (passed) {
      state = 'passed';
    } else if (isCurrent) {
      state = currentProgress.gate_status;
    } else {
      state = 'locked';
    }

    /* Evaluate gate for the NEXT sprint that would be unlocked by completing this one */
    let gate = null;
    if (isCurrent) {
      gate = evaluateGate(db, userId, sprint.number + 1 <= 12 ? sprint.number + 1 : 'final');
    }

    const content = contentMap[sprint.number];

    return {
      number: sprint.number,
      cadre_step: sprint.cadre_step,
      title: sprint.title,
      result: content?.result ?? sprint.result,
      understand: content?.understand ?? sprint.understand,
      mission: content?.mission ?? sprint.mission,
      support: content?.support ?? sprint.support,
      deliverable: content?.deliverable ?? sprint.deliverable,
      unlock_reason: content?.unlock_reason ?? sprint.unlock_reason,
      state,
      week_in_sprint: isCurrent ? (currentProgress.week_in_sprint ?? null) : null,
      unlocked_at: passed?.passed_at ?? (isCurrent ? currentProgress.unlocked_at : null) ?? null,
      gate,
    };
  });

  const currentSprint = sprints.find(s => s.state === 'in_progress' || s.state === 'submitted')
    ?? sprints.find(s => s.state !== 'locked' && s.state !== 'passed')
    ?? null;

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

/* ── POST /api/parcours/gate/:n/pass ────────────────────────── */
/* Participant self-validates when gate is VERT */
router.post('/gate/:n/pass', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const sprintNumber = parseInt(req.params.n, 10);

  if (isNaN(sprintNumber) || sprintNumber < 1 || sprintNumber > 12) {
    return res.status(400).json({ error: 'Numéro de sprint invalide' });
  }

  const progress = db.prepare(`SELECT * FROM user_progress WHERE user_id = ? LIMIT 1`).get(userId);
  if (!progress) return res.status(400).json({ error: 'Aucune progression trouvée' });
  if (progress.sprint_number !== sprintNumber) {
    return res.status(400).json({ error: 'Ce sprint n\'est pas le sprint actif' });
  }

  /* Already passed? */
  const alreadyPassed = db.prepare(`
    SELECT 1 FROM sprint_gate_log WHERE user_id = ? AND sprint_number = ?
  `).get(userId, sprintNumber);
  if (alreadyPassed) return res.status(409).json({ error: 'Sprint déjà validé' });

  /* Evaluate gate for the next sprint */
  const nextSprint = sprintNumber < 12 ? sprintNumber + 1 : 'final';
  const gate = evaluateGate(db, userId, nextSprint);
  if (!gate) return res.status(400).json({ error: 'Aucune porte à valider pour ce sprint' });

  if (gate.status === 'ROUGE') {
    return res.status(422).json({
      error: 'Conditions de validation non remplies',
      gate,
    });
  }

  /* VERT or ORANGE (admin-overridden) → pass */
  const cohort = db.prepare(`
    SELECT cohort_id FROM enrollments WHERE user_id = ? ORDER BY enrolled_at DESC LIMIT 1
  `).get(userId);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO sprint_gate_log (id, user_id, cohort_id, sprint_number, cadre_step, passed_by, method)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), userId, cohort?.cohort_id ?? null,
      sprintNumber, progress.cadre_step, userId, 'self'
    );

    if (sprintNumber < 12) {
      const nextSprintData = SPRINTS.find(s => s.number === sprintNumber + 1);
      db.prepare(`
        UPDATE user_progress SET sprint_number = ?, cadre_step = ?, gate_status = 'in_progress',
          week_in_sprint = 1, unlocked_at = datetime('now'), updated_at = datetime('now')
        WHERE user_id = ?
      `).run(sprintNumber + 1, nextSprintData?.cadre_step ?? progress.cadre_step, userId);
    } else {
      db.prepare(`
        UPDATE user_progress SET gate_status = 'passed', gate_passed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE user_id = ?
      `).run(userId);
    }

    writeAudit(db, {
      actorId: userId,
      targetUserId: userId,
      eventType: 'gate_manual_pass',
      tableName: 'sprint_gate_log',
      afterState: { sprint_number: sprintNumber, method: 'self', gate_status: gate.status },
    });
  })();

  res.json({ ok: true, passedSprint: sprintNumber, nextSprint: sprintNumber < 12 ? sprintNumber + 1 : null });
});

/* ── POST /api/parcours/gate/:n/override ────────────────────── */
/* Admin-only manual override with mandatory reason */
router.post('/gate/:n/override', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const adminId = req.user.id;
  const sprintNumber = parseInt(req.params.n, 10);

  if (isNaN(sprintNumber) || sprintNumber < 1 || sprintNumber > 12) {
    return res.status(400).json({ error: 'Numéro de sprint invalide' });
  }

  const { target_user_id, reason, exception_type = 'VERT' } = req.body;
  if (!target_user_id) return res.status(400).json({ error: 'target_user_id requis' });
  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({ error: 'Une raison détaillée est obligatoire (min 10 caractères)' });
  }
  if (!['VERT', 'ORANGE'].includes(exception_type)) {
    return res.status(400).json({ error: 'exception_type doit être VERT ou ORANGE' });
  }

  const targetUser = db.prepare(`SELECT id FROM users WHERE id = ?`).get(target_user_id);
  if (!targetUser) return res.status(404).json({ error: 'Utilisatrice introuvable' });

  const progress = db.prepare(`SELECT * FROM user_progress WHERE user_id = ? LIMIT 1`).get(target_user_id);
  if (!progress) return res.status(400).json({ error: 'Aucune progression trouvée pour cette utilisatrice' });

  const alreadyPassed = db.prepare(`
    SELECT 1 FROM sprint_gate_log WHERE user_id = ? AND sprint_number = ?
  `).get(target_user_id, sprintNumber);
  if (alreadyPassed) return res.status(409).json({ error: 'Sprint déjà validé' });

  const cohort = db.prepare(`
    SELECT cohort_id FROM enrollments WHERE user_id = ? ORDER BY enrolled_at DESC LIMIT 1
  `).get(target_user_id);

  db.transaction(() => {
    /* Record override (idempotent — UNIQUE constraint) */
    db.prepare(`
      INSERT OR REPLACE INTO gate_overrides (id, user_id, sprint_number, override_by, reason, exception_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), target_user_id, sprintNumber, adminId, reason.trim(), exception_type);

    /* Pass the gate */
    db.prepare(`
      INSERT OR IGNORE INTO sprint_gate_log (id, user_id, cohort_id, sprint_number, cadre_step, passed_by, method)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), target_user_id, cohort?.cohort_id ?? null,
      sprintNumber, progress.cadre_step, adminId, 'admin_override'
    );

    if (progress.sprint_number === sprintNumber && sprintNumber < 12) {
      const nextSprintData = SPRINTS.find(s => s.number === sprintNumber + 1);
      db.prepare(`
        UPDATE user_progress SET sprint_number = ?, cadre_step = ?, gate_status = 'in_progress',
          week_in_sprint = 1, unlocked_at = datetime('now'), updated_at = datetime('now')
        WHERE user_id = ?
      `).run(sprintNumber + 1, nextSprintData?.cadre_step ?? progress.cadre_step, target_user_id);
    }

    writeAudit(db, {
      actorId: adminId,
      targetUserId: target_user_id,
      eventType: 'gate_manual_pass',
      tableName: 'gate_overrides',
      afterState: { sprint_number: sprintNumber, exception_type, reason: reason.trim() },
      reason: reason.trim(),
    });
  })();

  res.json({ ok: true, overriddenSprint: sprintNumber, exception_type });
});

export default router;
