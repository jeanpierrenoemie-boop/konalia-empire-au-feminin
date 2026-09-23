-- Migration 018 : add 'continuity' to decisions.decision_type CHECK constraint
-- SQLite cannot ALTER a CHECK constraint, so we recreate the table.
-- Adds 'continuity' type for S12 90-day plan commitment.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS decisions_new (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  decision_type   TEXT NOT NULL CHECK(decision_type IN (
    'project','pivot','persona','revenue','go_nogo','scope','continuity','other'
  )),
  title           TEXT NOT NULL,
  context         TEXT NOT NULL DEFAULT '',
  rationale       TEXT NOT NULL DEFAULT '',
  outcome         TEXT,
  sprint_number   INTEGER,
  cadre_step      TEXT CHECK(cadre_step IN ('C','A','D','R','E')),
  supersedes_id   TEXT REFERENCES decisions_new(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  -- columns added in migration 005
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','archived')),
  facts_used      TEXT,
  hypotheses      TEXT,
  reopening_condition TEXT
);

INSERT OR IGNORE INTO decisions_new
  (id, user_id, decision_type, title, context, rationale, outcome,
   sprint_number, cadre_step, supersedes_id, created_at,
   status, facts_used, hypotheses, reopening_condition)
SELECT
  id, user_id, decision_type, title, context, rationale, outcome,
  sprint_number, cadre_step, supersedes_id, created_at,
  status, facts_used, hypotheses, reopening_condition
FROM decisions;

DROP TABLE IF EXISTS decisions;
ALTER TABLE decisions_new RENAME TO decisions;

CREATE INDEX IF NOT EXISTS idx_decisions_user ON decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_decisions_type ON decisions(decision_type, status);

PRAGMA foreign_keys = ON;
