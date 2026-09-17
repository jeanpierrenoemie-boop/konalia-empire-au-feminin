-- Migration 001 : tables bootstrap (Build 1/2)
-- users, participant_data (temp), cohort_content (temp)

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN (
    'PARTICIPANTE_STARTER','PARTICIPANTE_ELITE','NOEMIE_ADMIN','TEST_QA'
  )),
  tier          TEXT NOT NULL CHECK(tier IN ('STARTER','ELITE','ADMIN','TEST')),
  first_name    TEXT NOT NULL,
  cohort_id     TEXT,
  is_test       INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login    TEXT
);

CREATE TABLE IF NOT EXISTS participant_data (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_type  TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cohort_content (
  id          TEXT PRIMARY KEY,
  cohort_id   TEXT NOT NULL,
  content_key TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_participant_data_owner ON participant_data(owner_id);
CREATE INDEX IF NOT EXISTS idx_cohort_content_cohort  ON cohort_content(cohort_id);
