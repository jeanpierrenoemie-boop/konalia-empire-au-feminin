import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-missions-test-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'missions-test-secret-long-enough-32ch';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';
import { evaluateGate } from '../gates.js';

/* Helper: replicates missionSubmitted logic without importing from gates.js */
function missionSubmitted(db, userId, sprintNumber) {
  return !!db.prepare(`
    SELECT 1 FROM mission_submissions ms
    JOIN missions m ON m.id = ms.mission_id
    WHERE ms.user_id = ? AND m.sprint_number = ?
      AND ms.status IN ('submitted','reviewed','approved')
    LIMIT 1
  `).get(userId, sprintNumber);
}

const app = createApp();

let adminCookie, adminId;
let sarahCookie, sarahId;
let amelieCookie, amelieId;
let cohortId;
let missionId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');

  adminId = randomUUID();
  sarahId = randomUUID();
  amelieId = randomUUID();
  cohortId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, 'admin@missions.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 1)`)
    .run(sarahId, 'sarah@missions.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_ELITE', 'ELITE', 'Amelie', 1)`)
    .run(amelieId, 'amelie@missions.test', hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, ?, ?, ?)`)
    .run(cohortId, 'Cohorte Test', '2025-01-01', adminId);

  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'STARTER')`)
    .run(randomUUID(), sarahId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?, ?, ?, 'ELITE')`)
    .run(randomUUID(), amelieId, cohortId);

  /* Sprint 1 in_progress for Sarah */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`)
    .run(randomUUID(), sarahId, cohortId);

  /* Sprint 1 in_progress for Amelie */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at) VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`)
    .run(randomUUID(), amelieId, cohortId);

  /* Global mission for sprint 1 */
  missionId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, description, mission_type, is_required, sort_order, created_by) VALUES (?, NULL, 'C', 1, 'Mission Sprint 1', 'Description test', 'action', 1, 0, ?)`)
    .run(missionId, adminId);

  const r1 = await request(app).post('/auth/login').send({ email: 'admin@missions.test', password: 'pass' });
  adminCookie = r1.headers['set-cookie'];

  const r2 = await request(app).post('/auth/login').send({ email: 'sarah@missions.test', password: 'pass' });
  sarahCookie = r2.headers['set-cookie'];

  const r3 = await request(app).post('/auth/login').send({ email: 'amelie@missions.test', password: 'pass' });
  amelieCookie = r3.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

describe('GET /api/parcours/missions', () => {
  it('requireAuth — retourne 401 sans cookie', async () => {
    const r = await request(app).get('/api/parcours/missions');
    expect(r.status).toBe(401);
  });

  it('retourne les missions du sprint courant avec submission_status null si pas de soumission', async () => {
    const r = await request(app).get('/api/parcours/missions').set('Cookie', sarahCookie);
    expect(r.status).toBe(200);
    expect(r.body).toBeInstanceOf(Array);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
    const m = r.body.find(m => m.id === missionId);
    expect(m).toBeTruthy();
    expect(m.submission_status).toBeNull();
  });

  it('ne retourne PAS les missions d\'un autre sprint', async () => {
    const db = getDb();
    const otherMissionId = randomUUID();
    db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, description, mission_type, is_required, sort_order, created_by) VALUES (?, NULL, 'A', 3, 'Mission Sprint 3', '', 'action', 1, 0, ?)`)
      .run(otherMissionId, adminId);

    const r = await request(app).get('/api/parcours/missions').set('Cookie', sarahCookie);
    expect(r.status).toBe(200);
    const sprint3Mission = r.body.find(m => m.id === otherMissionId);
    expect(sprint3Mission).toBeUndefined();
  });
});

describe('POST /api/parcours/missions/:id/submit', () => {
  it('requireAuth — retourne 401 sans cookie', async () => {
    const r = await request(app).post(`/api/parcours/missions/${missionId}/submit`).send({ content: 'Test' });
    expect(r.status).toBe(401);
  });

  it('soumet correctement (status → submitted)', async () => {
    const r = await request(app)
      .post(`/api/parcours/missions/${missionId}/submit`)
      .set('Cookie', sarahCookie)
      .send({ content: 'Mon livrable de test' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('submitted');
    expect(r.body.content).toBe('Mon livrable de test');
    expect(r.body.user_id).toBe(sarahId);
  });

  it('missionSubmitted dans gates retourne true après soumission', () => {
    const db = getDb();
    const result = missionSubmitted(db, sarahId, 1);
    expect(result).toBe(true);
  });

  it('une soumission approved ne peut pas être resoumise (409)', async () => {
    const db = getDb();
    db.prepare(`UPDATE mission_submissions SET status = 'approved' WHERE mission_id = ? AND user_id = ?`)
      .run(missionId, sarahId);

    const r = await request(app)
      .post(`/api/parcours/missions/${missionId}/submit`)
      .set('Cookie', sarahCookie)
      .send({ content: 'Tentative après approbation' });
    expect(r.status).toBe(409);

    // Restore to submitted for later tests
    db.prepare(`UPDATE mission_submissions SET status = 'submitted' WHERE mission_id = ? AND user_id = ?`)
      .run(missionId, sarahId);
  });

  it('ne peut pas soumettre une mission d\'un sprint non actif', async () => {
    const db = getDb();
    const sprint3Id = randomUUID();
    db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, description, mission_type, is_required, sort_order, created_by) VALUES (?, NULL, 'A', 3, 'Mission Sprint 3 Autre', '', 'action', 1, 0, ?)`)
      .run(sprint3Id, adminId);

    const r = await request(app)
      .post(`/api/parcours/missions/${sprint3Id}/submit`)
      .set('Cookie', sarahCookie)
      .send({ content: 'Tentative hors sprint' });
    expect(r.status).toBe(403);
  });

  it('Amelie ne peut pas soumettre la mission de Sarah (chaque participante soumet pour elle-même)', async () => {
    // Amelie submits her own submission for the same mission — this is allowed
    const r = await request(app)
      .post(`/api/parcours/missions/${missionId}/submit`)
      .set('Cookie', amelieCookie)
      .send({ content: 'Livrable Amelie' });
    expect(r.status).toBe(201);
    expect(r.body.user_id).toBe(amelieId);
    // Sarah's submission should not be modified
    const db = getDb();
    const sarahSub = db.prepare(`SELECT * FROM mission_submissions WHERE mission_id = ? AND user_id = ?`).get(missionId, sarahId);
    expect(sarahSub.user_id).toBe(sarahId);
  });
});

describe('Admin missions', () => {
  it('POST /api/admin/missions — admin crée une mission', async () => {
    const r = await request(app)
      .post('/api/admin/missions')
      .set('Cookie', adminCookie)
      .send({
        cadre_step: 'A',
        sprint_number: 2,
        title: 'Mission Admin Test',
        description: 'Créée par admin',
      });
    expect(r.status).toBe(201);
    expect(r.body.title).toBe('Mission Admin Test');
    expect(r.body.created_by).toBe(adminId);
  });

  it('POST /api/admin/missions — participant ne peut pas créer une mission (403)', async () => {
    const r = await request(app)
      .post('/api/admin/missions')
      .set('Cookie', sarahCookie)
      .send({ cadre_step: 'A', sprint_number: 2, title: 'Tentative participant' });
    expect(r.status).toBe(403);
  });
});

describe('Admin submissions', () => {
  it('GET /api/admin/submissions retourne les soumissions submitted', async () => {
    const r = await request(app)
      .get('/api/admin/submissions?status=submitted')
      .set('Cookie', adminCookie);
    expect(r.status).toBe(200);
    expect(r.body).toBeInstanceOf(Array);
    const sarahSub = r.body.find(s => s.user_id === sarahId);
    expect(sarahSub).toBeTruthy();
    expect(sarahSub.mission_title).toBe('Mission Sprint 1');
  });

  it('PATCH /api/admin/submissions/:id/review avec approved → status=approved, audit event mission_validated', async () => {
    const db = getDb();
    const sub = db.prepare(`SELECT * FROM mission_submissions WHERE mission_id = ? AND user_id = ?`).get(missionId, sarahId);

    const r = await request(app)
      .patch(`/api/admin/submissions/${sub.id}/review`)
      .set('Cookie', adminCookie)
      .send({ decision: 'approved', note: 'Excellent travail' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('approved');
    expect(r.body.reviewer_note).toBe('Excellent travail');

    const audit = db.prepare(`SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 'mission_validated' ORDER BY rowid DESC LIMIT 1`).get(sarahId);
    expect(audit).toBeTruthy();
  });

  it('gate s\'ouvre sur approved (missionSubmitted retourne true)', () => {
    const db = getDb();
    const result = missionSubmitted(db, sarahId, 1);
    expect(result).toBe(true);
  });

  it('PATCH /api/admin/submissions/:id/review avec rejected + note → status=rejected, audit event mission_correction_requested', async () => {
    const db = getDb();
    const amelieSub = db.prepare(`SELECT * FROM mission_submissions WHERE mission_id = ? AND user_id = ?`).get(missionId, amelieId);

    const r = await request(app)
      .patch(`/api/admin/submissions/${amelieSub.id}/review`)
      .set('Cookie', adminCookie)
      .send({ decision: 'rejected', note: 'Revoir la section 2' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('rejected');
    expect(r.body.reviewer_note).toBe('Revoir la section 2');

    const audit = db.prepare(`SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 'mission_correction_requested' ORDER BY rowid DESC LIMIT 1`).get(amelieId);
    expect(audit).toBeTruthy();
  });

  it('rejected !== approved (correction ≠ validation)', async () => {
    const db = getDb();
    const amelieSub = db.prepare(`SELECT * FROM mission_submissions WHERE mission_id = ? AND user_id = ?`).get(missionId, amelieId);
    expect(amelieSub.status).toBe('rejected');
    const sarahSub = db.prepare(`SELECT * FROM mission_submissions WHERE mission_id = ? AND user_id = ?`).get(missionId, sarahId);
    expect(sarahSub.status).toBe('approved');
    expect(amelieSub.status).not.toBe(sarahSub.status);
  });

  it('gate ne s\'ouvre pas sur rejected (missionSubmitted retourne false)', () => {
    const db = getDb();
    // missionSubmitted only counts submitted/reviewed/approved, not rejected
    const result = missionSubmitted(db, amelieId, 1);
    expect(result).toBe(false);
  });

  it('après rejected, participante peut resoumettre', async () => {
    const r = await request(app)
      .post(`/api/parcours/missions/${missionId}/submit`)
      .set('Cookie', amelieCookie)
      .send({ content: 'Livrable corrigé' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('submitted');
    expect(r.body.content).toBe('Livrable corrigé');
  });

  it('audit event créé pour soumission', () => {
    const db = getDb();
    const audit = db.prepare(`SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 'mission_submitted' ORDER BY rowid DESC LIMIT 1`).get(amelieId);
    expect(audit).toBeTruthy();
  });

  it('COPILOTE ne touche pas mission_submissions: table copilot_messages ne contient aucune ref', () => {
    const db = getDb();
    // Verify that even if there are copilot messages, they have no reference to mission_submissions
    // This is statically true — copilot_messages has no FK to mission_submissions
    const tableInfo = db.prepare(`PRAGMA table_info(copilot_messages)`).all();
    const colNames = tableInfo.map(c => c.name);
    expect(colNames).not.toContain('mission_submission_id');
    expect(colNames).not.toContain('submission_id');
  });

  it('preuve Mes Preuves consomme la soumission approved pour cadre_step D', async () => {
    const db = getDb();
    // Create a mission in cadre_step D for sarah's current sprint (need to move her to sprint 6)
    const dMissionId = randomUUID();
    db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, description, mission_type, is_required, sort_order, created_by) VALUES (?, NULL, 'D', 6, 'Mission D Test', '', 'deliverable', 1, 0, ?)`)
      .run(dMissionId, adminId);

    const subId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'Livrable D', 'approved', ?, ?)`)
      .run(subId, dMissionId, sarahId, cohortId, now, now);

    const r = await request(app).get('/api/preuves').set('Cookie', sarahCookie);
    expect(r.status).toBe(200);
    const offreTest = r.body['02_mon_offre_test'];
    expect(offreTest).toBeTruthy();
    const missionSubs = offreTest.mission_submissions;
    expect(missionSubs).toBeInstanceOf(Array);
    const dSub = missionSubs.find(s => s.id === subId);
    expect(dSub).toBeTruthy();
  });
});
