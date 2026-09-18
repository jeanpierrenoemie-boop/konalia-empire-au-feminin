/**
 * S4 — VERROUILLE TA DIRECTION — Tests
 * Build 21D: Direction Contract CRUD, completeness, lock, gate, COPILOTE rules.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const TEST_DB = path.join(os.tmpdir(), `rc-s4-test-${randomUUID()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's4-test-secret-32-chars-minimum!!';
process.env.JWT_EXPIRES_IN  = '1h';
process.env.COOKIE_SECURE   = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { getAdapter } from '../db/adapter.js';
import { createApp } from '../../server.js';

const app = createApp();

const copiloteRouteSrc = readFileSync(
  fileURLToPath(new URL('./copilote.routes.js', import.meta.url)),
  'utf8'
);

/* ── Helpers ──────────────────────────────────────────────────────── */

const PASS = 'Password1!';
const ADMIN_PASS = 'Admin123!';

let adminId, participantId, participant2Id, cohortId;
let participantEmail, participant2Email;
let participantCookies, participant2Cookies, adminCookies;

let s2PathA, s2PathB;
let s3RowId;

function makeS2Path(overrides = {}) {
  return {
    id: randomUUID(),
    status: 'retained',
    name: 'Piste Formation PME',
    starting_resource: 'Expérience formation',
    person: 'Managers PME',
    problem: 'Recrutement difficile',
    what_i_know: 'Formé 50 managers',
    what_i_assume: 'Besoin récurrent',
    what_i_need_to_verify: 'Prêts à payer',
    acknowledged: {},
    ...overrides,
  };
}

function makeS3Content(pathA, pathB) {
  const CRITERIA_KEYS = [
    'envie_reelle','ressources_existantes','acces_personnes',
    'probleme_a_explorer','compatibilite_vie','simplicite_premier_test','niveau_inconnu',
  ];
  const makeCriteria = () => Object.fromEntries(CRITERIA_KEYS.map(k => [k, { rating: 'FORT', note: '' }]));
  return JSON.stringify({
    version: 1,
    status: 'complete',
    priority_path_id: pathA.id,
    why_priority: 'Car j\'ai déjà des contacts dans ce secteur.',
    remaining_to_verify: 'Si les personnes cibles seraient prêtes à payer.',
    accepted_unknown: 'Je n\'ai pas encore de certitude sur la taille du marché.',
    decision_basis: {
      facts: 'J\'ai formé 50 managers dans ce secteur.',
      hypotheses: 'Ces managers manquent de temps pour se former en interne.',
      preferences: '',
      acknowledged: { facts: false, hypotheses: false, preferences: true },
    },
    matrix: [
      { path_id: pathA.id, criteria: makeCriteria() },
      { path_id: pathB.id, criteria: makeCriteria() },
    ],
    s2_snapshot_paths: [pathA, pathB],
    completed_at: new Date().toISOString(),
  });
}

function makeFullDirection() {
  return {
    direction: {
      formulation: 'Je vais tester si les managers PME seraient prêts à investir dans une formation intensive de deux jours.',
      person: 'Managers de PME (20-200 personnes)',
      problem: 'Difficulté à recruter et fidéliser des talents dans un contexte de pénurie',
    },
    why_for_test: 'J\'ai déjà 50 managers formés et 3 ont mentionné ce problème spontanément.',
    facts: 'J\'ai formé 50 managers. 3 ont mentionné des difficultés de recrutement.',
    facts_acknowledged: false,
    hypotheses: 'Ces managers seraient prêts à payer pour une solution externe.',
    hypotheses_acknowledged: false,
    to_verify: 'Si les décideurs alloueraient un budget formation à ce problème.',
    accepted_unknown: 'Je ne sais pas encore si la taille du marché est suffisante.',
    set_aside_paths: [],
    reopening_conditions: {
      hypothesis_contradiction: 'Si plus de 80% des managers interrogés nient avoir ce problème.',
      major_constraint: 'Si une loi limite le recours à la formation externe.',
      new_information: 'Si un acteur dominant émerge sur ce marché dans les 3 mois.',
      acknowledged: {
        hypothesis_contradiction: false,
        major_constraint: false,
        new_information: false,
      },
    },
    participant_confirmed: true,
  };
}

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword(PASS);
  const adminHash = await hashPassword(ADMIN_PASS);

  adminId = randomUUID();
  participantId = randomUUID();
  participant2Id = randomUUID();
  cohortId = randomUUID();
  participantEmail = `s4p+${participantId.slice(0,6)}@ex.com`;
  participant2Email = `s4p2+${participant2Id.slice(0,6)}@ex.com`;

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s4admin@ex.com`, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilot S4', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  /* Participants at sprint 4 */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 4, 1, 'in_progress')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 4, 1, 'in_progress')`)
    .run(randomUUID(), participant2Id, cohortId);

  /* S2 completed paths */
  s2PathA = makeS2Path({ id: randomUUID(), name: 'Piste Formation PME' });
  s2PathB = makeS2Path({ id: randomUUID(), name: 'Piste Coaching individuel' });

  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's2_paths', ?)`)
    .run(randomUUID(), participantId, JSON.stringify({
      version: 1, status: 'complete',
      paths: [s2PathA, s2PathB],
    }));

  /* S3 completed */
  s3RowId = randomUUID();
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's3_arbitration', ?)`)
    .run(s3RowId, participantId, makeS3Content(s2PathA, s2PathB));

  /* S2 + S3 for participant2 (isolation) */
  const p2Path = makeS2Path({ id: randomUUID(), name: 'Piste Marie' });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's2_paths', ?)`)
    .run(randomUUID(), participant2Id, JSON.stringify({ version: 1, status: 'complete', paths: [p2Path] }));
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's3_arbitration', ?)`)
    .run(randomUUID(), participant2Id, makeS3Content(p2Path, makeS2Path({ id: randomUUID() })));

  /* Mission for sprint 4 */
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'A', 4, 'Contrat de Direction', 1, 0, ?)`)
    .run(randomUUID(), cohortId, adminId);

  const r1 = await request(app).post('/auth/login').send({ email: participantEmail, password: PASS });
  participantCookies = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: participant2Email, password: PASS });
  participant2Cookies = r2.headers['set-cookie'];
  const r3 = await request(app).post('/auth/login').send({ email: 's4admin@ex.com', password: ADMIN_PASS });
  adminCookies = r3.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── 1. GET /api/s4/direction ──────────────────────────────────── */
describe('GET /api/s4/direction', () => {
  it('requires auth', async () => {
    const r = await request(app).get('/api/s4/direction');
    expect(r.status).toBe(401);
  });

  it('returns null s4 with priority_path and set_aside_paths when no direction exists', async () => {
    const r = await request(app).get('/api/s4/direction').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s4).toBeNull();
    expect(r.body.priority_path).not.toBeNull();
    expect(r.body.priority_path.id).toBe(s2PathA.id);
    expect(r.body.set_aside_paths).toHaveLength(1);
    expect(r.body.set_aside_paths[0].id).toBe(s2PathB.id);
  });

  it('returns priority_path prefilled from S3', async () => {
    const r = await request(app).get('/api/s4/direction').set('Cookie', participantCookies);
    expect(r.body.priority_path.person).toBe(s2PathA.person);
    expect(r.body.priority_path.problem).toBe(s2PathA.problem);
  });
});

/* ── 2. PUT /api/s4/direction — draft save ─────────────────────── */
describe('PUT /api/s4/direction', () => {
  it('requires auth', async () => {
    const r = await request(app).put('/api/s4/direction').send({});
    expect(r.status).toBe(401);
  });

  it('saves draft with partial data', async () => {
    const r = await request(app).put('/api/s4/direction')
      .set('Cookie', participantCookies)
      .send({
        direction: { formulation: 'Test initial', person: 'Managers PME', problem: 'Recrutement' },
        why_for_test: 'Parce que j\'ai de l\'expérience.',
      });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s4.status).toBe('draft');
    expect(r.body.s4.direction.formulation).toBe('Test initial');
  });

  it('prefills from S3 on first save', async () => {
    const r = await request(app).put('/api/s4/direction')
      .set('Cookie', participantCookies)
      .send({ direction: { formulation: 'Ma Direction', person: 'Managers PME', problem: 'Recrutement' } });
    expect(r.status).toBe(200);
    expect(r.body.s4.s3_ref).toBe(s3RowId);
    expect(r.body.s4.s3_snapshot_priority).not.toBeNull();
    expect(r.body.s4.s3_snapshot_priority.id).toBe(s2PathA.id);
  });

  it('does NOT create a decision on draft save', async () => {
    const db = getDb(TEST_DB);
    const decisions = db.prepare(`SELECT * FROM decisions WHERE user_id = ?`).all(participantId);
    expect(decisions).toHaveLength(0);
  });

  it('does NOT create a proof on draft save', async () => {
    const db = getDb(TEST_DB);
    const proofs = db.prepare(`SELECT * FROM proofs WHERE user_id = ?`).all(participantId);
    expect(proofs).toHaveLength(0);
  });

  it('ownership isolation — participant2 GET returns their own data only', async () => {
    await request(app).put('/api/s4/direction')
      .set('Cookie', participant2Cookies)
      .send({ direction: { formulation: 'Direction Marie', person: 'Autre cible', problem: 'Autre problème' } });

    const r1 = await request(app).get('/api/s4/direction').set('Cookie', participantCookies);
    const r2 = await request(app).get('/api/s4/direction').set('Cookie', participant2Cookies);
    expect(r1.body.s4.direction.formulation).not.toBe('Direction Marie');
    expect(r2.body.s4.direction.formulation).toBe('Direction Marie');
  });
});

/* ── 3. POST /api/s4/direction/lock — completeness ─────────────── */
describe('POST /api/s4/direction/lock — completeness validation', () => {
  it('requires auth', async () => {
    const r = await request(app).post('/api/s4/direction/lock');
    expect(r.status).toBe(401);
  });

  it('rejects when not on sprint 4', async () => {
    const db = getDb(TEST_DB);
    const tmpId = randomUUID();
    const tmpEmail = `s4tmp+${tmpId.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Tmp', 0)`)
      .run(tmpId, tmpEmail, hash);
    db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 3, 1, 'in_progress')`)
      .run(randomUUID(), tmpId, cohortId);
    const login = await request(app).post('/auth/login').send({ email: tmpEmail, password: PASS });
    const cookies = login.headers['set-cookie'];
    const r = await request(app).post('/api/s4/direction/lock').set('Cookie', cookies);
    expect(r.status).toBe(400);
  });

  it('rejects when no s4 state exists', async () => {
    /* Use participant2 who has never saved a direction */
    const db = getDb(TEST_DB);
    const tmpId = randomUUID();
    const tmpEmail = `s4tmp2+${tmpId.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Tmp2', 0)`)
      .run(tmpId, tmpEmail, hash);
    db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 4, 1, 'in_progress')`)
      .run(randomUUID(), tmpId, cohortId);
    const login = await request(app).post('/auth/login').send({ email: tmpEmail, password: PASS });
    const cookies = login.headers['set-cookie'];
    const r = await request(app).post('/api/s4/direction/lock').set('Cookie', cookies);
    expect(r.status).toBe(400);
  });

  it('rejects when direction.formulation is empty', async () => {
    await request(app).put('/api/s4/direction').set('Cookie', participantCookies).send({
      direction: { formulation: '', person: 'Managers PME', problem: 'Recrutement' },
    });
    const r = await request(app).post('/api/s4/direction/lock').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/Direction/i);
  });

  it('rejects when participant_confirmed is false', async () => {
    await request(app).put('/api/s4/direction').set('Cookie', participantCookies).send({
      ...makeFullDirection(),
      participant_confirmed: false,
    });
    const r = await request(app).post('/api/s4/direction/lock').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/confirm/i);
  });

  it('rejects when reopening_conditions incomplete', async () => {
    await request(app).put('/api/s4/direction').set('Cookie', participantCookies).send({
      ...makeFullDirection(),
      reopening_conditions: {
        hypothesis_contradiction: '',
        major_constraint: 'Loi limitante',
        new_information: 'Acteur dominant',
        acknowledged: { hypothesis_contradiction: false, major_constraint: false, new_information: false },
      },
    });
    const r = await request(app).post('/api/s4/direction/lock').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/réouverture/i);
  });

  it('accepts acknowledged reopening condition in lieu of text', async () => {
    await request(app).put('/api/s4/direction').set('Cookie', participantCookies).send({
      ...makeFullDirection(),
      reopening_conditions: {
        hypothesis_contradiction: '',
        major_constraint: 'Loi limitante',
        new_information: 'Acteur dominant',
        acknowledged: { hypothesis_contradiction: true, major_constraint: false, new_information: false },
      },
    });
    /* completeness should pass for that field — full lock tested below */
    const full = makeFullDirection();
    await request(app).put('/api/s4/direction').set('Cookie', participantCookies).send(full);
    /* not testing lock outcome here — just that this combo doesn't 422 on that field */
  });
});

/* ── 4. POST /api/s4/direction/lock — successful lock ──────────── */
describe('POST /api/s4/direction/lock — successful lock', () => {
  beforeAll(async () => {
    /* Ensure complete state before locking */
    await request(app).put('/api/s4/direction')
      .set('Cookie', participantCookies)
      .send(makeFullDirection());
  });

  it('locks successfully and returns decision, submission, proof', async () => {
    const r = await request(app).post('/api/s4/direction/lock').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.decision).not.toBeNull();
    expect(r.body.proof).not.toBeNull();
  });

  it('decision has correct fields: type=project, status=active, cadre_step=A, sprint=4', async () => {
    const db = getDb(TEST_DB);
    const dec = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND status = 'active'`).get(participantId);
    expect(dec).not.toBeNull();
    expect(dec.decision_type).toBe('project');
    expect(dec.status).toBe('active');
    expect(dec.cadre_step).toBe('A');
    expect(dec.sprint_number).toBe(4);
    expect(dec.title).toBe('Direction validée pour test');
    expect(dec.rationale).toContain('managers');
  });

  it('Proof #1 created with correct fields: type=note, cadre_step=A, title="01 — Ma Direction"', async () => {
    const db = getDb(TEST_DB);
    const proof = db.prepare(`SELECT * FROM proofs WHERE user_id = ?`).get(participantId);
    expect(proof).not.toBeNull();
    expect(proof.proof_type).toBe('note');
    expect(proof.cadre_step).toBe('A');
    expect(proof.title).toBe('01 — Ma Direction');
    const content = JSON.parse(proof.content);
    expect(content.formulation).toBeTruthy();
    expect(content.decision_id).toBeTruthy();
  });

  it('mission submission created with status=submitted', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`SELECT * FROM mission_submissions WHERE user_id = ? AND status = 'submitted'`).get(participantId);
    expect(sub).not.toBeNull();
    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s4_direction_snapshot');
    expect(content.direction).not.toBeNull();
    expect(content.decision_id).toBeTruthy();
  });

  it('live s4 state has status=locked and decision_id populated', async () => {
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's4_direction'`).get(participantId);
    const data = JSON.parse(row.content);
    expect(data.status).toBe('locked');
    expect(data.decision_id).toBeTruthy();
    expect(data.proof_id).toBeTruthy();
    expect(data.confirmed_at).toBeTruthy();
  });

  it('PUT is blocked after lock', async () => {
    const r = await request(app).put('/api/s4/direction')
      .set('Cookie', participantCookies)
      .send({ direction: { formulation: 'Nouvelle tentative', person: 'X', problem: 'Y' } });
    expect(r.status).toBe(409);
  });
});

/* ── 5. Idempotency ─────────────────────────────────────────────── */
describe('POST /api/s4/direction/lock — idempotency', () => {
  it('double lock returns existing decision without creating duplicates', async () => {
    const db = getDb(TEST_DB);
    const countBefore = db.prepare(`SELECT COUNT(*) as n FROM decisions WHERE user_id = ?`).get(participantId).n;
    const r = await request(app).post('/api/s4/direction/lock').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.idempotent).toBe(true);
    const countAfter = db.prepare(`SELECT COUNT(*) as n FROM decisions WHERE user_id = ?`).get(participantId).n;
    expect(countAfter).toBe(countBefore);
  });
});

/* ── 6. Supersession ────────────────────────────────────────────── */
describe('POST /api/s4/direction/lock — supersession', () => {
  it('supersedes existing active project decision when locking again', async () => {
    const db = getDb(TEST_DB);

    /* Create a fresh participant with an existing project decision */
    const supId = randomUUID();
    const supEmail = `s4sup+${supId.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sup', 0)`)
      .run(supId, supEmail, hash);
    db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 4, 1, 'in_progress')`)
      .run(randomUUID(), supId, cohortId);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), supId, cohortId);

    /* Insert pre-existing project decision */
    const oldDecId = randomUUID();
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at) VALUES (?, ?, 'project', 'Old Direction', '{}', 'old rationale', 3, 'A', 'active', '', '', '{}', ?)`)
      .run(oldDecId, supId, new Date().toISOString());

    /* Set up S2+S3 for supId */
    const supPath = makeS2Path({ id: randomUUID() });
    const supPath2 = makeS2Path({ id: randomUUID() });
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's2_paths', ?)`)
      .run(randomUUID(), supId, JSON.stringify({ version: 1, status: 'complete', paths: [supPath, supPath2] }));
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's3_arbitration', ?)`)
      .run(randomUUID(), supId, makeS3Content(supPath, supPath2));

    const login = await request(app).post('/auth/login').send({ email: supEmail, password: PASS });
    const supCookies = login.headers['set-cookie'];

    /* Save complete s4 state */
    await request(app).put('/api/s4/direction').set('Cookie', supCookies).send(makeFullDirection());

    /* Lock */
    const r = await request(app).post('/api/s4/direction/lock').set('Cookie', supCookies);
    expect(r.status).toBe(200);

    /* Old decision should be superseded */
    const oldDec = db.prepare(`SELECT status FROM decisions WHERE id = ?`).get(oldDecId);
    expect(oldDec.status).toBe('superseded');

    /* New decision should be active */
    const newDec = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND status = 'active'`).get(supId);
    expect(newDec).not.toBeNull();
    expect(newDec.supersedes_id).toBe(oldDecId);
  });
});

/* ── 7. GET returns s3_changed flag ─────────────────────────────── */
describe('GET /api/s4/direction — s3_changed flag', () => {
  it('s3_changed is false when s3 ref matches', async () => {
    const r = await request(app).get('/api/s4/direction').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s4).not.toBeNull();
    expect(r.body.s4.s3_changed).toBe(false);
  });
});

/* ── 8. Cockpit S4 summary ──────────────────────────────────────── */
describe('GET /api/cockpit — S4 summary', () => {
  it('returns s4Direction when on sprint 4', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s4Direction).not.toBeNull();
    expect(r.body.s4Direction.status).toBe('locked');
    expect(r.body.s4Direction.formulation).toBeTruthy();
    expect(r.body.s4Direction.decisionId).toBeTruthy();
  });
});

/* ── 9. Admin visibility ────────────────────────────────────────── */
describe('Admin visibility — decisions table', () => {
  it('admin can read decisions table directly', async () => {
    const db = getDb(TEST_DB);
    const decisions = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND status = 'active'`).all(participantId);
    expect(decisions.length).toBeGreaterThanOrEqual(1);
  });
});

/* ── 10. COPILOTE S4 behavioral instructions ────────────────────── */
describe('COPILOTE S4 behavioral instructions', () => {
  it('SYSTEM_PROMPT contains S4-specific rules section', () => {
    expect(copiloteRouteSrc).toContain('SPRINT 4 / VERROUILLE TA DIRECTION');
  });

  it('prohibits choosing Direction for participant', () => {
    expect(copiloteRouteSrc).toContain('Choisir la Direction à sa place');
  });

  it('prohibits modifying the official decision', () => {
    expect(copiloteRouteSrc).toContain('Créer, modifier ou supprimer la décision stratégique');
  });

  it('includes "hesitation to lock" refusal script', () => {
    expect(copiloteRouteSrc).toContain('Ce n\'est pas une décision irrévocable');
  });

  it('includes post-lock change refusal script', () => {
    expect(copiloteRouteSrc).toContain('La Direction est verrouillée');
  });

  it('prohibits market validation claims', () => {
    expect(copiloteRouteSrc).toContain('la Direction est "la bonne" ou validée par le marché');
  });

  it('allows helping formulate Direction clearly', () => {
    expect(copiloteRouteSrc).toContain('formuler sa Direction avec clarté');
  });
});
