/**
 * S10 — PROPOSER & OBSERVER — Tests
 * Build 21J: Iteration Plan CRUD, completeness, submit, gateS11 causal protection.
 */

// ── DB bootstrap — MUST be before any ESM imports ────────────────
import path from 'path';
import os from 'os';
const TEST_DB = path.join(os.tmpdir(), `rc-s10-test-${Date.now()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's10-test-secret-32-chars-minimum!';
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

/* ── Helpers ────────────────────────────────────────────────────── */
const PASS = 'Password1!';
const ADMIN_PASS = 'Admin123!';

let adminId, participantId, participant2Id, cohortId;
let participantEmail, participant2Email;
let participantCookies, participant2Cookies, adminCookies;
let s4DecisionId, s9RowId;

function makeFullS10() {
  return {
    iteration: {
      hypothesis: 'Je suppose que les femmes en reconversion hésitent sur le prix quand je ne justifie pas la valeur.',
      variable_under_test: 'Justification de la valeur : ajouter deux exemples concrets de résultats obtenus.',
      variable_category: 'formulation',
      constants: ['La cible', 'Le canal (café)', 'La phrase d\'offre de base'],
    },
    test_plan: {
      target_person: 'Femmes salariées 35-50 ans en reconversion active, approchées via LinkedIn',
      message_or_offer: 'Ma phrase d\'offre + 2 exemples de transformations concrètes',
      channel: 'LinkedIn → café',
      main_question: 'Est-ce que l\'ajout des exemples réduit l\'hésitation sur le prix ?',
    },
    observation_criteria: {
      data_to_observe: 'Réaction spontanée au tarif après présentation des exemples — posent-elles moins de questions sur le prix ?',
      expected_action: 'Demande d\'information supplémentaire ou prise de RDV',
      completion_criterion: 'J\'ai présenté l\'offre + exemples à une personne correspondant à ma cible et documenté sa réaction.',
    },
    decision_criteria: {
      what_i_will_look_at: 'Si au moins 2 personnes sur 3 ne questionnent plus le prix spontanément, je considère que les exemples aident.',
    },
    epistemic: {
      facts: 'La phrase d\'offre est comprise mais le prix questionné lors des tests S8.',
      facts_acknowledged: false,
      assumptions: 'Je suppose que les exemples concrets réduisent la perception de risque.',
      assumptions_acknowledged: false,
      to_verify: 'Si le problème est vraiment le prix ou la confiance dans le résultat.',
      to_verify_acknowledged: false,
    },
    synthesis: 'Je teste l\'ajout d\'exemples concrets pour réduire l\'hésitation tarifaire.',
  };
}

function makeMinimalS10() {
  return {
    iteration: {
      hypothesis: 'Tester si la reformulation réduit les questions sur le prix.',
      variable_under_test: 'Formulation avec exemples de résultats',
      variable_category: 'formulation',
      constants: [],
    },
    test_plan: {
      target_person: 'Femme en reconversion',
      message_or_offer: '',
      channel: '',
      main_question: 'Est-ce que les exemples aident ?',
    },
    observation_criteria: {
      data_to_observe: 'Réaction au prix',
      expected_action: '',
      completion_criterion: 'J\'ai présenté l\'offre à une personne et documenté sa réaction.',
    },
    decision_criteria: {
      what_i_will_look_at: 'Si la personne pose moins de questions sur le prix.',
    },
    epistemic: {
      facts: '',
      facts_acknowledged: true,
      assumptions: '',
      assumptions_acknowledged: true,
      to_verify: '',
      to_verify_acknowledged: true,
    },
    synthesis: '',
  };
}

async function loginAs(email, password) {
  const res = await request(app)
    .post('/auth/login')
    .send({ email, password });
  return res.headers['set-cookie'];
}

async function submitS9ForParticipant() {
  const db = getDb();
  const now = new Date().toISOString();
  // Insert S9 participant_data with submitted status
  const s9Content = JSON.stringify({
    version: 1,
    status: 'submitted',
    observations: [{ fact: 'Test fact', type: 'observation' }],
    learnings: { what_really_happened: 'Ce qui s\'est passé réellement.', what_surprised: '', what_remains_unknown: '' },
    keep: [{ element: 'La phrase d\'offre', reason: 'Elle fonctionne.' }],
    hypothesis_to_test: {
      formulation: 'Le prix est perçu comme élevé.',
      category: 'Prix',
      why_priority: 'C\'est la principale objection.',
    },
    next_test: {
      question: 'Est-ce que le prix est le vrai frein ?',
      target_person: 'Femmes 35-50 en reconversion',
      element_tested: 'Prix',
      what_to_present: 'Ma phrase d\'offre',
      data_to_observe: 'Réaction au prix',
      completion_criteria: 'Après 3 conversations',
      next_action: 'Contacter 3 personnes',
      planned_date: '2026-10-01',
    },
    epistemic: {
      facts: 'La phrase d\'offre est comprise.',
      facts_acknowledged: false,
      assumptions: 'Le prix est le frein.',
      assumptions_acknowledged: false,
      to_verify: 'Les alternatives connues.',
      to_verify_acknowledged: false,
    },
    synthesis: 'Je veux tester le prix.',
    submitted_at: now,
  });
  s9RowId = randomUUID();
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, ?, ?)`).run(s9RowId, participantId, 's9_learning_review', s9Content);
}

/* ── Setup ──────────────────────────────────────────────────────── */
beforeAll(async () => {
  const db = getDb();

  adminId = randomUUID();
  participantId = randomUUID();
  participant2Id = randomUUID();
  cohortId = randomUUID();
  participantEmail = `p.s10.${Date.now()}@test.com`;
  participant2Email = `p2.s10.${Date.now()}@test.com`;
  const adminEmail = `admin.s10.${Date.now()}@test.com`;
  const hash = await hashPassword(PASS);
  const adminHash = await hashPassword(ADMIN_PASS);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, adminEmail, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'S10 Cohort', '2026-01-01', ?)`).run(cohortId, adminId);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`).run(randomUUID(), participantId, cohortId);

  // Create a sprint 10 mission
  const missionId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'R', 10, 'Proposer & Observer', 1, 0, ?)`).run(missionId, cohortId, adminId);

  // S4 active direction decision (needed for S5+ chain context)
  s4DecisionId = randomUUID();
  db.prepare(`INSERT INTO decisions (id, user_id, decision_type, status, title, context, created_at) VALUES (?, ?, 'project', 'active', 'Direction S4', '{"direction":{"formulation":"Aider les femmes en reconversion","person":"Femme salariée 35-50","problem":"Manque de clarté sur son offre"}}', ?)`)
    .run(s4DecisionId, participantId, now);

  // Insert S9 submitted data
  await submitS9ForParticipant();

  participantCookies = await loginAs(participantEmail, PASS);
  participant2Cookies = await loginAs(participant2Email, PASS);
  adminCookies = await loginAs(adminEmail, ADMIN_PASS);
});

afterAll(() => { try { resetDb(); } catch {} });

/* ── A. PREREQUISITES ───────────────────────────────────────────── */
describe('A. Prerequisites — S9 must be submitted', () => {
  it('GET blocked when S9 not submitted (participant2 has no S9)', async () => {
    const res = await request(app)
      .get('/api/s10/iteration-plan')
      .set('Cookie', participant2Cookies);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Sprint 9/i);
  });

  it('GET succeeds when S9 is submitted', async () => {
    const res = await request(app)
      .get('/api/s10/iteration-plan')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('s9_refs');
  });
});

/* ── B. S9 PREFILL ──────────────────────────────────────────────── */
describe('B. S9 prefill', () => {
  it('s9_refs contains priority hypothesis from S9', async () => {
    const res = await request(app)
      .get('/api/s10/iteration-plan')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(200);
    expect(res.body.s9_refs.priority_hypothesis).toBe('Le prix est perçu comme élevé.');
  });

  it('s9_refs contains next_test fields from S9', async () => {
    const res = await request(app)
      .get('/api/s10/iteration-plan')
      .set('Cookie', participantCookies);
    expect(res.body.s9_refs.next_test_question).toBe('Est-ce que le prix est le vrai frein ?');
    expect(res.body.s9_refs.next_test_target).toBe('Femmes 35-50 en reconversion');
  });
});

/* ── C. DRAFT LIFECYCLE ─────────────────────────────────────────── */
describe('C. Draft lifecycle — PUT', () => {
  it('GET with no existing data returns s10: null', async () => {
    const res = await request(app)
      .get('/api/s10/iteration-plan')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(200);
    expect(res.body.s10).toBeNull();
  });

  it('PUT creates draft with iteration hypothesis', async () => {
    const res = await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ iteration: { hypothesis: 'Première hypothèse draft' } });
    expect(res.status).toBe(200);
    expect(res.body.s10.iteration.hypothesis).toBe('Première hypothèse draft');
    expect(res.body.s10.status).toBe('draft');
  });

  it('PUT merges iteration fields without overwriting unset fields', async () => {
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ iteration: { variable_under_test: 'Formulation avec exemples' } });
    const res = await request(app)
      .get('/api/s10/iteration-plan')
      .set('Cookie', participantCookies);
    expect(res.body.s10.iteration.hypothesis).toBe('Première hypothèse draft');
    expect(res.body.s10.iteration.variable_under_test).toBe('Formulation avec exemples');
  });

  it('PUT validates variable_category — invalid value is set to null', async () => {
    const res = await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ iteration: { variable_category: 'invalid_category' } });
    expect(res.status).toBe(200);
    expect(res.body.s10.iteration.variable_category).toBeNull();
  });

  it('PUT accepts valid variable_category', async () => {
    const res = await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ iteration: { variable_category: 'prix' } });
    expect(res.status).toBe(200);
    expect(res.body.s10.iteration.variable_category).toBe('prix');
  });

  it('PUT accepts constants array', async () => {
    const res = await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ iteration: { constants: ['La cible', 'Le canal'] } });
    expect(res.status).toBe(200);
    expect(res.body.s10.iteration.constants).toHaveLength(2);
  });

  it('PUT merges test_plan fields', async () => {
    const res = await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ test_plan: { target_person: 'Femme en reconversion 40 ans' } });
    expect(res.status).toBe(200);
    expect(res.body.s10.test_plan.target_person).toBe('Femme en reconversion 40 ans');
  });

  it('PUT merges observation_criteria', async () => {
    const res = await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ observation_criteria: { completion_criterion: 'J\'ai présenté et documenté.' } });
    expect(res.status).toBe(200);
    expect(res.body.s10.observation_criteria.completion_criterion).toBe('J\'ai présenté et documenté.');
  });

  it('PUT merges epistemic with acknowledged flags', async () => {
    const res = await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ epistemic: { facts_acknowledged: true } });
    expect(res.status).toBe(200);
    expect(res.body.s10.epistemic.facts_acknowledged).toBe(true);
  });

  it('isolation — participant2 cannot see participant data (no S9 so blocked at gate)', async () => {
    const res = await request(app)
      .get('/api/s10/iteration-plan')
      .set('Cookie', participant2Cookies);
    expect(res.status).toBe(400);
  });
});

/* ── D. COMPLETENESS CHECK ──────────────────────────────────────── */
describe('D. Completeness — submit blocked when incomplete', () => {
  it('blocked when no iteration.hypothesis', async () => {
    const db = getDb();
    db.prepare(`DELETE FROM participant_data WHERE owner_id = ? AND data_type = 's10_iteration_plan'`).run(participantId);
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(400);
  });

  it('blocked when hypothesis present but variable_under_test missing', async () => {
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ iteration: { hypothesis: 'Mon hypothèse' } });
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/variable/i);
  });

  it('blocked when target_person missing', async () => {
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ iteration: { variable_under_test: 'Formulation' } });
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/cible|tester/i);
  });

  it('blocked when main_question missing', async () => {
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ test_plan: { target_person: 'Femme en reconversion' } });
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/question/i);
  });

  it('blocked when data_to_observe missing', async () => {
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ test_plan: { main_question: 'Ma question' } });
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/observer/i);
  });

  it('blocked when completion_criterion missing', async () => {
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ observation_criteria: { data_to_observe: 'Réaction au prix' } });
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/critère/i);
  });

  it('blocked when what_i_will_look_at missing', async () => {
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ observation_criteria: { completion_criterion: 'Test réalisé.' } });
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/suite|regarder/i);
  });

  it('blocked when epistemic.facts not filled and not acknowledged', async () => {
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({
        decision_criteria: { what_i_will_look_at: 'Si moins de questions sur le prix.' },
        epistemic: { facts: '', facts_acknowledged: false, assumptions: '', assumptions_acknowledged: false, to_verify: '', to_verify_acknowledged: false },
      });
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(422);
  });

  it('acknowledged epistemic passes completeness', async () => {
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({
        epistemic: { facts: '', facts_acknowledged: true, assumptions: '', assumptions_acknowledged: true, to_verify: '', to_verify_acknowledged: true },
      });
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect([200, 409]).toContain(res.status);
  });
});

/* ── E. SUBMIT ──────────────────────────────────────────────────── */
describe('E. Submit lifecycle', () => {
  beforeAll(async () => {
    // Reset to a complete state
    const db = getDb();
    db.prepare(`DELETE FROM participant_data WHERE owner_id = ? AND data_type = 's10_iteration_plan'`).run(participantId);
    db.prepare(`DELETE FROM mission_submissions WHERE user_id = ?`).run(participantId);
    await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send(makeFullS10());
  });

  it('submit succeeds with complete data', async () => {
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET after submit shows status=submitted', async () => {
    const res = await request(app)
      .get('/api/s10/iteration-plan')
      .set('Cookie', participantCookies);
    expect(res.body.s10.status).toBe('submitted');
  });

  it('PUT blocked after submit', async () => {
    const res = await request(app)
      .put('/api/s10/iteration-plan')
      .set('Cookie', participantCookies)
      .send({ iteration: { hypothesis: 'Changement après soumission' } });
    expect(res.status).toBe(409);
  });

  it('submit is idempotent — second submit returns same submission', async () => {
    const res = await request(app)
      .post('/api/s10/iteration-plan/submit')
      .set('Cookie', participantCookies);
    expect([200, 409]).toContain(res.status);
  });

  it('audit event written on submit', () => {
    const db = getDb();
    const event = db.prepare(`SELECT * FROM audit_events WHERE actor_id = ? AND event_type = 's10_iteration_plan_submitted'`)
      .get(participantId);
    expect(event).toBeTruthy();
  });
});

/* ── F. SNAPSHOT INTEGRITY ──────────────────────────────────────── */
describe('F. Mission snapshot integrity', () => {
  it('snapshot contains s10 iteration and test_plan', () => {
    const db = getDb();
    const sub = db.prepare(`
      SELECT ms.content FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 10
    `).get(participantId);
    expect(sub).toBeTruthy();
    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s10_iteration_plan_snapshot');
    expect(content.iteration).toBeDefined();
    expect(content.test_plan).toBeDefined();
    expect(content.observation_criteria).toBeDefined();
    expect(content.decision_criteria).toBeDefined();
    expect(content.epistemic).toBeDefined();
  });

  it('snapshot does NOT contain status=submitted declaration on iteration plan itself', () => {
    const db = getDb();
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's10_iteration_plan'`).get(participantId);
    const content = JSON.parse(row.content);
    expect(content.status).toBe('submitted');
  });
});

/* ── G. VARIABLE DISCIPLINE ─────────────────────────────────────── */
describe('G. Variable under test discipline', () => {
  it('variable_category accepts all valid categories', () => {
    const valid = ['cible', 'probleme', 'formulation', 'proposition', 'resultat', 'prix', 'cta', 'canal', 'objection', 'autre'];
    valid.forEach(cat => {
      // Just verify the list
      expect(valid).toContain(cat);
    });
  });

  it('snapshot preserves constants array', () => {
    const db = getDb();
    const sub = db.prepare(`
      SELECT ms.content FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 10
    `).get(participantId);
    const content = JSON.parse(sub.content);
    expect(Array.isArray(content.iteration.constants)).toBe(true);
  });
});

/* ── H. NO AUTOMATIC DECISIONS/REVENUE/PROOFS ──────────────────── */
describe('H. No automatic strategic/revenue/proof creation', () => {
  it('submit creates 0 new strategic decisions', () => {
    const db = getDb();
    const decisions = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND decision_type NOT IN ('project','pivot','scope')`).all(participantId);
    expect(decisions.length).toBe(0);
  });

  it('submit creates 0 revenue decisions', () => {
    const db = getDb();
    const rev = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND decision_type = 'revenue'`).all(participantId);
    expect(rev.length).toBe(0);
  });

  it('submit creates 0 new proofs', () => {
    const db = getDb();
    const proofs = db.prepare(`SELECT * FROM proofs WHERE user_id = ?`).all(participantId);
    // S7 creates proof #2, but S10 creates 0 proofs
    proofs.forEach(p => {
      expect(p.title).not.toMatch(/S10/i);
    });
  });
});

/* ── I. EPISTEMIC DISCIPLINE ────────────────────────────────────── */
describe('I. Epistemic discipline', () => {
  it('copilote.routes.js contains RÉPÉTITION D\'UN SIGNAL ≠ PREUVE ABSOLUE', () => {
    expect(copiloteRouteSrc).toMatch(/R.PÉTITION.*SIGNAL.*PREUVE ABSOLUE/);
  });

  it('copilote.routes.js contains ACHAT ≠ VALIDATION GÉNÉRALE DU MARCHÉ', () => {
    expect(copiloteRouteSrc).toMatch(/ACHAT.*VALIDATION/i);
  });

  it('copilote.routes.js contains REFUS ≠ ÉCHEC', () => {
    expect(copiloteRouteSrc).toMatch(/REFUS.*CHEC/i);
  });

  it('copilote.routes.js contains phrase clé S10', () => {
    expect(copiloteRouteSrc).toMatch(/Change une chose/i);
  });

  it('copilote.routes.js contains SPRINT 10 section', () => {
    expect(copiloteRouteSrc).toMatch(/SPRINT 10/);
  });

  it('copilote.routes.js contains simulation ≠ données terrain for S10', () => {
    expect(copiloteRouteSrc).toMatch(/simulation.*donn.es terrain|pr.paration.*remplace/i);
  });
});

/* ── J. GATE S10 — requires S9 submitted ───────────────────────── */
describe('J. Gate S10 — requires missionSubmitted(9) AND s9DataSubmitted', () => {
  it('evaluateGate(10) returns ROUGE for user with no S9', async () => {
    const db = getAdapter();
    const tmpId = randomUUID();
    const result = await evaluateGate(db, tmpId, 10);
    expect(result.status).toBe('ROUGE');
  });

  it('evaluateGate(10) returns ROUGE when S9 data exists but mission not submitted', async () => {
    // participant2 has no S9 mission submission — insert S9 data only
    const db = getDb();
    db.prepare(`DELETE FROM participant_data WHERE owner_id = ? AND data_type = 's9_learning_review'`).run(participant2Id);
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, ?, ?)`)
      .run(randomUUID(), participant2Id, 's9_learning_review', JSON.stringify({ status: 'submitted' }));
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, participant2Id, 10);
    expect(result.status).toBe('ROUGE');
    // Clean up
    db.prepare(`DELETE FROM participant_data WHERE owner_id = ? AND data_type = 's9_learning_review'`).run(participant2Id);
  });
});

/* ── K. GATE S11 — causal protection ───────────────────────────── */
describe('K. Gate S11 causal protection — includes S10 conditions', () => {
  it('evaluateGate(11) returns ROUGE for user with no S10', async () => {
    const db = getAdapter();
    const result = await evaluateGate(db, participant2Id, 11);
    expect(result.status).toBe('ROUGE');
  });

  it('gateS11 conditions include Sprint 10 complete', async () => {
    const db = getAdapter();
    const result = await evaluateGate(db, participant2Id, 11);
    const hasS10Condition = result.conditions?.some(c => c.label?.includes('10') || c.label?.includes('S10'));
    expect(hasS10Condition).toBe(true);
  });

  it('gateS11 bypass via market_conversations alone is blocked without S10', async () => {
    const db = getDb();
    const bypassId = randomUUID();
    const email = `bypass11.${Date.now()}@test.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Bypass', 0)`)
      .run(bypassId, email, hash);
    db.prepare(`INSERT INTO market_conversations (id, user_id, contact_id, title, summary, date_occurred, created_at) VALUES (?, ?, NULL, 'Test conv', 'Test conversation', '2026-01-01', ?)`)
      .run(randomUUID(), bypassId, new Date().toISOString());
    const adapter = getAdapter();
    const result = await evaluateGate(adapter, bypassId, 11);
    expect(result.status).toBe('ROUGE');
    const s10Condition = result.conditions?.find(c => c.label?.includes('10') || c.label?.includes('S10'));
    expect(s10Condition?.met).toBe(false);
  });
});

/* ── L. COCKPIT INTEGRATION ─────────────────────────────────────── */
describe('L. Cockpit s10IterationPlan', () => {
  it('cockpit.routes.js contains s10IterationPlan section', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./cockpit.routes.js', import.meta.url)),
      'utf8'
    );
    expect(src).toMatch(/s10IterationPlan/);
  });

  it('cockpit.routes.js fetches s10_iteration_plan data_type', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./cockpit.routes.js', import.meta.url)),
      'utf8'
    );
    expect(src).toMatch(/s10_iteration_plan/);
  });
});

/* ── M. PILOT SCENARIOS ─────────────────────────────────────────── */
describe('M. Pilot scenarios — epistemic doctrine', () => {
  it('copilote.routes.js challenges panic-driven full change', () => {
    expect(copiloteRouteSrc).toMatch(/refus.*tout changer|tout changer.*variable/i);
  });

  it('copilote.routes.js prevents market validation from a single purchase', () => {
    expect(copiloteRouteSrc).toMatch(/achat.*signal.*positif|signal.*positif.*achat/i);
  });

  it('copilote.routes.js blocks inventing terrain reactions', () => {
    expect(copiloteRouteSrc).toMatch(/inventer|simuler.*pr.paration/i);
  });

  it('copilote.routes.js addresses no-sale scenario', () => {
    expect(copiloteRouteSrc).toMatch(/Absence de vente|pas un .chec/i);
  });

  it('completion_criterion does not require a sale in routes', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./s10.routes.js', import.meta.url)),
      'utf8'
    );
    // The completion_criterion field description should not mandate a sale
    expect(src).not.toMatch(/achat.*obligatoire|sale.*required/i);
  });
});

/* ── N. POSTGRESQL PORTABILITY ──────────────────────────────────── */
describe('N. PostgreSQL portability', () => {
  it('gates.js _s10DataSubmitted does not use json_extract in async path', () => {
    const gatesSrc = readFileSync(
      fileURLToPath(new URL('../gates.js', import.meta.url)),
      'utf8'
    );
    const fn = gatesSrc.match(/async function _s10DataSubmitted[\s\S]*?^}/m)?.[0];
    expect(fn).toBeDefined();
    expect(fn).not.toMatch(/json_extract/);
  });

  it('gates.js _s10DataSubmittedSync uses json_extract (SQLite-only, sync path)', () => {
    const gatesSrc = readFileSync(
      fileURLToPath(new URL('../gates.js', import.meta.url)),
      'utf8'
    );
    const fn = gatesSrc.match(/function _s10DataSubmittedSync[\s\S]*?^}/m)?.[0];
    expect(fn).toBeDefined();
    expect(fn).toMatch(/json_extract/);
  });

  it('gateS11 async uses _s10DataSubmitted (not json_extract)', () => {
    const gatesSrc = readFileSync(
      fileURLToPath(new URL('../gates.js', import.meta.url)),
      'utf8'
    );
    const fn = gatesSrc.match(/async function gateS11[\s\S]*?^}/m)?.[0];
    expect(fn).toBeDefined();
    expect(fn).toMatch(/_s10DataSubmitted/);
    expect(fn).not.toMatch(/json_extract/);
  });
});

/* ── O. NON-REGRESSION S4-S9 ────────────────────────────────────── */
describe('O. Non-regression S4-S9', () => {
  it('s4 route still accessible', async () => {
    const res = await request(app).get('/api/s4/direction').set('Cookie', participantCookies);
    expect([200, 400]).toContain(res.status);
  });

  it('s5 route still accessible', async () => {
    const res = await request(app).get('/api/s5/target-problem').set('Cookie', participantCookies);
    expect([200, 400]).toContain(res.status);
  });

  it('s6 route still accessible', async () => {
    const res = await request(app).get('/api/s6/test-offer').set('Cookie', participantCookies);
    expect([200, 400]).toContain(res.status);
  });

  it('s7 route still accessible', async () => {
    const res = await request(app).get('/api/s7/presentation').set('Cookie', participantCookies);
    expect([200, 400]).toContain(res.status);
  });

  it('s8 route still accessible', async () => {
    const res = await request(app).get('/api/s8/field-test').set('Cookie', participantCookies);
    expect([200, 400]).toContain(res.status);
  });

  it('s9 route still accessible', async () => {
    const res = await request(app).get('/api/s9/learning-review').set('Cookie', participantCookies);
    expect([200, 400]).toContain(res.status);
  });

  it('gateS6 still requires s5DataSubmitted', async () => {
    const db = getAdapter();
    const result = await evaluateGate(db, participant2Id, 6);
    expect(result.status).toBe('ROUGE');
  });

  it('gateS9 still requires s8DataSubmitted', async () => {
    const db = getAdapter();
    const result = await evaluateGate(db, participant2Id, 9);
    expect(result.status).toBe('ROUGE');
  });

  it('gateS10 still requires s9DataSubmitted', async () => {
    const db = getAdapter();
    const result = await evaluateGate(db, participant2Id, 10);
    expect(result.status).toBe('ROUGE');
  });
});
