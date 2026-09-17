-- Build 14: Expand audit_events to support new event types from Labs/Elite/Admin
-- SQLite cannot ALTER a CHECK constraint, so we recreate the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE audit_events_new (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT REFERENCES users(id),
  event_type    TEXT NOT NULL,
  table_name    TEXT,
  record_id     TEXT,
  before_state  TEXT,
  after_state   TEXT,
  reason        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO audit_events_new SELECT * FROM audit_events;

DROP TABLE audit_events;
ALTER TABLE audit_events_new RENAME TO audit_events;

CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_events(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_type   ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_events(created_at);

PRAGMA foreign_keys = ON;
