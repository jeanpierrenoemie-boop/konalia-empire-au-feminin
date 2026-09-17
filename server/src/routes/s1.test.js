/**
 * S1 — TON POINT DE CONTRÔLE — Tests
 * Build 21A: Inventory CRUD, ownership isolation, submit, admin read, gate S2.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-s1-test-${randomUUID()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's1-test-secret-32-chars-minimum!!';
process.env.JWT_EXPIRES_IN  = '1h';
process.env.COOKIE_SECURE   = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { getAdapter } from '../db/adapter.js';
import { createApp } from '../../server.js';

const app = createApp();

/* ── Persistent seeds (created once for all tests) ───────────────── */
let db;
let adminId, participantId, participantEmail, cohortId, missionId;
let participant2Id, participant2Email;
let adminCookies, participantCookies, participant2Cookies;

const PARTICIPANT_PASS = 'Password1!';
const ADMIN_PASS = 'Admin123!';

beforeAll(async () => {
  db = getDb(TEST_DB);
  const hash = await hashPassword(PARTICIPANT_PASS);
  const adminHash = await hashPassword(ADMIN_PASS);

  adminId = randomUUID();
  participantId = randomUUID();
  participant2Id = randomUUID();
  cohortId = randomUUID();
  participantEmail = `s1participant+${participantId.slice(0,6)}@ex.com`;
  participant2Email = `s1participant2+${participant2Id.slice(0,6)}@ex.com`;

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s1admin@ex.com`, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilot S1', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
    .run(randomUUID(), participant2Id, cohortId);

  missionId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'C', 1, 'Inventaire de Départ', 1, 0, ?)`)
    .run(missionId, cohortId, adminId);

  const r1 = await request(app).post('/auth/login').send({ email: participantEmail, password: PARTICIPANT_PASS });
  participantCookies = r1.headers['set-cookie'];

  const r2 = await request(app).post('/auth/login').send({ email: participant2Email, password: PARTICIPANT_PASS });
  participant2Cookies = r2.headers['set-cookie'];

  const r3 = await request(app).post('/auth/login').send({ email: 's1admin@ex.com', password: ADMIN_PASS });
  adminCookies = r3.headers['set-cookie'];
});

afterAll(() => {
  try { resetDb(); } catch {}
});

/* ── 1. GET /api/s1/inventory — no inventory yet ─────────────────── */
describe('GET /api/s1/inventory', () => {
  it('returns null when no inventory exists', async () => {
    const r = await request(app)
      .get('/api/s1/inventory')
      .set('Cookie', participant2Cookies);

    expect(r.status).toBe(200);
    expect(r.body.inventory).toBeNull();
  });
});

/* ── 2. PUT /api/s1/inventory — save draft ───────────────────────── */
describe('PUT /api/s1/inventory', () => {
  it('creates inventory draft with multi-entry sections', async () => {
    const r = await request(app)
      .put('/api/s1/inventory')
      .set('Cookie', participantCookies)
      .send({
        sections: {
          A: ['Je sais former des adultes', 'Je sais animer des ateliers'],
          B: ['10 ans dans la formation corporate'],
          C: ['Je connais le secteur RH'],
          D: ['Réseau LinkedIn de 500 contacts'],
          E: { available_time: '6h par semaine', constraints: 'Salariée à temps plein', context: '' },
        },
        observation: '',
      });

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.inventory.status).toBe('draft');
    expect(r.body.inventory.sections.A).toHaveLength(2);
    expect(r.body.inventory.sections.E.available_time).toBe('6h par semaine');
  });

  it('merges sections on subsequent saves', async () => {
    await request(app).put('/api/s1/inventory').set('Cookie', participantCookies)
      .send({ sections: { A: ['Compétence initiale'], B: [] } });

    const r = await request(app).put('/api/s1/inventory').set('Cookie', participantCookies)
      .send({ sections: { B: ['Expérience ajoutée'] }, observation: 'Je remarque ma polyvalence' });

    expect(r.status).toBe(200);
    expect(r.body.inventory.sections.A).toBeDefined();
    expect(r.body.inventory.sections.B).toContain('Expérience ajoutée');
    expect(r.body.inventory.observation).toBe('Je remarque ma polyvalence');
  });

  it('requires sections field', async () => {
    const r = await request(app).put('/api/s1/inventory').set('Cookie', participantCookies).send({});
    expect(r.status).toBe(400);
  });
});

/* ── 3. GET /api/s1/inventory — returns saved data ───────────────── */
describe('GET /api/s1/inventory — after save', () => {
  it('returns inventory with correct structure', async () => {
    await request(app).put('/api/s1/inventory').set('Cookie', participantCookies)
      .send({ sections: { A: ['Compétence alpha'] }, observation: 'Mon observation' });

    const r = await request(app).get('/api/s1/inventory').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.inventory.sections.A).toContain('Compétence alpha');
    expect(r.body.inventory.observation).toBe('Mon observation');
    expect(r.body.inventory.status).toBe('draft');
  });
});

/* ── 4. Ownership isolation ───────────────────────────────────────── */
describe('ownership isolation', () => {
  it('userB cannot read userA inventory', async () => {
    await request(app).put('/api/s1/inventory').set('Cookie', participantCookies)
      .send({ sections: { A: ['Compétence secrète userA'] } });

    const r = await request(app).get('/api/s1/inventory').set('Cookie', participant2Cookies);
    expect(r.status).toBe(200);
    expect(r.body.inventory).toBeNull();
  });
});

/* ── 5. POST /api/s1/inventory/submit ────────────────────────────── */
describe('POST /api/s1/inventory/submit', () => {
  it('creates mission_submission and marks inventory complete', async () => {
    await request(app).put('/api/s1/inventory').set('Cookie', participantCookies)
      .send({ sections: { A: ['Compétence principale'], B: [], C: [], D: [], E: { available_time: '4h', constraints: '', context: '' } } });

    const r = await request(app).post('/api/s1/inventory/submit').set('Cookie', participantCookies);

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.submission).not.toBeNull();
    expect(r.body.submission.status).toBe('submitted');
    expect(r.body.submission.mission_id).toBe(missionId);

    const rawDb = getDb(TEST_DB);
    const inv = rawDb.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's1_inventory'`).get(participantId);
    const parsed = JSON.parse(inv.content);
    expect(parsed.status).toBe('complete');
    expect(parsed.mission_submission_id).toBe(r.body.submission.id);
  });

  it('requires section A to have at least one entry', async () => {
    // participant2 has empty inventory
    await request(app).put('/api/s1/inventory').set('Cookie', participant2Cookies)
      .send({ sections: { A: [] } });

    const r = await request(app).post('/api/s1/inventory/submit').set('Cookie', participant2Cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/section A/i);
  });

  it('fails if no inventory exists', async () => {
    // Create a fresh user on sprint 1 with no inventory
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const freshId = randomUUID();
    const freshEmail = `fresh+${freshId.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Fresh', 0)`)
      .run(freshId, freshEmail, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), freshId, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), freshId, cohortId);
    const freshR = await request(app).post('/auth/login').send({ email: freshEmail, password: PARTICIPANT_PASS });
    const freshCookies = freshR.headers['set-cookie'];

    const r = await request(app).post('/api/s1/inventory/submit').set('Cookie', freshCookies);
    expect(r.status).toBe(400);
  });

  it('fails if not on sprint 1', async () => {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const sprint2Id = randomUUID();
    const sprint2Email = `sprint2+${sprint2Id.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sprint2', 0)`)
      .run(sprint2Id, sprint2Email, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), sprint2Id, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
      .run(randomUUID(), sprint2Id, cohortId);
    const s2R = await request(app).post('/auth/login').send({ email: sprint2Email, password: PARTICIPANT_PASS });
    const s2Cookies = s2R.headers['set-cookie'];

    await request(app).put('/api/s1/inventory').set('Cookie', s2Cookies)
      .send({ sections: { A: ['Compétence'] } });

    const r = await request(app).post('/api/s1/inventory/submit').set('Cookie', s2Cookies);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/sprint 1/i);
  });

  it('submission content is a snapshot of inventory', async () => {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const snapId = randomUUID();
    const snapEmail = `snap+${snapId.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Snap', 0)`)
      .run(snapId, snapEmail, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), snapId, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), snapId, cohortId);
    const snapR = await request(app).post('/auth/login').send({ email: snapEmail, password: PARTICIPANT_PASS });
    const snapCookies = snapR.headers['set-cookie'];

    await request(app).put('/api/s1/inventory').set('Cookie', snapCookies)
      .send({ sections: { A: ['Ma compétence X'] }, observation: 'Observation test' });

    const r = await request(app).post('/api/s1/inventory/submit').set('Cookie', snapCookies);
    expect(r.status).toBe(200);

    const contentParsed = JSON.parse(r.body.submission.content);
    expect(contentParsed.type).toBe('s1_inventory_snapshot');
    expect(contentParsed.sections.A).toContain('Ma compétence X');
    expect(contentParsed.observation).toBe('Observation test');
  });

  it('no mission found — marks complete without submission', async () => {
    // Create cohort without a mission
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const noMissionId = randomUUID();
    const noMissionEmail = `nomission+${noMissionId.slice(0,6)}@ex.com`;
    const noMissionCohortId = randomUUID();
    rawDb.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'No Mission Cohort', '2026-01-01', ?)`)
      .run(noMissionCohortId, adminId);
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NoMission', 0)`)
      .run(noMissionId, noMissionEmail, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), noMissionId, noMissionCohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), noMissionId, noMissionCohortId);
    const nmR = await request(app).post('/auth/login').send({ email: noMissionEmail, password: PARTICIPANT_PASS });
    const nmCookies = nmR.headers['set-cookie'];

    await request(app).put('/api/s1/inventory').set('Cookie', nmCookies)
      .send({ sections: { A: ['Compétence X'] } });

    const r = await request(app).post('/api/s1/inventory/submit').set('Cookie', nmCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.submission).toBeNull();
  });
});

/* ── 6. Gate S2 — submission unlocks gate ────────────────────────── */
describe('gate S2 — submission satisfies condition', () => {
  it('gateS2 is VERT after S1 mission submission', async () => {
    const { evaluateGate } = await import('../gates.js');
    const adapter = getAdapter();

    // Use a dedicated user for gate test (participantId may have already submitted)
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const gateUserId = randomUUID();
    const gateEmail = `gate+${gateUserId.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Gate', 0)`)
      .run(gateUserId, gateEmail, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), gateUserId, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), gateUserId, cohortId);
    const gr = await request(app).post('/auth/login').send({ email: gateEmail, password: PARTICIPANT_PASS });
    const gateCookies = gr.headers['set-cookie'];

    await request(app).put('/api/s1/inventory').set('Cookie', gateCookies)
      .send({ sections: { A: ['Compétence'] } });
    await request(app).post('/api/s1/inventory/submit').set('Cookie', gateCookies);

    const gate = await evaluateGate(adapter, gateUserId, 2);
    expect(gate.status).toBe('VERT');
  });

  it('gateS2 is ROUGE without submission or proof', async () => {
    const { evaluateGate } = await import('../gates.js');
    const adapter = getAdapter();

    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const rougeId = randomUUID();
    const rougeEmail = `rouge+${rougeId.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Rouge', 0)`)
      .run(rougeId, rougeEmail, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), rougeId, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), rougeId, cohortId);

    const gate = await evaluateGate(adapter, rougeId, 2);
    expect(gate.status).toBe('ROUGE');
  });

  it('weekly review alone does NOT satisfy gateS2', async () => {
    const { evaluateGate } = await import('../gates.js');
    const adapter = getAdapter();

    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const wkId = randomUUID();
    const wkEmail = `wk+${wkId.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Weekly', 0)`)
      .run(wkId, wkEmail, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), wkId, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), wkId, cohortId);
    rawDb.prepare(`INSERT INTO weekly_reviews (id, user_id, cohort_id, sprint_number, week_number, wins, blockers, next_week_focus, status) VALUES (?, ?, ?, 1, 1, 'Une victoire', '', '', 'submitted')`)
      .run(randomUUID(), wkId, cohortId);

    const gate = await evaluateGate(adapter, wkId, 2);
    expect(gate.status).toBe('ROUGE');
  });

  it('video/audio consumption alone does NOT satisfy gateS2', async () => {
    const { evaluateGate } = await import('../gates.js');
    const adapter = getAdapter();

    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const vidId = randomUUID();
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Video', 0)`)
      .run(vidId, `vid+${vidId.slice(0,6)}@ex.com`, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), vidId, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), vidId, cohortId);

    const gate = await evaluateGate(adapter, vidId, 2);
    expect(gate.status).toBe('ROUGE');
  });

  it('partial inventory (draft only) does NOT satisfy gateS2', async () => {
    const { evaluateGate } = await import('../gates.js');
    const adapter = getAdapter();

    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const draftId = randomUUID();
    const draftEmail = `draft+${draftId.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Draft', 0)`)
      .run(draftId, draftEmail, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), draftId, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), draftId, cohortId);
    const draftR = await request(app).post('/auth/login').send({ email: draftEmail, password: PARTICIPANT_PASS });
    const draftCookies = draftR.headers['set-cookie'];

    await request(app).put('/api/s1/inventory').set('Cookie', draftCookies)
      .send({ sections: { A: ['Compétence'] } });

    const gate = await evaluateGate(adapter, draftId, 2);
    expect(gate.status).toBe('ROUGE');
  });
});

/* ── 7. Admin read — inventory visible via submissions ───────────── */
describe('admin read — S1 data visible', () => {
  it('admin can read S1 submission via GET /api/admin/submissions', async () => {
    // Re-submit using a fresh user to ensure a clean submission
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PARTICIPANT_PASS);
    const adminReadId = randomUUID();
    const adminReadEmail = `adminread+${adminReadId.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'AdminRead', 0)`)
      .run(adminReadId, adminReadEmail, hash);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), adminReadId, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
      .run(randomUUID(), adminReadId, cohortId);
    const arR = await request(app).post('/auth/login').send({ email: adminReadEmail, password: PARTICIPANT_PASS });
    const arCookies = arR.headers['set-cookie'];

    await request(app).put('/api/s1/inventory').set('Cookie', arCookies)
      .send({ sections: { A: ['Compétence importante'] }, observation: 'Note admin' });
    await request(app).post('/api/s1/inventory/submit').set('Cookie', arCookies);

    const r = await request(app).get('/api/admin/submissions?status=submitted').set('Cookie', adminCookies);
    expect(r.status).toBe(200);
    const sub = r.body.find(s => s.mission_id === missionId && JSON.parse(s.content ?? '{}').sections?.A?.includes('Compétence importante'));
    expect(sub).toBeTruthy();
    expect(sub.status).toBe('submitted');

    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s1_inventory_snapshot');
    expect(content.sections.A).toContain('Compétence importante');
  });
});

/* ── 8. AI suggestion never mutates official inventory ───────────── */
describe('COPILOTE cannot mutate inventory without confirmation', () => {
  it('PUT /api/s1/inventory requires auth (no AI bypass)', async () => {
    const r = await request(app).put('/api/s1/inventory').send({ sections: { A: ['IA injecte'] } });
    expect(r.status).toBe(401);
  });
});
