/**
 * S2 — TES RESSOURCES EXPLOITABLES — Tests
 * Build 21B / 21B.1: Paths CRUD, constraints, ownership isolation, submit, admin read, gate S3 (realigned).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-s2-test-${randomUUID()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's2-test-secret-32-chars-minimum!!';
process.env.JWT_EXPIRES_IN  = '1h';
process.env.COOKIE_SECURE   = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { getAdapter } from '../db/adapter.js';
import { createApp } from '../../server.js';

const app = createApp();

/* ── Helpers ──────────────────────────────────────────────────────── */

function makePath(overrides = {}) {
  return {
    id: randomUUID(),
    status: 'exploring',
    name: 'Piste test',
    starting_resource: 'Mon expérience en formation',
    person: 'Managers de PME',
    problem: 'Ils ne savent pas recruter leurs premières équipes',
    what_i_know: 'J\'ai formé 50 managers',
    what_i_assume: 'Ce problème est fréquent',
    what_i_need_to_verify: 'Si ils paient pour cette aide',
    acknowledged: {},
    ...overrides,
  };
}

function completePath(overrides = {}) {
  return makePath({ status: 'retained', ...overrides });
}

const PARTICIPANT_PASS = 'Password1!';
const ADMIN_PASS = 'Admin123!';

let adminId, participantId, participant2Id, cohortId, missionId;
let participantEmail, participant2Email;
let participantCookies, participant2Cookies, adminCookies;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword(PARTICIPANT_PASS);
  const adminHash = await hashPassword(ADMIN_PASS);

  adminId = randomUUID();
  participantId = randomUUID();
  participant2Id = randomUUID();
  cohortId = randomUUID();
  participantEmail = `s2p+${participantId.slice(0,6)}@ex.com`;
  participant2Email = `s2p2+${participant2Id.slice(0,6)}@ex.com`;

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s2admin@ex.com`, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilot S2', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  /* Both users on sprint 2 */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
    .run(randomUUID(), participant2Id, cohortId);

  /* S1 inventory for participant (pre-filled from S1) */
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's1_inventory', ?)`)
    .run(randomUUID(), participantId, JSON.stringify({
      version: 1, status: 'complete',
      sections: {
        A: ['Formation adultes', 'Animation ateliers'],
        B: ['10 ans corporate'],
        C: ['Secteur RH'],
        D: ['Réseau LinkedIn 500'],
        E: { available_time: '6h', constraints: 'Salariée', context: '' },
      },
      acknowledged: {},
      observation: 'Je vois que j\'ai plus d\'expériences que je ne pensais.',
      mission_submission_id: null,
    }));

  missionId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'C', 2, 'Pistes à Arbitrer', 1, 0, ?)`)
    .run(missionId, cohortId, adminId);

  const r1 = await request(app).post('/auth/login').send({ email: participantEmail, password: PARTICIPANT_PASS });
  participantCookies = r1.headers['set-cookie'];

  const r2 = await request(app).post('/auth/login').send({ email: participant2Email, password: PARTICIPANT_PASS });
  participant2Cookies = r2.headers['set-cookie'];

  const r3 = await request(app).post('/auth/login').send({ email: 's2admin@ex.com', password: ADMIN_PASS });
  adminCookies = r3.headers['set-cookie'];
});

afterAll(() => {
  try { resetDb(); } catch {}
});

/* ── 1. S1 inventory accessible in S2 context ──────────────────── */
describe('S1 → S2 prefill', () => {
  it('participant can read their S1 inventory from S2 context', async () => {
    const r = await request(app)
      .get('/api/s1/inventory')
      .set('Cookie', participantCookies);

    expect(r.status).toBe(200);
    expect(r.body.inventory).not.toBeNull();
    expect(r.body.inventory.sections.A).toContain('Formation adultes');
    expect(r.body.inventory.status).toBe('complete');
  });
});

/* ── 2. GET /api/s2/paths — empty ───────────────────────────────── */
describe('GET /api/s2/paths', () => {
  it('returns null when no paths exist', async () => {
    const r = await request(app)
      .get('/api/s2/paths')
      .set('Cookie', participant2Cookies);

    expect(r.status).toBe(200);
    expect(r.body.s2).toBeNull();
  });
});

/* ── 3. PUT /api/s2/paths — save draft ─────────────────────────── */
describe('PUT /api/s2/paths', () => {
  it('creates a draft with one exploring path', async () => {
    const r = await request(app)
      .put('/api/s2/paths')
      .set('Cookie', participantCookies)
      .send({ paths: [makePath({ name: 'Formation RH managers' })] });

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s2.status).toBe('draft');
    expect(r.body.s2.paths).toHaveLength(1);
    expect(r.body.s2.paths[0].name).toBe('Formation RH managers');
    expect(r.body.s2.paths[0].id).toBeTruthy();
  });

  it('requires paths field (array)', async () => {
    const r = await request(app)
      .put('/api/s2/paths')
      .set('Cookie', participantCookies)
      .send({ paths: 'not-an-array' });

    expect(r.status).toBe(400);
  });

  it('enforces max 5 active paths', async () => {
    const paths = [
      makePath({ name: 'P1' }),
      makePath({ name: 'P2' }),
      makePath({ name: 'P3' }),
      makePath({ name: 'P4' }),
      makePath({ name: 'P5' }),
      makePath({ name: 'P6 — trop' }),
    ];
    const r = await request(app)
      .put('/api/s2/paths')
      .set('Cookie', participantCookies)
      .send({ paths });

    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/maximum.*5/i);
  });

  it('discarded paths do NOT count toward the 5-path limit', async () => {
    const paths = [
      makePath({ name: 'P1' }),
      makePath({ name: 'P2' }),
      makePath({ name: 'P3' }),
      makePath({ name: 'P4' }),
      makePath({ name: 'P5' }),
      makePath({ name: 'Discardée', status: 'discarded' }),
    ];
    const r = await request(app)
      .put('/api/s2/paths')
      .set('Cookie', participantCookies)
      .send({ paths });

    expect(r.status).toBe(200);
    expect(r.body.s2.paths).toHaveLength(6);
  });

  it('enforces max 3 retained paths', async () => {
    const paths = [
      completePath({ name: 'R1' }),
      completePath({ name: 'R2' }),
      completePath({ name: 'R3' }),
      completePath({ name: 'R4 — trop' }),
    ];
    const r = await request(app)
      .put('/api/s2/paths')
      .set('Cookie', participantCookies)
      .send({ paths });

    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/maximum.*3/i);
  });
});

/* ── 4. GET /api/s2/paths — after save ─────────────────────────── */
describe('GET /api/s2/paths — after save', () => {
  it('returns saved paths correctly', async () => {
    await request(app).put('/api/s2/paths').set('Cookie', participantCookies)
      .send({ paths: [makePath({ name: 'Piste sauvegardée' })] });

    const r = await request(app).get('/api/s2/paths').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s2.paths[0].name).toBe('Piste sauvegardée');
  });
});

/* ── 5. Ownership isolation ─────────────────────────────────────── */
describe('ownership isolation', () => {
  it('participant2 cannot read participant1 paths', async () => {
    await request(app).put('/api/s2/paths').set('Cookie', participantCookies)
      .send({ paths: [makePath({ name: 'Piste privée participant1' })] });

    const r = await request(app).get('/api/s2/paths').set('Cookie', participant2Cookies);
    expect(r.status).toBe(200);
    expect(r.body.s2).toBeNull();
  });
});

/* ── 6. POST /api/s2/paths/submit ──────────────────────────────── */
describe('POST /api/s2/paths/submit', () => {
  it('creates mission_submission with retained paths snapshot', async () => {
    await request(app).put('/api/s2/paths').set('Cookie', participantCookies)
      .send({ paths: [completePath({ name: 'Piste à soumettre' })] });

    const r = await request(app).post('/api/s2/paths/submit').set('Cookie', participantCookies);

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.submission).not.toBeNull();
    expect(r.body.submission.status).toBe('submitted');
    expect(r.body.submission.mission_id).toBe(missionId);

    const rawDb = getDb(TEST_DB);
    const s2Row = rawDb.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths'`).get(participantId);
    const parsed = JSON.parse(s2Row.content);
    expect(parsed.status).toBe('complete');
  });

  it('requires at least one retained path', async () => {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const uid = randomUUID();
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NoRetain', 0)`)
      .run(uid, `noretain+${uid.slice(0,6)}@ex.com`, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
      .run(randomUUID(), uid, cohortId);
    const cr = await request(app).post('/auth/login').send({ email: `noretain+${uid.slice(0,6)}@ex.com`, password: PARTICIPANT_PASS });
    const cc = cr.headers['set-cookie'];

    await request(app).put('/api/s2/paths').set('Cookie', cc)
      .send({ paths: [makePath({ status: 'exploring' })] });

    const r = await request(app).post('/api/s2/paths/submit').set('Cookie', cc);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/retiens/i);
  });

  it('fails if missing starting_resource on retained path', async () => {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const uid = randomUUID();
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NoRes', 0)`)
      .run(uid, `nores+${uid.slice(0,6)}@ex.com`, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
      .run(randomUUID(), uid, cohortId);
    const cr = await request(app).post('/auth/login').send({ email: `nores+${uid.slice(0,6)}@ex.com`, password: PARTICIPANT_PASS });
    const cc = cr.headers['set-cookie'];

    await request(app).put('/api/s2/paths').set('Cookie', cc)
      .send({ paths: [completePath({ starting_resource: '' })] });

    const r = await request(app).post('/api/s2/paths/submit').set('Cookie', cc);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/ressource de départ/i);
  });

  it('fails if not on sprint 2', async () => {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const uid = randomUUID();
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sprint1', 0)`)
      .run(uid, `sp1+${uid.slice(0,6)}@ex.com`, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), uid, cohortId);
    const cr = await request(app).post('/auth/login').send({ email: `sp1+${uid.slice(0,6)}@ex.com`, password: PARTICIPANT_PASS });
    const cc = cr.headers['set-cookie'];

    await request(app).put('/api/s2/paths').set('Cookie', cc)
      .send({ paths: [completePath()] });

    const r = await request(app).post('/api/s2/paths/submit').set('Cookie', cc);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/sprint 2/i);
  });

  it('submission content is a snapshot of retained paths', async () => {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const uid = randomUUID();
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Snap2', 0)`)
      .run(uid, `snap2+${uid.slice(0,6)}@ex.com`, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
      .run(randomUUID(), uid, cohortId);
    const cr = await request(app).post('/auth/login').send({ email: `snap2+${uid.slice(0,6)}@ex.com`, password: PARTICIPANT_PASS });
    const cc = cr.headers['set-cookie'];

    await request(app).put('/api/s2/paths').set('Cookie', cc)
      .send({ paths: [completePath({ name: 'Ma piste RH' })] });

    const r = await request(app).post('/api/s2/paths/submit').set('Cookie', cc);
    expect(r.status).toBe(200);
    const content = JSON.parse(r.body.submission.content);
    expect(content.type).toBe('s2_paths_snapshot');
    expect(content.retained_paths).toHaveLength(1);
    expect(content.retained_paths[0].name).toBe('Ma piste RH');
  });

  it('acknowledged what_i_know satisfies the field requirement', async () => {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const uid = randomUUID();
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'AckKnow', 0)`)
      .run(uid, `ackknow+${uid.slice(0,6)}@ex.com`, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
      .run(randomUUID(), uid, cohortId);
    const cr = await request(app).post('/auth/login').send({ email: `ackknow+${uid.slice(0,6)}@ex.com`, password: PARTICIPANT_PASS });
    const cc = cr.headers['set-cookie'];

    await request(app).put('/api/s2/paths').set('Cookie', cc)
      .send({ paths: [completePath({ what_i_know: '', acknowledged: { what_i_know: true } })] });

    const r = await request(app).post('/api/s2/paths/submit').set('Cookie', cc);
    expect(r.status).toBe(200);
  });

  it('live data remains source of truth — snapshot does not replace participant_data', async () => {
    const rawDb = getDb(TEST_DB);
    const s2Row = rawDb.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths'`).get(participantId);
    const parsed = JSON.parse(s2Row.content);
    expect(parsed.paths).toBeDefined();
    expect(parsed.status).toBe('complete');
  });

  it('no mission found — marks complete without submission', async () => {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const uid = randomUUID();
    const noMissionCohortId = randomUUID();
    rawDb.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'No Mission', '2026-01-01', ?)`)
      .run(noMissionCohortId, adminId);
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NM2', 0)`)
      .run(uid, `nm2+${uid.slice(0,6)}@ex.com`, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, noMissionCohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
      .run(randomUUID(), uid, noMissionCohortId);
    const cr = await request(app).post('/auth/login').send({ email: `nm2+${uid.slice(0,6)}@ex.com`, password: PARTICIPANT_PASS });
    const cc = cr.headers['set-cookie'];

    await request(app).put('/api/s2/paths').set('Cookie', cc)
      .send({ paths: [completePath()] });

    const r = await request(app).post('/api/s2/paths/submit').set('Cookie', cc);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.submission).toBeNull();
  });
});

/* ── 7. Gate S3 — realigned (B21B.1) ───────────────────────────── */
describe('gate S3 — realigned (B21B.1)', () => {
  async function makeGateUser(name, suffix) {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const uid = randomUUID();
    const email = `${suffix}+${uid.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', ?, 0)`)
      .run(uid, email, hash, name);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
      .run(randomUUID(), uid, cohortId);
    const lr = await request(app).post('/auth/login').send({ email, password: PARTICIPANT_PASS });
    return { uid, email, cookie: lr.headers['set-cookie'] };
  }

  /* A — S2 draft only → ROUGE */
  it('A: S2 draft only => gateS3 ROUGE', async () => {
    const { evaluateGate } = await import('../gates.js');
    const { uid, cookie: ck } = await makeGateUser('DraftGate', 'draftg');
    await request(app).put('/api/s2/paths').set('Cookie', ck).send({ paths: [completePath()] });
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('ROUGE');
  });

  /* B — S2 live complete but no mission submission → ROUGE */
  it('B: S2 participant_data complete but not submitted => gateS3 ROUGE', async () => {
    const { evaluateGate } = await import('../gates.js');
    const rawDb = getDb(TEST_DB);
    const { uid, cookie: ck } = await makeGateUser('CompleteLive', 'complg');
    await request(app).put('/api/s2/paths').set('Cookie', ck).send({ paths: [completePath()] });
    // Mark participant_data complete without creating a mission_submissions row
    rawDb.prepare(`UPDATE participant_data SET content = json_patch(content, '{"status":"complete"}') WHERE owner_id = ? AND data_type = 's2_paths'`).run(uid);
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('ROUGE');
  });

  /* C — S2 mission submitted → VERT */
  it('C: S2 mission submitted => gateS3 VERT', async () => {
    const { evaluateGate } = await import('../gates.js');
    const rawDb = getDb(TEST_DB);
    const { uid, cookie: ck } = await makeGateUser('SubmitGate', 'subg');
    await request(app).put('/api/s2/paths').set('Cookie', ck).send({ paths: [completePath()] });
    // Insert a mission for sprint 2 and submit
    const mid = randomUUID();
    rawDb.prepare(`INSERT INTO missions (id, title, sprint_number, cohort_id, cadre_step, sort_order, created_by) VALUES (?, 'Mission S2', 2, NULL, 'C', 1, ?)`)
      .run(mid, adminId);
    await request(app).post('/api/s2/paths/submit').set('Cookie', ck);
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('VERT');
    expect(gate.conditions).toHaveLength(1);
    expect(gate.conditions[0].met).toBe(true);
  });

  /* D — S2 mission reviewed → VERT */
  it('D: S2 mission reviewed => gateS3 VERT', async () => {
    const { evaluateGate } = await import('../gates.js');
    const rawDb = getDb(TEST_DB);
    const { uid, cookie: ck } = await makeGateUser('ReviewGate', 'revg');
    await request(app).put('/api/s2/paths').set('Cookie', ck).send({ paths: [completePath()] });
    const mid = randomUUID();
    rawDb.prepare(`INSERT INTO missions (id, title, sprint_number, cohort_id, cadre_step, sort_order, created_by) VALUES (?, 'Mission S2 Rev', 2, NULL, 'C', 2, ?)`).run(mid, adminId);
    await request(app).post('/api/s2/paths/submit').set('Cookie', ck);
    rawDb.prepare(`UPDATE mission_submissions SET status = 'reviewed' WHERE user_id = ?`).run(uid);
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('VERT');
  });

  /* E — S2 mission approved → VERT */
  it('E: S2 mission approved => gateS3 VERT', async () => {
    const { evaluateGate } = await import('../gates.js');
    const rawDb = getDb(TEST_DB);
    const { uid, cookie: ck } = await makeGateUser('ApproveGate', 'apprg');
    await request(app).put('/api/s2/paths').set('Cookie', ck).send({ paths: [completePath()] });
    const mid = randomUUID();
    rawDb.prepare(`INSERT INTO missions (id, title, sprint_number, cohort_id, cadre_step, sort_order, created_by) VALUES (?, 'Mission S2 App', 2, NULL, 'C', 3, ?)`).run(mid, adminId);
    await request(app).post('/api/s2/paths/submit').set('Cookie', ck);
    rawDb.prepare(`UPDATE mission_submissions SET status = 'approved' WHERE user_id = ?`).run(uid);
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('VERT');
  });

  /* F — Weekly Review only (no S2 submission) → ROUGE */
  it('F: Weekly Review only => gateS3 ROUGE', async () => {
    const { evaluateGate } = await import('../gates.js');
    const rawDb = getDb(TEST_DB);
    const { uid } = await makeGateUser('WeeklyOnlyGate', 'wkg');
    rawDb.prepare(`INSERT INTO weekly_reviews (id, user_id, cohort_id, sprint_number, week_number) VALUES (?, ?, ?, 2, 1)`).run(randomUUID(), uid, cohortId);
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('ROUGE');
  });

  /* G — S2 submitted, ZERO strategic decisions → VERT (critical: no fake-decision dependency) */
  it('G: S2 submitted with zero strategic decisions => gateS3 VERT', async () => {
    const { evaluateGate } = await import('../gates.js');
    const rawDb = getDb(TEST_DB);
    const { uid, cookie: ck } = await makeGateUser('ZeroDecGate', 'zdg');
    await request(app).put('/api/s2/paths').set('Cookie', ck).send({ paths: [completePath()] });
    const mid = randomUUID();
    rawDb.prepare(`INSERT INTO missions (id, title, sprint_number, cohort_id, cadre_step, sort_order, created_by) VALUES (?, 'Mission S2 ZD', 2, NULL, 'C', 4, ?)`).run(mid, adminId);
    await request(app).post('/api/s2/paths/submit').set('Cookie', ck);
    // Confirm no decisions exist for this user
    const decCount = rawDb.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?`).get(uid)?.n ?? 0;
    expect(decCount).toBe(0);
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('VERT');
    expect(gate.conditions).toHaveLength(1);
  });

  /* video alone → ROUGE */
  it('video alone does NOT advance S2 (gate remains ROUGE)', async () => {
    const { evaluateGate } = await import('../gates.js');
    const { uid } = await makeGateUser('VideoOnly', 'vidonly');
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('ROUGE');
  });

  /* audio alone → ROUGE */
  it('audio alone does NOT advance S2 (gate remains ROUGE)', async () => {
    const { evaluateGate } = await import('../gates.js');
    const { uid } = await makeGateUser('AudioOnly', 'audonly');
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('ROUGE');
  });

  /* draft paths saved but not submitted → ROUGE */
  it('draft paths (not submitted) do NOT advance S2', async () => {
    const { evaluateGate } = await import('../gates.js');
    const { uid, cookie: ck } = await makeGateUser('DraftOnly2', 'draft2');
    await request(app).put('/api/s2/paths').set('Cookie', ck).send({ paths: [completePath()] });
    const gate = await evaluateGate(getAdapter(), uid, 3);
    expect(gate.status).toBe('ROUGE');
  });
});

/* ── 8. COPILOTE context includes S1 + S2 ──────────────────────── */
describe('COPILOTE context', () => {
  it('COPILOTE context includes s1_inventory and s2_paths', async () => {
    const { buildCopiloteContext } = await import('../copilote.js');
    const adapter = getAdapter();
    const ctx = await buildCopiloteContext(adapter, participantId, 'general');
    expect(ctx.structured.s1_inventory).not.toBeNull();
    expect(ctx.structured.s2_paths).not.toBeNull();
    expect(ctx.structured.s2_paths.status).toBe('complete');
  });

  it('PUT /api/s2/paths requires auth (AI cannot mutate without participant)', async () => {
    const r = await request(app).put('/api/s2/paths').send({ paths: [makePath()] });
    expect(r.status).toBe(401);
  });
});

/* ── 9. Admin can read S2 submission ────────────────────────────── */
describe('admin read — S2 data visible', () => {
  it('admin can read S2 submission via GET /api/admin/submissions', async () => {
    const r = await request(app).get('/api/admin/submissions?status=submitted').set('Cookie', adminCookies);
    expect(r.status).toBe(200);
    const sub = r.body.find(s => s.mission_id === missionId);
    expect(sub).toBeTruthy();
    expect(sub.status).toBe('submitted');

    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s2_paths_snapshot');
    expect(Array.isArray(content.retained_paths)).toBe(true);
  });
});
