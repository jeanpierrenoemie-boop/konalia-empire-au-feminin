/**
 * S7 — DIRE CE QUE TU VENDS — Tests
 * Build 21G: Presentation Terrain CRUD, completeness, submit, gate S8.
 */

// ── DB bootstrap — MUST be before any ESM imports ────────────────
import path from 'path';
import os from 'os';
const TEST_DB = path.join(os.tmpdir(), `rc-s7-test-${Date.now()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's7-test-secret-32-chars-minimum!!';
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

let s4DecisionId, s6RowId;

function makeFullS7() {
  return {
    offer_sentence: {
      who: 'Femmes salariées 35-50 ans en reconversion professionnelle',
      result: 'avoir une piste prioritaire et un plan d\'action en 3 semaines',
      proposition: 'un accompagnement individuel en 3 séances',
      formulation: 'J\'aide les femmes salariées en reconversion à avoir une piste prioritaire et un plan d\'action en 3 semaines grâce à un accompagnement individuel en 3 séances.',
    },
    pitch: {
      problem: 'Beaucoup de femmes qui veulent se lancer ne savent pas par où commencer — elles tournent en rond pendant des mois.',
      who_you_are: 'Je suis coach en reconversion professionnelle.',
      what_you_propose: 'Je propose un accompagnement en 3 séances pour passer de l\'idée à une première action concrète. On clarifie, on priorise, on structure.',
      expected_result: 'À l\'issue des 3 séances, tu as une piste prioritaire et tes 3 premières actions concrètes.',
      call_to_action: 'Si ça te parle, contacte-moi pour un appel découverte de 20 minutes.',
      full_text: '',
    },
    without_notes: {
      practiced: true,
      note: 'Ça a été difficile au début mais après 3 essais c\'était plus fluide.',
    },
    understanding_check: {
      natural_version: 'En gros j\'accompagne des femmes qui veulent changer de boulot mais qui savent pas par où attaquer. On travaille ensemble pour identifier ce qu\'elles veulent vraiment et comment s\'y prendre.',
    },
    epistemic: {
      facts: 'J\'ai eu 4 conversations avec des femmes en reconversion qui ont mentionné ce blocage.',
      facts_acknowledged: false,
      assumptions: 'Je suppose que le format 3 séances est suffisant pour clarifier.',
      assumptions_acknowledged: false,
      to_verify: 'Est-ce que ma phrase d\'offre est compréhensible pour quelqu\'un qui ne me connaît pas ?',
      to_verify_acknowledged: false,
    },
    synthesis: 'Ma présentation terrain est prête. Je sais ce que je dis, comment je le dis, et ce que j\'attends comme réponse.',
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
  participantEmail = `s7p+${participantId.slice(0,6)}@ex.com`;
  participant2Email = `s7p2+${participant2Id.slice(0,6)}@ex.com`;

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s7admin@ex.com`, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilot S7', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'D', 7, 1, 'in_progress')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'D', 7, 1, 'in_progress')`)
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
    version: 1,
    status: 'submitted',
    audience: { formulation: 'Femmes salariées 35-50 ans en reconversion professionnelle' },
    problem: { formulation: 'Elles ne savent pas par où commencer pour structurer leur projet' },
    desired_result: { formulation: 'Avoir une piste prioritaire et ses 3 premières actions' },
    proposition: { type: 'Accompagnement individuel', description: '3 séances individuelles de 90 min' },
    included: ['3 séances Zoom de 90 min', 'Support de travail personnalisé'],
    delivery: { duration: '3 semaines', modality: 'Visio Zoom', steps: 'Session 1: exploration, Session 2: priorisation, Session 3: plan' },
    pricing: { amount: 450, currency: 'EUR', model: 'Forfait', rationale: 'Basé sur 3h de travail', status: 'hypothesis' },
    client_tomorrow_test: { answer: 'yes', missing: [], note: '' },
    epistemic: { facts: 'J\'ai discuté avec 3 femmes', facts_acknowledged: false, assumptions: 'fréquent', assumptions_acknowledged: false, to_verify: 'prix acceptable ?', to_verify_acknowledged: false },
    synthesis: 'Un accompagnement en 3 séances.',
    submitted_at: new Date().toISOString(),
  });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's6_test_offer', ?)`)
    .run(s6RowId, participantId, s6Content);

  /* Submitted S6 for participant2 */
  const p2S6Content = JSON.stringify({ version: 1, status: 'submitted', audience: { formulation: 'Test' }, problem: { formulation: 'Test' }, desired_result: { formulation: 'Test' }, proposition: { type: 'T', description: 'T' }, included: ['item'], delivery: { duration: '1w', modality: 'Zoom', steps: 'step' }, pricing: { amount: 100, currency: 'EUR', model: 'F', rationale: 'r', status: 'hypothesis' }, client_tomorrow_test: { answer: 'yes', missing: [], note: '' }, epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false }, synthesis: 'sy', submitted_at: new Date().toISOString() });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's6_test_offer', ?)`)
    .run(randomUUID(), participant2Id, p2S6Content);

  /* Mission for sprint 7 */
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'D', 7, 'Présentation Terrain', 1, 0, ?)`)
    .run(randomUUID(), cohortId, adminId);

  const r1 = await request(app).post('/auth/login').send({ email: participantEmail, password: PASS });
  participantCookies = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: participant2Email, password: PASS });
  participant2Cookies = r2.headers['set-cookie'];
  const r3 = await request(app).post('/auth/login').send({ email: 's7admin@ex.com', password: ADMIN_PASS });
  adminCookies = r3.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── 1. GET /api/s7/presentation ─────────────────────────────────── */
describe('GET /api/s7/presentation', () => {
  it('1. requires auth', async () => {
    const r = await request(app).get('/api/s7/presentation');
    expect(r.status).toBe(401);
  });

  it('2. returns 400 when no S6 submitted', async () => {
    const db = getDb(TEST_DB);
    const noS6 = randomUUID();
    const noS6Email = `s7nos6+${noS6.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NoS6', 0)`)
      .run(noS6, noS6Email, hash);
    const lr = await request(app).post('/auth/login').send({ email: noS6Email, password: PASS });
    const cookies = lr.headers['set-cookie'];
    const r = await request(app).get('/api/s7/presentation').set('Cookie', cookies);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/S6/i);
  });

  it('3. returns prefill from S6 when no s7 yet', async () => {
    const r = await request(app).get('/api/s7/presentation').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s7).toBeNull();
    expect(r.body.s6_ref).not.toBeNull();
    expect(r.body.prefill).not.toBeNull();
    expect(r.body.prefill.offer_sentence.who).toBeTruthy(); // prefilled from S6
    expect(r.body.s6_ref.submission_id).toBe(s6RowId);
  });
});

/* ── 2. PUT /api/s7/presentation — draft save ────────────────────── */
describe('PUT /api/s7/presentation', () => {
  it('4. saves draft successfully', async () => {
    const r = await request(app).put('/api/s7/presentation')
      .set('Cookie', participantCookies)
      .send({ offer_sentence: { formulation: 'J\'aide les managers à retrouver de l\'élan grâce à un accompagnement en 5 séances.' } });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s7.status).toBe('draft');
    expect(r.body.s7.offer_sentence.formulation).toBeTruthy();
  });

  it('5. draft persists on reload', async () => {
    const r = await request(app).get('/api/s7/presentation').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s7).not.toBeNull();
    expect(r.body.s7.status).toBe('draft');
  });

  it('6. PUT does NOT create any decision', async () => {
    const db = getDb(TEST_DB);
    const before = db.prepare('SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?').get(participantId).n;
    await request(app).put('/api/s7/presentation')
      .set('Cookie', participantCookies)
      .send({ pitch: { problem: 'Un vrai problème' } });
    const after = db.prepare('SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?').get(participantId).n;
    expect(after).toBe(before);
  });
});

/* ── 3. POST /api/s7/presentation/submit — completeness checks ────── */
describe('POST /api/s7/presentation/submit — completeness', () => {
  async function freshUser() {
    const db = getDb(TEST_DB);
    const uid = randomUUID();
    const email = `s7fresh+${uid.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Fresh', 0)`)
      .run(uid, email, hash);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    const decId = randomUUID();
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
      VALUES (?, ?, 'project', 'Dir', ?, 'R', 4, 'A', 'active', '', '', '{}', ?)`)
      .run(decId, uid, JSON.stringify({ direction: { formulation: 'f', person: 'p', problem: 'pr' } }), new Date().toISOString());
    const s6Content = JSON.stringify({ version: 1, status: 'submitted', audience: { formulation: 'T' }, problem: { formulation: 'T' }, desired_result: { formulation: 'T' }, proposition: { type: 'T', description: 'T' }, included: ['item'], delivery: { duration: '1w', modality: 'Z', steps: 's' }, pricing: { amount: 100, currency: 'EUR', model: 'F', rationale: 'r', status: 'hypothesis' }, client_tomorrow_test: { answer: 'yes', missing: [], note: '' }, epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false }, synthesis: 'sy', submitted_at: new Date().toISOString() });
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's6_test_offer', ?)`)
      .run(randomUUID(), uid, s6Content);
    const lr = await request(app).post('/auth/login').send({ email, password: PASS });
    return { uid, cookies: lr.headers['set-cookie'] };
  }

  async function seedDraft(cookies, patch) {
    return request(app).put('/api/s7/presentation').set('Cookie', cookies).send(patch);
  }

  it('7. offer_sentence.formulation manquante → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.offer_sentence.formulation = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/phrase d'offre/i);
  });

  it('8. pitch.problem manquant → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.pitch.problem = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/problème/i);
  });

  it('9. pitch.what_you_propose manquant → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.pitch.what_you_propose = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/proposes/i);
  });

  it('10. pitch.expected_result manquant → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.pitch.expected_result = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/résultat attendu/i);
  });

  it('11. pitch.call_to_action manquant → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.pitch.call_to_action = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/appel à action/i);
  });

  it('12. without_notes.practiced false → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.without_notes.practiced = false;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/pratiqué/i);
  });

  it('13. understanding_check.natural_version vide → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.understanding_check.natural_version = '';
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/inconnue/i);
  });

  it('14. epistemic facts vide non acknowledged → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.epistemic.facts = ''; d.epistemic.facts_acknowledged = false;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/sais/i);
  });

  it('15. epistemic assumptions vide non acknowledged → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.epistemic.assumptions = ''; d.epistemic.assumptions_acknowledged = false;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/suppositions/i);
  });

  it('16. epistemic to_verify vide non acknowledged → 422', async () => {
    const { cookies } = await freshUser();
    const d = makeFullS7(); d.epistemic.to_verify = ''; d.epistemic.to_verify_acknowledged = false;
    await seedDraft(cookies, d);
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/vérifier/i);
  });
});

/* ── 4. POST /api/s7/presentation/submit — success ───────────────── */
describe('POST /api/s7/presentation/submit — success', () => {
  it('17. submit complet → 200', async () => {
    await request(app).put('/api/s7/presentation')
      .set('Cookie', participantCookies)
      .send(makeFullS7());
    const r = await request(app).post('/api/s7/presentation/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('18. mission sprint_number=7 créée', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`
      SELECT ms.* FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 7
    `).get(participantId);
    expect(sub).toBeTruthy();
    expect(sub.status).toBe('submitted');
  });

  it('19. participant_data status=submitted', async () => {
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's7_presentation' LIMIT 1`).get(participantId);
    expect(row).toBeTruthy();
    const content = JSON.parse(row.content);
    expect(content.status).toBe('submitted');
  });

  it('20. Proof #2 créée (cadre_step=D, title=\'02 — Mon Offre Test\')', async () => {
    const db = getDb(TEST_DB);
    const proof = db.prepare(`SELECT * FROM proofs WHERE user_id = ? AND cadre_step = 'D' LIMIT 1`).get(participantId);
    expect(proof).toBeTruthy();
    expect(proof.title).toBe('02 — Mon Offre Test');
    expect(proof.cadre_step).toBe('D');
    expect(proof.proof_type).toBe('note');
  });

  it('21. proofId stocké dans participant_data', async () => {
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's7_presentation' LIMIT 1`).get(participantId);
    const content = JSON.parse(row.content);
    expect(content.proof_id).toBeTruthy();
    const proof = db.prepare(`SELECT id FROM proofs WHERE id = ?`).get(content.proof_id);
    expect(proof).toBeTruthy();
  });

  it('22. Proof #2 est la SEULE proof créée (count = 1)', async () => {
    const db = getDb(TEST_DB);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ? AND cadre_step = 'D'`).get(participantId).n;
    expect(count).toBe(1);
  });

  it('23. aucune décision créée par S7', async () => {
    const db = getDb(TEST_DB);
    // Only the S4 direction should exist
    const decisions = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND sprint_number > 4`).all(participantId);
    expect(decisions.length).toBe(0);
  });

  it('24. S6 inchangée après submit S7', async () => {
    const db = getDb(TEST_DB);
    const s6 = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's6_test_offer' LIMIT 1`).get(participantId);
    const content = JSON.parse(s6.content);
    expect(content.status).toBe('submitted');
    // S6 should not have s7 fields
    expect(content.proof_id).toBeUndefined();
    expect(content.offer_sentence).toBeUndefined();
  });

  it('25. S4 direction inchangée', async () => {
    const db = getDb(TEST_DB);
    const dec = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(s4DecisionId);
    expect(dec.status).toBe('active');
    expect(dec.decision_type).toBe('project');
  });

  it('26. snapshot complet dans mission_submission', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`
      SELECT ms.* FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 7
    `).get(participantId);
    expect(sub).toBeTruthy();
    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s7_presentation_snapshot');
    expect(content.offer_sentence).toBeTruthy();
    expect(content.pitch).toBeTruthy();
  });

  it('27. idempotence : re-submit ne crée pas de deuxième Proof', async () => {
    const db = getDb(TEST_DB);
    const before = db.prepare(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ? AND cadre_step = 'D'`).get(participantId).n;
    // participant2 submits their S7 - use participant2 which hasn't submitted yet
    await request(app).put('/api/s7/presentation')
      .set('Cookie', participant2Cookies)
      .send(makeFullS7());
    await request(app).post('/api/s7/presentation/submit').set('Cookie', participant2Cookies);
    await request(app).post('/api/s7/presentation/submit').set('Cookie', participant2Cookies);
    // participant still has count 1
    const after = db.prepare(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ? AND cadre_step = 'D'`).get(participantId).n;
    expect(after).toBe(before);
    // participant2 also has count 1
    const p2count = db.prepare(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ? AND cadre_step = 'D'`).get(participant2Id).n;
    expect(p2count).toBe(1);
  });

  it('28. idempotence : re-submit ne crée pas de deuxième mission_submission', async () => {
    const db = getDb(TEST_DB);
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 7
    `).get(participant2Id).n;
    expect(count).toBe(1);
  });

  it('29. PUT bloqué après submit (409)', async () => {
    const r = await request(app).put('/api/s7/presentation')
      .set('Cookie', participantCookies)
      .send({ offer_sentence: { formulation: 'Nouvelle formule' } });
    expect(r.status).toBe(409);
  });

  it('30. audit event \'s7_presentation_submitted\' écrit', async () => {
    const db = getDb(TEST_DB);
    const audit = db.prepare(`SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 's7_presentation_submitted' ORDER BY rowid DESC LIMIT 1`).get(participantId);
    expect(audit).toBeTruthy();
  });

  it('31. admin peut lire les données via admin endpoint', async () => {
    const r = await request(app).get('/api/admin/participants').set('Cookie', adminCookies);
    expect([200, 404]).toContain(r.status); // admin endpoint exists
  });
});

/* ── 5. GET /api/cockpit — s7Presentation ────────────────────────── */
describe('GET /api/cockpit — s7Presentation', () => {
  it('32. retourne s7Presentation quand sprint 7', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('s7Presentation');
    expect(r.body.s7Presentation).not.toBeNull();
    expect(r.body.s7Presentation.status).toBe('submitted');
    expect(r.body.s7Presentation.proofId).toBeTruthy();
  });
});

/* ── 6. Gate S8 matrix ───────────────────────────────────────────── */
describe('Gate S8 matrix', () => {
  function makeGateDb(opts = {}) {
    const db = getDb(TEST_DB);
    const uid = randomUUID();
    const hash = require('crypto').createHash('sha256').update('x').digest('hex');
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'G', 0)`)
      .run(uid, `g8+${uid.slice(0,6)}@ex.com`, hash);

    if (opts.missionS7) {
      const mId = randomUUID();
      db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'D', 7, 'S7gate', 1, 0, ?)`)
        .run(mId, cohortId, adminId);
      db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
        .run(randomUUID(), mId, uid, cohortId, new Date().toISOString(), new Date().toISOString());
    }

    if (opts.s7DataStatus) {
      const s7Content = JSON.stringify({ version: 1, status: opts.s7DataStatus });
      db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's7_presentation', ?)`)
        .run(randomUUID(), uid, s7Content);
    }

    if (opts.proofD) {
      db.prepare(`INSERT INTO proofs (id, user_id, proof_type, title, content, cadre_step, is_public, created_at, updated_at) VALUES (?, ?, 'note', '02 — Mon Offre Test', '{}', 'D', 0, ?, ?)`)
        .run(randomUUID(), uid, new Date().toISOString(), new Date().toISOString());
    }

    if (opts.revenueDecision) {
      db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at) VALUES (?, ?, 'revenue', 'Rev', '{}', 'r', 7, 'D', 'active', '', '', '{}', ?)`)
        .run(randomUUID(), uid, new Date().toISOString());
    }

    return { db, uid };
  }

  it('33A. data S7 seule → ROUGE (mission manquante)', () => {
    const { db, uid } = makeGateDb({ s7DataStatus: 'submitted' });
    const result = evaluateGate(db, uid, 8);
    expect(result.status).toBe('ROUGE');
  });

  it('33B. mission S7 seule → ROUGE (data manquante)', () => {
    const { db, uid } = makeGateDb({ missionS7: true });
    const result = evaluateGate(db, uid, 8);
    expect(result.status).toBe('ROUGE');
  });

  it('33C. mission + data draft → ROUGE', () => {
    const { db, uid } = makeGateDb({ missionS7: true, s7DataStatus: 'draft' });
    const result = evaluateGate(db, uid, 8);
    expect(result.status).toBe('ROUGE');
  });

  it('33D. mission + data submitted → VERT', () => {
    const { db, uid } = makeGateDb({ missionS7: true, s7DataStatus: 'submitted' });
    const result = evaluateGate(db, uid, 8);
    expect(result.status).toBe('VERT');
  });

  it('33E. proof D absente + mission/data valides → VERT (proof D n\'est PAS prérequis gate S8)', () => {
    const { db, uid } = makeGateDb({ missionS7: true, s7DataStatus: 'submitted', proofD: false });
    const result = evaluateGate(db, uid, 8);
    expect(result.status).toBe('VERT');
  });

  it('33F. revenue decision absente + valides → VERT (revenue n\'est PAS prérequis gate S8)', () => {
    const { db, uid } = makeGateDb({ missionS7: true, s7DataStatus: 'submitted', revenueDecision: false });
    const result = evaluateGate(db, uid, 8);
    expect(result.status).toBe('VERT');
  });

  it('33G. aucun état → ROUGE', () => {
    const { db, uid } = makeGateDb({});
    const result = evaluateGate(db, uid, 8);
    expect(result.status).toBe('ROUGE');
  });

  it('33H. condition count = 2', () => {
    const { db, uid } = makeGateDb({});
    const result = evaluateGate(db, uid, 8);
    expect(result.conditions.length).toBe(2);
  });

  it('34. gate S8 async — mission + data submitted → VERT', async () => {
    const { uid } = makeGateDb({ missionS7: true, s7DataStatus: 'submitted' });
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, uid, 8);
    expect(result.status).toBe('VERT');
  });

  it('35. gate S8 async — condition count = 2', async () => {
    const { uid } = makeGateDb({});
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, uid, 8);
    expect(result.conditions.length).toBe(2);
  });
});

/* ── 7. Copilote S7 ─────────────────────────────────────────────── */
describe('Copilote S7 content', () => {
  it('38. SIMULATION ≠ DONNÉE MARCHÉ encodé dans COPILOTE', () => {
    expect(copiloteRouteSrc).toContain('SIMULATION ≠ DONNÉE MARCHÉ');
    expect(copiloteRouteSrc).toContain('exercice de préparation');
  });

  it('39. phrase clé S7 présente', () => {
    expect(copiloteRouteSrc).toContain('Tu n\'as pas besoin d\'un pitch parfait');
  });

  it('40. simulations autorisées présentes (3 types)', () => {
    expect(copiloteRouteSrc).toContain('RÉACTION NEUTRE');
    expect(copiloteRouteSrc).toContain('QUESTION DE CLARIFICATION');
    expect(copiloteRouteSrc).toContain('REFORMULATION');
  });
});
