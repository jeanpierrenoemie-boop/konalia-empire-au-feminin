import { verifyToken } from '../auth.js';
import { getAdapter } from '../db/adapter.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.rc_session;
  if (!token) return res.status(401).json({ error: 'Non authentifiée' });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  const db = getAdapter();
  const user = await db.queryOne(
    'SELECT id, email, role, tier, first_name, cohort_id, is_test FROM users WHERE id = ?',
    [payload.sub]
  );

  if (!user) return res.status(401).json({ error: 'Utilisatrice introuvable' });

  req.user = user;
  next();
}
