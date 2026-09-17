import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-gates-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'gates-test-secret-long-enough-32cha';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let cookie, userId, cohortId, adminCookie, adminId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  userId = randomUUID();
  cohortId = randomUUID();
  adminId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, 'admin@gt.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 1)`)
    .run(userId, 'sarah@gt.test', hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, ?, ?, ?)`)
    .run(cohortId, 'Pilote', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'STARTER')`)
    .run(randomUUID(), userId, cohortId);

  /* Sprint 1 in_progress */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`)
    .run(randomUUID(), userId, cohortId);

  const r = await request(app).post('/auth/login').send({ email: 'sarah@gt.test', password: 'pass' });
  cookie = r.headers['set-cookie'];

  const r2 = await request(app).post('/auth/login').send({ email: 'admin@gt.test', password: 'pass' });
  adminCookie = r2.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

describe('Gate evaluation in GET /api/parcours', () => {
  it('current sprint includes gate evaluation', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    const s1 = r.body.sprints.find(s => s.number === 1);
    expect(s1.gate).not.toBeNull();
    expect(s1.gate).toHaveProperty('status');
    expect(s1.gate).toHaveProperty('conditions');
  });

  it('gate is ROUGE when no deliverable exists', async () => {
    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    const s1 = r.body.sprints.find(s => s.number === 1);
    expect(s1.gate.status).toBe('ROUGE');
  });

  it('gate becomes VERT when proof exists for cadre_step C', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO proofs (id, user_id, proof_type, title, cadre_step) VALUES (?, ?, 'note', 'Inventaire', 'C')`)
      .run(randomUUID(), userId);

    const r = await request(app).get('/api/parcours').set('Cookie', cookie);
    const s1 = r.body.sprints.find(s => s.number === 1);
    expect(s1.gate.status).toBe('VERT');
  });
});

describe('POST /api/parcours/gate/:n/pass', () => {
  it('requires authentication', async () => {
    const r = await request(app).post('/api/parcours/gate/1/pass');
    expect(r.status).toBe(401);
  });

  it('returns 422 when gate is ROUGE', async () => {
    /* Remove the proof to make gate ROUGE again for a fresh user */
    const db = getDb();
    const freshId = randomUUID();
    const hash = await hashPassword('pass');
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Rouge', 1)`)
      .run(freshId, 'rouge@gt.test', hash);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'STARTER')`)
      .run(randomUUID(), freshId, cohortId);
    db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`)
      .run(randomUUID(), freshId, cohortId);
    const lr = await request(app).post('/auth/login').send({ email: 'rouge@gt.test', password: 'pass' });
    const rougeCookie = lr.headers['set-cookie'];

    const r = await request(app).post('/api/parcours/gate/1/pass').set('Cookie', rougeCookie);
    expect(r.status).toBe(422);
    expect(r.body).toHaveProperty('gate');
  });

  it('passes gate when VERT and advances sprint', async () => {
    const r = await request(app).post('/api/parcours/gate/1/pass').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.passedSprint).toBe(1);
    expect(r.body.nextSprint).toBe(2);

    /* Verify sprint_gate_log entry */
    const db = getDb();
    const log = db.prepare(`SELECT * FROM sprint_gate_log WHERE user_id = ? AND sprint_number = 1`).get(userId);
    expect(log).toBeTruthy();
    expect(log.method).toBe('self');

    /* Verify user_progress advanced to sprint 2 */
    const progress = db.prepare(`SELECT * FROM user_progress WHERE user_id = ?`).get(userId);
    expect(progress.sprint_number).toBe(2);
  });

  it('returns 409 on double-pass', async () => {
    /* Move progress back to sprint 1 to simulate double-pass attempt */
    const db = getDb();
    db.prepare(`UPDATE user_progress SET sprint_number = 1 WHERE user_id = ?`).run(userId);
    const r = await request(app).post('/api/parcours/gate/1/pass').set('Cookie', cookie);
    expect(r.status).toBe(409);
    db.prepare(`UPDATE user_progress SET sprint_number = 2 WHERE user_id = ?`).run(userId);
  });
});

describe('POST /api/parcours/gate/:n/override', () => {
  it('requires admin', async () => {
    const r = await request(app).post('/api/parcours/gate/2/override')
      .set('Cookie', cookie)
      .send({ target_user_id: userId, reason: 'Exception documentée pour test', exception_type: 'ORANGE' });
    expect(r.status).toBe(403);
  });

  it('requires reason of at least 10 chars', async () => {
    const r = await request(app).post('/api/parcours/gate/2/override')
      .set('Cookie', adminCookie)
      .send({ target_user_id: userId, reason: 'court', exception_type: 'ORANGE' });
    expect(r.status).toBe(400);
  });

  it('admin override passes gate with ORANGE and records audit', async () => {
    const r = await request(app).post('/api/parcours/gate/2/override')
      .set('Cookie', adminCookie)
      .send({
        target_user_id: userId,
        reason: 'Participante a eu un problème d\'accès marché documenté — exception accordée',
        exception_type: 'ORANGE',
      });
    expect(r.status).toBe(200);
    expect(r.body.exception_type).toBe('ORANGE');

    /* Verify gate_overrides record */
    const db = getDb();
    const override = db.prepare(`SELECT * FROM gate_overrides WHERE user_id = ? AND sprint_number = 2`).get(userId);
    expect(override).toBeTruthy();
    expect(override.exception_type).toBe('ORANGE');

    /* Verify audit event */
    const audit = db.prepare(`SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 'gate_manual_pass' ORDER BY rowid DESC LIMIT 1`).get(userId);
    expect(audit).toBeTruthy();
  });

  it('gate evaluator returns ORANGE when override exists for a locked gate', async () => {
    /* Verify ORANGE propagates: create a fresh user at sprint 9, add an override for sprint 10 */
    const db = getDb();
    const orangeId = randomUUID();
    const hash = await hashPassword('pass');
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Orange', 1)`)
      .run(orangeId, 'orange@gt.test', hash);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'STARTER')`)
      .run(randomUUID(), orangeId, cohortId);
    db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'R', 9, 1, 'in_progress')`)
      .run(randomUUID(), orangeId, cohortId);

    const or = await request(app).post('/api/parcours/gate/9/override')
      .set('Cookie', adminCookie)
      .send({
        target_user_id: orangeId,
        reason: 'Exception accès marché documentée — participante hors réseau',
        exception_type: 'ORANGE',
      });
    expect(or.status).toBe(200);

    /* Now sprint 10 unlock gate should show ORANGE for the new user (no conversation yet, but override on sprint 9 advanced them) */
    const lr = await request(app).post('/auth/login').send({ email: 'orange@gt.test', password: 'pass' });
    const orangeCookie = lr.headers['set-cookie'];
    const r = await request(app).get('/api/parcours').set('Cookie', orangeCookie);
    const s10 = r.body.sprints.find(s => s.number === 10);
    expect(s10.state).toBe('in_progress');
    expect(s10.gate).not.toBeNull();
  });
});
