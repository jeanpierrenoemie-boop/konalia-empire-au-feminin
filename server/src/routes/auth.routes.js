import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';
import { getDb, writeAudit } from '../db.js';
import { verifyPassword, hashPassword, signToken, cookieOptions } from '../auth.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';
import { loginLimiter, resetLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const RESET_EXPIRES_HOURS = 2;
const GENERIC_RESET_MSG = "Si un compte correspond à cette adresse, un lien de réinitialisation a été généré.";

function hashToken(raw) { return createHash('sha256').update(raw).digest('hex'); }
function generateToken() { return randomBytes(32).toString('hex'); }

/* ── POST /auth/login ─────────────────────────────────────────── */
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  const db = getDb();
  const user = db.prepare(
    'SELECT * FROM users WHERE email = ? COLLATE NOCASE'
  ).get(email.trim());

  if (!user) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  if (process.env.NODE_ENV === 'production' && user.is_test) {
    return res.status(403).json({ error: 'Comptes de test non autorisés en production' });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  const token = signToken({ sub: user.id });

  res.cookie('rc_session', token, cookieOptions());

  return res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    tier: user.tier,
    first_name: user.first_name,
    cohort_id: user.cohort_id,
    is_test: Boolean(user.is_test),
  });
});

/* ── POST /auth/logout ───────────────────────────────────────── */
router.post('/logout', (req, res) => {
  res.clearCookie('rc_session', { path: '/' });
  return res.json({ ok: true });
});

/* ── GET /auth/me ────────────────────────────────────────────── */
router.get('/me', requireAuth, denyTestInProduction, (req, res) => {
  const { id, email, role, tier, first_name, cohort_id, is_test } = req.user;
  return res.json({ id, email, role, tier, first_name, cohort_id, is_test: Boolean(is_test) });
});

/* ── POST /auth/request-reset ────────────────────────────────── */
router.post('/request-reset', resetLimiter, async (req, res) => {
  const { email } = req.body ?? {};

  if (!email || typeof email !== 'string') {
    return res.json({ message: GENERIC_RESET_MSG });
  }

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());

  if (!user) return res.json({ message: GENERIC_RESET_MSG });

  const raw = generateToken();
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + RESET_EXPIRES_HOURS * 3_600_000)
    .toISOString().replace('T', ' ').slice(0, 19);

  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL")
    .run(user.id);

  db.prepare(
    `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
  ).run(user.id, hash, expiresAt);

  writeAudit(db, {
    actorId: user.id,
    eventType: 'password_reset_requested',
    targetUserId: user.id,
    tableName: 'password_resets',
    afterState: { expires_at: expiresAt },
  });

  return res.json({ message: GENERIC_RESET_MSG });
});

/* ── GET /auth/reset-check?token=... ─────────────────────────── */
router.get('/reset-check', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token manquant' });

  const db = getDb();
  const hash = hashToken(token);
  const reset = db.prepare(`
    SELECT pr.id, pr.expires_at, pr.used_at, u.email, u.first_name
    FROM password_resets pr
    JOIN users u ON u.id = pr.user_id
    WHERE pr.token_hash = ?
  `).get(hash);

  if (!reset) return res.status(404).json({ error: 'Lien invalide ou expiré' });
  if (reset.used_at) return res.status(409).json({ error: 'Ce lien a déjà été utilisé' });
  if (new Date(reset.expires_at + 'Z') < new Date()) return res.status(410).json({ error: 'Ce lien a expiré' });

  return res.json({ valid: true, email: reset.email, first_name: reset.first_name });
});

/* ── POST /auth/reset-password ──────────────────────────────── */
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body ?? {};

  if (!token || !password) {
    return res.status(400).json({ error: 'Token et mot de passe requis' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  }

  const db = getDb();
  const hash = hashToken(token);
  const reset = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hash);

  if (!reset) return res.status(404).json({ error: 'Lien invalide' });
  if (reset.used_at) return res.status(409).json({ error: 'Ce lien a déjà été utilisé' });
  if (new Date(reset.expires_at + 'Z') < new Date()) return res.status(410).json({ error: 'Ce lien a expiré' });

  const passwordHash = await hashPassword(password);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, reset.user_id);
  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ?").run(hash);

  writeAudit(db, {
    actorId: reset.user_id,
    eventType: 'password_reset_completed',
    targetUserId: reset.user_id,
    tableName: 'password_resets',
    afterState: { reset_id: reset.id },
  });

  return res.json({ ok: true });
});

export default router;
