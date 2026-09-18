/**
 * S6 — TON OFFRE MINIMUM TESTABLE
 * Routes for S6 Test Offer.
 *
 * Live data stored in participant_data with data_type = 's6_test_offer'.
 * On submit: mission_submission created + snapshot stored. NO decisions, NO proofs.
 *
 * RULES:
 * - 0 new strategic decisions
 * - 0 pricing decisions
 * - 0 new proofs
 * - S4 direction not modified
 * - S5 target not modified
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's6_test_offer';

/* ── Default state ──────────────────────────────────────────────── */
function defaultState() {
  return {
    version: 1,
    status: 'draft',
    source_refs: {
      direction_decision_id: null,
      s5_submission_id: null,
    },
    audience: { formulation: '' },
    problem: { formulation: '' },
    desired_result: { formulation: '' },
    proposition: { type: '', description: '' },
    included: [],
    delivery: { duration: '', modality: '', steps: '' },
    pricing: {
      amount: null,
      currency: 'EUR',
      model: '',
      rationale: '',
      status: 'hypothesis',
    },
    client_tomorrow_test: {
      answer: null,
      missing: [],
      note: '',
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
function checkS6Completeness(data) {
  if (!data.audience?.formulation?.trim()) return { ok: false, error: 'Décris pour qui est ton Offre Test.' };
  if (!data.problem?.formulation?.trim()) return { ok: false, error: 'Décris le problème que ton Offre Test adresse.' };
  if (!data.desired_result?.formulation?.trim()) return { ok: false, error: 'Décris le résultat souhaité pour ta cliente.' };
  if (!data.proposition?.description?.trim()) return { ok: false, error: 'Décris ce que tu proposes concrètement.' };
  if (!Array.isArray(data.included) || data.included.filter(i => i?.trim()).length === 0)
    return { ok: false, error: 'Décris au moins un élément inclus dans ton Offre Test.' };
  if (!data.delivery?.duration?.trim() && !data.delivery?.modality?.trim() && !data.delivery?.steps?.trim())
    return { ok: false, error: 'Décris comment se déroule ton Offre Test.' };
  // pricing
  if (data.pricing?.amount === null || data.pricing?.amount === undefined || data.pricing?.amount === '')
    return { ok: false, error: 'Indique un prix ou une logique tarifaire à tester.' };
  if (data.pricing?.status !== 'hypothesis')
    return { ok: false, error: 'Le prix doit être marqué comme hypothèse.' };
  // client tomorrow
  if (!['yes', 'not_yet'].includes(data.client_tomorrow_test?.answer))
    return { ok: false, error: 'Réponds au Test Client Demain.' };
  if (data.client_tomorrow_test?.answer === 'not_yet') {
    const hasMissing = Array.isArray(data.client_tomorrow_test.missing) && data.client_tomorrow_test.missing.length > 0;
    const hasNote = typeof data.client_tomorrow_test.note === 'string' && data.client_tomorrow_test.note.trim();
    if (!hasMissing && !hasNote)
      return { ok: false, error: 'Pour "pas encore", indique ce qui manque ou une note.' };
  }
  // epistemic
  const ep = data.epistemic ?? {};
  if (!ep.facts?.trim() && !ep.facts_acknowledged)
    return { ok: false, error: 'Indique ce que tu sais — ou confirme que tu n\'as rien à ajouter.' };
  if (!ep.assumptions?.trim() && !ep.assumptions_acknowledged)
    return { ok: false, error: 'Indique tes suppositions — ou confirme que tu n\'as rien à ajouter.' };
  if (!ep.to_verify?.trim() && !ep.to_verify_acknowledged)
    return { ok: false, error: 'Indique ce que tu dois vérifier sur le terrain — ou confirme.' };
  return { ok: true, error: null };
}

/* ── GET /api/s6/test-offer ─────────────────────────────────────── */
router.get('/test-offer', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Load active S4 direction
  const activeDirection = await db.queryOne(
    `SELECT id, title, context FROM decisions WHERE user_id = ? AND status = 'active' AND decision_type IN ('project','pivot','scope') ORDER BY created_at DESC LIMIT 1`,
    [uid]
  );

  if (!activeDirection) {
    return res.status(400).json({ error: 'Aucune Direction S4 active. Verrouille ta Direction (Sprint 4) avant de commencer le Sprint 6.' });
  }

  // Load submitted S5 target_problem
  const s5Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's5_target_problem' LIMIT 1`,
    [uid]
  );

  let s5Data = null;
  if (s5Row) {
    try {
      const parsed = JSON.parse(s5Row.content);
      if (parsed.status === 'submitted') {
        s5Data = parsed;
      }
    } catch {}
  }

  if (!s5Data) {
    return res.status(400).json({ error: 'Aucune Cible Test S5 soumise. Complète et soumets ta Cible Test (Sprint 5) avant de commencer le Sprint 6.' });
  }

  // Build direction_ref
  let directionRef = { decision_id: activeDirection.id, formulation: '', person: '', problem: '' };
  try {
    const ctx = JSON.parse(activeDirection.context ?? '{}');
    directionRef = {
      decision_id: activeDirection.id,
      formulation: ctx.direction?.formulation ?? '',
      person: ctx.direction?.person ?? '',
      problem: ctx.direction?.problem ?? '',
    };
  } catch {}

  const s5Ref = {
    submission_id: s5Row.id,
    target_who: s5Data.target_test?.who ?? '',
    target_situation: s5Data.target_test?.situation ?? '',
    problem_situation: s5Data.problem_to_investigate?.situation ?? '',
    problem_difficulty: s5Data.problem_to_investigate?.difficulty ?? '',
    problem_consequence: s5Data.problem_to_investigate?.consequence ?? '',
  };

  const s6Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  if (!s6Row) {
    // Prefill from S4 + S5
    const prefilled = defaultState();
    prefilled.source_refs.direction_decision_id = activeDirection.id;
    prefilled.source_refs.s5_submission_id = s5Row.id;
    prefilled.audience.formulation = s5Data.target_test?.who ?? '';
    prefilled.problem.formulation = s5Data.problem_to_investigate?.situation ?? '';

    return res.json({ s6: null, direction_ref: directionRef, s5_ref: s5Ref, prefill: prefilled });
  }

  const parsed = JSON.parse(s6Row.content);
  return res.json({
    s6: { id: s6Row.id, ...parsed, updated_at: s6Row.updated_at },
    direction_ref: directionRef,
    s5_ref: s5Ref,
  });
});

/* ── PUT /api/s6/test-offer ─────────────────────────────────────── */
router.put('/test-offer', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : defaultState();

  if (current.status === 'submitted') {
    return res.status(409).json({ error: 'Cette offre test a déjà été soumise. Elle ne peut plus être modifiée.' });
  }

  const {
    source_refs, audience, problem, desired_result, proposition,
    included, delivery, pricing, client_tomorrow_test, epistemic, synthesis,
  } = req.body ?? {};

  const merged = {
    version: 1,
    status: 'draft',
    source_refs: source_refs !== undefined
      ? { ...current.source_refs, ...source_refs }
      : current.source_refs,
    audience: audience !== undefined
      ? { ...current.audience, ...audience }
      : current.audience,
    problem: problem !== undefined
      ? { ...current.problem, ...problem }
      : current.problem,
    desired_result: desired_result !== undefined
      ? { ...current.desired_result, ...desired_result }
      : current.desired_result,
    proposition: proposition !== undefined
      ? { ...current.proposition, ...proposition }
      : current.proposition,
    included: Array.isArray(included) ? included : current.included,
    delivery: delivery !== undefined
      ? { ...current.delivery, ...delivery }
      : current.delivery,
    pricing: pricing !== undefined
      ? {
          amount: pricing.amount !== undefined ? pricing.amount : current.pricing.amount,
          currency: pricing.currency !== undefined ? pricing.currency : current.pricing.currency,
          model: pricing.model !== undefined ? String(pricing.model ?? '') : current.pricing.model,
          rationale: pricing.rationale !== undefined ? String(pricing.rationale ?? '') : current.pricing.rationale,
          status: 'hypothesis', // always hypothesis
        }
      : current.pricing,
    client_tomorrow_test: client_tomorrow_test !== undefined
      ? {
          answer: client_tomorrow_test.answer !== undefined ? client_tomorrow_test.answer : current.client_tomorrow_test.answer,
          missing: Array.isArray(client_tomorrow_test.missing) ? client_tomorrow_test.missing : current.client_tomorrow_test.missing,
          note: client_tomorrow_test.note !== undefined ? String(client_tomorrow_test.note ?? '') : current.client_tomorrow_test.note,
        }
      : current.client_tomorrow_test,
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

  return res.json({ ok: true, s6: { id, ...merged } });
});

/* ── POST /api/s6/test-offer/submit ─────────────────────────────── */
router.post('/test-offer/submit', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucune offre test à soumettre. Commence par remplir ton Offre Test.' });
  }

  const data = JSON.parse(existing.content);

  const completeness = checkS6Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  // Load active S4 direction
  const activeDirection = await db.queryOne(
    `SELECT id, context FROM decisions WHERE user_id = ? AND status = 'active' AND decision_type IN ('project','pivot','scope') ORDER BY created_at DESC LIMIT 1`,
    [uid]
  );

  let directionRef = { decision_id: activeDirection?.id ?? null };
  if (activeDirection) {
    try {
      const ctx = JSON.parse(activeDirection.context ?? '{}');
      directionRef = {
        decision_id: activeDirection.id,
        formulation: ctx.direction?.formulation ?? '',
        person: ctx.direction?.person ?? '',
        problem: ctx.direction?.problem ?? '',
      };
    } catch {}
  }

  // Load S5 submitted data for snapshot
  const s5Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's5_target_problem' LIMIT 1`,
    [uid]
  );
  let s5Snapshot = null;
  if (s5Row) {
    try { s5Snapshot = JSON.parse(s5Row.content); } catch {}
  }

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 6 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  const now = new Date().toISOString();
  let submissionId = null;

  await db.transaction(async tx => {
    if (mission) {
      const snapshotContent = JSON.stringify({
        type: 's6_test_offer_snapshot',
        s6_ref: existing.id,
        direction_ref: directionRef,
        audience: data.audience,
        problem: data.problem,
        desired_result: data.desired_result,
        proposition: data.proposition,
        included: data.included,
        delivery: data.delivery,
        pricing: data.pricing,
        client_tomorrow_test: data.client_tomorrow_test,
        epistemic: data.epistemic,
        synthesis: data.synthesis,
        s5_target_who: s5Snapshot?.target_test?.who ?? null,
        s5_problem_situation: s5Snapshot?.problem_to_investigate?.situation ?? null,
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
      eventType: 's6_test_offer_submitted',
      tableName: 'mission_submissions',
      afterState: { mission_submission_id: submissionId, direction_decision_id: directionRef.decision_id },
    });
  });

  const submission = submissionId
    ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId])
    : null;

  return res.json({ ok: true, submission });
});

export default router;
