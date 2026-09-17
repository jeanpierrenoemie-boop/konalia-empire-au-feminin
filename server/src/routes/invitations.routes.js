/**
 * Invitations — Build 18C
 * Admin creates pilot invitations; participant activates via secure token.
 */
import { Router } from 'express';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { getDb, writeAudit } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireRole.js';
import { hashPassword } from '../auth.js';

const router = Router();

const TOKEN_TTL_HOURS = 72;

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

function generateToken() {
  return randomBytes(32).toString('hex'); /* 64 hex chars — never stored raw */
}

function expiresAt() {
  const d = new Date();
  d.setHours(d.getHours() + TOKEN_TTL_HOURS);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function activationUrl(token) {
  const base = (process.env.APP_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/activate?token=${token}`;
}

/* ── POST /api/invitations (admin) ──────────────────────────────── */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { first_name, last_name = '', email, cohort_id, plan } = req.body ?? {};

  if (!first_name?.trim()) return res.status(400).json({ error: 'first_name requis' });
  if (!email?.trim())      return res.status(400).json({ error: 'email requis' });
  if (!cohort_id)          return res.status(400).json({ error: 'cohort_id requis' });
  if (!['STARTER','ELITE'].includes(plan)) {
    return res.status(400).json({ error: 'plan doit être STARTER ou ELITE' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }

  const db = getDb();

  const cohort = db.prepare(`SELECT id FROM cohorts WHERE id = ?`).get(cohort_id);
  if (!cohort) return res.status(400).json({ error: 'Cohorte introuvable' });

  /* Email already taken by an active account */
  const existing = db.prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`).get(email.trim());
  if (existing) return res.status(409).json({ error: 'Un compte avec cet email existe déjà' });

  /* Cancel any pending invitation for this email */
  db.prepare(`UPDATE invitations SET status = 'revoked', updated_at = datetime('now') WHERE email = ? COLLATE NOCASE AND status = 'pending'`)
    .run(email.trim());

  const raw   = generateToken();
  const hash  = hashToken(raw);
  const id    = randomUUID();
  const exp   = expiresAt();

  db.prepare(`
    INSERT INTO invitations (id, email, first_name, last_name, cohort_id, plan, token_hash, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, email.trim().toLowerCase(), first_name.trim(), last_name.trim(), cohort_id, plan, hash, exp, req.user.id);

  writeAudit(db, {
    actorId: req.user.id,
    targetUserId: null,
    eventType: 'participant_invited',
    tableName: 'invitations',
    afterState: { invitation_id: id, email: email.trim(), plan, cohort_id },
  });

  const invitation = db.prepare(`SELECT * FROM invitations WHERE id = ?`).get(id);

  res.status(201).json({
    ...invitation,
    token_hash: undefined,          /* never expose */
    activation_url: activationUrl(raw), /* shown once */
  });
});

/* ── GET /api/invitations (admin) ───────────────────────────────── */
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { cohort_id, status } = req.query;

  /* Auto-expire pending invitations past their expiry date */
  db.prepare(`
    UPDATE invitations SET status = 'expired', updated_at = datetime('now')
    WHERE status = 'pending' AND expires_at < datetime('now')
  `).run();

  let sql = `
    SELECT i.id, i.email, i.first_name, i.last_name, i.cohort_id, i.plan,
           i.status, i.expires_at, i.activated_at, i.created_at,
           c.name AS cohort_name
    FROM invitations i
    LEFT JOIN cohorts c ON c.id = i.cohort_id
    WHERE 1=1
  `;
  const params = [];
  if (cohort_id) { sql += ` AND i.cohort_id = ?`; params.push(cohort_id); }
  if (status)    { sql += ` AND i.status = ?`;    params.push(status); }
  sql += ` ORDER BY i.created_at DESC`;

  res.json(db.prepare(sql).all(...params));
});

/* ── POST /api/invitations/:id/regenerate (admin) ───────────────── */
router.post('/:id/regenerate', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const inv = db.prepare(`SELECT * FROM invitations WHERE id = ?`).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invitation introuvable' });
  if (inv.status === 'activated') return res.status(409).json({ error: 'Invitation déjà activée' });

  const raw  = generateToken();
  const hash = hashToken(raw);
  const exp  = expiresAt();

  db.prepare(`
    UPDATE invitations SET token_hash = ?, status = 'pending', expires_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(hash, exp, inv.id);

  writeAudit(db, {
    actorId: req.user.id,
    targetUserId: null,
    eventType: 'invitation_regenerated',
    tableName: 'invitations',
    afterState: { invitation_id: inv.id, email: inv.email },
  });

  const updated = db.prepare(`SELECT * FROM invitations WHERE id = ?`).get(inv.id);
  res.json({ ...updated, token_hash: undefined, activation_url: activationUrl(raw) });
});

/* ── GET /api/invitations/check?token=xxx (public) ─────────────── */
router.get('/check', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token manquant' });

  const db = getDb();
  const hash = hashToken(token);

  /* Auto-expire first */
  db.prepare(`UPDATE invitations SET status='expired', updated_at=datetime('now') WHERE status='pending' AND expires_at < datetime('now')`).run();

  const inv = db.prepare(`SELECT * FROM invitations WHERE token_hash = ?`).get(hash);

  if (!inv)                     return res.status(404).json({ error: 'Invitation introuvable' });
  if (inv.status === 'activated') return res.status(409).json({ error: 'Invitation déjà utilisée' });
  if (inv.status !== 'pending') return res.status(410).json({ error: 'Invitation expirée ou révoquée' });

  /* Return invitation metadata (no sensitive fields) */
  res.json({
    valid: true,
    first_name: inv.first_name,
    last_name:  inv.last_name,
    email:      inv.email,
    plan:       inv.plan,
    cohort_id:  inv.cohort_id,
    expires_at: inv.expires_at,
  });
});

/* ── POST /api/invitations/activate (public) ────────────────────── */
router.post('/activate', async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token)    return res.status(400).json({ error: 'Token requis' });
  if (!password) return res.status(400).json({ error: 'Mot de passe requis' });
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  }

  const db = getDb();
  const hash = hashToken(token);

  db.prepare(`UPDATE invitations SET status='expired', updated_at=datetime('now') WHERE status='pending' AND expires_at < datetime('now')`).run();

  const inv = db.prepare(`SELECT * FROM invitations WHERE token_hash = ?`).get(hash);
  if (!inv)                       return res.status(404).json({ error: 'Invitation introuvable' });
  if (inv.status === 'activated') return res.status(409).json({ error: 'Invitation déjà utilisée' });
  if (inv.status !== 'pending')   return res.status(410).json({ error: 'Invitation expirée ou révoquée' });

  /* Double-check email not taken (race condition guard) */
  const taken = db.prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`).get(inv.email);
  if (taken) return res.status(409).json({ error: 'Un compte avec cet email existe déjà' });

  const passwordHash = await hashPassword(password);
  const userId = randomUUID();
  const role = inv.plan === 'ELITE' ? 'PARTICIPANTE_ELITE' : 'PARTICIPANTE_STARTER';
  const tier = inv.plan;

  db.transaction(() => {
    /* Create user account */
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, tier, first_name, cohort_id, is_test)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(userId, inv.email, passwordHash, role, tier, inv.first_name, inv.cohort_id);

    /* Create enrollment */
    db.prepare(`
      INSERT INTO enrollments (id, user_id, cohort_id, plan, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(randomUUID(), userId, inv.cohort_id, inv.plan);

    /* Initialize progression at sprint 1 */
    db.prepare(`
      INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at)
      VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))
    `).run(randomUUID(), userId, inv.cohort_id);

    /* Mark invitation as activated */
    db.prepare(`
      UPDATE invitations SET status = 'activated', activated_at = datetime('now'), user_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(userId, inv.id);

    writeAudit(db, {
      actorId: userId,
      targetUserId: userId,
      eventType: 'participant_activated',
      tableName: 'invitations',
      afterState: { invitation_id: inv.id, plan: inv.plan, cohort_id: inv.cohort_id },
    });
  })();

  res.json({ ok: true, email: inv.email });
});

export default router;
