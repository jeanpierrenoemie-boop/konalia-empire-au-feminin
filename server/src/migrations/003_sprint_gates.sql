-- Migration 003 : journal de progression par sprint
-- Chaque ligne = un sprint validé (immuable)
CREATE TABLE IF NOT EXISTS sprint_gate_log (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  cohort_id     TEXT NOT NULL REFERENCES cohorts(id),
  sprint_number INTEGER NOT NULL CHECK(sprint_number BETWEEN 1 AND 12),
  cadre_step    TEXT NOT NULL CHECK(cadre_step IN ('C','A','D','R','E')),
  passed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  passed_by     TEXT NOT NULL REFERENCES users(id),   -- self or admin
  method        TEXT NOT NULL DEFAULT 'self' CHECK(method IN ('self','admin_override')),
  UNIQUE(user_id, sprint_number)
  -- immutable: no updated_at
);

CREATE INDEX IF NOT EXISTS idx_sprint_gate_log_user ON sprint_gate_log(user_id);
