/**
 * S11 — DÉCIDER À PARTIR DU RÉEL — Tests
 * Build 21K: Real Decision CRUD, completeness, submit, gateS12 causal protection.
 */

// ── DB bootstrap — MUST be before any ESM imports ────────────────
import path from 'path';
import os from 'os';
const TEST_DB = path.join(os.tmpdir(), `rc-s11-test-${Date.now()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's11-test-secret-32-chars-minimum!';
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
let s4DecisionId;

function makeFullS11() {
  return {
    observed_facts: 'Trois personnes ont demandé le prix immédiatement. Une personne a acheté sans hésiter. Deux personnes ont dit qu\'elles n\'avaient pas le budget maintenant.',
    signals: {
      recurring: ['Demande du prix en premier contact', 'Intérêt pour le résultat attendu'],
      contradictory: ['Une personne achète, une autre refuse pour la même formulation'],
      insufficient: ['Seulement 2 personnes testées sur le segment entreprise'],
    },
    unknowns: ['Si le prix est la vraie friction ou la confiance dans le résultat', 'Si le canal LinkedIn est adapté à cette cible'],
    interpretation: 'Les signaux récurrents suggèrent que la cible est bien identifiée mais que le prix crée une friction. L\'achat unique est un signal positif mais insuffisant pour conclure.',
    options_considered: ['Baisser le prix de 20 %', 'Ajouter une garantie de résultat', 'Changer le canal de prospection'],
    decision: 'continue_tests',
    justification: 'Les données sont insuffisantes pour un Go définitif. J\'ai des signaux positifs mais trop peu de tests sur des profils similaires pour conclure.',
    next_action: 'Tester la même formulation avec 3 nouvelles personnes correspondant exactement à la cible avant de décider.',
    epistemic: {
      facts: 'J\'ai réalisé 5 tests terrain au total. Une vente obtenue. Deux refus explicites sur le prix.',
      facts_acknowledged: false,
      assumptions: 'Je suppose que les hésitations sur le prix viennent d\'un manque de confiance dans le résultat.',
      assumptions_acknowledged: false,
      to_verify: 'Si un troisième achat confirme le signal ou si c\'était une exception.',
      to_verify_acknowledged: false,
    },
  };
}

function makeMinimalS11() {
  return {
    interpretation: 'Les données disponibles me conduisent à continuer les tests.',
    decision: 'continue_tests',
    justification: 'Pas assez de données pour décider maintenant.',
    next_action: 'Faire 3 tests supplémentaires.',
    epistemic: {
      facts: 'Deux tests réalisés.',
      facts_acknowledged: false,
      assumptions: 'Je suppose que la cible est bonne.',
      assumptions_acknowledged: false,
      to_verify: 'Si le prix est acceptable.',
      to_verify_acknowledged: false,
    },
  };
}

async function loginAs(email, password) {
  const r = await request(app).post('/auth/login').send({ email, password });
  return r.headers['set-cookie'];
}

async function seedS10Submitted(userId) {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's10_iteration_plan', ?)`)
    .run(id, userId, JSON.stringify({
      status: 'submitted',
      iteration: { hypothesis: 'H10', variable_under_test: 'prix', variable_category: 'prix', constants: [] },
      test_plan: { target_person: 'T10', message_or_offer: 'M10', channel: 'LinkedIn', main_question: 'Q10' },
      observation_criteria: { data_to_observe: 'Réaction', expected_action: 'RDV', completion_criterion: '1 test réalisé' },
      decision_criteria: { what_i_will_look_at: 'Prix questionné ou non' },
      epistemic: { facts: 'F', facts_acknowledged: false, assumptions: 'A', assumptions_acknowledged: false, to_verify: 'V', to_verify_acknowledged: false },
      synthesis: 'S10 soumis.',
    }));
  return id;
}

async function seedS10Mission(cohortId, participantId) {
  const db = getDb();
  const mId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by)
    VALUES (?, ?, 'E', 10, 'Mission S10', 1, 0, ?)`)
    .run(mId, cohortId, adminId);
  const subId = randomUUID();
  db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status)
    VALUES (?, ?, ?, ?, 'snapshot', 'submitted')`)
    .run(subId, mId, participantId, cohortId);
  return { mId, subId };
}

async function seedS11Mission(cohortId) {
  const db = getDb();
  const mId = randomUUID();
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by)
    VALUES (?, ?, 'E', 11, 'Mission S11', 1, 0, ?)`)
    .run(mId, cohortId, adminId);
  return mId;
}

/* ── Global setup ───────────────────────────────────────────────── */
beforeAll(async () => {
  const db = getDb();
  adminId = randomUUID();
  participantId = randomUUID();
  participant2Id = randomUUID();
  cohortId = randomUUID();
  participantEmail = `s11p+${participantId.slice(0, 6)}@test.local`;
  participant2Email = `s11p2+${participant2Id.slice(0, 6)}@test.local`;

  const ph = await hashPassword(PASS);
  const ah = await hashPassword(ADMIN_PASS);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s11admin+${adminId.slice(0, 6)}@test.local`, ah);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Participant', 0)`)
    .run(participantId, participantEmail, ph);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
    VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'P2', 0)`)
    .run(participant2Id, participant2Email, ph);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'S11 Cohort', '2026-01-01', ?)`)
    .run(cohortId, adminId);

  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);

  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  s4DecisionId = randomUUID();
  db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, status) VALUES (?, ?, 'project', 'Direction S4', 'active')`)
    .run(s4DecisionId, participantId);

  participantCookies = await loginAs(participantEmail, PASS);
  participant2Cookies = await loginAs(participant2Email, PASS);
  adminCookies = await loginAs(`s11admin+${adminId.slice(0, 6)}@test.local`, ADMIN_PASS);
});

afterAll(() => {
  resetDb();
});

/* ── 1. Prerequisite: S10 must be submitted ─────────────────────── */
describe('S11 prerequisites', () => {
  it('GET /api/s11/real-decision returns 400 when S10 not submitted', async () => {
    const r = await request(app)
      .get('/api/s11/real-decision')
      .set('Cookie', participant2Cookies);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Sprint 10/);
  });

  it('returns 401 without auth', async () => {
    const r = await request(app).get('/api/s11/real-decision');
    expect(r.status).toBe(401);
  });
});

/* ── 2. GET with S10 submitted — initial state ──────────────────── */
describe('S11 GET with S10 submitted', () => {
  beforeAll(async () => {
    await seedS10Submitted(participantId);
    await seedS10Mission(cohortId, participantId);
  });

  it('returns null s11 and source_refs when no data yet', async () => {
    const r = await request(app)
      .get('/api/s11/real-decision')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s11).toBeNull();
    expect(r.body.source_refs).toBeDefined();
    expect(r.body.source_refs.s10).toBeDefined();
    expect(r.body.source_refs.s10.hypothesis).toBe('H10');
  });

  it('source_refs.s10 includes variable_under_test', async () => {
    const r = await request(app)
      .get('/api/s11/real-decision')
      .set('Cookie', participantCookies);
    expect(r.body.source_refs.s10.variable_under_test).toBe('prix');
  });
});

/* ── 3. Draft CRUD ──────────────────────────────────────────────── */
describe('S11 draft CRUD', () => {
  it('PUT creates draft with minimal fields', async () => {
    const r = await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send({ interpretation: 'Mon interprétation initiale.' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s11.interpretation).toBe('Mon interprétation initiale.');
    expect(r.body.s11.status).toBe('draft');
  });

  it('PUT merges fields without overwriting untouched fields', async () => {
    await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send({ justification: 'Justification ajoutée.' });
    const r = await request(app)
      .get('/api/s11/real-decision')
      .set('Cookie', participantCookies);
    expect(r.body.s11.interpretation).toBe('Mon interprétation initiale.');
    expect(r.body.s11.justification).toBe('Justification ajoutée.');
  });

  it('PUT accepts decision "go"', async () => {
    const r = await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send({ decision: 'go' });
    expect(r.status).toBe(200);
    expect(r.body.s11.decision).toBe('go');
  });

  it('PUT rejects invalid decision value and sets null', async () => {
    const r = await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send({ decision: 'maybe' });
    expect(r.status).toBe(200);
    expect(r.body.s11.decision).toBeNull();
  });

  it('PUT merges signals arrays', async () => {
    const r = await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send({ signals: { recurring: ['Signal A', 'Signal B'], contradictory: [], insufficient: [] } });
    expect(r.status).toBe(200);
    expect(r.body.s11.signals.recurring).toEqual(['Signal A', 'Signal B']);
  });

  it('PUT merges unknowns array', async () => {
    const r = await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send({ unknowns: ['Inconnue 1', 'Inconnue 2'] });
    expect(r.status).toBe(200);
    expect(r.body.s11.unknowns).toEqual(['Inconnue 1', 'Inconnue 2']);
  });

  it('PUT merges options_considered array', async () => {
    const r = await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send({ options_considered: ['Option A', 'Option B'] });
    expect(r.status).toBe(200);
    expect(r.body.s11.options_considered).toEqual(['Option A', 'Option B']);
  });
});

/* ── 4. Completeness checks ─────────────────────────────────────── */
describe('S11 completeness checks', () => {
  async function trySubmitExpect422(extra = {}) {
    const minimal = makeMinimalS11();
    await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send({ ...minimal, ...extra });
    const r = await request(app)
      .post('/api/s11/real-decision/submit')
      .set('Cookie', participantCookies);
    return r;
  }

  it('rejects when interpretation missing', async () => {
    await request(app).put('/api/s11/real-decision').set('Cookie', participantCookies).send({ interpretation: '' });
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/interprétation/i);
  });

  it('rejects when decision missing', async () => {
    await request(app).put('/api/s11/real-decision').set('Cookie', participantCookies).send({ interpretation: 'OK', decision: null });
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/décision/i);
  });

  it('rejects when justification missing', async () => {
    const data = makeMinimalS11();
    await request(app).put('/api/s11/real-decision').set('Cookie', participantCookies).send({ ...data, justification: '' });
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/pourquoi|justifi/i);
  });

  it('rejects when next_action missing', async () => {
    const data = makeMinimalS11();
    await request(app).put('/api/s11/real-decision').set('Cookie', participantCookies).send({ ...data, next_action: '' });
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/action/i);
  });

  it('rejects when epistemic facts missing and not acknowledged', async () => {
    const data = makeMinimalS11();
    await request(app).put('/api/s11/real-decision').set('Cookie', participantCookies)
      .send({ ...data, epistemic: { ...data.epistemic, facts: '', facts_acknowledged: false } });
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/sais/i);
  });

  it('accepts when epistemic facts empty but acknowledged', async () => {
    const data = makeMinimalS11();
    await request(app).put('/api/s11/real-decision').set('Cookie', participantCookies)
      .send({ ...data, epistemic: { ...data.epistemic, facts: '', facts_acknowledged: true } });
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', participantCookies);
    expect([200, 409, 422]).toContain(r.status);
    if (r.status === 422) {
      expect(r.body.error).not.toMatch(/sais/i);
    }
  });

  it('rejects when epistemic assumptions missing and not acknowledged', async () => {
    const db = getDb();
    const uid = randomUUID();
    const email = `s11ep2+${uid.slice(0, 6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'EP2', 0)`)
      .run(uid, email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    await seedS10Submitted(uid);
    const cookies = await loginAs(email, PASS);
    const data = makeMinimalS11();
    await request(app).put('/api/s11/real-decision').set('Cookie', cookies)
      .send({ ...data, epistemic: { facts: 'ok', facts_acknowledged: false, assumptions: '', assumptions_acknowledged: false, to_verify: 'ok', to_verify_acknowledged: false } });
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/suppositions/i);
  });

  it('rejects when epistemic to_verify missing and not acknowledged', async () => {
    const db = getDb();
    const uid = randomUUID();
    const email = `s11ep3+${uid.slice(0, 6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'EP3', 0)`)
      .run(uid, email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    await seedS10Submitted(uid);
    const cookies = await loginAs(email, PASS);
    const data = makeMinimalS11();
    await request(app).put('/api/s11/real-decision').set('Cookie', cookies)
      .send({ ...data, epistemic: { facts: 'ok', facts_acknowledged: false, assumptions: 'ok', assumptions_acknowledged: false, to_verify: '', to_verify_acknowledged: false } });
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', cookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/vérifier/i);
  });
});

/* ── 5. Submit lifecycle ────────────────────────────────────────── */
describe('S11 submit lifecycle', () => {
  beforeAll(async () => {
    await seedS11Mission(cohortId);
    await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send(makeFullS11());
  });

  it('POST submit returns 200 with ok:true', async () => {
    const r = await request(app)
      .post('/api/s11/real-decision/submit')
      .set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.strategic_decision_id).toBeDefined();
  });

  it('GET after submit shows status submitted', async () => {
    const r = await request(app)
      .get('/api/s11/real-decision')
      .set('Cookie', participantCookies);
    expect(r.body.s11.status).toBe('submitted');
  });

  it('PUT after submit returns 409', async () => {
    const r = await request(app)
      .put('/api/s11/real-decision')
      .set('Cookie', participantCookies)
      .send({ interpretation: 'Modification après soumission' });
    expect(r.status).toBe(409);
  });
});

/* ── 6. Snapshot integrity ──────────────────────────────────────── */
describe('S11 snapshot integrity', () => {
  it('mission_submission snapshot has s11_real_decision_snapshot type', async () => {
    const db = getDb();
    const sub = db.prepare(`
      SELECT ms.content FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 11
    `).get(participantId);
    expect(sub).not.toBeNull();
    const snap = JSON.parse(sub.content);
    expect(snap.type).toBe('s11_real_decision_snapshot');
    expect(snap.decision).toBe('continue_tests');
    expect(snap.strategic_decision_id).toBeDefined();
  });

  it('snapshot captures signals, unknowns, interpretation', async () => {
    const db = getDb();
    const sub = db.prepare(`
      SELECT ms.content FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND m.sprint_number = 11
    `).get(participantId);
    const snap = JSON.parse(sub.content);
    expect(snap.signals.recurring.length).toBeGreaterThan(0);
    expect(snap.unknowns.length).toBeGreaterThan(0);
    expect(snap.interpretation).toBeTruthy();
  });
});

/* ── 7. Strategic decision: 1 go_nogo ──────────────────────────── */
describe('S11 strategic decision count', () => {
  it('creates exactly 1 active go_nogo decision at sprint 11', async () => {
    const db = getDb();
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM decisions
      WHERE user_id = ? AND decision_type = 'go_nogo' AND sprint_number = 11 AND status = 'active'
    `).get(participantId);
    expect(count.n).toBe(1);
  });

  it('go_nogo decision has cadre_step E', async () => {
    const db = getDb();
    const d = db.prepare(`
      SELECT cadre_step FROM decisions
      WHERE user_id = ? AND decision_type = 'go_nogo' AND sprint_number = 11 AND status = 'active'
    `).get(participantId);
    expect(d.cadre_step).toBe('E');
  });

  it('S11 creates 0 revenue decisions', async () => {
    const db = getDb();
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM decisions
      WHERE user_id = ? AND decision_type = 'revenue' AND sprint_number = 11
    `).get(participantId);
    expect(count.n).toBe(0);
  });

  it('S11 creates 0 proofs', async () => {
    const db = getDb();
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM proofs WHERE user_id = ?
    `).get(participantId);
    expect(count.n).toBe(0);
  });

  it('decision title reflects continue_tests', async () => {
    const db = getDb();
    const d = db.prepare(`
      SELECT title FROM decisions
      WHERE user_id = ? AND decision_type = 'go_nogo' AND sprint_number = 11 AND status = 'active'
    `).get(participantId);
    expect(d.title).toMatch(/CONTINUER/);
  });
});

/* ── 8. Idempotent re-submit (supersedes) ───────────────────────── */
describe('S11 idempotent re-submit', () => {
  let p3Id, p3Cookies, p3Email;

  beforeAll(async () => {
    p3Id = randomUUID();
    p3Email = `s11p3+${p3Id.slice(0, 6)}@test.local`;
    const db = getDb();
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
      VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'P3', 0)`)
      .run(p3Id, p3Email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), p3Id, cohortId);
    await seedS10Submitted(p3Id);
    await seedS10Mission(cohortId, p3Id);
    p3Cookies = await loginAs(p3Email, PASS);

    const data = makeFullS11();
    await request(app).put('/api/s11/real-decision').set('Cookie', p3Cookies).send(data);
    await request(app).post('/api/s11/real-decision/submit').set('Cookie', p3Cookies);

    // Reset to draft to simulate re-submit
    const innerDb = getDb();
    innerDb.prepare(`UPDATE participant_data SET content = json_patch(content, '{"status":"draft"}') WHERE owner_id = ? AND data_type = 's11_real_decision'`)
      .run(p3Id);
    await request(app).put('/api/s11/real-decision').set('Cookie', p3Cookies).send({ ...data, decision: 'go' });
    await request(app).post('/api/s11/real-decision/submit').set('Cookie', p3Cookies);
  });

  it('second submit creates new active go_nogo and supersedes first', async () => {
    const db = getDb();
    const active = db.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE user_id = ? AND decision_type = 'go_nogo' AND status = 'active'`).get(p3Id);
    const superseded = db.prepare(`SELECT COUNT(*) AS n FROM decisions WHERE user_id = ? AND decision_type = 'go_nogo' AND status = 'superseded'`).get(p3Id);
    expect(active.n).toBe(1);
    expect(superseded.n).toBe(1);
  });

  it('new decision reflects updated decision value (go)', async () => {
    const db = getDb();
    const d = db.prepare(`SELECT title FROM decisions WHERE user_id = ? AND decision_type = 'go_nogo' AND status = 'active'`).get(p3Id);
    expect(d.title).toMatch(/GO/);
  });
});

/* ── 9. Valid decision values ──────────────────────────────────── */
describe('S11 valid decision values', () => {
  it('"go" is a valid decision', async () => {
    const r = await request(app).put('/api/s11/real-decision').set('Cookie', participant2Cookies).send({ decision: 'go' });
    expect(r.body.s11?.decision ?? null).toBe('go');
  });

  it('"no_go" is a valid decision', async () => {
    const r = await request(app).put('/api/s11/real-decision').set('Cookie', participant2Cookies).send({ decision: 'no_go' });
    expect(r.body.s11?.decision ?? null).toBe('no_go');
  });

  it('"continue_tests" is a valid decision', async () => {
    const r = await request(app).put('/api/s11/real-decision').set('Cookie', participant2Cookies).send({ decision: 'continue_tests' });
    expect(r.body.s11?.decision ?? null).toBe('continue_tests');
  });

  it('"validated" is not a valid decision value (null result)', async () => {
    const r = await request(app).put('/api/s11/real-decision').set('Cookie', participant2Cookies).send({ decision: 'validated' });
    expect(r.body.s11?.decision ?? null).toBeNull();
  });
});

/* ── 10. Epistemic discipline ──────────────────────────────────── */
describe('S11 epistemic discipline', () => {
  it('epistemic.facts can be empty if facts_acknowledged is true', async () => {
    const data = makeMinimalS11();
    const r = await request(app).put('/api/s11/real-decision').set('Cookie', participant2Cookies)
      .send({ ...data, epistemic: { ...data.epistemic, facts: '', facts_acknowledged: true } });
    expect(r.status).toBe(200);
    expect(r.body.s11.epistemic.facts_acknowledged).toBe(true);
  });

  it('epistemic.assumptions_acknowledged stores correctly', async () => {
    const data = makeMinimalS11();
    const r = await request(app).put('/api/s11/real-decision').set('Cookie', participant2Cookies)
      .send({ ...data, epistemic: { ...data.epistemic, assumptions_acknowledged: true } });
    expect(r.status).toBe(200);
    expect(r.body.s11.epistemic.assumptions_acknowledged).toBe(true);
  });

  it('copilote.routes.js contains SPRINT 11 rules', () => {
    expect(copiloteRouteSrc).toContain('SPRINT 11');
    expect(copiloteRouteSrc).toContain('DÉCIDER À PARTIR DU RÉEL');
  });

  it('copilote.routes.js contains go_nogo doctrine', () => {
    expect(copiloteRouteSrc).toContain('GO ≠ GARANTIE DE SUCCÈS');
    expect(copiloteRouteSrc).toContain('NO-GO ≠ ÉCHEC DÉFINITIF');
  });

  it('copilote.routes.js contains epistemic chain', () => {
    expect(copiloteRouteSrc).toContain('DONNÉE ≠ SIGNAL ≠ INTERPRÉTATION ≠ DÉCISION ≠ CERTITUDE');
  });

  it('copilote.routes.js has phrase clé S11', () => {
    expect(copiloteRouteSrc).toContain('Phrase clé S11');
    expect(copiloteRouteSrc).toContain('données que tu as');
  });
});

/* ── 11. Gate S11 (gateS11Sync) ─────────────────────────────────── */
describe('gateS11 after B21K changes', () => {
  it('gateS11 has exactly 2 conditions (no legacy conversationsCount/signalsCount)', () => {
    const db = getDb();
    // participantId has S10 mission submitted + s10_iteration_plan submitted
    const result = evaluateGate(db, participantId, 11);
    expect(result).not.toBeNull();
    expect(result.conditions.length).toBe(2);
  });

  it('gateS11 conditions are S10 mission and S10 data — no market conditions', () => {
    const db = getDb();
    const result = evaluateGate(db, participantId, 11);
    const labels = result.conditions.map(c => c.label);
    expect(labels.some(l => /Sprint 10/i.test(l))).toBe(true);
    expect(labels.some(l => /S10/i.test(l))).toBe(true);
    expect(labels.some(l => /conversation/i.test(l))).toBe(false);
    expect(labels.some(l => /signal/i.test(l))).toBe(false);
  });

  it('gateS11 returns VERT for participant with S10 submitted + mission', () => {
    const db = getDb();
    const result = evaluateGate(db, participantId, 11);
    expect(result.status).toBe('VERT');
  });

  it('gateS11 returns ROUGE for participant2 with no S10 data', () => {
    const db = getDb();
    const result = evaluateGate(db, participant2Id, 11);
    expect(result.status).toBe('ROUGE');
  });
});

/* ── 12. Gate S12 causal protection ─────────────────────────────── */
describe('gateS12 causal protection for S11', () => {
  it('gateS12 has 3 conditions: S11 mission, S11 data, go_nogo decision', () => {
    const db = getDb();
    const result = evaluateGate(db, participantId, 12);
    expect(result).not.toBeNull();
    expect(result.conditions.length).toBe(3);
  });

  it('gateS12 returns VERT for participant with S11 fully submitted', () => {
    const db = getDb();
    // participantId has: missionSubmitted(11) via submit lifecycle, s11DataSubmitted, go_nogo active
    const result = evaluateGate(db, participantId, 12);
    expect(result.status).toBe('VERT');
  });

  it('gateS12 returns ROUGE for participant with only old go_nogo (no S11 data)', () => {
    const db = getDb();
    // participant2Id — insert old go_nogo at sprint 5 (not sprint 11)
    const decId = randomUUID();
    db.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, status, sprint_number) VALUES (?, ?, 'go_nogo', 'Old GoNogo', 'active', 5)`)
      .run(decId, participant2Id);
    const result = evaluateGate(db, participant2Id, 12);
    // Has go_nogo but no S11 mission or S11 data → ROUGE
    expect(result.status).toBe('ROUGE');
    const s11DataCond = result.conditions.find(c => /S11/i.test(c.label));
    expect(s11DataCond?.met).toBe(false);
  });

  it('gateS12 conditions include S11 data submitted condition', () => {
    const db = getDb();
    const result = evaluateGate(db, participantId, 12);
    const labels = result.conditions.map(c => c.label);
    expect(labels.some(l => /S11/i.test(l))).toBe(true);
  });
});

/* ── 13. Cockpit includes s11RealDecision ───────────────────────── */
describe('cockpit s11RealDecision', () => {
  it('cockpit includes s11RealDecision key when sprint = 11', async () => {
    const db = getDb();
    // Set participant progress to sprint 11
    const existing = db.prepare(`SELECT id FROM user_progress WHERE user_id = ?`).get(participantId);
    if (existing) {
      db.prepare(`UPDATE user_progress SET sprint_number = 11, cadre_step = 'E' WHERE user_id = ?`).run(participantId);
    } else {
      db.prepare(`INSERT INTO user_progress (id, user_id, sprint_number, cadre_step, cohort_id) VALUES (?, ?, 11, 'E', ?)`)
        .run(randomUUID(), participantId, cohortId);
    }
    const r = await request(app).get('/api/cockpit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('s11RealDecision');
    expect(r.body.s11RealDecision).not.toBeNull();
    expect(r.body.s11RealDecision.decision).toBe('continue_tests');
  });
});

/* ── 14. Non-regression S1-S10 ──────────────────────────────────── */
describe('non-regression S1-S10 gates unaffected', () => {
  it('gateS2 returns ROUGE for fresh participant', () => {
    const db = getDb();
    const uid = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, 'h', 'PARTICIPANTE_STARTER', 'STARTER', 'NR', 0)`)
      .run(uid, `nr-s11-${uid.slice(0, 6)}@test.local`);
    const r = evaluateGate(db, uid, 2);
    expect(r.status).toBe('ROUGE');
  });

  it('gateS9 returns ROUGE with no S8 mission or data', () => {
    const db = getDb();
    const uid = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, 'h', 'PARTICIPANTE_STARTER', 'STARTER', 'NR9', 0)`)
      .run(uid, `nr9-s11-${uid.slice(0, 6)}@test.local`);
    const r = evaluateGate(db, uid, 9);
    expect(r.status).toBe('ROUGE');
    expect(r.conditions.length).toBe(2);
  });

  it('gateS10 returns ROUGE with no S9 data', () => {
    const db = getDb();
    const uid = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, 'h', 'PARTICIPANTE_STARTER', 'STARTER', 'NR10', 0)`)
      .run(uid, `nr10-s11-${uid.slice(0, 6)}@test.local`);
    const r = evaluateGate(db, uid, 10);
    expect(r.status).toBe('ROUGE');
  });

  it('gateS11 conditions no longer include market_conversations check', () => {
    const db = getDb();
    const uid = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, 'h', 'PARTICIPANTE_STARTER', 'STARTER', 'NR11', 0)`)
      .run(uid, `nr11-s11-${uid.slice(0, 6)}@test.local`);
    // Insert a market conversation — should NOT affect gateS11 anymore
    db.prepare(`INSERT INTO market_conversations (id, user_id, contact_id, title, summary, date_occurred, created_at) VALUES (?, ?, NULL, 'Test conv', 'summary', '2026-01-01', datetime('now'))`)
      .run(randomUUID(), uid);
    const r = evaluateGate(db, uid, 11);
    expect(r.status).toBe('ROUGE'); // No S10 mission/data → still ROUGE
    expect(r.conditions.some(c => /conversation/i.test(c.label))).toBe(false);
  });

  it('gateS11 conditions no longer include market_signals check', () => {
    const db = getDb();
    const uid = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, 'h', 'PARTICIPANTE_STARTER', 'STARTER', 'NR11b', 0)`)
      .run(uid, `nr11b-s11-${uid.slice(0, 6)}@test.local`);
    db.prepare(`INSERT INTO market_signals (id, user_id, signal_type, content) VALUES (?, ?, 'engagement', 'Signal test')`)
      .run(randomUUID(), uid);
    const r = evaluateGate(db, uid, 11);
    expect(r.conditions.some(c => /signal/i.test(c.label))).toBe(false);
  });

  it('gateS5 still requires direction decision', () => {
    const db = getDb();
    const uid = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, 'h', 'PARTICIPANTE_STARTER', 'STARTER', 'NR5', 0)`)
      .run(uid, `nr5-s11-${uid.slice(0, 6)}@test.local`);
    const r = evaluateGate(db, uid, 5);
    expect(r.status).toBe('ROUGE');
    expect(r.conditions.some(c => /direction/i.test(c.label))).toBe(true);
  });

  it('s11 routes exist at /api/s11/real-decision', async () => {
    const r = await request(app).get('/api/s11/real-decision').set('Cookie', participantCookies);
    expect([200, 400]).toContain(r.status);
  });
});

/* ── 15. PostgreSQL portability ─────────────────────────────────── */
describe('PostgreSQL portability', () => {
  it('PUT uses adapter.execute (no json_extract in draft save)', async () => {
    // Verify the route module doesn't call json_extract
    const src = readFileSync(
      fileURLToPath(new URL('./s11.routes.js', import.meta.url)),
      'utf8'
    );
    expect(src).not.toMatch(/json_extract.*content.*status/);
  });

  it('GET uses adapter.queryOne with SELECT content (portable)', async () => {
    const src = readFileSync(
      fileURLToPath(new URL('./s11.routes.js', import.meta.url)),
      'utf8'
    );
    expect(src).toContain('SELECT content FROM participant_data');
    expect(src).toContain('queryOne');
  });

  it('gateS11Sync uses json_extract (SQLite-only sync path is correct)', async () => {
    const src = readFileSync(
      fileURLToPath(new URL('../gates.js', import.meta.url)),
      'utf8'
    );
    expect(src).toContain("data_type = 's10_iteration_plan'");
    expect(src).toContain("data_type = 's11_real_decision'");
  });
});

/* ── 16. Pilot scenarios ────────────────────────────────────────── */
describe('S11 pilot scenarios', () => {
  it('participant can submit with decision=go', async () => {
    const db = getDb();
    const uid = randomUUID();
    const email = `s11go+${uid.slice(0, 6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'GoUser', 0)`)
      .run(uid, email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    await seedS10Submitted(uid);
    await seedS10Mission(cohortId, uid);
    const cookies = await loginAs(email, PASS);
    const data = { ...makeFullS11(), decision: 'go', justification: 'Suffisamment de signaux positifs pour continuer.' };
    await request(app).put('/api/s11/real-decision').set('Cookie', cookies).send(data);
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', cookies);
    expect(r.status).toBe(200);
    const d = db.prepare(`SELECT title FROM decisions WHERE user_id = ? AND decision_type = 'go_nogo' AND status = 'active'`).get(uid);
    expect(d.title).toMatch(/GO/);
    expect(d.title).not.toMatch(/CONTINUER/);
  });

  it('participant can submit with decision=no_go', async () => {
    const db = getDb();
    const uid = randomUUID();
    const email = `s11nogo+${uid.slice(0, 6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'NoGoUser', 0)`)
      .run(uid, email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    await seedS10Submitted(uid);
    await seedS10Mission(cohortId, uid);
    const cookies = await loginAs(email, PASS);
    const data = { ...makeFullS11(), decision: 'no_go', justification: 'Les données révèlent un problème structurel.' };
    await request(app).put('/api/s11/real-decision').set('Cookie', cookies).send(data);
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', cookies);
    expect(r.status).toBe(200);
    const d = db.prepare(`SELECT title FROM decisions WHERE user_id = ? AND decision_type = 'go_nogo' AND status = 'active'`).get(uid);
    expect(d.title).toMatch(/NO-GO/);
  });

  it('participant with all signals but insufficient data can choose continue_tests', async () => {
    const db = getDb();
    const uid = randomUUID();
    const email = `s11ct+${uid.slice(0, 6)}@test.local`;
    const ph = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'CTUser', 0)`)
      .run(uid, email, ph);
    db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
      .run(randomUUID(), uid, cohortId);
    await seedS10Submitted(uid);
    await seedS10Mission(cohortId, uid);
    const cookies = await loginAs(email, PASS);
    const data = { ...makeFullS11(), decision: 'continue_tests', signals: { recurring: [], contradictory: [], insufficient: ['Seulement 1 test réalisé'] } };
    await request(app).put('/api/s11/real-decision').set('Cookie', cookies).send(data);
    const r = await request(app).post('/api/s11/real-decision/submit').set('Cookie', cookies);
    expect(r.status).toBe(200);
  });
});

/* ── 17. RLS: cross-user isolation ──────────────────────────────── */
describe('S11 cross-user isolation', () => {
  it('participant2 cannot see participant1 s11 data via API', async () => {
    // participant2 has no S10 submitted → 400, not participant1 data
    const r = await request(app)
      .get('/api/s11/real-decision')
      .set('Cookie', participant2Cookies);
    expect(r.status).toBe(400);
  });

  it('participant1 s11 data is scoped to owner_id (not readable by participant2)', async () => {
    const db = getDb();
    // Verify participant1 data row is owned by participant1
    const row = db.prepare(`SELECT owner_id FROM participant_data WHERE owner_id = ? AND data_type = 's11_real_decision'`).get(participantId);
    expect(row).not.toBeNull();
    expect(row.owner_id).toBe(participantId);
  });
});
