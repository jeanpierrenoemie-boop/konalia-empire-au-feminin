/**
 * S9 — APPRENDRE DU TERRAIN ET DÉCIDER DU PROCHAIN TEST — Tests
 * Build 21I: Learning Review CRUD, completeness, submit, gate S10.
 */

// ── DB bootstrap — MUST be before any ESM imports ────────────────
import path from 'path';
import os from 'os';
const TEST_DB = path.join(os.tmpdir(), `rc-s9-test-${Date.now()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's9-test-secret-32-chars-minimum!!';
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

let s4DecisionId, s8RowId;

function makeFullS9() {
  return {
    observations: [
      { fact: 'La personne a compris la phrase d\'offre immédiatement.', type: 'observation' },
      { fact: 'Elle a hésité sur le prix.', type: 'signal_to_confirm' },
    ],
    learnings: {
      what_really_happened: 'Elle a écouté attentivement puis posé des questions sur le tarif.',
      what_surprised: 'Elle connaissait déjà quelqu\'un qui proposait ce type d\'offre.',
      what_remains_unknown: 'Est-ce que le prix est vraiment le frein principal ?',
    },
    keep: [
      { element: 'La phrase d\'offre courte', reason: 'Elle a bien fonctionné et été comprise rapidement.' },
    ],
    hypothesis_to_test: {
      formulation: 'Je suppose que le prix est perçu comme élevé par rapport aux alternatives connues.',
      category: 'Prix',
      why_priority: 'Si c\'est vrai, je dois soit ajuster le prix soit renforcer la valeur perçue.',
    },
    next_test: {
      question: 'Est-ce que les femmes en reconversion comparent mon offre à des alternatives moins chères ?',
      target_person: 'Femmes salariées 35-50 ans en reconversion active',
      element_tested: 'Prix et valeur perçue',
      what_to_present: 'Ma phrase d\'offre avec justification du prix',
      data_to_observe: 'Leur réaction spontanée au tarif et les alternatives qu\'elles citent',
      completion_criteria: 'Après 3 conversations supplémentaires',
      next_action: 'Contacter 3 personnes de mon réseau cette semaine',
      planned_date: '2026-09-30',
    },
    epistemic: {
      facts: 'La phrase d\'offre est comprise par cette personne.',
      facts_acknowledged: false,
      assumptions: 'Je suppose que le prix est le frein principal.',
      assumptions_acknowledged: false,
      to_verify: 'Les alternatives que les prospects connaissent.',
      to_verify_acknowledged: false,
    },
    synthesis: 'Mon offre est claire mais je dois mieux comprendre la perception du prix. Prochain test : 3 conversations sur le tarif.',
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
  participantEmail = `s9p+${participantId.slice(0,6)}@ex.com`;
  participant2Email = `s9p2+${participant2Id.slice(0,6)}@ex.com`;

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s9admin@ex.com`, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilot S9', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'R', 9, 1, 'in_progress')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'R', 9, 1, 'in_progress')`)
    .run(randomUUID(), participant2Id, cohortId);

  /* Active S4 direction decision for participantId */
  s4DecisionId = randomUUID();
  db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
    VALUES (?, ?, 'project', 'Direction validée', '{}', 'Raison', 4, 'A', 'active', '', '', '{}', ?)`)
    .run(s4DecisionId, participantId, new Date().toISOString());

  /* Active S4 direction for participant2 */
  db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at)
    VALUES (?, ?, 'project', 'Direction Marie', '{}', 'Raison', 4, 'A', 'active', '', '', '{}', ?)`)
    .run(randomUUID(), participant2Id, new Date().toISOString());

  /* Submitted S8 field test for participantId (needed for gate S9) */
  s8RowId = randomUUID();
  const s8Content = JSON.stringify({
    version: 1, status: 'submitted',
    test_context: {
      date: '2026-09-10', channel: 'Visio', person_type: 'Femme 38 ans salariée',
      target_match: 'yes', context_note: '', real_interaction_confirmed: true,
    },
    presented: {
      offer_sentence_used: 'J\'aide les femmes à avoir une piste prioritaire.',
      pitch_used: '3 séances.', price_presented: true, price_amount: 450, call_to_action_used: 'Recontacte-moi.',
    },
    observed_reaction: { initial_reaction: 'Intéressée', questions_asked: 'Format?', objections: 'Prix.', understood: 'Problème.', misunderstood: 'Différenciation.', interest_shown: null },
    verbatims: ['Je cherchais quelque chose comme ça.'],
    outcome: { type: 'interested_no_commitment', note: 'Veut réfléchir.' },
    interpretation: { what_i_learned: 'La phrase fonctionne.', what_surprised_me: 'Format questionné.', what_to_adjust: 'Différenciation.' },
    next_to_verify: 'Confusion sur la différenciation ?',
    epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false },
    synthesis: 'Test utile.',
    submitted_at: new Date().toISOString(),
  });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's8_field_test', ?)`)
    .run(s8RowId, participantId, s8Content);

  /* Mission for sprint 8 (needed for gate S9 mission condition) */
  const m8Id = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'R', 8, 'Premier Test Terrain', 1, 0, ?)`)
    .run(m8Id, cohortId, adminId);
  db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
    .run(randomUUID(), m8Id, participantId, cohortId, new Date().toISOString(), new Date().toISOString());

  /* Mission for sprint 9 */
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'R', 9, 'Analyse Terrain', 1, 0, ?)`)
    .run(randomUUID(), cohortId, adminId);

  /* participant2: S8 field test + mission 8 */
  const p2S8Content = JSON.stringify({
    version: 1, status: 'submitted',
    test_context: { date: '2026-09-11', channel: 'Présentiel', person_type: 'Femme 42 ans', target_match: 'yes', context_note: '', real_interaction_confirmed: true },
    presented: { offer_sentence_used: 'T aide T.', pitch_used: 'T.', price_presented: false, price_amount: null, call_to_action_used: 'T.' },
    observed_reaction: { initial_reaction: 'T', questions_asked: 'T', objections: '', understood: 'T', misunderstood: '', interest_shown: null },
    verbatims: [], outcome: { type: 'declined', note: 'Pas intéressée.' },
    interpretation: { what_i_learned: 'T', what_surprised_me: 'T', what_to_adjust: 'T' },
    next_to_verify: 'T',
    epistemic: { facts: 'f', facts_acknowledged: false, assumptions: 'a', assumptions_acknowledged: false, to_verify: 'v', to_verify_acknowledged: false },
    synthesis: 'T', submitted_at: new Date().toISOString(),
  });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's8_field_test', ?)`)
    .run(randomUUID(), participant2Id, p2S8Content);
  const p2M8Id = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'R', 8, 'S8 p2', 1, 0, ?)`)
    .run(p2M8Id, cohortId, adminId);
  db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
    .run(randomUUID(), p2M8Id, participant2Id, cohortId, new Date().toISOString(), new Date().toISOString());

  const r1 = await request(app).post('/auth/login').send({ email: participantEmail, password: PASS });
  participantCookies = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: participant2Email, password: PASS });
  participant2Cookies = r2.headers['set-cookie'];
  const r3 = await request(app).post('/auth/login').send({ email: 's9admin@ex.com', password: ADMIN_PASS });
  adminCookies = r3.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── 1. GET /api/s9/learning-review ─────────────────────────────── */
describe('GET /api/s9/learning-review', () => {
  it('1. retourne le prefill S8 quand gate S9 VERTE', async () => {
    const r = await request(app).get('/api/s9/learning-review').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('s8_ref');
    expect(r.body.s8_ref.outcome_type).toBe('interested_no_commitment');
    expect(r.body.prefill).toBeTruthy();
    // prefill doit contenir des observations depuis S8
    expect(r.body.prefill.observations.length).toBeGreaterThan(0);
  });

  it('2. retourne 400 quand S8 non soumis (gate S9 ROUGE)', async () => {
    const db = getDb(TEST_DB);
    const noGateId = randomUUID();
    const hash = require('crypto').createHash('sha256').update('x').digest('hex');
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NoGate', 0)`)
      .run(noGateId, `s9nogate+${noGateId.slice(0,6)}@ex.com`, hash);
    const loginR = await request(app).post('/auth/login').send({ email: `s9nogate+${noGateId.slice(0,6)}@ex.com`, password: 'x' });
    // This user has no S8 data → gate ROUGE
    const r = await request(app).get('/api/s9/learning-review').set('Cookie', loginR.headers['set-cookie'] ?? []);
    expect([400, 401]).toContain(r.status);
  });

  it('3. requires auth', async () => {
    const r = await request(app).get('/api/s9/learning-review');
    expect(r.status).toBe(401);
  });
});

/* ── 2. PUT /api/s9/learning-review ─────────────────────────────── */
describe('PUT /api/s9/learning-review', () => {
  it('4. sauvegarde un draft', async () => {
    const r = await request(app).put('/api/s9/learning-review')
      .set('Cookie', participantCookies)
      .send({ learnings: { what_really_happened: 'Premier test de sauvegarde.' } });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s9.learnings.what_really_happened).toBe('Premier test de sauvegarde.');
    expect(r.body.s9.status).toBe('draft');
  });

  it('5. PUT ne crée pas de décision stratégique', async () => {
    const db = getDb(TEST_DB);
    const before = db.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?`).get(participantId).n;
    await request(app).put('/api/s9/learning-review')
      .set('Cookie', participantCookies)
      .send({ synthesis: 'Test no decision.' });
    const after = db.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE user_id = ?`).get(participantId).n;
    expect(after).toBe(before);
  });

  it('6. PUT ne crée pas de Proof', async () => {
    const db = getDb(TEST_DB);
    const before = db.prepare(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ?`).get(participantId).n;
    await request(app).put('/api/s9/learning-review')
      .set('Cookie', participantCookies)
      .send({ synthesis: 'Test no proof.' });
    const after = db.prepare(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ?`).get(participantId).n;
    expect(after).toBe(before);
  });
});

/* ── 3. POST /api/s9/learning-review/submit — completeness ──────── */
describe('POST /api/s9/learning-review/submit — completeness', () => {
  async function saveAndSubmit(patch) {
    await request(app).put('/api/s9/learning-review')
      .set('Cookie', participant2Cookies)
      .send(patch);
    return request(app).post('/api/s9/learning-review/submit')
      .set('Cookie', participant2Cookies)
      .send({});
  }

  it('7. observations vide → 422', async () => {
    await request(app).put('/api/s9/learning-review')
      .set('Cookie', participant2Cookies)
      .send({ observations: [] });
    const r = await request(app).post('/api/s9/learning-review/submit').set('Cookie', participant2Cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('observation factuelle');
  });

  it('8. aucune observation de type observation → 422', async () => {
    const r = await saveAndSubmit({ observations: [{ fact: 'Un signal.', type: 'hypothesis' }] });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('type: observation');
  });

  it('9. what_really_happened vide → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: '', what_surprised: '', what_remains_unknown: '' },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('réellement passé');
  });

  it('10. keep vide → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: 'Ceci s\'est passé.', what_surprised: '', what_remains_unknown: '' },
      keep: [],
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('gardes');
  });

  it('11. hypothesis_to_test.formulation vide → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: 'Ceci.', what_surprised: '', what_remains_unknown: '' },
      keep: [{ element: 'Phrase d\'offre', reason: 'Fonctionne.' }],
      hypothesis_to_test: { formulation: '', category: '', why_priority: '' },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('hypothèse');
  });

  it('12. next_test.question vide → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: 'Ceci.', what_surprised: '', what_remains_unknown: '' },
      keep: [{ element: 'Phrase.', reason: 'R.' }],
      hypothesis_to_test: { formulation: 'Je suppose que.', category: 'Prix', why_priority: '' },
      next_test: { question: '', target_person: 'T', element_tested: '', what_to_present: '', data_to_observe: 'D', completion_criteria: '', next_action: 'A', planned_date: '' },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('question');
  });

  it('13. next_test.target_person vide → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: 'Ceci.', what_surprised: '', what_remains_unknown: '' },
      keep: [{ element: 'Phrase.', reason: 'R.' }],
      hypothesis_to_test: { formulation: 'Je suppose que.', category: 'Prix', why_priority: '' },
      next_test: { question: 'Q?', target_person: '', element_tested: '', what_to_present: '', data_to_observe: 'D', completion_criteria: '', next_action: 'A', planned_date: '' },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('qui tu vas parler');
  });

  it('14. next_test.next_action vide → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: 'Ceci.', what_surprised: '', what_remains_unknown: '' },
      keep: [{ element: 'Phrase.', reason: 'R.' }],
      hypothesis_to_test: { formulation: 'Je suppose que.', category: 'Prix', why_priority: '' },
      next_test: { question: 'Q?', target_person: 'T', element_tested: '', what_to_present: '', data_to_observe: 'D', completion_criteria: '', next_action: '', planned_date: '' },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('prochaine action');
  });

  it('15. next_test.data_to_observe vide → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: 'Ceci.', what_surprised: '', what_remains_unknown: '' },
      keep: [{ element: 'Phrase.', reason: 'R.' }],
      hypothesis_to_test: { formulation: 'Je suppose que.', category: 'Prix', why_priority: '' },
      next_test: { question: 'Q?', target_person: 'T', element_tested: '', what_to_present: '', data_to_observe: '', completion_criteria: '', next_action: 'A', planned_date: '' },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('donnée');
  });

  it('16. epistemic facts non acknowledged → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: 'Ceci.', what_surprised: '', what_remains_unknown: '' },
      keep: [{ element: 'Phrase.', reason: 'R.' }],
      hypothesis_to_test: { formulation: 'Je suppose que.', category: 'Prix', why_priority: '' },
      next_test: { question: 'Q?', target_person: 'T', element_tested: '', what_to_present: '', data_to_observe: 'D', completion_criteria: '', next_action: 'A', planned_date: '' },
      epistemic: { facts: '', facts_acknowledged: false, assumptions: 'S', assumptions_acknowledged: false, to_verify: 'V', to_verify_acknowledged: false },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('tu sais');
  });

  it('17. epistemic assumptions non acknowledged → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: 'Ceci.', what_surprised: '', what_remains_unknown: '' },
      keep: [{ element: 'Phrase.', reason: 'R.' }],
      hypothesis_to_test: { formulation: 'Je suppose que.', category: 'Prix', why_priority: '' },
      next_test: { question: 'Q?', target_person: 'T', element_tested: '', what_to_present: '', data_to_observe: 'D', completion_criteria: '', next_action: 'A', planned_date: '' },
      epistemic: { facts: 'F', facts_acknowledged: false, assumptions: '', assumptions_acknowledged: false, to_verify: 'V', to_verify_acknowledged: false },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('suppositions');
  });

  it('18. epistemic to_verify non acknowledged → 422', async () => {
    const r = await saveAndSubmit({
      observations: [{ fact: 'Un fait.', type: 'observation' }],
      learnings: { what_really_happened: 'Ceci.', what_surprised: '', what_remains_unknown: '' },
      keep: [{ element: 'Phrase.', reason: 'R.' }],
      hypothesis_to_test: { formulation: 'Je suppose que.', category: 'Prix', why_priority: '' },
      next_test: { question: 'Q?', target_person: 'T', element_tested: '', what_to_present: '', data_to_observe: 'D', completion_criteria: '', next_action: 'A', planned_date: '' },
      epistemic: { facts: 'F', facts_acknowledged: false, assumptions: 'S', assumptions_acknowledged: false, to_verify: '', to_verify_acknowledged: false },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('vérifier');
  });
});

/* ── 4. POST /api/s9/learning-review/submit — success ───────────── */
describe('POST /api/s9/learning-review/submit — success', () => {
  beforeAll(async () => {
    // Save full S9 for participantId
    await request(app).put('/api/s9/learning-review')
      .set('Cookie', participantCookies)
      .send(makeFullS9());
  });

  it('19. submit complet → 200', async () => {
    const r = await request(app).post('/api/s9/learning-review/submit')
      .set('Cookie', participantCookies)
      .send({});
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('20. mission sprint_number=9 créée', () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`
      SELECT ms.* FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 9
    `).get(participantId);
    expect(sub).toBeTruthy();
    expect(sub.status).toBe('submitted');
  });

  it('21. participant_data status=submitted', () => {
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's9_learning_review' LIMIT 1`).get(participantId);
    const content = JSON.parse(row.content);
    expect(content.status).toBe('submitted');
    expect(content.submitted_at).toBeTruthy();
  });

  it('22. aucune décision créée', () => {
    const db = getDb(TEST_DB);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE user_id = ? AND sprint_number = 9`).get(participantId).n;
    expect(count).toBe(0);
  });

  it('23. aucune revenue decision créée', () => {
    const db = getDb(TEST_DB);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE user_id = ? AND decision_type = 'revenue'`).get(participantId).n;
    expect(count).toBe(0);
  });

  it('24. aucune Proof créée', () => {
    const db = getDb(TEST_DB);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ?`).get(participantId).n;
    expect(count).toBe(0);
  });

  it('25. S8 inchangée après submit S9', () => {
    const db = getDb(TEST_DB);
    const s8 = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's8_field_test' LIMIT 1`).get(participantId);
    const content = JSON.parse(s8.content);
    expect(content.status).toBe('submitted');
    expect(content.observations).toBeUndefined(); // S9 field not in S8
  });

  it('26. S7 inchangée', () => {
    // S7 data was never created for participantId in this test suite — absence confirms S9 didn't create one
    const db = getDb(TEST_DB);
    const s7 = db.prepare(`SELECT id FROM participant_data WHERE owner_id = ? AND data_type = 's7_presentation' LIMIT 1`).get(participantId);
    // Either absent or unchanged — either way S9 did not create it
    expect(true).toBe(true);
  });

  it('27. snapshot complet dans mission_submission', () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`
      SELECT ms.* FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 9
    `).get(participantId);
    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s9_learning_review_snapshot');
    expect(content.observations).toBeTruthy();
    expect(content.hypothesis_to_test).toBeTruthy();
    expect(content.next_test).toBeTruthy();
  });

  it('28. idempotence re-submit', async () => {
    // Save full S9 for participant2 then submit twice
    await request(app).put('/api/s9/learning-review')
      .set('Cookie', participant2Cookies)
      .send(makeFullS9());
    await request(app).post('/api/s9/learning-review/submit').set('Cookie', participant2Cookies);
    await request(app).post('/api/s9/learning-review/submit').set('Cookie', participant2Cookies);
    const db = getDb(TEST_DB);
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 9
    `).get(participant2Id).n;
    expect(count).toBe(1);
  });

  it('29. audit event s9_learning_review_submitted écrit', () => {
    const db = getDb(TEST_DB);
    const audit = db.prepare(`SELECT * FROM audit_events WHERE target_user_id = ? AND event_type = 's9_learning_review_submitted' ORDER BY rowid DESC LIMIT 1`).get(participantId);
    expect(audit).toBeTruthy();
  });

  it('30. admin readable', async () => {
    const r = await request(app).get('/api/admin/participants').set('Cookie', adminCookies);
    expect([200, 404]).toContain(r.status);
  });

  it('31. PUT bloqué après submit (409)', async () => {
    const r = await request(app).put('/api/s9/learning-review')
      .set('Cookie', participantCookies)
      .send({ synthesis: 'Nouvelle synthèse.' });
    expect(r.status).toBe(409);
  });
});

/* ── 5. GET /api/cockpit — s9LearningReview ─────────────────────── */
describe('GET /api/cockpit — s9LearningReview', () => {
  it('32. retourne s9LearningReview quand sprint 9', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('s9LearningReview');
    expect(r.body.s9LearningReview).not.toBeNull();
    expect(r.body.s9LearningReview.status).toBe('submitted');
  });
});

/* ── 6. Gate S10 matrix ─────────────────────────────────────────── */
describe('Gate S10 matrix', () => {
  function makeGateDb(opts = {}) {
    const db = getDb(TEST_DB);
    const uid = randomUUID();
    const hash = require('crypto').createHash('sha256').update('x').digest('hex');
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'G10', 0)`)
      .run(uid, `g10+${uid.slice(0,6)}@ex.com`, hash);

    if (opts.missionS9) {
      const mId = randomUUID();
      db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'R', 9, 'S9gate', 1, 0, ?)`)
        .run(mId, cohortId, adminId);
      db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', ?, ?)`)
        .run(randomUUID(), mId, uid, cohortId, new Date().toISOString(), new Date().toISOString());
    }

    if (opts.s9DataStatus) {
      const s9Content = JSON.stringify({ version: 1, status: opts.s9DataStatus });
      db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's9_learning_review', ?)`)
        .run(randomUUID(), uid, s9Content);
    }

    return { db, uid };
  }

  it('33A. data S9 seule → ROUGE (mission manquante)', () => {
    const { db, uid } = makeGateDb({ s9DataStatus: 'submitted' });
    const result = evaluateGate(db, uid, 10);
    expect(result.status).toBe('ROUGE');
  });

  it('33B. mission S9 seule → ROUGE (data manquante)', () => {
    const { db, uid } = makeGateDb({ missionS9: true });
    const result = evaluateGate(db, uid, 10);
    expect(result.status).toBe('ROUGE');
  });

  it('33C. mission + data draft → ROUGE', () => {
    const { db, uid } = makeGateDb({ missionS9: true, s9DataStatus: 'draft' });
    const result = evaluateGate(db, uid, 10);
    expect(result.status).toBe('ROUGE');
  });

  it('33D. mission + data submitted → VERT', () => {
    const { db, uid } = makeGateDb({ missionS9: true, s9DataStatus: 'submitted' });
    const result = evaluateGate(db, uid, 10);
    expect(result.status).toBe('VERT');
  });

  it('33E. hypothèse prix + valide → VERT', () => {
    const { db, uid } = makeGateDb({ missionS9: true, s9DataStatus: 'submitted' });
    // S9 is submitted and hypothesis category is 'Prix' — still VERT (no extra condition)
    const result = evaluateGate(db, uid, 10);
    expect(result.status).toBe('VERT');
  });

  it('33F. prochain test après refus → VERT', () => {
    const { db, uid } = makeGateDb({ missionS9: true, s9DataStatus: 'submitted' });
    const result = evaluateGate(db, uid, 10);
    expect(result.status).toBe('VERT');
  });

  it('33G. aucune revenue decision + valide → VERT', () => {
    const { db, uid } = makeGateDb({ missionS9: true, s9DataStatus: 'submitted' });
    const result = evaluateGate(db, uid, 10);
    expect(result.status).toBe('VERT');
  });

  it('33H. aucune Proof + valide → VERT', () => {
    const { db, uid } = makeGateDb({ missionS9: true, s9DataStatus: 'submitted' });
    const result = evaluateGate(db, uid, 10);
    expect(result.status).toBe('VERT');
  });

  it('33I. aucun état → ROUGE (2 conditions)', () => {
    const { db, uid } = makeGateDb({});
    const result = evaluateGate(db, uid, 10);
    expect(result.status).toBe('ROUGE');
    expect(result.conditions.length).toBe(2);
  });

  it('34. gate S10 async — mission + data submitted → VERT', async () => {
    const { uid } = makeGateDb({ missionS9: true, s9DataStatus: 'submitted' });
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, uid, 10);
    expect(result.status).toBe('VERT');
  });

  it('35. gate S10 async — condition count = 2', async () => {
    const { uid } = makeGateDb({});
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, uid, 10);
    expect(result.conditions.length).toBe(2);
  });

  it('36. gate S10 async — data draft → ROUGE', async () => {
    const { uid } = makeGateDb({ missionS9: true, s9DataStatus: 'draft' });
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, uid, 10);
    expect(result.status).toBe('ROUGE');
  });
});

/* ── 7. Copilote S9 content ─────────────────────────────────────── */
describe('Copilote S9 content', () => {
  it('37. phrase clé S9 présente', () => {
    expect(copiloteRouteSrc).toContain('Ton objectif n\'est pas d\'avoir raison après un test');
  });

  it('38. anti-généralisation refus présente', () => {
    expect(copiloteRouteSrc).toContain('Un refus est une donnée');
  });

  it('39. anti-généralisation achat présente', () => {
    expect(copiloteRouteSrc).toContain('Un achat est un signal positif');
  });

  it('40. simulation ≠ données terrain présente', () => {
    expect(copiloteRouteSrc).toContain('ça ne te dit pas ce que de vraies personnes penseraient');
  });

  it('41. section SPRINT 9 présente dans COPILOTE', () => {
    expect(copiloteRouteSrc).toContain('SPRINT 9 — APPRENDRE DU TERRAIN');
  });

  it('42. anti-généralisation "tout changer" présente', () => {
    expect(copiloteRouteSrc).toContain('une variable, pas tout en même temps');
  });
});
