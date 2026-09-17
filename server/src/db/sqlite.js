/**
 * SQLite adapter — wraps better-sqlite3 sync calls in the async adapter interface.
 * Uses getDb() dynamically on every call so that test resets (resetDb) are transparent.
 */
import { getDb } from '../db.js';
import { randomUUID } from 'crypto';

function writeAuditSync(db, { actorId, targetUserId = null, eventType, tableName = null,
  recordId = null, beforeState = null, afterState = null, reason = null }) {
  db.prepare(`
    INSERT INTO audit_events (id, actor_id, target_user_id, event_type, table_name, record_id, before_state, after_state, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), actorId, targetUserId, eventType, tableName, recordId,
    beforeState ? JSON.stringify(beforeState) : null,
    afterState  ? JSON.stringify(afterState)  : null,
    reason
  );
}

function notifySync(db, { userId, type, title, body = null }) {
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), userId, type, title, body ?? null);
}

class SQLiteAdapter {
  async queryOne(sql, params = []) {
    return getDb().prepare(sql).get(...params) ?? null;
  }

  async queryAll(sql, params = []) {
    return getDb().prepare(sql).all(...params);
  }

  async execute(sql, params = []) {
    getDb().prepare(sql).run(...params);
  }

  /**
   * Manual BEGIN/COMMIT transaction that supports async fn.
   * Since SQLite is sync, all txAdapter methods return values directly
   * (awaiting a non-Promise is safe and returns immediately).
   */
  async transaction(fn) {
    const db = getDb();
    db.exec('BEGIN');
    try {
      const txAdapter = {
        queryOne:   (sql, params = []) => db.prepare(sql).get(...params) ?? null,
        queryAll:   (sql, params = []) => db.prepare(sql).all(...params),
        execute:    (sql, params = []) => { db.prepare(sql).run(...params); },
        writeAudit: (opts) => writeAuditSync(db, opts),
        notify:     (opts) => notifySync(db, opts),
      };
      const result = await fn(txAdapter);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch {}
      throw err;
    }
  }

  async writeAudit(opts) {
    writeAuditSync(getDb(), opts);
  }

  async notify(opts) {
    notifySync(getDb(), opts);
  }
}

export function createSQLiteAdapterSync() {
  return new SQLiteAdapter();
}

export async function createSQLiteAdapter() {
  return new SQLiteAdapter();
}
