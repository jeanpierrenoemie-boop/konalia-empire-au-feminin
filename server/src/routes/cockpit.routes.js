import { Router } from 'express';
import { getAdapter } from '../db/adapter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { denyTestInProduction } from '../middleware/requireRole.js';

const router = Router();
router.use(requireAuth, denyTestInProduction);

/* ── GET /api/cockpit ──────────────────────────────────────────────
   Returns all data needed to answer the 5 cockpit questions.
   All rows are scoped to req.user.id — no cross-user leakage.
───────────────────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  const db = getAdapter();
  const uid = req.user.id;

  /* 1. Current progress */
  const progress = await db.queryOne(`
    SELECT up.*, c.name AS cohort_name
    FROM user_progress up
    LEFT JOIN cohorts c ON c.id = up.cohort_id
    WHERE up.user_id = ?
    LIMIT 1
  `, [uid]);

  /* 2. Pilotage state */
  const pilotage = await db.queryOne(
    'SELECT * FROM pilotage_state WHERE user_id = ?',
    [uid]
  );

  /* 3. Current mission (active submission or first unsubmitted mission) */
  const currentMission = progress ? await db.queryOne(`
    SELECT m.id, m.title, m.description, m.mission_type, m.cadre_step, m.sprint_number,
           ms.status AS submission_status, ms.id AS submission_id
    FROM missions m
    LEFT JOIN mission_submissions ms ON ms.mission_id = m.id AND ms.user_id = ?
    WHERE (m.cohort_id = ? OR m.cohort_id IS NULL)
      AND m.cadre_step = ?
      AND (ms.status IS NULL OR ms.status IN ('draft','submitted'))
    ORDER BY m.sort_order ASC
    LIMIT 1
  `, [uid, progress.cohort_id, progress.cadre_step]) : null;

  /* 4. Proofs — count by type */
  const proofCounts = await db.queryAll(`
    SELECT proof_type, COUNT(*) as count
    FROM proofs
    WHERE user_id = ?
    GROUP BY proof_type
  `, [uid]);

  const PROOF_TYPES = ['screenshot', 'note', 'link', 'conversation', 'signal'];
  const proofs = PROOF_TYPES.map(t => ({
    type: t,
    count: proofCounts.find(p => p.proof_type === t)?.count ?? 0,
  }));
  const totalProofs = proofs.reduce((s, p) => s + p.count, 0);

  /* 5. Last validated decision (most recent) */
  const lastDecision = await db.queryOne(`
    SELECT id, decision_type, title, rationale, created_at
    FROM decisions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [uid]);

  /* 6. Last market action (contact or conversation, most recent) */
  const lastContact = await db.queryOne(`
    SELECT name, status, created_at, 'contact' AS kind
    FROM market_contacts
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [uid]);

  const lastConversation = await db.queryOne(`
    SELECT title, format, date_occurred AS created_at, 'conversation' AS kind
    FROM market_conversations
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [uid]);

  let lastMarketAction = null;
  if (lastContact && lastConversation) {
    lastMarketAction = lastContact.created_at >= lastConversation.created_at
      ? lastContact : lastConversation;
  } else {
    lastMarketAction = lastContact ?? lastConversation ?? null;
  }

  /* 7. Parking ideas counts — PAS MAINTENANT block */
  const parkingRows = await db.queryAll(`
    SELECT dispersion_status, COUNT(*) AS n
    FROM parking_ideas WHERE user_id = ?
    GROUP BY dispersion_status
  `, [uid]);

  const parkingByStatus = {};
  for (const row of parkingRows) parkingByStatus[row.dispersion_status ?? 'PARKING'] = row.n;

  const parkingCount = (parkingByStatus['PARKING'] ?? 0)
    + (parkingByStatus['TESTER_PLUS_TARD'] ?? 0)
    + (parkingByStatus['null'] ?? 0);
  const agirMaintenantCount = parkingByStatus['AGIR_MAINTENANT'] ?? 0;

  /* 8. Project passport */
  const passport = await db.queryOne(`
    SELECT project_name, stage, vision
    FROM project_passport WHERE user_id = ?
  `, [uid]);

  /* 9. Support requests open */
  const openSupport = await db.queryOne(
    `SELECT COUNT(*) as count FROM support_requests WHERE user_id = ? AND status = 'open'`,
    [uid]
  );

  /* 10. S1 inventory status — only relevant when on sprint 1 */
  let s1Inventory = null;
  if (progress?.sprint_number === 1) {
    const inv = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's1_inventory' LIMIT 1`,
      [uid]
    );
    if (inv) {
      const parsed = JSON.parse(inv.content);
      const sections = parsed.sections ?? {};
      const sectionsFilled = ['A','B','C','D','E'].filter(k => {
        const s = sections[k];
        if (Array.isArray(s)) return s.some(e => e && String(e).trim());
        if (s && typeof s === 'object') return Object.values(s).some(v => v && String(v).trim());
        return false;
      }).length;
      s1Inventory = {
        status: parsed.status ?? 'draft',
        sectionsFilled,
        hasObservation: !!(parsed.observation ?? '').trim(),
        updatedAt: inv.updated_at,
      };
    }
  }

  /* 11. S2 paths status — only relevant when on sprint 2 */
  let s2Paths = null;
  if (progress?.sprint_number === 2 || progress?.sprint_number === 3) {
    const s2Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's2_paths' LIMIT 1`,
      [uid]
    );
    if (s2Row) {
      const parsed = JSON.parse(s2Row.content);
      const paths = parsed.paths ?? [];
      s2Paths = {
        status: parsed.status ?? 'draft',
        totalPaths: paths.filter(p => p.status !== 'discarded').length,
        retainedPaths: paths.filter(p => p.status === 'retained').length,
        updatedAt: s2Row.updated_at,
      };
    }
  }

  /* 12. S3 arbitration status — only relevant when on sprint 3 */
  let s3Arbitration = null;
  if (progress?.sprint_number === 3) {
    const s3Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's3_arbitration' LIMIT 1`,
      [uid]
    );
    if (s3Row) {
      const parsed = JSON.parse(s3Row.content);
      const matrix = parsed.matrix ?? [];
      const snapshotPaths = parsed.s2_snapshot_paths ?? [];
      s3Arbitration = {
        status: parsed.status ?? 'draft',
        pathsCompared: snapshotPaths.length,
        criteriaFilled: matrix.filter(m => {
          const c = m.criteria ?? {};
          return ['envie_reelle','ressources_existantes','acces_personnes','probleme_a_explorer',
                  'compatibilite_vie','simplicite_premier_test','niveau_inconnu']
            .every(k => ['FORT','MOYEN','FAIBLE'].includes(c[k]?.rating));
        }).length,
        priorityPathId: parsed.priority_path_id ?? null,
        updatedAt: s3Row.updated_at,
      };
    }
  }

  /* 13. S4 direction status — only relevant when on sprint 4 */
  let s4Direction = null;
  if (progress?.sprint_number === 4) {
    const s4Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's4_direction' LIMIT 1`,
      [uid]
    );
    if (s4Row) {
      const parsed = JSON.parse(s4Row.content);
      s4Direction = {
        status: parsed.status ?? 'draft',
        formulation: parsed.direction?.formulation ?? null,
        person: parsed.direction?.person ?? null,
        problem: parsed.direction?.problem ?? null,
        participantConfirmed: parsed.participant_confirmed ?? false,
        decisionId: parsed.decision_id ?? null,
        updatedAt: s4Row.updated_at,
      };
    }
  }

  /* 14. S5 target-problem status — only relevant when on sprint 5 */
  let s5TargetProblem = null;
  if (progress?.sprint_number === 5) {
    const s5Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's5_target_problem' LIMIT 1`,
      [uid]
    );
    if (s5Row) {
      const parsed = JSON.parse(s5Row.content);
      s5TargetProblem = {
        status: parsed.status ?? 'draft',
        targetWho: parsed.target_test?.who ?? null,
        fivePersonAnswer: parsed.five_person_test?.answer ?? null,
        problemSituation: parsed.problem_to_investigate?.situation ?? null,
        updatedAt: s5Row.updated_at,
      };
    }
  }

  /* 15. S6 test offer status — only relevant when on sprint 6 */
  let s6TestOffer = null;
  if (progress?.sprint_number === 6) {
    const s6Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's6_test_offer' LIMIT 1`,
      [uid]
    );
    if (s6Row) {
      const parsed = JSON.parse(s6Row.content);
      s6TestOffer = {
        status: parsed.status ?? 'draft',
        audienceFormulation: parsed.audience?.formulation ?? null,
        resultFormulation: parsed.desired_result?.formulation ?? null,
        pricingAmount: parsed.pricing?.amount ?? null,
        pricingStatus: parsed.pricing?.status ?? null,
        clientTomorrowAnswer: parsed.client_tomorrow_test?.answer ?? null,
        updatedAt: s6Row.updated_at,
      };
    }
  }

  /* 16. S7 presentation status — only relevant when on sprint 7 or 8 (read-only ref) */
  let s7Presentation = null;
  if (progress?.sprint_number === 7) {
    const s7Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's7_presentation' LIMIT 1`,
      [uid]
    );
    if (s7Row) {
      const parsed = JSON.parse(s7Row.content);
      s7Presentation = {
        status: parsed.status ?? 'draft',
        offerSentence: parsed.offer_sentence?.formulation ?? null,
        withoutNotesPracticed: parsed.without_notes?.practiced ?? false,
        proofId: parsed.proof_id ?? null,
        updatedAt: s7Row.updated_at,
      };
    }
  }

  /* 17. S8 field test status — only relevant when on sprint 8 */
  let s8FieldTest = null;
  if (progress?.sprint_number === 8) {
    const s8Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's8_field_test' LIMIT 1`,
      [uid]
    );
    if (s8Row) {
      const parsed = JSON.parse(s8Row.content);
      s8FieldTest = {
        status: parsed.status ?? 'draft',
        testedAt: parsed.test_context?.date ?? null,
        targetMatch: parsed.test_context?.target_match ?? null,
        outcome: parsed.outcome?.type ?? null,
        pricePresented: parsed.presented?.price_presented ?? false,
        nextToVerify: parsed.next_to_verify ?? null,
        updatedAt: s8Row.updated_at,
      };
    }
  }

  /* 18. S9 learning review — only relevant when on sprint 9 or 10 */
  let s9LearningReview = null;
  if (progress?.sprint_number === 9 || progress?.sprint_number === 10) {
    const s9Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's9_learning_review' LIMIT 1`,
      [uid]
    );
    if (s9Row) {
      const parsed = JSON.parse(s9Row.content);
      s9LearningReview = {
        status: parsed.status ?? 'draft',
        observationCount: (parsed.observations ?? []).length,
        priorityHypothesis: parsed.hypothesis_to_test?.formulation ?? null,
        nextTestQuestion: parsed.next_test?.question ?? null,
        nextTestTarget: parsed.next_test?.target_person ?? null,
        updatedAt: s9Row.updated_at,
      };
    }
  }

  /* 19. S10 iteration plan — only relevant when on sprint 10 or 11 (read-only ref) */
  let s10IterationPlan = null;
  if (progress?.sprint_number === 10 || progress?.sprint_number === 11) {
    const s10Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's10_iteration_plan' LIMIT 1`,
      [uid]
    );
    if (s10Row) {
      const parsed = JSON.parse(s10Row.content);
      s10IterationPlan = {
        status: parsed.status ?? 'draft',
        hypothesis: parsed.iteration?.hypothesis ?? null,
        variableUnderTest: parsed.iteration?.variable_under_test ?? null,
        variableCategory: parsed.iteration?.variable_category ?? null,
        nextTestTarget: parsed.test_plan?.target_person ?? null,
        observationCriteria: parsed.observation_criteria?.data_to_observe ?? null,
        completionCriterion: parsed.observation_criteria?.completion_criterion ?? null,
        nextAction: parsed.test_plan?.main_question ?? null,
        updatedAt: s10Row.updated_at,
      };
    }
  }

  /* 20. S11 real decision — only relevant when on sprint 11 */
  let s11RealDecision = null;
  if (progress?.sprint_number === 11) {
    const s11Row = await db.queryOne(
      `SELECT content, updated_at FROM participant_data WHERE owner_id = ? AND data_type = 's11_real_decision' LIMIT 1`,
      [uid]
    );
    if (s11Row) {
      const parsed = JSON.parse(s11Row.content);
      s11RealDecision = {
        status: parsed.status ?? 'draft',
        decision: parsed.decision ?? null,
        justification: parsed.justification ?? null,
        nextAction: parsed.next_action ?? null,
        signalsRecurringCount: (parsed.signals?.recurring ?? []).length,
        signalsContradictoryCount: (parsed.signals?.contradictory ?? []).length,
        updatedAt: s11Row.updated_at,
      };
    }
  }

  return res.json({
    progress: progress ?? null,
    pilotage: pilotage ?? null,
    currentMission: currentMission ?? null,
    proofs,
    totalProofs,
    lastDecision: lastDecision ?? null,
    lastMarketAction: lastMarketAction ?? null,
    parkingCount,
    agirMaintenantCount,
    passport: passport ?? null,
    openSupportCount: openSupport?.count ?? 0,
    s1Inventory,
    s2Paths,
    s3Arbitration,
    s4Direction,
    s5TargetProblem,
    s6TestOffer,
    s7Presentation,
    s8FieldTest,
    s9LearningReview,
    s10IterationPlan,
    s11RealDecision,
  });
});

export default router;
