import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-decisions-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'decisions-test-secret-long-enough-32c';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();
let cookie, userId, otherId, otherCookie;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  userId = randomUUID();
  otherId = randomUUID();
  const adminId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, 'admin@dec.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 1)`)
    .run(userId, 'sarah@dec.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Autre', 1)`)
    .run(otherId, 'autre@dec.test', hash);

  const r = await request(app).post('/auth/login').send({ email: 'sarah@dec.test', password: 'pass' });
  cookie = r.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: 'autre@dec.test', password: 'pass' });
  otherCookie = r2.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

describe('POST /api/decisions', () => {
  it('requires auth', async () => {
    const r = await request(app).post('/api/decisions').send({ decision_type: 'project', title: 'Test' });
    expect(r.status).toBe(401);
  });

  it('rejects invalid decision_type', async () => {
    const r = await request(app).post('/api/decisions').set('Cookie', cookie)
      .send({ decision_type: 'invalid', title: 'Test' });
    expect(r.status).toBe(400);
  });

  it('creates decision with all new fields', async () => {
    const r = await request(app).post('/api/decisions').set('Cookie', cookie).send({
      decision_type: 'project',
      title: 'Je travaille sur le coaching bien-être',
      rationale: 'Mon expertise principale sur 5 ans',
      facts_used: '3 clients actuels, 2 demandes spontanées reçues ce mois',
      hypotheses: 'Le marché B2C est accessible sans réseau préalable',
      reopening_condition: 'Si 0 contact intéressé après 10 conversations réelles',
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('active');
    expect(r.body.facts_used).toContain('3 clients');
    expect(r.body.hypotheses).toBeTruthy();
    expect(r.body.reopening_condition).toBeTruthy();
  });
});

describe('GET /api/decisions', () => {
  it('returns active and historical lists', async () => {
    const r = await request(app).get('/api/decisions').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('active');
    expect(r.body).toHaveProperty('historical');
    expect(r.body.active.length).toBeGreaterThan(0);
  });

  it('does not return another user decisions', async () => {
    const r = await request(app).get('/api/decisions').set('Cookie', otherCookie);
    expect(r.status).toBe(200);
    expect(r.body.active).toHaveLength(0);
  });
});

describe('POST /api/decisions/:id/supersede', () => {
  let decisionId;

  beforeAll(async () => {
    const r = await request(app).post('/api/decisions').set('Cookie', cookie).send({
      decision_type: 'persona',
      title: 'Femmes cadres 40-50 ans',
      rationale: 'Profil le plus fréquent dans mon réseau',
    });
    decisionId = r.body.id;
  });

  it('requires reason of at least 10 chars', async () => {
    const r = await request(app).post(`/api/decisions/${decisionId}/supersede`)
      .set('Cookie', cookie)
      .send({ title: 'Femmes dirigeantes', rationale: 'court' });
    expect(r.status).toBe(400);
  });

  it('replaces decision and marks original superseded', async () => {
    const r = await request(app).post(`/api/decisions/${decisionId}/supersede`)
      .set('Cookie', cookie)
      .send({
        title: 'Femmes dirigeantes 35-55 ans',
        rationale: 'Après 5 conversations — les cadres sont trop contraintes par leur employeur',
        facts_used: '5 conversations réelles, 3 refus explicites liés à l\'emploi',
        hypotheses: 'Les dirigeantes ont plus d\'autonomie pour investir',
        reopening_condition: 'Si 3+ dirigeantes refusent aussi par manque de temps',
      });
    expect(r.status).toBe(201);
    expect(r.body.new.status).toBe('active');
    expect(r.body.new.supersedes_id).toBe(decisionId);
    expect(r.body.superseded_id).toBe(decisionId);

    /* Verify original is now superseded */
    const db = getDb();
    const old = db.prepare(`SELECT status FROM decisions WHERE id = ?`).get(decisionId);
    expect(old.status).toBe('superseded');
  });

  it('cannot supersede a superseded decision', async () => {
    const r = await request(app).post(`/api/decisions/${decisionId}/supersede`)
      .set('Cookie', cookie)
      .send({ title: 'Autre', rationale: 'Tentative sur décision déjà remplacée' });
    expect(r.status).toBe(409);
  });

  it('cannot access another user decision', async () => {
    const r = await request(app).post(`/api/decisions/${decisionId}/supersede`)
      .set('Cookie', otherCookie)
      .send({ title: 'Piratage', rationale: 'Tentative de piratage de décision' });
    expect(r.status).toBe(404);
  });
});

describe('POST /api/decisions/:id/archive', () => {
  let archiveId;

  beforeAll(async () => {
    const r = await request(app).post('/api/decisions').set('Cookie', cookie).send({
      decision_type: 'scope',
      title: 'Périmètre France uniquement',
      rationale: 'Contrainte initiale de démarrage',
    });
    archiveId = r.body.id;
  });

  it('archives with reason', async () => {
    const r = await request(app).post(`/api/decisions/${archiveId}/archive`)
      .set('Cookie', cookie).send({ reason: 'Plus pertinent' });
    expect(r.status).toBe(200);
    const db = getDb();
    const d = db.prepare(`SELECT status FROM decisions WHERE id = ?`).get(archiveId);
    expect(d.status).toBe('archived');
  });
});

describe('GET /api/preuves', () => {
  it('requires auth', async () => {
    const r = await request(app).get('/api/preuves');
    expect(r.status).toBe(401);
  });

  it('returns 5 proof sections', async () => {
    const r = await request(app).get('/api/preuves').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('01_ma_direction');
    expect(r.body).toHaveProperty('02_mon_offre_test');
    expect(r.body).toHaveProperty('03_mon_rapport_terrain');
    expect(r.body).toHaveProperty('04_mon_bilan_controle');
    expect(r.body).toHaveProperty('05_mon_plan_continuite');
  });

  it('each section has label and completeness', async () => {
    const r = await request(app).get('/api/preuves').set('Cookie', cookie);
    for (const key of Object.keys(r.body)) {
      expect(r.body[key]).toHaveProperty('label');
      expect(r.body[key]).toHaveProperty('completeness');
      expect(r.body[key].completeness).toBeGreaterThanOrEqual(0);
      expect(r.body[key].completeness).toBeLessThanOrEqual(100);
    }
  });

  it('section 01 includes active strategic decisions', async () => {
    const r = await request(app).get('/api/preuves').set('Cookie', cookie);
    const dir = r.body['01_ma_direction'];
    expect(dir.strategic_decisions).toBeInstanceOf(Array);
    /* We created a project decision above — should appear */
    expect(dir.strategic_decisions.length).toBeGreaterThan(0);
  });
});

describe('GET /api/preuves/dossier', () => {
  it('requires auth', async () => {
    const r = await request(app).get('/api/preuves/dossier');
    expect(r.status).toBe(401);
  });

  it('returns structured export with all sections', async () => {
    const r = await request(app).get('/api/preuves/dossier').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('meta');
    expect(r.body).toHaveProperty('passeport');
    expect(r.body).toHaveProperty('preuves');
    expect(r.body).toHaveProperty('decisions');
    expect(r.body).toHaveProperty('progression');
    expect(r.body.meta.version).toBe('V1-pilot');
  });

  it('does not expose other participant data', async () => {
    const r = await request(app).get('/api/preuves/dossier').set('Cookie', otherCookie);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('coaching bien-être');
  });
});
