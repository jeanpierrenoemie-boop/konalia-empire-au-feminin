import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const DECISION_TYPES = ['project', 'pivot', 'persona', 'revenue', 'go_nogo', 'scope', 'continuity', 'other'];

/* ── GET /api/decisions ── */
router.get('/', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const decisions = await db.queryAll(`
    SELECT d.*,
      s.title AS superseded_by_title,
      p.title AS supersedes_title
    FROM decisions d
    LEFT JOIN decisions s ON s.supersedes_id = d.id AND s.status = 'active'
    LEFT JOIN decisions p ON p.id = d.supersedes_id
    WHERE d.user_id = ?
    ORDER BY d.created_at DESC
  `, [userId]);

  const active    = decisions.filter(d => d.status === 'active');
  const historical = decisions.filter(d => d.status !== 'active');

  res.json({ active, historical, total: decisions.length });
});

/* ── GET /api/decisions/:id ── */
router.get('/:id', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const decision = await db.queryOne(`SELECT * FROM decisions WHERE id = ? AND user_id = ?`, [req.params.id, userId]);
  if (!decision) return res.status(404).json({ error: 'Décision introuvable' });
  res.json(decision);
});

/* ── POST /api/decisions ── new strategic decision */
router.post('/', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const { decision_type, title, context, rationale, facts_used, hypotheses, reopening_condition } = req.body;

  if (!decision_type || !DECISION_TYPES.includes(decision_type)) {
    return res.status(400).json({ error: `decision_type invalide. Valeurs : ${DECISION_TYPES.join(', ')}` });
  }
  if (!title || title.trim().length < 3) {
    return res.status(400).json({ error: 'title requis (min 3 caractères)' });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO decisions (id, user_id, decision_type, title, context, rationale,
      facts_used, hypotheses, reopening_condition, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `, [id, userId, decision_type, title.trim(),
    context ?? '', rationale ?? '',
    facts_used ?? null, hypotheses ?? null, reopening_condition ?? null]);

  await db.writeAudit({
    actorId: userId,
    targetUserId: userId,
    eventType: 'strategic_decision_change',
    tableName: 'decisions',
    recordId: id,
    afterState: { decision_type, title: title.trim(), status: 'active' },
  });

  const created = await db.queryOne(`SELECT * FROM decisions WHERE id = ?`, [id]);
  return res.status(201).json(created);
});

/* ── POST /api/decisions/:id/supersede ── replace with new decision */
router.post('/:id/supersede', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const old = await db.queryOne(`SELECT * FROM decisions WHERE id = ? AND user_id = ?`, [req.params.id, userId]);
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

  await db.transaction(async tx => {
    await tx.execute(`
      INSERT INTO decisions (id, user_id, decision_type, title, context, rationale,
        facts_used, hypotheses, reopening_condition, supersedes_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `, [newId, userId, old.decision_type, title.trim(),
      context ?? old.context ?? '',
      rationale.trim(),
      facts_used ?? null, hypotheses ?? null, reopening_condition ?? null,
      old.id]);

    await tx.execute(`UPDATE decisions SET status = 'superseded' WHERE id = ? AND user_id = ?`,
      [old.id, userId]);

    await tx.writeAudit({
      actorId: userId,
      targetUserId: userId,
      eventType: 'strategic_decision_change',
      tableName: 'decisions',
      recordId: newId,
      beforeState: { id: old.id, title: old.title, status: 'active' },
      afterState: { id: newId, title: title.trim(), supersedes_id: old.id, status: 'active' },
      reason: rationale.trim(),
    });
  });

  const created = await db.queryOne(`SELECT * FROM decisions WHERE id = ?`, [newId]);
  return res.status(201).json({ new: created, superseded_id: old.id });
});

/* ── POST /api/decisions/:id/archive ── */
router.post('/:id/archive', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const decision = await db.queryOne(`SELECT * FROM decisions WHERE id = ? AND user_id = ?`, [req.params.id, userId]);
  if (!decision) return res.status(404).json({ error: 'Décision introuvable' });
  if (decision.status === 'archived') return res.status(409).json({ error: 'Déjà archivée' });

  const { reason } = req.body;
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ error: 'Raison d\'archivage requise' });
  }

  await db.execute(`UPDATE decisions SET status = 'archived' WHERE id = ? AND user_id = ?`,
    [decision.id, userId]);

  await db.writeAudit({
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
