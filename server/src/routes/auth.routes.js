import { Router } from 'express';
import { getDb } from '../db.js';
import { verifyPassword, signToken, cookieOptions } from '../auth.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();

router.post('/login', async (req, res) => {
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

  const token = signToken({
    sub: user.id,
    role: user.role,
    tier: user.tier,
    is_test: user.is_test,
  });

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

router.post('/logout', (req, res) => {
  res.clearCookie('rc_session', { path: '/' });
  return res.json({ ok: true });
});

router.get('/me', requireAuth, denyTestInProduction, (req, res) => {
  const { id, email, role, tier, first_name, cohort_id, is_test } = req.user;
  return res.json({ id, email, role, tier, first_name, cohort_id, is_test: Boolean(is_test) });
});

export default router;
