import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

// Mock Anthropic SDK before any imports that use it
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      stream: async () => {
        async function* gen() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Bonjour, ' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'je suis ton COPILOTE.' } };
        }
        return gen();
      },
    };
  },
}));

const TEST_DB = path.join(os.tmpdir(), `rc-copilote-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'copilote-test-secret-long-enough-32ch';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.ANTHROPIC_API_KEY = 'sk-test-fake-key';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let cookie, userId, cohortId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  userId = randomUUID();
  cohortId = randomUUID();
  const adminId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, 'admin@cop.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 1)`)
    .run(userId, 'marie@cop.test', hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, ?, ?, ?)`)
    .run(cohortId, 'Test', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'STARTER')`)
    .run(randomUUID(), userId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`)
    .run(randomUUID(), userId, cohortId);
  db.prepare(`INSERT INTO profiles (user_id, display_name) VALUES (?, ?)`)
    .run(userId, 'Marie Test');
  db.prepare(`INSERT INTO pilotage_state (id, user_id, current_priority, next_action) VALUES (?, ?, ?, ?)`)
    .run(randomUUID(), userId, 'Valider mon persona', 'Contacter 3 prospects');

  // login
  const loginRes = await request(app)
    .post('/auth/login')
    .send({ email: 'marie@cop.test', password: 'pass' });

  cookie = loginRes.headers['set-cookie'];
});

afterAll(() => {
  try { resetDb(); } catch {}
});

describe('GET /api/copilote/thread', () => {
  it('creates a new thread when none exists', async () => {
    const res = await request(app)
      .get('/api/copilote/thread')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user_id: userId, status: 'active' });
    expect(res.body.id).toBeTruthy();
  });

  it('returns existing active thread on second call', async () => {
    const res1 = await request(app).get('/api/copilote/thread').set('Cookie', cookie);
    const res2 = await request(app).get('/api/copilote/thread').set('Cookie', cookie);
    expect(res1.body.id).toBe(res2.body.id);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/copilote/thread');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/copilote/chat', () => {
  it('returns SSE stream with delta events', async () => {
    const res = await request(app)
      .post('/api/copilote/chat')
      .set('Cookie', cookie)
      .send({ message: 'Bonjour, aide-moi à prioriser', shortcutType: 'general' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const body = res.text;
    expect(body).toContain('"type":"delta"');
    expect(body).toContain('"type":"done"');
  });

  it('returns 400 when message is missing', async () => {
    const res = await request(app)
      .post('/api/copilote/chat')
      .set('Cookie', cookie)
      .send({ shortcutType: 'general' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/copilote/chat without API key', () => {
  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const res = await request(app)
      .post('/api/copilote/chat')
      .set('Cookie', cookie)
      .send({ message: 'test' });

    process.env.ANTHROPIC_API_KEY = savedKey;
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ unavailable: true });
  });
});

describe('POST /api/copilote/apply-update', () => {
  it('updates pilotage_state with allowed fields', async () => {
    const res = await request(app)
      .post('/api/copilote/apply-update')
      .set('Cookie', cookie)
      .send({ updates: { current_priority: 'Nouvelle priorité', next_action: 'Appeler Isabelle' } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pilotage.current_priority).toBe('Nouvelle priorité');
    expect(res.body.pilotage.next_action).toBe('Appeler Isabelle');
  });

  it('rejects unknown fields', async () => {
    const res = await request(app)
      .post('/api/copilote/apply-update')
      .set('Cookie', cookie)
      .send({ updates: { decision_type: 'hack' } });

    expect(res.status).toBe(400);
  });

  it('returns 400 when no updates provided', async () => {
    const res = await request(app)
      .post('/api/copilote/apply-update')
      .set('Cookie', cookie)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/copilote/history/:threadId', () => {
  it('returns thread and messages', async () => {
    const threadRes = await request(app).get('/api/copilote/thread').set('Cookie', cookie);
    const threadId = threadRes.body.id;

    const res = await request(app)
      .get(`/api/copilote/history/${threadId}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.thread).toBeDefined();
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it('returns 404 for unknown thread', async () => {
    const res = await request(app)
      .get(`/api/copilote/history/${randomUUID()}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });
});
