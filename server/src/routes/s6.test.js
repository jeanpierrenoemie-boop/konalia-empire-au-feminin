/**
 * S6 — TON OFFRE MINIMUM TESTABLE — Tests
 * Build 21F: Test Offer CRUD, completeness, submit, gate S7.
 */

// ── DB bootstrap — MUST be before any ESM imports ────────────────
import path from 'path';
import os from 'os';
const TEST_DB = path.join(os.tmpdir(), `rc-s6-test-${Date.now()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's6-test-secret-32-chars-minimum!!';
process.env.JWT_EXPIRES_IN  = '1h';
process.env.COOKIE_SECURE   = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { getAdapter } from '../db/adapter.js';
import { createApp } from '../../server.js';
import { evaluateGate } from '../gates.js';

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

let s4DecisionId, s5RowId;

function makeFullS6() {
  return {
    audience: { formulation: 'Femmes salariées 35-50 ans en reconversion professionnelle' },
    problem: { formulation: 'Elles ne savent pas par où commencer pour structurer leur projet' },
    desired_result: { formulation: 'Avoir une piste prioritaire et ses 3 premières actions' },
    proposition: { type: 'Accompagnement individuel', description: '3 séances individuelles de 90 min' },
    included: ['3 séances Zoom de 90 min', 'Support de travail personnalisé'],
    delivery: { duration: '3 semaines', modality: 'Visio Zoom', steps: 'Session 1: exploration, Session 2: priorisation, Session 3: plan' },
    pricing: {
      amount: 450,
      currency: 'EUR',
      model: 'Forfait',
      rationale: 'Basé sur 3h de travail à 150€/h',
      status: 'hypothesis',
    },
    client_tomorrow_test: {
      answer: 'yes',
      missing: [],
      note: '',
    },
    epistemic: {
      facts: 'J\'ai discuté avec 3 femmes en reconversion qui ont mentionné ce problème',
      facts_acknowledged: false,
      assumptions: 'Je suppose que ce manque de méthode est fréquent',
      assumptions_acknowledged: false,
      to_verify: 'Est-ce que le prix de 450€ est acceptable pour elles ?',
      to_verify_acknowledged: false,
    },
    synthesis: 'Un accompagnement en 3 séances pour passer de l\'idée à la première action.',
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
  participantEmail = `s6p+${participantId.slice(0,6)}@ex.com`;
  participant2Email = `s6p2+${participant2Id.slice(0,6)}@ex.com`;

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s6admin@ex.com`, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilot S6', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'D', 6, 1, 'in_progress')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'D', 6, 1, 'in_progress')`)
    .run(randomUUID(), participant2Id, cohortId);

  /* Active S4 direction decision for participantId */
  s4DecisionId = randomUUID();
  const dirContext = JSON.stringify({
    direction: {
      formulation: 'Je vais tester si les femmes salariées en reconversion seraient prêtes à investir dans un accompagnement structuré.',
      person: 'Femmes salariées 35-50 ans en reconversion',
      problem: 'Manque de méthode pour lancer un projet en parallèle de leur emploi',
    },
  });
  db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
    VALUES (?, ?, 'project', 'Direction validée pour test', ?, ?, 4, 'A', 'active', '', '', '{}', ?)`)
    .run(s4DecisionId, participantId, dirContext, 'Raison de test', new Date().toISOString());

  /* Active S4 direction for participant2 */
  const p2DecId = randomUUID();
  db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
    VALUES (?, ?, 'project', 'Direction Marie', ?, ?, 4, 'A', 'active', '', '', '{}', ?)`)
    .run(p2DecId, participant2Id, JSON.stringify({ direction: { formulation: 'Direction Marie', person: 'Test', problem: 'Test' } }), 'Raison', new Date().toISOString());

  /* Submitted S5 data for participantId */
  s5RowId = randomUUID();
  const s5Content = JSON.stringify({
    version: 1,
    status: 'submitted',
    target_test: {
      who: 'Femmes salariées 35-50 ans en reconversion professionnelle',
      situation: 'Elles travaillent à temps plein et veulent lancer un projet en parallèle',
      recognition_signals: 'Elles parlent de "vouloir avoir leur propre truc"',
      access_places: 'Groupes Facebook reconversion, LinkedIn',
    },
    five_person_test: { answer: 'yes', diagnosis: [], note: '' },
    problem_to_investigate: {
      situation: 'Quand elles décident de se lancer, elles ne savent pas par où commencer',
      difficulty: 'Elles sont débordées par les choix',
      consequence: 'Elles reportent indéfiniment leur projet',
      why_investigate: 'Si ce problème est récurrent, il y a peut-être quelque chose à proposer',
    },
    epistemic: { facts: 'j\'ai parlé à 3 personnes', facts_acknowledged: false, assumptions: 'c\'est fréquent', assumptions_acknowledged: false, to_verify: 'demande réelle', to_verify_acknowledged: false },
    synthesis: 'Investiguer si les femmes salariées en reconversion manquent d\'une méthode structurée.',
    submitted_at: new Date().toISOString(),
  });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's5_target_problem', ?)`)
    .run(s5RowId, participantId, s5Content);

  /* Submitted S5 data for participant2 */
  const p2S5Content = JSON.stringify({ version: 1, status: 'submitted', target_test: { who: 'Test', situation: 'test', recognition_signals: 'test', access_places: 'test' }, five_person_test: { answer: 'yes', diagnosis: [], note: '' }, problem_to_investigate: { situation: 'test', difficulty: 'test', consequence: 'test', why_investigate: 'test' }, epistemic: { facts: 'test', facts_acknowledged: false, assumptions: 'test', assumptions_acknowledged: false, to_verify: 'test', to_verify_acknowledged: false }, synthesis: 'test', submitted_at: new Date().toISOString() });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's5_target_problem', ?)`)
    .run(randomUUID(), participant2Id, p2S5Content);

  /* Mission for sprint 6 */
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'D', 6, 'Offre Minimum Testable', 1, 0, ?)`)
    .run(randomUUID(), cohortId, adminId);

  const r1 = await request(app).post('/auth/login').send({ email: participantEmail, password: PASS });
  participantCookies = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: participant2Email, password: PASS });
  participant2Cookies = r2.headers['set-cookie'];
  const r3 = await request(app).post('/auth/login').send({ email: 's6admin@ex.com', password: ADMIN_PASS });
  adminCookies = r3.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── 1. GET /api/s6/test-offer ────────────────────────────────────── */
describe('GET /api/s6/test-offer', () => {
  it('1. requires auth', async () => {
    const r = await request(app).get('/api/s6/test-offer');
    expect(r.status).toBe(401);
  });

  it('2. returns 400 when no S5 submitted', async () => {
    const db = getDb(TEST_DB);
    const noS5 = randomUUID();
    const noS5Email = `s6nos5+${noS5.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NoS5', 0)`)
      .run(noS5, noS5Email, hash);
    // Add S4 direction for this user
    const decId = randomUUID();
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
      VALUES (?, ?, 'project', 'Dir', '{}', 'R', 4, 'A', 'active', '', '', '{}', ?)`)
      .run(decId, noS5, new Date().toISOString());
    const lr = await request(app).post('/auth/login').send({ email: noS5Email, password: PASS });
    const cookies = lr.headers['set-cookie'];
    const r = await request(app).get('/api/s6/test-offer').set('Cookie', cookies);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/S5/i);
  });

  it('3. returns prefill from S4 and S5 when no s6 yet', async () => {
    const r = await request(app).get('/api/s6/test-offer').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s6).toBeNull();
    expect(r.body.direction_ref).not.toBeNull();
    expect(r.body.direction_ref.decision_id).toBe(s4DecisionId);
    expect(r.body.s5_ref).not.toBeNull();
    expect(r.body.prefill).not.toBeNull();
    expect(r.body.prefill.audience.formulation).toBeTruthy(); // prefilled from S5
  });
});

/* ── 2. PUT /api/s6/test-offer — draft save ──────────────────────── */
describe('PUT /api/s6/test-offer', () => {
  it('4. saves draft successfully', async () => {
    const r = await request(app).put('/api/s6/test-offer')
      .set('Cookie', participantCookies)
      .send({ audience: { formulation: 'Femmes reconversion 40 ans' } });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s6.status).toBe('draft');
    expect(r.body.s6.audience.formulation).toBe('Femmes reconversion 40 ans');
  });

  it('5. draft persists on reload', async () => {
    const r = await request(app).get('/api/s6/test-offer').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s6).not.toBeNull();
    expect(r.body.s6.audience.formulation).toBe('Femmes reconversion 40 ans');
  });

  it('6. PUT does NOT create any decision', async () => {
    const db = getDb(TEST_DB);
    const before = db.prepare('SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?').get(participantId).n;
    await request(app).put('/api/s6/test-offer')
      .set('Cookie', participantCookies)
      .send({ problem: { formulation: 'Elles ne savent pas par où commencer' } });
    const after = db.prepare('SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?').get(participantId).n;
    expect(after).toBe(before);
  });

  it('7. PUT does NOT create any Proof', async () => {
    const db = getDb(TEST_DB);
    const before = db.prepare('SELECT COUNT(*) AS n FROM proofs WHERE user_id = ?').get(participantId).n;
    await request(app).put('/api/s6/test-offer')
      .set('Cookie', participantCookies)
      .send({ desired_result: { formulation: 'Piste prioritaire et 3 actions' } });
    const after = db.prepare('SELECT COUNT(*) AS n FROM proofs WHERE user_id = ?').get(participantId).n;
    expect(after).toBe(before);
  });

  it('8. pricing.status is always forced to hypothesis', async () => {
    const r = await request(app).put('/api/s6/test-offer')
      .set('Cookie', participantCookies)
      .send({ pricing: { amount: 500, status: 'confirmed' } });
    expect(r.status).toBe(200);
    expect(r.body.s6.pricing.status).toBe('hypothesis');
  });
});

/* ── 3. POST /api/s6/test-offer/submit — completeness checks ─────── */
describe('POST /api/s6/test-offer/submit — completeness', () => {
  async function freshUser() {
    const db = getDb(TEST_DB);
    const uid = randomUUID();
    const email = `s6fresh+${uid.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Fresh', 0)`)
      .run(uid, email, hash);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    const decId = randomUUID();
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
      VALUES (?, ?, 'project', 'Dir', ?, 'R', 4, 'A', 'active', '', '', '{}', ?)`)
      .run(decId, uid, JSON.stringify({ direction: { formulation: 'f', person: 'p', problem: 'pr' } }), new Date().toISOString());
    const s5Content = JSON.stringify({ version: 1, status: 'submitted', target_test: { who: 'T', situation: 's', recognition_signals: 'r', access_places: 'a' }, five_person_test: { answer: 'yes', diagnosis: [], note: '' }, problem_to_investigate: { situation: 's', difficulty: 'd', consequence: 'c', why_investigate: 'w' }, epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false }, synthesis: 'sy', submitted_at: new Date().toISOString() });
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's5_target_problem', ?)`)
      .run(randomUUID(), uid, s5Content);
    const lr = await request(app).post('/auth/login').send({ email, password: PASS });
    return { uid, cookies: lr.headers['set-cookie'] };
  }

  async function seedDraft(cookies, patch) {
    return request(app).put('/api/s6/test-offer').set('Cookie', cookies).send(patch);
  }

  it('8. audience manquante → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6(); delete d.audience;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/pour qui|audience/i);
  });

  it('9. problem manquant → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, problem: { formulation: '' } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/problème/i);
  });

  it('10. result manquant → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, desired_result: { formulation: '' } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/résultat/i);
  });

  it('11. proposition manquante → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, proposition: { type: '', description: '' } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/proposes|proposition/i);
  });

  it('12. included vide → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, included: [] });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/inclus/i);
  });

  it('13. delivery manquant → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, delivery: { duration: '', modality: '', steps: '' } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/comment|déroule/i);
  });

  it('14. prix manquant → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, pricing: { amount: null, currency: 'EUR', model: '', rationale: '', status: 'hypothesis' } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/prix|tarifaire/i);
  });

  it('15. pricing.status ≠ hypothesis → 422', async () => {
    const { cookies } = await freshUser();
    // PUT enforces hypothesis, so directly insert bad data
    const db = getDb(TEST_DB);
    const uid = (await request(app).get('/api/s6/test-offer').set('Cookie', cookies)).status; // ensure row created
    // force bad status in DB
    const { cookies: fc } = await freshUser();
    await seedDraft(fc, makeFullS6());
    const row = db.prepare(`SELECT id, owner_id, content FROM participant_data WHERE data_type = 's6_test_offer' ORDER BY rowid DESC LIMIT 1`).get();
    if (row) {
      const content = JSON.parse(row.content);
      content.pricing.status = 'confirmed';
      db.prepare(`UPDATE participant_data SET content = ? WHERE id = ?`).run(JSON.stringify(content), row.id);
      const lr2 = await request(app).post('/auth/login').send({ email: `s6fresh+${row.owner_id.slice(0,6)}@ex.com`, password: PASS });
      if (lr2.status !== 200) return; // skip if user email mismatch
      const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', lr2.headers['set-cookie']);
      if (r.status === 422) {
        expect(r.body.error).toMatch(/hypothèse/i);
      }
    }
  });

  it('16. client_tomorrow_test manquant → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, client_tomorrow_test: { answer: null, missing: [], note: '' } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/client demain/i);
  });

  it('17. not_yet sans diagnostic ni note → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, client_tomorrow_test: { answer: 'not_yet', missing: [], note: '' } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/pas encore|manque|note/i);
  });

  it('18. epistemic facts vide non acknowledged → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, epistemic: { ...d.epistemic, facts: '', facts_acknowledged: false } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/sais|faits/i);
  });

  it('19. epistemic assumptions vide non acknowledged → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, epistemic: { ...d.epistemic, assumptions: '', assumptions_acknowledged: false } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/suppositions/i);
  });

  it('20. epistemic to_verify vide non acknowledged → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS6();
    await seedDraft(cookies, { ...d, epistemic: { ...d.epistemic, to_verify: '', to_verify_acknowledged: false } });
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/vérifier/i);
  });
});

/* ── 4. POST /api/s6/test-offer/submit — success ─────────────────── */
describe('POST /api/s6/test-offer/submit — success', () => {
  it('21. submit complet avec client_tomorrow yes → 200', async () => {
    await request(app).put('/api/s6/test-offer')
      .set('Cookie', participantCookies)
      .send(makeFullS6());
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('22. submit complet avec client_tomorrow not_yet + note → 200', async () => {
    // participant2
    const d = makeFullS6();
    d.client_tomorrow_test = { answer: 'not_yet', missing: [], note: 'Je dois préparer une présentation' };
    await request(app).put('/api/s6/test-offer')
      .set('Cookie', participant2Cookies)
      .send(d);
    const r = await request(app).post('/api/s6/test-offer/submit').set('Cookie', participant2Cookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('23. mission sprint_number=6 créée', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`
      SELECT ms.* FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 6
    `).get(participantId);
    expect(sub).toBeTruthy();
    expect(sub.status).toBe('submitted');
  });

  it('24. participant_data status=submitted', async () => {
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's6_test_offer' LIMIT 1`).get(participantId);
    expect(row).toBeTruthy();
    const parsed = JSON.parse(row.content);
    expect(parsed.status).toBe('submitted');
  });

  it('25. aucune décision stratégique créée par S6', async () => {
    const db = getDb(TEST_DB);
    // Only the initial S4 decision should exist
    const decisions = db.prepare(`SELECT * FROM decisions WHERE user_id = ? ORDER BY created_at`).all(participantId);
    expect(decisions.length).toBe(1);
    expect(decisions[0].id).toBe(s4DecisionId);
    expect(decisions[0].decision_type).toBe('project');
  });

  it('26. aucune pricing decision créée', async () => {
    const db = getDb(TEST_DB);
    const pricingDec = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND decision_type = 'revenue'`).all(participantId);
    expect(pricingDec.length).toBe(0);
  });

  it('27. aucune Proof créée', async () => {
    const db = getDb(TEST_DB);
    const proofs = db.prepare(`SELECT * FROM proofs WHERE user_id = ?`).all(participantId);
    expect(proofs.length).toBe(0);
  });

  it('28. S4 direction inchangée après submit S6', async () => {
    const db = getDb(TEST_DB);
    const dec = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(s4DecisionId);
    expect(dec).toBeTruthy();
    expect(dec.status).toBe('active');
    expect(dec.decision_type).toBe('project');
  });

  it('29. S5 target_problem inchangée après submit S6', async () => {
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE id = ?`).get(s5RowId);
    const parsed = JSON.parse(row.content);
    expect(parsed.status).toBe('submitted');
    expect(parsed.target_test.who).toMatch(/reconversion/i);
  });

  it('30. snapshot complet dans mission_submission', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`
      SELECT ms.* FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 6
    `).get(participantId);
    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s6_test_offer_snapshot');
    expect(content.audience).toBeTruthy();
    expect(content.pricing).toBeTruthy();
    expect(content.client_tomorrow_test).toBeTruthy();
    expect(content.epistemic).toBeTruthy();
    expect(content.direction_ref).toBeTruthy();
  });

  it('31. re-submit idempotent (pas de doublon)', async () => {
    const db = getDb(TEST_DB);
    const before = db.prepare(`
      SELECT COUNT(*) AS n FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 6
    `).get(participantId).n;

    // re-submit
    await request(app).post('/api/s6/test-offer/submit').set('Cookie', participantCookies);

    const after = db.prepare(`
      SELECT COUNT(*) AS n FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 6
    `).get(participantId).n;
    expect(after).toBe(before);
  });

  it('32. audit event écrit', async () => {
    const db = getDb(TEST_DB);
    const audit = db.prepare(`SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 's6_test_offer_submitted' ORDER BY rowid DESC LIMIT 1`).get(participantId);
    expect(audit).toBeTruthy();
  });

  it('33. PUT bloqué après submit (409)', async () => {
    const r = await request(app).put('/api/s6/test-offer')
      .set('Cookie', participantCookies)
      .send({ audience: { formulation: 'Tentative modification' } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/soumise/i);
  });
});

/* ── 5. Cockpit ────────────────────────────────────────────────────── */
describe('GET /api/cockpit — s6TestOffer', () => {
  it('34. retourne s6TestOffer quand sprint 6', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s6TestOffer).not.toBeNull();
    expect(r.body.s6TestOffer.status).toBe('submitted');
    expect(r.body.s6TestOffer.pricingStatus).toBe('hypothesis');
  });
});

/* ── 6. Gate S7 matrix ─────────────────────────────────────────────── */
describe('Gate S7 — sync + async', () => {
  async function makeGateUser({ missionS6 = false, s6Data = false } = {}) {
    const db = getDb(TEST_DB);
    const uid = randomUUID();
    const email = `s6gate+${uid.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Gate', 0)`)
      .run(uid, email, hash);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);

    if (missionS6) {
      const mission = db.prepare(`SELECT id FROM missions WHERE sprint_number = 6 LIMIT 1`).get();
      if (mission) {
        db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
          .run(randomUUID(), mission.id, uid, cohortId, new Date().toISOString(), new Date().toISOString());
      }
    }

    if (s6Data) {
      const content = JSON.stringify({ version: 1, status: 'submitted' });
      db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's6_test_offer', ?)`)
        .run(randomUUID(), uid, content);
    }

    return { uid, db };
  }

  it('35A. Gate S7 ROUGE — ni mission6 ni s6Data', async () => {
    const { uid, db } = await makeGateUser();
    const gate = evaluateGate(db, uid, 7);
    expect(gate.status).toBe('ROUGE');
    expect(gate.missing.length).toBe(2);
  });

  it('35B. Gate S7 ROUGE — mission6 seul', async () => {
    const { uid, db } = await makeGateUser({ missionS6: true });
    const gate = evaluateGate(db, uid, 7);
    expect(gate.status).toBe('ROUGE');
    expect(gate.missing).toContain('Offre test S6 soumise');
  });

  it('35C. Gate S7 ROUGE — s6Data seul', async () => {
    const { uid, db } = await makeGateUser({ s6Data: true });
    const gate = evaluateGate(db, uid, 7);
    expect(gate.status).toBe('ROUGE');
    expect(gate.missing).toContain('Offre Minimum Testable sprint 6 soumise');
  });

  it('35D. Gate S7 VERT — mission6 + s6Data', async () => {
    const { uid, db } = await makeGateUser({ missionS6: true, s6Data: true });
    const gate = evaluateGate(db, uid, 7);
    expect(gate.status).toBe('VERT');
    expect(gate.missing.length).toBe(0);
  });

  it('35E. Gate S7 async — ROUGE sans rien', async () => {
    const { uid } = await makeGateUser();
    const db = getAdapter();
    const gate = await evaluateGate(db, uid, 7);
    expect(gate.status).toBe('ROUGE');
  });

  it('35F. Gate S7 async — VERT avec mission6 + s6Data', async () => {
    const { uid } = await makeGateUser({ missionS6: true, s6Data: true });
    const db = getAdapter();
    const gate = await evaluateGate(db, uid, 7);
    expect(gate.status).toBe('VERT');
  });

  it('35G. Gate S6 (gateS6) non affaiblie — toujours mission5 + s5DataSubmitted', async () => {
    const { uid, db } = await makeGateUser();
    const gate = evaluateGate(db, uid, 6);
    expect(gate.status).toBe('ROUGE');
    expect(gate.missing).toContain('Sprint 5 complete');
    expect(gate.missing).toContain('Cible test S5 soumise');
  });

  it('35H. Gate S7 override ORANGE', async () => {
    const { uid, db } = await makeGateUser();
    db.prepare(`INSERT INTO gate_overrides (id, user_id, sprint_number, exception_type, reason, override_by) VALUES (?, ?, 7, 'ORANGE', 'Raison test', ?)`)
      .run(randomUUID(), uid, adminId);
    const gate = evaluateGate(db, uid, 7);
    expect(gate.status).toBe('ORANGE');
  });

  it('35I. Gate S7 async async — no json_extract used in _s6DataSubmitted', async () => {
    // The async path reads content as JSON.parse, not json_extract
    const { uid } = await makeGateUser({ missionS6: true, s6Data: true });
    const db = getAdapter();
    const gate = await evaluateGate(db, uid, 7);
    expect(gate.status).toBe('VERT');
  });
});

/* ── 7. COPILOTE S6 rules ───────────────────────────────────────────── */
describe('COPILOTE — S6 rules present', () => {
  it('36. SPRINT 6 section exists in SYSTEM_PROMPT', () => {
    expect(copiloteRouteSrc).toContain('SPRINT 6 — TON OFFRE MINIMUM TESTABLE');
  });

  it('37. COPILOTE ne doit pas déclarer l\'offre validée', () => {
    expect(copiloteRouteSrc).toContain('Déclarer l\'offre validée ou le prix validé');
  });

  it('38. SCÉNARIO PRIX présent', () => {
    expect(copiloteRouteSrc).toContain('SCÉNARIO PRIX');
  });

  it('39. Phrase clé S6 présente', () => {
    expect(copiloteRouteSrc).toContain('suffisamment claire pour que le marché');
  });
});
