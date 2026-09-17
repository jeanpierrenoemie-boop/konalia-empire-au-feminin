import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-admin-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'admin-test-secret-32-chars-minimum!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let adminCookie, participantCookie, eliteCookie;
let adminId, participantId, eliteId, cohortId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  adminId = randomUUID();
  participantId = randomUUID();
  eliteId = randomUUID();
  cohortId = randomUUID();

  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'NOEMIE_ADMIN','ADMIN','Admin',0)`)
    .run(adminId, 'admin@adm.test', hash);
  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'PARTICIPANTE_STARTER','STARTER','Marie',1)`)
    .run(participantId, 'marie@adm.test', hash);
  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'PARTICIPANTE_ELITE','ELITE','Sophie',1)`)
    .run(eliteId, 'sophie@adm.test', hash);

  db.prepare(`INSERT INTO cohorts (id,name,start_date,created_by) VALUES (?,?,?,?)`)
    .run(cohortId, 'Pilot', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id,user_id,cohort_id,plan) VALUES (?,?,?,'STARTER')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id,user_id,cohort_id,plan) VALUES (?,?,?,'ELITE')`)
    .run(randomUUID(), eliteId, cohortId);
  db.prepare(`INSERT INTO user_progress (id,user_id,cohort_id,cadre_step,sprint_number,week_in_sprint,gate_status,unlocked_at) VALUES (?,?,?,'C',1,1,'in_progress',datetime('now'))`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO user_progress (id,user_id,cohort_id,cadre_step,sprint_number,week_in_sprint,gate_status,unlocked_at) VALUES (?,?,?,'R',7,1,'in_progress',datetime('now'))`)
    .run(randomUUID(), eliteId, cohortId);
  db.prepare(`INSERT INTO pilotage_state (id,user_id,current_priority,next_action,blocker) VALUES (?,?,?,?,?)`)
    .run(randomUUID(), participantId, 'Valider offre', 'Contacter prospects', null);

  const [r1, r2, r3] = await Promise.all([
    request(app).post('/auth/login').send({ email: 'admin@adm.test', password: 'pass' }),
    request(app).post('/auth/login').send({ email: 'marie@adm.test', password: 'pass' }),
    request(app).post('/auth/login').send({ email: 'sophie@adm.test', password: 'pass' }),
  ]);
  adminCookie = r1.headers['set-cookie'];
  participantCookie = r2.headers['set-cookie'];
  eliteCookie = r3.headers['set-cookie'];
});

afterAll(() => { try { resetDb(); } catch {} });

describe('GET /api/admin/cockpit', () => {
  it('returns priority-ordered participants list', async () => {
    const res = await request(app)
      .get('/api/admin/cockpit')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.participants)).toBe(true);
    expect(res.body.participants.length).toBeGreaterThan(0);
    // Each participant has required fields
    const p = res.body.participants[0];
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('segment');
    expect(p).toHaveProperty('cohort_name');
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/cockpit')
      .set('Cookie', participantCookie);
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/cockpit');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/participant/:userId', () => {
  it('returns full participant detail', async () => {
    const res = await request(app)
      .get(`/api/admin/participant/${participantId}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(participantId);
    expect(Array.isArray(res.body.decisions)).toBe(true);
    expect(Array.isArray(res.body.gateLog)).toBe(true);
    expect(Array.isArray(res.body.interventions)).toBe(true);
    // password_hash never returned
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('returns 404 for unknown user', async () => {
    const res = await request(app)
      .get(`/api/admin/participant/${randomUUID()}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/gate-override', () => {
  it('creates override with reason and audit event', async () => {
    const res = await request(app)
      .post('/api/admin/gate-override')
      .set('Cookie', adminCookie)
      .send({
        user_id: participantId,
        sprint_number: 2,
        exception_type: 'VERT',
        reason: 'Cas exceptionnel validé en live lors du Lab #1',
      });

    expect(res.status).toBe(201);
    expect(res.body.exception_type).toBe('VERT');

    // Audit event was created
    const db = getDb();
    const audit = db.prepare(
      `SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 'gate_override'`
    ).get(participantId);
    expect(audit).toBeDefined();
    expect(audit.reason).toMatch(/exceptionnel/i);
  });

  it('returns 400 when reason is too short', async () => {
    const res = await request(app)
      .post('/api/admin/gate-override')
      .set('Cookie', adminCookie)
      .send({ user_id: participantId, sprint_number: 3, exception_type: 'VERT', reason: 'court' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when override already exists for same sprint', async () => {
    const res = await request(app)
      .post('/api/admin/gate-override')
      .set('Cookie', adminCookie)
      .send({
        user_id: participantId, sprint_number: 2,
        exception_type: 'VERT',
        reason: 'Tentative de doublon pour le sprint 2',
      });
    expect(res.status).toBe(409);
  });

  it('returns 400 with invalid exception_type', async () => {
    const res = await request(app)
      .post('/api/admin/gate-override')
      .set('Cookie', adminCookie)
      .send({ user_id: participantId, sprint_number: 4, exception_type: 'HACK', reason: 'Valide au moins 10 chars' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/intervention', () => {
  it('records intervention and audit event', async () => {
    const res = await request(app)
      .post('/api/admin/intervention')
      .set('Cookie', adminCookie)
      .send({ target_user_id: participantId, type: 'support', note: 'Appel de 20 minutes — déblocage parcours' });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('support');

    const db = getDb();
    const audit = db.prepare(
      `SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 'admin_intervention_support'`
    ).get(participantId);
    expect(audit).toBeDefined();
  });

  it('returns 400 for invalid type', async () => {
    const res = await request(app)
      .post('/api/admin/intervention')
      .set('Cookie', adminCookie)
      .send({ target_user_id: participantId, type: 'hack' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/correction-request', () => {
  it('records correction request and audit event', async () => {
    const res = await request(app)
      .post('/api/admin/correction-request')
      .set('Cookie', adminCookie)
      .send({ target_user_id: participantId, note: 'Mission S2 incomplète — revoir le livrable' });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('correction_request');
  });
});

describe('GET /api/admin/audit', () => {
  it('returns audit events list', async () => {
    const res = await request(app)
      .get('/api/admin/audit')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('filters by user_id', async () => {
    const res = await request(app)
      .get(`/api/admin/audit?user_id=${participantId}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    res.body.forEach(e => expect(e.target_user_id).toBe(participantId));
  });
});

describe('GET /api/admin/frictions', () => {
  it('returns unresolved frictions', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO pilot_frictions (id,user_id,friction,category) VALUES (?,?,?,?)`)
      .run(randomUUID(), participantId, 'Texte du sprint 3 confus', 'content');

    const res = await request(app)
      .get('/api/admin/frictions')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const f = res.body.find(f => f.user_id === participantId);
    expect(f).toBeDefined();
  });
});

describe('Elite endpoints', () => {
  it('admin can schedule elite session', async () => {
    const future = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
    const res = await request(app)
      .post('/api/elite/admin/sessions')
      .set('Cookie', adminCookie)
      .send({ user_id: eliteId, cohort_id: cohortId, point_number: 1, scheduled_at: future });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Ta Direction');
    expect(res.body.point_number).toBe(1);
  });

  it('returns 400 when trying to create elite session for Starter', async () => {
    const res = await request(app)
      .post('/api/elite/admin/sessions')
      .set('Cookie', adminCookie)
      .send({ user_id: participantId, cohort_id: cohortId, point_number: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ELITE/i);
  });

  it('elite participant can see own elite summary', async () => {
    const res = await request(app)
      .get('/api/elite')
      .set('Cookie', eliteCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(typeof res.body.total_points).toBe('number');
  });

  it('Starter participant gets 403 on elite endpoint', async () => {
    const res = await request(app)
      .get('/api/elite')
      .set('Cookie', participantCookie);
    expect(res.status).toBe(403);
  });

  it('admin can schedule revue prioritaire', async () => {
    const future = new Date(Date.now() + 14 * 24 * 3_600_000).toISOString();
    const res = await request(app)
      .post('/api/elite/admin/revues')
      .set('Cookie', adminCookie)
      .send({ user_id: eliteId, scheduled_at: future });
    expect(res.status).toBe(201);
    expect(res.body.user_id).toBe(eliteId);
  });
});
