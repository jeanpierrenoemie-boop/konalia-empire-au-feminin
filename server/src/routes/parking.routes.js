/**
 * Parking à Idées — STOP DISPERSION
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const DISPERSION_STATUSES = ['AGIR_MAINTENANT', 'TESTER_PLUS_TARD', 'PARKING', 'ABANDONNER'];

/* ── GET /api/parking ── */
router.get('/', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const ideas = await db.queryAll(`
    SELECT * FROM parking_ideas
    WHERE user_id = ?
    ORDER BY
      CASE dispersion_status
        WHEN 'AGIR_MAINTENANT'  THEN 1
        WHEN 'TESTER_PLUS_TARD' THEN 2
        WHEN 'PARKING'          THEN 3
        WHEN 'ABANDONNER'       THEN 4
        ELSE 5
      END,
      created_at DESC
  `, [userId]);

  const grouped = {
    agir_maintenant:  ideas.filter(i => i.dispersion_status === 'AGIR_MAINTENANT'),
    tester_plus_tard: ideas.filter(i => i.dispersion_status === 'TESTER_PLUS_TARD'),
    parking:          ideas.filter(i => i.dispersion_status === 'PARKING' || !i.dispersion_status),
    abandonner:       ideas.filter(i => i.dispersion_status === 'ABANDONNER'),
  };

  res.json({ grouped, total: ideas.length });
});

/* ── POST /api/parking ── new idea with 7-question evaluation */
router.post('/', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const {
    title,
    description,
    category,
    dispersion_status,
    pourquoi_maintenant,
    sert_objectif_90j,
    sert_priorite_actuelle,
    necessaire_maintenant,
    que_remplace,
    quel_cout,
    option_plus_simple,
  } = req.body;

  if (!title || title.trim().length < 2) {
    return res.status(400).json({ error: 'title requis (min 2 caractères)' });
  }
  if (!dispersion_status || !DISPERSION_STATUSES.includes(dispersion_status)) {
    return res.status(400).json({
      error: `dispersion_status requis. Valeurs : ${DISPERSION_STATUSES.join(', ')}`,
    });
  }

  const id = randomUUID();
  await db.execute(`
    INSERT INTO parking_ideas (
      id, user_id, title, description, category, status,
      dispersion_status,
      pourquoi_maintenant, sert_objectif_90j, sert_priorite_actuelle,
      necessaire_maintenant, que_remplace, quel_cout, option_plus_simple,
      status_changed_at
    ) VALUES (?, ?, ?, ?, ?, 'parked', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `, [
    id, userId,
    title.trim(),
    description ?? '',
    category ?? null,
    dispersion_status,
    pourquoi_maintenant ?? null,
    sert_objectif_90j != null ? (sert_objectif_90j ? 1 : 0) : null,
    sert_priorite_actuelle != null ? (sert_priorite_actuelle ? 1 : 0) : null,
    necessaire_maintenant != null ? (necessaire_maintenant ? 1 : 0) : null,
    que_remplace ?? null,
    quel_cout ?? null,
    option_plus_simple ?? null,
  ]);

  await db.writeAudit({
    actorId: userId,
    targetUserId: userId,
    eventType: 'data_access',
    tableName: 'parking_ideas',
    recordId: id,
    afterState: { title: title.trim(), dispersion_status },
  });

  const created = await db.queryOne(`SELECT * FROM parking_ideas WHERE id = ?`, [id]);
  return res.status(201).json(created);
});

/* ── PUT /api/parking/:id/status ── change dispersion status */
router.put('/:id/status', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const idea = await db.queryOne(`SELECT * FROM parking_ideas WHERE id = ? AND user_id = ?`,
    [req.params.id, userId]);
  if (!idea) return res.status(404).json({ error: 'Idée introuvable' });

  const { dispersion_status, reason } = req.body;
  if (!dispersion_status || !DISPERSION_STATUSES.includes(dispersion_status)) {
    return res.status(400).json({ error: `dispersion_status invalide. Valeurs : ${DISPERSION_STATUSES.join(', ')}` });
  }

  await db.execute(`
    UPDATE parking_ideas
    SET dispersion_status = ?, status_reason = ?, status_changed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `, [dispersion_status, reason ?? null, idea.id, userId]);

  await db.writeAudit({
    actorId: userId,
    targetUserId: userId,
    eventType: 'data_access',
    tableName: 'parking_ideas',
    recordId: idea.id,
    beforeState: { dispersion_status: idea.dispersion_status },
    afterState: { dispersion_status, reason },
  });

  return res.json(await db.queryOne(`SELECT * FROM parking_ideas WHERE id = ?`, [idea.id]));
});

/* ── PUT /api/parking/:id ── update questions on an existing idea */
router.put('/:id', requireAuth, async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const idea = await db.queryOne(`SELECT * FROM parking_ideas WHERE id = ? AND user_id = ?`,
    [req.params.id, userId]);
  if (!idea) return res.status(404).json({ error: 'Idée introuvable' });

  const ALLOWED = [
    'title', 'description', 'category',
    'pourquoi_maintenant', 'sert_objectif_90j', 'sert_priorite_actuelle',
    'necessaire_maintenant', 'que_remplace', 'quel_cout', 'option_plus_simple',
  ];

  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) {
      updates[key] = key.startsWith('sert_') || key === 'necessaire_maintenant'
        ? (req.body[key] != null ? (req.body[key] ? 1 : 0) : null)
        : req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ modifiable fourni' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  await db.execute(`UPDATE parking_ideas SET ${setClauses}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
    [...Object.values(updates), idea.id, userId]);

  return res.json(await db.queryOne(`SELECT * FROM parking_ideas WHERE id = ?`, [idea.id]));
});

export default router;
