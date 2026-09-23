/**
 * S12 — LA SUITE SOUS CONTRÔLE — Tests
 * B21L: Continuity plan CRUD, completeness, submit, gateFinal causal protection.
 */

// ── DB bootstrap — MUST be before any ESM imports ────────────────
import path from 'path';
import os from 'os';
const TEST_DB = path.join(os.tmpdir(), `rc-s12-test-${Date.now()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's12-test-secret-32-chars-minimum!';
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

// Matches actual route field names
function makeFullS12() {
  return {
    ninety_day_goal: 'Conduire 10 nouvelles conversations terrain et revoir mon offre en conséquence.',
    ninety_day_goal_why: 'Pour valider définitivement ma cible et mon positionnement.',
    ninety_day_goal_observable: 'J\'aurai 10 conversations documentées et une offre révisée.',
    ninety_day_not_priority: 'La création de contenu sur les réseaux et la refonte du site.',
    priority: 'Les conversations terrain avec ma cible principale.',
    phases: {
      days_1_30: {
        objective: 'Conduire 5 premières conversations et noter les patterns.',
        actions: 'Contacter 10 personnes de ma liste / Organiser 5 RDV / Documenter chaque échange.',
        observable_result: 'J\'ai 5 conversations documentées avec des observations claires.',
        to_verify: 'La réaction face à mon offre.',
      },
      days_31_60: {
        objective: 'Ajuster l\'offre selon les retours et tester la version révisée.',
        actions: 'Réviser la proposition de valeur / Tester avec 3 nouvelles personnes.',
        observable_result: 'J\'ai une offre ajustée et testée.',
        to_verify: 'Si l\'ajustement améliore la réponse.',
      },
      days_61_90: {
        objective: 'Consolider les apprentissages et décider de la suite.',
        actions: 'Bilan des 10 conversations / Décision sur la direction à prendre.',
        observable_result: 'Je sais si cette direction mérite d\'être poursuivie.',
        to_verify: 'La question principale finale.',
      },
    },
    weekly_rhythm: {
      hours_available: '4',
      action_slots: 'Mardis soir + samedi matin',
      terrain_actions_per_week: '2',
      review_frequency: 'Hebdomadaire le dimanche',
    },
    tracking_indicators: ['Nombre de conversations conduites', 'Nombre de propositions envoyées'],
    checkpoints: {
      day_30: {
        what_done: 'J\'aurai conduit 5 conversations et noté les patterns récurrents.',
        what_observed: 'Les réactions des personnes à mon offre.',
        what_changed: 'Ma compréhension de la cible.',
        still_uncertain: 'Le prix optimal.',
        continue_adjust_or_reevaluate: 'Continuer avec ajustement.',
      },
      day_60: {
        what_done: 'J\'aurai ajusté l\'offre et testé avec 3 nouvelles personnes.',
        what_observed: 'Les retours sur l\'offre révisée.',
        what_changed: 'La proposition de valeur.',
        still_uncertain: 'Le canal optimal.',
        continue_adjust_or_reevaluate: 'Continuer.',
      },
      day_90: {
        what_done: 'J\'aurai un bilan complet de mes 90 jours.',
        what_observed: 'L\'ensemble des signaux terrain.',
        what_changed: 'Ma vision du projet.',
        still_uncertain: 'La scalabilité.',
        continue_adjust_or_reevaluate: 'Décision finale.',
      },
    },
    reopening_conditions: 'Si à J60 aucune personne n\'a répondu positivement.',
    friction_plan: {
      probable_obstacle: 'Semaines chargées au travail, manque de motivation dans les phases de doute.',
      planned_response: 'Je reviens à mon objectif principal et je fais au minimum 1 action.',
      minimum_action: 'Envoyer 1 message de contact terrain.',
    },
    next_action: 'Demain matin : identifier 10 personnes de ma cible et envoyer 3 messages de contact.',
    epistemic: {
      plan_not_prediction: true,
      objective_not_guarantee: true,
      commitment_not_certainty: true,
    },
  };
}

async function loginAs(email, password) {
  const r = await request(app).post('/auth/login').send({ email, password });
  return r.headers['set-cookie'];
}

async function seedS11Submitted(userId, decision = 'continue_tests') {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's11_real_decision', ?)`)
    .run(id, userId, JSON.stringify({
      status: 'submitted',
      decision,
      justification: 'Données insuffisantes pour décider définitivement.',
      next_action: 'Faire 3 tests supplémentaires.',
      signals: { recurring: ['Signal R'], contradictory: [], insufficient: [] },
      unknowns: ['Inconnue principale'],
      observed_facts: 'Faits terrain.',
      interpretation: 'Interprétation des données.',
      options_considered: ['Option A', 'Option B'],
      epistemic_data_vs_interpretation: true,
      epistemic_signal_not_rule: true,
      epistemic_decision_without_certainty: true,
    }));
  return id;
}

async function seedS12Mission(cohortId) {
  const db = getDb();
  const mId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by)
    VALUES (?, ?, 'E', 12, 'Mission S12', 1, 0, ?)`)
    .run(mId, cohortId, adminId);
  return mId;
}

async function seedS11Mission(cohortId, userId) {
  const db = getDb();
  const mId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by)
    VALUES (?, ?, 'E', 11, 'Mission S11', 1, 0, ?)`)
    .run(mId, cohortId, adminId);
  const subId = randomUUID();
  db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status)
    VALUES (?, ?, ?, ?, 'snapshot', 'submitted')`)
    .run(subId, mId, userId, cohortId);
  return { mId, subId };
}

/* ── Global setup ───────────────────────────────────────────────── */
beforeAll(async () => {
  const db = getDb();
  adminId = randomUUID();
  participantId = randomUUID();
  participant2Id = randomUUID();
  cohortId = randomUUID();
  participantEmail = `s12p+${participantId.slice(0, 6)}@test.local`;
  participant2Email = `s12p2+${participant2Id.slice(0, 6)}@test.local`;

  const ph = await hashPassword(PASS);
  const ah = await hashPassword(ADMIN_PASS);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s12admin+${adminId.slice(0, 6)}@test.local`, ah);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Participant', 0)`)
    .run(participantId, participantEmail, ph);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'P2', 0)`)
    .run(participant2Id, participant2Email, ph);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'S12 Cohort', '2026-01-01', ?)`)
    .run(cohortId, adminId);

  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);

  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  participantCookies = await loginAs(participantEmail, PASS);
  participant2Cookies = await loginAs(participant2Email, PASS);
  adminCookies = await loginAs(`s12admin+${adminId.slice(0, 6)}@test.local`, ADMIN_PASS);
});

afterAll(() => {
  resetDb();
});

/* ── 1. Prerequisites ───────────────────────────────────────────── */
describe('S12 prerequisites', () => {
  it('GET /api/s12/continuity-plan returns 400 when S11 not submitted', async () => {
    const r = await request(app)
      .get('/api/s12/continuity-plan')
      .set('Cookie', participant2Cookies);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Sprint 11/);
  });

  it('returns 401 without auth', async () => {
    const r = await request(app).get('/api/s12/continuity-plan');
    expect(r.status).toBe(401);
  });
});

/* ── 2. GET initial state with S11 submitted ────────────────────── */
describe('S12 GET with S11 submitted', () => {
  beforeAll(async () => {
    await seedS11Submitted(participantId, 'continue_tests');
    await seedS11Mission(cohortId, participantId);
  });

  it('returns null s12 and s11_refs when no data yet', async () => {
    const r = await request(app)
      .get('/api/s12/continuity-plan')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s12).toBeNull();
    expect(r.body.s11_refs).toBeDefined();
    expect(r.body.s11_refs.decision).toBe('continue_tests');
  });

  it('s11_refs includes justification and next_action', async () => {
    const r = await request(app)
      .get('/api/s12/continuity-plan')
      .set('Cookie', participantCookies);
    expect(r.body.s11_refs.justification).toBeTruthy();
    expect(r.body.s11_refs.next_action).toBeTruthy();
  });
});

/* ── 3. Draft CRUD ──────────────────────────────────────────────── */
describe('S12 draft CRUD', () => {
  it('PUT creates draft with minimal field', async () => {
    const r = await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send({ ninety_day_goal: 'Mon objectif principal à 90 jours.' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s12.ninety_day_goal).toBe('Mon objectif principal à 90 jours.');
    expect(r.body.s12.status).toBe('draft');
  });

  it('PUT merges without overwriting untouched fields', async () => {
    await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send({ priority: 'Conversations terrain.' });
    const r = await request(app)
      .get('/api/s12/continuity-plan')
      .set('Cookie', participantCookies);
    expect(r.body.s12.ninety_day_goal).toBe('Mon objectif principal à 90 jours.');
    expect(r.body.s12.priority).toBe('Conversations terrain.');
  });

  it('PUT accepts phases.days_1_30 partial update', async () => {
    const r = await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send({ phases: { days_1_30: { objective: 'J30 objectif.' } } });
    expect(r.status).toBe(200);
    expect(r.body.s12.phases.days_1_30.objective).toBe('J30 objectif.');
  });

  it('PUT accepts tracking_indicators array', async () => {
    const r = await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send({ tracking_indicators: ['Indicateur A', 'Indicateur B'] });
    expect(r.status).toBe(200);
    expect(r.body.s12.tracking_indicators).toHaveLength(2);
  });

  it('PUT accepts weekly_rhythm with string hours_available', async () => {
    const r = await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send({ weekly_rhythm: { hours_available: '5' } });
    expect(r.status).toBe(200);
    expect(r.body.s12.weekly_rhythm.hours_available).toBe('5');
  });

  it('PUT accepts checkpoints partial', async () => {
    const r = await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send({ checkpoints: { day_30: { what_done: 'J30 fait.' } } });
    expect(r.status).toBe(200);
    expect(r.body.s12.checkpoints.day_30.what_done).toBe('J30 fait.');
  });

  it('PUT accepts friction_plan', async () => {
    const r = await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send({ friction_plan: { probable_obstacle: 'Semaines chargées.' } });
    expect(r.status).toBe(200);
    expect(r.body.s12.friction_plan.probable_obstacle).toBe('Semaines chargées.');
  });

  it('PUT accepts nested epistemic fields', async () => {
    const r = await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send({ epistemic: { plan_not_prediction: true } });
    expect(r.status).toBe(200);
    expect(r.body.s12.epistemic.plan_not_prediction).toBe(true);
  });

  it('participant data not visible to participant2 (has no S11)', async () => {
    const r = await request(app)
      .get('/api/s12/continuity-plan')
      .set('Cookie', participant2Cookies);
    expect(r.status).toBe(400); // 400 because participant2 has no submitted S11
  });
});

/* ── 4. Completeness checks ─────────────────────────────────────── */
describe('S12 completeness', () => {
  function seedDraft(userId, overrides = {}) {
    const db = getDb();
    const base = {
      status: 'draft',
      ninety_day_goal: 'Goal',
      priority: 'P',
      phases: { days_1_30: { objective: 'O', actions: 'A' } },
      weekly_rhythm: { hours_available: '4' },
      tracking_indicators: ['I1'],
      next_action: 'Action',
      epistemic: { plan_not_prediction: true, objective_not_guarantee: true, commitment_not_certainty: true },
    };
    const content = { ...base, ...overrides };
    const existing = db.prepare(`SELECT id FROM participant_data WHERE owner_id = ? AND data_type = 's12_continuity_plan'`).get(userId);
    if (existing) {
      db.prepare(`UPDATE participant_data SET content = ? WHERE id = ?`).run(JSON.stringify(content), existing.id);
    } else {
      db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's12_continuity_plan', ?)`)
        .run(randomUUID(), userId, JSON.stringify(content));
    }
  }

  it('POST submit fails when ninety_day_goal is missing', async () => {
    seedDraft(participantId, { ninety_day_goal: '' });
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toBeTruthy();
  });

  it('POST submit fails when priority is missing', async () => {
    seedDraft(participantId, { priority: '' });
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(422);
  });

  it('POST submit fails when phases.days_1_30 objective is missing', async () => {
    seedDraft(participantId, { phases: { days_1_30: { objective: '', actions: 'A' } } });
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(422);
  });

  it('POST submit fails when weekly_rhythm.hours_available missing', async () => {
    seedDraft(participantId, { weekly_rhythm: { hours_available: '' } });
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(422);
  });

  it('POST submit fails when tracking_indicators empty', async () => {
    seedDraft(participantId, { tracking_indicators: [] });
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(422);
  });

  it('POST submit fails when next_action missing', async () => {
    seedDraft(participantId, { next_action: '' });
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(422);
  });

  it('POST submit fails when epistemic.plan_not_prediction is false', async () => {
    seedDraft(participantId, {
      epistemic: { plan_not_prediction: false, objective_not_guarantee: true, commitment_not_certainty: true },
    });
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(422);
  });

  it('POST submit fails when epistemic.objective_not_guarantee is false', async () => {
    seedDraft(participantId, {
      epistemic: { plan_not_prediction: true, objective_not_guarantee: false, commitment_not_certainty: true },
    });
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(422);
  });

  it('POST submit fails when epistemic.commitment_not_certainty is false', async () => {
    seedDraft(participantId, {
      epistemic: { plan_not_prediction: true, objective_not_guarantee: true, commitment_not_certainty: false },
    });
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(422);
  });
});

/* ── 5. S11 decision adaptation ─────────────────────────────────── */
describe('S12 S11 decision adaptation', () => {
  it('s11_refs.decision=go is readable from S12 endpoint', async () => {
    const db = getDb();
    const uid = randomUUID();
    const email = `s12go+${uid.slice(0, 6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Go', 0)`)
      .run(uid, email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    await seedS11Submitted(uid, 'go');
    const cookies = await loginAs(email, PASS);
    const r = await request(app).get('/api/s12/continuity-plan').set('Cookie', cookies);
    expect(r.status).toBe(200);
    expect(r.body.s11_refs.decision).toBe('go');
  });

  it('s11_refs.decision=no_go is also valid for S12', async () => {
    const db = getDb();
    const uid = randomUUID();
    const email = `s12nogo+${uid.slice(0, 6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NoGo', 0)`)
      .run(uid, email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    await seedS11Submitted(uid, 'no_go');
    const cookies = await loginAs(email, PASS);
    const r = await request(app).get('/api/s12/continuity-plan').set('Cookie', cookies);
    expect(r.status).toBe(200);
    expect(r.body.s11_refs.decision).toBe('no_go');
  });
});

/* ── 6. Submit flow ─────────────────────────────────────────────── */
describe('S12 submit flow', () => {
  let s12MissionId;

  beforeAll(async () => {
    s12MissionId = await seedS12Mission(cohortId);
    // Reset participant data to a complete state
    const db = getDb();
    db.prepare(`DELETE FROM participant_data WHERE owner_id = ? AND data_type = 's12_continuity_plan'`)
      .run(participantId);
  });

  it('PUT full data then POST submit succeeds', async () => {
    await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send(makeFullS12());

    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.continuity_decision_id).toBeTruthy();
  });

  it('submitted status is persisted on GET', async () => {
    const r = await request(app)
      .get('/api/s12/continuity-plan')
      .set('Cookie', participantCookies);
    expect(r.body.s12.status).toBe('submitted');
  });

  it('PUT after submit returns 409', async () => {
    const r = await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', participantCookies)
      .send({ ninety_day_goal: 'Tentative de modification.' });
    expect(r.status).toBe(409);
  });

  it('POST submit again returns 409', async () => {
    const r = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(409);
  });
});

/* ── 7. Continuity decision lifecycle ───────────────────────────── */
describe('S12 continuity decision', () => {
  it('submit creates a continuity decision in decisions table', () => {
    const db = getDb();
    const dec = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND decision_type = 'continuity' AND sprint_number = 12 AND status = 'active'`)
      .get(participantId);
    expect(dec).toBeTruthy();
    expect(dec.status).toBe('active');
    expect(dec.decision_type).toBe('continuity');
  });

  it('decision title reflects S11 decision (continue_tests)', () => {
    const db = getDb();
    const dec = db.prepare(`SELECT title FROM decisions WHERE user_id = ? AND decision_type = 'continuity' AND sprint_number = 12 AND status = 'active'`)
      .get(participantId);
    expect(dec).toBeTruthy();
    expect(dec.title).toContain('90 JOURS');
  });

  it('no revenue decision is created', () => {
    const db = getDb();
    const rev = db.prepare(`SELECT COUNT(*) as n FROM decisions WHERE user_id = ? AND decision_type = 'revenue'`)
      .get(participantId);
    expect(rev.n).toBe(0);
  });

  it('no proof is created', () => {
    const db = getDb();
    const proofs = db.prepare(`SELECT COUNT(*) as n FROM proofs WHERE user_id = ?`)
      .get(participantId);
    expect(proofs.n).toBe(0);
  });

  it('re-submit after reset is idempotent — creates new active decision', async () => {
    const db = getDb();
    const uid = randomUUID();
    const email = `s12idem+${uid.slice(0, 6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Idem', 0)`)
      .run(uid, email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    await seedS11Submitted(uid, 'go');
    const mId = randomUUID();
    db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by)
      VALUES (?, ?, 'E', 12, 'Mission S12 Idem', 1, 0, ?)`)
      .run(mId, cohortId, adminId);

    const cookies = await loginAs(email, PASS);
    await request(app)
      .put('/api/s12/continuity-plan')
      .set('Cookie', cookies)
      .send(makeFullS12());

    const r1 = await request(app)
      .post('/api/s12/continuity-plan/submit')
      .set('Cookie', cookies);
    expect(r1.status).toBe(200);
    const dec1Id = r1.body.continuity_decision_id;

    const dec1 = db.prepare(`SELECT status FROM decisions WHERE id = ?`).get(dec1Id);
    expect(dec1).toBeTruthy();
    expect(dec1.status).toBe('active');

    // Only 1 active continuity decision
    const active = db.prepare(`SELECT COUNT(*) as n FROM decisions WHERE user_id = ? AND decision_type = 'continuity' AND status = 'active'`)
      .get(uid);
    expect(active.n).toBe(1);
  });
});

/* ── 8. gateFinal causal matrix ─────────────────────────────────── */
describe('gateFinal causal conditions', () => {
  let gateUserId;
  let s12GateMissionId;

  beforeAll(async () => {
    const db = getDb();
    gateUserId = randomUUID();
    const email = `s12gate+${gateUserId.slice(0, 6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'GateUser', 0)`)
      .run(gateUserId, email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), gateUserId, cohortId);
    s12GateMissionId = randomUUID();
    db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by)
      VALUES (?, ?, 'E', 12, 'Mission S12 Gate', 1, 0, ?)`)
      .run(s12GateMissionId, cohortId, adminId);
  });

  it('gate ROUGE: 0/3 conditions', () => {
    const db = getDb();
    const result = evaluateGate(db, gateUserId, 'final');
    expect(result.status).toBe('ROUGE');
    expect(result.conditions.filter(c => c.met)).toHaveLength(0);
  });

  it('gate ROUGE: only S12 mission submitted (1/3)', () => {
    const db = getDb();
    const subId = randomUUID();
    db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status)
      VALUES (?, ?, ?, ?, 'snapshot', 'submitted')`)
      .run(subId, s12GateMissionId, gateUserId, cohortId);
    const result = evaluateGate(db, gateUserId, 'final');
    expect(result.status).toBe('ROUGE');
    const met = result.conditions.filter(c => c.met);
    expect(met).toHaveLength(1);
  });

  it('gate ROUGE: S12 mission + S12 plan submitted, no continuity decision (2/3)', async () => {
    const db = getDb();
    await seedS11Submitted(gateUserId, 'go');
    const pdId = randomUUID();
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's12_continuity_plan', ?)`)
      .run(pdId, gateUserId, JSON.stringify({ status: 'submitted', ninety_day_goal: 'G' }));
    const result = evaluateGate(db, gateUserId, 'final');
    expect(result.status).toBe('ROUGE');
    const met = result.conditions.filter(c => c.met);
    expect(met).toHaveLength(2);
  });

  it('gate VERT: all 3 conditions satisfied', () => {
    const db = getDb();
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, status, sprint_number, cadre_step) VALUES (?, ?, 'continuity', 'Plan 90J', 'active', 12, 'E')`)
      .run(randomUUID(), gateUserId);
    const result = evaluateGate(db, gateUserId, 'final');
    expect(result.status).toBe('VERT');
    expect(result.conditions.filter(c => c.met)).toHaveLength(3);
  });

  it('old continuity decision NOT from sprint 12 does not satisfy gate condition', () => {
    const db = getDb();
    const antiBypassUid = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'AntiBypass', 0)`)
      .run(antiBypassUid, `s12antibypass+${antiBypassUid.slice(0, 6)}@test.local`, 'hash');
    // Insert a continuity decision with sprint_number = 11 (not 12)
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, status, sprint_number, cadre_step) VALUES (?, ?, 'continuity', 'Old Decision', 'active', 11, 'E')`)
      .run(randomUUID(), antiBypassUid);
    // S12 mission submitted
    const mId = randomUUID();
    db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'E', 12, 'M', 1, 0, ?)`)
      .run(mId, cohortId, adminId);
    db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status) VALUES (?, ?, ?, ?, '', 'submitted')`)
      .run(randomUUID(), mId, antiBypassUid, cohortId);
    // S12 plan submitted
    db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's12_continuity_plan', ?)`)
      .run(randomUUID(), antiBypassUid, JSON.stringify({ status: 'submitted' }));
    const result = evaluateGate(db, antiBypassUid, 'final');
    // Only 2 conditions met (mission + plan), not 3 — old decision from sprint 11 ignored
    expect(result.status).toBe('ROUGE');
    const met = result.conditions.filter(c => c.met);
    expect(met).toHaveLength(2);
  });
});

/* ── 9. Cockpit section ─────────────────────────────────────────── */
describe('S12 cockpit section', () => {
  beforeAll(async () => {
    const db = getDb();
    db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint)
      VALUES (?, ?, ?, 'E', 12, 1) ON CONFLICT(user_id, cohort_id) DO UPDATE SET sprint_number = 12, cadre_step = 'E'`)
      .run(randomUUID(), participantId, cohortId);
  });

  it('cockpit includes s12ContinuityPlan when sprint=12', async () => {
    const r = await request(app)
      .get('/api/cockpit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s12ContinuityPlan).not.toBeNull();
    expect(r.body.s12ContinuityPlan.status).toBe('submitted');
    expect(r.body.s12ContinuityPlan.ninetyDayGoal).toBeTruthy();
  });

  it('cockpit s11RealDecision is also visible at sprint=12', async () => {
    const r = await request(app)
      .get('/api/cockpit')
      .set('Cookie', participantCookies);
    expect(r.body.s11RealDecision).not.toBeNull();
    expect(r.body.s11RealDecision.decision).toBe('continue_tests');
  });
});

/* ── 10. COPILOTE S12 rules ─────────────────────────────────────── */
describe('S12 COPILOTE rules', () => {
  it('copilote.routes.js includes SPRINT 12 rules section', () => {
    expect(copiloteRouteSrc).toMatch(/SPRINT 12/);
  });

  it('includes GO adaptation', () => {
    expect(copiloteRouteSrc).toMatch(/poursuite progressive|GO.*poursuivr/i);
  });

  it('includes NO_GO adaptation', () => {
    expect(copiloteRouteSrc).toMatch(/fermeture propre|NO.GO.*fermer/i);
  });

  it('includes CONTINUE_TESTS adaptation', () => {
    expect(copiloteRouteSrc).toMatch(/CONTINUE_TESTS|continuer les tests/i);
  });

  it('includes epistemic doctrine PLAN≠PRÉDICTION', () => {
    expect(copiloteRouteSrc).toMatch(/PLAN.*PRÉDICTION|PLAN.*PREDICTION/i);
  });

  it('includes epistemic doctrine OBJECTIF≠GARANTIE', () => {
    expect(copiloteRouteSrc).toMatch(/OBJECTIF.*GARANTIE/i);
  });

  it('includes epistemic doctrine ENGAGEMENT≠CERTITUDE', () => {
    expect(copiloteRouteSrc).toMatch(/ENGAGEMENT.*CERTITUDE/i);
  });

  it('TU NE DOIS PAS includes no revenue guarantee', () => {
    expect(copiloteRouteSrc).toMatch(/garantir.*résultat|imposer.*revenu/i);
  });
});

/* ── 11. Non-regression: S11 data unaffected by S12 ─────────────── */
describe('S11 non-regression after S12', () => {
  it('S11 participant_data still exists with submitted status', () => {
    const db = getDb();
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's11_real_decision'`)
      .get(participantId);
    expect(row).toBeTruthy();
    const parsed = JSON.parse(row.content);
    expect(parsed.status).toBe('submitted');
    expect(parsed.decision).toBe('continue_tests');
  });

  it('S12 submit does not create a go_nogo decision', () => {
    const db = getDb();
    const dec = db.prepare(`SELECT COUNT(*) as n FROM decisions WHERE user_id = ? AND decision_type = 'go_nogo'`)
      .get(participantId);
    expect(dec.n).toBe(0);
  });

  it('continuity decision type exists and is distinct from go_nogo', () => {
    const db = getDb();
    const dec = db.prepare(`SELECT decision_type FROM decisions WHERE user_id = ? AND decision_type = 'continuity' AND sprint_number = 12`)
      .get(participantId);
    expect(dec).toBeTruthy();
    expect(dec.decision_type).toBe('continuity');
  });
});

/* ── 12. Migration 018: continuity in decisions table ───────────── */
describe('Migration 018: continuity decision_type', () => {
  it('can insert decision_type=continuity without constraint error', () => {
    const db = getDb();
    const id = randomUUID();
    expect(() => {
      db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, status) VALUES (?, ?, 'continuity', 'Test', 'active')`)
        .run(id, adminId);
    }).not.toThrow();
    db.prepare(`DELETE FROM decisions WHERE id = ?`).run(id);
  });

  it('rejects unknown decision_type', () => {
    const db = getDb();
    expect(() => {
      db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, status) VALUES (?, ?, 'unknown_type', 'Test', 'active')`)
        .run(randomUUID(), adminId);
    }).toThrow();
  });
});
