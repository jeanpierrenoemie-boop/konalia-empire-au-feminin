import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-invitations-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'invitations-test-secret-32charss';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.APP_BASE_URL = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let adminCookie, participantCookie, adminId, cohortId, participantId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  adminId = randomUUID();
  participantId = randomUUID();
  cohortId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, 'admin@inv.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Participant', 1)`)
    .run(participantId, 'participant@inv.test', hash);
  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilote', '2025-01-01', ?)`)
    .run(cohortId, adminId);

  const r1 = await request(app).post('/auth/login').send({ email: 'admin@inv.test', password: 'pass' });
  adminCookie = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: 'participant@inv.test', password: 'pass' });
  participantCookie = r2.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── Admin creates invitation ─────────────────────────────────────── */
describe('POST /api/invitations', () => {
  it('requires authentication', async () => {
    const r = await request(app).post('/api/invitations')
      .send({ first_name: 'Test', email: 'x@x.com', cohort_id: cohortId, plan: 'STARTER' });
    expect(r.status).toBe(401);
  });

  it('participant cannot invite (403)', async () => {
    const r = await request(app).post('/api/invitations').set('Cookie', participantCookie)
      .send({ first_name: 'Test', email: 'x@x.com', cohort_id: cohortId, plan: 'STARTER' });
    expect(r.status).toBe(403);
  });

  it('rejects invalid email', async () => {
    const r = await request(app).post('/api/invitations').set('Cookie', adminCookie)
      .send({ first_name: 'Test', email: 'notanemail', cohort_id: cohortId, plan: 'STARTER' });
    expect(r.status).toBe(400);
  });

  it('rejects unknown cohort', async () => {
    const r = await request(app).post('/api/invitations').set('Cookie', adminCookie)
      .send({ first_name: 'Test', email: 'valid@test.com', cohort_id: 'nonexistent', plan: 'STARTER' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Cohorte/i);
  });

  it('rejects invalid plan', async () => {
    const r = await request(app).post('/api/invitations').set('Cookie', adminCookie)
      .send({ first_name: 'Test', email: 'valid@test.com', cohort_id: cohortId, plan: 'GOLD' });
    expect(r.status).toBe(400);
  });

  it('admin creates STARTER invitation successfully', async () => {
    const r = await request(app).post('/api/invitations').set('Cookie', adminCookie)
      .send({ first_name: 'Julie', last_name: 'Dupont', email: 'julie@new.test', cohort_id: cohortId, plan: 'STARTER' });
    expect(r.status).toBe(201);
    expect(r.body.email).toBe('julie@new.test');
    expect(r.body.plan).toBe('STARTER');
    expect(r.body.status).toBe('pending');
    expect(r.body.activation_url).toContain('/activate?token=');
    expect(r.body.token_hash).toBeUndefined(); /* never exposed */
  });

  it('admin creates ELITE invitation', async () => {
    const r = await request(app).post('/api/invitations').set('Cookie', adminCookie)
      .send({ first_name: 'Sonia', email: 'sonia@elite.test', cohort_id: cohortId, plan: 'ELITE' });
    expect(r.status).toBe(201);
    expect(r.body.plan).toBe('ELITE');
  });

  it('email already used by existing account is rejected (409)', async () => {
    const r = await request(app).post('/api/invitations').set('Cookie', adminCookie)
      .send({ first_name: 'Admin', email: 'admin@inv.test', cohort_id: cohortId, plan: 'STARTER' });
    expect(r.status).toBe(409);
  });
});

/* ── Token validation and activation ─────────────────────────────── */
describe('Invitation activation', () => {
  let validToken, invitationId;

  beforeAll(async () => {
    const r = await request(app).post('/api/invitations').set('Cookie', adminCookie)
      .send({ first_name: 'Marie', email: 'marie@activation.test', cohort_id: cohortId, plan: 'STARTER' });
    expect(r.status).toBe(201);
    invitationId = r.body.id;
    /* Extract token from URL */
    validToken = new URL(r.body.activation_url).searchParams.get('token');
  });

  it('GET /api/invitations/check with valid token returns invitation metadata', async () => {
    const r = await request(app).get(`/api/invitations/check?token=${validToken}`);
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(true);
    expect(r.body.first_name).toBe('Marie');
    expect(r.body.plan).toBe('STARTER');
    expect(r.body).not.toHaveProperty('token_hash');
  });

  it('GET /api/invitations/check with invalid token returns 404', async () => {
    const r = await request(app).get('/api/invitations/check?token=invalidtoken123');
    expect(r.status).toBe(404);
  });

  it('POST /api/invitations/activate with short password is rejected', async () => {
    const r = await request(app).post('/api/invitations/activate')
      .send({ token: validToken, password: 'short' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/8/);
  });

  it('POST /api/invitations/activate with valid token creates account', async () => {
    const r = await request(app).post('/api/invitations/activate')
      .send({ token: validToken, password: 'SecurePass123!' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.email).toBe('marie@activation.test');
  });

  it('token is invalidated after use (409)', async () => {
    const r = await request(app).post('/api/invitations/activate')
      .send({ token: validToken, password: 'AnotherPass123!' });
    expect(r.status).toBe(409);
  });

  it('GET check also returns 409 after activation', async () => {
    const r = await request(app).get(`/api/invitations/check?token=${validToken}`);
    expect(r.status).toBe(409);
  });

  it('activated STARTER account can login', async () => {
    const r = await request(app).post('/auth/login')
      .send({ email: 'marie@activation.test', password: 'SecurePass123!' });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe('PARTICIPANTE_STARTER');
    expect(r.body.tier).toBe('STARTER');
    expect(r.body.is_test).toBe(false);
  });

  it('activated account has correct cohort enrollment', async () => {
    const db = getDb();
    const user = db.prepare(`SELECT id FROM users WHERE email = 'marie@activation.test'`).get();
    const enrollment = db.prepare(`SELECT * FROM enrollments WHERE user_id = ?`).get(user.id);
    expect(enrollment).toBeTruthy();
    expect(enrollment.cohort_id).toBe(cohortId);
    expect(enrollment.plan).toBe('STARTER');
    expect(enrollment.status).toBe('active');
  });

  it('activated account has user_progress initialized at sprint 1', async () => {
    const db = getDb();
    const user = db.prepare(`SELECT id FROM users WHERE email = 'marie@activation.test'`).get();
    const progress = db.prepare(`SELECT * FROM user_progress WHERE user_id = ?`).get(user.id);
    expect(progress).toBeTruthy();
    expect(progress.sprint_number).toBe(1);
    expect(progress.cadre_step).toBe('C');
  });

  it('password is correctly hashed (not stored as plain text)', async () => {
    const db = getDb();
    const user = db.prepare(`SELECT password_hash FROM users WHERE email = 'marie@activation.test'`).get();
    expect(user.password_hash).not.toBe('SecurePass123!');
    expect(user.password_hash).toMatch(/^\$2[aby]\$/); /* bcrypt hash */
  });

  it('token raw value is not stored in DB', async () => {
    const db = getDb();
    const inv = db.prepare(`SELECT token_hash FROM invitations WHERE id = ?`).get(invitationId);
    /* token_hash is SHA-256, not the raw 64-char hex token */
    expect(inv.token_hash).toHaveLength(64);
    expect(inv.token_hash).not.toBe(validToken);
  });
});

/* ── Expired token ────────────────────────────────────────────────── */
describe('Expired token handling', () => {
  it('expired token is rejected', async () => {
    const db = getDb();
    const raw = 'a'.repeat(64); /* deterministic fake token */
    const hash = createHash('sha256').update(raw).digest('hex');
    const pastDate = new Date(Date.now() - 1000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(`INSERT INTO invitations (id, email, first_name, last_name, cohort_id, plan, token_hash, expires_at, created_by)
      VALUES (?, 'expired@test.com', 'Exp', '', ?, 'STARTER', ?, ?, ?)`)
      .run(randomUUID(), cohortId, hash, pastDate, adminId);

    const r = await request(app).get(`/api/invitations/check?token=${raw}`);
    expect([410, 404]).toContain(r.status); /* expired or auto-expired → not found/gone */
  });
});

/* ── Regeneration ─────────────────────────────────────────────────── */
describe('POST /api/invitations/:id/regenerate', () => {
  let invId, oldUrl;

  beforeAll(async () => {
    const r = await request(app).post('/api/invitations').set('Cookie', adminCookie)
      .send({ first_name: 'Regen', email: 'regen@test.com', cohort_id: cohortId, plan: 'STARTER' });
    invId = r.body.id;
    oldUrl = r.body.activation_url;
  });

  it('admin can regenerate a pending invitation', async () => {
    const r = await request(app).post(`/api/invitations/${invId}/regenerate`).set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.activation_url).not.toBe(oldUrl); /* new URL */
    expect(r.body.token_hash).toBeUndefined();
  });

  it('old token is invalidated after regeneration', async () => {
    const oldToken = new URL(oldUrl).searchParams.get('token');
    const r = await request(app).get(`/api/invitations/check?token=${oldToken}`);
    expect([404, 410]).toContain(r.status);
  });

  it('new token works', async () => {
    const r2 = await request(app).post(`/api/invitations/${invId}/regenerate`).set('Cookie', adminCookie);
    const newToken = new URL(r2.body.activation_url).searchParams.get('token');
    const check = await request(app).get(`/api/invitations/check?token=${newToken}`);
    expect(check.status).toBe(200);
    expect(check.body.valid).toBe(true);
  });
});

/* ── ELITE activation ─────────────────────────────────────────────── */
describe('ELITE invitation activation', () => {
  it('activated ELITE account has role PARTICIPANTE_ELITE and tier ELITE', async () => {
    /* sonia@elite.test was created earlier */
    const db = getDb();
    const inv = db.prepare(`SELECT * FROM invitations WHERE email = 'sonia@elite.test'`).get();
    /* We need the raw token — regenerate to get it */
    const regen = await request(app).post(`/api/invitations/${inv.id}/regenerate`).set('Cookie', adminCookie);
    const token = new URL(regen.body.activation_url).searchParams.get('token');

    const r = await request(app).post('/api/invitations/activate')
      .send({ token, password: 'ElitePass456!' });
    expect(r.status).toBe(200);

    const login = await request(app).post('/auth/login')
      .send({ email: 'sonia@elite.test', password: 'ElitePass456!' });
    expect(login.body.role).toBe('PARTICIPANTE_ELITE');
    expect(login.body.tier).toBe('ELITE');
    expect(login.body.is_test).toBe(false);
  });
});

/* ── Audit events ─────────────────────────────────────────────────── */
describe('Audit trail', () => {
  it('audit event participant_invited exists after invitation creation', async () => {
    const db = getDb();
    const audit = db.prepare(`SELECT * FROM audit_events WHERE event_type = 'participant_invited' ORDER BY created_at DESC LIMIT 1`).get();
    expect(audit).toBeTruthy();
  });

  it('audit event participant_activated exists after activation', async () => {
    const db = getDb();
    const audit = db.prepare(`SELECT * FROM audit_events WHERE event_type = 'participant_activated' ORDER BY created_at DESC LIMIT 1`).get();
    expect(audit).toBeTruthy();
  });

  it('audit event invitation_regenerated exists after regeneration', async () => {
    const db = getDb();
    const audit = db.prepare(`SELECT * FROM audit_events WHERE event_type = 'invitation_regenerated' ORDER BY created_at DESC LIMIT 1`).get();
    expect(audit).toBeTruthy();
  });
});

/* ── PILOT vs TEST isolation ──────────────────────────────────────── */
describe('PILOT vs TEST isolation', () => {
  it('test fixtures (is_test=1) are unaffected', async () => {
    /* Sarah Test and Amélie Test in the E2E test use is_test=1 — they remain is_test=1 */
    /* In this test context, participant@inv.test is is_test=1 and should still log in */
    const r = await request(app).post('/auth/login').send({ email: 'participant@inv.test', password: 'pass' });
    expect(r.status).toBe(200);
    expect(r.body.is_test).toBe(true);
  });

  it('invited real participant has is_test=0', async () => {
    const db = getDb();
    const user = db.prepare(`SELECT is_test FROM users WHERE email = 'marie@activation.test'`).get();
    expect(user.is_test).toBe(0);
  });
});
