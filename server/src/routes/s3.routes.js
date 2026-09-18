/**
 * S3 — LE CHOIX QUI LIBÈRE
 * Routes for S3 structured arbitration (Matrice d'Arbitrage).
 *
 * Live data stored in participant_data with data_type = 's3_arbitration'.
 * On submit, snapshot saved to mission_submissions.
 *
 * participant_data.content (JSON):
 * {
 *   version: 1,
 *   status: "draft" | "complete",
 *   completed_at: null | ISO string,
 *   s2_ref: string | null,          -- id of the s2_paths participant_data row used
 *   s2_snapshot_paths: [...],       -- snapshot of retained S2 paths at time of arbitration start
 *   s2_changed: boolean,            -- true if live S2 retained paths differ from snapshot
 *   matrix: [
 *     {
 *       path_id: string,            -- matches s2 path id
 *       criteria: {
 *         envie_reelle:             { rating: "FORT"|"MOYEN"|"FAIBLE", note: string },
 *         ressources_existantes:    { rating: ..., note: string },
 *         acces_personnes:          { rating: ..., note: string },
 *         probleme_a_explorer:      { rating: ..., note: string },
 *         compatibilite_vie:        { rating: ..., note: string },
 *         simplicite_premier_test:  { rating: ..., note: string },
 *         niveau_inconnu:           { rating: ..., note: string },
 *       }
 *     }
 *   ],
 *   missing_info: {                 -- optional
 *     needed: string,
 *     why_it_matters: string,
 *     smallest_way_to_get_it: string,
 *   } | null,
 *   priority_path_id: string | null,
 *   why_priority: string,
 *   remaining_to_verify: string,
 *   accepted_unknown: string,
 *   mission_submission_id: null | string
 * }
 *
 * Constraints:
 *   - Paths come from live S2 retained paths only (status=retained).
 *   - All 7 criteria must be treated (rating set) for each path.
 *   - Exactly one priority_path_id must be set.
 *   - why_priority, remaining_to_verify, accepted_unknown must be non-empty.
 *   - No numeric scores stored or calculated.
 *   - No decisions table row created.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's3_arbitration';
const S2_DATA_TYPE = 's2_paths';

const CRITERIA_KEYS = [
  'envie_reelle',
  'ressources_existantes',
  'acces_personnes',
  'probleme_a_explorer',
  'compatibilite_vie',
  'simplicite_premier_test',
  'niveau_inconnu',
];
const VALID_RATINGS = ['FORT', 'MOYEN', 'FAIBLE'];

/* ── Completeness check ─────────────────────────────────────────── */
function checkS3Completeness(data) {
  const matrix = data.matrix ?? [];
  const snapshotPaths = data.s2_snapshot_paths ?? [];

  if (snapshotPaths.length === 0) {
    return { ok: false, error: 'Aucune piste S2 retenue à comparer. Retourne en S2 et retiens au moins une piste.' };
  }

  // Every snapshot path must have a matrix entry with all 7 criteria rated
  for (const sp of snapshotPaths) {
    const row = matrix.find(m => m.path_id === sp.id);
    if (!row) {
      return { ok: false, error: `La piste "${sp.name || sp.id}" n'a pas été analysée dans la matrice.` };
    }
    for (const key of CRITERIA_KEYS) {
      const c = row.criteria?.[key];
      if (!c || !VALID_RATINGS.includes(c.rating)) {
        const labels = {
          envie_reelle: 'Envie réelle',
          ressources_existantes: 'Ressources existantes',
          acces_personnes: 'Accès aux personnes',
          probleme_a_explorer: 'Problème à explorer',
          compatibilite_vie: 'Compatibilité avec ma vie',
          simplicite_premier_test: 'Simplicité du premier test',
          niveau_inconnu: "Niveau d'inconnu",
        };
        return { ok: false, error: `La piste "${sp.name || sp.id}" : critère "${labels[key]}" non renseigné.` };
      }
    }
  }

  if (!data.priority_path_id) {
    return { ok: false, error: 'Sélectionne ta piste prioritaire.' };
  }

  const priorityExists = snapshotPaths.some(p => p.id === data.priority_path_id);
  if (!priorityExists) {
    return { ok: false, error: 'La piste prioritaire sélectionnée ne fait pas partie des pistes comparées.' };
  }

  if (!data.why_priority?.trim()) {
    return { ok: false, error: 'Explique pourquoi tu priorisas cette piste.' };
  }
  if (!data.remaining_to_verify?.trim()) {
    return { ok: false, error: 'Indique ce qui reste à vérifier.' };
  }
  if (!data.accepted_unknown?.trim()) {
    return { ok: false, error: 'Indique ce que tu acceptes de ne pas encore savoir.' };
  }

  return { ok: true, error: null };
}

/* ── Sanitize a criteria object ────────────────────────────────── */
function sanitizeCriteria(raw) {
  const result = {};
  for (const key of CRITERIA_KEYS) {
    const c = raw?.[key];
    result[key] = {
      rating: VALID_RATINGS.includes(c?.rating) ? c.rating : null,
      note: typeof c?.note === 'string' ? c.note : '',
    };
  }
  return result;
}

/* ── Sanitize matrix entry ──────────────────────────────────────── */
function sanitizeMatrixRow(row) {
  return {
    path_id: typeof row.path_id === 'string' ? row.path_id : '',
    criteria: sanitizeCriteria(row.criteria),
  };
}

/* ── GET /api/s3/arbitration ────────────────────────────────────── */
router.get('/arbitration', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Load live S3 state
  const s3Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  // Load live S2 retained paths
  const s2Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, S2_DATA_TYPE]
  );
  const s2Data = s2Row ? JSON.parse(s2Row.content) : null;
  const retainedPaths = (s2Data?.paths ?? []).filter(p => p.status === 'retained');

  if (!s3Row) {
    return res.json({ s3: null, retained_paths: retainedPaths });
  }

  const parsed = JSON.parse(s3Row.content);

  // Detect S2 change
  const snapshotIds = (parsed.s2_snapshot_paths ?? []).map(p => p.id).sort().join(',');
  const liveIds = retainedPaths.map(p => p.id).sort().join(',');
  const s2Changed = parsed.s2_ref !== s2Row?.id || snapshotIds !== liveIds;

  return res.json({
    s3: { id: s3Row.id, ...parsed, s2_changed: s2Changed, updated_at: s3Row.updated_at },
    retained_paths: retainedPaths,
  });
});

/* ── PUT /api/s3/arbitration ────────────────────────────────────── */
router.put('/arbitration', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const { matrix, missing_info, priority_path_id, why_priority, remaining_to_verify, accepted_unknown, refresh_s2 } = req.body ?? {};

  // Load live S2
  const s2Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, S2_DATA_TYPE]
  );
  if (!s2Row) {
    return res.status(400).json({ error: 'Aucune piste S2 trouvée. Complète le Sprint 2 d\'abord.' });
  }
  const s2Data = JSON.parse(s2Row.content);
  const retainedPaths = (s2Data.paths ?? []).filter(p => p.status === 'retained');

  if (retainedPaths.length === 0) {
    return res.status(400).json({ error: 'Aucune piste retenue en S2. Retourne en S2 et retiens au moins une piste.' });
  }

  // Load existing S3
  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : {
    version: 1,
    status: 'draft',
    completed_at: null,
    s2_ref: null,
    s2_snapshot_paths: [],
    matrix: [],
    missing_info: null,
    priority_path_id: null,
    why_priority: '',
    remaining_to_verify: '',
    accepted_unknown: '',
    mission_submission_id: null,
  };

  // If refresh requested or no snapshot yet: re-snapshot from live S2
  const shouldRefresh = refresh_s2 || !current.s2_ref || current.s2_ref !== s2Row.id;
  const snapshotPaths = shouldRefresh ? retainedPaths : (current.s2_snapshot_paths ?? retainedPaths);

  // Validate matrix path ids against snapshot paths
  const validPathIds = new Set(snapshotPaths.map(p => p.id));
  if (Array.isArray(matrix)) {
    for (const row of matrix) {
      if (!validPathIds.has(row.path_id)) {
        return res.status(422).json({ error: `Identifiant de piste inconnu : "${row.path_id}". Les pistes doivent provenir de S2.` });
      }
    }
  }

  // Build merged content
  const merged = {
    version: 1,
    status: current.status === 'complete' ? 'complete' : 'draft',
    completed_at: current.completed_at ?? null,
    s2_ref: s2Row.id,
    s2_snapshot_paths: snapshotPaths,
    matrix: Array.isArray(matrix) ? matrix.map(sanitizeMatrixRow) : (current.matrix ?? []),
    missing_info: missing_info !== undefined ? (missing_info === null ? null : {
      needed: missing_info.needed ?? '',
      why_it_matters: missing_info.why_it_matters ?? '',
      smallest_way_to_get_it: missing_info.smallest_way_to_get_it ?? '',
    }) : (current.missing_info ?? null),
    priority_path_id: priority_path_id !== undefined ? priority_path_id : current.priority_path_id,
    why_priority: why_priority !== undefined ? String(why_priority ?? '') : current.why_priority,
    remaining_to_verify: remaining_to_verify !== undefined ? String(remaining_to_verify ?? '') : current.remaining_to_verify,
    accepted_unknown: accepted_unknown !== undefined ? String(accepted_unknown ?? '') : current.accepted_unknown,
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
      [id, uid, DATA_TYPE, json]
    );
  }

  return res.json({ ok: true, s3: { id, ...merged } });
});

/* ── POST /api/s3/arbitration/submit ───────────────────────────── */
router.post('/arbitration/submit', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Sprint check first
  const progress = await db.queryOne(
    `SELECT sprint_number FROM user_progress WHERE user_id = ? LIMIT 1`,
    [uid]
  );
  if (!progress || progress.sprint_number !== 3) {
    return res.status(400).json({ error: 'Cette soumission est uniquement disponible lors du Sprint 3.' });
  }

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucune matrice à soumettre. Commence par construire ta Matrice d\'Arbitrage.' });
  }

  const data = JSON.parse(existing.content);

  const completeness = checkS3Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 3 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  const priorityPath = data.s2_snapshot_paths.find(p => p.id === data.priority_path_id);
  let submissionId = null;

  if (mission) {
    const submissionContent = JSON.stringify({
      type: 's3_arbitration_snapshot',
      s3_ref: existing.id,
      s2_ref: data.s2_ref,
      compared_paths: data.s2_snapshot_paths,
      matrix: data.matrix,
      missing_info: data.missing_info,
      priority_path: priorityPath ?? null,
      why_priority: data.why_priority,
      remaining_to_verify: data.remaining_to_verify,
      accepted_unknown: data.accepted_unknown,
      submitted_at: new Date().toISOString(),
    });

    const existingSubmission = await db.queryOne(
      `SELECT id, status FROM mission_submissions WHERE mission_id = ? AND user_id = ?`,
      [mission.id, uid]
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
          [submissionId, mission.id, uid, cohortId ?? '', submissionContent, now, now]
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
        actorId: uid,
        targetUserId: uid,
        eventType: 's3_arbitration_submitted',
        tableName: 'mission_submissions',
        afterState: { mission_submission_id: submissionId, priority_path_id: data.priority_path_id },
      });
    });

    const submission = await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId]);
    return res.json({ ok: true, submission });
  }

  /* No mission found — mark complete without submission */
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
    actorId: uid,
    targetUserId: uid,
    eventType: 's3_arbitration_submitted',
    tableName: 'participant_data',
    afterState: { s3_ref: existing.id, note: 'no_mission_found' },
  });

  return res.json({
    ok: true,
    submission: null,
    note: 'Matrice marquée complète. Aucune mission Sprint 3 trouvée — contacte Noémie.',
  });
});

export default router;
