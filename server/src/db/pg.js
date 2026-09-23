/**
 * PostgreSQL adapter — async interface backed by node-postgres (pg).
 * SQL compatibility: converts SQLite idioms to PostgreSQL on the fly.
 */
import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;

/**
 * Convert SQLite-style SQL to PostgreSQL:
 *  - ? placeholders  → $1, $2, …
 *  - datetime('now') → NOW()
 *  - COLLATE NOCASE  → (ignored — use citext or lower() in PG schema instead)
 */
function toPostgres(sql) {
  let i = 0;
  // Replace ? with $n
  sql = sql.replace(/\?/g, () => `$${++i}`);
  // datetime('now') → NOW()
  sql = sql.replace(/datetime\('now'\)/gi, 'NOW()');
  // datetime('now', '-N days/hours/minutes') → NOW() - INTERVAL 'N days/hours/minutes'
  sql = sql.replace(/datetime\('now',\s*'([+-]?\d+)\s+(day|hour|minute|second)s?'\)/gi,
    (_, n, unit) => `NOW() - INTERVAL '${Math.abs(parseInt(n))} ${unit}s'`);
  // fallback for any other datetime('now', ...) modifier
  sql = sql.replace(/datetime\('now',\s*[^)]+\)/gi, 'NOW()');
  // COLLATE NOCASE → (strip)
  sql = sql.replace(/\s+COLLATE\s+NOCASE/gi, '');
  return sql;
}

function writeAuditSql(params) {
  return {
    sql: `INSERT INTO audit_events (id, actor_id, target_user_id, event_type, table_name, record_id, before_state, after_state, reason)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    values: [
      randomUUID(),
      params.actorId,
      params.targetUserId ?? null,
      params.eventType,
      params.tableName ?? null,
      params.recordId ?? null,
      params.beforeState ? JSON.stringify(params.beforeState) : null,
      params.afterState  ? JSON.stringify(params.afterState)  : null,
      params.reason ?? null,
    ],
  };
}

function notifySql(params) {
  return {
    sql: `INSERT INTO notifications (id, user_id, type, title, body) VALUES ($1, $2, $3, $4, $5)`,
    values: [randomUUID(), params.userId, params.type, params.title, params.body ?? null],
  };
}

class PgAdapter {
  constructor(pool) {
    this._pool = pool;
  }

  async queryOne(sql, params = []) {
    const { rows } = await this._pool.query(toPostgres(sql), params);
    return rows[0] ?? null;
  }

  async queryAll(sql, params = []) {
    const { rows } = await this._pool.query(toPostgres(sql), params);
    return rows;
  }

  async execute(sql, params = []) {
    await this._pool.query(toPostgres(sql), params);
  }

  async transaction(fn) {
    const client = await this._pool.connect();
    try {
      await client.query('BEGIN');
      const txAdapter = {
        queryOne: async (sql, params = []) => {
          const { rows } = await client.query(toPostgres(sql), params);
          return rows[0] ?? null;
        },
        queryAll: async (sql, params = []) => {
          const { rows } = await client.query(toPostgres(sql), params);
          return rows;
        },
        execute: async (sql, params = []) => {
          await client.query(toPostgres(sql), params);
        },
        writeAudit: async (opts) => {
          const { sql, values } = writeAuditSql(opts);
          await client.query(sql, values);
        },
        notify: async (opts) => {
          const { sql, values } = notifySql(opts);
          await client.query(sql, values);
        },
      };
      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async writeAudit(opts) {
    const { sql, values } = writeAuditSql(opts);
    await this._pool.query(sql, values);
  }

  async notify(opts) {
    const { sql, values } = notifySql(opts);
    await this._pool.query(sql, values);
  }
}

export async function createPgAdapter(connectionString) {
  const pool = new Pool({ connectionString, ssl: process.env.PGSSLMODE !== 'disable' ? { rejectUnauthorized: false } : false });
  // Verify connection
  const client = await pool.connect();
  client.release();
  return new PgAdapter(pool);
}
