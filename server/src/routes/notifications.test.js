import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-notif-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'notif-test-secret-32-chars-minimum!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let adminCookie, participantCookie, otherCookie;
let adminId, participantId, otherId, cohortId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  adminId = randomUUID();
  participantId = randomUUID();
  otherId = randomUUID();
  cohortId = randomUUID();

  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'NOEMIE_ADMIN','ADMIN','Admin',0)`)
    .run(adminId, 'admin@notif.test', hash);
  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'PARTICIPANTE_STARTER','STARTER','Marie',1)`)
    .run(participantId, 'marie@notif.test', hash);
  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'PARTICIPANTE_STARTER','STARTER','Sophie',1)`)
    .run(otherId, 'sophie@notif.test', hash);

  db.prepare(`INSERT INTO cohorts (id,name,start_date,created_by) VALUES (?,?,?,?)`)
    .run(cohortId, 'Test', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id,user_id,cohort_id,plan) VALUES (?,?,?,'STARTER')`)
    .run(randomUUID(), participantId, cohortId);

  const [r1, r2, r3] = await Promise.all([
    request(app).post('/auth/login').send({ email: 'admin@notif.test', password: 'pass' }),
    request(app).post('/auth/login').send({ email: 'marie@notif.test', password: 'pass' }),
    request(app).post('/auth/login').send({ email: 'sophie@notif.test', password: 'pass' }),
  ]);
  adminCookie = r1.headers['set-cookie'];
  participantCookie = r2.headers['set-cookie'];
  otherCookie = r3.headers['set-cookie'];
});

afterAll(() => { try { resetDb(); } catch {} });

describe('GET /api/notifications — empty state', () => {
  it('returns 0 unread and empty items initially', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Cookie', participantCookie);

    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(0);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });
});

describe('Notification triggers', () => {
  it('gate-override creates mission_validated notification', async () => {
    // Insert user_progress so participant has valid sprint
    const db = getDb();
    db.prepare(`INSERT INTO user_progress (id,user_id,cohort_id,cadre_step,sprint_number,week_in_sprint,gate_status,unlocked_at) VALUES (?,?,?,'C',1,1,'in_progress',datetime('now'))`)
      .run(randomUUID(), participantId, cohortId);

    await request(app)
      .post('/api/admin/gate-override')
      .set('Cookie', adminCookie)
      .send({ user_id: participantId, sprint_number: 5, exception_type: 'VERT', reason: 'Cas validé lors du Lab #2 en live' });

    const res = await request(app)
      .get('/api/notifications')
      .set('Cookie', participantCookie);

    expect(res.body.unread).toBeGreaterThan(0);
    const n = res.body.items.find(x => x.type === 'mission_validated');
    expect(n).toBeDefined();
    expect(n.title).toMatch(/Sprint 5/);
  });

  it('correction-request creates correction_requested notification', async () => {
    await request(app)
      .post('/api/admin/correction-request')
      .set('Cookie', adminCookie)
      .send({ target_user_id: participantId, note: 'Mission S2 incomplète — reprends le livrable.' });

    const res = await request(app)
      .get('/api/notifications')
      .set('Cookie', participantCookie);

    const n = res.body.items.find(x => x.type === 'correction_requested');
    expect(n).toBeDefined();
  });

  it('friction admin_response creates support_response notification', async () => {
    // Create a friction first
    const db = getDb();
    const fId = randomUUID();
    db.prepare(`INSERT INTO pilot_frictions (id,user_id,friction,category,severity) VALUES (?,?,?,?,?)`)
      .run(fId, participantId, 'Problème de navigation', 'navigation', 'VERT');

    await request(app)
      .patch(`/api/frictions/admin/${fId}`)
      .set('Cookie', adminCookie)
      .send({ admin_response: 'Problème identifié, correction en cours.', status: 'in_progress' });

    const res = await request(app)
      .get('/api/notifications')
      .set('Cookie', participantCookie);

    const n = res.body.items.find(x => x.type === 'support_response');
    expect(n).toBeDefined();
    expect(n.body).toMatch(/Problème identifié/);
  });
});

describe('POST /api/notifications/:id/read', () => {
  it('marks a notification as read', async () => {
    const listRes = await request(app)
      .get('/api/notifications')
      .set('Cookie', participantCookie);
    const unread = listRes.body.items.find(n => n.read === 0);
    expect(unread).toBeDefined();

    const res = await request(app)
      .post(`/api/notifications/${unread.id}/read`)
      .set('Cookie', participantCookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const after = await request(app)
      .get('/api/notifications')
      .set('Cookie', participantCookie);
    const stillUnread = after.body.items.find(n => n.id === unread.id && n.read === 0);
    expect(stillUnread).toBeUndefined();
  });

  it('returns 404 for another user notification', async () => {
    const listRes = await request(app)
      .get('/api/notifications')
      .set('Cookie', participantCookie);
    const first = listRes.body.items[0];

    const res = await request(app)
      .post(`/api/notifications/${first.id}/read`)
      .set('Cookie', otherCookie);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/notifications/read-all', () => {
  it('marks all as read', async () => {
    await request(app)
      .post('/api/notifications/read-all')
      .set('Cookie', participantCookie);

    const res = await request(app)
      .get('/api/notifications')
      .set('Cookie', participantCookie);
    expect(res.body.unread).toBe(0);
  });
});
