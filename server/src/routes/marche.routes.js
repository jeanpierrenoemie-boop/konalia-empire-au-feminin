import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

/* ── Phase gate middleware ──────────────────────────────────────────────────── */
function requireMarchePhase(req, res, next) {
  const db = getDb();
  const uid = req.user.id;

  if (req.user.role === 'NOEMIE_ADMIN') return next();

  const progress = db.prepare(
    `SELECT cadre_step FROM user_progress WHERE user_id = ? LIMIT 1`
  ).get(uid);

  const step = progress?.cadre_step;
  if (step === 'R' || step === 'E') return next();

  return res.status(403).json({
    error: 'LOCKED',
    message: 'Mon Marché est accessible à partir de la phase R — Rencontrer.',
  });
}

router.use(requireMarchePhase);

/* ── Signal level ordering ─────────────────────────────────────────────────── */
const SIGNAL_LEVELS = [
  'politesse',
  'probleme_exprime',
  'comportement_passe',
  'interet_solution',
  'intention_commerciale',
  'engagement',
];

function signalCeiling(signals) {
  if (!signals || signals.length === 0) return null;
  let max = -1;
  for (const s of signals) {
    const idx = SIGNAL_LEVELS.indexOf(s.signal_type);
    if (idx > max) max = idx;
  }
  return max >= 0 ? SIGNAL_LEVELS[max] : null;
}

/* ── GET /api/marche/contacts ───────────────────────────────────────────────── */
router.get('/contacts', (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const contacts = db.prepare(
    `SELECT * FROM market_contacts WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(uid);

  const result = contacts.map(c => {
    const signals = db.prepare(
      `SELECT signal_type, strength FROM market_signals
       WHERE user_id = ? AND contact_id = ?
       ORDER BY created_at DESC LIMIT 10`
    ).all(uid, c.id);
    return { ...c, signal_ceiling: signalCeiling(signals), last_signal_count: signals.length };
  });

  return res.json(result);
});

/* ── POST /api/marche/contacts ──────────────────────────────────────────────── */
router.post('/contacts', (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const { name, source, circle } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name est requis' });
  }

  const VALID_CIRCLES = ['proche', 'connaissance', 'inconnu', 'prescripteur', 'autre'];
  if (circle && !VALID_CIRCLES.includes(circle)) {
    return res.status(400).json({ error: 'circle invalide' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO market_contacts (id, user_id, name, source, circle, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'prospect', ?, ?)
  `).run(id, uid, name.trim(), source ?? null, circle ?? null, now, now);

  const contact = db.prepare(`SELECT * FROM market_contacts WHERE id = ?`).get(id);
  return res.status(201).json(contact);
});

/* ── GET /api/marche/contacts/:id ────────────────────────────────────────────── */
router.get('/contacts/:id', (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const contact = db.prepare(
    `SELECT * FROM market_contacts WHERE id = ? AND user_id = ?`
  ).get(req.params.id, uid);

  if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

  const conversations = db.prepare(
    `SELECT mc.*, COUNT(ms.id) AS signal_count
     FROM market_conversations mc
     LEFT JOIN market_signals ms ON ms.conversation_id = mc.id
     WHERE mc.contact_id = ? AND mc.user_id = ?
     GROUP BY mc.id
     ORDER BY mc.date_occurred DESC`
  ).all(req.params.id, uid);

  const signals = db.prepare(
    `SELECT * FROM market_signals WHERE contact_id = ? AND user_id = ? ORDER BY created_at DESC`
  ).all(req.params.id, uid);

  return res.json({ ...contact, conversations, signals, signal_ceiling: signalCeiling(signals) });
});

/* ── PUT /api/marche/contacts/:id ────────────────────────────────────────────── */
router.put('/contacts/:id', (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const contact = db.prepare(
    `SELECT id FROM market_contacts WHERE id = ? AND user_id = ?`
  ).get(req.params.id, uid);
  if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

  const VALID_STATUSES = ['prospect', 'en_cours', 'converti', 'pause', 'abandonne'];
  const VALID_INTENTS = ['exprime', 'confirme'];

  const { status, next_action, last_action, last_contact_date, notes, commercial_intent } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status invalide' });
  }
  if (commercial_intent && !VALID_INTENTS.includes(commercial_intent)) {
    return res.status(400).json({ error: 'commercial_intent invalide' });
  }

  const fields = [];
  const vals = [];

  if (status !== undefined)           { fields.push('status = ?');            vals.push(status); }
  if (next_action !== undefined)      { fields.push('next_action = ?');       vals.push(next_action); }
  if (last_action !== undefined)      { fields.push('last_action = ?');       vals.push(last_action); }
  if (last_contact_date !== undefined){ fields.push('last_contact_date = ?'); vals.push(last_contact_date); }
  if (notes !== undefined)            { fields.push('notes = ?');             vals.push(notes); }
  if (commercial_intent !== undefined){ fields.push('commercial_intent = ?'); vals.push(commercial_intent); }

  if (fields.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });

  fields.push('updated_at = ?');
  vals.push(new Date().toISOString());
  vals.push(req.params.id);

  db.prepare(`UPDATE market_contacts SET ${fields.join(', ')} WHERE id = ?`).run(...vals);

  const updated = db.prepare(`SELECT * FROM market_contacts WHERE id = ?`).get(req.params.id);
  return res.json(updated);
});

/* ── GET /api/marche/conversations ──────────────────────────────────────────── */
router.get('/conversations', (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const { contact_id } = req.query;

  let query = `SELECT mc.*, COUNT(ms.id) AS signal_count
               FROM market_conversations mc
               LEFT JOIN market_signals ms ON ms.conversation_id = mc.id
               WHERE mc.user_id = ?`;
  const params = [uid];

  if (contact_id) {
    // verify ownership
    const c = db.prepare(`SELECT id FROM market_contacts WHERE id = ? AND user_id = ?`).get(contact_id, uid);
    if (!c) return res.status(404).json({ error: 'Contact introuvable' });
    query += ` AND mc.contact_id = ?`;
    params.push(contact_id);
  }

  query += ` GROUP BY mc.id ORDER BY mc.date_occurred DESC`;
  const rows = db.prepare(query).all(...params);
  return res.json(rows);
});

/* ── POST /api/marche/conversations ─────────────────────────────────────────── */
router.post('/conversations', (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const { contact_id, date, summary, transcript, title } = req.body;

  if (!contact_id) return res.status(400).json({ error: 'contact_id est requis' });
  if (!date)       return res.status(400).json({ error: 'date est requis' });
  if (!summary)    return res.status(400).json({ error: 'summary est requis' });

  const contact = db.prepare(
    `SELECT id FROM market_contacts WHERE id = ? AND user_id = ?`
  ).get(contact_id, uid);
  if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

  const id = randomUUID();
  const now = new Date().toISOString();
  const convTitle = title ?? `Conversation du ${date}`;

  db.prepare(`
    INSERT INTO market_conversations
      (id, user_id, contact_id, title, summary, date_occurred, transcript, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, uid, contact_id, convTitle, summary, date, transcript ?? null, now, now);

  // update contact last_contact_date
  db.prepare(`
    UPDATE market_contacts
    SET last_contact_date = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(date, now, contact_id, uid);

  const conv = db.prepare(`SELECT * FROM market_conversations WHERE id = ?`).get(id);
  return res.status(201).json(conv);
});

/* ── GET /api/marche/conversations/:id ──────────────────────────────────────── */
router.get('/conversations/:id', (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const conv = db.prepare(
    `SELECT * FROM market_conversations WHERE id = ? AND user_id = ?`
  ).get(req.params.id, uid);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

  const signals = db.prepare(
    `SELECT * FROM market_signals WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC`
  ).all(req.params.id, uid);

  return res.json({ ...conv, signals });
});

/* ── POST /api/marche/signals ────────────────────────────────────────────────── */
router.post('/signals', (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const { conversation_id, signal_type, content, strength } = req.body;

  if (!conversation_id) return res.status(400).json({ error: 'conversation_id est requis' });
  if (!signal_type)     return res.status(400).json({ error: 'signal_type est requis' });
  if (!content)         return res.status(400).json({ error: 'content est requis' });

  if (!SIGNAL_LEVELS.includes(signal_type)) {
    return res.status(400).json({ error: `signal_type invalide. Valeurs: ${SIGNAL_LEVELS.join(', ')}` });
  }

  const conv = db.prepare(
    `SELECT id, contact_id FROM market_conversations WHERE id = ? AND user_id = ?`
  ).get(conversation_id, uid);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

  const strengthVal = strength ? parseInt(strength, 10) : 2;
  if (isNaN(strengthVal) || strengthVal < 1 || strengthVal > 3) {
    return res.status(400).json({ error: 'strength doit être entre 1 et 3' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO market_signals
      (id, user_id, conversation_id, contact_id, signal_type, content, strength, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, uid, conversation_id, conv.contact_id ?? null, signal_type, content, strengthVal, now);

  const signal = db.prepare(`SELECT * FROM market_signals WHERE id = ?`).get(id);
  return res.status(201).json(signal);
});

/* ── GET /api/marche/carte ────────────────────────────────────────────────────
   Signal map: per contact, highest signal level + count per level.
   NEVER auto-upgrades politesse to engagement.
───────────────────────────────────────────────────────────────────────────── */
router.get('/carte', (req, res) => {
  const db = getDb();
  const uid = req.user.id;

  const contacts = db.prepare(
    `SELECT * FROM market_contacts WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(uid);

  const signal_matrix = {};
  const contactsResult = contacts.map(c => {
    const signals = db.prepare(
      `SELECT signal_type, COUNT(*) AS cnt
       FROM market_signals
       WHERE user_id = ? AND contact_id = ?
       GROUP BY signal_type`
    ).all(uid, c.id);

    const levelCounts = {};
    for (const level of SIGNAL_LEVELS) levelCounts[level] = 0;
    for (const s of signals) levelCounts[s.signal_type] = s.cnt;

    // Compute ceiling from actual signals only — never inferred
    const allSignals = db.prepare(
      `SELECT signal_type FROM market_signals WHERE user_id = ? AND contact_id = ?`
    ).all(uid, c.id);
    const ceiling = signalCeiling(allSignals);

    signal_matrix[c.id] = levelCounts;

    return {
      id: c.id,
      name: c.name,
      status: c.status,
      circle: c.circle,
      commercial_intent: c.commercial_intent,
      next_action: c.next_action,
      last_contact_date: c.last_contact_date,
      signal_ceiling: ceiling,
      // Commercial intent is ONLY from explicit field — never derived from signal level
      demand_validated: c.commercial_intent === 'engagement' ? false
        : c.commercial_intent !== null && (allSignals.some(s => s.signal_type === 'engagement' || s.signal_type === 'intention_commerciale')),
    };
  });

  // Summary stats
  const totalContacts = contacts.length;
  const withProblem = contactsResult.filter(c =>
    c.signal_ceiling && SIGNAL_LEVELS.indexOf(c.signal_ceiling) >= SIGNAL_LEVELS.indexOf('probleme_exprime')
  ).length;
  const withCommercialIntent = contactsResult.filter(c =>
    c.signal_ceiling && SIGNAL_LEVELS.indexOf(c.signal_ceiling) >= SIGNAL_LEVELS.indexOf('intention_commerciale')
  ).length;

  return res.json({
    contacts: contactsResult,
    signal_matrix,
    summary: {
      total_contacts: totalContacts,
      with_expressed_problem: withProblem,
      with_commercial_intent: withCommercialIntent,
    },
  });
});

export default router;
