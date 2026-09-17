-- Migration 002 : modèle relationnel V1

-- ──────────────────────────────────────────
-- PROFILS (extension de users)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT,
  avatar_url    TEXT,
  timezone      TEXT NOT NULL DEFAULT 'Europe/Paris',
  employment_status TEXT,  -- 'employed','independent','other'
  sector        TEXT,
  weekly_hours_available INTEGER,
  onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK(onboarding_completed IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────────────────────────────────
-- COHORTES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cohorts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  start_date    TEXT NOT NULL,
  end_date      TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','closed')),
  max_seats     INTEGER,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ──────────────────────────────────────────
-- INSCRIPTIONS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id     TEXT NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL CHECK(plan IN ('STARTER','ELITE')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','paused','completed','cancelled')),
  enrolled_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, cohort_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user   ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_cohort ON enrollments(cohort_id);

-- ──────────────────────────────────────────
-- PROGRESSION PARTICIPANTE
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_progress (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id       TEXT NOT NULL REFERENCES cohorts(id),
  cadre_step      TEXT NOT NULL CHECK(cadre_step IN ('C','A','D','R','E')),
  sprint_number   INTEGER NOT NULL DEFAULT 1 CHECK(sprint_number BETWEEN 1 AND 12),
  week_in_sprint  INTEGER NOT NULL DEFAULT 1 CHECK(week_in_sprint BETWEEN 1 AND 4),
  gate_status     TEXT NOT NULL DEFAULT 'locked' CHECK(gate_status IN ('locked','in_progress','pending_review','passed','blocked')),
  unlocked_at     TEXT,
  gate_passed_at  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, cohort_id)
);

CREATE INDEX IF NOT EXISTS idx_user_progress_user   ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_cohort ON user_progress(cohort_id);

-- ──────────────────────────────────────────
-- ÉTAT DE PILOTAGE (tableau de bord cockpit)
-- Une seule ligne active par participante
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pilotage_state (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_priority  TEXT,
  priority_reason   TEXT,
  next_action       TEXT,
  duration_estimate TEXT,
  blocker           TEXT,
  dependency        TEXT,
  not_priority_now  TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','stale','archived')),
  updated_by_user   INTEGER NOT NULL DEFAULT 1 CHECK(updated_by_user IN (0,1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id)
);

-- ──────────────────────────────────────────
-- PASSEPORT PROJET
-- État stratégique courant du projet
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_passport (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_name    TEXT,
  vision          TEXT,
  target_persona  TEXT,
  core_problem    TEXT,
  proposed_solution TEXT,
  revenue_model   TEXT,
  stage           TEXT NOT NULL DEFAULT 'ideation' CHECK(stage IN (
    'ideation','validation','prototype','launch','growth'
  )),
  validation_score INTEGER DEFAULT 0,
  last_updated_by TEXT NOT NULL DEFAULT 'user' CHECK(last_updated_by IN ('user','admin')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id)
);

-- ──────────────────────────────────────────
-- MISSIONS (définitions — créées par admin)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missions (
  id            TEXT PRIMARY KEY,
  cohort_id     TEXT REFERENCES cohorts(id),  -- NULL = toutes les cohortes
  cadre_step    TEXT NOT NULL CHECK(cadre_step IN ('C','A','D','R','E')),
  sprint_number INTEGER,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  mission_type  TEXT NOT NULL DEFAULT 'action' CHECK(mission_type IN (
    'action','reflection','market','proof','deliverable'
  )),
  is_required   INTEGER NOT NULL DEFAULT 1 CHECK(is_required IN (0,1)),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_missions_cohort ON missions(cohort_id);
CREATE INDEX IF NOT EXISTS idx_missions_cadre  ON missions(cadre_step, sprint_number);

-- ──────────────────────────────────────────
-- SOUMISSIONS DE MISSION
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mission_submissions (
  id            TEXT PRIMARY KEY,
  mission_id    TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id     TEXT NOT NULL REFERENCES cohorts(id),
  content       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft' CHECK(status IN (
    'draft','submitted','reviewed','approved','rejected'
  )),
  reviewer_note TEXT,
  reviewed_by   TEXT REFERENCES users(id),
  reviewed_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(mission_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_user    ON mission_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_mission ON mission_submissions(mission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_cohort  ON mission_submissions(cohort_id);

-- ──────────────────────────────────────────
-- PREUVES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proofs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id   TEXT REFERENCES mission_submissions(id) ON DELETE SET NULL,
  proof_type      TEXT NOT NULL CHECK(proof_type IN (
    'screenshot','note','link','file','conversation','signal'
  )),
  title           TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  url             TEXT,
  cadre_step      TEXT CHECK(cadre_step IN ('C','A','D','R','E')),
  is_public       INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proofs_user       ON proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_proofs_submission ON proofs(submission_id);

-- ──────────────────────────────────────────
-- DÉCISIONS (historique immuable)
-- INSERT ONLY — jamais UPDATE/DELETE
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  decision_type   TEXT NOT NULL CHECK(decision_type IN (
    'project','pivot','persona','revenue','go_nogo','scope','other'
  )),
  title           TEXT NOT NULL,
  context         TEXT NOT NULL DEFAULT '',
  rationale       TEXT NOT NULL DEFAULT '',
  outcome         TEXT,
  sprint_number   INTEGER,
  cadre_step      TEXT CHECK(cadre_step IN ('C','A','D','R','E')),
  supersedes_id   TEXT REFERENCES decisions(id),  -- chaîne de pivot
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  -- NO updated_at : immutable by design
);

CREATE INDEX IF NOT EXISTS idx_decisions_user ON decisions(user_id);

-- ──────────────────────────────────────────
-- IDÉES EN PARKING
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parking_ideas (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT,
  status      TEXT NOT NULL DEFAULT 'parked' CHECK(status IN ('parked','revisit','promoted','archived')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parking_user ON parking_ideas(user_id);

-- ──────────────────────────────────────────
-- CONTACTS MARCHÉ
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_contacts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  organization  TEXT,
  channel       TEXT CHECK(channel IN ('linkedin','email','phone','event','referral','other')),
  contact_type  TEXT NOT NULL DEFAULT 'prospect' CHECK(contact_type IN (
    'prospect','expert','partner','mentor','other'
  )),
  notes         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'identified' CHECK(status IN (
    'identified','contacted','responded','meeting_done','unresponsive'
  )),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_market_contacts_user ON market_contacts(user_id);

-- ──────────────────────────────────────────
-- CONVERSATIONS MARCHÉ
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_conversations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id    TEXT REFERENCES market_contacts(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  date_occurred TEXT NOT NULL,
  format        TEXT CHECK(format IN ('call','message','email','meeting','event','other')),
  duration_min  INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_market_conversations_user    ON market_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_market_conversations_contact ON market_conversations(contact_id);

-- ──────────────────────────────────────────
-- SIGNAUX MARCHÉ
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_signals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES market_conversations(id) ON DELETE SET NULL,
  signal_type     TEXT NOT NULL CHECK(signal_type IN (
    'pain','desire','objection','insight','competitor','trend','other'
  )),
  content         TEXT NOT NULL,
  strength        INTEGER NOT NULL DEFAULT 2 CHECK(strength BETWEEN 1 AND 3),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  -- immutable: no updated_at
);

CREATE INDEX IF NOT EXISTS idx_market_signals_user         ON market_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_market_signals_conversation ON market_signals(conversation_id);

-- ──────────────────────────────────────────
-- BILANS HEBDOMADAIRES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id       TEXT NOT NULL REFERENCES cohorts(id),
  sprint_number   INTEGER NOT NULL,
  week_number     INTEGER NOT NULL,
  wins            TEXT NOT NULL DEFAULT '',
  blockers        TEXT NOT NULL DEFAULT '',
  next_week_focus TEXT NOT NULL DEFAULT '',
  energy_level    INTEGER CHECK(energy_level BETWEEN 1 AND 5),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, sprint_number, week_number)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user ON weekly_reviews(user_id);

-- ──────────────────────────────────────────
-- PRÉLABS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prelabs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_id      TEXT NOT NULL,
  responses   TEXT NOT NULL DEFAULT '{}',
  completed   INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, lab_id)
);

CREATE INDEX IF NOT EXISTS idx_prelabs_user ON prelabs(user_id);

-- ──────────────────────────────────────────
-- LABS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labs (
  id            TEXT PRIMARY KEY,
  cohort_id     TEXT REFERENCES cohorts(id),
  cadre_step    TEXT CHECK(cadre_step IN ('C','A','D','R','E')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  lab_type      TEXT NOT NULL DEFAULT 'async' CHECK(lab_type IN ('async','sync','self_paced')),
  duration_min  INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_elite_only INTEGER NOT NULL DEFAULT 0 CHECK(is_elite_only IN (0,1)),
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_labs_cohort ON labs(cohort_id);

-- ──────────────────────────────────────────
-- RESSOURCES LAB
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_resources (
  id           TEXT PRIMARY KEY,
  lab_id       TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK(resource_type IN (
    'pdf','video','link','template','audio','other'
  )),
  url          TEXT,
  is_elite_only INTEGER NOT NULL DEFAULT 0 CHECK(is_elite_only IN (0,1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lab_resources_lab ON lab_resources(lab_id);

-- ──────────────────────────────────────────
-- DEMANDES DE SUPPORT
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_requests (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id     TEXT REFERENCES cohorts(id),
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  request_type  TEXT NOT NULL DEFAULT 'question' CHECK(request_type IN (
    'question','blocker','technical','feedback','other'
  )),
  status        TEXT NOT NULL DEFAULT 'open' CHECK(status IN (
    'open','in_progress','resolved','closed'
  )),
  resolved_by   TEXT REFERENCES users(id),
  resolved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_support_user   ON support_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_requests(status);

-- ──────────────────────────────────────────
-- POINTS ELITE
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elite_points (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points      INTEGER NOT NULL CHECK(points > 0),
  reason      TEXT NOT NULL,
  source_type TEXT CHECK(source_type IN (
    'mission','proof','review','lab','support','manual'
  )),
  source_id   TEXT,
  granted_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  -- immutable: no updated_at
);

CREATE INDEX IF NOT EXISTS idx_elite_points_user ON elite_points(user_id);

-- ──────────────────────────────────────────
-- THREADS COPILOTE
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_threads (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  thread_type TEXT NOT NULL DEFAULT 'general' CHECK(thread_type IN (
    'general','clarifier','arbitrer','definir','rencontrer','evoluer','cockpit'
  )),
  status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_copilot_threads_user ON copilot_threads(user_id);

-- ──────────────────────────────────────────
-- MESSAGES COPILOTE
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES copilot_threads(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content     TEXT NOT NULL,
  token_count INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  -- immutable: no updated_at
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_thread ON copilot_messages(thread_id);

-- ──────────────────────────────────────────
-- SNAPSHOTS MÉMOIRE COPILOTE
-- Cache dérivé — jamais source de vérité sur les décisions validées
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_memory_snapshots (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id       TEXT REFERENCES copilot_threads(id) ON DELETE SET NULL,
  snapshot_type   TEXT NOT NULL CHECK(snapshot_type IN (
    'project_context','pilotage_summary','decision_digest','signal_summary'
  )),
  content         TEXT NOT NULL DEFAULT '{}',
  is_stale        INTEGER NOT NULL DEFAULT 0 CHECK(is_stale IN (0,1)),
  generated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_copilot_snapshots_user ON copilot_memory_snapshots(user_id);

-- ──────────────────────────────────────────
-- FRICTIONS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS frictions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friction_type TEXT NOT NULL CHECK(friction_type IN (
    'time','energy','skills','resources','clarity','fear','other'
  )),
  description   TEXT NOT NULL,
  sprint_number INTEGER,
  cadre_step    TEXT CHECK(cadre_step IN ('C','A','D','R','E')),
  resolved      INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0,1)),
  resolved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_frictions_user     ON frictions(user_id);
CREATE INDEX IF NOT EXISTS idx_frictions_resolved ON frictions(resolved);

-- ──────────────────────────────────────────
-- ÉVÉNEMENTS D'AUDIT
-- Overrides admin, changements de décisions stratégiques, états sensibles
-- INSERT ONLY
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT REFERENCES users(id),
  event_type    TEXT NOT NULL CHECK(event_type IN (
    'admin_override','strategic_decision_change','gate_manual_pass',
    'gate_manual_block','enrollment_change','tier_change',
    'data_access','data_export','support_resolution','elite_points_grant'
  )),
  table_name    TEXT,
  record_id     TEXT,
  before_state  TEXT,
  after_state   TEXT,
  reason        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  -- immutable: no updated_at
);

CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_events(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_type   ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_events(created_at);
