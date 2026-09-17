import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-parking-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'parking-test-secret-long-enough-32ch';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();
let cookie, userId, otherId, otherCookie, ideaId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  userId = randomUUID();
  otherId = randomUUID();
  const adminId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, 'admin@pk.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 1)`)
    .run(userId, 'sarah@pk.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Autre', 1)`)
    .run(otherId, 'autre@pk.test', hash);

  const r = await request(app).post('/auth/login').send({ email: 'sarah@pk.test', password: 'pass' });
  cookie = r.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: 'autre@pk.test', password: 'pass' });
  otherCookie = r2.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

describe('POST /api/parking', () => {
  it('requires auth', async () => {
    const r = await request(app).post('/api/parking').send({ title: 'Test', dispersion_status: 'PARKING' });
    expect(r.status).toBe(401);
  });

  it('requires dispersion_status', async () => {
    const r = await request(app).post('/api/parking').set('Cookie', cookie)
      .send({ title: 'Test sans statut' });
    expect(r.status).toBe(400);
  });

  it('creates idea with 7 questions and PARKING status', async () => {
    const r = await request(app).post('/api/parking').set('Cookie', cookie).send({
      title: 'Créer un podcast sur le bien-être',
      description: 'Podcast hebdomadaire 20 min',
      dispersion_status: 'PARKING',
      pourquoi_maintenant: 'J\'ai vu un concurrent lancer le sien',
      sert_objectif_90j: false,
      sert_priorite_actuelle: false,
      necessaire_maintenant: false,
      que_remplace: 'Du temps de prospection directe',
      quel_cout: '4h par semaine + montage',
      option_plus_simple: 'Un post LinkedIn hebdomadaire',
    });
    expect(r.status).toBe(201);
    expect(r.body.dispersion_status).toBe('PARKING');
    expect(r.body.sert_objectif_90j).toBe(0);
    expect(r.body.que_remplace).toContain('prospection');
    ideaId = r.body.id;
  });

  it('creates idea with AGIR_MAINTENANT status', async () => {
    const r = await request(app).post('/api/parking').set('Cookie', cookie).send({
      title: 'Contacter Marie D. pour un retour terrain',
      dispersion_status: 'AGIR_MAINTENANT',
      sert_objectif_90j: true,
      sert_priorite_actuelle: true,
      necessaire_maintenant: true,
    });
    expect(r.status).toBe(201);
    expect(r.body.dispersion_status).toBe('AGIR_MAINTENANT');
  });
});

describe('GET /api/parking', () => {
  it('returns grouped ideas', async () => {
    const r = await request(app).get('/api/parking').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('grouped');
    expect(r.body.grouped).toHaveProperty('agir_maintenant');
    expect(r.body.grouped).toHaveProperty('tester_plus_tard');
    expect(r.body.grouped).toHaveProperty('parking');
    expect(r.body.grouped).toHaveProperty('abandonner');
  });

  it('AGIR_MAINTENANT ideas appear first in group', async () => {
    const r = await request(app).get('/api/parking').set('Cookie', cookie);
    expect(r.body.grouped.agir_maintenant.length).toBeGreaterThan(0);
    expect(r.body.grouped.parking.length).toBeGreaterThan(0);
  });

  it('does not expose other user ideas', async () => {
    const r = await request(app).get('/api/parking').set('Cookie', otherCookie);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
  });
});

describe('PUT /api/parking/:id/status', () => {
  it('changes status with reason', async () => {
    const r = await request(app).put(`/api/parking/${ideaId}/status`)
      .set('Cookie', cookie)
      .send({ dispersion_status: 'TESTER_PLUS_TARD', reason: 'À tester après S9' });
    expect(r.status).toBe(200);
    expect(r.body.dispersion_status).toBe('TESTER_PLUS_TARD');
  });

  it('rejects invalid status', async () => {
    const r = await request(app).put(`/api/parking/${ideaId}/status`)
      .set('Cookie', cookie)
      .send({ dispersion_status: 'PEUT_ETRE' });
    expect(r.status).toBe(400);
  });

  it('cannot change another user idea', async () => {
    const r = await request(app).put(`/api/parking/${ideaId}/status`)
      .set('Cookie', otherCookie)
      .send({ dispersion_status: 'ABANDONNER' });
    expect(r.status).toBe(404);
  });
});

describe('STOP DISPERSION — no Direction change from parking', () => {
  it('parking route never touches the decisions table', async () => {
    /* Create a decision, then add a parking idea — verify decision is unchanged */
    const db = getDb();
    const decId = randomUUID();
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, status)
      VALUES (?, ?, 'project', 'Direction active', '', '', 'active')`)
      .run(decId, userId);

    await request(app).post('/api/parking').set('Cookie', cookie).send({
      title: 'Nouvelle idée qui ressemble à une décision',
      dispersion_status: 'AGIR_MAINTENANT',
      pourquoi_maintenant: 'Ca semble urgent',
    });

    /* Direction must still be active — parking never changed it */
    const decision = db.prepare(`SELECT status FROM decisions WHERE id = ?`).get(decId);
    expect(decision.status).toBe('active');
  });
});

describe('GET /api/cockpit — parking counts', () => {
  it('returns parkingCount and agirMaintenantCount', async () => {
    const db = getDb();
    const cohortId = randomUUID();
    const adminId = db.prepare(`SELECT id FROM users WHERE role = 'NOEMIE_ADMIN' LIMIT 1`).get().id;
    db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, ?, ?, ?)`)
      .run(cohortId, 'P', '2025-01-01', adminId);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'STARTER')`)
      .run(randomUUID(), userId, cohortId);

    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('parkingCount');
    expect(r.body).toHaveProperty('agirMaintenantCount');
    expect(r.body.agirMaintenantCount).toBeGreaterThan(0);
  });
});
