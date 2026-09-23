/**
 * S8 — PREMIER TEST TERRAIN
 * Routes for S8 First Field Test.
 *
 * Live data stored in participant_data with data_type = 's8_field_test'.
 * On submit: mission_submission created + snapshot stored.
 *
 * RULES:
 * - 0 new strategic decisions
 * - 0 new revenue decisions
 * - 0 new official Proofs
 * - S7/S6/S5/S4 not modified
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's8_field_test';

const VALID_OUTCOMES = [
  'wants_more_info', 'interested_no_commitment', 'declined', 'unclear',
  'follow_up_requested', 'call_booked', 'purchase', 'other',
];

/* ── Default state ──────────────────────────────────────────────── */
function defaultState() {
  return {
    version: 1,
    status: 'draft',
    source_refs: {
      s7_submission_id: null,
      s6_submission_id: null,
      direction_decision_id: null,
    },
    test_context: {
      date: '',
      channel: '',
      person_type: '',
      target_match: null,
      context_note: '',
      real_interaction_confirmed: false,
    },
    presented: {
      offer_sentence_used: '',
      pitch_used: '',
      price_presented: false,
      price_amount: null,
      call_to_action_used: '',
    },
    observed_reaction: {
      initial_reaction: '',
      questions_asked: '',
      objections: '',
      understood: '',
      misunderstood: '',
      interest_shown: null,
    },
    verbatims: [],
    outcome: {
      type: null,
      note: '',
    },
    interpretation: {
      what_i_learned: '',
      what_surprised_me: '',
      what_to_adjust: '',
    },
    next_to_verify: '',
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
export function checkS8Completeness(data) {
  const tc = data.test_context ?? {};
  if (!tc.real_interaction_confirmed)
    return { ok: false, error: 'Confirme que ce test a eu lieu avec une personne réelle (pas une simulation).' };
  if (!tc.date?.trim())
    return { ok: false, error: 'Indique la date du test terrain.' };
  if (!tc.person_type?.trim())
    return { ok: false, error: 'Décris le type de personne rencontrée.' };
  if (!tc.target_match)
    return { ok: false, error: 'Indique si la personne correspond à ta cible test.' };

  const pr = data.presented ?? {};
  if (!pr.offer_sentence_used?.trim())
    return { ok: false, error: 'Indique quelle phrase d\'offre tu as utilisée.' };

  const or = data.observed_reaction ?? {};
  if (!or.initial_reaction?.trim())
    return { ok: false, error: 'Décris la réaction initiale observée.' };

  const out = data.outcome ?? {};
  if (!VALID_OUTCOMES.includes(out.type))
    return { ok: false, error: 'Sélectionne l\'outcome du test terrain.' };

  if (!data.interpretation?.what_i_learned?.trim())
    return { ok: false, error: 'Indique ce que tu penses avoir appris.' };

  if (!data.next_to_verify?.trim())
    return { ok: false, error: 'Indique ce que tu dois vérifier ensuite.' };

  const ep = data.epistemic ?? {};
  if (!ep.facts?.trim() && !ep.facts_acknowledged)
    return { ok: false, error: 'Indique ce que tu sais — ou confirme que tu n\'as rien à ajouter.' };
  if (!ep.assumptions?.trim() && !ep.assumptions_acknowledged)
    return { ok: false, error: 'Indique tes suppositions — ou confirme.' };
  if (!ep.to_verify?.trim() && !ep.to_verify_acknowledged)
    return { ok: false, error: 'Indique ce que tu dois encore vérifier — ou confirme.' };

  return { ok: true, error: null };
}

/* ── GET /api/s8/field-test ─────────────────────────────────────── */
router.get('/field-test', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Verify gate S8 (must be VERT)
  const { evaluateGate } = await import('../gates.js');
  const gate = await evaluateGate(db, uid, 8);
  if (!gate || gate.status !== 'VERT') {
    return res.status(400).json({
      error: 'La gate S8 n\'est pas encore VERTE. Complète et soumets ta Présentation Terrain (Sprint 7) avant de commencer le Sprint 8.',
      gate,
    });
  }

  // Load submitted S7 presentation for prefill
  const s7Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's7_presentation' LIMIT 1`,
    [uid]
  );

  let s7Data = null;
  if (s7Row) {
    try {
      const parsed = JSON.parse(s7Row.content);
      if (parsed.status === 'submitted') s7Data = parsed;
    } catch {}
  }

  if (!s7Data) {
    return res.status(400).json({
      error: 'Aucune Présentation Terrain S7 soumise. Complète et soumets ta Présentation Terrain (Sprint 7) avant de commencer le Sprint 8.',
    });
  }

  // Load submitted S6 for complementary prefill
  const s6Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's6_test_offer' LIMIT 1`,
    [uid]
  );
  let s6Data = null;
  if (s6Row) {
    try {
      const parsed = JSON.parse(s6Row.content);
      if (parsed.status === 'submitted') s6Data = parsed;
    } catch {}
  }

  const s7Ref = {
    submission_id: s7Row.id,
    offer_sentence_formulation: s7Data.offer_sentence?.formulation ?? '',
    pitch_full_text: s7Data.pitch?.full_text ?? '',
    pitch_call_to_action: s7Data.pitch?.call_to_action ?? '',
  };

  const s6Ref = s6Data ? {
    submission_id: s6Row.id,
    audience: s6Data.audience?.formulation ?? '',
    pricing_amount: s6Data.pricing?.amount ?? null,
    pricing_model: s6Data.pricing?.model ?? '',
  } : null;

  // Load existing S8 draft or return prefilled initial state
  const s8Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  if (!s8Row) {
    const prefilled = defaultState();
    prefilled.source_refs.s7_submission_id = s7Row.id;
    prefilled.source_refs.s6_submission_id = s6Row?.id ?? null;
    // Prefill presented offer from S7
    prefilled.presented.offer_sentence_used = s7Data.offer_sentence?.formulation ?? '';
    prefilled.presented.pitch_used = s7Data.pitch?.full_text ?? '';
    prefilled.presented.call_to_action_used = s7Data.pitch?.call_to_action ?? '';
    if (s6Data?.pricing?.amount) {
      prefilled.presented.price_presented = true;
      prefilled.presented.price_amount = s6Data.pricing.amount;
    }

    return res.json({ s8: null, s7_ref: s7Ref, s6_ref: s6Ref, prefill: prefilled });
  }

  const parsed = JSON.parse(s8Row.content);
  return res.json({
    s8: { id: s8Row.id, ...parsed, updated_at: s8Row.updated_at },
    s7_ref: s7Ref,
    s6_ref: s6Ref,
  });
});

/* ── PUT /api/s8/field-test ─────────────────────────────────────── */
router.put('/field-test', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : defaultState();

  if (current.status === 'submitted') {
    return res.status(409).json({ error: 'Ce test terrain a déjà été soumis. Il ne peut plus être modifié.' });
  }

  const {
    source_refs, test_context, presented, observed_reaction,
    verbatims, outcome, interpretation, next_to_verify,
    epistemic, synthesis,
  } = req.body ?? {};

  const merged = {
    version: 1,
    status: 'draft',
    source_refs: source_refs !== undefined
      ? { ...current.source_refs, ...source_refs }
      : current.source_refs,
    test_context: test_context !== undefined
      ? { ...current.test_context, ...test_context }
      : current.test_context,
    presented: presented !== undefined
      ? { ...current.presented, ...presented }
      : current.presented,
    observed_reaction: observed_reaction !== undefined
      ? { ...current.observed_reaction, ...observed_reaction }
      : current.observed_reaction,
    verbatims: verbatims !== undefined ? verbatims : current.verbatims,
    outcome: outcome !== undefined
      ? { ...current.outcome, ...outcome }
      : current.outcome,
    interpretation: interpretation !== undefined
      ? { ...current.interpretation, ...interpretation }
      : current.interpretation,
    next_to_verify: next_to_verify !== undefined ? String(next_to_verify ?? '') : current.next_to_verify,
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

  return res.json({ ok: true, s8: { id, ...merged } });
});

/* ── POST /api/s8/field-test/submit ────────────────────────────── */
router.post('/field-test/submit', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucun test terrain à soumettre. Commence par remplir ton Premier Test Terrain.' });
  }

  const data = JSON.parse(existing.content);

  const completeness = checkS8Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  // Load S7 for snapshot context
  const s7Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's7_presentation' LIMIT 1`,
    [uid]
  );
  let s7Snapshot = null;
  if (s7Row) {
    try { s7Snapshot = JSON.parse(s7Row.content); } catch {}
  }

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 8 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  const now = new Date().toISOString();
  let submissionId = null;

  await db.transaction(async tx => {
    // 1. Mission submission (sprint_number=8)
    if (mission) {
      const snapshotContent = JSON.stringify({
        type: 's8_field_test_snapshot',
        s8_ref: existing.id,
        test_context: data.test_context,
        presented: data.presented,
        observed_reaction: data.observed_reaction,
        verbatims: data.verbatims,
        outcome: data.outcome,
        interpretation: data.interpretation,
        next_to_verify: data.next_to_verify,
        epistemic: data.epistemic,
        synthesis: data.synthesis,
        s7_offer_sentence: s7Snapshot?.offer_sentence?.formulation ?? null,
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
      eventType: 's8_field_test_submitted',
      tableName: 'mission_submissions',
      afterState: {
        mission_submission_id: submissionId,
        outcome_type: data.outcome?.type ?? null,
      },
    });
  });

  const submission = submissionId
    ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId])
    : null;

  return res.json({ ok: true, submission });
});

export default router;
