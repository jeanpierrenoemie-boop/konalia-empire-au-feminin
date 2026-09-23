-- Migration 019 : Final gate support
-- Fixes gate_overrides.sprint_number from INTEGER (1-12) to TEXT (allows 'final')
-- Adds graduation_records table

PRAGMA foreign_keys = OFF;

-- Recreate gate_overrides with sprint_number as TEXT
CREATE TABLE gate_overrides_new (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  sprint_number  TEXT NOT NULL CHECK(
                   sprint_number IN ('1','2','3','4','5','6','7','8','9','10','11','12','final')
                 ),
  override_by    TEXT NOT NULL REFERENCES users(id),
  reason         TEXT NOT NULL CHECK(length(trim(reason)) >= 10),
  exception_type TEXT NOT NULL DEFAULT 'VERT' CHECK(exception_type IN ('VERT','ORANGE')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, sprint_number)
);

INSERT INTO gate_overrides_new (id, user_id, sprint_number, override_by, reason, exception_type, created_at)
SELECT id, user_id, CAST(sprint_number AS TEXT), override_by, reason, exception_type, created_at
FROM gate_overrides;

DROP TABLE gate_overrides;
ALTER TABLE gate_overrides_new RENAME TO gate_overrides;

CREATE INDEX IF NOT EXISTS idx_gate_overrides_user ON gate_overrides(user_id);

PRAGMA foreign_keys = ON;

-- Table for tracking successful graduations
CREATE TABLE IF NOT EXISTS graduation_records (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  cohort_id     TEXT REFERENCES cohorts(id),
  graduated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  method        TEXT NOT NULL DEFAULT 'self' CHECK(method IN ('self','admin_override')),
  passed_by     TEXT NOT NULL REFERENCES users(id),
  gate_snapshot TEXT,          -- JSON snapshot of the final gate state
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_graduation_user ON graduation_records(user_id);
