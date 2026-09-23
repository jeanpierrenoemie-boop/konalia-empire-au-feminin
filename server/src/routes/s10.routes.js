/**
 * S10 — PROPOSER & OBSERVER
 * Routes for S10 Iteration Plan.
 *
 * Doctrine : TESTER → OBSERVER → ANALYSER → AJUSTER UNE VARIABLE → RETESTER
 * S10 installe une méthode de boucle terrain répétable à partir des apprentissages S9.
 *
 * Live data stored in participant_data with data_type = 's10_iteration_plan'.
 * On submit: mission_submission created + snapshot stored.
 * 0 strategic decisions. 0 revenue decisions. 0 proofs.
 *
 * participant_data.content (JSON):
 * {
 *   version: 1,
 *   status: "draft" | "submitted",
 *   source_refs: {
 *     s9_learning_review_id, priority_hypothesis, hypothesis_category, previous_keep
 *   },
 *   iteration: {
 *     number, hypothesis, variable_under_test, variable_category, constants
 *   },
 *   test_plan: { target_person, message_or_offer, channel, main_question },
 *   observation_criteria: { data_to_observe, expected_action, completion_criterion },
 *   decision_criteria: { what_i_will_look_at },
 *   epistemic: { facts, facts_acknowledged, assumptions, assumptions_acknowledged,
 *                to_verify, to_verify_acknowledged },
 *   synthesis: string,
 *   submitted_at: null | ISO string
 * }
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's10_iteration_plan';

const VALID_VARIABLE_CATEGORIES = [
  'cible', 'probleme', 'formulation', 'proposition',
  'resultat', 'prix', 'cta', 'canal', 'objection', 'autre',
];

/* ── Default state ──────────────────────────────────────────────── */
function defaultState() {
  return {
    version: 1,
    status: 'draft',
    source_refs: {
      s9_learning_review_id: null,
      priority_hypothesis: '',
      hypothesis_category: '',
      previous_keep: [],
    },
    iteration: {
      number: 1,
      hypothesis: '',
      variable_under_test: '',
      variable_category: null,
      constants: [],
    },
    test_plan: {
      target_person: '',
      message_or_offer: '',
      channel: '',
      main_question: '',
    },
    observation_criteria: {
      data_to_observe: '',
      expected_action: '',
      completion_criterion: '',
    },
    decision_criteria: {
      what_i_will_look_at: '',
    },
    epistemic: {
      facts: '', facts_acknowledged: false,
      assumptions: '', assumptions_acknowledged: false,
      to_verify: '', to_verify_acknowledged: false,
    },
    synthesis: '',
    submitted_at: null,
  };
}

/* ── Completeness check ─────────────────────────────────────────── */
function checkS10Completeness(data) {
  const it = data.iteration ?? {};
  if (!it.hypothesis?.trim()) return { ok: false, error: 'Formule ton hypothèse pour cette itération.' };
  if (!it.variable_under_test?.trim()) return { ok: false, error: 'Identifie la variable principale que tu testes.' };
  if (it.variable_category && !VALID_VARIABLE_CATEGORIES.includes(it.variable_category)) {
    return { ok: false, error: 'Catégorie de variable invalide.' };
  }

  const tp = data.test_plan ?? {};
  if (!tp.target_person?.trim()) return { ok: false, error: 'Décris avec qui tu vas tester.' };
  if (!tp.main_question?.trim()) return { ok: false, error: 'Indique ta question principale pour ce test.' };

  const oc = data.observation_criteria ?? {};
  if (!oc.data_to_observe?.trim()) return { ok: false, error: 'Indique ce que tu vas observer.' };
  if (!oc.completion_criterion?.trim()) {
    return { ok: false, error: 'Définis ton critère de test réalisé (indépendamment du résultat).' };
  }

  const dc = data.decision_criteria ?? {};
  if (!dc.what_i_will_look_at?.trim()) {
    return { ok: false, error: 'Indique ce que tu vas regarder pour décider de la suite.' };
  }

  const ep = data.epistemic ?? {};
  if (!ep.facts?.trim() && !ep.facts_acknowledged) {
    return { ok: false, error: 'Indique ce que tu sais — ou confirme que tu n\'as rien à ajouter.' };
  }
  if (!ep.assumptions?.trim() && !ep.assumptions_acknowledged) {
    return { ok: false, error: 'Indique tes suppositions — ou confirme que tu n\'as rien à ajouter.' };
  }
  if (!ep.to_verify?.trim() && !ep.to_verify_acknowledged) {
    return { ok: false, error: 'Indique ce que tu dois vérifier — ou confirme que tu n\'as rien à ajouter.' };
  }

  return { ok: true, error: null };
}

/* ── GET /api/s10/iteration-plan ─────────────────────────────────── */
router.get('/iteration-plan', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Require S9 to be submitted (gate enforcement at data level)
  const s9Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's9_learning_review' LIMIT 1`,
    [uid]
  );
  let s9Submitted = false;
  let s9Refs = null;
  if (s9Row) {
    try {
      const parsed = JSON.parse(s9Row.content);
      s9Submitted = parsed.status === 'submitted';
      if (s9Submitted) {
        s9Refs = {
          s9_learning_review_id: s9Row.id,
          priority_hypothesis: parsed.hypothesis_to_test?.formulation ?? '',
          hypothesis_category: parsed.hypothesis_to_test?.category ?? '',
          previous_keep: parsed.keep ?? [],
          next_test_question: parsed.next_test?.question ?? '',
          next_test_target: parsed.next_test?.target_person ?? '',
          next_test_action: parsed.next_test?.next_action ?? '',
          next_test_data: parsed.next_test?.data_to_observe ?? '',
        };
      }
    } catch {}
  }

  if (!s9Submitted) {
    return res.status(400).json({ error: 'Le Sprint 9 doit être soumis avant de commencer le Sprint 10.' });
  }

  const s10Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  if (!s10Row) {
    return res.json({ s10: null, s9_refs: s9Refs });
  }

  const parsed = JSON.parse(s10Row.content);
  return res.json({
    s10: { id: s10Row.id, ...parsed, updated_at: s10Row.updated_at },
    s9_refs: s9Refs,
  });
});

/* ── PUT /api/s10/iteration-plan ─────────────────────────────────── */
router.put('/iteration-plan', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : defaultState();

  if (current.status === 'submitted') {
    return res.status(409).json({ error: 'Ce plan d\'itération a déjà été soumis. Il ne peut plus être modifié.' });
  }

  const {
    source_refs, iteration, test_plan,
    observation_criteria, decision_criteria, epistemic, synthesis,
  } = req.body ?? {};

  const merged = {
    version: 1,
    status: 'draft',
    source_refs: source_refs !== undefined
      ? { ...current.source_refs, ...source_refs }
      : current.source_refs,
    iteration: iteration !== undefined
      ? {
          number: iteration.number !== undefined ? (parseInt(iteration.number, 10) || 1) : current.iteration.number,
          hypothesis: iteration.hypothesis !== undefined ? String(iteration.hypothesis ?? '') : current.iteration.hypothesis,
          variable_under_test: iteration.variable_under_test !== undefined ? String(iteration.variable_under_test ?? '') : current.iteration.variable_under_test,
          variable_category: iteration.variable_category !== undefined
            ? (VALID_VARIABLE_CATEGORIES.includes(iteration.variable_category) ? iteration.variable_category : null)
            : current.iteration.variable_category,
          constants: Array.isArray(iteration.constants) ? iteration.constants : current.iteration.constants,
        }
      : current.iteration,
    test_plan: test_plan !== undefined
      ? { ...current.test_plan, ...test_plan }
      : current.test_plan,
    observation_criteria: observation_criteria !== undefined
      ? { ...current.observation_criteria, ...observation_criteria }
      : current.observation_criteria,
    decision_criteria: decision_criteria !== undefined
      ? { ...current.decision_criteria, ...decision_criteria }
      : current.decision_criteria,
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

  return res.json({ ok: true, s10: { id, ...merged } });
});

/* ── POST /api/s10/iteration-plan/submit ─────────────────────────── */
router.post('/iteration-plan/submit', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucun plan d\'itération à soumettre. Commence par remplir ton Plan.' });
  }

  const data = JSON.parse(existing.content);

  const completeness = checkS10Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 10 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  const now = new Date().toISOString();
  let submissionId = null;

  await db.transaction(async tx => {
    if (mission) {
      const snapshotContent = JSON.stringify({
        type: 's10_iteration_plan_snapshot',
        s10_ref: existing.id,
        source_refs: data.source_refs,
        iteration: data.iteration,
        test_plan: data.test_plan,
        observation_criteria: data.observation_criteria,
        decision_criteria: data.decision_criteria,
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

    await tx.writeAudit({
      actorId: uid,
      targetUserId: uid,
      eventType: 's10_iteration_plan_submitted',
      tableName: 'mission_submissions',
      afterState: { mission_submission_id: submissionId },
    });
  });

  const submission = submissionId
    ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId])
    : null;

  return res.json({ ok: true, submission });
});

export default router;
