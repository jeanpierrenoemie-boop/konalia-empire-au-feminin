import Database from 'better-sqlite3';
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

let _db = null;

export function getDb(dbPath) {
  if (_db) return _db;
  const resolved = path.resolve(dbPath ?? process.env.DB_PATH ?? './data/rc.db');
  _db = new Database(resolved);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  applyMigrations(_db);
  return _db;
}

export function resetDb() {
  _db = null;
}

function applyMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role        TEXT NOT NULL CHECK(role IN (
        'PARTICIPANTE_STARTER','PARTICIPANTE_ELITE','NOEMIE_ADMIN','TEST_QA'
      )),
      tier        TEXT NOT NULL CHECK(tier IN ('STARTER','ELITE','ADMIN','TEST')),
      first_name  TEXT NOT NULL,
      cohort_id   TEXT,
      is_test     INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0,1)),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      last_login  TEXT
    );

    CREATE TABLE IF NOT EXISTS participant_data (
      id            TEXT PRIMARY KEY,
      owner_id      TEXT NOT NULL REFERENCES users(id),
      data_type     TEXT NOT NULL,
      content       TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cohort_content (
      id          TEXT PRIMARY KEY,
      cohort_id   TEXT NOT NULL,
      content_key TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_participant_data_owner ON participant_data(owner_id);
    CREATE INDEX IF NOT EXISTS idx_cohort_content_cohort ON cohort_content(cohort_id);
  `);
}
