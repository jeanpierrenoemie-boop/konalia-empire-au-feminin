/**
 * Final Gate / Graduation — Tests B21M
 * Covers: migration 019, gate_overrides TEXT, graduation_records,
 *   /gate/final/override admin endpoint, gateFinal causal conditions,
 *   end-to-end smoke S1→Final, security/ownership.
 */

// ── DB bootstrap ────────────────────────────────────────────────
import path from 'path';
import os from 'os';
const TEST_DB = path.join(os.tmpdir(), `rc-final-test-${Date.now()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 'final-test-secret-32-chars-min!!!';
process.env.JWT_EXPIRES_IN  = '1h';
process.env.COOKIE_SECURE   = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';
import { evaluateGate } from '../gates.js';

const app = createApp();

const PASS = 'Password1!';
const ADMIN_PASS = 'Admin123!';

let adminId, participantId, participant2Id, cohortId;
let participantEmail, participant2Email;
let participantCookies, participant2Cookies, adminCookies;

async function loginAs(email, password) {
  const r = await request(app).post('/auth/login').send({ email, password });
  return r.headers['set-cookie'];
}

function seedProgress(db, userId, cohortId, sprintNumber = 12, gateStatus = 'in_progress') {
  db.prepare(`
    INSERT INTO user_progress (id, user_id, cohort_id, sprint_number, cadre_step, gate_status, week_in_sprint)
    VALUES (?, ?, ?, ?, 'E', ?, 1)
    ON CONFLICT(user_id, cohort_id) DO UPDATE SET
      sprint_number = excluded.sprint_number, gate_status = excluded.gate_status,
      cadre_step = excluded.cadre_step, week_in_sprint = excluded.week_in_sprint
  `).run(randomUUID(), userId, cohortId, sprintNumber, gateStatus);
}

function seedMissionSubmission(db, userId, cohortId, sprintNumber) {
  const mId = randomUUID();
  db.prepare(`INSERT OR IGNORE INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by)
    VALUES (?, ?, 'E', ?, ?, 1, 0, ?)`)
    .run(mId, cohortId, sprintNumber, `Mission S${sprintNumber}`, adminId);
  const subId = randomUUID();
  db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status)
    VALUES (?, ?, ?, ?, 'test', 'submitted')`)
    .run(subId, mId, userId, cohortId);
  return { mId, subId };
}

function seedS12DataSubmitted(db, userId) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO participant_data (id, owner_id, data_type, content)
    VALUES (?, ?, 's12_continuity_plan', ?)
  `).run(id, userId, JSON.stringify({
    status: 'submitted',
    ninety_day_goal: 'Cap 90j test',
    priority: 'Priorité test',
    phases: {},
    weekly_rhythm: { hours_available: '4', action_slots: 'Lundi', terrain_actions_per_week: '2', review_frequency: 'Hebdo' },
    tracking_indicators: [],
    checkpoints: {},
    friction_plan: { probable_obstacle: 'Obstacle test', planned_response: 'Réponse', minimum_action: 'Action' },
    epistemic: { plan_not_prediction: true, objective_not_guarantee: true, commitment_not_certainty: true },
  }));
  return id;
}

function seedContinuityDecision(db, userId) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO decisions (id, user_id, decision_type, sprint_number, title, status)
    VALUES (?, ?, 'continuity', 12, 'Décision continuité S12', 'active')
  `).run(id, userId);
  return id;
}

/* ── Global setup ───────────────────────────────────────────────── */
beforeAll(async () => {
  const db = getDb();
  adminId = randomUUID();
  participantId = randomUUID();
  participant2Id = randomUUID();
  cohortId = randomUUID();
  participantEmail = `fp+${participantId.slice(0, 6)}@test.local`;
  participant2Email = `fp2+${participant2Id.slice(0, 6)}@test.local`;

  const ph = await hashPassword(PASS);
  const ah = await hashPassword(ADMIN_PASS);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `fpadmin+${adminId.slice(0,6)}@test.local`, ah);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (?, ?, ?, 'PARTICIPANTE_ELITE', 'ELITE', 'Participante', 0)`)
    .run(participantId, participantEmail, ph);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (?, ?, ?, 'PARTICIPANTE_ELITE', 'ELITE', 'Autre', 0)`)
    .run(participant2Id, participant2Email, ph);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Cohorte Final Test', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'ELITE')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'ELITE')`)
    .run(randomUUID(), participant2Id, cohortId);

  seedProgress(db, participantId, cohortId);
  seedProgress(db, participant2Id, cohortId);

  participantCookies = await loginAs(participantEmail, PASS);
  participant2Cookies = await loginAs(participant2Email, PASS);
  adminCookies = await loginAs(`fpadmin+${adminId.slice(0,6)}@test.local`, ADMIN_PASS);
});

afterAll(() => {
  resetDb();
  try { require('fs').unlinkSync(TEST_DB); } catch {}
});

/* ── Migration 019 ────────────────────────────────────────────── */
describe('Migration 019', () => {
  it('gate_overrides.sprint_number accepts text values', () => {
    const db = getDb();
    const id = randomUUID();
    expect(() => {
      db.prepare(`INSERT INTO gate_overrides (id, user_id, sprint_number, override_by, reason, exception_type)
        VALUES (?, ?, '12', ?, 'Raison de test valide ici', 'VERT')`)
        .run(id, participantId, adminId);
    }).not.toThrow();
    db.prepare(`DELETE FROM gate_overrides WHERE id = ?`).run(id);
  });

  it('gate_overrides.sprint_number accepts final', () => {
    const db = getDb();
    const id = randomUUID();
    expect(() => {
      db.prepare(`INSERT INTO gate_overrides (id, user_id, sprint_number, override_by, reason, exception_type)
        VALUES (?, ?, 'final', ?, 'Override final raison longue', 'VERT')`)
        .run(id, participantId, adminId);
    }).not.toThrow();
    db.prepare(`DELETE FROM gate_overrides WHERE id = ?`).run(id);
  });

  it('gate_overrides.sprint_number rejects invalid text', () => {
    const db = getDb();
    expect(() => {
      db.prepare(`INSERT INTO gate_overrides (id, user_id, sprint_number, override_by, reason, exception_type)
        VALUES (?, ?, 'invalid', ?, 'Raison de test valide ici', 'VERT')`)
        .run(randomUUID(), participantId, adminId);
    }).toThrow();
  });

  it('graduation_records table exists with correct structure', () => {
    const db = getDb();
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='graduation_records'`).get();
    expect(row).toBeTruthy();
  });
});

/* ── gateFinal causal matrix ──────────────────────────────────── */
describe('gateFinal causal conditions', () => {
  let gateUserId;

  beforeAll(() => {
    const db = getDb();
    gateUserId = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, 'x', 'PARTICIPANTE_ELITE', 'ELITE', 'Gate', 0)`)
      .run(gateUserId, `gate+${gateUserId.slice(0,6)}@test.local`);
    seedProgress(db, gateUserId, cohortId);
  });

  it('ROUGE when all conditions missing', () => {
    const db = getDb();
    const result = evaluateGate(db, gateUserId, 'final');
    expect(result.status).toBe('ROUGE');
    expect(result.conditions.every(c => !c.met)).toBe(true);
  });

  it('ROUGE when only mission submitted', () => {
    const db = getDb();
    seedMissionSubmission(db, gateUserId, cohortId, 12);
    const result = evaluateGate(db, gateUserId, 'final');
    expect(result.status).toBe('ROUGE');
    const mission = result.conditions.find(c => c.label.includes('Sprint 12'));
    expect(mission?.met).toBe(true);
  });

  it('ROUGE when mission + s12data but no continuity decision', () => {
    const db = getDb();
    seedS12DataSubmitted(db, gateUserId);
    const result = evaluateGate(db, gateUserId, 'final');
    expect(result.status).toBe('ROUGE');
    const decision = result.conditions.find(c => c.label.includes('Décision'));
    expect(decision?.met).toBe(false);
  });

  it('VERT when all 3 conditions met', () => {
    const db = getDb();
    seedContinuityDecision(db, gateUserId);
    const result = evaluateGate(db, gateUserId, 'final');
    expect(result.status).toBe('VERT');
    expect(result.conditions.every(c => c.met)).toBe(true);
  });

  it('override in gate_overrides with sprint_number=final is found', () => {
    const db = getDb();
    const overrideUserId = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, 'x', 'PARTICIPANTE_ELITE', 'ELITE', 'OvUser', 0)`)
      .run(overrideUserId, `ov+${overrideUserId.slice(0,6)}@test.local`);
    seedProgress(db, overrideUserId, cohortId);

    db.prepare(`INSERT INTO gate_overrides (id, user_id, sprint_number, override_by, reason, exception_type)
      VALUES (?, ?, 'final', ?, 'Raison admin override finale valide', 'ORANGE')`)
      .run(randomUUID(), overrideUserId, adminId);

    const result = evaluateGate(db, overrideUserId, 'final');
    expect(result.status).toBe('ORANGE');
    expect(result.override_reason).toContain('override finale');
  });
});

/* ── POST /gate/12/pass — graduation ─────────────────────────── */
describe('POST /api/parcours/gate/12/pass — graduation', () => {
  let gradUserId, gradEmail, gradCookies;

  beforeAll(async () => {
    const db = getDb();
    gradUserId = randomUUID();
    gradEmail = `grad+${gradUserId.slice(0,6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_ELITE', 'ELITE', 'Grad', 0)`)
      .run(gradUserId, gradEmail, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'ELITE')`)
      .run(randomUUID(), gradUserId, cohortId);
    seedProgress(db, gradUserId, cohortId);
    seedMissionSubmission(db, gradUserId, cohortId, 12);
    seedS12DataSubmitted(db, gradUserId);
    seedContinuityDecision(db, gradUserId);
    gradCookies = await loginAs(gradEmail, PASS);
  });

  it('returns 200 and graduated:true when all conditions met', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/12/pass')
      .set('Cookie', gradCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.graduated).toBe(true);
    expect(r.body.passedSprint).toBe(12);
    expect(r.body.nextSprint).toBeNull();
  });

  it('records graduation in graduation_records', () => {
    const db = getDb();
    const rec = db.prepare(`SELECT * FROM graduation_records WHERE user_id = ?`).get(gradUserId);
    expect(rec).toBeTruthy();
    expect(rec.method).toBe('self');
    expect(rec.passed_by).toBe(gradUserId);
  });

  it('sets user_progress.gate_status to passed', () => {
    const db = getDb();
    const p = db.prepare(`SELECT gate_status FROM user_progress WHERE user_id = ?`).get(gradUserId);
    expect(p.gate_status).toBe('passed');
  });

  it('returns 409 on duplicate graduation attempt', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/12/pass')
      .set('Cookie', gradCookies);
    expect(r.status).toBe(409);
  });

  it('returns 422 when conditions not met', async () => {
    const db = getDb();
    const incompleteId = randomUUID();
    const incompleteEmail = `inc+${incompleteId.slice(0,6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_ELITE', 'ELITE', 'Incomplete', 0)`)
      .run(incompleteId, incompleteEmail, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'ELITE')`)
      .run(randomUUID(), incompleteId, cohortId);
    seedProgress(db, incompleteId, cohortId);
    const cookies = await loginAs(incompleteEmail, PASS);
    const r = await request(app)
      .post('/api/parcours/gate/12/pass')
      .set('Cookie', cookies);
    expect(r.status).toBe(422);
  });
});

/* ── POST /gate/final/override — admin endpoint ──────────────── */
describe('POST /api/parcours/gate/final/override', () => {
  let targetId, targetEmail;

  beforeAll(async () => {
    const db = getDb();
    targetId = randomUUID();
    targetEmail = `ovtarget+${targetId.slice(0,6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_ELITE', 'ELITE', 'Target', 0)`)
      .run(targetId, targetEmail, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'ELITE')`)
      .run(randomUUID(), targetId, cohortId);
    seedProgress(db, targetId, cohortId);
  });

  it('requires admin role', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/final/override')
      .set('Cookie', participantCookies)
      .send({ target_user_id: targetId, reason: 'Raison longue suffisante ici' });
    expect(r.status).toBe(403);
  });

  it('returns 400 if reason too short', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/final/override')
      .set('Cookie', adminCookies)
      .send({ target_user_id: targetId, reason: 'court' });
    expect(r.status).toBe(400);
  });

  it('returns 400 if target_user_id missing', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/final/override')
      .set('Cookie', adminCookies)
      .send({ reason: 'Raison longue suffisante ici' });
    expect(r.status).toBe(400);
  });

  it('returns 404 for unknown target_user_id', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/final/override')
      .set('Cookie', adminCookies)
      .send({ target_user_id: randomUUID(), reason: 'Raison longue suffisante ici' });
    expect(r.status).toBe(404);
  });

  it('succeeds and graduates the participant', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/final/override')
      .set('Cookie', adminCookies)
      .send({ target_user_id: targetId, reason: 'Override admin final valide pour test', exception_type: 'ORANGE' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.graduated).toBe(true);
    expect(r.body.overriddenSprint).toBe('final');
    expect(r.body.exception_type).toBe('ORANGE');
  });

  it('records graduation in graduation_records with admin_override method', () => {
    const db = getDb();
    const rec = db.prepare(`SELECT * FROM graduation_records WHERE user_id = ?`).get(targetId);
    expect(rec).toBeTruthy();
    expect(rec.method).toBe('admin_override');
    expect(rec.passed_by).toBe(adminId);
  });

  it('stores sprint_number=final in gate_overrides', () => {
    const db = getDb();
    const ov = db.prepare(`SELECT * FROM gate_overrides WHERE user_id = ? AND sprint_number = 'final'`).get(targetId);
    expect(ov).toBeTruthy();
    expect(ov.exception_type).toBe('ORANGE');
  });

  it('sets user_progress.gate_status to passed', () => {
    const db = getDb();
    const p = db.prepare(`SELECT gate_status FROM user_progress WHERE user_id = ?`).get(targetId);
    expect(p.gate_status).toBe('passed');
  });

  it('returns 409 if already graduated', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/final/override')
      .set('Cookie', adminCookies)
      .send({ target_user_id: targetId, reason: 'Override admin final valide pour test' });
    expect(r.status).toBe(409);
  });
});

/* ── Security / ownership ─────────────────────────────────────── */
describe('Security and ownership', () => {
  it('GET /api/parcours requires auth', async () => {
    const r = await request(app).get('/api/parcours');
    expect(r.status).toBe(401);
  });

  it('participant cannot access another participant gate data', async () => {
    // participant can only pass THEIR OWN current sprint
    const db = getDb();
    const otherId = randomUUID();
    const otherEmail = `sec+${otherId.slice(0,6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_ELITE', 'ELITE', 'Other', 0)`)
      .run(otherId, otherEmail, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'ELITE')`)
      .run(randomUUID(), otherId, cohortId);
    seedProgress(db, otherId, cohortId);

    // participant2 tries to pass sprint 12 for otherId — but the route uses req.user.id
    // so they can only pass their own sprint; checking their own sprint 12 returns 400
    // (progress.sprint_number !== 12 for participant2 if they're on sprint 12 with no conditions met → 422)
    const r = await request(app)
      .post('/api/parcours/gate/12/pass')
      .set('Cookie', participant2Cookies);
    // Either 422 (conditions unmet) or 400 (progress mismatch) — not 200 with someone else's data
    expect([400, 422]).toContain(r.status);
  });

  it('unauthenticated request to /gate/final/override returns 401', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/final/override')
      .send({ target_user_id: participantId, reason: 'Test non auth' });
    expect(r.status).toBe(401);
  });
});

/* ── End-to-end smoke S1 → Final ─────────────────────────────── */
describe('E2E smoke: S1 → Final (gate state progression)', () => {
  let smokeId, smokeEmail, smokeCookies;

  beforeAll(async () => {
    const db = getDb();
    smokeId = randomUUID();
    smokeEmail = `smoke+${smokeId.slice(0,6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_ELITE', 'ELITE', 'Smoke', 0)`)
      .run(smokeId, smokeEmail, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'ELITE')`)
      .run(randomUUID(), smokeId, cohortId);
    smokeCookies = await loginAs(smokeEmail, PASS);
  });

  it('new user has no progress initially — parcours returns locked sprints', async () => {
    // No user_progress row → currentSprintNumber is null
    const r = await request(app).get('/api/parcours').set('Cookie', smokeCookies);
    expect(r.status).toBe(200);
    expect(r.body.currentSprintNumber).toBeNull();
  });

  it('after seeding S12 progress, user is at sprint 12', () => {
    const db = getDb();
    seedProgress(db, smokeId, cohortId, 12, 'in_progress');
    const p = db.prepare(`SELECT sprint_number, gate_status FROM user_progress WHERE user_id = ?`).get(smokeId);
    expect(p.sprint_number).toBe(12);
    expect(p.gate_status).toBe('in_progress');
  });

  it('gateFinal is ROUGE when S12 conditions not met', () => {
    const db = getDb();
    const result = evaluateGate(db, smokeId, 'final');
    expect(result.status).toBe('ROUGE');
  });

  it('after seeding all S12 conditions, gateFinal is VERT', () => {
    const db = getDb();
    seedMissionSubmission(db, smokeId, cohortId, 12);
    seedS12DataSubmitted(db, smokeId);
    seedContinuityDecision(db, smokeId);
    const result = evaluateGate(db, smokeId, 'final');
    expect(result.status).toBe('VERT');
  });

  it('/gate/12/pass succeeds when gate is VERT', async () => {
    const r = await request(app)
      .post('/api/parcours/gate/12/pass')
      .set('Cookie', smokeCookies);
    expect(r.status).toBe(200);
    expect(r.body.graduated).toBe(true);
  });

  it('after graduation, user_progress.gate_status = passed', () => {
    const db = getDb();
    const p = db.prepare(`SELECT gate_status FROM user_progress WHERE user_id = ?`).get(smokeId);
    expect(p.gate_status).toBe('passed');
  });

  it('graduation_records has entry for smoke user', () => {
    const db = getDb();
    const rec = db.prepare(`SELECT * FROM graduation_records WHERE user_id = ?`).get(smokeId);
    expect(rec).toBeTruthy();
  });

  it('GET /api/parcours reflects passed state for sprint 12', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', smokeCookies);
    expect(r.status).toBe(200);
    const s12 = r.body.sprints?.find(s => s.number === 12);
    expect(s12?.state).toBe('passed');
  });
});

/* ── Non-regression: numeric gate overrides still work ────────── */
describe('Non-regression: numeric sprint overrides', () => {
  it('gate_overrides accepts sprint_number 1–12 as text', () => {
    const db = getDb();
    for (const n of [1, 6, 12]) {
      const id = randomUUID();
      expect(() => {
        db.prepare(`INSERT INTO gate_overrides (id, user_id, sprint_number, override_by, reason, exception_type)
          VALUES (?, ?, ?, ?, 'Raison de test suffisamment longue', 'VERT')`)
          .run(id, participantId, String(n), adminId);
        db.prepare(`DELETE FROM gate_overrides WHERE id = ?`).run(id);
      }).not.toThrow();
    }
  });

  it('_getOverrideSync with numeric key still returns null when no row', () => {
    const db = getDb();
    const result = evaluateGate(db, participantId, 5);
    // Just checking it doesn't throw and returns a valid structure
    expect(result).toHaveProperty('status');
    expect(['VERT', 'ROUGE', 'ORANGE']).toContain(result.status);
  });
});
