import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-cockpit-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'cockpit-test-secret-long-enough-32ch';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let cookie, userId, cohortId, missionId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  userId = randomUUID();
  cohortId = randomUUID();
  const adminId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, 'admin@ck.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 1)`)
    .run(userId, 'sarah@ck.test', hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, ?, ?, ?)`)
    .run(cohortId, 'Pilote', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'STARTER')`)
    .run(randomUUID(), userId, cohortId);

  /* user_progress */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`)
    .run(randomUUID(), userId, cohortId);

  /* pilotage_state */
  db.prepare(`INSERT INTO pilotage_state (id, user_id, current_priority, priority_reason, next_action, duration_estimate, not_priority_now) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId,
      'Démarrer le C.A.D.R.E. — Étape C : Clarifier',
      'Début du parcours',
      'Ouvrir la première mission',
      '30 min',
      'Site web — pas avant validation persona'
    );

  /* mission */
  missionId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, description, mission_type, created_by) VALUES (?, ?, 'C', 1, ?, ?, 'action', ?)`)
    .run(missionId, cohortId, 'Mission C1 — Ma situation réelle', 'Décris ta situation professionnelle actuelle.', adminId);

  /* proof */
  db.prepare(`INSERT INTO proofs (id, user_id, proof_type, title, cadre_step) VALUES (?, ?, 'note', 'Ma première note', 'C')`)
    .run(randomUUID(), userId);

  /* decision */
  db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, rationale) VALUES (?, ?, 'project', 'Je travaille sur le coaching bien-etre', 'Mon expertise principale')`)
    .run(randomUUID(), userId);

  /* market contact */
  db.prepare(`INSERT INTO market_contacts (id, user_id, name, status) VALUES (?, ?, 'Marie D.', 'contacted')`)
    .run(randomUUID(), userId);

  const r = await request(app).post('/auth/login').send({ email: 'sarah@ck.test', password: 'pass' });
  cookie = r.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

describe('GET /api/cockpit', () => {
  it('requires authentication', async () => {
    const r = await request(app).get('/api/cockpit');
    expect(r.status).toBe(401);
  });

  it('returns 200 with all cockpit sections', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('progress');
    expect(r.body).toHaveProperty('pilotage');
    expect(r.body).toHaveProperty('currentMission');
    expect(r.body).toHaveProperty('proofs');
    expect(r.body).toHaveProperty('lastDecision');
    expect(r.body).toHaveProperty('lastMarketAction');
    expect(r.body).toHaveProperty('parkingCount');
    expect(r.body).toHaveProperty('totalProofs');
  });

  /* Q1 — Où j'en suis */
  it('answers Q1: current C.A.D.R.E. phase + week', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    const { progress } = r.body;
    expect(progress.cadre_step).toBe('C');
    expect(progress.sprint_number).toBe(1);
    expect(progress.week_in_sprint).toBe(1);
    expect(progress.gate_status).toBe('in_progress');
  });

  /* Q2+Q3 — Priorité et raison */
  it('answers Q2+Q3: current priority and reason', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    const { pilotage } = r.body;
    expect(pilotage.current_priority).toMatch(/Clarifier/i);
    expect(pilotage.priority_reason).toBeTruthy();
  });

  /* Q4 — Prochaine action */
  it('answers Q4: next concrete action and duration', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    const { pilotage } = r.body;
    expect(pilotage.next_action).toBeTruthy();
    expect(pilotage.duration_estimate).toBe('30 min');
  });

  /* Q5 — Blocage / suite */
  it('answers Q5: PAS MAINTENANT is present', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    const { pilotage } = r.body;
    expect(pilotage.not_priority_now).toBeTruthy();
  });

  /* Mission courante */
  it('returns current mission title', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    expect(r.body.currentMission?.title).toContain('Mission C1');
  });

  /* Preuves */
  it('returns proof counts by type (5 types)', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    const { proofs, totalProofs } = r.body;
    expect(proofs).toHaveLength(5);
    expect(totalProofs).toBe(1);
    const note = proofs.find(p => p.type === 'note');
    expect(note?.count).toBe(1);
  });

  /* Décision */
  it('returns last validated decision', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    expect(r.body.lastDecision?.title).toContain('coaching bien-etre');
  });

  /* Action marché */
  it('returns last market action', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    expect(r.body.lastMarketAction?.name ?? r.body.lastMarketAction?.title).toBeTruthy();
  });

  /* Isolation — autre utilisateur */
  it('does not return another user data', async () => {
    const db = getDb();
    const otherId = randomUUID();
    const hash = await hashPassword('pass');
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Autre', 1)`)
      .run(otherId, 'autre@ck.test', hash);
    db.prepare(`INSERT INTO pilotage_state (id, user_id, current_priority) VALUES (?, ?, 'CONFIDENTIEL')`)
      .run(randomUUID(), otherId);

    const r = await request(app).get('/api/cockpit').set('Cookie', cookie);
    expect(JSON.stringify(r.body)).not.toContain('CONFIDENTIEL');
  });

  /* Participant sans données */
  it('returns nulls gracefully for participant without progress', async () => {
    const db = getDb();
    const emptyId = randomUUID();
    const hash = await hashPassword('pass');
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Vide', 1)`)
      .run(emptyId, 'vide@ck.test', hash);

    const loginR = await request(app).post('/auth/login').send({ email: 'vide@ck.test', password: 'pass' });
    const emptyCookie = loginR.headers['set-cookie'];
    const r = await request(app).get('/api/cockpit').set('Cookie', emptyCookie);
    expect(r.status).toBe(200);
    expect(r.body.progress).toBeNull();
    expect(r.body.pilotage).toBeNull();
    expect(r.body.currentMission).toBeNull();
    expect(r.body.lastDecision).toBeNull();
    expect(r.body.lastMarketAction).toBeNull();
  });
});
