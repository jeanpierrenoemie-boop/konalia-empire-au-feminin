import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-labs-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'labs-test-secret-32-chars-minimum!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let adminCookie, participantCookie, eliteCookie;
let adminId, participantId, eliteId, cohortId;
let labId, futureLabId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  adminId = randomUUID();
  participantId = randomUUID();
  eliteId = randomUUID();
  cohortId = randomUUID();

  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'NOEMIE_ADMIN','ADMIN','Admin',0)`)
    .run(adminId, 'admin@labs.test', hash);
  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'PARTICIPANTE_STARTER','STARTER','Marie',1)`)
    .run(participantId, 'marie@labs.test', hash);
  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'PARTICIPANTE_ELITE','ELITE','Sophie',1)`)
    .run(eliteId, 'sophie@labs.test', hash);

  db.prepare(`INSERT INTO cohorts (id,name,start_date,created_by) VALUES (?,?,?,?)`)
    .run(cohortId, 'Test Cohort', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id,user_id,cohort_id,plan) VALUES (?,?,?,'STARTER')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id,user_id,cohort_id,plan) VALUES (?,?,?,'ELITE')`)
    .run(randomUUID(), eliteId, cohortId);
  db.prepare(`INSERT INTO user_progress (id,user_id,cohort_id,cadre_step,sprint_number,week_in_sprint,gate_status,unlocked_at) VALUES (?,?,?,'C',1,1,'in_progress',datetime('now'))`)
    .run(randomUUID(), participantId, cohortId);

  // future lab (> 48h away) for most tests
  const future = new Date(Date.now() + 72 * 3_600_000).toISOString();
  labId = randomUUID();
  db.prepare(`INSERT INTO lab_sessions (id,cohort_id,title,topic,scheduled_at,created_by) VALUES (?,?,?,?,?,?)`)
    .run(labId, cohortId, 'Lab #1', 'Offre', future, adminId);

  // future lab < 24h away for late-flag test
  const soon = new Date(Date.now() + 10 * 3_600_000).toISOString();
  futureLabId = randomUUID();
  db.prepare(`INSERT INTO lab_sessions (id,cohort_id,title,topic,scheduled_at,created_by) VALUES (?,?,?,?,?,?)`)
    .run(futureLabId, cohortId, 'Lab #2 Urgent', 'Sprint', soon, adminId);

  const [r1, r2, r3] = await Promise.all([
    request(app).post('/auth/login').send({ email: 'admin@labs.test', password: 'pass' }),
    request(app).post('/auth/login').send({ email: 'marie@labs.test', password: 'pass' }),
    request(app).post('/auth/login').send({ email: 'sophie@labs.test', password: 'pass' }),
  ]);
  adminCookie = r1.headers['set-cookie'];
  participantCookie = r2.headers['set-cookie'];
  eliteCookie = r3.headers['set-cookie'];
});

afterAll(() => { try { resetDb(); } catch {} });

describe('GET /api/labs — participant view', () => {
  it('returns next_lab and empty accessible_labs when no done labs', async () => {
    const res = await request(app).get('/api/labs').set('Cookie', participantCookie);
    expect(res.status).toBe(200);
    expect(res.body.next_lab).toBeDefined();
    // Lab #2 Urgent is 10h away, Lab #1 is 72h away — next_lab returns the soonest
    expect(res.body.next_lab.title).toBe('Lab #2 Urgent');
    expect(res.body.next_lab.prelab_submitted).toBe(false);
    expect(Array.isArray(res.body.accessible_labs)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/labs');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/labs/:id/prelab — submission', () => {
  it('submits pre-lab with all fields, is_late=0 when > 24h away', async () => {
    const res = await request(app)
      .post(`/api/labs/${labId}/prelab`)
      .set('Cookie', participantCookie)
      .send({
        progress_since_last: 'Terminé le parcours S1',
        planned_mission: 'Tester mon offre',
        deliverable: 'Message testé avec 3 personnes',
        deliverable_status: 'en_cours',
        decision_taken: 'Cible les coachs',
        current_blocker: 'Pas de réponse',
        priority_question: 'Comment qualifier un prospect froid ?',
        key_point: 'Ma question sur la qualification',
        useful_to_group: true,
        authorise_case_use: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.prelab.priority_question).toBe('Comment qualifier un prospect froid ?');
    expect(res.body.prelab.is_late).toBe(0);
    expect(res.body.is_late).toBe(false);
  });

  it('marks is_late=1 when lab is < 24h away', async () => {
    const res = await request(app)
      .post(`/api/labs/${futureLabId}/prelab`)
      .set('Cookie', participantCookie)
      .send({ priority_question: 'Question urgente' });

    expect(res.status).toBe(201);
    expect(res.body.prelab.is_late).toBe(1);
    expect(res.body.is_late).toBe(true);
  });

  it('returns 400 when priority_question is missing', async () => {
    const anotherLab = randomUUID();
    const db = getDb();
    const future = new Date(Date.now() + 48 * 3_600_000).toISOString();
    db.prepare(`INSERT INTO lab_sessions (id,cohort_id,title,scheduled_at,created_by) VALUES (?,?,?,?,?)`)
      .run(anotherLab, cohortId, 'Lab #3', future, adminId);

    const res = await request(app)
      .post(`/api/labs/${anotherLab}/prelab`)
      .set('Cookie', participantCookie)
      .send({ planned_mission: 'Quelque chose' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prioritaire/i);
  });

  it('updates (upserts) existing pre-lab on second submit', async () => {
    const res = await request(app)
      .post(`/api/labs/${labId}/prelab`)
      .set('Cookie', participantCookie)
      .send({ priority_question: 'Question mise à jour' });

    expect(res.status).toBe(200);
    expect(res.body.prelab.priority_question).toBe('Question mise à jour');

    // No duplicate in DB
    const db = getDb();
    const count = db.prepare(`SELECT COUNT(*) AS n FROM lab_prelab WHERE lab_id = ? AND user_id = ?`)
      .get(labId, participantId);
    expect(count.n).toBe(1);
  });

  it('returns 403 when lab is done', async () => {
    const doneLabId = randomUUID();
    const db = getDb();
    db.prepare(`INSERT INTO lab_sessions (id,cohort_id,title,scheduled_at,status,created_by) VALUES (?,?,?,?,?,?)`)
      .run(doneLabId, cohortId, 'Lab Done', new Date(Date.now()-1000).toISOString(), 'done', adminId);

    const res = await request(app)
      .post(`/api/labs/${doneLabId}/prelab`)
      .set('Cookie', participantCookie)
      .send({ priority_question: 'Trop tard' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/labs/:id/prelab', () => {
  it('returns own submission', async () => {
    const res = await request(app)
      .get(`/api/labs/${labId}/prelab`)
      .set('Cookie', participantCookie);
    expect(res.status).toBe(200);
    expect(res.body.lab_id).toBe(labId);
  });

  it('returns null for participant with no submission on other lab', async () => {
    const anotherLab = randomUUID();
    const db = getDb();
    const future = new Date(Date.now() + 48 * 3_600_000).toISOString();
    db.prepare(`INSERT INTO lab_sessions (id,cohort_id,title,scheduled_at,created_by) VALUES (?,?,?,?,?)`)
      .run(anotherLab, cohortId, 'Lab Empty', future, adminId);

    const res = await request(app)
      .get(`/api/labs/${anotherLab}/prelab`)
      .set('Cookie', participantCookie);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe('accessible_labs — only done labs shown', () => {
  it('done lab appears in accessible_labs with resources', async () => {
    const doneId = randomUUID();
    const db = getDb();
    const past = new Date(Date.now() - 72 * 3_600_000).toISOString();
    db.prepare(`INSERT INTO lab_sessions (id,cohort_id,title,scheduled_at,status,replay_url,resources,created_by) VALUES (?,?,?,?,?,?,?,?)`)
      .run(doneId, cohortId, 'Lab Passé', past, 'done', 'https://replay.example.com',
        JSON.stringify([{ label: 'Slides', url: 'https://slides.example.com' }]), adminId);

    const res = await request(app).get('/api/labs').set('Cookie', participantCookie);
    expect(res.status).toBe(200);

    const found = res.body.accessible_labs.find(l => l.id === doneId);
    expect(found).toBeDefined();
    expect(found.replay_url).toBe('https://replay.example.com');
    expect(found.resources).toHaveLength(1);
  });
});

describe('Admin — labs management', () => {
  it('admin can create a lab', async () => {
    const future = new Date(Date.now() + 96 * 3_600_000).toISOString();
    const res = await request(app)
      .post('/api/labs/admin/labs')
      .set('Cookie', adminCookie)
      .send({ cohort_id: cohortId, title: 'Admin Lab', topic: 'Test', scheduled_at: future });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Admin Lab');
  });

  it('admin can update lab replay_url', async () => {
    const res = await request(app)
      .patch(`/api/labs/admin/labs/${labId}`)
      .set('Cookie', adminCookie)
      .send({ replay_url: 'https://replay.test', status: 'done' });

    expect(res.status).toBe(200);
    expect(res.body.replay_url).toBe('https://replay.test');
  });

  it('admin can view all pre-lab submissions for a lab', async () => {
    const res = await request(app)
      .get(`/api/labs/admin/labs/${labId}/prelabs`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.prelabs)).toBe(true);
    expect(res.body.prelabs.length).toBeGreaterThan(0);
  });

  it('returns 403 for non-admin trying admin endpoints', async () => {
    const res = await request(app)
      .get('/api/labs/admin/labs')
      .set('Cookie', participantCookie);
    expect(res.status).toBe(403);
  });
});

describe('Cross-user isolation', () => {
  it('participant B cannot see participant A\'s pre-lab via admin endpoint', async () => {
    // eliteCookie trying admin endpoint → 403
    const res = await request(app)
      .get(`/api/labs/admin/labs/${labId}/prelabs`)
      .set('Cookie', eliteCookie);
    expect(res.status).toBe(403);
  });

  it('participant gets 403 accessing lab from different cohort', async () => {
    const otherCohort = randomUUID();
    const db = getDb();
    db.prepare(`INSERT INTO cohorts (id,name,start_date,created_by) VALUES (?,?,?,?)`)
      .run(otherCohort, 'Other', '2025-01-01', adminId);
    const otherLab = randomUUID();
    const future = new Date(Date.now() + 48 * 3_600_000).toISOString();
    db.prepare(`INSERT INTO lab_sessions (id,cohort_id,title,scheduled_at,created_by) VALUES (?,?,?,?,?)`)
      .run(otherLab, otherCohort, 'Other Cohort Lab', future, adminId);

    const res = await request(app)
      .post(`/api/labs/${otherLab}/prelab`)
      .set('Cookie', participantCookie)
      .send({ priority_question: 'Hack' });
    expect(res.status).toBe(403);
  });
});
