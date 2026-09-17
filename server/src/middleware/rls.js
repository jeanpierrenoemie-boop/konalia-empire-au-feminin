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
 *
 * Build 20: assertOwnership, assertEnrollment, resolveOwner support both
 * a raw better-sqlite3 db (sync, tests) and an async adapter (routes).
 */

import { ROLES, IMMUTABLE_TABLES } from '../db.js';
import { getAdapter } from '../db/adapter.js';

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

function _isRawSQLite(db) {
  return typeof db.prepare === 'function' && typeof db.queryOne !== 'function';
}

/**
 * resolveOwner — returns the owner id of a record, or null if not found.
 * Sync when db is raw SQLite (tests), async when db is an adapter (routes).
 */
export function resolveOwner(db, tableName, recordId) {
  const col = OWNER_COLUMN[tableName];
  if (!col) return null;
  const sql = `SELECT ${col} FROM ${tableName} WHERE id = ?`;

  if (_isRawSQLite(db)) {
    const row = db.prepare(sql).get(recordId);
    return row?.[col] ?? null;
  }
  return db.queryOne(sql, [recordId]).then(row => row?.[col] ?? null);
}

/**
 * assertOwnership — throws 403/404 if user doesn't own the record.
 * Admin bypasses. Sync for raw SQLite db, async for adapter.
 */
export function assertOwnership(user, db, tableName, recordId) {
  if (user.role === ROLES.NOEMIE_ADMIN) return Promise.resolve();

  if (_isRawSQLite(db)) {
    const ownerId = resolveOwner(db, tableName, recordId);
    if (ownerId === null) {
      const err = new Error('Enregistrement introuvable'); err.status = 404; throw err;
    }
    if (ownerId !== user.id) {
      const err = new Error('Accès refusé : données appartenant à une autre participante'); err.status = 403; throw err;
    }
    return;
  }

  return resolveOwner(db, tableName, recordId).then(ownerId => {
    if (ownerId === null) {
      const err = new Error('Enregistrement introuvable'); err.status = 404; throw err;
    }
    if (ownerId !== user.id) {
      const err = new Error('Accès refusé : données appartenant à une autre participante'); err.status = 403; throw err;
    }
  });
}

/**
 * assertEnrollment — user must be enrolled in the cohort.
 * Admin bypasses. Sync for raw SQLite, async for adapter.
 */
export function assertEnrollment(user, db, cohortId) {
  if (user.role === ROLES.NOEMIE_ADMIN) return;

  const sql = `SELECT id FROM enrollments WHERE user_id = ? AND cohort_id = ? AND status = 'active'`;

  if (_isRawSQLite(db)) {
    const enrollment = db.prepare(sql).get(user.id, cohortId);
    if (!enrollment) {
      const err = new Error('Accès refusé : non inscrite à cette cohorte'); err.status = 403; throw err;
    }
    return;
  }

  return db.queryOne(sql, [user.id, cohortId]).then(enrollment => {
    if (!enrollment) {
      const err = new Error('Accès refusé : non inscrite à cette cohorte'); err.status = 403; throw err;
    }
  });
}

/**
 * assertEliteAccess — user must be ELITE or admin.
 */
export function assertEliteAccess(user) {
  if (user.role === ROLES.NOEMIE_ADMIN) return;
  if (user.tier !== 'ELITE') {
    const err = new Error('Réservé aux participantes ELITE'); err.status = 403; throw err;
  }
}

/**
 * assertImmutable — prevents UPDATE/DELETE on immutable tables.
 */
export function assertImmutable(tableName) {
  if (IMMUTABLE_TABLES.includes(tableName)) {
    const err = new Error(`La table ${tableName} est immuable`); err.status = 409; throw err;
  }
}

/**
 * Express middleware: requireOwnershipOf(tableName)
 */
export function requireOwnershipOf(tableName) {
  return async (req, res, next) => {
    try {
      const db = getAdapter();
      await assertOwnership(req.user, db, tableName, req.params.id);
      next();
    } catch (err) {
      res.status(err.status ?? 500).json({ error: err.message });
    }
  };
}

/**
 * Express middleware: requireEnrollmentIn(cohortIdParam)
 */
export function requireEnrollmentIn(cohortIdParam = 'cohortId') {
  return async (req, res, next) => {
    try {
      const db = getAdapter();
      await assertEnrollment(req.user, db, req.params[cohortIdParam]);
      next();
    } catch (err) {
      res.status(err.status ?? 500).json({ error: err.message });
    }
  };
}
