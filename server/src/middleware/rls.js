/**
 * Row-Level Server Authorization
 *
 * Rules per resource type:
 * - owner_id tables   : participant sees only her own rows
 * - user_id tables    : same (alias)
 * - cohort-scoped     : participant must be enrolled in the cohort
 * - immutable tables  : no update/delete
 * - admin             : bypass all ownership checks, full read of pilot records
 * - TEST_QA           : same as participant, isolated by is_test flag on the DB row
 */

import { getDb, ROLES, IMMUTABLE_TABLES } from '../db.js';

/* ── Resource ownership map ──────────────────────────────────────
   Maps tableName → ownerColumn for automatic ownership checks.
   Tables not listed here use explicit route-level guards.
────────────────────────────────────────────────────────────────── */
const OWNER_COLUMN = {
  profiles:                  'user_id',
  user_progress:             'user_id',
  pilotage_state:            'user_id',
  project_passport:          'user_id',
  mission_submissions:       'user_id',
  proofs:                    'user_id',
  decisions:                 'user_id',
  parking_ideas:             'user_id',
  market_contacts:           'user_id',
  market_conversations:      'user_id',
  market_signals:            'user_id',
  weekly_reviews:            'user_id',
  prelabs:                   'user_id',
  frictions:                 'user_id',
  support_requests:          'user_id',
  elite_points:              'user_id',
  copilot_threads:           'user_id',
  copilot_messages:          'user_id',
  copilot_memory_snapshots:  'user_id',
  participant_data:          'owner_id',
};

/**
 * resolveOwner(tableName, recordId) → owner id or null if record not found.
 * Used by assertOwnership.
 */
export function resolveOwner(db, tableName, recordId) {
  const col = OWNER_COLUMN[tableName];
  if (!col) return null;
  const row = db.prepare(`SELECT ${col} FROM ${tableName} WHERE id = ?`).get(recordId);
  return row?.[col] ?? null;
}

/**
 * assertOwnership — throws 403 if user doesn't own the record.
 * Admin bypasses.
 */
export function assertOwnership(user, db, tableName, recordId) {
  if (user.role === ROLES.NOEMIE_ADMIN) return;

  const ownerId = resolveOwner(db, tableName, recordId);
  if (ownerId === null) {
    const err = new Error('Enregistrement introuvable');
    err.status = 404;
    throw err;
  }
  if (ownerId !== user.id) {
    const err = new Error('Accès refusé : données appartenant à une autre participante');
    err.status = 403;
    throw err;
  }
}

/**
 * assertEnrollment — user must be enrolled in the cohort.
 * Admin bypasses.
 */
export function assertEnrollment(user, db, cohortId) {
  if (user.role === ROLES.NOEMIE_ADMIN) return;

  const enrollment = db.prepare(
    `SELECT id FROM enrollments WHERE user_id = ? AND cohort_id = ? AND status = 'active'`
  ).get(user.id, cohortId);

  if (!enrollment) {
    const err = new Error('Accès refusé : non inscrite à cette cohorte');
    err.status = 403;
    throw err;
  }
}

/**
 * assertEliteAccess — user must be ELITE or admin.
 */
export function assertEliteAccess(user) {
  if (user.role === ROLES.NOEMIE_ADMIN) return;
  if (user.tier !== 'ELITE') {
    const err = new Error('Réservé aux participantes ELITE');
    err.status = 403;
    throw err;
  }
}

/**
 * assertImmutable — prevents UPDATE/DELETE on immutable tables.
 * Call before any such operation.
 */
export function assertImmutable(tableName) {
  if (IMMUTABLE_TABLES.includes(tableName)) {
    const err = new Error(`La table ${tableName} est immuable`);
    err.status = 409;
    throw err;
  }
}

/**
 * Express middleware wrapper: requireOwnershipOf(tableName)
 * Reads recordId from req.params.id
 */
export function requireOwnershipOf(tableName) {
  return (req, res, next) => {
    try {
      const db = getDb();
      assertOwnership(req.user, db, tableName, req.params.id);
      next();
    } catch (err) {
      res.status(err.status ?? 500).json({ error: err.message });
    }
  };
}

/**
 * Express middleware: requireEnrollmentIn(cohortIdParam)
 * cohortIdParam = name of the req.params key holding the cohort id
 */
export function requireEnrollmentIn(cohortIdParam = 'cohortId') {
  return (req, res, next) => {
    try {
      const db = getDb();
      assertEnrollment(req.user, db, req.params[cohortIdParam]);
      next();
    } catch (err) {
      res.status(err.status ?? 500).json({ error: err.message });
    }
  };
}
