-- Build 16: Action-driven notifications (no engagement spam)
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK(type IN (
    'mission_validated',
    'correction_requested',
    'lab_reminder',
    'prelab_reminder',
    'support_response',
    'elite_appointment',
    'admin_notice'
  )),
  title      TEXT NOT NULL,
  body       TEXT,
  read       INTEGER NOT NULL DEFAULT 0 CHECK(read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, read);
