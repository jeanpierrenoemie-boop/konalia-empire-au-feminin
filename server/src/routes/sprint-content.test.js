import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-sprint-content-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'sprint-content-test-secret-32chars';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let adminCookie, participantCookie, userId, adminId, cohortId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  userId = randomUUID();
  adminId = randomUUID();
  cohortId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, 'admin@sc.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 1)`)
    .run(userId, 'marie@sc.test', hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, ?, ?, ?)`)
    .run(cohortId, 'Promo SC', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'STARTER')`)
    .run(randomUUID(), userId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`)
    .run(randomUUID(), userId, cohortId);

  const r1 = await request(app).post('/auth/login').send({ email: 'admin@sc.test', password: 'pass' });
  adminCookie = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: 'marie@sc.test', password: 'pass' });
  participantCookie = r2.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

describe('GET /api/parcours — fallback to curriculum.js nulls', () => {
  it('returns sprints with null content fields when no sprint_content row exists', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', participantCookie);
    expect(r.status).toBe(200);
    const s1 = r.body.sprints.find(s => s.number === 1);
    expect(s1).toBeTruthy();
    expect(s1.result).toBeNull();
    expect(s1.mission).toBeNull();
    expect(s1.deliverable).toBeNull();
    /* Structural fields always present */
    expect(s1.cadre_step).toBe('C');
    expect(s1.title).toBeTruthy();
  });

  it('sprint order is preserved S1-S12', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', participantCookie);
    const numbers = r.body.sprints.map(s => s.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('Admin sprint-content CRUD', () => {
  it('GET returns null when no content exists', async () => {
    const r = await request(app).get('/api/admin/sprint-content/1').set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
  });

  it('participant cannot access admin sprint-content endpoint', async () => {
    const r = await request(app).get('/api/admin/sprint-content/1').set('Cookie', participantCookie);
    expect(r.status).toBe(403);
  });

  it('POST creates global sprint content', async () => {
    const r = await request(app).post('/api/admin/sprint-content/1').set('Cookie', adminCookie).send({
      result: 'Tu as une direction claire.',
      mission: 'Identifier ton ancre professionnelle.',
      deliverable: 'Passeport de Direction rempli.',
    });
    expect(r.status).toBe(201);
    expect(r.body.result).toBe('Tu as une direction claire.');
    expect(r.body.sprint_number).toBe(1);
    expect(r.body.cohort_id).toBeNull();
  });

  it('POST 409 on duplicate global row', async () => {
    const r = await request(app).post('/api/admin/sprint-content/1').set('Cookie', adminCookie).send({
      result: 'Duplicate attempt.',
    });
    expect(r.status).toBe(409);
  });

  it('PATCH updates existing content', async () => {
    const r = await request(app).patch('/api/admin/sprint-content/1').set('Cookie', adminCookie).send({
      result: 'Tu as une direction claire — version mise à jour.',
    });
    expect(r.status).toBe(200);
    expect(r.body.result).toBe('Tu as une direction claire — version mise à jour.');
  });

  it('PATCH 404 on non-existent sprint content', async () => {
    const r = await request(app).patch('/api/admin/sprint-content/7').set('Cookie', adminCookie).send({
      result: 'Missing sprint.',
    });
    expect(r.status).toBe(404);
  });

  it('PATCH rejects unknown fields', async () => {
    const r = await request(app).patch('/api/admin/sprint-content/1').set('Cookie', adminCookie).send({
      gate_status: 'VERT',
    });
    expect(r.status).toBe(400);
  });
});

describe('GET /api/parcours — DB content overrides nulls', () => {
  it('parcours returns DB content for sprint 1', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', participantCookie);
    const s1 = r.body.sprints.find(s => s.number === 1);
    expect(s1.result).toBe('Tu as une direction claire — version mise à jour.');
    expect(s1.mission).toBe('Identifier ton ancre professionnelle.');
  });

  it('cohort-specific content takes priority over global', async () => {
    const db = getDb();
    /* Insert cohort-specific row for sprint 1 */
    db.prepare(`INSERT INTO sprint_content (id, sprint_number, cohort_id, result) VALUES (?, 1, ?, ?)`)
      .run(randomUUID(), cohortId, 'Résultat spécifique cohorte.');

    const r = await request(app).get('/api/parcours').set('Cookie', participantCookie);
    const s1 = r.body.sprints.find(s => s.number === 1);
    expect(s1.result).toBe('Résultat spécifique cohorte.');
  });
});

describe('Gate logic unaffected by sprint_content', () => {
  it('gate evaluation is unchanged after adding sprint content', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', participantCookie);
    const s1 = r.body.sprints.find(s => s.number === 1);
    expect(s1.gate).not.toBeUndefined();
    expect(s1.gate).toHaveProperty('status');
  });
});
