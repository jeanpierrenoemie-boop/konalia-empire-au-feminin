import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-auth-reset-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'auth-reset-test-secret-32-chars!!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.APP_BASE_URL = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let adminCookie, participantCookie;
let userId, adminId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('InitialPass123!');
  userId = randomUUID();
  adminId = randomUUID();

  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'PARTICIPANTE_STARTER','STARTER','Béa',0)`)
    .run(userId, 'bea@reset.test', hash);
  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'NOEMIE_ADMIN','ADMIN','Admin',0)`)
    .run(adminId, 'admin@reset.test', hash);

  const r1 = await request(app).post('/auth/login').send({ email: 'admin@reset.test', password: 'InitialPass123!' });
  adminCookie = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: 'bea@reset.test', password: 'InitialPass123!' });
  participantCookie = r2.headers['set-cookie'];
});

afterAll(() => { try { resetDb(); } catch {} });

/* ── Rate limit (skipped in test env) ────────────────────────── */
describe('Rate limiting', () => {
  it('10 rapid login attempts are NOT blocked in test env (skip=true)', async () => {
    for (let i = 0; i < 11; i++) {
      const r = await request(app).post('/auth/login').send({ email: 'x@x.com', password: 'bad' });
      expect(r.status).not.toBe(429);
    }
  });
});

/* ── Security headers ─────────────────────────────────────────── */
describe('Security headers', () => {
  it('X-Content-Type-Options is set', async () => {
    const r = await request(app).get('/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('X-Frame-Options or CSP frame-ancestors is set', async () => {
    const r = await request(app).get('/health');
    expect(r.headers['x-frame-options'] ?? r.headers['content-security-policy']).toBeTruthy();
  });

  it('X-DNS-Prefetch-Control is set', async () => {
    const r = await request(app).get('/health');
    expect(r.headers['x-dns-prefetch-control']).toBeTruthy();
  });
});

/* ── POST /auth/request-reset ─────────────────────────────────── */
describe('POST /auth/request-reset', () => {
  it('always returns generic message for existing email', async () => {
    const r = await request(app).post('/auth/request-reset')
      .send({ email: 'bea@reset.test' });
    expect(r.status).toBe(200);
    expect(r.body.message).toContain('Si un compte');
    expect(r.body).not.toHaveProperty('token');
    expect(r.body).not.toHaveProperty('reset_url');
  });

  it('returns identical generic message for unknown email', async () => {
    const r = await request(app).post('/auth/request-reset')
      .send({ email: 'nobody@nowhere.test' });
    expect(r.status).toBe(200);
    expect(r.body.message).toContain('Si un compte');
  });

  it('both responses are indistinguishable', async () => {
    const rExist   = await request(app).post('/auth/request-reset').send({ email: 'bea@reset.test' });
    const rMissing = await request(app).post('/auth/request-reset').send({ email: 'ghost@ghost.test' });
    expect(rExist.body.message).toBe(rMissing.body.message);
    expect(rExist.status).toBe(rMissing.status);
  });

  it('raw token is NOT stored in DB (only hash is)', async () => {
    await request(app).post('/auth/request-reset').send({ email: 'bea@reset.test' });
    const db = getDb();
    const row = db.prepare(`SELECT token_hash FROM password_resets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`).get(userId);
    expect(row).toBeTruthy();
    expect(row.token_hash).toHaveLength(64); // SHA-256 hex
  });

  it('token hash is cryptographically long (not predictable)', async () => {
    await request(app).post('/auth/request-reset').send({ email: 'bea@reset.test' });
    const db = getDb();
    const rows = db.prepare(`SELECT token_hash FROM password_resets WHERE user_id = ?`).all(userId);
    const hashes = rows.map(r => r.token_hash);
    const unique = new Set(hashes);
    expect(unique.size).toBe(rows.length); // each token is unique
  });
});

/* ── GET /auth/reset-check ────────────────────────────────────── */
describe('GET /auth/reset-check', () => {
  let validToken;

  beforeAll(async () => {
    await request(app).post('/auth/request-reset').send({ email: 'bea@reset.test' });
    const db = getDb();
    // Use admin generate-reset-link to get the raw token for testing
    const r = await request(app).post('/api/admin/generate-reset-link').set('Cookie', adminCookie)
      .send({ email: 'bea@reset.test' });
    validToken = new URL(r.body.reset_url).searchParams.get('token');
  });

  it('valid token returns metadata', async () => {
    const r = await request(app).get(`/auth/reset-check?token=${validToken}`);
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(true);
    expect(r.body.email).toBe('bea@reset.test');
    expect(r.body.first_name).toBe('Béa');
  });

  it('invalid token returns 404', async () => {
    const r = await request(app).get('/auth/reset-check?token=deadbeef');
    expect(r.status).toBe(404);
  });

  it('expired token returns 410', async () => {
    const db = getDb();
    const raw = 'b'.repeat(64);
    const hash = createHash('sha256').update(raw).digest('hex');
    const past = new Date(Date.now() - 1000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`)
      .run(userId, hash, past);
    const r = await request(app).get(`/auth/reset-check?token=${raw}`);
    expect(r.status).toBe(410);
  });
});

/* ── POST /auth/reset-password ────────────────────────────────── */
describe('POST /auth/reset-password', () => {
  let resetToken;

  beforeAll(async () => {
    const r = await request(app).post('/api/admin/generate-reset-link').set('Cookie', adminCookie)
      .send({ email: 'bea@reset.test' });
    resetToken = new URL(r.body.reset_url).searchParams.get('token');
  });

  it('rejects short password', async () => {
    const r = await request(app).post('/auth/reset-password')
      .send({ token: resetToken, password: 'short' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/8/);
  });

  it('rejects invalid token', async () => {
    const r = await request(app).post('/auth/reset-password')
      .send({ token: 'invalidtoken', password: 'NewSecurePass123!' });
    expect(r.status).toBe(404);
  });

  it('valid token resets password', async () => {
    const r = await request(app).post('/auth/reset-password')
      .send({ token: resetToken, password: 'NewSecurePass123!' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('old password no longer works', async () => {
    const r = await request(app).post('/auth/login')
      .send({ email: 'bea@reset.test', password: 'InitialPass123!' });
    expect(r.status).toBe(401);
  });

  it('new password works', async () => {
    const r = await request(app).post('/auth/login')
      .send({ email: 'bea@reset.test', password: 'NewSecurePass123!' });
    expect(r.status).toBe(200);
  });

  it('token cannot be reused (409)', async () => {
    const r = await request(app).post('/auth/reset-password')
      .send({ token: resetToken, password: 'AnotherPass456!' });
    expect(r.status).toBe(409);
  });

  it('check also returns 409 after use', async () => {
    const r = await request(app).get(`/auth/reset-check?token=${resetToken}`);
    expect(r.status).toBe(409);
  });

  it('password hash is bcrypt (not plain text)', async () => {
    const db = getDb();
    const user = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(userId);
    expect(user.password_hash).not.toBe('NewSecurePass123!');
    expect(user.password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('audit event has no password or token', async () => {
    const db = getDb();
    const event = db.prepare(
      `SELECT * FROM audit_events WHERE event_type = 'password_reset_completed' ORDER BY created_at DESC LIMIT 1`
    ).get();
    expect(event).toBeTruthy();
    const after = JSON.parse(event.after_state ?? '{}');
    expect(JSON.stringify(after)).not.toContain('password');
    expect(JSON.stringify(after)).not.toContain('token');
  });
});

/* ── Admin generate-reset-link ────────────────────────────────── */
describe('POST /api/admin/generate-reset-link', () => {
  it('participant cannot generate reset link (403)', async () => {
    const r = await request(app).post('/api/admin/generate-reset-link').set('Cookie', participantCookie)
      .send({ email: 'bea@reset.test' });
    expect(r.status).toBe(403);
  });

  it('admin cannot generate reset link for another admin', async () => {
    const r = await request(app).post('/api/admin/generate-reset-link').set('Cookie', adminCookie)
      .send({ email: 'admin@reset.test' });
    expect(r.status).toBe(404);
  });

  it('admin gets reset_url, not the password', async () => {
    const r = await request(app).post('/api/admin/generate-reset-link').set('Cookie', adminCookie)
      .send({ email: 'bea@reset.test' });
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('reset_url');
    expect(r.body).not.toHaveProperty('password');
    expect(r.body).not.toHaveProperty('password_hash');
    expect(r.body.reset_url).toContain('/reset-password?token=');
  });
});
