-- Build 18C: Invitation system for pilot participants.
-- Token is stored as SHA-256 hash — raw token shown once in URL, never persisted.

CREATE TABLE IF NOT EXISTS invitations (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email           TEXT NOT NULL COLLATE NOCASE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL DEFAULT '',
  cohort_id       TEXT NOT NULL REFERENCES cohorts(id),
  plan            TEXT NOT NULL CHECK(plan IN ('STARTER','ELITE')),
  token_hash      TEXT NOT NULL UNIQUE,      -- SHA-256 of the raw token
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','activated','expired','revoked')),
  expires_at      TEXT NOT NULL,             -- datetime string, 72h from creation
  activated_at    TEXT,
  user_id         TEXT REFERENCES users(id), -- set after activation
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invitations_email  ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_cohort ON invitations(cohort_id);
