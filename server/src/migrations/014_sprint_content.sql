-- Build 18A: Sprint content editable per sprint, optionally per cohort.
-- Structural fields (number, cadre_step, title, phase order) remain in curriculum.js.
-- Content fields here override curriculum.js nulls when present.

CREATE TABLE IF NOT EXISTS sprint_content (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sprint_number INTEGER NOT NULL CHECK (sprint_number BETWEEN 1 AND 12),
  cohort_id    TEXT REFERENCES cohorts(id) ON DELETE CASCADE,
  result       TEXT,
  understand   TEXT,
  mission      TEXT,
  support      TEXT,
  deliverable  TEXT,
  unlock_reason TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Enforce one row per (sprint_number, cohort_id) where NULL cohort means global.
-- SQLite treats NULL != NULL in UNIQUE, so we use a functional index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sprint_content_sprint_cohort
  ON sprint_content(sprint_number, COALESCE(cohort_id, 'global'));
