import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-onboarding-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'onboarding-test-secret-long-enough-32';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let starterCookie, eliteCookie, adminCookie;
let starterId, eliteId, adminId, cohortId;

const COMPLETE_SECTIONS = {
  A: { project_name: 'Mon projet', core_problem: 'Problème test', target_persona: 'Femmes 30-45', project_stage: 'idea' },
  B: { weekly_hours: '4-7', existing_skills: 'Marketing', existing_network: '' },
  C: { current_situation: 'Salariée temps plein', main_constraint: 'time' },
  D: { main_blocker: 'Manque de temps', fear: '' },
  E: { objective_j90: 'Avoir 3 conversations de validation et savoir si mon idée tient.', success_signal: 'J\'ai contacté 3 personnes' },
  F: { commitment: 'Je m\'engage à travailler 5h par semaine pendant 90 jours.', why: 'C\'est le bon moment' },
};

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');

  adminId   = randomUUID();
  starterId = randomUUID();
  eliteId   = randomUUID();
  cohortId  = randomUUID();

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (@id, @email, @password_hash, @role, @tier, @first_name, @is_test)
  `);
  insertUser.run({ id: adminId,   email: 'admin@ob.test',   password_hash: hash, role: 'NOEMIE_ADMIN',         tier: 'ADMIN',   first_name: 'Admin',  is_test: 0 });
  insertUser.run({ id: starterId, email: 'sarah@ob.test',   password_hash: hash, role: 'PARTICIPANTE_STARTER', tier: 'STARTER', first_name: 'Sarah',  is_test: 1 });
  insertUser.run({ id: eliteId,   email: 'amelie@ob.test',  password_hash: hash, role: 'PARTICIPANTE_ELITE',   tier: 'ELITE',   first_name: 'Amélie', is_test: 1 });

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, ?, ?, ?)`)
    .run(cohortId, 'Pilote 01', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, ?)`)
    .run(randomUUID(), starterId, cohortId, 'STARTER');
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, ?)`)
    .run(randomUUID(), eliteId, cohortId, 'ELITE');

  async function loginAs(email) {
    const r = await request(app).post('/auth/login').send({ email, password: 'pass' });
    return r.headers['set-cookie'];
  }
  starterCookie = await loginAs('sarah@ob.test');
  eliteCookie   = await loginAs('amelie@ob.test');
  adminCookie   = await loginAs('admin@ob.test');
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ──────────────────────────────────
   1. GET /api/onboarding/state
────────────────────────────────── */
describe('GET /api/onboarding/state', () => {
  it('returns 401 without auth', async () => {
    const r = await request(app).get('/api/onboarding/state');
    expect(r.status).toBe(401);
  });

  it('returns completed:false and no draft for new user', async () => {
    const r = await request(app).get('/api/onboarding/state').set('Cookie', starterCookie);
    expect(r.status).toBe(200);
    expect(r.body.completed).toBe(false);
    expect(r.body.step).toBe(0);
  });
});

/* ──────────────────────────────────
   2. PUT /api/onboarding/draft
────────────────────────────────── */
describe('PUT /api/onboarding/draft', () => {
  it('saves a section draft', async () => {
    const r = await request(app).put('/api/onboarding/draft').set('Cookie', starterCookie)
      .send({ section: 'A', answers: COMPLETE_SECTIONS.A, lastCompletedStep: 2 });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('draft is retrievable on next state call', async () => {
    const r = await request(app).get('/api/onboarding/state').set('Cookie', starterCookie);
    expect(r.status).toBe(200);
    expect(r.body.draft?.sections?.A?.project_name).toBe('Mon projet');
  });

  it('merges multiple sections', async () => {
    await request(app).put('/api/onboarding/draft').set('Cookie', starterCookie)
      .send({ section: 'B', answers: COMPLETE_SECTIONS.B, lastCompletedStep: 2 });
    const r = await request(app).get('/api/onboarding/state').set('Cookie', starterCookie);
    expect(r.body.draft?.sections?.A).toBeDefined();
    expect(r.body.draft?.sections?.B).toBeDefined();
  });

  it('requires section and answers', async () => {
    const r = await request(app).put('/api/onboarding/draft').set('Cookie', starterCookie)
      .send({});
    expect(r.status).toBe(400);
  });
});

/* ──────────────────────────────────
   3. POST /api/onboarding/complete
────────────────────────────────── */
describe('POST /api/onboarding/complete', () => {
  it('returns 400 without sections', async () => {
    const r = await request(app).post('/api/onboarding/complete').set('Cookie', eliteCookie)
      .send({});
    expect(r.status).toBe(400);
  });

  it('completes onboarding for STARTER with enrollment', async () => {
    const r = await request(app).post('/api/onboarding/complete').set('Cookie', starterCookie)
      .send({ sections: COMPLETE_SECTIONS });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.nextStep.path).toBe('/cockpit');
  });

  it('state now shows completed:true', async () => {
    const r = await request(app).get('/api/onboarding/state').set('Cookie', starterCookie);
    expect(r.body.completed).toBe(true);
  });

  it('draft is deleted after completion', async () => {
    const db = getDb();
    const draft = db.prepare(
      `SELECT id FROM participant_data WHERE owner_id = ? AND data_type = 'onboarding_draft'`
    ).get(starterId);
    expect(draft).toBeUndefined();
  });

  it('cannot complete onboarding twice', async () => {
    const r = await request(app).post('/api/onboarding/complete').set('Cookie', starterCookie)
      .send({ sections: COMPLETE_SECTIONS });
    expect(r.status).toBe(409);
  });
});

/* ──────────────────────────────────
   4. Données structurées peuplées
────────────────────────────────── */
describe('Structured data population', () => {
  it('project_passport created with explicitly provided facts only', () => {
    const db = getDb();
    const pp = db.prepare('SELECT * FROM project_passport WHERE user_id = ?').get(starterId);
    expect(pp).not.toBeNull();
    expect(pp.project_name).toBe('Mon projet');
    expect(pp.core_problem).toBe('Problème test');
    expect(pp.target_persona).toBe('Femmes 30-45');
    // vision = J90 objective explicitly stated
    expect(pp.vision).toBe(COMPLETE_SECTIONS.E.objective_j90);
    // stage not inferred — stays at default
    expect(pp.stage).toBe('ideation');
  });

  it('pilotage_state created with initial C.A.D.R.E. priority', () => {
    const db = getDb();
    const ps = db.prepare('SELECT * FROM pilotage_state WHERE user_id = ?').get(starterId);
    expect(ps).not.toBeNull();
    expect(ps.current_priority).toMatch(/inventaire/i);
    expect(ps.status).toBe('active');
    expect(ps.updated_by_user).toBe(1);
  });

  it('user_progress created at C / S1 / in_progress', () => {
    const db = getDb();
    const up = db.prepare(
      'SELECT * FROM user_progress WHERE user_id = ? AND cohort_id = ?'
    ).get(starterId, cohortId);
    expect(up).not.toBeNull();
    expect(up.cadre_step).toBe('C');
    expect(up.sprint_number).toBe(1);
    expect(up.gate_status).toBe('in_progress');
    expect(up.unlocked_at).not.toBeNull();
  });

  it('profiles.onboarding_completed = 1', () => {
    const db = getDb();
    const profile = db.prepare('SELECT onboarding_completed FROM profiles WHERE user_id = ?').get(starterId);
    expect(profile?.onboarding_completed).toBe(1);
  });

  it('no strategic decision inferred or created', () => {
    const db = getDb();
    const decisions = db.prepare('SELECT * FROM decisions WHERE user_id = ?').all(starterId);
    expect(decisions).toHaveLength(0);
  });
});

/* ──────────────────────────────────
   5. ELITE participant — same flow
────────────────────────────────── */
describe('ELITE participant onboarding', () => {
  it('completes onboarding for ELITE', async () => {
    const r = await request(app).post('/api/onboarding/complete').set('Cookie', eliteCookie)
      .send({ sections: COMPLETE_SECTIONS });
    expect(r.status).toBe(200);
  });

  it('ELITE user_progress created', () => {
    const db = getDb();
    const up = db.prepare(
      'SELECT * FROM user_progress WHERE user_id = ? AND cohort_id = ?'
    ).get(eliteId, cohortId);
    expect(up?.gate_status).toBe('in_progress');
  });
});

/* ──────────────────────────────────
   6. Participant sans cohorte
────────────────────────────────── */
describe('Participant without enrollment', () => {
  let noCohortCookie, noCohortId;

  beforeAll(async () => {
    const db = getDb();
    noCohortId = randomUUID();
    const hash = await hashPassword('pass');
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Seule', 1)
    `).run(noCohortId, 'seule@ob.test', hash);
    const r = await request(app).post('/auth/login').send({ email: 'seule@ob.test', password: 'pass' });
    noCohortCookie = r.headers['set-cookie'];
  });

  it('completes without creating user_progress (no cohort)', async () => {
    const r = await request(app).post('/api/onboarding/complete').set('Cookie', noCohortCookie)
      .send({ sections: COMPLETE_SECTIONS });
    expect(r.status).toBe(200);
    const db = getDb();
    const up = db.prepare('SELECT * FROM user_progress WHERE user_id = ?').get(noCohortId);
    expect(up).toBeUndefined();
    // passport and pilotage still created
    const pp = db.prepare('SELECT id FROM project_passport WHERE user_id = ?').get(noCohortId);
    expect(pp).not.toBeNull();
  });
});
