/**
 * Admin Cockpit — Build 14
 * Priority-ordered participant overview + admin actions.
 * Every strategic override creates an audit_event.
 */
import { Router } from 'express';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, requireAdmin);

/* ── helpers ─────────────────────────────────────────────────────── */

function signalCeiling(signals) {
  const ORDER = ['politesse','probleme_exprime','comportement_passe',
                 'interet_solution','intention_commerciale','engagement'];
  let top = -1;
  for (const s of signals) {
    const idx = ORDER.indexOf(s.signal_type);
    if (idx > top) top = idx;
  }
  return top >= 0 ? ORDER[top] : null;
}

/* ── GET /api/admin/cockpit ──────────────────────────────────────── */
router.get('/cockpit', async (req, res) => {
  const db = getAdapter();
  const { cohort_id } = req.query;

  const users = cohort_id
    ? await db.queryAll(`
        SELECT u.id, u.first_name, u.email, u.tier, u.role,
               c.id AS cohort_id, c.name AS cohort_name,
               e.plan,
               up.cadre_step, up.sprint_number, up.week_in_sprint, up.gate_status,
               ps.current_priority, ps.next_action, ps.blocker, ps.not_priority_now
        FROM users u
        JOIN enrollments e ON e.user_id = u.id AND e.cohort_id = ?
        JOIN cohorts c ON c.id = e.cohort_id
        LEFT JOIN user_progress up ON up.user_id = u.id AND up.cohort_id = e.cohort_id
        LEFT JOIN pilotage_state ps ON ps.user_id = u.id
        WHERE u.role != 'NOEMIE_ADMIN'
        ORDER BY u.first_name
      `, [cohort_id])
    : await db.queryAll(`
        SELECT u.id, u.first_name, u.email, u.tier, u.role,
               c.id AS cohort_id, c.name AS cohort_name,
               e.plan,
               up.cadre_step, up.sprint_number, up.week_in_sprint, up.gate_status,
               ps.current_priority, ps.next_action, ps.blocker, ps.not_priority_now
        FROM users u
        JOIN enrollments e ON e.user_id = u.id
        JOIN cohorts c ON c.id = e.cohort_id
        LEFT JOIN user_progress up ON up.user_id = u.id AND up.cohort_id = e.cohort_id
        LEFT JOIN pilotage_state ps ON ps.user_id = u.id
        WHERE u.role != 'NOEMIE_ADMIN'
        ORDER BY u.first_name
      `, []);

  // Enrich each participant with pending gate status and pre-lab questions
  const enriched = await Promise.all(users.map(async u => {
    // Last deliverable (latest passed gate)
    const lastGate = await db.queryOne(`
      SELECT sprint_number, method, passed_at FROM sprint_gate_log
      WHERE user_id = ? ORDER BY passed_at DESC LIMIT 1
    `, [u.id]);

    // Pending pre-lab question (next lab for their cohort)
    const nextLab = await db.queryOne(`
      SELECT l.id, l.title, l.scheduled_at,
             lp.priority_question, lp.current_blocker, lp.is_late
      FROM lab_sessions l
      LEFT JOIN lab_prelab lp ON lp.lab_id = l.id AND lp.user_id = ?
      WHERE l.cohort_id = ? AND l.status IN ('upcoming','live')
      ORDER BY l.scheduled_at ASC LIMIT 1
    `, [u.id, u.cohort_id]);

    // Market signal ceiling
    const signals = await db.queryAll(
      `SELECT signal_type FROM market_signals WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [u.id]
    );
    const market_ceiling = signalCeiling(signals);

    // Last elite hot seat
    const lastHotSeat = u.tier === 'ELITE'
      ? await db.queryOne(`
          SELECT point_number, title, status, scheduled_at
          FROM elite_sessions WHERE user_id = ? AND status = 'done'
          ORDER BY scheduled_at DESC LIMIT 1
        `, [u.id])
      : null;

    // Gate status summary
    const gate = u.gate_status;
    const hasPrelab = nextLab ? await db.queryOne(
      `SELECT id FROM lab_prelab WHERE lab_id = ? AND user_id = ?`,
      [nextLab.id, u.id]
    ) : null;
    const segment = gate === 'ROUGE' ? 'ROUGE'
      : gate === 'ORANGE' ? 'ORANGE'
      : nextLab?.priority_question && !hasPrelab ? 'PRE_LABS'
      : u.tier === 'ELITE' ? 'ELITE'
      : 'OK';

    return {
      ...u,
      last_gate: lastGate ?? null,
      next_lab: nextLab ?? null,
      market_ceiling,
      last_hot_seat: lastHotSeat,
      segment,
    };
  }));

  // Priority sort: ROUGE → needs validation (gate passed but unreviewed) → ELITE → PRE_LABS → ORANGE → rest
  const ORDER = ['ROUGE','VALIDATION','ELITE','PRE_LABS','ORANGE','FRICTION','OK'];
  enriched.sort((a, b) => {
    const ai = ORDER.indexOf(a.segment);
    const bi = ORDER.indexOf(b.segment);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  res.json({ participants: enriched });
});

/* ── GET /api/admin/participant/:userId ──────────────────────────── */
router.get('/participant/:userId', async (req, res) => {
  const db = getAdapter();
  const { userId } = req.params;

  const user = await db.queryOne(`
    SELECT u.id, u.first_name, u.email, u.tier, u.role,
           up.cadre_step, up.sprint_number, up.week_in_sprint, up.gate_status,
           ps.current_priority, ps.next_action, ps.blocker,
           c.name AS cohort_name, e.plan
    FROM users u
    LEFT JOIN enrollments e ON e.user_id = u.id
    LEFT JOIN cohorts c ON c.id = e.cohort_id
    LEFT JOIN user_progress up ON up.user_id = u.id AND up.cohort_id = e.cohort_id
    LEFT JOIN pilotage_state ps ON ps.user_id = u.id
    WHERE u.id = ?
  `, [userId]);
  if (!user) return res.status(404).json({ error: 'Participant introuvable' });

  const decisions = await db.queryAll(
    `SELECT id, title, decision_type, status, created_at FROM decisions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );

  const gateLog = await db.queryAll(
    `SELECT * FROM sprint_gate_log WHERE user_id = ? ORDER BY passed_at DESC`,
    [userId]
  );

  const overrides = await db.queryAll(
    `SELECT * FROM gate_overrides WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );

  const frictions = await db.queryAll(
    `SELECT * FROM pilot_frictions WHERE user_id = ? ORDER BY reported_at DESC`,
    [userId]
  );

  const interventions = await db.queryAll(`
    SELECT ai.*, u.first_name AS actor_name
    FROM admin_interventions ai
    JOIN users u ON u.id = ai.actor_id
    WHERE ai.target_user_id = ? ORDER BY ai.created_at DESC
  `, [userId]);

  const prelabs = await db.queryAll(`
    SELECT lp.*, l.title AS lab_title, l.scheduled_at
    FROM lab_prelab lp
    JOIN lab_sessions l ON l.id = lp.lab_id
    WHERE lp.user_id = ? ORDER BY lp.submitted_at DESC LIMIT 5
  `, [userId]);

  res.json({ user, decisions, gateLog, overrides, frictions, interventions, prelabs });
});

/* ── POST /api/admin/gate-override ──────────────────────────────── */
router.post('/gate-override', async (req, res) => {
  const db = getAdapter();
  const { user_id, sprint_number, exception_type, reason } = req.body ?? {};

  if (!user_id || !sprint_number || !exception_type || !reason) {
    return res.status(400).json({ error: 'user_id, sprint_number, exception_type et reason requis' });
  }
  if (reason.trim().length < 10) {
    return res.status(400).json({ error: 'La raison doit faire au moins 10 caractères' });
  }
  if (!['VERT','ORANGE'].includes(exception_type)) {
    return res.status(400).json({ error: 'exception_type doit être VERT ou ORANGE' });
  }

  const sprintKey = String(sprint_number);
  const existing = await db.queryOne(
    `SELECT id FROM gate_overrides WHERE user_id = ? AND sprint_number = ?`,
    [user_id, sprintKey]
  );
  if (existing) {
    return res.status(409).json({ error: 'Un override existe déjà pour ce sprint' });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO gate_overrides (id, user_id, sprint_number, exception_type, reason, override_by)
    VALUES (?,?,?,?,?,?)
  `, [id, user_id, sprintKey, exception_type, reason.trim(), req.user.id]);

  await db.writeAudit({
    actorId: req.user.id,
    targetUserId: user_id,
    eventType: 'gate_override',
    tableName: 'gate_overrides',
    recordId: id,
    afterState: { sprint_number, exception_type, reason },
    reason: reason.trim(),
  });

  await db.notify({
    userId: user_id,
    type: 'mission_validated',
    title: `Mission validée — Sprint ${sprint_number}`,
    body: exception_type === 'VERT' ? 'Ta mission a été validée (VERT). Continue !' : 'Validation exceptionnelle enregistrée.',
  });
  return res.status(201).json(await db.queryOne(`SELECT * FROM gate_overrides WHERE id = ?`, [id]));
});

/* ── POST /api/admin/intervention ────────────────────────────────── */
router.post('/intervention', async (req, res) => {
  const db = getAdapter();
  const { target_user_id, type, note } = req.body ?? {};

  if (!target_user_id || !type) {
    return res.status(400).json({ error: 'target_user_id et type requis' });
  }

  const validTypes = ['gate_override','correction_request','support','note','elite_point'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type invalide — valeurs: ${validTypes.join(', ')}` });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO admin_interventions (id, actor_id, target_user_id, type, note)
    VALUES (?,?,?,?,?)
  `, [id, req.user.id, target_user_id, type, note ?? null]);

  await db.writeAudit({
    actorId: req.user.id,
    targetUserId: target_user_id,
    eventType: `admin_intervention_${type}`,
    tableName: 'admin_interventions',
    recordId: id,
    afterState: { type, note },
  });

  return res.status(201).json(await db.queryOne(`SELECT * FROM admin_interventions WHERE id = ?`, [id]));
});

/* ── POST /api/admin/correction-request ─────────────────────────── */
router.post('/correction-request', async (req, res) => {
  const db = getAdapter();
  const { target_user_id, note } = req.body ?? {};

  if (!target_user_id || !note?.trim()) {
    return res.status(400).json({ error: 'target_user_id et note requis' });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO admin_interventions (id, actor_id, target_user_id, type, note)
    VALUES (?,?,?,'correction_request',?)
  `, [id, req.user.id, target_user_id, note.trim()]);

  await db.writeAudit({
    actorId: req.user.id,
    targetUserId: target_user_id,
    eventType: 'admin_correction_request',
    tableName: 'admin_interventions',
    recordId: id,
    afterState: { note },
  });
  await db.notify({
    userId: target_user_id,
    type: 'correction_requested',
    title: 'Correction demandée',
    body: note.trim().slice(0, 120),
  });

  return res.status(201).json(await db.queryOne(`SELECT * FROM admin_interventions WHERE id = ?`, [id]));
});

/* ── GET /api/admin/frictions ────────────────────────────────────── */
router.get('/frictions', async (req, res) => {
  const db = getAdapter();
  const frictions = await db.queryAll(`
    SELECT pf.*, u.first_name, u.email
    FROM pilot_frictions pf
    JOIN users u ON u.id = pf.user_id
    WHERE pf.status != 'resolved'
    ORDER BY CASE pf.severity WHEN 'ROUGE' THEN 0 WHEN 'ORANGE' THEN 1 ELSE 2 END,
             pf.reported_at DESC
  `, []);
  res.json(frictions);
});

/* ── GET /api/admin/audit ────────────────────────────────────────── */
router.get('/audit', async (req, res) => {
  const db = getAdapter();
  const { user_id, limit = 50 } = req.query;

  const events = user_id
    ? await db.queryAll(`
        SELECT ae.*, u.first_name AS actor_name
        FROM audit_events ae
        LEFT JOIN users u ON u.id = ae.actor_id
        WHERE ae.target_user_id = ?
        ORDER BY ae.created_at DESC LIMIT ?
      `, [user_id, Number(limit)])
    : await db.queryAll(`
        SELECT ae.*, u.first_name AS actor_name
        FROM audit_events ae
        LEFT JOIN users u ON u.id = ae.actor_id
        ORDER BY ae.created_at DESC LIMIT ?
      `, [Number(limit)]);

  res.json(events);
});

/* ── GET /api/admin/sprint-content/:n ───────────────────────────────── */
router.get('/sprint-content/:n', async (req, res) => {
  const db = getAdapter();
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n < 1 || n > 12) return res.status(400).json({ error: 'Numéro de sprint invalide' });

  const { cohort_id } = req.query;
  const row = cohort_id
    ? await db.queryOne(`SELECT * FROM sprint_content WHERE sprint_number = ? AND cohort_id = ?`, [n, cohort_id])
    : await db.queryOne(`SELECT * FROM sprint_content WHERE sprint_number = ? AND cohort_id IS NULL`, [n]);

  res.json(row ?? null);
});

/* ── POST /api/admin/sprint-content/:n ──────────────────────────────── */
router.post('/sprint-content/:n', async (req, res) => {
  const db = getAdapter();
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n < 1 || n > 12) return res.status(400).json({ error: 'Numéro de sprint invalide' });

  const { cohort_id = null, result, understand, mission, support, deliverable, unlock_reason, video_url, audio_url } = req.body ?? {};

  const existing = cohort_id
    ? await db.queryOne(`SELECT id FROM sprint_content WHERE sprint_number = ? AND cohort_id = ?`, [n, cohort_id])
    : await db.queryOne(`SELECT id FROM sprint_content WHERE sprint_number = ? AND cohort_id IS NULL`, [n]);
  if (existing) return res.status(409).json({ error: 'Contenu déjà existant pour ce sprint — utiliser PATCH pour modifier' });

  const id = randomUUID();
  await db.execute(`
    INSERT INTO sprint_content (id, sprint_number, cohort_id, result, understand, mission, support, deliverable, unlock_reason, video_url, audio_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, n, cohort_id, result ?? null, understand ?? null, mission ?? null, support ?? null, deliverable ?? null, unlock_reason ?? null, video_url ?? null, audio_url ?? null]);

  await db.writeAudit({
    actorId: req.user.id,
    targetUserId: null,
    eventType: 'sprint_content_created',
    tableName: 'sprint_content',
    afterState: { sprint_number: n, cohort_id },
  });

  const row = await db.queryOne(`SELECT * FROM sprint_content WHERE id = ?`, [id]);
  return res.status(201).json(row);
});

/* ── PATCH /api/admin/sprint-content/:n ─────────────────────────────── */
router.patch('/sprint-content/:n', async (req, res) => {
  const db = getAdapter();
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n < 1 || n > 12) return res.status(400).json({ error: 'Numéro de sprint invalide' });

  const { cohort_id = null, ...fields } = req.body ?? {};
  const ALLOWED = ['result', 'understand', 'mission', 'support', 'deliverable', 'unlock_reason', 'video_url', 'audio_url'];
  const updates = Object.fromEntries(Object.entries(fields).filter(([k]) => ALLOWED.includes(k)));
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucun champ modifiable fourni' });

  const existing = cohort_id
    ? await db.queryOne(`SELECT id FROM sprint_content WHERE sprint_number = ? AND cohort_id = ?`, [n, cohort_id])
    : await db.queryOne(`SELECT id FROM sprint_content WHERE sprint_number = ? AND cohort_id IS NULL`, [n]);
  if (!existing) return res.status(404).json({ error: 'Contenu introuvable pour ce sprint' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  await db.execute(`UPDATE sprint_content SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`,
    [...Object.values(updates), existing.id]);

  await db.writeAudit({
    actorId: req.user.id,
    targetUserId: null,
    eventType: 'sprint_content_updated',
    tableName: 'sprint_content',
    afterState: { sprint_number: n, cohort_id, ...updates },
  });

  return res.json(await db.queryOne(`SELECT * FROM sprint_content WHERE id = ?`, [existing.id]));
});

/* ── POST /api/admin/missions ────────────────────────────────── */
router.post('/missions', async (req, res) => {
  const db = getAdapter();
  const {
    cohort_id = null,
    cadre_step,
    sprint_number = null,
    title,
    description = '',
    mission_type = 'action',
    is_required = 1,
    sort_order = 0,
  } = req.body ?? {};

  if (!cadre_step || !['C','A','D','R','E'].includes(cadre_step)) {
    return res.status(400).json({ error: 'cadre_step requis (C, A, D, R ou E)' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title requis' });
  }
  const validTypes = ['action','reflection','market','proof','deliverable'];
  if (!validTypes.includes(mission_type)) {
    return res.status(400).json({ error: `mission_type invalide — valeurs: ${validTypes.join(', ')}` });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, description, mission_type, is_required, sort_order, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, cohort_id, cadre_step, sprint_number, title.trim(), description ?? '', mission_type, is_required ? 1 : 0, sort_order, req.user.id]);

  await db.writeAudit({
    actorId: req.user.id,
    targetUserId: null,
    eventType: 'mission_created',
    tableName: 'missions',
    afterState: { id, title, cadre_step, sprint_number },
  });

  const mission = await db.queryOne(`SELECT * FROM missions WHERE id = ?`, [id]);
  return res.status(201).json(mission);
});

/* ── GET /api/admin/submissions ─────────────────────────────── */
router.get('/submissions', async (req, res) => {
  const db = getAdapter();
  const { status = 'submitted', cohort_id } = req.query;

  const submissions = cohort_id
    ? await db.queryAll(`
        SELECT ms.*, u.first_name, u.email,
               m.title AS mission_title, m.sprint_number, m.cadre_step
        FROM mission_submissions ms
        JOIN users u ON u.id = ms.user_id
        JOIN missions m ON m.id = ms.mission_id
        WHERE ms.status = ? AND ms.cohort_id = ?
        ORDER BY ms.created_at ASC
      `, [status, cohort_id])
    : await db.queryAll(`
        SELECT ms.*, u.first_name, u.email,
               m.title AS mission_title, m.sprint_number, m.cadre_step
        FROM mission_submissions ms
        JOIN users u ON u.id = ms.user_id
        JOIN missions m ON m.id = ms.mission_id
        WHERE ms.status = ?
        ORDER BY ms.created_at ASC
      `, [status]);

  res.json(submissions);
});

/* ── PATCH /api/admin/submissions/:id/review ─────────────────── */
router.patch('/submissions/:id/review', async (req, res) => {
  const db = getAdapter();
  const { id } = req.params;
  const { decision, note } = req.body ?? {};

  if (!decision || !['approved','rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision doit être approved ou rejected' });
  }

  const submission = await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [id]);
  if (!submission) return res.status(404).json({ error: 'Soumission introuvable' });

  await db.execute(`
    UPDATE mission_submissions
    SET status = ?, reviewer_note = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `, [decision, note ?? null, req.user.id, id]);

  const eventType = decision === 'approved' ? 'mission_validated' : 'mission_correction_requested';
  await db.writeAudit({
    actorId: req.user.id,
    targetUserId: submission.user_id,
    eventType,
    tableName: 'mission_submissions',
    afterState: { submission_id: id, decision, note },
  });

  return res.json(await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [id]));
});

/* ── POST /api/admin/generate-reset-link ────────────────────────── */
router.post('/generate-reset-link', async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'email requis' });

  const db = getAdapter();
  const user = await db.queryOne(
    `SELECT id, email, first_name FROM users WHERE email = ? COLLATE NOCASE AND role != 'NOEMIE_ADMIN'`,
    [email.trim()]
  );

  if (!user) return res.status(404).json({ error: 'Aucun compte participant trouvé pour cet email' });

  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + 2 * 3_600_000)
    .toISOString().replace('T', ' ').slice(0, 19);

  await db.execute(
    "UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
    [user.id]
  );
  await db.execute(
    `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [user.id, hash, expiresAt]
  );

  await db.writeAudit({
    actorId: req.user.id,
    eventType: 'password_reset_requested',
    targetUserId: user.id,
    tableName: 'password_resets',
    afterState: { triggered_by_admin: true, expires_at: expiresAt },
  });

  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  return res.json({
    email: user.email,
    first_name: user.first_name,
    reset_url: `${baseUrl}/reset-password?token=${raw}`,
    expires_at: expiresAt,
  });
});

/* ── GET /api/admin/cohorts ──────────────────────────────────────── */
router.get('/cohorts', async (req, res) => {
  const db = getAdapter();
  const cohorts = await db.queryAll(
    `SELECT id, name, start_date, end_date, status FROM cohorts ORDER BY start_date DESC`,
    []
  );
  res.json(cohorts);
});

export default router;
