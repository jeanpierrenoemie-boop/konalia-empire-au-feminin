-- Build 14: Admin cockpit support — friction log + intervention record

CREATE TABLE IF NOT EXISTS pilot_frictions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friction    TEXT NOT NULL,  -- what the participant flagged as difficult/confusing
  category    TEXT CHECK(category IN ('ux','content','process','gate','other')),
  reported_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_interventions (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL CHECK(type IN (
    'gate_override','correction_request','support','note','elite_point'
  )),
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  -- immutable log; see also audit_events for full trail
);

CREATE INDEX IF NOT EXISTS idx_frictions_user        ON pilot_frictions(user_id);
CREATE INDEX IF NOT EXISTS idx_interventions_target  ON admin_interventions(target_user_id);
