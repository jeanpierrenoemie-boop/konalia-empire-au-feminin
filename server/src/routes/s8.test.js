/**
 * S8 — PREMIER TEST TERRAIN — Tests
 * Build 21H: First Field Test CRUD, completeness, submit, gate S9.
 */

// ── DB bootstrap — MUST be before any ESM imports ────────────────
import path from 'path';
import os from 'os';
const TEST_DB = path.join(os.tmpdir(), `rc-s8-test-${Date.now()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's8-test-secret-32-chars-minimum!!';
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

let s4DecisionId, s6RowId, s7RowId;

function makeFullS8() {
  return {
    test_context: {
      date: '2026-09-10',
      channel: 'Visio Zoom',
      person_type: 'Femme, 38 ans, salariée en reconversion',
      target_match: 'yes',
      context_note: 'Contact réseau LinkedIn',
      real_interaction_confirmed: true,
    },
    presented: {
      offer_sentence_used: 'J\'aide les femmes salariées en reconversion à avoir une piste prioritaire en 3 semaines.',
      pitch_used: 'Je propose un accompagnement en 3 séances.',
      price_presented: true,
      price_amount: 450,
      call_to_action_used: 'Je te recontacte cette semaine.',
    },
    observed_reaction: {
      initial_reaction: 'Elle a hoché la tête et demandé "c\'est pour quel type de reconversion ?"',
      questions_asked: 'Combien de temps ça prend ? Est-ce qu\'on peut faire ça en dehors des heures de bureau ?',
      objections: 'Le prix lui semblait élevé.',
      understood: 'Le problème qu\'on adresse et le format 3 séances.',
      misunderstood: 'Ce qui différencie mon offre d\'un coaching classique.',
      interest_shown: null,
    },
    verbatims: [
      'Je me demandais justement comment structurer tout ça.',
      'C\'est cher pour quelque chose qu\'on n\'a pas encore testé.',
    ],
    outcome: {
      type: 'interested_no_commitment',
      note: 'Veut y réfléchir.',
    },
    interpretation: {
      what_i_learned: 'Ma phrase d\'offre est globalement comprise mais la différenciation n\'est pas claire.',
      what_surprised_me: 'Elle a posé plus de questions sur le format que sur le problème.',
      what_to_adjust: 'Clarifier ce qui rend mon accompagnement différent d\'un coaching classique.',
    },
    next_to_verify: 'Est-ce que d\'autres personnes ont la même confusion sur la différenciation ?',
    epistemic: {
      facts: 'La personne a compris le problème adressé.',
      facts_acknowledged: false,
      assumptions: 'Je suppose que le prix est le frein principal.',
      assumptions_acknowledged: false,
      to_verify: 'Combien de personnes ont la même confusion sur la différenciation ?',
      to_verify_acknowledged: false,
    },
    synthesis: 'Test utile. Ma phrase d\'offre fonctionne mais ma différenciation doit être plus claire.',
  };
}

function makeFullS8Declined() {
  const d = makeFullS8();
  d.outcome = { type: 'declined', note: 'Pas le bon moment pour elle.' };
  return d;
}

function makeFullS8Purchase() {
  const d = makeFullS8();
  d.outcome = { type: 'purchase', note: 'A acheté directement.' };
  return d;
}

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword(PASS);
  const adminHash = await hashPassword(ADMIN_PASS);

  adminId = randomUUID();
  participantId = randomUUID();
  participant2Id = randomUUID();
  cohortId = randomUUID();
  participantEmail = `s8p+${participantId.slice(0,6)}@ex.com`;
  participant2Email = `s8p2+${participant2Id.slice(0,6)}@ex.com`;

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s8admin@ex.com`, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilot S8', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'R', 8, 1, 'in_progress')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'R', 8, 1, 'in_progress')`)
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

  /* Submitted S6 test offer for participantId */
  s6RowId = randomUUID();
  const s6Content = JSON.stringify({
    version: 1, status: 'submitted',
    audience: { formulation: 'Femmes salariées 35-50 ans en reconversion professionnelle' },
    problem: { formulation: 'Elles ne savent pas par où commencer' },
    desired_result: { formulation: 'Avoir une piste prioritaire et ses 3 premières actions' },
    proposition: { type: 'Accompagnement individuel', description: '3 séances individuelles de 90 min' },
    included: ['3 séances Zoom'], delivery: { duration: '3 semaines', modality: 'Visio', steps: 'S1,S2,S3' },
    pricing: { amount: 450, currency: 'EUR', model: 'Forfait', rationale: 'Test', status: 'hypothesis' },
    client_tomorrow_test: { answer: 'yes', missing: [], note: '' },
    epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false },
    synthesis: 'sy', submitted_at: new Date().toISOString(),
  });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's6_test_offer', ?)`)
    .run(s6RowId, participantId, s6Content);

  /* Submitted S7 presentation for participantId (needed for gate S8) */
  s7RowId = randomUUID();
  const s7Content = JSON.stringify({
    version: 1, status: 'submitted',
    offer_sentence: {
      who: 'Femmes salariées 35-50 ans en reconversion',
      result: 'avoir une piste prioritaire',
      proposition: 'accompagnement en 3 séances',
      formulation: 'J\'aide les femmes salariées en reconversion à avoir une piste prioritaire en 3 semaines.',
    },
    pitch: {
      problem: 'Elles ne savent pas par où commencer.',
      who_you_are: 'Je suis coach en reconversion.',
      what_you_propose: 'Accompagnement en 3 séances.',
      expected_result: 'Une piste prioritaire et 3 actions concrètes.',
      call_to_action: 'Contacte-moi pour un appel découverte.',
      full_text: '',
    },
    without_notes: { practiced: true, note: '' },
    understanding_check: { natural_version: 'J\'aide les femmes à choisir leur prochaine étape.' },
    epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false },
    synthesis: 'Ma présentation est prête.',
    proof_id: null, submitted_at: new Date().toISOString(),
  });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's7_presentation', ?)`)
    .run(s7RowId, participantId, s7Content);

  /* Mission for sprint 7 (needed for gate S8 mission condition) */
  const m7Id = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'D', 7, 'Présentation Terrain', 1, 0, ?)`)
    .run(m7Id, cohortId, adminId);
  db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
    .run(randomUUID(), m7Id, participantId, cohortId, new Date().toISOString(), new Date().toISOString());

  /* Mission for sprint 8 */
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'R', 8, 'Premier Test Terrain', 1, 0, ?)`)
    .run(randomUUID(), cohortId, adminId);

  /* Submitted S6/S7 for participant2 */
  const p2S6 = JSON.stringify({ version: 1, status: 'submitted', audience: { formulation: 'T' }, problem: { formulation: 'T' }, desired_result: { formulation: 'T' }, proposition: { type: 'T', description: 'T' }, included: ['i'], delivery: { duration: '1w', modality: 'Z', steps: 's' }, pricing: { amount: 100, currency: 'EUR', model: 'F', rationale: 'r', status: 'hypothesis' }, client_tomorrow_test: { answer: 'yes', missing: [], note: '' }, epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false }, synthesis: 'sy', submitted_at: new Date().toISOString() });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's6_test_offer', ?)`)
    .run(randomUUID(), participant2Id, p2S6);
  const p2S7 = JSON.stringify({ version: 1, status: 'submitted', offer_sentence: { who: 'T', result: 'T', proposition: 'T', formulation: 'T aide T' }, pitch: { problem: 'T', who_you_are: 'T', what_you_propose: 'T', expected_result: 'T', call_to_action: 'T', full_text: '' }, without_notes: { practiced: true, note: '' }, understanding_check: { natural_version: 'T' }, epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false }, synthesis: 'T', proof_id: null, submitted_at: new Date().toISOString() });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's7_presentation', ?)`)
    .run(randomUUID(), participant2Id, p2S7);
  const p2M7Id = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'D', 7, 'S7 p2', 1, 0, ?)`)
    .run(p2M7Id, cohortId, adminId);
  db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
    .run(randomUUID(), p2M7Id, participant2Id, cohortId, new Date().toISOString(), new Date().toISOString());

  const r1 = await request(app).post('/auth/login').send({ email: participantEmail, password: PASS });
  participantCookies = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: participant2Email, password: PASS });
  participant2Cookies = r2.headers['set-cookie'];
  const r3 = await request(app).post('/auth/login').send({ email: 's8admin@ex.com', password: ADMIN_PASS });
  adminCookies = r3.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── 1. GET /api/s8/field-test ───────────────────────────────────── */
describe('GET /api/s8/field-test', () => {
  it('1. requires auth', async () => {
    const r = await request(app).get('/api/s8/field-test');
    expect(r.status).toBe(401);
  });

  it('2. retourne 400 quand gate S8 non VERTE (pas de S7 soumis)', async () => {
    const db = getDb(TEST_DB);
    const noGateId = randomUUID();
    const noGateEmail = `s8nogate+${noGateId.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NoGate', 0)`)
      .run(noGateId, noGateEmail, hash);
    const lr = await request(app).post('/auth/login').send({ email: noGateEmail, password: PASS });
    const cookies = lr.headers['set-cookie'];
    const r = await request(app).get('/api/s8/field-test').set('Cookie', cookies);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/S7|gate/i);
  });

  it('3. retourne prefill depuis S7 quand pas de S8 encore', async () => {
    const r = await request(app).get('/api/s8/field-test').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s8).toBeNull();
    expect(r.body.s7_ref).not.toBeNull();
    expect(r.body.prefill).not.toBeNull();
    expect(r.body.prefill.presented.offer_sentence_used).toBeTruthy(); // prefilled from S7
    expect(r.body.s7_ref.submission_id).toBe(s7RowId);
  });
});

/* ── 2. PUT /api/s8/field-test — draft save ──────────────────────── */
describe('PUT /api/s8/field-test', () => {
  it('4. sauvegarde draft avec succès', async () => {
    const r = await request(app).put('/api/s8/field-test')
      .set('Cookie', participantCookies)
      .send({ test_context: { channel: 'Visio Zoom' } });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s8.status).toBe('draft');
  });

  it('5. draft persiste au rechargement', async () => {
    const r = await request(app).get('/api/s8/field-test').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s8).not.toBeNull();
    expect(r.body.s8.status).toBe('draft');
  });

  it('6. PUT ne crée pas de décision', async () => {
    const db = getDb(TEST_DB);
    const before = db.prepare('SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?').get(participantId).n;
    await request(app).put('/api/s8/field-test')
      .set('Cookie', participantCookies)
      .send({ test_context: { context_note: 'Note de test' } });
    const after = db.prepare('SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?').get(participantId).n;
    expect(after).toBe(before);
  });

  it('6b. PUT ne crée pas de Proof', async () => {
    const db = getDb(TEST_DB);
    const before = db.prepare('SELECT COUNT(*) AS n FROM proofs WHERE user_id = ?').get(participantId).n;
    await request(app).put('/api/s8/field-test')
      .set('Cookie', participantCookies)
      .send({ test_context: { context_note: 'Note 2' } });
    const after = db.prepare('SELECT COUNT(*) AS n FROM proofs WHERE user_id = ?').get(participantId).n;
    expect(after).toBe(before);
  });
});

/* ── 3. POST /api/s8/field-test/submit — completeness checks ─────── */
describe('POST /api/s8/field-test/submit — completeness', () => {
  async function freshUser() {
    const db = getDb(TEST_DB);
    const uid = randomUUID();
    const email = `s8fresh+${uid.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Fresh', 0)`)
      .run(uid, email, hash);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    // S4 direction
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
      VALUES (?, ?, 'project', 'Dir', ?, 'R', 4, 'A', 'active', '', '', '{}', ?)`)
      .run(randomUUID(), uid, JSON.stringify({ direction: { formulation: 'f', person: 'p', problem: 'pr' } }), new Date().toISOString());
    // S6 submitted
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's6_test_offer', ?)`)
      .run(randomUUID(), uid, JSON.stringify({ version: 1, status: 'submitted', audience: { formulation: 'T' }, problem: { formulation: 'T' }, desired_result: { formulation: 'T' }, proposition: { type: 'T', description: 'T' }, included: ['i'], delivery: { duration: '1w', modality: 'Z', steps: 's' }, pricing: { amount: 100, currency: 'EUR', model: 'F', rationale: 'r', status: 'hypothesis' }, client_tomorrow_test: { answer: 'yes', missing: [], note: '' }, epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false }, synthesis: 'sy', submitted_at: new Date().toISOString() }));
    // S7 submitted
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's7_presentation', ?)`)
      .run(randomUUID(), uid, JSON.stringify({ version: 1, status: 'submitted', offer_sentence: { who: 'T', result: 'T', proposition: 'T', formulation: 'T aide T' }, pitch: { problem: 'T', who_you_are: 'T', what_you_propose: 'T', expected_result: 'T', call_to_action: 'T', full_text: '' }, without_notes: { practiced: true, note: '' }, understanding_check: { natural_version: 'T' }, epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false }, synthesis: 'T', proof_id: null, submitted_at: new Date().toISOString() }));
    // Mission S7 submitted
    const m7 = randomUUID();
    db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'D', 7, 'S7fresh', 1, 0, ?)`)
      .run(m7, cohortId, adminId);
    db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
      .run(randomUUID(), m7, uid, cohortId, new Date().toISOString(), new Date().toISOString());
    const lr = await request(app).post('/auth/login').send({ email, password: PASS });
    return { uid, cookies: lr.headers['set-cookie'] };
  }

  async function seedDraft(cookies, patch) {
    return request(app).put('/api/s8/field-test').set('Cookie', cookies).send(patch);
  }

  it('7. real_interaction_confirmed=false → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.test_context.real_interaction_confirmed = false;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/réelle/i);
  });

  it('8. date vide → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.test_context.date = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/date/i);
  });

  it('9. person_type vide → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.test_context.person_type = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/personne/i);
  });

  it('10. target_match absent → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.test_context.target_match = null;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/cible/i);
  });

  it('11. offer_sentence_used vide → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.presented.offer_sentence_used = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/phrase d'offre/i);
  });

  it('12. initial_reaction vide → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.observed_reaction.initial_reaction = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/réaction/i);
  });

  it('13. outcome.type invalide → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.outcome.type = 'invalid_outcome';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/outcome/i);
  });

  it('14. what_i_learned vide → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.interpretation.what_i_learned = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/appris/i);
  });

  it('15. next_to_verify vide → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.next_to_verify = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/vérifier/i);
  });

  it('16. epistemic facts non acknowledged → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.epistemic.facts = ''; d.epistemic.facts_acknowledged = false;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/sais/i);
  });

  it('17. epistemic assumptions non acknowledged → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.epistemic.assumptions = ''; d.epistemic.assumptions_acknowledged = false;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/suppositions/i);
  });

  it('18. epistemic to_verify non acknowledged → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS8(); d.epistemic.to_verify = ''; d.epistemic.to_verify_acknowledged = false;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/vérifier/i);
  });
});

/* ── 4. POST /api/s8/field-test/submit — success ─────────────────── */
describe('POST /api/s8/field-test/submit — success', () => {
  it('19. submit complet avec outcome=declined → 200 (refus valide)', async () => {
    await request(app).put('/api/s8/field-test')
      .set('Cookie', participant2Cookies)
      .send(makeFullS8Declined());
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', participant2Cookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('20. submit complet avec outcome=purchase → 200 (achat possible)', async () => {
    // Use a fresh user for purchase test
    const db = getDb(TEST_DB);
    const uid = randomUUID();
    const email = `s8purchase+${uid.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Purchase', 0)`)
      .run(uid, email, hash);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
      VALUES (?, ?, 'project', 'Dir', ?, 'R', 4, 'A', 'active', '', '', '{}', ?)`)
      .run(randomUUID(), uid, JSON.stringify({ direction: { formulation: 'f', person: 'p', problem: 'pr' } }), new Date().toISOString());
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's6_test_offer', ?)`)
      .run(randomUUID(), uid, JSON.stringify({ version: 1, status: 'submitted', audience: { formulation: 'T' }, problem: { formulation: 'T' }, desired_result: { formulation: 'T' }, proposition: { type: 'T', description: 'T' }, included: ['i'], delivery: { duration: '1w', modality: 'Z', steps: 's' }, pricing: { amount: 100, currency: 'EUR', model: 'F', rationale: 'r', status: 'hypothesis' }, client_tomorrow_test: { answer: 'yes', missing: [], note: '' }, epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false }, synthesis: 'sy', submitted_at: new Date().toISOString() }));
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's7_presentation', ?)`)
      .run(randomUUID(), uid, JSON.stringify({ version: 1, status: 'submitted', offer_sentence: { who: 'T', result: 'T', proposition: 'T', formulation: 'T aide T' }, pitch: { problem: 'T', who_you_are: 'T', what_you_propose: 'T', expected_result: 'T', call_to_action: 'T', full_text: '' }, without_notes: { practiced: true, note: '' }, understanding_check: { natural_version: 'T' }, epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false }, synthesis: 'T', proof_id: null, submitted_at: new Date().toISOString() }));
    const m7 = randomUUID();
    db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'D', 7, 'S7purchase', 1, 0, ?)`)
      .run(m7, cohortId, adminId);
    db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
      .run(randomUUID(), m7, uid, cohortId, new Date().toISOString(), new Date().toISOString());
    const lr = await request(app).post('/auth/login').send({ email, password: PASS });
    const cookies = lr.headers['set-cookie'];
    await request(app).put('/api/s8/field-test').set('Cookie', cookies).send(makeFullS8Purchase());
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', cookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('21. submit complet principal → 200', async () => {
    await request(app).put('/api/s8/field-test')
      .set('Cookie', participantCookies)
      .send(makeFullS8());
    const r = await request(app).post('/api/s8/field-test/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('22. mission sprint_number=8 créée', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`
      SELECT ms.* FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 8
    `).get(participantId);
    expect(sub).toBeTruthy();
    expect(sub.status).toBe('submitted');
  });

  it('23. participant_data status=submitted', async () => {
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's8_field_test' LIMIT 1`).get(participantId);
    expect(row).toBeTruthy();
    const content = JSON.parse(row.content);
    expect(content.status).toBe('submitted');
  });

  it('24. aucune décision créée par S8', async () => {
    const db = getDb(TEST_DB);
    const decisions = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND sprint_number > 4`).all(participantId);
    expect(decisions.length).toBe(0);
  });

  it('25. aucune revenue decision créée par S8', async () => {
    const db = getDb(TEST_DB);
    const decisions = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND decision_type = 'revenue'`).all(participantId);
    expect(decisions.length).toBe(0);
  });

  it('26. aucune Proof créée par S8', async () => {
    const db = getDb(TEST_DB);
    // Participant should have 0 proofs (S8 creates none)
    const proofs = db.prepare(`SELECT * FROM proofs WHERE user_id = ?`).all(participantId);
    expect(proofs.length).toBe(0);
  });

  it('27. S7 inchangée après submit S8', async () => {
    const db = getDb(TEST_DB);
    const s7 = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's7_presentation' LIMIT 1`).get(participantId);
    const content = JSON.parse(s7.content);
    expect(content.status).toBe('submitted');
    // No S8 fields on S7
    expect(content.outcome).toBeUndefined();
    expect(content.test_context).toBeUndefined();
  });

  it('28. S6 inchangée après submit S8', async () => {
    const db = getDb(TEST_DB);
    const s6 = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's6_test_offer' LIMIT 1`).get(participantId);
    const content = JSON.parse(s6.content);
    expect(content.status).toBe('submitted');
    expect(content.test_context).toBeUndefined();
  });

  it('29. S4 direction inchangée', async () => {
    const db = getDb(TEST_DB);
    const dec = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(s4DecisionId);
    expect(dec.status).toBe('active');
    expect(dec.decision_type).toBe('project');
  });

  it('30. snapshot complet dans mission_submission', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`
      SELECT ms.* FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 8
    `).get(participantId);
    expect(sub).toBeTruthy();
    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s8_field_test_snapshot');
    expect(content.test_context).toBeTruthy();
    expect(content.outcome).toBeTruthy();
  });

  it('31. idempotence re-submit (pas de doublon mission_submission)', async () => {
    // Submit again for participant2 and check no duplicate
    await request(app).post('/api/s8/field-test/submit').set('Cookie', participant2Cookies);
    const db = getDb(TEST_DB);
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 8
    `).get(participant2Id).n;
    expect(count).toBe(1);
  });

  it('32. audit event \'s8_field_test_submitted\' écrit', async () => {
    const db = getDb(TEST_DB);
    const audit = db.prepare(`SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 's8_field_test_submitted' ORDER BY rowid DESC LIMIT 1`).get(participantId);
    expect(audit).toBeTruthy();
  });

  it('33. admin readable', async () => {
    const r = await request(app).get('/api/admin/participants').set('Cookie', adminCookies);
    expect([200, 404]).toContain(r.status);
  });

  it('34. PUT bloqué après submit (409)', async () => {
    const r = await request(app).put('/api/s8/field-test')
      .set('Cookie', participantCookies)
      .send({ test_context: { channel: 'Nouveau canal' } });
    expect(r.status).toBe(409);
  });
});

/* ── 5. GET /api/cockpit — s8FieldTest ───────────────────────────── */
describe('GET /api/cockpit — s8FieldTest', () => {
  it('35. retourne s8FieldTest quand sprint 8', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('s8FieldTest');
    expect(r.body.s8FieldTest).not.toBeNull();
    expect(r.body.s8FieldTest.status).toBe('submitted');
  });
});

/* ── 6. Gate S9 matrix ───────────────────────────────────────────── */
describe('Gate S9 matrix', () => {
  function makeGateDb(opts = {}) {
    const db = getDb(TEST_DB);
    const uid = randomUUID();
    const hash = require('crypto').createHash('sha256').update('x').digest('hex');
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'G9', 0)`)
      .run(uid, `g9+${uid.slice(0,6)}@ex.com`, hash);

    if (opts.missionS8) {
      const mId = randomUUID();
      db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'R', 8, 'S8gate', 1, 0, ?)`)
        .run(mId, cohortId, adminId);
      db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
        .run(randomUUID(), mId, uid, cohortId, new Date().toISOString(), new Date().toISOString());
    }

    if (opts.s8DataStatus) {
      const s8Content = JSON.stringify({ version: 1, status: opts.s8DataStatus, outcome: { type: opts.outcomeType ?? 'interested_no_commitment' } });
      db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's8_field_test', ?)`)
        .run(randomUUID(), uid, s8Content);
    }

    if (opts.revenueDecision) {
      db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at) VALUES (?, ?, 'revenue', 'Rev', '{}', 'r', 8, 'R', 'active', '', '', '{}', ?)`)
        .run(randomUUID(), uid, new Date().toISOString());
    }

    return { db, uid };
  }

  it('36A. data S8 seule → ROUGE (mission manquante)', () => {
    const { db, uid } = makeGateDb({ s8DataStatus: 'submitted' });
    const result = evaluateGate(db, uid, 9);
    expect(result.status).toBe('ROUGE');
  });

  it('36B. mission S8 seule → ROUGE (data manquante)', () => {
    const { db, uid } = makeGateDb({ missionS8: true });
    const result = evaluateGate(db, uid, 9);
    expect(result.status).toBe('ROUGE');
  });

  it('36C. mission + data draft → ROUGE', () => {
    const { db, uid } = makeGateDb({ missionS8: true, s8DataStatus: 'draft' });
    const result = evaluateGate(db, uid, 9);
    expect(result.status).toBe('ROUGE');
  });

  it('36D. mission + data submitted → VERT', () => {
    const { db, uid } = makeGateDb({ missionS8: true, s8DataStatus: 'submitted' });
    const result = evaluateGate(db, uid, 9);
    expect(result.status).toBe('VERT');
  });

  it('36E. outcome=declined + mission/data valides → VERT (refus valide)', () => {
    const { db, uid } = makeGateDb({ missionS8: true, s8DataStatus: 'submitted', outcomeType: 'declined' });
    const result = evaluateGate(db, uid, 9);
    expect(result.status).toBe('VERT');
  });

  it('36F. outcome=purchase + mission/data valides → VERT (achat valide)', () => {
    const { db, uid } = makeGateDb({ missionS8: true, s8DataStatus: 'submitted', outcomeType: 'purchase' });
    const result = evaluateGate(db, uid, 9);
    expect(result.status).toBe('VERT');
  });

  it('36G. aucune revenue decision + mission/data valides → VERT', () => {
    const { db, uid } = makeGateDb({ missionS8: true, s8DataStatus: 'submitted', revenueDecision: false });
    const result = evaluateGate(db, uid, 9);
    expect(result.status).toBe('VERT');
  });

  it('36H. aucun état → ROUGE (2 conditions)', () => {
    const { db, uid } = makeGateDb({});
    const result = evaluateGate(db, uid, 9);
    expect(result.status).toBe('ROUGE');
    expect(result.conditions.length).toBe(2);
  });

  it('37. gate S9 async — mission + data submitted → VERT', async () => {
    const { uid } = makeGateDb({ missionS8: true, s8DataStatus: 'submitted' });
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, uid, 9);
    expect(result.status).toBe('VERT');
  });

  it('38. gate S9 async — condition count = 2', async () => {
    const { uid } = makeGateDb({});
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, uid, 9);
    expect(result.conditions.length).toBe(2);
  });

  it('39. gate S9 async — outcome=declined → VERT', async () => {
    const { uid } = makeGateDb({ missionS8: true, s8DataStatus: 'submitted', outcomeType: 'declined' });
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, uid, 9);
    expect(result.status).toBe('VERT');
  });

  it('40. gate S9 async — data draft → ROUGE', async () => {
    const { uid } = makeGateDb({ missionS8: true, s8DataStatus: 'draft' });
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, uid, 9);
    expect(result.status).toBe('ROUGE');
  });
});

/* ── 7. Copilote S8 ─────────────────────────────────────────────── */
describe('Copilote S8 content', () => {
  it('41. SIMULATION ≠ TERRAIN présent dans source COPILOTE', () => {
    expect(copiloteRouteSrc).toContain('SIMULATION ≠ TERRAIN');
  });

  it('42. phrase clé S8 présente', () => {
    expect(copiloteRouteSrc).toContain('Un test terrain ne te donne pas une vérité');
  });

  it('43. outcome declined = donnée valide présent', () => {
    expect(copiloteRouteSrc).toContain('OUTCOME DÉCLINÉ');
    expect(copiloteRouteSrc).toContain('refus n\'est pas un échec');
  });

  it('44. achat ≠ validation marché présent', () => {
    expect(copiloteRouteSrc).toContain('ACHAT ISOLÉ');
    expect(copiloteRouteSrc).toContain('achat unique ne valide pas ton marché');
  });
});
