import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { verifyPassword, hashPassword, signToken, cookieOptions } from '../auth.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';
import { isTestForbidden } from '../config/env.js';
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

  const db = getAdapter();
  const user = await db.queryOne(
    'SELECT * FROM users WHERE email = ? COLLATE NOCASE',
    [email.trim()]
  );

  if (!user) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  if (isTestForbidden() && user.is_test) {
    return res.status(403).json({ error: 'Comptes de test non autorisés en pilot/production' });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  await db.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", [user.id]);

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

  const db = getAdapter();
  const user = await db.queryOne(
    'SELECT id FROM users WHERE email = ? COLLATE NOCASE',
    [email.trim()]
  );

  if (!user) return res.json({ message: GENERIC_RESET_MSG });

  const raw = generateToken();
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + RESET_EXPIRES_HOURS * 3_600_000)
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
    actorId: user.id,
    eventType: 'password_reset_requested',
    targetUserId: user.id,
    tableName: 'password_resets',
    afterState: { expires_at: expiresAt },
  });

  return res.json({ message: GENERIC_RESET_MSG });
});

/* ── GET /auth/reset-check?token=... ─────────────────────────── */
router.get('/reset-check', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token manquant' });

  const db = getAdapter();
  const hash = hashToken(token);
  const reset = await db.queryOne(`
    SELECT pr.id, pr.expires_at, pr.used_at, u.email, u.first_name
    FROM password_resets pr
    JOIN users u ON u.id = pr.user_id
    WHERE pr.token_hash = ?
  `, [hash]);

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

  const db = getAdapter();
  const hash = hashToken(token);

  /* Initial read — fail fast on obviously invalid tokens before acquiring any lock */
  const reset = await db.queryOne('SELECT * FROM password_resets WHERE token_hash = ?', [hash]);
  if (!reset) return res.status(404).json({ error: 'Lien invalide' });
  if (reset.used_at) return res.status(409).json({ error: 'Ce lien a déjà été utilisé' });
  if (new Date(reset.expires_at + 'Z') < new Date()) return res.status(410).json({ error: 'Ce lien a expiré' });

  const passwordHash = await hashPassword(password);
  let alreadyConsumed = false;

  try {
    await db.transaction(async tx => {
      /* Atomic consumption: UPDATE only if still unused. In PG this row-locks the record,
       * so a concurrent request blocks until this transaction commits, then finds used_at SET
       * and the subsequent SELECT returns nothing, causing a controlled 409. */
      await tx.execute(
        "UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL",
        [hash]
      );
      /* Verify OUR transaction consumed the token (SELECT sees our own write inside the tx) */
      const consumed = await tx.queryOne(
        'SELECT id FROM password_resets WHERE token_hash = ? AND used_at IS NOT NULL',
        [hash]
      );
      if (!consumed) {
        alreadyConsumed = true;
        throw new Error('TOKEN_ALREADY_CONSUMED');
      }
      await tx.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, reset.user_id]);
      await tx.writeAudit({
        actorId: reset.user_id,
        eventType: 'password_reset_completed',
        targetUserId: reset.user_id,
        tableName: 'password_resets',
        afterState: { reset_id: reset.id },
      });
    });
  } catch (err) {
    if (alreadyConsumed) {
      return res.status(409).json({ error: 'Ce lien a déjà été utilisé' });
    }
    throw err;
  }

  return res.json({ ok: true });
});

export default router;
