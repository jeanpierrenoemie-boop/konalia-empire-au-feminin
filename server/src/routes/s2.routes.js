/**
 * S2 — TES RESSOURCES EXPLOITABLES
 * Routes for S2 structured paths (Pistes à Arbitrer).
 *
 * Live data stored in participant_data with data_type = 's2_paths'.
 * On submit, snapshot saved to mission_submissions.
 *
 * participant_data.content (JSON):
 * {
 *   version: 1,
 *   status: "draft" | "complete",
 *   completed_at: null | ISO string,
 *   paths: [
 *     {
 *       id: string,
 *       status: "exploring" | "retained" | "discarded",
 *       name: string,
 *       starting_resource: string,
 *       person: string,
 *       problem: string,
 *       what_i_know: string,
 *       what_i_assume: string,
 *       what_i_need_to_verify: string,
 *       acknowledged: { what_i_know?: true, what_i_assume?: true, what_i_need_to_verify?: true }
 *     }
 *   ],
 *   mission_submission_id: null | string
 * }
 *
 * Constraints:
 *   - max 5 active (non-discarded) paths
 *   - max 3 retained paths
 *
 * Completeness (required to submit):
 *   - at least 1 retained path
 *   - max 3 retained paths
 *   - each retained path must have:
 *     - starting_resource non-empty
 *     - person non-empty
 *     - problem non-empty
 *     - each of what_i_know / what_i_assume / what_i_need_to_verify:
 *       non-empty OR acknowledged[field] === true
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's2_paths';
const MAX_ACTIVE = 5;
const MAX_RETAINED = 3;

/* ── Completeness check ─────────────────────────────────────────── */
function checkS2Completeness(data) {
  const paths = data.paths ?? [];
  const retained = paths.filter(p => p.status === 'retained');

  if (retained.length === 0) {
    return { ok: false, error: 'Retiens au moins une piste pour arbitrage.' };
  }
  if (retained.length > MAX_RETAINED) {
    return { ok: false, error: `Maximum ${MAX_RETAINED} pistes retenues pour arbitrage.` };
  }

  for (const p of retained) {
    if (!p.starting_resource?.trim()) {
      return { ok: false, error: `La piste "${p.name || p.id}" doit avoir une ressource de départ.` };
    }
    if (!p.person?.trim()) {
      return { ok: false, error: `La piste "${p.name || p.id}" doit identifier une personne.` };
    }
    if (!p.problem?.trim()) {
      return { ok: false, error: `La piste "${p.name || p.id}" doit formuler un problème.` };
    }
    const ack = p.acknowledged ?? {};
    for (const field of ['what_i_know', 'what_i_assume', 'what_i_need_to_verify']) {
      const hasContent = p[field]?.trim();
      if (!hasContent && !ack[field]) {
        const labels = {
          what_i_know: 'Ce que je sais',
          what_i_assume: 'Ce que je suppose',
          what_i_need_to_verify: 'Ce que je dois vérifier',
        };
        return { ok: false, error: `La piste "${p.name || p.id}" : remplis "${labels[field]}" ou confirme explicitement qu'il n'y a rien à ajouter.` };
      }
    }
  }

  return { ok: true, error: null };
}

/* ── GET /api/s2/paths ──────────────────────────────────────────── */
router.get('/paths', async (req, res) => {
  const db = getAdapter();
  const row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [req.user.id, DATA_TYPE]
  );
  if (!row) return res.json({ s2: null });
  return res.json({ s2: { id: row.id, ...JSON.parse(row.content), updated_at: row.updated_at } });
});

/* ── PUT /api/s2/paths ──────────────────────────────────────────── */
router.put('/paths', async (req, res) => {
  const db = getAdapter();
  const { paths } = req.body ?? {};

  if (!Array.isArray(paths)) {
    return res.status(400).json({ error: 'paths requis (tableau)' });
  }

  /* Validate path count constraints */
  const active = paths.filter(p => p.status !== 'discarded');
  if (active.length > MAX_ACTIVE) {
    return res.status(422).json({ error: `Maximum ${MAX_ACTIVE} pistes actives. Écarte des pistes avant d'en ajouter de nouvelles.` });
  }

  const retained = paths.filter(p => p.status === 'retained');
  if (retained.length > MAX_RETAINED) {
    return res.status(422).json({ error: `Maximum ${MAX_RETAINED} pistes retenues pour arbitrage.` });
  }

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [req.user.id, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : { version: 1, status: 'draft' };

  /* Sanitize and assign IDs to new paths */
  const sanitized = paths.map(p => ({
    id: p.id ?? randomUUID(),
    status: ['exploring', 'retained', 'discarded'].includes(p.status) ? p.status : 'exploring',
    name: p.name ?? '',
    starting_resource: p.starting_resource ?? '',
    person: p.person ?? '',
    problem: p.problem ?? '',
    what_i_know: p.what_i_know ?? '',
    what_i_assume: p.what_i_assume ?? '',
    what_i_need_to_verify: p.what_i_need_to_verify ?? '',
    acknowledged: typeof p.acknowledged === 'object' && p.acknowledged !== null ? p.acknowledged : {},
  }));

  const merged = {
    version: 1,
    status: current.status === 'complete' ? 'complete' : 'draft',
    completed_at: current.completed_at ?? null,
    paths: sanitized,
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

  return res.json({ ok: true, s2: { id, ...merged } });
});

/* ── POST /api/s2/paths/submit ──────────────────────────────────── */
router.post('/paths/submit', async (req, res) => {
  const db = getAdapter();
  const userId = req.user.id;

  /* Sprint check first */
  const progress = await db.queryOne(
    `SELECT sprint_number FROM user_progress WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  if (!progress || progress.sprint_number !== 2) {
    return res.status(400).json({ error: 'Cette soumission est uniquement disponible lors du Sprint 2.' });
  }

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [userId, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucune piste à soumettre. Commence par construire tes pistes.' });
  }

  const data = JSON.parse(existing.content);

  const completeness = checkS2Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [userId]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 2 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  let submissionId = null;

  const retained = (data.paths ?? []).filter(p => p.status === 'retained');

  if (mission) {
    const submissionContent = JSON.stringify({
      type: 's2_paths_snapshot',
      s2_ref: existing.id,
      retained_paths: retained,
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

      const completedContent = JSON.stringify({
        ...data,
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
        eventType: 's2_paths_submitted',
        tableName: 'mission_submissions',
        afterState: { mission_submission_id: submissionId, retained_count: retained.length },
      });
    });

    const submission = await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId]);
    return res.json({ ok: true, submission });
  }

  /* No mission — mark complete without submission */
  const now = new Date().toISOString();
  const completedContent = JSON.stringify({
    ...data,
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
    eventType: 's2_paths_submitted',
    tableName: 'participant_data',
    afterState: { s2_ref: existing.id, note: 'no_mission_found' },
  });

  return res.json({
    ok: true,
    submission: null,
    note: 'Pistes marquées complètes. Aucune mission Sprint 2 trouvée — contacte Noémie.',
  });
});

export default router;
