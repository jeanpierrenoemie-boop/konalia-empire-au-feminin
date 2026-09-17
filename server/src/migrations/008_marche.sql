-- Migration 008 : Mon Marché — CRM minimal
-- Extends market_contacts and market_signals for the 6-level signal hierarchy.
-- market_conversations already has contact_id from migration 002.

-- ── Recreate market_contacts with new CRM schema ─────────────────────────────
-- SQLite cannot ALTER a CHECK constraint, so we recreate the table.

CREATE TABLE IF NOT EXISTS market_contacts_new (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  source            TEXT,
  circle            TEXT CHECK(circle IN ('proche','connaissance','inconnu','prescripteur','autre')),
  status            TEXT NOT NULL DEFAULT 'prospect'
                      CHECK(status IN ('prospect','en_cours','converti','pause','abandonne')),
  last_action       TEXT,
  next_action       TEXT,
  last_contact_date TEXT,
  notes             TEXT,
  commercial_intent TEXT CHECK(commercial_intent IN ('exprime','confirme')),
  -- legacy columns kept for data integrity
  role              TEXT,
  organization      TEXT,
  channel           TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO market_contacts_new
  (id, user_id, name, source, status, notes, role, organization, channel, created_at, updated_at)
SELECT id, user_id, name, NULL,
  CASE status
    WHEN 'identified'   THEN 'prospect'
    WHEN 'contacted'    THEN 'en_cours'
    WHEN 'responded'    THEN 'en_cours'
    WHEN 'meeting_done' THEN 'en_cours'
    WHEN 'unresponsive' THEN 'pause'
    ELSE 'prospect'
  END,
  notes, role, organization, channel, created_at, updated_at
FROM market_contacts;

DROP TABLE IF EXISTS market_contacts;
ALTER TABLE market_contacts_new RENAME TO market_contacts;

CREATE INDEX IF NOT EXISTS idx_market_contacts_user ON market_contacts(user_id);

-- ── Recreate market_signals with 6-level hierarchy ───────────────────────────
-- signal_type changed from (pain/desire/…) to the 6-level validation hierarchy.

CREATE TABLE IF NOT EXISTS market_signals_new (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES market_conversations(id) ON DELETE SET NULL,
  contact_id      TEXT REFERENCES market_contacts(id) ON DELETE SET NULL,
  signal_type     TEXT NOT NULL CHECK(signal_type IN (
    'politesse',
    'probleme_exprime',
    'comportement_passe',
    'interet_solution',
    'intention_commerciale',
    'engagement'
  )),
  content         TEXT NOT NULL,
  strength        INTEGER NOT NULL DEFAULT 2 CHECK(strength BETWEEN 1 AND 3),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  -- immutable: no updated_at
);

-- Migrate old signals mapping old types to nearest new type
INSERT OR IGNORE INTO market_signals_new
  (id, user_id, conversation_id, contact_id, signal_type, content, strength, created_at)
SELECT
  id, user_id, conversation_id, NULL,
  CASE signal_type
    WHEN 'pain'       THEN 'probleme_exprime'
    WHEN 'desire'     THEN 'interet_solution'
    WHEN 'objection'  THEN 'politesse'
    WHEN 'insight'    THEN 'probleme_exprime'
    WHEN 'competitor' THEN 'comportement_passe'
    WHEN 'trend'      THEN 'politesse'
    ELSE 'politesse'
  END,
  content, strength, created_at
FROM market_signals;

DROP TABLE IF EXISTS market_signals;
ALTER TABLE market_signals_new RENAME TO market_signals;

CREATE INDEX IF NOT EXISTS idx_market_signals_user         ON market_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_market_signals_conversation ON market_signals(conversation_id);
CREATE INDEX IF NOT EXISTS idx_market_signals_contact      ON market_signals(contact_id);

-- ── Ensure market_conversations has transcript column ────────────────────────
-- (date_occurred already exists from migration 002)
ALTER TABLE market_conversations ADD COLUMN transcript TEXT;
