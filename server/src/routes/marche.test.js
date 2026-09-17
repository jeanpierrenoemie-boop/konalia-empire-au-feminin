/**
 * Mon Marché — CRM routes tests
 * Tests: phase gate, signal integrity, commercial intent, cross-user isolation, CRUD
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-marche-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'marche-test-secret-long-enough-32c';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let cookieR, cookieC, cookieAdmin, cookieOther;
let userRId, userCId, adminId, otherUserId;
let cohortId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');

  userRId   = randomUUID();
  userCId   = randomUUID();
  adminId   = randomUUID();
  otherUserId = randomUUID();
  cohortId  = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
              VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Alice', 1)`)
    .run(userRId, 'alice@marche.test', hash);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
              VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Claire', 1)`)
    .run(userCId, 'claire@marche.test', hash);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
              VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Noémie', 0)`)
    .run(adminId, 'admin@marche.test', hash);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
              VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Other', 1)`)
    .run(otherUserId, 'other@marche.test', hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, status, created_by) VALUES (?, 'Test', '2025-01-01', 'active', ?)`)
    .run(cohortId, adminId);

  // Alice is at step R (unlocked)
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status)
              VALUES (?, ?, ?, 'R', 1, 1, 'in_progress')`)
    .run(randomUUID(), userRId, cohortId);

  // Claire is at step C (locked)
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status)
              VALUES (?, ?, ?, 'C', 1, 1, 'in_progress')`)
    .run(randomUUID(), userCId, cohortId);

  // other user at step R but different user
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status)
              VALUES (?, ?, ?, 'R', 1, 1, 'in_progress')`)
    .run(randomUUID(), otherUserId, cohortId);

  const rAlice  = await request(app).post('/auth/login').send({ email: 'alice@marche.test', password: 'pass' });
  cookieR = rAlice.headers['set-cookie'];

  const rClaire = await request(app).post('/auth/login').send({ email: 'claire@marche.test', password: 'pass' });
  cookieC = rClaire.headers['set-cookie'];

  const rAdmin  = await request(app).post('/auth/login').send({ email: 'admin@marche.test', password: 'pass' });
  cookieAdmin = rAdmin.headers['set-cookie'];

  const rOther  = await request(app).post('/auth/login').send({ email: 'other@marche.test', password: 'pass' });
  cookieOther = rOther.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── Phase gate ──────────────────────────────────────────────────────────────── */
describe('Phase gate', () => {
  it('returns 403 for user at step C (before R)', async () => {
    const r = await request(app).get('/api/marche/contacts').set('Cookie', cookieC);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('LOCKED');
  });

  it('returns 200 for user at step R', async () => {
    const r = await request(app).get('/api/marche/contacts').set('Cookie', cookieR);
    expect(r.status).toBe(200);
  });

  it('admin bypasses phase gate', async () => {
    const r = await request(app).get('/api/marche/contacts').set('Cookie', cookieAdmin);
    expect(r.status).toBe(200);
  });

  it('returns 401 without auth', async () => {
    const r = await request(app).get('/api/marche/contacts');
    expect(r.status).toBe(401);
  });
});

/* ── Full CRUD ───────────────────────────────────────────────────────────────── */
let contactId, convId, signalId;

describe('POST /api/marche/contacts', () => {
  it('creates a contact', async () => {
    const r = await request(app).post('/api/marche/contacts').set('Cookie', cookieR)
      .send({ name: 'Marie Martin', source: 'LinkedIn', circle: 'connaissance' });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('Marie Martin');
    expect(r.body.status).toBe('prospect');
    expect(r.body.commercial_intent).toBeNull();
    contactId = r.body.id;
  });

  it('requires name', async () => {
    const r = await request(app).post('/api/marche/contacts').set('Cookie', cookieR).send({});
    expect(r.status).toBe(400);
  });

  it('rejects invalid circle', async () => {
    const r = await request(app).post('/api/marche/contacts').set('Cookie', cookieR)
      .send({ name: 'X', circle: 'stranger' });
    expect(r.status).toBe(400);
  });
});

describe('GET /api/marche/contacts', () => {
  it('lists contacts for authenticated user', async () => {
    const r = await request(app).get('/api/marche/contacts').set('Cookie', cookieR);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.some(c => c.id === contactId)).toBe(true);
  });
});

describe('GET /api/marche/contacts/:id', () => {
  it('returns full contact with conversations and signals', async () => {
    const r = await request(app).get(`/api/marche/contacts/${contactId}`).set('Cookie', cookieR);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(contactId);
    expect(Array.isArray(r.body.conversations)).toBe(true);
    expect(Array.isArray(r.body.signals)).toBe(true);
  });

  it('returns 404 for unknown id', async () => {
    const r = await request(app).get(`/api/marche/contacts/${randomUUID()}`).set('Cookie', cookieR);
    expect(r.status).toBe(404);
  });
});

describe('PUT /api/marche/contacts/:id', () => {
  it('updates status and next_action', async () => {
    const r = await request(app).put(`/api/marche/contacts/${contactId}`).set('Cookie', cookieR)
      .send({ status: 'en_cours', next_action: 'Rappeler mardi' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('en_cours');
    expect(r.body.next_action).toBe('Rappeler mardi');
  });

  it('rejects invalid status', async () => {
    const r = await request(app).put(`/api/marche/contacts/${contactId}`).set('Cookie', cookieR)
      .send({ status: 'hot_lead' });
    expect(r.status).toBe(400);
  });
});

describe('POST /api/marche/conversations', () => {
  it('creates a conversation linked to contact', async () => {
    const r = await request(app).post('/api/marche/conversations').set('Cookie', cookieR)
      .send({ contact_id: contactId, date: '2025-10-01', summary: 'Premier échange, elle semble intéressée' });
    expect(r.status).toBe(201);
    expect(r.body.contact_id).toBe(contactId);
    convId = r.body.id;
  });

  it('requires contact_id, date, summary', async () => {
    const r = await request(app).post('/api/marche/conversations').set('Cookie', cookieR)
      .send({ date: '2025-10-01' });
    expect(r.status).toBe(400);
  });
});

describe('GET /api/marche/conversations', () => {
  it('lists conversations', async () => {
    const r = await request(app).get('/api/marche/conversations').set('Cookie', cookieR);
    expect(r.status).toBe(200);
    expect(r.body.some(c => c.id === convId)).toBe(true);
  });

  it('filters by contact_id', async () => {
    const r = await request(app).get(`/api/marche/conversations?contact_id=${contactId}`).set('Cookie', cookieR);
    expect(r.status).toBe(200);
    expect(r.body.every(c => c.contact_id === contactId)).toBe(true);
  });
});

describe('POST /api/marche/signals', () => {
  it('adds a signal to conversation', async () => {
    const r = await request(app).post('/api/marche/signals').set('Cookie', cookieR)
      .send({ conversation_id: convId, signal_type: 'politesse', content: '"C\'est bien ce que tu fais"', strength: 1 });
    expect(r.status).toBe(201);
    expect(r.body.signal_type).toBe('politesse');
    signalId = r.body.id;
  });

  it('rejects invalid signal_type', async () => {
    const r = await request(app).post('/api/marche/signals').set('Cookie', cookieR)
      .send({ conversation_id: convId, signal_type: 'pain', content: 'test' });
    expect(r.status).toBe(400);
  });

  it('rejects invalid strength', async () => {
    const r = await request(app).post('/api/marche/signals').set('Cookie', cookieR)
      .send({ conversation_id: convId, signal_type: 'politesse', content: 'test', strength: 5 });
    expect(r.status).toBe(400);
  });
});

/* ── Signal integrity ────────────────────────────────────────────────────────── */
describe('Signal integrity', () => {
  it('contact with only politesse has signal_ceiling=politesse', async () => {
    // Our contact only has a politesse signal added above
    const r = await request(app).get(`/api/marche/contacts/${contactId}`).set('Cookie', cookieR);
    expect(r.status).toBe(200);
    expect(r.body.signal_ceiling).toBe('politesse');
  });

  it('carte returns signal_ceiling=politesse, not engagement', async () => {
    const r = await request(app).get('/api/marche/carte').set('Cookie', cookieR);
    expect(r.status).toBe(200);
    const contact = r.body.contacts.find(c => c.id === contactId);
    expect(contact).toBeDefined();
    expect(contact.signal_ceiling).toBe('politesse');
    expect(contact.signal_ceiling).not.toBe('engagement');
  });

  it('carte upgrades ceiling when engagement signal added', async () => {
    // add engagement signal
    await request(app).post('/api/marche/signals').set('Cookie', cookieR)
      .send({ conversation_id: convId, signal_type: 'engagement', content: 'Elle veut démarrer', strength: 3 });

    const r = await request(app).get('/api/marche/carte').set('Cookie', cookieR);
    const contact = r.body.contacts.find(c => c.id === contactId);
    expect(contact.signal_ceiling).toBe('engagement');
  });
});

/* ── Commercial intent ───────────────────────────────────────────────────────── */
describe('Commercial intent', () => {
  it('commercial_intent is null by default', async () => {
    const r = await request(app).post('/api/marche/contacts').set('Cookie', cookieR)
      .send({ name: 'Sophie', source: 'email' });
    expect(r.status).toBe(201);
    expect(r.body.commercial_intent).toBeNull();
  });

  it('can be set explicitly on update', async () => {
    const create = await request(app).post('/api/marche/contacts').set('Cookie', cookieR)
      .send({ name: 'Jade', source: 'event' });
    const id = create.body.id;

    const r = await request(app).put(`/api/marche/contacts/${id}`).set('Cookie', cookieR)
      .send({ commercial_intent: 'exprime' });
    expect(r.status).toBe(200);
    expect(r.body.commercial_intent).toBe('exprime');
  });

  it('rejects invalid commercial_intent', async () => {
    const r = await request(app).put(`/api/marche/contacts/${contactId}`).set('Cookie', cookieR)
      .send({ commercial_intent: 'maybe' });
    expect(r.status).toBe(400);
  });
});

/* ── Cross-user isolation ────────────────────────────────────────────────────── */
describe('Cross-user isolation', () => {
  it('user B cannot read user A contact', async () => {
    const r = await request(app).get(`/api/marche/contacts/${contactId}`).set('Cookie', cookieOther);
    expect(r.status).toBe(404);
  });

  it('user B cannot update user A contact', async () => {
    const r = await request(app).put(`/api/marche/contacts/${contactId}`).set('Cookie', cookieOther)
      .send({ status: 'converti' });
    expect(r.status).toBe(404);
  });

  it('user B cannot add signal to user A conversation', async () => {
    const r = await request(app).post('/api/marche/signals').set('Cookie', cookieOther)
      .send({ conversation_id: convId, signal_type: 'politesse', content: 'intrus', strength: 1 });
    expect(r.status).toBe(404);
  });

  it('GET /api/marche/contacts only returns own contacts', async () => {
    const r = await request(app).get('/api/marche/contacts').set('Cookie', cookieOther);
    expect(r.status).toBe(200);
    expect(r.body.every(c => c.id !== contactId)).toBe(true);
  });
});

/* ── GET /api/marche/carte ───────────────────────────────────────────────────── */
describe('GET /api/marche/carte', () => {
  it('returns contacts, signal_matrix and summary', async () => {
    const r = await request(app).get('/api/marche/carte').set('Cookie', cookieR);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('contacts');
    expect(r.body).toHaveProperty('signal_matrix');
    expect(r.body).toHaveProperty('summary');
    expect(r.body.summary).toHaveProperty('total_contacts');
    expect(r.body.summary).toHaveProperty('with_expressed_problem');
    expect(r.body.summary).toHaveProperty('with_commercial_intent');
  });
});
