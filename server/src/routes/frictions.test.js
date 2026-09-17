import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-frictions-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'frictions-test-secret-32-chars-ok!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let adminCookie, participantCookie, otherCookie;
let adminId, participantId, otherId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  adminId = randomUUID();
  participantId = randomUUID();
  otherId = randomUUID();

  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'NOEMIE_ADMIN','ADMIN','Admin',0)`)
    .run(adminId, 'admin@frictions.test', hash);
  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'PARTICIPANTE_STARTER','STARTER','Marie',1)`)
    .run(participantId, 'marie@frictions.test', hash);
  db.prepare(`INSERT INTO users (id,email,password_hash,role,tier,first_name,is_test) VALUES (?,?,?,'PARTICIPANTE_STARTER','STARTER','Sophie',1)`)
    .run(otherId, 'sophie@frictions.test', hash);

  const [r1, r2, r3] = await Promise.all([
    request(app).post('/auth/login').send({ email: 'admin@frictions.test', password: 'pass' }),
    request(app).post('/auth/login').send({ email: 'marie@frictions.test', password: 'pass' }),
    request(app).post('/auth/login').send({ email: 'sophie@frictions.test', password: 'pass' }),
  ]);
  adminCookie = r1.headers['set-cookie'];
  participantCookie = r2.headers['set-cookie'];
  otherCookie = r3.headers['set-cookie'];
});

afterAll(() => { try { resetDb(); } catch {} });

describe('POST /api/frictions', () => {
  it('creates a friction report', async () => {
    const res = await request(app)
      .post('/api/frictions')
      .set('Cookie', participantCookie)
      .send({ category: 'gate', friction: 'Je ne comprends pas pourquoi je suis ROUGE', severity: 'ROUGE' });

    expect(res.status).toBe(201);
    expect(res.body.category).toBe('gate');
    expect(res.body.severity).toBe('ROUGE');
    expect(res.body.status).toBe('open');
    expect(res.body.user_id).toBe(participantId);
  });

  it('defaults severity to VERT when not provided', async () => {
    const res = await request(app)
      .post('/api/frictions')
      .set('Cookie', participantCookie)
      .send({ category: 'navigation', friction: 'Impossible de trouver mon parcours' });

    expect(res.status).toBe(201);
    expect(res.body.severity).toBe('VERT');
  });

  it('returns 400 for invalid category', async () => {
    const res = await request(app)
      .post('/api/frictions')
      .set('Cookie', participantCookie)
      .send({ category: 'invalid', friction: 'Test' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid severity', async () => {
    const res = await request(app)
      .post('/api/frictions')
      .set('Cookie', participantCookie)
      .send({ category: 'gate', friction: 'Test', severity: 'HACK' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when friction text is missing', async () => {
    const res = await request(app)
      .post('/api/frictions')
      .set('Cookie', participantCookie)
      .send({ category: 'gate' });
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/frictions')
      .send({ category: 'gate', friction: 'Test' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/frictions — own frictions only', () => {
  it('returns only own frictions', async () => {
    const res = await request(app)
      .get('/api/frictions')
      .set('Cookie', participantCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach(f => expect(f.user_id).toBe(participantId));
  });

  it('sophie cannot see marie frictions', async () => {
    const res = await request(app)
      .get('/api/frictions')
      .set('Cookie', otherCookie);
    expect(res.status).toBe(200);
    res.body.forEach(f => expect(f.user_id).toBe(otherId));
  });
});

let createdId;

describe('GET /api/frictions/admin — admin views all', () => {
  it('returns all frictions sorted by severity', async () => {
    const res = await request(app)
      .get('/api/frictions/admin')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('first_name');
    // ROUGE first
    const rouge = res.body.findIndex(f => f.severity === 'ROUGE');
    const vert  = res.body.findIndex(f => f.severity === 'VERT');
    if (rouge >= 0 && vert >= 0) expect(rouge).toBeLessThan(vert);
    createdId = res.body[0].id;
  });

  it('filters by severity', async () => {
    const res = await request(app)
      .get('/api/frictions/admin?severity=ROUGE')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    res.body.forEach(f => expect(f.severity).toBe('ROUGE'));
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/frictions/admin')
      .set('Cookie', participantCookie);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/frictions/admin/:id — admin reviews', () => {
  it('admin can set decision and response', async () => {
    const res = await request(app)
      .patch(`/api/frictions/admin/${createdId}`)
      .set('Cookie', adminCookie)
      .send({ decision: 'AJUSTER', admin_response: 'Merci, on a identifié le problème et on ajuste le wording', status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.admin_decision).toBe('AJUSTER');
    expect(res.body.status).toBe('in_progress');
  });

  it('resolving sets resolved_at', async () => {
    const res = await request(app)
      .patch(`/api/frictions/admin/${createdId}`)
      .set('Cookie', adminCookie)
      .send({ status: 'resolved' });

    expect(res.status).toBe(200);
    expect(res.body.resolved_at).toBeDefined();
    expect(res.body.status).toBe('resolved');
  });

  it('returns 400 for invalid decision', async () => {
    const res = await request(app)
      .patch(`/api/frictions/admin/${createdId}`)
      .set('Cookie', adminCookie)
      .send({ decision: 'INVALID' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown friction', async () => {
    const res = await request(app)
      .patch(`/api/frictions/admin/${randomUUID()}`)
      .set('Cookie', adminCookie)
      .send({ decision: 'GARDER' });
    expect(res.status).toBe(404);
  });

  it('audit event created on decision', async () => {
    const newId = randomUUID();
    const db = getDb();
    db.prepare(`INSERT INTO pilot_frictions (id,user_id,friction,category,severity) VALUES (?,?,?,?,?)`)
      .run(newId, participantId, 'Autre friction', 'technique', 'ORANGE');

    await request(app)
      .patch(`/api/frictions/admin/${newId}`)
      .set('Cookie', adminCookie)
      .send({ decision: 'OBSERVER' });

    const audit = db.prepare(
      `SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 'friction_review'`
    ).get(participantId);
    expect(audit).toBeDefined();
  });
});

describe('Admin GET /api/admin/frictions — unresolved only', () => {
  it('does not include resolved frictions', async () => {
    const res = await request(app)
      .get('/api/admin/frictions')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    res.body.forEach(f => expect(f.status).not.toBe('resolved'));
  });
});
