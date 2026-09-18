/**
 * COPILOTE — Express router
 * Routes: GET /thread, POST /chat (SSE), POST /apply-update, GET /history/:threadId
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
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

RÈGLES SPÉCIFIQUES — SPRINT 3 / ARBITRAGE (actives quand sprint_number = 3) :

TU PEUX :
- Aider Sarah à distinguer ce qui relève de faits vérifiés, d'hypothèses ou de préférences personnelles.
- Résumer sa propre matrice sans la réinterpréter.
- Identifier des contradictions entre les critères et ses conclusions.
- Identifier quelle incertitude est réellement déterminante pour la décision.
- Demander quelle nouvelle information changerait réellement son choix.
- Challenger la recherche de certitude zéro-risque.
- Aider Sarah à formuler son raisonnement par écrit.

TU NE DOIS PAS :
- Choisir la piste prioritaire à sa place.
- Classer ou ranger les pistes.
- Désigner une piste "meilleure" ou "gagnante".
- Calculer ou impliquer un score total ou un résultat automatique.
- Convertir une préférence en preuve.
- Présenter une hypothèse comme un fait vérifié.
- Affirmer la rentabilité ou la validation marché d'une piste.
- Rédiger la sélection officielle de la participante.

SI SARAH DEMANDE "Choisis pour moi" / "Classe mes pistes" / "Dis-moi laquelle prendre" :
Refuser le rôle de décideur sans devenir inutile. Répondre en substance :
"Je peux t'aider à voir ce qui distingue réellement tes pistes, mais cette décision doit rester la tienne.
Regardons ce qui te fait encore hésiter : est-ce un fait qui te manque, une hypothèse que tu veux vérifier, ou une préférence que tu n'assumes pas encore ?"
Puis continuer à aider Sarah à raisonner.

SI SARAH DEMANDE DE NOUVELLES IDÉES pendant S3 sans information significativement nouvelle :
Ne pas rouvrir l'idéation. Répondre en substance :
"Tu as déjà réduit le champ des possibles. Ajouter de nouvelles pistes maintenant te ramènerait à l'étape précédente.
Qu'est-ce qui, dans les pistes que tu as déjà retenues, t'empêche encore de choisir celle que tu vas tester ?"

RÈGLES SPÉCIFIQUES — SPRINT 4 / VERROUILLE TA DIRECTION (actives quand sprint_number = 4) :

TU PEUX :
- Aider Sarah à formuler sa Direction avec clarté (personne, problème, formulation).
- L'aider à distinguer ce qu'elle sait, ce qu'elle suppose, et ce qu'elle doit vérifier.
- L'aider à identifier ses conditions de réouverture de manière réaliste.
- Challenger une Direction trop vague ou trop large.
- Rappeler que verrouiller une Direction, c'est s'engager à la tester — pas à y croire aveuglément.
- Aider à formuler ce qu'elle accepte de ne pas encore savoir.

TU NE DOIS PAS :
- Choisir la Direction à sa place.
- Modifier, reformuler ou réécrire la Direction officielle sans que Sarah l'ait demandé explicitement.
- Suggérer que la Direction est "la bonne" ou validée par le marché.
- Créer, modifier ou supprimer la décision stratégique — c'est uniquement Sarah qui verrouille.
- Prétendre que verrouiller une Direction garantit le succès.
- Rouvrir l'arbitrage S3 ou remettre en cause le choix de piste prioritaire.

SI SARAH HÉSITE À VERROUILLER :
Ne pas pousser vers la clôture prématurée. Répondre en substance :
"Ce n'est pas une décision irrévocable — c'est un engagement à tester cette direction spécifique.
Qu'est-ce qui, dans cette Direction, ne te semble pas encore assez précis pour avancer ?"

SI SARAH DEMANDE DE CHANGER DE DIRECTION après verrouillage :
Ne pas simplement accéder. Répondre en substance :
"La Direction est verrouillée — ce qui signifie que tu t'es engagée à la tester avant de pivoter.
Qu'est-ce qui a changé concrètement depuis que tu l'as verrouillée ?
Si c'est une des conditions de réouverture que tu avais identifiées, alors oui — une réouverture est légitime."

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
router.get('/thread', async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  let thread = await db.queryOne(
    `SELECT * FROM copilot_threads WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
    [userId]
  );

  if (!thread) {
    const id = randomUUID();
    await db.execute(
      `INSERT INTO copilot_threads (id, user_id, title, thread_type, status) VALUES (?, ?, ?, ?, 'active')`,
      [id, userId, 'Nouvelle session', 'general']
    );
    thread = await db.queryOne(`SELECT * FROM copilot_threads WHERE id = ?`, [id]);
  }

  res.json(thread);
});

/* ── POST /api/copilote/chat — SSE streaming ─────────────────── */
router.post('/chat', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'COPILOTE non disponible', unavailable: true });
  }

  const db = getAdapter();
  const userId = req.user.id;
  const { message, shortcutType = 'general', threadId } = req.body ?? {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message requis' });
  }

  // Resolve or create thread
  let thread;
  if (threadId) {
    thread = await db.queryOne(`SELECT * FROM copilot_threads WHERE id = ? AND user_id = ?`, [threadId, userId]);
    if (!thread) return res.status(404).json({ error: 'Thread introuvable' });
  } else {
    thread = await db.queryOne(
      `SELECT * FROM copilot_threads WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );
    if (!thread) {
      const id = randomUUID();
      await db.execute(
        `INSERT INTO copilot_threads (id, user_id, title, thread_type, status) VALUES (?, ?, ?, ?, 'active')`,
        [id, userId, message.slice(0, 60), 'general']
      );
      thread = await db.queryOne(`SELECT * FROM copilot_threads WHERE id = ?`, [id]);
    }
  }

  // Build context
  const { summary, structured } = await buildCopiloteContext(db, userId, shortcutType);

  // Fetch message history
  const history = await db.queryAll(
    `SELECT role, content FROM copilot_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 20`,
    [thread.id]
  );

  // Save user message (INSERT-only)
  const userMsgId = randomUUID();
  await db.execute(
    `INSERT INTO copilot_messages (id, thread_id, user_id, role, content) VALUES (?, ?, ?, 'user', ?)`,
    [userMsgId, thread.id, userId, message.trim()]
  );

  // Update thread timestamp
  await db.execute(`UPDATE copilot_threads SET updated_at = datetime('now') WHERE id = ?`, [thread.id]);

  // Build dynamic system prompt
  const contextSection = `\n\n---\n[CONTEXTE PARTICIPANTE — mis à jour à chaque message]\n${summary}\n\nDonnées structurées:\n${JSON.stringify(structured, null, 2)}\n---`;
  const dynamicSystem = SYSTEM_PROMPT + contextSection;

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
    await db.execute(
      `INSERT INTO copilot_messages (id, thread_id, user_id, role, content) VALUES (?, ?, ?, 'assistant', ?)`,
      [assistantMsgId, thread.id, userId, fullContent]
    );

    const jsonMatch = fullContent.match(/```json\s*([\s\S]*?)```/);
    let updateBlock = null;
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.mise_a_jour) updateBlock = parsed.mise_a_jour;
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
router.post('/apply-update', async (req, res) => {
  const db = getAdapter();
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

  const existing = await db.queryOne(`SELECT id FROM pilotage_state WHERE user_id = ?`, [userId]);

  if (existing) {
    const setClauses = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f]);
    await db.execute(
      `UPDATE pilotage_state SET ${setClauses}, updated_at = datetime('now'), updated_by_user = FALSE WHERE user_id = ?`,
      [...values, userId]
    );
  } else {
    const id = randomUUID();
    const cols = ['id', 'user_id', ...fields].join(', ');
    const placeholders = ['?', '?', ...fields.map(() => '?')].join(', ');
    const values = [id, userId, ...fields.map(f => updates[f])];
    await db.execute(`INSERT INTO pilotage_state (${cols}) VALUES (${placeholders})`, values);
  }

  const updated = await db.queryOne(`SELECT * FROM pilotage_state WHERE user_id = ?`, [userId]);
  res.json({ ok: true, pilotage: updated });
});

/* ── GET /api/copilote/history/:threadId ─────────────────────── */
router.get('/history/:threadId', async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;
  const { threadId } = req.params;

  const thread = await db.queryOne(
    `SELECT * FROM copilot_threads WHERE id = ? AND user_id = ?`,
    [threadId, userId]
  );

  if (!thread) return res.status(404).json({ error: 'Thread introuvable' });

  const messages = await db.queryAll(
    `SELECT id, role, content, created_at FROM copilot_messages WHERE thread_id = ? ORDER BY created_at ASC`,
    [threadId]
  );

  res.json({ thread, messages });
});

export default router;
