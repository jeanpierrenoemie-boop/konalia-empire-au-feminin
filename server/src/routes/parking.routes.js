/**
 * Parking à Idées — STOP DISPERSION
 *
 * Governance:
 *  - The 7 evaluation questions are stored verbatim — no inference.
 *  - dispersion_status is ALWAYS set explicitly by the participant.
 *  - This module never reads or writes the decisions table.
 *  - No code path here can change an active strategic Direction.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb, writeAudit } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const DISPERSION_STATUSES = ['AGIR_MAINTENANT', 'TESTER_PLUS_TARD', 'PARKING', 'ABANDONNER'];

/* ── GET /api/parking ── */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const ideas = db.prepare(`
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
  `).all(userId);

  const grouped = {
    agir_maintenant:  ideas.filter(i => i.dispersion_status === 'AGIR_MAINTENANT'),
    tester_plus_tard: ideas.filter(i => i.dispersion_status === 'TESTER_PLUS_TARD'),
    parking:          ideas.filter(i => i.dispersion_status === 'PARKING' || !i.dispersion_status),
    abandonner:       ideas.filter(i => i.dispersion_status === 'ABANDONNER'),
  };

  res.json({ grouped, total: ideas.length });
});

/* ── POST /api/parking ── new idea with 7-question evaluation */
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
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
  db.prepare(`
    INSERT INTO parking_ideas (
      id, user_id, title, description, category, status,
      dispersion_status,
      pourquoi_maintenant, sert_objectif_90j, sert_priorite_actuelle,
      necessaire_maintenant, que_remplace, quel_cout, option_plus_simple,
      status_changed_at
    ) VALUES (?, ?, ?, ?, ?, 'parked', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
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
  );

  writeAudit(db, {
    actorId: userId,
    targetUserId: userId,
    eventType: 'data_access',
    tableName: 'parking_ideas',
    recordId: id,
    afterState: { title: title.trim(), dispersion_status },
  });

  const created = db.prepare(`SELECT * FROM parking_ideas WHERE id = ?`).get(id);
  res.status(201).json(created);
});

/* ── PUT /api/parking/:id/status ── change dispersion status */
router.put('/:id/status', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const idea = db.prepare(`SELECT * FROM parking_ideas WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId);
  if (!idea) return res.status(404).json({ error: 'Idée introuvable' });

  const { dispersion_status, reason } = req.body;
  if (!dispersion_status || !DISPERSION_STATUSES.includes(dispersion_status)) {
    return res.status(400).json({ error: `dispersion_status invalide. Valeurs : ${DISPERSION_STATUSES.join(', ')}` });
  }

  /* Guard: an AGIR_MAINTENANT idea can only be acted on as an independent action —
     it never creates or modifies a strategic decision. The participant must go
     to Journal des Décisions themselves if a decision is warranted. */

  db.prepare(`
    UPDATE parking_ideas
    SET dispersion_status = ?, status_reason = ?, status_changed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(dispersion_status, reason ?? null, idea.id, userId);

  writeAudit(db, {
    actorId: userId,
    targetUserId: userId,
    eventType: 'data_access',
    tableName: 'parking_ideas',
    recordId: idea.id,
    beforeState: { dispersion_status: idea.dispersion_status },
    afterState: { dispersion_status, reason },
  });

  const updated = db.prepare(`SELECT * FROM parking_ideas WHERE id = ?`).get(idea.id);
  res.json(updated);
});

/* ── PUT /api/parking/:id ── update questions on an existing idea */
router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const idea = db.prepare(`SELECT * FROM parking_ideas WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId);
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
  db.prepare(`UPDATE parking_ideas SET ${setClauses}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(...Object.values(updates), idea.id, userId);

  const updated = db.prepare(`SELECT * FROM parking_ideas WHERE id = ?`).get(idea.id);
  res.json(updated);
});

export default router;
