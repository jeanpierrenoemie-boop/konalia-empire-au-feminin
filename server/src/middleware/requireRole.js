import { ROLES } from '../db.js';
import { isTestForbidden } from '../config/env.js';

/**
 * requireRole(...roles) — server-side role enforcement.
 * Must be used AFTER requireAuth.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifiée' });

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}

export function requireElite(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifiée' });
  if (req.user.tier !== 'ELITE' && req.user.role !== ROLES.NOEMIE_ADMIN) {
    return res.status(403).json({ error: 'Réservé aux participantes ELITE' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifiée' });
  if (req.user.role !== ROLES.NOEMIE_ADMIN) {
    return res.status(403).json({ error: 'Accès réservé à l\'administration' });
  }
  next();
}

export function denyTestInProduction(req, res, next) {
  if (isTestForbidden() && req.user?.is_test) {
    return res.status(403).json({ error: 'Comptes de test non autorisés en pilot/production' });
  }
  next();
}
