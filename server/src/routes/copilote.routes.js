/**
 * COPILOTE — Express router
 * Routes: GET /thread, POST /chat (SSE), POST /apply-update, GET /history/:threadId
 *
 * Constraints:
 *  - copilot_messages: INSERT-only, never UPDATE/DELETE
 *  - AI never updates decisions table directly
 *  - VERT/ORANGE/ROUGE gate decisions are deterministic, not AI's purview
 *  - If ANTHROPIC_API_KEY missing → 503
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { buildCopiloteContext } from '../copilote.js';

const router = Router();
router.use(requireAuth);

const SYSTEM_PROMPT = `Tu es le COPILOTE de "Reprise de Contrôle", un assistant IA stratégique pour les femmes entrepreneurs.

TES 7 RÈGLES IMMUABLES :
1. CLARIFIER — Tu aides à clarifier la situation sans juger.
2. DIAGNOSTIQUER — Tu identifies les vrais blocages, pas les symptômes.
3. CARTOGRAPHIER — Tu aides à voir toutes les options disponibles.
4. PRIORISER — Tu aides à choisir la prochaine action avec le plus d'impact.
5. FAIRE AVANCER — Tu proposes des actions concrètes et réalisables.
6. MÉMORISER LES DÉCISIONS — Tu rappelles les décisions déjà prises pour éviter les boucles.
7. REPILOTER — Tu aides à ajuster le cap sans abandonner la direction.

RÈGLES ABSOLUES :
- Tu ne décides JAMAIS si la participante doit quitter son emploi. C'est sa décision, pas la tienne.
- Tu ne promets JAMAIS le succès commercial ni la rentabilité d'une niche. Le marché est incertain ; tu travailles avec des hypothèses à valider, pas des certitudes.
- Tu distingues TOUJOURS explicitement : faits vérifiés / hypothèses / préférences personnelles.
- Tu ne proposes JAMAIS 30 tâches à la fois. Une priorité. Une prochaine action. Pas plus.
- Tu ne réécris JAMAIS l'offre complète avant validation terrain. Tu poses d'abord des questions.
- Les gates VERT/ORANGE/ROUGE sont déterministes (calculés par l'algorithme). Tu ne les modifies pas.
- Tu ne modifies JAMAIS la table des décisions directement. Tu suggères seulement.
- Tu restes dans ton rôle de copilote : tu guides, tu ne diriges pas.
- Tu parles toujours en français, avec bienveillance et clarté.
- Tu utilises "tu" et non "vous".

COMPORTEMENT EN FIN DE SESSION :
À la fin de chaque session significative, si des mises à jour du pilotage semblent pertinentes, génère un bloc JSON structuré dans une clôture \`\`\`json avec les clés suivantes (toutes optionnelles, inclure seulement ce qui a changé) :
{
  "mise_a_jour": {
    "valide_aujourd_hui": "ce que la participante valide/accepte aujourd'hui",
    "passe_en_attente": "ce qui passe en mode attente",
    "abandonne": "ce qui est clairement abandonné",
    "nouvelle_decision_suggestion": "suggestion de nouvelle décision stratégique (participante décide)",
    "priorite_actuelle": "nouvelle priorité si elle a changé",
    "prochaine_action": "prochaine action concrète",
    "dependance": "dépendance ou condition externe à surveiller"
  }
}`;

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // Dynamic import to avoid failing when key is missing
  return import('@anthropic-ai/sdk').then(m => {
    const Anthropic = m.default;
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  });
}

function chooseModel(shortcutType) {
  if (shortcutType === 'challenge_offre' || shortcutType === 'analyse_retours') {
    return 'claude-sonnet-4-6';
  }
  return 'claude-haiku-4-5-20251001';
}

/* ── GET /api/copilote/thread ─────────────────────────────────── */
router.get('/thread', (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  let thread = db.prepare(
    `SELECT * FROM copilot_threads WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`
  ).get(userId);

  if (!thread) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO copilot_threads (id, user_id, title, thread_type, status) VALUES (?, ?, ?, ?, 'active')`
    ).run(id, userId, 'Nouvelle session', 'general');
    thread = db.prepare(`SELECT * FROM copilot_threads WHERE id = ?`).get(id);
  }

  res.json(thread);
});

/* ── POST /api/copilote/chat — SSE streaming ─────────────────── */
router.post('/chat', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'COPILOTE non disponible', unavailable: true });
  }

  const db = getDb();
  const userId = req.user.id;
  const { message, shortcutType = 'general', threadId } = req.body ?? {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message requis' });
  }

  // Resolve or create thread
  let thread;
  if (threadId) {
    thread = db.prepare(`SELECT * FROM copilot_threads WHERE id = ? AND user_id = ?`).get(threadId, userId);
    if (!thread) return res.status(404).json({ error: 'Thread introuvable' });
  } else {
    thread = db.prepare(
      `SELECT * FROM copilot_threads WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`
    ).get(userId);
    if (!thread) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO copilot_threads (id, user_id, title, thread_type, status) VALUES (?, ?, ?, ?, 'active')`
      ).run(id, userId, message.slice(0, 60), 'general');
      thread = db.prepare(`SELECT * FROM copilot_threads WHERE id = ?`).get(id);
    }
  }

  // Build context
  const { summary, structured } = buildCopiloteContext(db, userId, shortcutType);

  // Fetch message history
  const history = db.prepare(
    `SELECT role, content FROM copilot_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 20`
  ).all(thread.id);

  // Save user message (INSERT-only)
  const userMsgId = randomUUID();
  db.prepare(
    `INSERT INTO copilot_messages (id, thread_id, user_id, role, content) VALUES (?, ?, ?, 'user', ?)`
  ).run(userMsgId, thread.id, userId, message.trim());

  // Update thread timestamp
  db.prepare(`UPDATE copilot_threads SET updated_at = datetime('now') WHERE id = ?`).run(thread.id);

  // Build dynamic system prompt: static rules + fresh participant context on every call
  const contextSection = `\n\n---\n[CONTEXTE PARTICIPANTE — mis à jour à chaque message]\n${summary}\n\nDonnées structurées:\n${JSON.stringify(structured, null, 2)}\n---`;
  const dynamicSystem = SYSTEM_PROMPT + contextSection;

  // Build messages array for Anthropic
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message.trim() },
  ];

  const model = chooseModel(shortcutType);

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let fullContent = '';

  try {
    const clientPromise = getAnthropicClient();
    const client = await clientPromise;

    const stream = await client.messages.stream({
      model,
      max_tokens: 2048,
      system: dynamicSystem,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const delta = event.delta.text;
        fullContent += delta;
        sendEvent({ type: 'delta', content: delta });
      }
    }

    // Save assistant message (INSERT-only)
    const assistantMsgId = randomUUID();
    db.prepare(
      `INSERT INTO copilot_messages (id, thread_id, user_id, role, content) VALUES (?, ?, ?, 'assistant', ?)`
    ).run(assistantMsgId, thread.id, userId, fullContent);

    // Check for mise_a_jour JSON block
    const jsonMatch = fullContent.match(/```json\s*([\s\S]*?)```/);
    let updateBlock = null;
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.mise_a_jour) {
          updateBlock = parsed.mise_a_jour;
        }
      } catch {
        // malformed JSON, ignore
      }
    }

    sendEvent({ type: 'done', content: fullContent, update_block: updateBlock, message_id: assistantMsgId });
    res.end();
  } catch (err) {
    console.error('COPILOTE chat error:', err);
    sendEvent({ type: 'error', content: 'Erreur lors de la génération de la réponse' });
    res.end();
  }
});

/* ── POST /api/copilote/apply-update ─────────────────────────── */
router.post('/apply-update', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { threadId, updates } = req.body ?? {};

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates requis' });
  }

  const allowed = ['current_priority', 'next_action', 'blocker'];
  const fields = Object.keys(updates).filter(k => allowed.includes(k));

  if (fields.length === 0) {
    return res.status(400).json({ error: `Champs autorisés : ${allowed.join(', ')}` });
  }

  // Upsert pilotage_state
  const existing = db.prepare(`SELECT id FROM pilotage_state WHERE user_id = ?`).get(userId);

  if (existing) {
    const setClauses = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f]);
    db.prepare(
      `UPDATE pilotage_state SET ${setClauses}, updated_at = datetime('now'), updated_by_user = 0 WHERE user_id = ?`
    ).run(...values, userId);
  } else {
    const id = randomUUID();
    const cols = ['id', 'user_id', ...fields].join(', ');
    const placeholders = ['?', '?', ...fields.map(() => '?')].join(', ');
    const values = [id, userId, ...fields.map(f => updates[f])];
    db.prepare(`INSERT INTO pilotage_state (${cols}) VALUES (${placeholders})`).run(...values);
  }

  const updated = db.prepare(`SELECT * FROM pilotage_state WHERE user_id = ?`).get(userId);
  res.json({ ok: true, pilotage: updated });
});

/* ── GET /api/copilote/history/:threadId ─────────────────────── */
router.get('/history/:threadId', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { threadId } = req.params;

  const thread = db.prepare(
    `SELECT * FROM copilot_threads WHERE id = ? AND user_id = ?`
  ).get(threadId, userId);

  if (!thread) return res.status(404).json({ error: 'Thread introuvable' });

  const messages = db.prepare(
    `SELECT id, role, content, created_at FROM copilot_messages WHERE thread_id = ? ORDER BY created_at ASC`
  ).all(threadId);

  res.json({ thread, messages });
});

export default router;
