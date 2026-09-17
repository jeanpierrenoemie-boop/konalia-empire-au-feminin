import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-parcours-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'parcours-test-secret-long-enough-32ch';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let cookie, userId, cohortId, otherCookie;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  userId = randomUUID();
  cohortId = randomUUID();
  const adminId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, 'admin@par.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 1)`)
    .run(userId, 'sarah@par.test', hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, ?, ?, ?)`)
    .run(cohortId, 'Pilote', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'STARTER')`)
    .run(randomUUID(), userId, cohortId);

  /* Sprint 1 in_progress */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`)
    .run(randomUUID(), userId, cohortId);

  /* Sprint 2 passed — only via gate_log (user_progress tracks current sprint only) */
  db.prepare(`INSERT INTO sprint_gate_log (id, user_id, cohort_id, sprint_number, cadre_step, passed_by) VALUES (?, ?, ?, 2, 'C', ?)`)
    .run(randomUUID(), userId, cohortId, userId);

  const r = await request(app).post('/auth/login').send({ email: 'sarah@par.test', password: 'pass' });
  cookie = r.headers['set-cookie'];

  /* Other user — isolation check */
  const otherId = randomUUID();
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Autre', 1)`)
    .run(otherId, 'autre@par.test', hash);
  db.prepare(`INSERT INTO pilotage_state (id, user_id, current_priority) VALUES (?, ?, 'CONFIDENTIEL_PARCOURS')`)
    .run(randomUUID(), otherId);
  const r2 = await request(app).post('/auth/login').send({ email: 'autre@par.test', password: 'pass' });
  otherCookie = r2.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

describe('GET /api/parcours', () => {
  it('requires authentication', async () => {
    const r = await request(app).get('/api/parcours');
    expect(r.status).toBe(401);
  });

  it('returns 200 with phases and sprints', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('phases');
    expect(r.body).toHaveProperty('sprints');
    expect(r.body.phases).toHaveLength(5);
    expect(r.body.sprints).toHaveLength(12);
  });

  it('sprint 1 is in_progress', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    const s1 = r.body.sprints.find(s => s.number === 1);
    expect(s1.state).toBe('in_progress');
  });

  it('sprint 2 is passed and never re-locked', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    const s2 = r.body.sprints.find(s => s.number === 2);
    expect(s2.state).toBe('passed');
  });

  it('sprint 3 is locked (no progress row)', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    const s3 = r.body.sprints.find(s => s.number === 3);
    expect(s3.state).toBe('locked');
  });

  it('locked sprint has unlock_reason', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    const s3 = r.body.sprints.find(s => s.number === 3);
    expect(s3.unlock_reason).toBeTruthy();
  });

  it('currentSprintNumber points to in_progress sprint', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    expect(r.body.currentSprintNumber).toBe(1);
  });

  it('phase C is active (has in_progress sprint)', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    const phaseC = r.body.phases.find(p => p.step === 'C');
    expect(phaseC.state).toBe('active');
  });

  it('does not expose other user data', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    expect(JSON.stringify(r.body)).not.toContain('CONFIDENTIEL');
  });

  it('user with no progress gets all sprints locked', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', otherCookie);
    expect(r.status).toBe(200);
    const allLocked = r.body.sprints.every(s => s.state === 'locked');
    expect(allLocked).toBe(true);
  });
});
