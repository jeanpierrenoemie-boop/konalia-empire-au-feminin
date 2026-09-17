-- PostgreSQL schema — Build 20 (PostgreSQL Pilot Readiness)
-- Derived from SQLite migrations 001–016.
-- Differences from SQLite:
--   - TEXT PRIMARY KEY → VARCHAR(36) PRIMARY KEY (UUIDs)
--   - INTEGER 0/1 booleans → BOOLEAN
--   - datetime('now') DEFAULT → NOW()
--   - COLLATE NOCASE → CITEXT extension (case-insensitive text)
--   - CHECK constraints preserved (PostgreSQL supports them)
--   - SQLite UNIQUE trick for NULL → standard partial unique index

CREATE EXTENSION IF NOT EXISTS citext;

-- ── schema_migrations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  PRIMARY KEY,
  email         CITEXT       NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          TEXT         NOT NULL CHECK(role IN (
    'PARTICIPANTE_STARTER','PARTICIPANTE_ELITE','NOEMIE_ADMIN','TEST_QA'
  )),
  tier          TEXT         NOT NULL CHECK(tier IN ('STARTER','ELITE','ADMIN','TEST')),
  first_name    TEXT         NOT NULL,
  cohort_id     VARCHAR(36),
  is_test       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- ── participant_data ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS participant_data (
  id         VARCHAR(36) PRIMARY KEY,
  owner_id   VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_type  TEXT        NOT NULL,
  content    TEXT        NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_participant_data_owner ON participant_data(owner_id);

-- ── cohort_content ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cohort_content (
  id          VARCHAR(36) PRIMARY KEY,
  cohort_id   VARCHAR(36) NOT NULL,
  content_key TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cohort_content_cohort ON cohort_content(cohort_id);

-- ── profiles ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  user_id                VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name           TEXT,
  avatar_url             TEXT,
  timezone               TEXT        NOT NULL DEFAULT 'Europe/Paris',
  employment_status      TEXT,
  sector                 TEXT,
  weekly_hours_available INTEGER,
  onboarding_completed   BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── cohorts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cohorts (
  id         VARCHAR(36) PRIMARY KEY,
  name       TEXT        NOT NULL,
  start_date TEXT,
  end_date   TEXT,
  status     TEXT        NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── enrollments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id          VARCHAR(36) PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id   VARCHAR(36) NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  plan        TEXT        NOT NULL CHECK(plan IN ('STARTER','ELITE')),
  status      TEXT        NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','withdrawn')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, cohort_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_user   ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_cohort ON enrollments(cohort_id);

-- ── user_progress ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_progress (
  id             VARCHAR(36) PRIMARY KEY,
  user_id        VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id      VARCHAR(36) NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  cadre_step     TEXT        NOT NULL DEFAULT 'C' CHECK(cadre_step IN ('C','A','D','R','E')),
  sprint_number  INTEGER     NOT NULL DEFAULT 1 CHECK(sprint_number BETWEEN 1 AND 12),
  week_in_sprint INTEGER     NOT NULL DEFAULT 1,
  gate_status    TEXT        NOT NULL DEFAULT 'in_progress' CHECK(gate_status IN (
    'in_progress','submitted','passed','blocked'
  )),
  unlocked_at    TIMESTAMPTZ,
  gate_passed_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, cohort_id)
);
CREATE INDEX IF NOT EXISTS idx_user_progress_user   ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_cohort ON user_progress(cohort_id);

-- ── pilotage_state ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pilotage_state (
  id                VARCHAR(36) PRIMARY KEY,
  user_id           VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  current_priority  TEXT,
  priority_reason   TEXT,
  next_action       TEXT,
  duration_estimate TEXT,
  blocker           TEXT,
  dependency        TEXT,
  not_priority_now  TEXT,
  status            TEXT        NOT NULL DEFAULT 'active' CHECK(status IN ('active','stale','archived')),
  updated_by_user   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── project_passport ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_passport (
  id                VARCHAR(36) PRIMARY KEY,
  user_id           VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  project_name      TEXT,
  vision            TEXT,
  target_persona    TEXT,
  core_problem      TEXT,
  proposed_solution TEXT,
  revenue_model     TEXT,
  stage             TEXT        NOT NULL DEFAULT 'ideation' CHECK(stage IN (
    'ideation','validation','prototype','launch','growth'
  )),
  validation_score  INTEGER     DEFAULT 0,
  last_updated_by   TEXT        NOT NULL DEFAULT 'user' CHECK(last_updated_by IN ('user','admin')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── missions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missions (
  id            VARCHAR(36) PRIMARY KEY,
  cohort_id     VARCHAR(36) REFERENCES cohorts(id),
  cadre_step    TEXT        NOT NULL CHECK(cadre_step IN ('C','A','D','R','E')),
  sprint_number INTEGER,
  title         TEXT        NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  mission_type  TEXT        NOT NULL DEFAULT 'action' CHECK(mission_type IN (
    'action','reflection','market','proof','deliverable'
  )),
  is_required   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_by    VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_missions_cohort ON missions(cohort_id);
CREATE INDEX IF NOT EXISTS idx_missions_cadre  ON missions(cadre_step, sprint_number);

-- ── mission_submissions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mission_submissions (
  id            VARCHAR(36) PRIMARY KEY,
  mission_id    VARCHAR(36) NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id     VARCHAR(36) NOT NULL REFERENCES cohorts(id),
  content       TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'draft' CHECK(status IN (
    'draft','submitted','reviewed','approved','rejected'
  )),
  reviewer_note TEXT,
  reviewed_by   VARCHAR(36) REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mission_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_submissions_user    ON mission_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_mission ON mission_submissions(mission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_cohort  ON mission_submissions(cohort_id);

-- ── proofs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proofs (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id VARCHAR(36) REFERENCES mission_submissions(id) ON DELETE SET NULL,
  proof_type    TEXT        NOT NULL CHECK(proof_type IN (
    'screenshot','note','link','file','conversation','signal'
  )),
  title         TEXT        NOT NULL,
  content       TEXT        NOT NULL DEFAULT '',
  url           TEXT,
  cadre_step    TEXT        CHECK(cadre_step IN ('C','A','D','R','E')),
  is_public     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proofs_user       ON proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_proofs_submission ON proofs(submission_id);

-- ── decisions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id                   VARCHAR(36) PRIMARY KEY,
  user_id              VARCHAR(36) NOT NULL REFERENCES users(id),
  decision_type        TEXT        NOT NULL CHECK(decision_type IN (
    'project','pivot','persona','revenue','go_nogo','scope','other'
  )),
  title                TEXT        NOT NULL,
  context              TEXT        NOT NULL DEFAULT '',
  rationale            TEXT        NOT NULL DEFAULT '',
  outcome              TEXT,
  sprint_number        INTEGER,
  cadre_step           TEXT        CHECK(cadre_step IN ('C','A','D','R','E')),
  supersedes_id        VARCHAR(36) REFERENCES decisions(id),
  status               TEXT        NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','archived')),
  facts_used           TEXT,
  hypotheses           TEXT,
  reopening_condition  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decisions_user ON decisions(user_id);

-- ── parking_ideas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parking_ideas (
  id                      VARCHAR(36) PRIMARY KEY,
  user_id                 VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                   TEXT        NOT NULL,
  description             TEXT        NOT NULL DEFAULT '',
  category                TEXT,
  status                  TEXT        NOT NULL DEFAULT 'parked' CHECK(status IN (
    'parked','revisit','promoted','archived'
  )),
  dispersion_status       TEXT CHECK(dispersion_status IN (
    'AGIR_MAINTENANT','TESTER_PLUS_TARD','PARKING','ABANDONNER'
  )),
  pourquoi_maintenant     TEXT,
  sert_objectif_90j       BOOLEAN,
  sert_priorite_actuelle  BOOLEAN,
  necessaire_maintenant   BOOLEAN,
  que_remplace            TEXT,
  quel_cout               TEXT,
  option_plus_simple      TEXT,
  status_reason           TEXT,
  status_changed_at       TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parking_user ON parking_ideas(user_id);

-- ── market_contacts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_contacts (
  id                VARCHAR(36) PRIMARY KEY,
  user_id           VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  source            TEXT,
  circle            TEXT CHECK(circle IN ('proche','connaissance','inconnu','prescripteur','autre')),
  status            TEXT        NOT NULL DEFAULT 'prospect' CHECK(status IN (
    'prospect','en_cours','converti','pause','abandonne'
  )),
  last_action       TEXT,
  next_action       TEXT,
  last_contact_date TEXT,
  notes             TEXT,
  commercial_intent TEXT CHECK(commercial_intent IN ('exprime','confirme')),
  role              TEXT,
  organization      TEXT,
  channel           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_contacts_user ON market_contacts(user_id);

-- ── market_conversations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_conversations (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id    VARCHAR(36) REFERENCES market_contacts(id) ON DELETE SET NULL,
  title         TEXT        NOT NULL,
  summary       TEXT        NOT NULL DEFAULT '',
  date_occurred TEXT        NOT NULL,
  format        TEXT CHECK(format IN ('call','message','email','meeting','event','other')),
  duration_min  INTEGER,
  transcript    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_conversations_user    ON market_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_market_conversations_contact ON market_conversations(contact_id);

-- ── market_signals ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_signals (
  id              VARCHAR(36) PRIMARY KEY,
  user_id         VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id VARCHAR(36) REFERENCES market_conversations(id) ON DELETE SET NULL,
  contact_id      VARCHAR(36) REFERENCES market_contacts(id) ON DELETE SET NULL,
  signal_type     TEXT        NOT NULL CHECK(signal_type IN (
    'politesse','probleme_exprime','comportement_passe',
    'interet_solution','intention_commerciale','engagement'
  )),
  content         TEXT        NOT NULL,
  strength        INTEGER     NOT NULL DEFAULT 2 CHECK(strength BETWEEN 1 AND 3),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_signals_user         ON market_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_market_signals_conversation ON market_signals(conversation_id);
CREATE INDEX IF NOT EXISTS idx_market_signals_contact      ON market_signals(contact_id);

-- ── weekly_reviews ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id              VARCHAR(36) PRIMARY KEY,
  user_id         VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id       VARCHAR(36) NOT NULL REFERENCES cohorts(id),
  sprint_number   INTEGER     NOT NULL,
  week_number     INTEGER     NOT NULL,
  wins            TEXT        NOT NULL DEFAULT '',
  blockers        TEXT        NOT NULL DEFAULT '',
  next_week_focus TEXT        NOT NULL DEFAULT '',
  energy_level    INTEGER     CHECK(energy_level BETWEEN 1 AND 5),
  status          TEXT        NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sprint_number, week_number)
);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user ON weekly_reviews(user_id);

-- ── support_requests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_requests (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cohort_id     VARCHAR(36) REFERENCES cohorts(id),
  subject       TEXT        NOT NULL,
  body          TEXT        NOT NULL DEFAULT '',
  request_type  TEXT        NOT NULL DEFAULT 'question' CHECK(request_type IN (
    'question','blocker','technical','feedback','other'
  )),
  status        TEXT        NOT NULL DEFAULT 'open' CHECK(status IN (
    'open','in_progress','resolved','closed'
  )),
  resolved_by   VARCHAR(36) REFERENCES users(id),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_user   ON support_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_requests(status);

-- ── elite_points ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elite_points (
  id          VARCHAR(36) PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points      INTEGER     NOT NULL CHECK(points > 0),
  reason      TEXT        NOT NULL,
  source_type TEXT CHECK(source_type IN ('mission','proof','review','lab','support','manual')),
  source_id   TEXT,
  granted_by  VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_elite_points_user ON elite_points(user_id);

-- ── copilot_threads ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_threads (
  id          VARCHAR(36) PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  thread_type TEXT        NOT NULL DEFAULT 'general' CHECK(thread_type IN (
    'general','clarifier','arbitrer','definir','rencontrer','evoluer','cockpit'
  )),
  status      TEXT        NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_copilot_threads_user ON copilot_threads(user_id);

-- ── copilot_messages ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_messages (
  id          VARCHAR(36) PRIMARY KEY,
  thread_id   VARCHAR(36) NOT NULL REFERENCES copilot_threads(id) ON DELETE CASCADE,
  user_id     VARCHAR(36) NOT NULL REFERENCES users(id),
  role        TEXT        NOT NULL CHECK(role IN ('user','assistant')),
  content     TEXT        NOT NULL,
  token_count INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_copilot_messages_thread ON copilot_messages(thread_id);

-- ── sprint_gate_log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sprint_gate_log (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  cohort_id     VARCHAR(36) NOT NULL REFERENCES cohorts(id),
  sprint_number INTEGER     NOT NULL CHECK(sprint_number BETWEEN 1 AND 12),
  cadre_step    TEXT        NOT NULL CHECK(cadre_step IN ('C','A','D','R','E')),
  passed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  passed_by     VARCHAR(36) NOT NULL REFERENCES users(id),
  method        TEXT        NOT NULL DEFAULT 'self' CHECK(method IN ('self','admin_override')),
  UNIQUE(user_id, sprint_number)
);
CREATE INDEX IF NOT EXISTS idx_sprint_gate_log_user ON sprint_gate_log(user_id);

-- ── gate_overrides ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gate_overrides (
  id             VARCHAR(36) PRIMARY KEY,
  user_id        VARCHAR(36) NOT NULL REFERENCES users(id),
  sprint_number  INTEGER     NOT NULL CHECK(sprint_number BETWEEN 1 AND 12),
  override_by    VARCHAR(36) NOT NULL REFERENCES users(id),
  reason         TEXT        NOT NULL CHECK(length(trim(reason)) >= 10),
  exception_type TEXT        NOT NULL DEFAULT 'VERT' CHECK(exception_type IN ('VERT','ORANGE')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sprint_number)
);
CREATE INDEX IF NOT EXISTS idx_gate_overrides_user ON gate_overrides(user_id);

-- ── audit_events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id             VARCHAR(36) PRIMARY KEY,
  actor_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  target_user_id VARCHAR(36) REFERENCES users(id),
  event_type     TEXT        NOT NULL,
  table_name     TEXT,
  record_id      TEXT,
  before_state   TEXT,
  after_state    TEXT,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_events(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_type   ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_events(created_at);

-- ── notifications ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         VARCHAR(36) PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK(type IN (
    'mission_validated','correction_requested','lab_reminder','prelab_reminder',
    'support_response','elite_appointment','admin_notice'
  )),
  title      TEXT        NOT NULL,
  body       TEXT,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, read);

-- ── sprint_content ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sprint_content (
  id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  sprint_number INTEGER     NOT NULL CHECK(sprint_number BETWEEN 1 AND 12),
  cohort_id     VARCHAR(36) REFERENCES cohorts(id) ON DELETE CASCADE,
  result        TEXT,
  understand    TEXT,
  mission       TEXT,
  support       TEXT,
  deliverable   TEXT,
  unlock_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One row per (sprint_number, cohort_id) — NULL cohort = global
CREATE UNIQUE INDEX IF NOT EXISTS uq_sprint_content_sprint_cohort
  ON sprint_content(sprint_number, COALESCE(cohort_id, 'global'));

-- ── invitations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id           VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  email        CITEXT      NOT NULL,
  first_name   TEXT        NOT NULL,
  last_name    TEXT        NOT NULL DEFAULT '',
  cohort_id    VARCHAR(36) NOT NULL REFERENCES cohorts(id),
  plan         TEXT        NOT NULL CHECK(plan IN ('STARTER','ELITE')),
  token_hash   TEXT        NOT NULL UNIQUE,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK(status IN (
    'pending','activated','expired','revoked'
  )),
  expires_at   TEXT        NOT NULL,
  activated_at TIMESTAMPTZ,
  user_id      VARCHAR(36) REFERENCES users(id),
  created_by   VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invitations_email  ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_cohort ON invitations(cohort_id);

-- ── password_resets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  id         VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TEXT        NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user  ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);

-- ── lab_sessions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_sessions (
  id               VARCHAR(36) PRIMARY KEY,
  cohort_id        VARCHAR(36) NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  topic            TEXT,
  scheduled_at     TEXT        NOT NULL,
  duration_minutes INTEGER     DEFAULT 90,
  replay_url       TEXT,
  resources        TEXT,
  status           TEXT        NOT NULL DEFAULT 'upcoming' CHECK(status IN (
    'upcoming','live','done','cancelled'
  )),
  created_by       VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lab_sessions_cohort ON lab_sessions(cohort_id);

-- ── lab_prelab ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_prelab (
  id                  VARCHAR(36) PRIMARY KEY,
  lab_id              VARCHAR(36) NOT NULL REFERENCES lab_sessions(id) ON DELETE CASCADE,
  user_id             VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress_since_last TEXT,
  planned_mission     TEXT,
  deliverable         TEXT,
  deliverable_status  TEXT CHECK(deliverable_status IN ('termine','en_cours','bloque')),
  decision_taken      TEXT,
  current_blocker     TEXT,
  priority_question   TEXT        NOT NULL,
  key_point           TEXT,
  useful_to_group     BOOLEAN,
  authorise_case_use  BOOLEAN,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_late             BOOLEAN     NOT NULL DEFAULT FALSE,
  UNIQUE(lab_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_prelab_lab  ON lab_prelab(lab_id);
CREATE INDEX IF NOT EXISTS idx_prelab_user ON lab_prelab(user_id);

-- ── elite_sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elite_sessions (
  id           VARCHAR(36) PRIMARY KEY,
  cohort_id    VARCHAR(36) NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  point_number INTEGER     NOT NULL CHECK(point_number IN (1,2,3)),
  title        TEXT        NOT NULL,
  scheduled_at TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','cancelled')),
  notes        TEXT,
  created_by   VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_elite_sessions_user ON elite_sessions(user_id);

-- ── elite_revues ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elite_revues (
  id           VARCHAR(36) PRIMARY KEY,
  user_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','cancelled')),
  notes        TEXT,
  created_by   VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_elite_revues_user ON elite_revues(user_id);

-- ── pilot_frictions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pilot_frictions (
  id             VARCHAR(36) PRIMARY KEY,
  user_id        VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friction       TEXT        NOT NULL,
  category       TEXT        NOT NULL CHECK(category IN (
    'comprehension','navigation','technique','instruction',
    'surcharge','ia','gate','support','marche'
  )),
  severity       TEXT        NOT NULL DEFAULT 'VERT' CHECK(severity IN ('VERT','ORANGE','ROUGE')),
  status         TEXT        NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
  admin_decision TEXT CHECK(admin_decision IN ('GARDER','AJUSTER','SUPPRIMER','OBSERVER')),
  admin_response TEXT,
  reported_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_frictions_user     ON pilot_frictions(user_id);
CREATE INDEX IF NOT EXISTS idx_frictions_status   ON pilot_frictions(status);
CREATE INDEX IF NOT EXISTS idx_frictions_severity ON pilot_frictions(severity);

-- ── admin_interventions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_interventions (
  id             VARCHAR(36) PRIMARY KEY,
  actor_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  target_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  type           TEXT        NOT NULL CHECK(type IN (
    'gate_override','correction_request','support','note','elite_point'
  )),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interventions_target ON admin_interventions(target_user_id);
