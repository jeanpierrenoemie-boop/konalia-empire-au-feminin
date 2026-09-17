-- Migration 004 : overrides manuels de portes par Noémie
-- Immutable — une seule ligne par (user, sprint).
-- Toute modification passe par un nouvel enregistrement d'audit.
CREATE TABLE IF NOT EXISTS gate_overrides (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  sprint_number  INTEGER NOT NULL CHECK(sprint_number BETWEEN 1 AND 12),
  override_by    TEXT NOT NULL REFERENCES users(id),  -- must be NOEMIE_ADMIN
  reason         TEXT NOT NULL CHECK(length(trim(reason)) >= 10),
  exception_type TEXT NOT NULL DEFAULT 'VERT' CHECK(exception_type IN ('VERT','ORANGE')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, sprint_number)
  -- immutable: no updated_at
);

CREATE INDEX IF NOT EXISTS idx_gate_overrides_user ON gate_overrides(user_id);
