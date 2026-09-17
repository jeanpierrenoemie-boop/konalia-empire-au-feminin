-- Build 15: Filet Anti-Blocage — extend pilot_frictions with severity, status, admin review
-- SQLite cannot ALTER CHECK constraints, so we recreate the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE pilot_frictions_v2 (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friction        TEXT NOT NULL,
  category        TEXT NOT NULL CHECK(category IN (
    'comprehension','navigation','technique','instruction',
    'surcharge','ia','gate','support','marche'
  )),
  severity        TEXT NOT NULL DEFAULT 'VERT' CHECK(severity IN ('VERT','ORANGE','ROUGE')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
  admin_decision  TEXT CHECK(admin_decision IN ('GARDER','AJUSTER','SUPPRIMER','OBSERVER')),
  admin_response  TEXT,
  reported_at     TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT
  -- no updated_at: mutations tracked via status + resolved_at
);

INSERT INTO pilot_frictions_v2 (id, user_id, friction, category, reported_at)
  SELECT id, user_id, friction,
    CASE category
      WHEN 'ux'      THEN 'navigation'
      WHEN 'content' THEN 'comprehension'
      WHEN 'process' THEN 'instruction'
      WHEN 'gate'    THEN 'gate'
      ELSE 'support'
    END,
    reported_at
  FROM pilot_frictions;

DROP TABLE pilot_frictions;
ALTER TABLE pilot_frictions_v2 RENAME TO pilot_frictions;

CREATE INDEX IF NOT EXISTS idx_frictions_user     ON pilot_frictions(user_id);
CREATE INDEX IF NOT EXISTS idx_frictions_status   ON pilot_frictions(status);
CREATE INDEX IF NOT EXISTS idx_frictions_severity ON pilot_frictions(severity);

PRAGMA foreign_keys = ON;
