import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb, writeAudit } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const DECISION_TYPES = ['project', 'pivot', 'persona', 'revenue', 'go_nogo', 'scope', 'other'];

/* ── GET /api/decisions ── */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const decisions = db.prepare(`
    SELECT d.*,
      s.title AS superseded_by_title,
      p.title AS supersedes_title
    FROM decisions d
    LEFT JOIN decisions s ON s.supersedes_id = d.id AND s.status = 'active'
    LEFT JOIN decisions p ON p.id = d.supersedes_id
    WHERE d.user_id = ?
    ORDER BY d.created_at DESC
  `).all(userId);

  /* Group: active first, then superseded/archived */
  const active    = decisions.filter(d => d.status === 'active');
  const historical = decisions.filter(d => d.status !== 'active');

  res.json({ active, historical, total: decisions.length });
});

/* ── GET /api/decisions/:id ── */
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const decision = db.prepare(`SELECT * FROM decisions WHERE id = ? AND user_id = ?`).get(req.params.id, userId);
  if (!decision) return res.status(404).json({ error: 'Décision introuvable' });
  res.json(decision);
});

/* ── POST /api/decisions ── new strategic decision */
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const { decision_type, title, context, rationale, facts_used, hypotheses, reopening_condition } = req.body;

  if (!decision_type || !DECISION_TYPES.includes(decision_type)) {
    return res.status(400).json({ error: `decision_type invalide. Valeurs : ${DECISION_TYPES.join(', ')}` });
  }
  if (!title || title.trim().length < 3) {
    return res.status(400).json({ error: 'title requis (min 3 caractères)' });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO decisions (id, user_id, decision_type, title, context, rationale,
      facts_used, hypotheses, reopening_condition, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(id, userId, decision_type, title.trim(),
    context ?? '', rationale ?? '',
    facts_used ?? null, hypotheses ?? null, reopening_condition ?? null);

  writeAudit(db, {
    actorId: userId,
    targetUserId: userId,
    eventType: 'strategic_decision_change',
    tableName: 'decisions',
    recordId: id,
    afterState: { decision_type, title: title.trim(), status: 'active' },
  });

  const created = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(id);
  res.status(201).json(created);
});

/* ── POST /api/decisions/:id/supersede ── replace with new decision */
/* A validated decision stays active until explicitly changed with reason + new evidence. */
router.post('/:id/supersede', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const old = db.prepare(`SELECT * FROM decisions WHERE id = ? AND user_id = ?`).get(req.params.id, userId);
  if (!old) return res.status(404).json({ error: 'Décision introuvable' });
  if (old.status !== 'active') return res.status(409).json({ error: 'Seule une décision active peut être remplacée' });

  const { title, rationale, facts_used, hypotheses, reopening_condition, context } = req.body;

  if (!rationale || rationale.trim().length < 10) {
    return res.status(400).json({ error: 'Une raison de remplacement est obligatoire (min 10 caractères)' });
  }
  if (!title || title.trim().length < 3) {
    return res.status(400).json({ error: 'title requis (min 3 caractères)' });
  }

  const newId = randomUUID();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO decisions (id, user_id, decision_type, title, context, rationale,
        facts_used, hypotheses, reopening_condition, supersedes_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(newId, userId, old.decision_type, title.trim(),
      context ?? old.context ?? '',
      rationale.trim(),
      facts_used ?? null, hypotheses ?? null, reopening_condition ?? null,
      old.id);

    /* Narrow status-only update — content of old decision is untouched */
    db.prepare(`UPDATE decisions SET status = 'superseded' WHERE id = ? AND user_id = ?`)
      .run(old.id, userId);

    writeAudit(db, {
      actorId: userId,
      targetUserId: userId,
      eventType: 'strategic_decision_change',
      tableName: 'decisions',
      recordId: newId,
      beforeState: { id: old.id, title: old.title, status: 'active' },
      afterState: { id: newId, title: title.trim(), supersedes_id: old.id, status: 'active' },
      reason: rationale.trim(),
    });
  })();

  const created = db.prepare(`SELECT * FROM decisions WHERE id = ?`).get(newId);
  res.status(201).json({ new: created, superseded_id: old.id });
});

/* ── POST /api/decisions/:id/archive ── */
router.post('/:id/archive', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const decision = db.prepare(`SELECT * FROM decisions WHERE id = ? AND user_id = ?`).get(req.params.id, userId);
  if (!decision) return res.status(404).json({ error: 'Décision introuvable' });
  if (decision.status === 'archived') return res.status(409).json({ error: 'Déjà archivée' });

  const { reason } = req.body;
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ error: 'Raison d\'archivage requise' });
  }

  db.prepare(`UPDATE decisions SET status = 'archived' WHERE id = ? AND user_id = ?`)
    .run(decision.id, userId);

  writeAudit(db, {
    actorId: userId,
    targetUserId: userId,
    eventType: 'strategic_decision_change',
    tableName: 'decisions',
    recordId: decision.id,
    beforeState: { status: decision.status },
    afterState: { status: 'archived' },
    reason: reason.trim(),
  });

  res.json({ ok: true });
});

export default router;
