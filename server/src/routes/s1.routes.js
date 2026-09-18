/**
 * S1 — TON POINT DE CONTRÔLE
 * Routes for the S1 inventory (Inventaire de Départ).
 *
 * Inventory stored in participant_data with data_type = 's1_inventory'.
 * On submit, creates/updates a mission_submission for the sprint 1 mission.
 *
 * Structure of participant_data.content (JSON):
 * {
 *   version: 1,
 *   status: "draft" | "complete",
 *   completed_at: null | ISO string,
 *   sections: {
 *     A: string[],   // CE QUE JE SAIS FAIRE
 *     B: string[],   // CE QUE J'AI VÉCU
 *     C: string[],   // CE QUE JE CONNAIS
 *     D: string[],   // CE À QUOI J'AI DÉJÀ ACCÈS
 *     E: { available_time: string, constraints: string, context: string }
 *   },
 *   acknowledged: {       // sections B/C/D explicitly marked "rien à ajouter"
 *     B?: true, C?: true, D?: true
 *   },
 *   observation: string,   // CE QUE JE REMARQUE
 *   mission_submission_id: null | string
 * }
 *
 * Completeness rule (required to submit):
 *   A  — at least one non-empty entry
 *   B  — has entries OR acknowledged.B === true
 *   C  — has entries OR acknowledged.C === true
 *   D  — has entries OR acknowledged.D === true
 *   E  — available_time is non-empty
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's1_inventory';

/* Returns { ok, error } — all 5 sections must be treated */
function checkCompleteness(inventory) {
  const s = inventory.sections ?? {};
  const ack = inventory.acknowledged ?? {};

  const hasA = Array.isArray(s.A) && s.A.some(e => e?.trim());
  if (!hasA) return { ok: false, error: 'La section A (Ce que je sais faire) doit contenir au moins une entrée.' };

  for (const k of ['B', 'C', 'D']) {
    const hasEntries = Array.isArray(s[k]) && s[k].some(e => e?.trim());
    if (!hasEntries && !ack[k]) {
      const labels = { B: 'B (Ce que j\'ai vécu)', C: 'C (Ce que je connais)', D: 'D (Ce à quoi j\'ai déjà accès)' };
      return { ok: false, error: `La section ${labels[k]} doit contenir au moins une entrée ou être explicitement confirmée comme vide.` };
    }
  }

  const hasE = typeof s.E?.available_time === 'string' && s.E.available_time.trim();
  if (!hasE) return { ok: false, error: 'Indique ton temps réellement disponible dans la section E (Mes contraintes réelles).' };

  return { ok: true, error: null };
}

/* ── GET /api/s1/inventory ──────────────────────────────────── */
router.get('/inventory', async (req, res) => {
  const db = getAdapter();
  const row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [req.user.id, DATA_TYPE]
  );
  if (!row) return res.json({ inventory: null });
  return res.json({ inventory: { id: row.id, ...JSON.parse(row.content), updated_at: row.updated_at } });
});

/* ── PUT /api/s1/inventory ──────────────────────────────────── */
router.put('/inventory', async (req, res) => {
  const db = getAdapter();
  const { sections, observation, acknowledged } = req.body ?? {};

  if (!sections || typeof sections !== 'object') {
    return res.status(400).json({ error: 'sections requis' });
  }

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [req.user.id, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : { version: 1, status: 'draft' };

  /* Merge acknowledged — only set true, never unset via merge */
  const mergedAck = { ...(current.acknowledged ?? {}) };
  if (acknowledged && typeof acknowledged === 'object') {
    for (const k of ['B', 'C', 'D']) {
      if (acknowledged[k] === true) mergedAck[k] = true;
      else if (acknowledged[k] === false) delete mergedAck[k];
    }
  }

  /* Merge sections — only update provided keys */
  const merged = {
    version: 1,
    status: current.status === 'complete' ? 'complete' : 'draft',
    completed_at: current.completed_at ?? null,
    sections: { ...(current.sections ?? {}), ...sections },
    acknowledged: mergedAck,
    observation: observation !== undefined ? (observation ?? '') : (current.observation ?? ''),
    mission_submission_id: current.mission_submission_id ?? null,
  };

  const json = JSON.stringify(merged);

  let id;
  if (existing) {
    id = existing.id;
    await db.execute(
      `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      [json, existing.id]
    );
  } else {
    id = randomUUID();
    await db.execute(
      `INSERT INTO participant_data (id, owner_id, data_type, content) VALUES (?, ?, ?, ?)`,
      [id, req.user.id, DATA_TYPE, json]
    );
  }

  return res.json({ ok: true, inventory: { id, ...merged } });
});

/* ── POST /api/s1/inventory/submit ─────────────────────────── */
router.post('/inventory/submit', async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [userId, DATA_TYPE]
  );

  if (!existing) {
    return res.status(400).json({ error: 'Aucun inventaire à soumettre. Commence par remplir les sections.' });
  }

  /* Find enrollment and progress — sprint check first */
  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [userId]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const progress = await db.queryOne(
    `SELECT sprint_number FROM user_progress WHERE user_id = ? LIMIT 1`,
    [userId]
  );

  if (!progress || progress.sprint_number !== 1) {
    return res.status(400).json({ error: 'Cette soumission est uniquement disponible lors du Sprint 1.' });
  }

  const inventory = JSON.parse(existing.content);

  /* Validate completeness — all 5 sections must be treated */
  const completeness = checkCompleteness(inventory);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  /* Find a sprint 1 mission for this cohort or global */
  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 1 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  let submissionId = null;

  if (mission) {
    /* Create or update mission_submission */
    const submissionContent = JSON.stringify({
      type: 's1_inventory_snapshot',
      inventory_ref: existing.id,
      sections: inventory.sections,
      observation: inventory.observation ?? '',
      submitted_at: new Date().toISOString(),
    });

    const existingSubmission = await db.queryOne(
      `SELECT id, status FROM mission_submissions WHERE mission_id = ? AND user_id = ?`,
      [mission.id, userId]
    );

    if (existingSubmission?.status === 'approved') {
      return res.status(409).json({ error: 'Cette soumission a déjà été approuvée.' });
    }

    const now = new Date().toISOString();

    await db.transaction(async tx => {
      if (existingSubmission) {
        submissionId = existingSubmission.id;
        await tx.execute(
          `UPDATE mission_submissions SET content = ?, status = 'submitted', updated_at = ? WHERE id = ?`,
          [submissionContent, now, existingSubmission.id]
        );
      } else {
        submissionId = randomUUID();
        await tx.execute(
          `INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)`,
          [submissionId, mission.id, userId, cohortId ?? '', submissionContent, now, now]
        );
      }

      /* Mark inventory as complete */
      const completedContent = JSON.stringify({
        ...inventory,
        status: 'complete',
        completed_at: now,
        mission_submission_id: submissionId,
      });

      await tx.execute(
        `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
        [completedContent, existing.id]
      );

      await tx.writeAudit({
        actorId: userId,
        targetUserId: userId,
        eventType: 's1_inventory_submitted',
        tableName: 'mission_submissions',
        afterState: { mission_submission_id: submissionId, inventory_ref: existing.id },
      });
    });

    const submission = await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId]);
    return res.json({ ok: true, submission });
  }

  /* No mission exists — mark inventory complete without a mission submission */
  const now = new Date().toISOString();
  const completedContent = JSON.stringify({
    ...inventory,
    status: 'complete',
    completed_at: now,
    mission_submission_id: null,
  });

  await db.execute(
    `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
    [completedContent, existing.id]
  );

  await db.writeAudit({
    actorId: userId,
    targetUserId: userId,
    eventType: 's1_inventory_submitted',
    tableName: 'participant_data',
    afterState: { inventory_ref: existing.id, note: 'no_mission_found' },
  });

  return res.json({
    ok: true,
    submission: null,
    note: 'Inventaire marqué complet. Aucune mission Sprint 1 trouvée — contacte Noémie.',
  });
});

export default router;
