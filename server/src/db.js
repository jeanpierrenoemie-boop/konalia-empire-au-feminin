import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROLES = Object.freeze({
  PARTICIPANTE_STARTER: 'PARTICIPANTE_STARTER',
  PARTICIPANTE_ELITE:   'PARTICIPANTE_ELITE',
  NOEMIE_ADMIN:         'NOEMIE_ADMIN',
  TEST_QA:              'TEST_QA',
});

export const TIERS = Object.freeze({
  STARTER: 'STARTER',
  ELITE:   'ELITE',
  ADMIN:   'ADMIN',
  TEST:    'TEST',
});

/* Tables that are INSERT-only (no UPDATE/DELETE allowed via ORM) */
export const IMMUTABLE_TABLES = Object.freeze([
  'decisions',
  'market_signals',
  'elite_points',
  'copilot_messages',
  'audit_events',
]);

let _db = null;

export function getDb(dbPath) {
  if (_db) return _db;
  const resolved = path.resolve(dbPath ?? process.env.DB_PATH ?? './data/rc.db');
  _db = new Database(resolved);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  runMigrations(_db);
  return _db;
}

export function resetDb() {
  if (_db) { try { _db.close(); } catch {} }
  _db = null;
}

const MIGRATION_FILES = [
  '001_bootstrap.sql',
  '002_v1_model.sql',
  '003_sprint_gates.sql',
  '004_gate_overrides.sql',
  '005_decisions_v2.sql',
];

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );

  const migrationsDir = path.join(__dirname, 'migrations');

  for (const file of MIGRATION_FILES) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
  }
}

/* ── Audit helper ── */
import { randomUUID } from 'crypto';

export function writeAudit(db, { actorId, targetUserId = null, eventType, tableName = null,
  recordId = null, beforeState = null, afterState = null, reason = null }) {
  db.prepare(`
    INSERT INTO audit_events
      (id, actor_id, target_user_id, event_type, table_name, record_id, before_state, after_state, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), actorId, targetUserId, eventType, tableName, recordId,
    beforeState ? JSON.stringify(beforeState) : null,
    afterState  ? JSON.stringify(afterState)  : null,
    reason
  );
}
