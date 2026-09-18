/**
 * S5 — TA CIBLE & SON PROBLÈME — Tests
 * Build 21E: Target & Problem CRUD, completeness, submit, gate S6, COPILOTE rules.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const TEST_DB = path.join(os.tmpdir(), `rc-s5-test-${randomUUID()}.db`);
process.env.NODE_ENV        = 'test';
process.env.DB_PATH         = TEST_DB;
process.env.JWT_SECRET      = 's5-test-secret-32-chars-minimum!!';
process.env.JWT_EXPIRES_IN  = '1h';
process.env.COOKIE_SECURE   = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';

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

// IDs for assertions
let s4DecisionId;

function makeCompleteS5() {
  return {
    target_test: {
      who: 'Femmes salariées 35-50 ans en reconversion professionnelle',
      situation: 'Elles travaillent à temps plein et veulent lancer un projet en parallèle',
      recognition_signals: 'Elles parlent de "vouloir avoir leur propre truc", ont essayé des formations sans les finir',
      access_places: 'Groupes Facebook reconversion, LinkedIn, réseau personnel',
    },
    five_person_test: {
      answer: 'yes',
      diagnosis: [],
      note: '',
    },
    problem_to_investigate: {
      situation: 'Quand elles décident de se lancer, elles ne savent pas par où commencer',
      difficulty: 'Elles semblent débordées par les choix et manqueraient de méthode pour prioriser',
      consequence: 'Elles repourtent indéfiniment leur projet',
      why_investigate: 'Si ce problème est récurrent, il y a peut-être quelque chose à proposer',
    },
    epistemic: {
      facts: 'J\'ai discuté avec 3 femmes en reconversion qui ont mentionné ce problème',
      facts_acknowledged: false,
      assumptions: 'Je suppose que ce manque de méthode est fréquent',
      assumptions_acknowledged: false,
      to_verify: 'Est-ce que ces femmes cherchent activement une solution ?',
      to_verify_acknowledged: false,
    },
    synthesis: 'Investiguer si les femmes salariées en reconversion manquent d\'une méthode structurée.',
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
  participantEmail = `s5p+${participantId.slice(0,6)}@ex.com`;
  participant2Email = `s5p2+${participant2Id.slice(0,6)}@ex.com`;

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', 0)`)
    .run(adminId, `s5admin@ex.com`, adminHash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Sarah', 0)`)
    .run(participantId, participantEmail, hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Marie', 0)`)
    .run(participant2Id, participant2Email, hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?, 'Pilot S5', '2026-01-01', ?)`)
    .run(cohortId, adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`)
    .run(randomUUID(), participant2Id, cohortId);

  /* Participants at sprint 5 */
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 5, 1, 'in_progress')`)
    .run(randomUUID(), participantId, cohortId);
  db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 5, 1, 'in_progress')`)
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

  /* Mission for sprint 5 */
  db.prepare(`INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, is_required, sort_order, created_by) VALUES (?, ?, 'A', 5, 'Cible Test & Problème', 1, 0, ?)`)
    .run(randomUUID(), cohortId, adminId);

  const r1 = await request(app).post('/auth/login').send({ email: participantEmail, password: PASS });
  participantCookies = r1.headers['set-cookie'];
  const r2 = await request(app).post('/auth/login').send({ email: participant2Email, password: PASS });
  participant2Cookies = r2.headers['set-cookie'];
  const r3 = await request(app).post('/auth/login').send({ email: 's5admin@ex.com', password: ADMIN_PASS });
  adminCookies = r3.headers['set-cookie'];
});

afterAll(() => {
  try { import('fs').then(({ unlinkSync }) => unlinkSync(TEST_DB)); } catch {}
  resetDb();
});

/* ── 1. GET /api/s5/target-problem ────────────────────────────────── */
describe('GET /api/s5/target-problem', () => {
  it('1. requires auth', async () => {
    const r = await request(app).get('/api/s5/target-problem');
    expect(r.status).toBe(401);
  });

  it('2. returns 400 when no active direction', async () => {
    /* Create user without active S4 direction */
    const db = getDb(TEST_DB);
    const nodir = randomUUID();
    const nodirEmail = `s5nodir+${nodir.slice(0,6)}@ex.com`;
    const hash = await hashPassword(PASS);
    db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Nodir', 0)`)
      .run(nodir, nodirEmail, hash);
    db.prepare(`INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status) VALUES (?, ?, ?, 'A', 5, 1, 'in_progress')`)
      .run(randomUUID(), nodir, cohortId);
    const lr = await request(app).post('/auth/login').send({ email: nodirEmail, password: PASS });
    const nodirCookies = lr.headers['set-cookie'];
    const r = await request(app).get('/api/s5/target-problem').set('Cookie', nodirCookies);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/direction/i);
  });

  it('3. returns direction_ref prefill from S4 when no s5 yet', async () => {
    const r = await request(app).get('/api/s5/target-problem').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s5).toBeNull();
    expect(r.body.direction_ref).not.toBeNull();
    expect(r.body.direction_ref.decision_id).toBe(s4DecisionId);
  });

  it('3b. direction_ref contains correct S4 fields', async () => {
    const r = await request(app).get('/api/s5/target-problem').set('Cookie', participantCookies);
    expect(r.body.direction_ref.formulation).toContain('femmes salariées');
    expect(r.body.direction_ref.person).toBeTruthy();
    expect(r.body.direction_ref.problem).toBeTruthy();
  });
});

/* ── 2. PUT /api/s5/target-problem — draft save ─────────────────── */
describe('PUT /api/s5/target-problem', () => {
  it('4. saves draft successfully', async () => {
    const r = await request(app).put('/api/s5/target-problem')
      .set('Cookie', participantCookies)
      .send({ target_test: { who: 'Femmes 35-50 ans en reconversion' } });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.s5.status).toBe('draft');
    expect(r.body.s5.target_test.who).toBe('Femmes 35-50 ans en reconversion');
  });

  it('5. draft persists on reload', async () => {
    const r = await request(app).get('/api/s5/target-problem').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s5).not.toBeNull();
    expect(r.body.s5.target_test.who).toBe('Femmes 35-50 ans en reconversion');
  });
});

/* ── 3. POST submit — completeness ───────────────────────────────── */
describe('POST /api/s5/target-problem/submit — completeness validation', () => {
  it('21. incomplete submit rejected', async () => {
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
  });

  it('6. target.who required', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), target_test: { ...makeCompleteS5().target_test, who: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/cible/i);
  });

  it('7. target.situation required', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), target_test: { ...makeCompleteS5().target_test, who: 'Femmes 35-50', situation: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/situation/i);
  });

  it('8. recognition_signals required', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), target_test: { ...makeCompleteS5().target_test, recognition_signals: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/reconnaître|cible/i);
  });

  it('9. access_places required', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), target_test: { ...makeCompleteS5().target_test, access_places: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/trouver|accès/i);
  });

  it('10. five_person_test.answer required', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), five_person_test: { answer: null, diagnosis: [], note: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/Test des 5/i);
  });

  it('11. answer=yes accepted without diagnosis', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), five_person_test: { answer: 'yes', diagnosis: [], note: '' } });
    // don't submit yet — just verify no error on that field; full submit tested later
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's5_target_problem'`).get(participantId);
    const content = JSON.parse(row.content);
    expect(content.five_person_test.answer).toBe('yes');
  });

  it('12. answer=unsure without diagnosis or note → 422', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), five_person_test: { answer: 'unsure', diagnosis: [], note: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/diagnostic/i);
  });

  it('13. answer=no without diagnosis or note → 422', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), five_person_test: { answer: 'no', diagnosis: [], note: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/diagnostic/i);
  });

  it('14. problem.situation required', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), problem_to_investigate: { ...makeCompleteS5().problem_to_investigate, situation: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/situation/i);
  });

  it('15. problem.difficulty required', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), problem_to_investigate: { ...makeCompleteS5().problem_to_investigate, difficulty: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/difficulté/i);
  });

  it('16. problem.consequence required', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), problem_to_investigate: { ...makeCompleteS5().problem_to_investigate, consequence: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/conséquence/i);
  });

  it('17. problem.why_investigate required', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), problem_to_investigate: { ...makeCompleteS5().problem_to_investigate, why_investigate: '' } });
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/investiguer/i);
  });

  it('18. facts content OR acknowledged accepted', async () => {
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies)
      .send({ ...makeCompleteS5(), epistemic: { ...makeCompleteS5().epistemic, facts: '', facts_acknowledged: true } });
    // No 422 expected for that field (full submit tested below with complete data)
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's5_target_problem'`).get(participantId);
    const content = JSON.parse(row.content);
    expect(content.epistemic.facts_acknowledged).toBe(true);
  });

  it('19. assumptions content OR acknowledged accepted', async () => {
    const data = { ...makeCompleteS5(), epistemic: { ...makeCompleteS5().epistemic, assumptions: '', assumptions_acknowledged: true } };
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies).send(data);
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's5_target_problem'`).get(participantId);
    const content = JSON.parse(row.content);
    expect(content.epistemic.assumptions_acknowledged).toBe(true);
  });

  it('20. to_verify content OR acknowledged accepted', async () => {
    const data = { ...makeCompleteS5(), epistemic: { ...makeCompleteS5().epistemic, to_verify: '', to_verify_acknowledged: true } };
    await request(app).put('/api/s5/target-problem').set('Cookie', participantCookies).send(data);
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's5_target_problem'`).get(participantId);
    const content = JSON.parse(row.content);
    expect(content.epistemic.to_verify_acknowledged).toBe(true);
  });
});

/* ── 4. POST submit — successful ─────────────────────────────────── */
describe('POST /api/s5/target-problem/submit — successful', () => {
  let submissionId;

  beforeAll(async () => {
    // Set complete state
    await request(app).put('/api/s5/target-problem')
      .set('Cookie', participantCookies)
      .send(makeCompleteS5());
  });

  it('22. complete submit succeeds', async () => {
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    if (r.body.submission) submissionId = r.body.submission.id;
  });

  it('23. snapshot is correct type and contains all fields', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`SELECT * FROM mission_submissions WHERE user_id = ? AND status = 'submitted'`).get(participantId);
    expect(sub).not.toBeNull();
    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s5_target_problem_snapshot');
    expect(content.target_test).not.toBeNull();
    expect(content.five_person_test).not.toBeNull();
    expect(content.problem_to_investigate).not.toBeNull();
    expect(content.epistemic).not.toBeNull();
    expect(content.direction_ref).not.toBeNull();
    expect(content.submitted_at).toBeTruthy();
  });

  it('24. mission sprint_number=5', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`
      SELECT ms.*, m.sprint_number FROM mission_submissions ms
      JOIN missions m ON m.id = ms.mission_id
      WHERE ms.user_id = ? AND ms.status = 'submitted'
    `).get(participantId);
    expect(sub).not.toBeNull();
    expect(sub.sprint_number).toBe(5);
  });

  it('25. status=submitted after submit', async () => {
    const db = getDb(TEST_DB);
    const row = db.prepare(`SELECT content FROM participant_data WHERE owner_id = ? AND data_type = 's5_target_problem'`).get(participantId);
    const content = JSON.parse(row.content);
    expect(content.status).toBe('submitted');
    expect(content.submitted_at).toBeTruthy();
  });

  it('26. NO persona decision created', async () => {
    const db = getDb(TEST_DB);
    const personas = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND decision_type = 'persona'`).all(participantId);
    expect(personas).toHaveLength(0);
  });

  it('27. NO new decision created (S4 direction unchanged count)', async () => {
    const db = getDb(TEST_DB);
    const decisions = db.prepare(`SELECT * FROM decisions WHERE user_id = ?`).all(participantId);
    // Only the pre-existing S4 project decision
    expect(decisions).toHaveLength(1);
    expect(decisions[0].decision_type).toBe('project');
  });

  it('28. S4 direction unchanged (still active)', async () => {
    const db = getDb(TEST_DB);
    const dec = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(s4DecisionId);
    expect(dec.status).toBe('active');
  });

  it('29. NO supersession', async () => {
    const db = getDb(TEST_DB);
    const superseded = db.prepare(`SELECT * FROM decisions WHERE user_id = ? AND status = 'superseded'`).all(participantId);
    expect(superseded).toHaveLength(0);
  });

  it('30. NO proof created', async () => {
    const db = getDb(TEST_DB);
    const proofs = db.prepare(`SELECT * FROM proofs WHERE user_id = ?`).all(participantId);
    expect(proofs).toHaveLength(0);
  });

  it('31. audit event written', async () => {
    const db = getDb(TEST_DB);
    const audit = db.prepare(`SELECT * FROM audit_events WHERE actor_id = ? AND event_type = 's5_target_problem_submitted' ORDER BY created_at DESC LIMIT 1`).get(participantId);
    expect(audit).not.toBeNull();
    const after = JSON.parse(audit.after_state);
    expect(after.direction_decision_id).toBe(s4DecisionId);
  });

  it('32. re-submit updates existing submission (no duplicate)', async () => {
    const db = getDb(TEST_DB);

    // First, un-submit to allow re-submission test (reset to draft)
    const rowBefore = db.prepare(`SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's5_target_problem'`).get(participantId);
    const updated = { ...JSON.parse(rowBefore.content), status: 'draft', submitted_at: null };
    db.prepare(`UPDATE participant_data SET content = ? WHERE id = ?`).run(JSON.stringify(updated), rowBefore.id);

    // Submit again
    const r = await request(app).post('/api/s5/target-problem/submit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);

    const subs = db.prepare(`SELECT * FROM mission_submissions WHERE user_id = ?`).all(participantId);
    expect(subs.length).toBe(1); // still only one
  });

  it('33. admin can read snapshot', async () => {
    const db = getDb(TEST_DB);
    const sub = db.prepare(`SELECT * FROM mission_submissions WHERE user_id = ?`).get(participantId);
    expect(sub).not.toBeNull();
    const content = JSON.parse(sub.content);
    expect(content.type).toBe('s5_target_problem_snapshot');
  });
});

/* ── 5. PUT blocked after submit ─────────────────────────────────── */
describe('PUT /api/s5/target-problem — blocked after submit', () => {
  it('PUT blocked after submitted (409)', async () => {
    const r = await request(app).put('/api/s5/target-problem')
      .set('Cookie', participantCookies)
      .send({ target_test: { who: 'Nouvelle tentative' } });
    expect(r.status).toBe(409);
  });
});

/* ── 6. Cockpit s5TargetProblem ───────────────────────────────────── */
describe('GET /api/cockpit — s5TargetProblem', () => {
  it('34. cockpit returns s5TargetProblem when at sprint 5', async () => {
    const r = await request(app).get('/api/cockpit').set('Cookie', participantCookies);
    expect(r.status).toBe(200);
    expect(r.body.s5TargetProblem).not.toBeNull();
    expect(r.body.s5TargetProblem.status).toBe('submitted');
    expect(r.body.s5TargetProblem.targetWho).toBeTruthy();
    expect(r.body.s5TargetProblem.fivePersonAnswer).toBe('yes');
  });
});

/* ── helpers for gate tests ────────────────────────────────────── */
function insertGateUser(db, suffix) {
  const uid = randomUUID();
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, 'hash', 'PARTICIPANTE_STARTER', 'STARTER', 'G6', 0)`)
    .run(uid, `s5gate_${suffix}_${uid.slice(0,6)}@ex.com`);
  return uid;
}
function insertMission5Sub(db, uid, cohort) {
  const missionId = db.prepare(`SELECT id FROM missions WHERE sprint_number = 5 LIMIT 1`).get()?.id;
  if (!missionId) return false;
  db.prepare(`INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', 'submitted', datetime('now'), datetime('now'))`)
    .run(randomUUID(), missionId, uid, cohort ?? '');
  return true;
}
function insertS5ParticipantData(db, uid, submitted = true) {
  const content = JSON.stringify({ version: 1, status: submitted ? 'submitted' : 'draft', target_test: { who: 'qui', situation: 's', recognition_signals: 'r', access_places: 'a' } });
  db.prepare(`INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, 's5_target_problem', ?)`)
    .run(randomUUID(), uid, content);
}

/* ── 7. Gate S6 ───────────────────────────────────────────────────── */
describe('Gate S6 — missionSubmitted(5) AND s5DataSubmitted', () => {
  let rawDb;

  beforeAll(() => { rawDb = getDb(TEST_DB); });

  /* Case A: participant_data S5 complete but no mission → ROUGE */
  it('A. participant_data S5 complète, aucune mission → ROUGE (sync)', () => {
    const uid = insertGateUser(rawDb, 'A');
    insertS5ParticipantData(rawDb, uid, true);
    const gate = evaluateGate(rawDb, uid, 6);
    expect(gate.status).toBe('ROUGE');
    expect(gate.missing).toContain('Sprint 5 complete');
  });

  /* Case B: mission submitted but participant_data absent → ROUGE */
  it('B. mission S5 submitted, participant_data absente → ROUGE (sync)', () => {
    const uid = insertGateUser(rawDb, 'B');
    const inserted = insertMission5Sub(rawDb, uid, cohortId);
    if (!inserted) return; // skip if no mission fixture
    const gate = evaluateGate(rawDb, uid, 6);
    expect(gate.status).toBe('ROUGE');
    expect(gate.missing).toContain('Cible test S5 soumise');
  });

  it('B. mission S5 submitted, participant_data absente → ROUGE (async)', async () => {
    const uid = insertGateUser(rawDb, 'Basync');
    const inserted = insertMission5Sub(rawDb, uid, cohortId);
    if (!inserted) return;
    const db = getAdapter();
    const gate = await evaluateGate(db, uid, 6);
    expect(gate.status).toBe('ROUGE');
  });

  /* Case C: mission submitted but participant_data draft (incomplete) → ROUGE */
  it('C. mission S5 submitted, participant_data draft → ROUGE (sync)', () => {
    const uid = insertGateUser(rawDb, 'C');
    const inserted = insertMission5Sub(rawDb, uid, cohortId);
    if (!inserted) return;
    insertS5ParticipantData(rawDb, uid, false); // draft, not submitted
    const gate = evaluateGate(rawDb, uid, 6);
    expect(gate.status).toBe('ROUGE');
    expect(gate.missing).toContain('Cible test S5 soumise');
  });

  /* Case D: mission submitted + participant_data submitted → VERT */
  it('D. mission S5 submitted + participant_data submitted → VERT (sync)', () => {
    const uid = insertGateUser(rawDb, 'D');
    const inserted = insertMission5Sub(rawDb, uid, cohortId);
    if (!inserted) return;
    insertS5ParticipantData(rawDb, uid, true);
    const gate = evaluateGate(rawDb, uid, 6);
    expect(gate.status).toBe('VERT');
    expect(gate.missing).toHaveLength(0);
  });

  it('D. mission S5 submitted + participant_data submitted → VERT (async)', async () => {
    const uid = insertGateUser(rawDb, 'Dasync');
    const inserted = insertMission5Sub(rawDb, uid, cohortId);
    if (!inserted) return;
    insertS5ParticipantData(rawDb, uid, true);
    const db = getAdapter();
    const gate = await evaluateGate(db, uid, 6);
    expect(gate.status).toBe('VERT');
  });

  /* Case E: persona decision alone → ROUGE */
  it('E. persona decision seule → ROUGE', () => {
    const uid = insertGateUser(rawDb, 'E');
    rawDb.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at) VALUES (?, ?, 'persona', 'P', '{}', '', 5, 'A', 'active', '', '', '{}', datetime('now'))`)
      .run(randomUUID(), uid);
    const gate = evaluateGate(rawDb, uid, 6);
    expect(gate.status).toBe('ROUGE');
  });

  /* Case F: Direction S4 alone → ROUGE */
  it('F. Direction S4 seule → ROUGE', () => {
    const uid = insertGateUser(rawDb, 'F');
    rawDb.prepare(`INSERT INTO decisions (id, user_id, decision_type, title, context, rationale, sprint_number, cadre_step, status, facts_used, hypotheses, reopening_condition, created_at) VALUES (?, ?, 'project', 'D', '{}', '', 4, 'A', 'active', '', '', '{}', datetime('now'))`)
      .run(randomUUID(), uid);
    const gate = evaluateGate(rawDb, uid, 6);
    expect(gate.status).toBe('ROUGE');
  });

  /* Case G: weekly review alone → ROUGE */
  it('G. aucun état S5 → ROUGE (gate has 2 conditions)', () => {
    const uid = insertGateUser(rawDb, 'G');
    const gate = evaluateGate(rawDb, uid, 6);
    expect(gate.status).toBe('ROUGE');
    expect(gate.conditions).toHaveLength(2);
  });

  /* Case H: mission + 0 persona + participant_data submitted → VERT */
  it('H. mission S5 valide + 0 persona + participant_data soumise → VERT', () => {
    const uid = insertGateUser(rawDb, 'H');
    const inserted = insertMission5Sub(rawDb, uid, cohortId);
    if (!inserted) return;
    insertS5ParticipantData(rawDb, uid, true);
    // Verify NO persona decision exists
    const decisions = rawDb.prepare(`SELECT * FROM decisions WHERE user_id = ? AND decision_type = 'persona'`).all(uid);
    expect(decisions).toHaveLength(0);
    const gate = evaluateGate(rawDb, uid, 6);
    expect(gate.status).toBe('VERT');
  });

  /* Gate has exactly 2 conditions */
  it('gate S6 has exactly 2 conditions', () => {
    const uid = insertGateUser(rawDb, 'cond2');
    const gate = evaluateGate(rawDb, uid, 6);
    expect(gate.conditions).toHaveLength(2);
    expect(gate.conditions.map(c => c.label)).toContain('Sprint 5 complete');
    expect(gate.conditions.map(c => c.label)).toContain('Cible test S5 soumise');
  });
});

/* ── 8. COPILOTE S5 rules ─────────────────────────────────────────── */
describe('COPILOTE — S5 rules present in source', () => {
  it('S5 section present', () => {
    expect(copiloteRouteSrc).toContain('SPRINT 5');
  });

  it('cible validation prohibition', () => {
    expect(copiloteRouteSrc).toContain('Déclarer une cible');
    expect(copiloteRouteSrc).toContain('validée');
  });

  it('problème validation prohibition', () => {
    expect(copiloteRouteSrc).toContain('Déclarer un problème');
  });

  it('hypothesis ≠ fact rule', () => {
    expect(copiloteRouteSrc).toContain('hypothèse, pas comme un fait');
  });

  it('Test des 5 diagnostic', () => {
    expect(copiloteRouteSrc).toContain('Test des 5');
  });

  it('no fictional avatar', () => {
    expect(copiloteRouteSrc).toContain('persona fictive');
  });

  it('no direction change', () => {
    expect(copiloteRouteSrc).toContain('Direction S4');
  });

  it('no invented market data', () => {
    expect(copiloteRouteSrc).toContain('données marché');
  });
});
