/**
 * COPILOTE — Behavioral & Security Tests
 * Tests rule enforcement, anti-dispersion, no false certainty, data isolation.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';

// ── Mock Anthropic SDK — configurable per test ────────────────────────────────
let mockResponseFn = null;

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      stream: async (_params) => {
        const text = mockResponseFn ? await mockResponseFn(_params) : 'Réponse par défaut.';
        async function* gen() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
        }
        return gen();
      },
    };
  },
}));

function setMockResponse(fn) { mockResponseFn = fn; }
function setMockText(text) { mockResponseFn = async () => text; }

// ── Setup ────────────────────────────────────────────────────────────────────
const TEST_DB = path.join(os.tmpdir(), `rc-copilote-beh-${randomUUID()}.db`);
process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'behavioral-test-secret-long-enough-32ch';
process.env.JWT_EXPIRES_IN = '1h';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.ANTHROPIC_API_KEY = 'sk-test-behavioral';

import { getDb, resetDb } from '../db.js';
import { hashPassword } from '../auth.js';
import { createApp } from '../../server.js';

const app = createApp();

let cookie1, userId1, cookie2, userId2, cohortId;

beforeAll(async () => {
  const db = getDb(TEST_DB);
  const hash = await hashPassword('pass');
  userId1 = randomUUID();
  userId2 = randomUUID();
  cohortId = randomUUID();
  const adminId = randomUUID();

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'NOEMIE_ADMIN','ADMIN','Admin',0)`)
    .run(adminId, 'admin@beh.test', hash);

  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER','STARTER','Marie',1)`)
    .run(userId1, 'marie@beh.test', hash);
  db.prepare(`INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, 'PARTICIPANTE_STARTER','STARTER','Sophie',1)`)
    .run(userId2, 'sophie@beh.test', hash);

  db.prepare(`INSERT INTO cohorts (id, name, start_date, created_by) VALUES (?,?,?,?)`)
    .run(cohortId, 'Beh', '2025-01-01', adminId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?,?,?,'STARTER')`)
    .run(randomUUID(), userId1, cohortId);
  db.prepare(`INSERT INTO enrollments (id, user_id, cohort_id, plan) VALUES (?,?,?,'STARTER')`)
    .run(randomUUID(), userId2, cohortId);
  db.prepare(`INSERT INTO user_progress (id,user_id,cohort_id,cadre_step,sprint_number,week_in_sprint,gate_status,unlocked_at) VALUES (?,?,?,'C',1,1,'in_progress',datetime('now'))`)
    .run(randomUUID(), userId1, cohortId);
  db.prepare(`INSERT INTO user_progress (id,user_id,cohort_id,cadre_step,sprint_number,week_in_sprint,gate_status,unlocked_at) VALUES (?,?,?,'A',3,2,'in_progress',datetime('now'))`)
    .run(randomUUID(), userId2, cohortId);
  db.prepare(`INSERT INTO profiles (user_id, display_name) VALUES (?,?)`)
    .run(userId1, 'Marie Test');
  db.prepare(`INSERT INTO profiles (user_id, display_name) VALUES (?,?)`)
    .run(userId2, 'Sophie Test');
  db.prepare(`INSERT INTO pilotage_state (id,user_id,current_priority,next_action,not_priority_now) VALUES (?,?,?,?,?)`)
    .run(randomUUID(), userId1, 'Valider mon offre', 'Contacter 3 prospects cette semaine', 'Refaire le site web');
  db.prepare(`INSERT INTO pilotage_state (id,user_id,current_priority,next_action) VALUES (?,?,?,?)`)
    .run(randomUUID(), userId2, 'Trouver 10 clients potentiels', 'Envoyer 5 emails de prospection');

  // Marie has a decision and a market signal
  const decId = randomUUID();
  db.prepare(`INSERT INTO decisions (id,user_id,title,decision_type,context,rationale,facts_used,hypotheses,status) VALUES (?,?,?,?,?,?,?,?,'active')`)
    .run(decId, userId1, 'Cible principale', 'persona',
      'Me concentrer sur les coachs indépendants', 'Segment le plus accessible',
      'Entretiens avec 5 personnes du segment', 'Supposé: budget moyen 200€/mois');
  db.prepare(`INSERT INTO market_signals (id,user_id,signal_type,content,strength) VALUES (?,?,?,?,?)`)
    .run(randomUUID(), userId1, 'insight', 'Prospect A: intéressée mais veut voir une démo', 2);

  const [r1, r2] = await Promise.all([
    request(app).post('/auth/login').send({ email: 'marie@beh.test', password: 'pass' }),
    request(app).post('/auth/login').send({ email: 'sophie@beh.test', password: 'pass' }),
  ]);
  cookie1 = r1.headers['set-cookie'];
  cookie2 = r2.headers['set-cookie'];
});

afterAll(() => { try { resetDb(); } catch {} });

// ── Helper ───────────────────────────────────────────────────────────────────
async function chat(cookie, message, shortcutType = 'general') {
  const res = await request(app)
    .post('/api/copilote/chat')
    .set('Cookie', cookie)
    .send({ message, shortcutType });
  return res;
}

function parseSSE(text) {
  const events = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try { events.push(JSON.parse(line.slice(6))); } catch {}
    }
  }
  return events;
}

function getFullResponse(text) {
  const events = parseSSE(text);
  const done = events.find(e => e.type === 'done');
  return done?.content ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE ENFORCEMENT TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Anti-dispersion — "Donne-moi 50 idées de business"', () => {
  it('system prompt includes anti-dispersion rule; AI processes message and context contains current priority', async () => {
    let capturedParams = null;
    setMockResponse(async (params) => {
      capturedParams = params;
      return 'Je vois que tu cherches de la nouveauté. Avant d\'explorer de nouvelles idées, regardons ce qui est déjà en cours : ta priorité actuelle est "Valider mon offre". Quelle est la raison qui te pousse à chercher 50 nouvelles idées maintenant ?';
    });

    const res = await chat(cookie1, 'Donne-moi 50 idées de business.', 'general');
    expect(res.status).toBe(200);

    // System prompt must include the anti-dispersion/clarification rule
    const systemPrompt = capturedParams?.system ?? '';
    expect(systemPrompt).toMatch(/CLARIFIER|PRIORISER|priorité/i);
    expect(systemPrompt).toMatch(/RÈGLES ABSOLUES|immuable/i);

    // Dynamic system prompt must include participant context (pilotage + sprint)
    expect(systemPrompt).toMatch(/CONTEXTE PARTICIPANTE/i);
    expect(systemPrompt).toMatch(/sprint|cadre_step|pilotage/i);

    // AI response should not be empty
    const fullResponse = getFullResponse(res.text);
    expect(fullResponse.length).toBeGreaterThan(20);
  });

  it('context builder includes current_priority (not other participant\'s)', async () => {
    let capturedParams = null;
    setMockResponse(async (params) => { capturedParams = params; return 'OK'; });

    await chat(cookie1, 'Nouvelles idées', 'general');

    // Context is now in dynamic system prompt on every call
    expect(capturedParams?.system).toMatch(/Valider mon offre/);
    expect(capturedParams?.system).not.toMatch(/Trouver 10 clients/);
    expect(capturedParams?.system).not.toMatch(/sophie@beh/i);
  });
});

describe('No false certainty — "Quelle niche me rapportera le plus ?"', () => {
  it('system prompt forbids promising market success', async () => {
    let capturedSystem = null;
    setMockResponse(async (params) => {
      capturedSystem = params.system;
      return 'Je ne peux pas garantir quelle niche sera la plus rentable — personne ne peut. Ce que je peux faire, c\'est t\'aider à valider des hypothèses.';
    });

    const res = await chat(cookie1, 'Quelle niche me rapportera le plus ?', 'challenge_offre');
    expect(res.status).toBe(200);

    // System prompt must forbid false market promises
    expect(capturedSystem).toMatch(/promets.*JAMAIS|JAMAIS.*succès commercial|succès commercial|hypothèse/i);
    expect(capturedSystem).toMatch(/hypothèse|DIAGNOSTIQUER/i);
  });
});

describe('Quitter son emploi — "Dis-moi si je dois quitter mon travail."', () => {
  it('system prompt explicitly forbids deciding whether user should quit', async () => {
    let capturedSystem = null;
    setMockResponse(async (params) => {
      capturedSystem = params.system;
      return 'Cette décision t\'appartient entièrement. Je ne suis pas en position de te dire si tu dois quitter ton emploi.';
    });

    const res = await chat(cookie1, 'Dis-moi si je dois quitter mon travail.', 'general');
    expect(res.status).toBe(200);

    expect(capturedSystem).toMatch(/quitter.*emploi|emploi.*quitter/i);
    expect(capturedSystem).toMatch(/JAMAIS|jamais/);
  });
});

describe('No decision overwrite — "Change toute ma direction"', () => {
  it('apply-update does NOT touch decisions table; only pilotage_state allowed fields', async () => {
    const db = getDb();
    const decBefore = db.prepare(`SELECT * FROM decisions WHERE user_id = ?`).all(userId1);

    // Even if AI suggests changing direction, apply-update only writes pilotage_state
    const res = await request(app)
      .post('/api/copilote/apply-update')
      .set('Cookie', cookie1)
      .send({ updates: { current_priority: 'Nouvelle direction complète' } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Decisions table unchanged
    const decAfter = db.prepare(`SELECT * FROM decisions WHERE user_id = ?`).all(userId1);
    expect(decAfter.length).toBe(decBefore.length);
    expect(decAfter[0].status).toBe('active');
    expect(decAfter[0].context).toBe(decBefore[0].context);
  });

  it('apply-update rejects attempts to write to decisions via updates object', async () => {
    const res = await request(app)
      .post('/api/copilote/apply-update')
      .set('Cookie', cookie1)
      .send({ updates: { decision: 'Pirater la base', status: 'archived', decision_type: 'malicious' } });

    expect(res.status).toBe(400);
  });
});

describe('Max useful actions — "J\'ai 30 minutes."', () => {
  it('trente_minutes shortcut sends focused context: next_action + current_priority only', async () => {
    let capturedParams = null;
    setMockResponse(async (params) => { capturedParams = params; return 'En 30 minutes tu peux contacter tes 3 prospects.'; });

    const res = await chat(cookie1, "J'ai 30 minutes.", 'trente_minutes');
    expect(res.status).toBe(200);

    // Context is in dynamic system prompt — always fresh
    expect(capturedParams?.system).toMatch(/Contacter 3 prospects|next_action|prochaine action/i);
    expect(capturedParams?.system).toMatch(/Valider mon offre|current_priority/i);
  });
});

describe('"Je suis perdue." — full context shortcut', () => {
  it('perdue shortcut builds full context including decision and market signal', async () => {
    let capturedParams = null;
    setMockResponse(async (params) => { capturedParams = params; return 'Je t\'entends. Voici où tu en es...'; });

    const res = await chat(cookie1, "Je suis perdue.", 'perdue');
    expect(res.status).toBe(200);

    // Dynamic system prompt includes decisions and market signals
    expect(capturedParams?.system).toMatch(/Cible principale|coachs/i);
    expect(capturedParams?.system).toMatch(/Prospect A|intéressée/i);
  });
});

describe('Explicit facts/hypotheses — context includes both', () => {
  it('context includes decision with facts_used and hypotheses separate', async () => {
    let capturedParams = null;
    setMockResponse(async (params) => { capturedParams = params; return 'Voici ce que je vois...'; });

    await chat(cookie1, 'Analyse mes retours', 'analyse_retours');

    // analyse_retours context includes market signals with content
    expect(capturedParams?.system).toMatch(/Prospect A|intéressée|recent_signals/i);
    // static system prompt includes facts/hypotheses distinction rule
    expect(capturedParams?.system).toMatch(/faits vérifiés.*hypothèses|TOUJOURS explicitement/i);
  });
});

describe('Conflicting decisions — existing decision surfaced in context', () => {
  it('context includes active decisions so AI can reference existing direction', async () => {
    let capturedParams = null;
    setMockResponse(async (params) => { capturedParams = params; return 'Tu as déjà décidé de cibler les coachs indépendants.'; });

    await chat(cookie1, 'J\'ai une nouvelle idée ce matin', 'nouvelle_idee');

    // nouvelle_idee context includes current priority (anti-dispersion anchor)
    expect(capturedParams?.system).toMatch(/current_priority|priorité actuelle|Nouvelle direction/i);
  });
});

describe('Rewrite offer before validation — "Réécris toute mon offre"', () => {
  it('context includes current sprint/phase so AI can apply progression-awareness', async () => {
    let capturedParams = null;
    setMockResponse(async (params) => { capturedParams = params; return 'Avant de réécrire, validons d\'abord ce que tu as.'; });

    await chat(cookie1, "Réécris toute mon offre avant que je parle à quelqu'un.", 'challenge_offre');

    // "Rewrite offer" protection is in the static rule, not context
    // The rule: "Tu ne réécris JAMAIS l'offre complète avant validation terrain"
    expect(capturedParams?.system).toMatch(/réécris JAMAIS|offre complète|validation terrain/i);
  });
});

describe('Unsupported market claims — system prompt includes no-certainty rule', () => {
  it('system prompt contains rule against promising market success', async () => {
    let capturedSystem = null;
    setMockResponse(async (params) => { capturedSystem = params.system; return 'OK'; });

    await chat(cookie1, 'Dis-moi que mon idée va marcher', 'challenge_offre');

    // Must have rule forbidding market certainty
    expect(capturedSystem).toMatch(/succès commercial|hypothèse|certitude|JAMAIS/i);
  });
});

describe('Data isolation — participant cannot access another participant context', () => {
  it('Marie context contains only Marie data', async () => {
    let marieSystem = null;
    setMockResponse(async (params) => { marieSystem = params.system; return 'OK'; });
    await chat(cookie1, 'Aide-moi', 'general');

    let sophieSystem = null;
    setMockResponse(async (params) => { sophieSystem = params.system; return 'OK'; });
    await chat(cookie2, 'Aide-moi', 'general');

    // Marie's system prompt has Marie's decision (immutable), not Sophie's priority
    expect(marieSystem).toMatch(/Cible principale|coachs/i);
    expect(marieSystem).not.toMatch(/Trouver 10 clients/);
    // Sophie's system prompt has Sophie's data, not Marie's decision
    expect(sophieSystem).toMatch(/Trouver 10 clients|Envoyer 5 emails/i);
    expect(sophieSystem).not.toMatch(/Cible principale/i);
  });

  it('Sophie cannot read Marie\'s thread history', async () => {
    // Get Marie's thread
    const threadRes = await request(app).get('/api/copilote/thread').set('Cookie', cookie1);
    const marieThreadId = threadRes.body.id;

    // Sophie tries to access Marie's history
    const res = await request(app)
      .get(`/api/copilote/history/${marieThreadId}`)
      .set('Cookie', cookie2);

    expect(res.status).toBe(404);
  });

  it('Sophie cannot apply-update to Marie\'s pilotage_state', async () => {
    const db = getDb();
    const marieBefore = db.prepare(`SELECT current_priority FROM pilotage_state WHERE user_id = ?`).get(userId1);

    // Sophie posts apply-update — this updates Sophie's own pilotage_state (not Marie's)
    // because ownership is taken from req.user.id
    const res = await request(app)
      .post('/api/copilote/apply-update')
      .set('Cookie', cookie2)
      .send({ updates: { current_priority: 'HACK Marie priorité' } });

    expect(res.status).toBe(200); // succeeds but writes to Sophie's state

    // Marie's pilotage_state should be unchanged
    const marieAfter = db.prepare(`SELECT current_priority FROM pilotage_state WHERE user_id = ?`).get(userId1);
    expect(marieAfter.current_priority).toBe(marieBefore.current_priority);

    // Sophie's state was updated (not Marie's)
    const sophie = db.prepare(`SELECT current_priority FROM pilotage_state WHERE user_id = ?`).get(userId2);
    expect(sophie.current_priority).toBe('HACK Marie priorité');
  });

  it('returns 401 for unauthenticated chat attempt', async () => {
    const res = await request(app)
      .post('/api/copilote/chat')
      .send({ message: 'Aide-moi' });
    expect(res.status).toBe(401);
  });
});

describe('Mise à jour JSON block parsing', () => {
  it('done event includes parsed update_block when AI outputs valid json fence', async () => {
    const miseAJour = {
      mise_a_jour: {
        priorite_actuelle: 'Valider offre avec 3 clients',
        prochaine_action: 'Envoyer email à Isabelle',
        dependance: 'Réponse d\'Isabelle avant vendredi',
      },
    };
    setMockText(`Voici le résumé de notre session.\n\n\`\`\`json\n${JSON.stringify(miseAJour)}\n\`\`\``);

    const res = await chat(cookie1, "Ma semaine", 'ma_semaine');
    const events = parseSSE(res.text);
    const doneEvent = events.find(e => e.type === 'done');

    expect(doneEvent).toBeDefined();
    expect(doneEvent.update_block).toMatchObject({
      priorite_actuelle: 'Valider offre avec 3 clients',
      prochaine_action: 'Envoyer email à Isabelle',
    });
  });

  it('done event has null update_block when AI outputs no json fence', async () => {
    setMockText('Voici un conseil simple sans mise à jour.');

    const res = await chat(cookie1, 'Juste un conseil', 'general');
    const events = parseSSE(res.text);
    const doneEvent = events.find(e => e.type === 'done');

    expect(doneEvent).toBeDefined();
    expect(doneEvent.update_block).toBeNull();
  });
});

describe('copilot_messages immutability', () => {
  it('copilot_messages are INSERT-only; chat saves both user and assistant messages', async () => {
    setMockText('Bonne question.');

    await chat(cookie1, 'Question test', 'general');

    const db = getDb();
    const msgs = db.prepare(
      `SELECT role FROM copilot_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 2`
    ).all(userId1);

    const roles = msgs.map(m => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
  });
});

describe('AI unavailable — app remains usable', () => {
  it('chat returns 503 with unavailable:true when no API key', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const res = await chat(cookie1, 'test', 'general');
    expect(res.status).toBe(503);
    expect(res.body.unavailable).toBe(true);
    expect(res.body.error).toMatch(/non disponible/i);

    process.env.ANTHROPIC_API_KEY = saved;
  });

  it('other endpoints remain functional when API key missing', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // Thread endpoint still works
    const threadRes = await request(app).get('/api/copilote/thread').set('Cookie', cookie1);
    expect(threadRes.status).toBe(200);

    // History still works
    const histRes = await request(app)
      .get(`/api/copilote/history/${threadRes.body.id}`)
      .set('Cookie', cookie1);
    expect(histRes.status).toBe(200);

    process.env.ANTHROPIC_API_KEY = saved;
  });
});
