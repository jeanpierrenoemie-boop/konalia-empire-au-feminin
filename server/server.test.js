import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';

/* ── Test environment setup ── */
const TEST_DB = path.join(os.tmpdir(), `rc-test-${randomUUID()}.db`);
const TEST_JWT = 'test-secret-long-enough-for-hs256-algorithm-32chars';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = TEST_JWT;
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { resetDb, getDb } from './src/db.js';
import { hashPassword } from './src/auth.js';
import { createApp } from './server.js';

const app = createApp();

/* ── Seed test users ── */
const USERS = {
  starter: {
    id: randomUUID(), email: 'sarah@test.local', password: 'pass-starter',
    role: 'PARTICIPANTE_STARTER', tier: 'STARTER',
    first_name: 'Sarah', cohort_id: 'cohort-1', is_test: 1,
  },
  elite: {
    id: randomUUID(), email: 'amelie@test.local', password: 'pass-elite',
    role: 'PARTICIPANTE_ELITE', tier: 'ELITE',
    first_name: 'Amélie', cohort_id: 'cohort-1', is_test: 1,
  },
  admin: {
    id: randomUUID(), email: 'admin@test.local', password: 'pass-admin',
    role: 'NOEMIE_ADMIN', tier: 'ADMIN',
    first_name: 'Noémie', cohort_id: null, is_test: 0,
  },
  qa: {
    id: randomUUID(), email: 'qa@test.local', password: 'pass-qa',
    role: 'TEST_QA', tier: 'TEST',
    first_name: 'QA', cohort_id: 'cohort-test', is_test: 1,
  },
  other: {
    id: randomUUID(), email: 'other@test.local', password: 'pass-other',
    role: 'PARTICIPANTE_STARTER', tier: 'STARTER',
    first_name: 'Autre', cohort_id: 'cohort-2', is_test: 1,
  },
};

let starterRecord;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const insert = db.prepare(`
    INSERT INTO users (id, email, password_hash, role, tier, first_name, cohort_id, is_test)
    VALUES (@id, @email, @password_hash, @role, @tier, @first_name, @cohort_id, @is_test)
  `);
  for (const u of Object.values(USERS)) {
    insert.run({ ...u, password_hash: await hashPassword(u.password) });
  }

  /* Create a participant_data record owned by starter */
  starterRecord = randomUUID();
  db.prepare(
    `INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, ?, ?)`
  ).run(starterRecord, USERS.starter.id, 'cockpit', '{"step":"C"}');

  /* Create a cohort content record for cohort-1 */
  db.prepare(
    `INSERT INTO cohort_content (id, cohort_id, content_key, content) VALUES (?, ?, ?, ?)`
  ).run('content-c1', 'cohort-1', 'module-1', '{"title":"Module 1"}');
});

afterAll(() => {
  try { import('fs').then(fs => fs.unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── Helper: login and return cookie ── */
async function loginAs(key) {
  const u = USERS[key];
  const res = await request(app).post('/auth/login').send({ email: u.email, password: u.password });
  expect(res.status, `login failed for ${key}: ${JSON.stringify(res.body)}`).toBe(200);
  return res.headers['set-cookie'];
}

/* ══════════════════════════════════════
   1. LOGIN / LOGOUT / SESSION
   ══════════════════════════════════════ */
describe('Auth — login / logout / session', () => {
  it('returns user data on valid login', async () => {
    const res = await request(app).post('/auth/login').send({
      email: USERS.starter.email, password: USERS.starter.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('PARTICIPANTE_STARTER');
    expect(res.body.tier).toBe('STARTER');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/auth/login').send({
      email: USERS.starter.email, password: 'wrong',
    });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'nobody@test.local', password: 'anything',
    });
    expect(res.status).toBe(401);
  });

  it('requires both fields', async () => {
    const res = await request(app).post('/auth/login').send({ email: USERS.starter.email });
    expect(res.status).toBe(400);
  });

  it('GET /auth/me returns user when authenticated', async () => {
    const cookie = await loginAs('starter');
    const res = await request(app).get('/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(USERS.starter.id);
  });

  it('GET /auth/me returns 401 with no cookie', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('logout returns ok and clears session cookie in response', async () => {
    const cookie = await loginAs('starter');
    const res = await request(app).post('/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    // Server must set rc_session to empty/expired
    const setCookie = res.headers['set-cookie']?.join('') ?? '';
    expect(setCookie).toMatch(/rc_session=;/);
    // Without cookie, /auth/me returns 401
    const me = await request(app).get('/auth/me');
    expect(me.status).toBe(401);
  });

  it('rejects tampered JWT', async () => {
    const res = await request(app).get('/auth/me')
      .set('Cookie', ['rc_session=invalid.jwt.token']);
    expect(res.status).toBe(401);
  });
});

/* ══════════════════════════════════════
   2. ROLE ENFORCEMENT — SERVER-SIDE
   ══════════════════════════════════════ */
describe('Roles — server-side enforcement', () => {
  it('STARTER cannot access admin participants list', async () => {
    const cookie = await loginAs('starter');
    const res = await request(app).get('/api/admin/participants').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('ELITE cannot access admin participants list', async () => {
    const cookie = await loginAs('elite');
    const res = await request(app).get('/api/admin/participants').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('ADMIN can access admin participants list', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app).get('/api/admin/participants').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('STARTER cannot access elite-only route', async () => {
    const cookie = await loginAs('starter');
    const res = await request(app).get('/api/elite/extra').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('ELITE can access elite-only route', async () => {
    const cookie = await loginAs('elite');
    const res = await request(app).get('/api/elite/extra').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('ADMIN can access elite-only route', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app).get('/api/elite/extra').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('unauthenticated request to protected route returns 401', async () => {
    const res = await request(app).get('/api/elite/extra');
    expect(res.status).toBe(401);
  });
});

/* ══════════════════════════════════════
   3. DATA OWNERSHIP — PARTICIPANT ISOLATION
   ══════════════════════════════════════ */
describe('Data ownership — participant isolation', () => {
  it('participant can read her own data', async () => {
    const cookie = await loginAs('starter');
    const res = await request(app).get(`/api/participant/${starterRecord}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.owner_id).toBe(USERS.starter.id);
  });

  it('another participant CANNOT read starter\'s data', async () => {
    const cookie = await loginAs('other');
    const res = await request(app).get(`/api/participant/${starterRecord}`).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('ELITE participant CANNOT read another participant\'s data', async () => {
    const cookie = await loginAs('elite');
    const res = await request(app).get(`/api/participant/${starterRecord}`).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('ADMIN can read any participant\'s data', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app).get(`/api/participant/${starterRecord}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('participant can create her own data record', async () => {
    const cookie = await loginAs('starter');
    const res = await request(app).post('/api/participant').set('Cookie', cookie)
      .send({ data_type: 'decision', content: { text: 'Test décision' } });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });
});

/* ══════════════════════════════════════
   4. COHORT ACCESS
   ══════════════════════════════════════ */
describe('Cohort content access', () => {
  it('participant in cohort-1 can read cohort-1 content', async () => {
    const cookie = await loginAs('starter');
    const res = await request(app).get('/api/cohort/content-c1').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('participant in different cohort CANNOT read cohort-1 content', async () => {
    const cookie = await loginAs('other');
    const res = await request(app).get('/api/cohort/content-c1').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('ADMIN can read any cohort content', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app).get('/api/cohort/content-c1').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

/* ══════════════════════════════════════
   5. TEST USER ISOLATION
   ══════════════════════════════════════ */
describe('Test user isolation', () => {
  function restoreAppEnv(orig) {
    if (orig === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = orig;
  }

  it('test user login is blocked in pilot environment', async () => {
    const orig = process.env.APP_ENV;
    process.env.APP_ENV = 'pilot';
    const res = await request(app).post('/auth/login').send({
      email: USERS.starter.email, password: USERS.starter.password,
    });
    restoreAppEnv(orig);
    expect(res.status).toBe(403);
  });

  it('non-test admin login works in pilot environment', async () => {
    const orig = process.env.APP_ENV;
    process.env.APP_ENV = 'pilot';
    const res = await request(app).post('/auth/login').send({
      email: USERS.admin.email, password: USERS.admin.password,
    });
    restoreAppEnv(orig);
    expect(res.status).toBe(200);
  });

  it('test user session is denied /auth/me in pilot', async () => {
    const cookie = await loginAs('starter');
    const orig = process.env.APP_ENV;
    process.env.APP_ENV = 'pilot';
    const res = await request(app).get('/auth/me').set('Cookie', cookie);
    restoreAppEnv(orig);
    expect(res.status).toBe(403);
  });
});

/* ══════════════════════════════════════
   6. ADMIN ACCESS — ALL PILOT RECORDS
   ══════════════════════════════════════ */
describe('Admin — full pilot access', () => {
  it('admin sees all users', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app).get('/api/admin/participants').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const ids = res.body.map(u => u.id);
    expect(ids).toContain(USERS.starter.id);
    expect(ids).toContain(USERS.elite.id);
  });

  it('admin can view any participant data by userId', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app)
      .get(`/api/admin/participant/${USERS.starter.id}/data`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('password_hash is never returned in any response', async () => {
    const cookie = await loginAs('admin');
    const res = await request(app).get('/api/admin/participants').set('Cookie', cookie);
    for (const u of res.body) {
      expect(u).not.toHaveProperty('password_hash');
    }
  });
});
