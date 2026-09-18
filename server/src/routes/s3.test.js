/**
 * S3 — LE CHOIX QUI LIBÈRE — Tests
 * Build 21C: Arbitration matrix CRUD, completeness, submission, gate S4 realignment.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

const TEST_DB = path.join(os.tmpdir(), `rc-s3-test-${randomUUID()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's3-test-secret-32-chars-minimum!!';
process.env.JWT_EXPIRES_IN  = '1h';
process.env.COOKIE_SECURE   = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { getAdapter } from '../db/adapter.js';
import { createApp } from '../../server.js';

const app = createApp();

/* ── Helpers ──────────────────────────────────────────────────────── */

const CRITERIA_KEYS = [
  'envie_reelle', 'ressources_existantes', 'acces_personnes',
  'probleme_a_explorer', 'compatibilite_vie', 'simplicite_premier_test', 'niveau_inconnu',
];

function makeFullCriteria(rating = 'FORT') {
  return Object.fromEntries(CRITERIA_KEYS.map(k => [k, { rating, note: '' }]));
}

function makeS2Path(overrides = {}) {
  return {
    id: randomUUID(),
    status: 'retained',
    name: 'Piste formation PME',
    starting_resource: 'Expérience formation',
    person: 'Managers PME',
    problem: 'Recrutement difficile',
    what_i_know: 'Formé 50 managers',
    what_i_assume: 'Fréquent',
    what_i_need_to_verify: 'Prêts à payer',
    acknowledged: {},
    ...overrides,
  };
}

function makeS2Content(paths) {
  return JSON.stringify({ version: 1, status: 'complete', completed_at: new Date().toISOString(), paths });
}

const PASS = 'Password1!';
const ADMIN_PASS = 'Admin123!';

let adminId, participantId, participant2Id, cohortId, missionId;
let participantEmail, participant2Email;
let participantCookies, participant2Cookies, adminCookies;

let s2PathA, s2PathB;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword(PASS);
  const adminHash = await hashPassword(ADMIN_PASS);

  adminId = randomUUID();
  participantId = randomUUID();
  participant2Id = randomUUID();
  cohortId = randomUUID();
  participantEmail = `s3p+${participantId.slice(0,6)}@ex.com`;
  participant2Email = `s3p2+${participant2Id.slice(0,6)}@ex.com`;

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s3admin@ex.com`, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilot S3', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  /* Participant at sprint 3 */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 3, 1, 'in_progress')`)
    .run(randomUUID(), participantId, cohortId);
  /* Participant 2 at sprint 3 */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 3, 1, 'in_progress')`)
    .run(randomUUID(), participant2Id, cohortId);

  /* S2 completed paths for participant */
  s2PathA = makeS2Path({ id: randomUUID(), name: 'Piste A' });
  s2PathB = makeS2Path({ id: randomUUID(), name: 'Piste B' });
  const s2Discarded = makeS2Path({ id: randomUUID(), status: 'discarded', name: 'Discardée' });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's2_paths', ?)`)
    .run(randomUUID(), participantId, makeS2Content([s2PathA, s2PathB, s2Discarded]));

  /* S2 paths for participant 2 (isolation test) */
  const p2Path = makeS2Path({ id: randomUUID(), name: 'Piste Marie' });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's2_paths', ?)`)
    .run(randomUUID(), participant2Id, makeS2Content([p2Path]));

  /* Mission for sprint 3 */
  missionId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'A', 3, 'Matrice Arbitrage', 1, 0, ?)`)
    .run(missionId, cohortId, adminId);

  const r1 = await request(app).post('/auth/login').send({ email: participantEmail, password: PASS });
  participantCookies = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: participant2Email, password: PASS });
  participant2Cookies = r2.headers['set-cookie'];
  const r3 = await request(app).post('/auth/login').send({ email: 's3admin@ex.com', password: ADMIN_PASS });
  adminCookies = r3.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── 1. GET /api/s3/arbitration ─────────────────────────────────── */
describe('GET /api/s3/arbitration', () => {
  it('requires auth', async () => {
    const r = await request(app).get('/api/s3/arbitration');
    expect(r.status).toBe(401);
  });

  it('returns null s3 with retained paths when no arbitration exists', async () => {
    const r = await request(app).get('/api/s3/arbitration').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s3).toBeNull();
    expect(r.body.retained_paths).toHaveLength(2);
    // Must NOT include discarded path
    const ids = r.body.retained_paths.map(p => p.id);
    expect(ids).toContain(s2PathA.id);
    expect(ids).toContain(s2PathB.id);
  });

  it('does NOT return discarded S2 paths', async () => {
    const r = await request(app).get('/api/s3/arbitration').set('Cookie', participantCookies);
    const statuses = r.body.retained_paths.map(p => p.status);
    expect(statuses.every(s => s === 'retained')).toBe(true);
  });
});

/* ── 2. PUT /api/s3/arbitration ─────────────────────────────────── */
describe('PUT /api/s3/arbitration', () => {
  it('requires auth', async () => {
    const r = await request(app).put('/api/s3/arbitration').send({ matrix: [] });
    expect(r.status).toBe(401);
  });

  it('saves draft arbitration', async () => {
    const r = await request(app).put('/api/s3/arbitration')
      .set('Cookie', participantCookies)
      .send({
        matrix: [
          { path_id: s2PathA.id, criteria: makeFullCriteria('FORT') },
          { path_id: s2PathB.id, criteria: makeFullCriteria('MOYEN') },
        ],
      });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s3.status).toBe('draft');
    expect(r.body.s3.matrix).toHaveLength(2);
    // Snapshot must contain only retained paths (2), not discarded
    expect(r.body.s3.s2_snapshot_paths).toHaveLength(2);
  });

  it('rejects unknown path_id in matrix', async () => {
    const r = await request(app).put('/api/s3/arbitration')
      .set('Cookie', participantCookies)
      .send({ matrix: [{ path_id: 'unknown-id', criteria: makeFullCriteria() }] });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/inconnu/i);
  });

  it('does not store numeric scores (ratings are strings only)', async () => {
    const r = await request(app).put('/api/s3/arbitration')
      .set('Cookie', participantCookies)
      .send({
        matrix: [
          { path_id: s2PathA.id, criteria: makeFullCriteria('FORT') },
          { path_id: s2PathB.id, criteria: makeFullCriteria('FAIBLE') },
        ],
      });
    expect(r.status).toBe(200);
    for (const row of r.body.s3.matrix) {
      for (const key of Object.keys(row.criteria)) {
        expect(typeof row.criteria[key].rating).toBe('string');
        expect(['FORT','MOYEN','FAIBLE']).toContain(row.criteria[key].rating);
      }
    }
  });

  it('ownership isolation — cannot save another user path_id', async () => {
    // participant2's path id should be unknown to participant
    const p2PathId = getDb(TEST_DB)
      .prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths'`)
      .get(participant2Id);
    const p2Paths = JSON.parse(p2PathId.content).paths;
    const p2RetainedId = p2Paths.find(p => p.status === 'retained')?.id;

    const r = await request(app).put('/api/s3/arbitration')
      .set('Cookie', participantCookies)
      .send({ matrix: [{ path_id: p2RetainedId, criteria: makeFullCriteria() }] });
    expect(r.status).toBe(422);
  });
});

/* ── 3. POST /api/s3/arbitration/submit ─────────────────────────── */
describe('POST /api/s3/arbitration/submit', () => {
  async function saveComplete(cookies, pid) {
    const paths = getDb(TEST_DB)
      .prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths'`)
      .get(pid);
    const retained = JSON.parse(paths.content).paths.filter(p => p.status === 'retained');
    await request(app).put('/api/s3/arbitration').set('Cookie', cookies).send({
      matrix: retained.map(p => ({ path_id: p.id, criteria: makeFullCriteria('FORT') })),
      priority_path_id: retained[0].id,
      why_priority: 'Car j\'ai déjà des contacts dans ce secteur et une réelle envie.',
      remaining_to_verify: 'Si les personnes cibles seraient prêtes à payer.',
      accepted_unknown: 'Je n\'ai pas encore de certitude sur la taille du marché.',
    });
  }

  it('requires auth', async () => {
    const r = await request(app).post('/api/s3/arbitration/submit');
    expect(r.status).toBe(401);
  });

  it('fails when not on sprint 3', async () => {
    const db = getDb(TEST_DB);
    const uid = randomUUID();
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'WrongSprint', 0)`)
      .run(uid, `ws3+${uid.slice(0,6)}@ex.com`, hash);
    db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'C', 2, 1, 'in_progress')`)
      .run(randomUUID(), uid, cohortId);
    const lr = await request(app).post('/auth/login').send({ email: `ws3+${uid.slice(0,6)}@ex.com`, password: PASS });
    const c = lr.headers['set-cookie'];
    const r = await request(app).post('/api/s3/arbitration/submit').set('Cookie', c);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Sprint 3/);
  });

  it('fails when no matrix exists', async () => {
    const r = await request(app).post('/api/s3/arbitration/submit').set('Cookie', participant2Cookies);
    expect(r.status).toBe(400);
  });

  it('fails if not all criteria rated', async () => {
    // Save matrix with one criterion missing
    const partialCriteria = makeFullCriteria('FORT');
    delete partialCriteria.niveau_inconnu;
    await request(app).put('/api/s3/arbitration').set('Cookie', participant2Cookies).send({
      matrix: [{ path_id: JSON.parse(getDb(TEST_DB).prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths'`).get(participant2Id).content).paths.find(p=>p.status==='retained').id, criteria: partialCriteria }],
    });
    const r = await request(app).post('/api/s3/arbitration/submit').set('Cookie', participant2Cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/inconnu|critère/i);
  });

  it('fails if no priority path selected', async () => {
    await request(app).put('/api/s3/arbitration').set('Cookie', participant2Cookies).send({
      matrix: [{ path_id: JSON.parse(getDb(TEST_DB).prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths'`).get(participant2Id).content).paths.find(p=>p.status==='retained').id, criteria: makeFullCriteria('FORT') }],
    });
    const r = await request(app).post('/api/s3/arbitration/submit').set('Cookie', participant2Cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/piste prioritaire/i);
  });

  it('fails if why_priority is empty', async () => {
    const p2Path = JSON.parse(getDb(TEST_DB).prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths'`).get(participant2Id).content).paths.find(p=>p.status==='retained');
    await request(app).put('/api/s3/arbitration').set('Cookie', participant2Cookies).send({
      matrix: [{ path_id: p2Path.id, criteria: makeFullCriteria('FORT') }],
      priority_path_id: p2Path.id,
      why_priority: '',
      remaining_to_verify: 'quelque chose',
      accepted_unknown: 'quelque chose',
    });
    const r = await request(app).post('/api/s3/arbitration/submit').set('Cookie', participant2Cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/pourquoi|prioriti/i);
  });

  it('succeeds and creates submission snapshot', async () => {
    await saveComplete(participantCookies, participantId);
    const r = await request(app).post('/api/s3/arbitration/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.submission).toBeTruthy();
    expect(r.body.submission.status).toBe('submitted');

    // Verify snapshot content
    const sub = r.body.submission;
    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s3_arbitration_snapshot');
    expect(content.compared_paths).toHaveLength(2);
    expect(content.priority_path).toBeTruthy();
    expect(content.priority_path.id).toBe(s2PathA.id);
    expect(content.why_priority).toBeTruthy();
    expect(content.remaining_to_verify).toBeTruthy();
    expect(content.accepted_unknown).toBeTruthy();
    expect(content.matrix).toHaveLength(2);
  });

  it('marks participant_data as complete after submit', async () => {
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's3_arbitration'`).get(participantId);
    const parsed = JSON.parse(row.content);
    expect(parsed.status).toBe('complete');
    expect(parsed.completed_at).toBeTruthy();
  });

  it('snapshot does NOT contain numeric scores', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`SELECT content FROM mission_submissions WHERE user_id = ?`).get(participantId);
    const content = JSON.parse(sub.content);
    const json = JSON.stringify(content);
    // Should not contain any numeric values as ratings
    expect(json).not.toMatch(/"rating":\s*\d/);
  });

  it('returns 409 if already approved', async () => {
    const db = getDb(TEST_DB);
    db.prepare(`UPDATE mission_submissions SET status = 'approved' WHERE user_id = ?`).run(participantId);
    const r = await request(app).post('/api/s3/arbitration/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(409);
    // Reset for other tests
    db.prepare(`UPDATE mission_submissions SET status = 'submitted' WHERE user_id = ?`).run(participantId);
  });
});

/* ── 4. S3 does NOT create decisions rows ───────────────────────── */
describe('decisions table check', () => {
  it('S3 submission creates ZERO rows in decisions table', async () => {
    const db = getDb(TEST_DB);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?`).get(participantId)?.n ?? 0;
    expect(count).toBe(0);
  });
});

/* ── 5. S2 → S3 prefill (no retype) ────────────────────────────── */
describe('S2 → S3 prefill', () => {
  it('retained paths are pre-loaded without re-entry', async () => {
    const r = await request(app).get('/api/s3/arbitration').set('Cookie', participantCookies);
    expect(r.body.retained_paths).toHaveLength(2);
    // Resource/person/problem must come from S2 unchanged
    const pathA = r.body.retained_paths.find(p => p.id === s2PathA.id);
    expect(pathA.starting_resource).toBe(s2PathA.starting_resource);
    expect(pathA.person).toBe(s2PathA.person);
    expect(pathA.problem).toBe(s2PathA.problem);
  });

  it('detects S2 change after arbitration started', async () => {
    // Modify S2 paths to add a new retained path
    const db = getDb(TEST_DB);
    const newPath = makeS2Path({ id: randomUUID(), name: 'Nouvelle piste' });
    const existing = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths'`).get(participantId);
    const data = JSON.parse(existing.content);
    data.paths.push(newPath);
    db.prepare(`UPDATE participant_data SET content = ? WHERE owner_id = ? AND data_type = 's2_paths'`).run(JSON.stringify(data), participantId);

    const r = await request(app).get('/api/s3/arbitration').set('Cookie', participantCookies);
    expect(r.body.s3.s2_changed).toBe(true);

    // Restore
    data.paths = data.paths.filter(p => p.id !== newPath.id);
    db.prepare(`UPDATE participant_data SET content = ? WHERE owner_id = ? AND data_type = 's2_paths'`).run(JSON.stringify(data), participantId);
  });
});

/* ── 6. Gate S4 — realigned (B21B.1 baseline: missionSubmitted(3)) */
describe('gate S4 — behavior', () => {
  async function makeGateUser(name, suffix) {
    const rawDb = getDb(TEST_DB);
    const hash = await hashPassword(PASS);
    const uid = randomUUID();
    const email = `${suffix}+${uid.slice(0,6)}@ex.com`;
    rawDb.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', ?, 0)`)
      .run(uid, email, hash, name);
    rawDb.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    rawDb.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 3, 1, 'in_progress')`)
      .run(randomUUID(), uid, cohortId);
    const s2p = makeS2Path({ id: randomUUID() });
    rawDb.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's2_paths', ?)`)
      .run(randomUUID(), uid, makeS2Content([s2p]));
    const lr = await request(app).post('/auth/login').send({ email, password: PASS });
    return { uid, email, cookie: lr.headers['set-cookie'], s2PathId: s2p.id };
  }

  it('S3 draft only => gateS4 ROUGE', async () => {
    const { evaluateGate } = await import('../gates.js');
    const { uid, cookie: ck, s2PathId } = await makeGateUser('DraftGate4', 'dg4');
    await request(app).put('/api/s3/arbitration').set('Cookie', ck).send({
      matrix: [{ path_id: s2PathId, criteria: makeFullCriteria() }],
    });
    const gate = await evaluateGate(getAdapter(), uid, 4);
    expect(gate.status).toBe('ROUGE');
  });

  it('video alone => gateS4 ROUGE', async () => {
    const { evaluateGate } = await import('../gates.js');
    const { uid } = await makeGateUser('VideoGate4', 'vg4');
    const gate = await evaluateGate(getAdapter(), uid, 4);
    expect(gate.status).toBe('ROUGE');
  });

  it('audio alone => gateS4 ROUGE', async () => {
    const { evaluateGate } = await import('../gates.js');
    const { uid } = await makeGateUser('AudioGate4', 'ag4');
    const gate = await evaluateGate(getAdapter(), uid, 4);
    expect(gate.status).toBe('ROUGE');
  });

  it('weekly review only => gateS4 ROUGE', async () => {
    const { evaluateGate } = await import('../gates.js');
    const rawDb = getDb(TEST_DB);
    const { uid } = await makeGateUser('WeeklyGate4', 'wg4');
    rawDb.prepare(`INSERT INTO weekly_reviews (id, user_id, cohort_id, sprint_number, week_number) VALUES (?, ?, ?, 3, 1)`).run(randomUUID(), uid, cohortId);
    const gate = await evaluateGate(getAdapter(), uid, 4);
    expect(gate.status).toBe('ROUGE');
  });

  it('matrix complete but not submitted => gateS4 ROUGE', async () => {
    const { evaluateGate } = await import('../gates.js');
    const { uid, cookie: ck, s2PathId } = await makeGateUser('CompleteNotSub4', 'cns4');
    await request(app).put('/api/s3/arbitration').set('Cookie', ck).send({
      matrix: [{ path_id: s2PathId, criteria: makeFullCriteria() }],
      priority_path_id: s2PathId,
      why_priority: 'Raison valide',
      remaining_to_verify: 'À vérifier',
      accepted_unknown: 'Accepté',
    });
    const gate = await evaluateGate(getAdapter(), uid, 4);
    expect(gate.status).toBe('ROUGE');
  });

  it('mission submitted => gateS4 VERT', async () => {
    const { evaluateGate } = await import('../gates.js');
    const rawDb = getDb(TEST_DB);
    const { uid, cookie: ck, s2PathId } = await makeGateUser('SubmitGate4', 'sg4');
    await request(app).put('/api/s3/arbitration').set('Cookie', ck).send({
      matrix: [{ path_id: s2PathId, criteria: makeFullCriteria() }],
      priority_path_id: s2PathId,
      why_priority: 'Raison valide pour test',
      remaining_to_verify: 'Vérification nécessaire',
      accepted_unknown: 'Je n\'ai pas besoin de tout savoir.',
    });
    const mid = randomUUID();
    rawDb.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, NULL, 'A', 3, 'M3 test', 1, 99, ?)`)
      .run(mid, adminId);
    await request(app).post('/api/s3/arbitration/submit').set('Cookie', ck);
    const gate = await evaluateGate(getAdapter(), uid, 4);
    expect(gate.status).toBe('VERT');
    expect(gate.conditions).toHaveLength(1);
    expect(gate.conditions[0].met).toBe(true);
  });

  it('mission submitted with ZERO decisions rows => gateS4 VERT (no fake-decision dependency)', async () => {
    const { evaluateGate } = await import('../gates.js');
    const rawDb = getDb(TEST_DB);
    const { uid, cookie: ck, s2PathId } = await makeGateUser('ZeroDecGate4', 'zdg4');
    await request(app).put('/api/s3/arbitration').set('Cookie', ck).send({
      matrix: [{ path_id: s2PathId, criteria: makeFullCriteria() }],
      priority_path_id: s2PathId,
      why_priority: 'Raison valide zero dec',
      remaining_to_verify: 'Vérification',
      accepted_unknown: 'Incertitude acceptée.',
    });
    const mid = randomUUID();
    rawDb.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, NULL, 'A', 3, 'M3 zdec', 1, 100, ?)`)
      .run(mid, adminId);
    await request(app).post('/api/s3/arbitration/submit').set('Cookie', ck);
    // Confirm no decisions exist
    const decCount = rawDb.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?`).get(uid)?.n ?? 0;
    expect(decCount).toBe(0);
    const gate = await evaluateGate(getAdapter(), uid, 4);
    expect(gate.status).toBe('VERT');
  });
});

/* ── 7. COPILOTE context ────────────────────────────────────────── */
describe('COPILOTE context', () => {
  it('COPILOTE general context includes s3_arbitration', async () => {
    const { buildCopiloteContext } = await import('../copilote.js');
    const adapter = getAdapter();
    const ctx = await buildCopiloteContext(adapter, participantId, 'general');
    expect(ctx.structured.s3_arbitration).not.toBeNull();
    expect(ctx.structured.s3_arbitration.status).toBe('complete');
  });

  it('COPILOTE cannot mutate official arbitration (PUT requires auth)', async () => {
    const r = await request(app).put('/api/s3/arbitration').send({ matrix: [] });
    expect(r.status).toBe(401);
  });
});

/* ── 8. Admin can read S3 submission ────────────────────────────── */
describe('admin read — S3 data visible', () => {
  it('admin can read S3 submission via GET /api/admin/submissions', async () => {
    const r = await request(app).get('/api/admin/submissions?status=submitted').set('Cookie', adminCookies);
    expect(r.status).toBe(200);
    const list = Array.isArray(r.body) ? r.body : (r.body.submissions ?? []);
    const s3Sub = list.find(s => {
      try { return JSON.parse(s.content)?.type === 's3_arbitration_snapshot'; } catch { return false; }
    });
    expect(s3Sub).toBeTruthy();
  });
});
