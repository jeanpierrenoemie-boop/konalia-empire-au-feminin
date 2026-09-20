/**
 * S7 — DIRE CE QUE TU VENDS
 * Routes for S7 Presentation Terrain.
 *
 * Live data stored in participant_data with data_type = 's7_presentation'.
 * On submit: mission_submission created + Proof #2 created (idempotent) + snapshot stored.
 *
 * RULES:
 * - 0 new strategic decisions
 * - 0 revenue decisions
 * - 1 new official proof (Proof #2 "02 — Mon Offre Test", idempotent)
 * - S6 not modified
 * - S4 direction not modified
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

const DATA_TYPE = 's7_presentation';

/* ── Default state ──────────────────────────────────────────────── */
function defaultState() {
  return {
    version: 1,
    status: 'draft',
    source_refs: {
      s6_submission_id: null,
      direction_decision_id: null,
    },
    offer_sentence: {
      who: '',
      result: '',
      proposition: '',
      formulation: '',
    },
    pitch: {
      problem: '',
      who_you_are: '',
      what_you_propose: '',
      expected_result: '',
      call_to_action: '',
      full_text: '',
    },
    without_notes: {
      practiced: false,
      note: '',
    },
    understanding_check: {
      natural_version: '',
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
    proof_id: null,
    submitted_at: null,
  };
}

/* ── Completeness check ─────────────────────────────────────────── */
function checkS7Completeness(data) {
  const os = data.offer_sentence ?? {};
  if (!os.formulation?.trim()) return { ok: false, error: 'Formule ta phrase d\'offre complète.' };

  const p = data.pitch ?? {};
  if (!p.problem?.trim()) return { ok: false, error: 'Décris le problème dans ton pitch.' };
  if (!p.what_you_propose?.trim()) return { ok: false, error: 'Décris ce que tu proposes dans ton pitch.' };
  if (!p.expected_result?.trim()) return { ok: false, error: 'Indique le résultat attendu dans ton pitch.' };
  if (!p.call_to_action?.trim()) return { ok: false, error: 'Ajoute un appel à action dans ton pitch.' };

  if (!data.without_notes?.practiced)
    return { ok: false, error: 'Confirme avoir pratiqué ton pitch sans tes notes.' };

  if (!data.understanding_check?.natural_version?.trim())
    return { ok: false, error: 'Réponds à la question : que dirais-tu à une inconnue ?' };

  const ep = data.epistemic ?? {};
  if (!ep.facts?.trim() && !ep.facts_acknowledged)
    return { ok: false, error: 'Indique ce que tu sais — ou confirme que tu n\'as rien à ajouter.' };
  if (!ep.assumptions?.trim() && !ep.assumptions_acknowledged)
    return { ok: false, error: 'Indique tes suppositions — ou confirme.' };
  if (!ep.to_verify?.trim() && !ep.to_verify_acknowledged)
    return { ok: false, error: 'Indique ce que tu dois vérifier — ou confirme.' };

  return { ok: true, error: null };
}

/* ── GET /api/s7/presentation ───────────────────────────────────── */
router.get('/presentation', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  // Load submitted S6 test offer
  const s6Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's6_test_offer' LIMIT 1`,
    [uid]
  );

  let s6Data = null;
  if (s6Row) {
    try {
      const parsed = JSON.parse(s6Row.content);
      if (parsed.status === 'submitted') {
        s6Data = parsed;
      }
    } catch {}
  }

  if (!s6Data) {
    return res.status(400).json({ error: 'Aucune Offre Test S6 soumise. Complète et soumets ton Offre Test (Sprint 6) avant de commencer le Sprint 7.' });
  }

  // Load active S4 direction for context
  const activeDirection = await db.queryOne(
    `SELECT id, context FROM decisions WHERE user_id = ? AND status = 'active' AND decision_type IN ('project','pivot','scope') ORDER BY created_at DESC LIMIT 1`,
    [uid]
  );

  let directionRef = null;
  if (activeDirection) {
    try {
      const ctx = JSON.parse(activeDirection.context ?? '{}');
      directionRef = {
        decision_id: activeDirection.id,
        formulation: ctx.direction?.formulation ?? '',
        person: ctx.direction?.person ?? '',
        problem: ctx.direction?.problem ?? '',
      };
    } catch {
      directionRef = { decision_id: activeDirection.id };
    }
  }

  const s6Ref = {
    submission_id: s6Row.id,
    audience: s6Data.audience?.formulation ?? '',
    problem: s6Data.problem?.formulation ?? '',
    desired_result: s6Data.desired_result?.formulation ?? '',
    proposition: s6Data.proposition?.description ?? '',
    pricing_amount: s6Data.pricing?.amount ?? null,
    pricing_model: s6Data.pricing?.model ?? '',
  };

  const s7Row = await db.queryOne(
    `SELECT id, content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  if (!s7Row) {
    const prefilled = defaultState();
    prefilled.source_refs.s6_submission_id = s6Row.id;
    prefilled.source_refs.direction_decision_id = activeDirection?.id ?? null;
    // Prefill offer sentence from S6
    prefilled.offer_sentence.who = s6Data.audience?.formulation ?? '';
    prefilled.offer_sentence.result = s6Data.desired_result?.formulation ?? '';
    prefilled.offer_sentence.proposition = s6Data.proposition?.description ?? '';

    return res.json({ s7: null, s6_ref: s6Ref, direction_ref: directionRef, prefill: prefilled });
  }

  const parsed = JSON.parse(s7Row.content);
  return res.json({
    s7: { id: s7Row.id, ...parsed, updated_at: s7Row.updated_at },
    s6_ref: s6Ref,
    direction_ref: directionRef,
  });
});

/* ── PUT /api/s7/presentation ───────────────────────────────────── */
router.put('/presentation', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );

  const current = existing ? JSON.parse(existing.content) : defaultState();

  if (current.status === 'submitted') {
    return res.status(409).json({ error: 'Cette présentation terrain a déjà été soumise. Elle ne peut plus être modifiée.' });
  }

  const {
    source_refs, offer_sentence, pitch, without_notes,
    understanding_check, epistemic, synthesis,
  } = req.body ?? {};

  const merged = {
    version: 1,
    status: 'draft',
    source_refs: source_refs !== undefined
      ? { ...current.source_refs, ...source_refs }
      : current.source_refs,
    offer_sentence: offer_sentence !== undefined
      ? { ...current.offer_sentence, ...offer_sentence }
      : current.offer_sentence,
    pitch: pitch !== undefined
      ? { ...current.pitch, ...pitch }
      : current.pitch,
    without_notes: without_notes !== undefined
      ? { ...current.without_notes, ...without_notes }
      : current.without_notes,
    understanding_check: understanding_check !== undefined
      ? { ...current.understanding_check, ...understanding_check }
      : current.understanding_check,
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
    proof_id: current.proof_id ?? null,
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

  return res.json({ ok: true, s7: { id, ...merged } });
});

/* ── POST /api/s7/presentation/submit ──────────────────────────── */
router.post('/presentation/submit', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  const existing = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = ? LIMIT 1`,
    [uid, DATA_TYPE]
  );
  if (!existing) {
    return res.status(400).json({ error: 'Aucune présentation terrain à soumettre. Commence par remplir ta Présentation Terrain.' });
  }

  const data = JSON.parse(existing.content);

  const completeness = checkS7Completeness(data);
  if (!completeness.ok) {
    return res.status(422).json({ error: completeness.error });
  }

  // Load S6 for snapshot
  const s6Row = await db.queryOne(
    `SELECT id, content FROM participant_data WHERE owner_id = ? AND data_type = 's6_test_offer' LIMIT 1`,
    [uid]
  );
  let s6Snapshot = null;
  if (s6Row) {
    try { s6Snapshot = JSON.parse(s6Row.content); } catch {}
  }

  const enrollment = await db.queryOne(
    `SELECT cohort_id FROM enrollments WHERE user_id = ? AND status = 'active' ORDER BY enrolled_at DESC LIMIT 1`,
    [uid]
  );
  const cohortId = enrollment?.cohort_id ?? null;

  const mission = await db.queryOne(
    `SELECT id FROM missions WHERE sprint_number = 7 AND (cohort_id IS NULL OR cohort_id = ?) ORDER BY cohort_id DESC LIMIT 1`,
    [cohortId ?? null]
  );

  const now = new Date().toISOString();
  let submissionId = null;

  await db.transaction(async tx => {
    // 1. Mission submission
    if (mission) {
      const snapshotContent = JSON.stringify({
        type: 's7_presentation_snapshot',
        s7_ref: existing.id,
        offer_sentence: data.offer_sentence,
        pitch: data.pitch,
        without_notes: data.without_notes,
        understanding_check: data.understanding_check,
        epistemic: data.epistemic,
        synthesis: data.synthesis,
        s6_audience: s6Snapshot?.audience?.formulation ?? null,
        s6_problem: s6Snapshot?.problem?.formulation ?? null,
        s6_pricing_amount: s6Snapshot?.pricing?.amount ?? null,
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

    // 2. Proof #2 — idempotent
    let proofId = null;
    if (data.proof_id) {
      const existingProof = await tx.queryOne(`SELECT id FROM proofs WHERE id = ?`, [data.proof_id]);
      if (existingProof) {
        proofId = data.proof_id;
      }
    }
    if (!proofId) {
      proofId = randomUUID();
      const proofContent = JSON.stringify({
        type: '02 — MON OFFRE TEST',
        offer_sentence_formulation: data.offer_sentence?.formulation ?? '',
        pitch_full_text: data.pitch?.full_text ?? '',
        s6_audience: s6Snapshot?.audience?.formulation ?? null,
        s6_proposition: s6Snapshot?.proposition?.description ?? null,
        s6_pricing_amount: s6Snapshot?.pricing?.amount ?? null,
        s6_pricing_model: s6Snapshot?.pricing?.model ?? null,
        submitted_at: now,
        submission_id: submissionId ?? null,
      });
      await tx.execute(
        `INSERT INTO proofs (id, user_id, submission_id, proof_type, title, content, cadre_step, is_public, created_at, updated_at)
         VALUES (?, ?, ?, 'note', '02 — Mon Offre Test', ?, 'D', 0, ?, ?)`,
        [proofId, uid, submissionId ?? null, proofContent, now, now]
      );
    }

    // 3. Update participant_data status=submitted + proof_id
    const submittedContent = JSON.stringify({
      ...data,
      status: 'submitted',
      submitted_at: now,
      proof_id: proofId,
      mission_submission_id: submissionId ?? null,
    });

    await tx.execute(
      `UPDATE participant_data SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      [submittedContent, existing.id]
    );

    await tx.writeAudit({
      actorId: uid,
      targetUserId: uid,
      eventType: 's7_presentation_submitted',
      tableName: 'mission_submissions',
      afterState: { mission_submission_id: submissionId, proof_id: proofId },
    });
  });

  const submission = submissionId
    ? await db.queryOne(`SELECT * FROM mission_submissions WHERE id = ?`, [submissionId])
    : null;

  return res.json({ ok: true, submission });
});

export default router;
