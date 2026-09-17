import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-model-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'model-test-secret-long-enough-32ch';

import { getDb, resetDb, IMMUTABLE_TABLES } from '../db.js';
import { hashPassword } from '../auth.js';
import {
  assertOwnership, assertEnrollment, assertEliteAccess,
  assertImmutable, resolveOwner,
} from '../middleware/rls.js';

let db;
let adminId, starterId, eliteId, otherId, cohortId, cohort2Id;

/* ──────────────────────────────────────────────
   Setup: create users, cohorts, enrollments
────────────────────────────────────────────────── */
beforeAll(async () => {
  db = getDb(TEST_DB);

  const insert = db.prepare(`
    INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (@id, @email, @password_hash, @role, @tier, @first_name, @is_test)
  `);
  const hash = await hashPassword('test');

  adminId   = randomUUID();
  starterId = randomUUID();
  eliteId   = randomUUID();
  otherId   = randomUUID();

  insert.run({ id: adminId,   email: 'admin@m.test',   password_hash: hash, role: 'NOEMIE_ADMIN',         tier: 'ADMIN',   first_name: 'Admin',  is_test: 0 });
  insert.run({ id: starterId, email: 'starter@m.test', password_hash: hash, role: 'PARTICIPANTE_STARTER', tier: 'STARTER', first_name: 'Sarah',  is_test: 1 });
  insert.run({ id: eliteId,   email: 'elite@m.test',   password_hash: hash, role: 'PARTICIPANTE_ELITE',   tier: 'ELITE',   first_name: 'Amélie', is_test: 1 });
  insert.run({ id: otherId,   email: 'other@m.test',   password_hash: hash, role: 'PARTICIPANTE_STARTER', tier: 'STARTER', first_name: 'Autre',  is_test: 1 });

  cohortId  = randomUUID();
  cohort2Id = randomUUID();
  const insertCohort = db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, ?, ?, ?)`);
  insertCohort.run(cohortId,  'Pilote 01', '2025-01-01', adminId);
  insertCohort.run(cohort2Id, 'Pilote 02', '2025-03-01', adminId);

  const insertEnroll = db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, ?)`);
  insertEnroll.run(randomUUID(), starterId, cohortId, 'STARTER');
  insertEnroll.run(randomUUID(), eliteId,   cohortId, 'ELITE');
  // otherId enrolled in cohort2, not cohort1
  insertEnroll.run(randomUUID(), otherId, cohort2Id, 'STARTER');
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ──────────────────────────────────────────────
   1. MIGRATIONS — TOUTES LES TABLES EXISTENT
────────────────────────────────────────────────── */
describe('Migrations — structure', () => {
  const EXPECTED_TABLES = [
    'users', 'profiles', 'cohorts', 'enrollments',
    'user_progress', 'pilotage_state', 'project_passport',
    'missions', 'mission_submissions', 'proofs',
    'decisions', 'parking_ideas',
    'market_contacts', 'market_conversations', 'market_signals',
    'weekly_reviews', 'prelabs', 'labs', 'lab_resources',
    'support_requests', 'elite_points',
    'copilot_threads', 'copilot_messages', 'copilot_memory_snapshots',
    'frictions', 'audit_events', 'schema_migrations',
  ];

  for (const table of EXPECTED_TABLES) {
    it(`table ${table} exists`, () => {
      const row = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).get(table);
      expect(row?.name).toBe(table);
    });
  }

  it('schema_migrations records both applied migrations', () => {
    const rows = db.prepare('SELECT version FROM schema_migrations').all();
    const versions = rows.map(r => r.version);
    expect(versions).toContain('001_bootstrap.sql');
    expect(versions).toContain('002_v1_model.sql');
  });

  it('migrations are idempotent (re-running does not throw)', () => {
    expect(() => getDb()).not.toThrow();
  });
});

/* ──────────────────────────────────────────────
   2. FOREIGN KEYS ENFORCED
────────────────────────────────────────────────── */
describe('Foreign key constraints', () => {
  it('enrollment rejects unknown user_id', () => {
    expect(() => {
      db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, ?)`)
        .run(randomUUID(), 'nonexistent-user', cohortId, 'STARTER');
    }).toThrow();
  });

  it('enrollment rejects unknown cohort_id', () => {
    expect(() => {
      db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, ?)`)
        .run(randomUUID(), starterId, 'nonexistent-cohort', 'STARTER');
    }).toThrow();
  });

  it('duplicate enrollment for same user+cohort is rejected', () => {
    expect(() => {
      db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, ?)`)
        .run(randomUUID(), starterId, cohortId, 'STARTER');
    }).toThrow();
  });

  it('pilotage_state: unique per user', () => {
    const id1 = randomUUID();
    db.prepare(`INSERT INTO pilotage_state (id, user_id) VALUES (?, ?)`).run(id1, starterId);
    expect(() => {
      db.prepare(`INSERT INTO pilotage_state (id, user_id) VALUES (?, ?)`).run(randomUUID(), starterId);
    }).toThrow();
    db.prepare(`DELETE FROM pilotage_state WHERE id = ?`).run(id1);
  });

  it('project_passport: unique per user', () => {
    const id1 = randomUUID();
    db.prepare(`INSERT INTO project_passport (id, user_id) VALUES (?, ?)`).run(id1, starterId);
    expect(() => {
      db.prepare(`INSERT INTO project_passport (id, user_id) VALUES (?, ?)`).run(randomUUID(), starterId);
    }).toThrow();
    db.prepare(`DELETE FROM project_passport WHERE id = ?`).run(id1);
  });

  it('user_progress: unique per user+cohort', () => {
    const id1 = randomUUID();
    db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint) VALUES (?, ?, ?, 'C', 1, 1)`)
      .run(id1, starterId, cohortId);
    expect(() => {
      db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint) VALUES (?, ?, ?, 'C', 1, 1)`)
        .run(randomUUID(), starterId, cohortId);
    }).toThrow();
    db.prepare(`DELETE FROM user_progress WHERE id = ?`).run(id1);
  });
});

/* ──────────────────────────────────────────────
   3. IMMUTABLE TABLES
────────────────────────────────────────────────── */
describe('Immutable tables', () => {
  it('assertImmutable throws for decisions', () => {
    expect(() => assertImmutable('decisions')).toThrow();
  });
  it('assertImmutable throws for audit_events', () => {
    expect(() => assertImmutable('audit_events')).toThrow();
  });
  it('assertImmutable throws for market_signals', () => {
    expect(() => assertImmutable('market_signals')).toThrow();
  });
  it('assertImmutable throws for elite_points', () => {
    expect(() => assertImmutable('elite_points')).toThrow();
  });
  it('assertImmutable throws for copilot_messages', () => {
    expect(() => assertImmutable('copilot_messages')).toThrow();
  });
  it('assertImmutable does NOT throw for mutable tables', () => {
    expect(() => assertImmutable('pilotage_state')).not.toThrow();
    expect(() => assertImmutable('frictions')).not.toThrow();
  });
  it('all IMMUTABLE_TABLES entries throw', () => {
    for (const t of IMMUTABLE_TABLES) {
      expect(() => assertImmutable(t)).toThrow();
    }
  });
});

/* ──────────────────────────────────────────────
   4. ROW-LEVEL OWNERSHIP
────────────────────────────────────────────────── */
describe('RLS — ownership', () => {
  let parkingId;

  beforeAll(() => {
    parkingId = randomUUID();
    db.prepare(`INSERT INTO parking_ideas (id, user_id, title) VALUES (?, ?, ?)`)
      .run(parkingId, starterId, 'Mon idée');
  });

  it('owner can access her own record', () => {
    const user = { id: starterId, role: 'PARTICIPANTE_STARTER' };
    expect(() => assertOwnership(user, db, 'parking_ideas', parkingId)).not.toThrow();
  });

  it('another participant cannot access her record', () => {
    const user = { id: otherId, role: 'PARTICIPANTE_STARTER' };
    expect(() => assertOwnership(user, db, 'parking_ideas', parkingId))
      .toThrow('Accès refusé');
  });

  it('admin bypasses ownership check', () => {
    const user = { id: adminId, role: 'NOEMIE_ADMIN' };
    expect(() => assertOwnership(user, db, 'parking_ideas', parkingId)).not.toThrow();
  });

  it('returns 404 for nonexistent record', () => {
    const user = { id: starterId, role: 'PARTICIPANTE_STARTER' };
    expect(() => assertOwnership(user, db, 'parking_ideas', 'no-such-id'))
      .toThrow('introuvable');
  });

  it('resolveOwner returns correct owner', () => {
    expect(resolveOwner(db, 'parking_ideas', parkingId)).toBe(starterId);
  });
});

/* ──────────────────────────────────────────────
   5. COHORT ENROLLMENT
────────────────────────────────────────────────── */
describe('RLS — cohort enrollment', () => {
  it('enrolled participant can access cohort', () => {
    const user = { id: starterId, role: 'PARTICIPANTE_STARTER' };
    expect(() => assertEnrollment(user, db, cohortId)).not.toThrow();
  });

  it('participant not enrolled in cohort is denied', () => {
    const user = { id: otherId, role: 'PARTICIPANTE_STARTER' };
    expect(() => assertEnrollment(user, db, cohortId)).toThrow('non inscrite');
  });

  it('admin bypasses enrollment check', () => {
    const user = { id: adminId, role: 'NOEMIE_ADMIN' };
    expect(() => assertEnrollment(user, db, cohortId)).not.toThrow();
    expect(() => assertEnrollment(user, db, cohort2Id)).not.toThrow();
  });
});

/* ──────────────────────────────────────────────
   6. ELITE ACCESS
────────────────────────────────────────────────── */
describe('RLS — elite access', () => {
  it('ELITE participant passes assertEliteAccess', () => {
    const user = { id: eliteId, role: 'PARTICIPANTE_ELITE', tier: 'ELITE' };
    expect(() => assertEliteAccess(user)).not.toThrow();
  });
  it('STARTER participant fails assertEliteAccess', () => {
    const user = { id: starterId, role: 'PARTICIPANTE_STARTER', tier: 'STARTER' };
    expect(() => assertEliteAccess(user)).toThrow('ELITE');
  });
  it('ADMIN bypasses assertEliteAccess', () => {
    const user = { id: adminId, role: 'NOEMIE_ADMIN', tier: 'ADMIN' };
    expect(() => assertEliteAccess(user)).not.toThrow();
  });
});

/* ──────────────────────────────────────────────
   7. DÉCISIONS — IMMUABILITÉ LOGIQUE
────────────────────────────────────────────────── */
describe('Decisions — insert-only semantics', () => {
  it('decision can be inserted', () => {
    const id = randomUUID();
    expect(() => {
      db.prepare(`
        INSERT INTO decisions (id, user_id, decision_type, title, context, rationale)
        VALUES (?, ?, 'project', 'Décision test', 'ctx', 'rationale')
      `).run(id, starterId);
    }).not.toThrow();
  });

  it('decision has no updated_at column', () => {
    const cols = db.prepare(`PRAGMA table_info(decisions)`).all().map(c => c.name);
    expect(cols).not.toContain('updated_at');
  });

  it('assertImmutable blocks update path for decisions', () => {
    expect(() => assertImmutable('decisions')).toThrow();
  });

  it('supersedes_id FK works for pivot chain', () => {
    const id1 = randomUUID();
    const id2 = randomUUID();
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title) VALUES (?, ?, 'project', 'D1')`)
      .run(id1, starterId);
    expect(() => {
      db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, supersedes_id) VALUES (?, ?, 'pivot', 'D2', ?)`)
        .run(id2, starterId, id1);
    }).not.toThrow();
    expect(() => {
      db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, supersedes_id) VALUES (?, ?, 'pivot', 'D3', ?)`)
        .run(randomUUID(), starterId, 'nonexistent');
    }).toThrow();
  });
});

/* ──────────────────────────────────────────────
   8. COPILOTE — SNAPSHOT ≠ SOURCE DE VÉRITÉ
────────────────────────────────────────────────── */
describe('Copilote — memory snapshots are cache, not authority', () => {
  it('snapshot can be marked stale', () => {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO copilot_memory_snapshots (id, user_id, snapshot_type, content)
      VALUES (?, ?, 'project_context', '{}')
    `).run(id, starterId);
    db.prepare(`UPDATE copilot_memory_snapshots SET is_stale = 1 WHERE id = ?`).run(id);
    const row = db.prepare(`SELECT is_stale FROM copilot_memory_snapshots WHERE id = ?`).get(id);
    expect(row.is_stale).toBe(1);
  });

  it('copilot_messages are immutable (assertImmutable)', () => {
    expect(() => assertImmutable('copilot_messages')).toThrow();
  });
});

/* ──────────────────────────────────────────────
   9. AUDIT EVENTS
────────────────────────────────────────────────── */
describe('Audit events', () => {
  it('audit_events can be inserted with required fields', () => {
    const id = randomUUID();
    expect(() => {
      db.prepare(`
        INSERT INTO audit_events (id, actor_id, event_type, table_name, record_id)
        VALUES (?, ?, 'admin_override', 'user_progress', ?)
      `).run(id, adminId, randomUUID());
    }).not.toThrow();
  });

  it('audit_events has no updated_at column', () => {
    const cols = db.prepare(`PRAGMA table_info(audit_events)`).all().map(c => c.name);
    expect(cols).not.toContain('updated_at');
  });

  it('audit_events accepts any event_type string (migration 011 removed CHECK)', () => {
    expect(() => {
      db.prepare(`INSERT INTO audit_events (id, actor_id, event_type) VALUES (?, ?, ?)`)
        .run(randomUUID(), adminId, 'gate_override');
    }).not.toThrow();
  });
});

/* ──────────────────────────────────────────────
   10. INDEXES PRÉSENTS
────────────────────────────────────────────────── */
describe('Indexes', () => {
  const EXPECTED_INDEXES = [
    'idx_enrollments_user', 'idx_enrollments_cohort',
    'idx_user_progress_user', 'idx_user_progress_cohort',
    'idx_submissions_user', 'idx_submissions_mission', 'idx_submissions_cohort',
    'idx_proofs_user',
    'idx_decisions_user',
    'idx_parking_user',
    'idx_market_contacts_user',
    'idx_market_conversations_user', 'idx_market_conversations_contact',
    'idx_market_signals_user', 'idx_market_signals_conversation',
    'idx_weekly_reviews_user',
    'idx_support_user', 'idx_support_status',
    'idx_elite_points_user',
    'idx_copilot_threads_user', 'idx_copilot_messages_thread',
    'idx_copilot_snapshots_user',
    'idx_frictions_user', 'idx_frictions_resolved',
    'idx_audit_actor', 'idx_audit_target', 'idx_audit_type', 'idx_audit_time',
  ];

  const allIndexes = new Set(
    // beforeAll not available at describe time, read lazily
  );

  for (const idx of EXPECTED_INDEXES) {
    it(`index ${idx} exists`, () => {
      const db2 = getDb();
      const row = db2.prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name=?`
      ).get(idx);
      expect(row?.name, `Missing index: ${idx}`).toBe(idx);
    });
  }
});
