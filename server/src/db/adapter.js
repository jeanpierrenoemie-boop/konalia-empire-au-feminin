/**
 * Unified async DB adapter — Build 20 (PostgreSQL Pilot Readiness)
 *
 * Usage:
 *   import { getAdapter, initAdapter, resetAdapter } from './db/adapter.js';
 *
 *   // In app startup (required for PostgreSQL, optional for SQLite):
 *   await initAdapter();
 *
 *   // In route handlers:
 *   const db = getAdapter();
 *   const user = await db.queryOne('SELECT * FROM users WHERE id = ?', [id]);
 *   await db.execute('UPDATE users SET ...', [...]);
 *   await db.transaction(async tx => { ... });
 *   await db.writeAudit({ actorId, eventType, ... });
 *   await db.notify({ userId, type, title, body });
 */
import { createSQLiteAdapter, createSQLiteAdapterSync } from './sqlite.js';
import { createPgAdapter } from './pg.js';

let _adapter = null;

export async function initAdapter() {
  const driver = process.env.DB_DRIVER ?? 'sqlite';
  if (driver === 'postgres') {
    if (!process.env.DATABASE_URL) {
      throw new Error('DB_DRIVER=postgres requires DATABASE_URL to be set');
    }
    _adapter = await createPgAdapter(process.env.DATABASE_URL);
  } else {
    _adapter = await createSQLiteAdapter();
  }
  return _adapter;
}

/**
 * Returns the current adapter, lazily initializing a SQLite adapter if needed.
 * Lazy init is intentional for backward-compatibility with tests that call
 * getDb() for setup before the app is fully initialized.
 */
export function getAdapter() {
  if (_adapter) return _adapter;

  const driver = process.env.DB_DRIVER ?? 'sqlite';
  if (driver !== 'sqlite') {
    throw new Error('DB adapter not initialized — call await initAdapter() first');
  }
  // Lazy SQLite init: create a new adapter each time so we always pick up
  // the current _db singleton (important when tests call resetDb() between test files).
  return createSQLiteAdapterSync();
}

export function resetAdapter() {
  _adapter = null;
}
