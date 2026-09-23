/**
 * S9 — APPRENDRE DU TERRAIN ET DÉCIDER DU PROCHAIN TEST
 * Routes for S9 Learning Review.
 *
 * Live data stored in participant_data with data_type = 's9_learning_review'.
 * On submit: mission_submission created + snapshot stored.
 *
 * RULES:
 * - 0 new strategic decisions
 * - 0 new revenue decisions
 * - 0 new official Proofs
 * - S8/S7/S6/S5/S4 not modified
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's9_learning_review';

/* ── Default state ──────────────────────────────────────────────── */
function defaultState() {
  return {
    version: 1,
    status: 'draft',
    source_refs: {
      s8_submission_id: null,
      direction_decision_id: null,
    },
    observations: [],
    learnings: {
      what_really_happened: '',
      what_surprised: '',
      what_remains_unknown: '',
    },
    keep: [],
    hypothesis_to_test: {
      formulation: '',
      category: '',
      why_priority: '',
    },
    next_test: {
      question: '',
      target_person: '',
      element_tested: '',
      what_to_present: '',
      data_to_observe: '',
      completion_criteria: '',
      next_action: '',
      planned_date: '',
    },
    epistemic: {
      facts: '',
      facts_acknowledged: false,
      assumptions: '',
      assumptions_acknowledged: false,
      to_verify: '',
      to_verify_acknowledged: false,
    },
    synthesis: '',
    submitted_at: null,
  };
}

/* ── Completeness check ─────────────────────────────────────────── */
export function checkS9Completeness(data) {
  // Au moins une observation factuelle
  const obs = data.observations ?? [];
  if (obs.length === 0 || !obs[0]?.fact?.trim())
    return { ok: false, error: 'Documente au moins une observation factuelle de ton test.' };

  // Distinction observation/hypothèse présente
  const hasObservation = obs.some(o => o.type === 'observation');
  if (!hasObservation)
    return { ok: false, error: 'Classe au moins une observation (type: observation).' };

  // Ce que j'ai appris
  if (!data.learnings?.what_really_happened?.trim())
    return { ok: false, error: 'Décris ce qui s\'est réellement passé.' };

  // Au moins un élément gardé
  const keep = data.keep ?? [];
  if (keep.length === 0 || !keep[0]?.element?.trim())
    return { ok: false, error: 'Indique au moins un élément que tu gardes tel quel.' };

  // Hypothèse prioritaire
  if (!data.hypothesis_to_test?.formulation?.trim())
    return { ok: false, error: 'Formule une hypothèse prioritaire à tester.' };

  // Prochain test
  const nt = data.next_test ?? {};
  if (!nt.question?.trim())
    return { ok: false, error: 'Indique la question de ton prochain test.' };
  if (!nt.target_person?.trim())
    return { ok: false, error: 'Indique à qui tu vas parler.' };
  if (!nt.next_action?.trim())
    return { ok: false, error: 'Indique ta prochaine action concrète.' };
  if (!nt.data_to_observe?.trim())
    return { ok: false, error: 'Indique quelle donnée tu veux observer.' };

  // Epistemic
  const ep = data.epistemic ?? {};
  if (!ep.facts?.trim() && !ep.facts_acknowledged)
    return { ok: false, error: 'Indique ce que tu sais — ou confirme que tu n\'as rien à ajouter.' };
  if (!ep.assumptions?.trim() && !ep.assumptions_acknowledged)
    return { ok: false, error: 'Indique tes suppositions — ou confirme.' };
  if (!ep.to_verify?.trim() && !ep.to_verify_acknowledged)
    return { ok: false, error: 'Indique ce que tu dois encore vérifier — ou confirme.' };

  return { ok: true, error: null };
}

/* ── GET /api/s9/learning-review ───────────────────────────────── */
router.get('/learning-review', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Verify gate S9 (must be VERT)
  const { evaluateGate } = await import('../gates.js');
  const gate = await evaluateGate(db, uid, 9);
  if (!gate || gate.status !== 'VERT') {
    return res.status(400).json({
      error: 'La gate S9 n\'est pas encore VERTE. Complète et soumets ton Premier Test Terrain (Sprint 8) avant de commencer le Sprint 9.',
      gate,
    });
  }

  // Load submitted S8 field test for prefill
  const s8Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's8_field_test' LIMIT 1`,
    [uid]
  );

  let s8Data = null;
  if (s8Row) {
    try {
      const parsed = JSON.parse(s8Row.content);
      if (parsed.status === 'submitted') s8Data = parsed;
    } catch {}
  }

  if (!s8Data) {
    return res.status(400).json({
      error: 'Aucun Test Terrain S8 soumis. Complète et soumets ton Premier Test Terrain (Sprint 8) avant de commencer le Sprint 9.',
    });
  }

  const s8Ref = {
    submission_id: s8Row.id,
    outcome_type: s8Data.outcome?.type ?? null,
    outcome_note: s8Data.outcome?.note ?? '',
    what_i_learned: s8Data.interpretation?.what_i_learned ?? '',
    what_surprised_me: s8Data.interpretation?.what_surprised_me ?? '',
    next_to_verify: s8Data.next_to_verify ?? '',
    observed_reaction: s8Data.observed_reaction ?? null,
    verbatims: s8Data.verbatims ?? [],
    test_context: s8Data.test_context ?? null,
    presented: s8Data.presented ?? null,
  };

  // Load existing S9 draft or return prefilled initial state
  const s9Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  if (!s9Row) {
    const prefilled = defaultState();
    prefilled.source_refs.s8_submission_id = s8Row.id;

    // Prefill observations from S8
    if (s8Data.interpretation?.what_i_learned?.trim()) {
      prefilled.observations.push({
        fact: s8Data.interpretation.what_i_learned,
        type: 'observation',
      });
    }
    if (s8Data.next_to_verify?.trim()) {
      prefilled.observations.push({
        fact: s8Data.next_to_verify,
        type: 'signal_to_confirm',
      });
    }
    if (s8Data.interpretation?.what_surprised_me?.trim()) {
      prefilled.observations.push({
        fact: s8Data.interpretation.what_surprised_me,
        type: 'unknown',
      });
    }

    return res.json({ s9: null, s8_ref: s8Ref, prefill: prefilled });
  }

  const parsed = JSON.parse(s9Row.content);
  return res.json({
    s9: { id: s9Row.id, ...parsed, updated_at: s9Row.updated_at },
    s8_ref: s8Ref,
  });
});

/* ── PUT /api/s9/learning-review ───────────────────────────────── */
router.put('/learning-review', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : defaultState();

  if (current.status === 'submitted') {
    return res.status(409).json({ error: 'Cette analyse terrain a déjà été soumise. Elle ne peut plus être modifiée.' });
  }

  const {
    source_refs, observations, learnings, keep,
    hypothesis_to_test, next_test, epistemic, synthesis,
  } = req.body ?? {};

  const merged = {
    version: 1,
    status: 'draft',
    source_refs: source_refs !== undefined
      ? { ...current.source_refs, ...source_refs }
      : current.source_refs,
    observations: observations !== undefined ? observations : current.observations,
    learnings: learnings !== undefined
      ? { ...current.learnings, ...learnings }
      : current.learnings,
    keep: keep !== undefined ? keep : current.keep,
    hypothesis_to_test: hypothesis_to_test !== undefined
      ? { ...current.hypothesis_to_test, ...hypothesis_to_test }
      : current.hypothesis_to_test,
    next_test: next_test !== undefined
      ? { ...current.next_test, ...next_test }
      : current.next_test,
    epistemic: epistemic !== undefined
      ? {
          facts: epistemic.facts !== undefined ? String(epistemic.facts ?? '') : current.epistemic.facts,
          facts_acknowledged: epistemic.facts_acknowledged !== undefined ? !!epistemic.facts_acknowledged : current.epistemic.facts_acknowledged,
          assumptions: epistemic.assumptions !== undefined ? String(epistemic.assumptions ?? '') : current.epistemic.assumptions,
          assumptions_acknowledged: epistemic.assumptions_acknowledged !== undefined ? !!epistemic.assumptions_acknowledged : current.epistemic.assumptions_acknowledged,
          to_verify: epistemic.to_verify !== undefined ? String(epistemic.to_verify ?? '') : current.epistemic.to_verify,
          to_verify_acknowledged: epistemic.to_verify_acknowledged !== undefined ? !!epistemic.to_verify_acknowledged : current.epistemic.to_verify_acknowledged,
        }
      : current.epistemic,
    synthesis: synthesis !== undefined ? String(synthesis ?? '') : current.synthesis,
    submitted_at: current.submitted_at ?? null,
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

  return res.json({ ok: true, s9: { id, ...merged } });
});

/* ── POST /api/s9/learning-review/submit ───────────────────────── */
router.post('/learning-review/submit', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucune analyse terrain à soumettre. Commence par remplir ton Analyse Terrain (Sprint 9).' });
  }

  const data = JSON.parse(existing.content);

  const completeness = checkS9Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 9 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  const now = new Date().toISOString();
  let submissionId = null;

  await db.transaction(async tx => {
    // 1. Mission submission (sprint_number=9)
    if (mission) {
      const snapshotContent = JSON.stringify({
        type: 's9_learning_review_snapshot',
        s9_ref: existing.id,
        observations: data.observations,
        learnings: data.learnings,
        keep: data.keep,
        hypothesis_to_test: data.hypothesis_to_test,
        next_test: data.next_test,
        epistemic: data.epistemic,
        synthesis: data.synthesis,
        submitted_at: now,
      });

      const existingSub = await tx.queryOne(
        `SELECT id, status FROM mission_submissions WHERE mission_id = ? AND user_id = ?`,
        [mission.id, uid]
      );

      if (existingSub?.status === 'approved') {
        throw Object.assign(new Error('already_approved'), { status: 409 });
      }

      if (existingSub) {
        submissionId = existingSub.id;
        await tx.execute(
          `UPDATE mission_submissions SET content = ?, status = 'submitted', updated_at = ? WHERE id = ?`,
          [snapshotContent, now, existingSub.id]
        );
      } else {
        submissionId = randomUUID();
        await tx.execute(
          `INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)`,
          [submissionId, mission.id, uid, cohortId ?? '', snapshotContent, now, now]
        );
      }
    }

    // 2. Update participant_data status=submitted
    const submittedContent = JSON.stringify({
      ...data,
      status: 'submitted',
      submitted_at: now,
      mission_submission_id: submissionId ?? null,
    });

    await tx.execute(
      `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      [submittedContent, existing.id]
    );

    // 3. Audit
    await tx.writeAudit({
      actorId: uid,
      targetUserId: uid,
      eventType: 's9_learning_review_submitted',
      tableName: 'mission_submissions',
      afterState: {
        mission_submission_id: submissionId,
        priority_hypothesis: data.hypothesis_to_test?.formulation ?? null,
      },
    });
  });

  const submission = submissionId
    ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId])
    : null;

  return res.json({ ok: true, submission });
});

export default router;
