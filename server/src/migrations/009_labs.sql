-- Build 12: Mes Labs + Elite points sessions
-- Note: a `labs` content-library table already exists from migration 002.
-- The scheduling/live-session table is named `lab_sessions` to avoid conflict.

CREATE TABLE IF NOT EXISTS lab_sessions (
  id               TEXT PRIMARY KEY,
  cohort_id        TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  topic            TEXT,
  scheduled_at     TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 90,
  replay_url       TEXT,
  resources        TEXT,  -- JSON array [{label, url}]
  status           TEXT NOT NULL DEFAULT 'upcoming'
                   CHECK(status IN ('upcoming','live','done','cancelled')),
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lab_prelab (
  id                  TEXT PRIMARY KEY,
  lab_id              TEXT NOT NULL REFERENCES lab_sessions(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress_since_last TEXT,
  planned_mission     TEXT,
  deliverable         TEXT,
  deliverable_status  TEXT CHECK(deliverable_status IN ('termine','en_cours','bloque')),
  decision_taken      TEXT,
  current_blocker     TEXT,
  priority_question   TEXT NOT NULL,
  key_point           TEXT,
  useful_to_group     INTEGER DEFAULT NULL CHECK(useful_to_group IN (NULL,0,1)),
  authorise_case_use  INTEGER DEFAULT NULL CHECK(authorise_case_use IN (NULL,0,1)),
  submitted_at        TEXT NOT NULL DEFAULT (datetime('now')),
  is_late             INTEGER NOT NULL DEFAULT 0,
  UNIQUE(lab_id, user_id)
);

-- Elite individual points sessions (not the immutable elite_points grants)
CREATE TABLE IF NOT EXISTS elite_sessions (
  id           TEXT PRIMARY KEY,
  cohort_id    TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  point_number INTEGER NOT NULL CHECK(point_number IN (1,2,3)),
  title        TEXT NOT NULL,  -- "Ta Direction" / "Ton Offre face au réel" / "La Suite"
  scheduled_at TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK(status IN ('pending','done','cancelled')),
  notes        TEXT,           -- admin notes after session
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Revue Prioritaire ELITE (periodic check-in with Noémie)
CREATE TABLE IF NOT EXISTS elite_revues (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK(status IN ('pending','done','cancelled')),
  notes        TEXT,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lab_sessions_cohort ON lab_sessions(cohort_id);
CREATE INDEX IF NOT EXISTS idx_prelab_lab           ON lab_prelab(lab_id);
CREATE INDEX IF NOT EXISTS idx_prelab_user          ON lab_prelab(user_id);
CREATE INDEX IF NOT EXISTS idx_elite_sessions_user  ON elite_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_elite_revues_user    ON elite_revues(user_id);
