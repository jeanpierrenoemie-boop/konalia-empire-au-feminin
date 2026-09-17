/**
 * Deterministic gate conditions — Build 7.
 *
 * Each evaluator takes (db, userId) and returns:
 *   { status: 'VERT'|'ORANGE'|'ROUGE', conditions: [{label, met}], missing: string[] }
 *
 * Rules:
 *  - VERT  : all required conditions met, participant may self-validate
 *  - ORANGE: not all conditions met BUT an admin gate_override exists (documented exception)
 *  - ROUGE : conditions not met, no override — gate is blocked
 *
 * AI output alone NEVER satisfies a gate condition.
 * No gate may be unlocked without either real evidence in the DB or an admin override with reason.
 */

function missionSubmitted(db, userId, sprintNumber) {
  return !!db.prepare(`
    SELECT 1 FROM mission_submissions ms
    JOIN missions m ON m.id = ms.mission_id
    WHERE ms.user_id = ? AND m.sprint_number = ?
      AND ms.status IN ('submitted','reviewed','approved')
    LIMIT 1
  `).get(userId, sprintNumber);
}

function weeklyReviewSubmitted(db, userId, sprintNumber) {
  return !!db.prepare(`
    SELECT 1 FROM weekly_reviews
    WHERE user_id = ? AND sprint_number = ? AND status = 'submitted'
    LIMIT 1
  `).get(userId, sprintNumber);
}

function hasActiveDecision(db, userId, types = []) {
  const placeholders = types.map(() => '?').join(',');
  return !!db.prepare(`
    SELECT 1 FROM decisions
    WHERE user_id = ? AND status = 'active'
      AND decision_type IN (${placeholders})
    LIMIT 1
  `).get(userId, ...types);
}

function marketContactsCount(db, userId, statuses = []) {
  const placeholders = statuses.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM market_contacts
    WHERE user_id = ? AND status IN (${placeholders})
  `).get(userId, ...statuses);
  return row?.n ?? 0;
}

function conversationsCount(db, userId) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM market_conversations WHERE user_id = ?`).get(userId);
  return row?.n ?? 0;
}

function signalsCount(db, userId) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM market_signals WHERE user_id = ?`).get(userId);
  return row?.n ?? 0;
}

function proofsCount(db, userId, cadreStep) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ? AND cadre_step = ?`).get(userId, cadreStep);
  return row?.n ?? 0;
}

function getOverride(db, userId, sprintNumber) {
  return db.prepare(`
    SELECT exception_type, reason FROM gate_overrides WHERE user_id = ? AND sprint_number = ?
  `).get(userId, sprintNumber) ?? null;
}

function evaluate(conditions, override) {
  const missing = conditions.filter(c => !c.met).map(c => c.label);
  if (missing.length === 0) return { status: 'VERT', conditions, missing };
  if (override) return { status: override.exception_type, conditions, missing, override_reason: override.reason };
  return { status: 'ROUGE', conditions, missing };
}

/* ── Gate evaluators — keyed by the sprint being UNLOCKED ── */

/* Sprint 1 is unlocked by onboarding completion — no evaluator needed */

/* S2 — requires sprint 1 deliverable (inventaire de situation) */
function gateS2(db, userId) {
  const submitted = missionSubmitted(db, userId, 1) || proofsCount(db, userId, 'C') > 0;
  return evaluate([
    { label: 'Inventaire sprint 1 soumis ou preuve déposée', met: submitted },
  ], getOverride(db, userId, 2));
}

/* S3 (C→A) — requires exploitable paths from Clarifier */
function gateS3(db, userId) {
  const hasMission2 = missionSubmitted(db, userId, 2);
  const hasDecision = hasActiveDecision(db, userId, ['project', 'persona', 'scope', 'other']);
  return evaluate([
    { label: 'Sprint 2 complété (Ressources Exploitables)', met: hasMission2 },
    { label: 'Au moins une décision stratégique validée', met: hasDecision },
  ], getOverride(db, userId, 3));
}

/* S4 — requires arbitration matrix from sprint 3 */
function gateS4(db, userId) {
  const submitted = missionSubmitted(db, userId, 3);
  return evaluate([
    { label: 'Matrice d\'arbitrage sprint 3 soumise', met: submitted },
  ], getOverride(db, userId, 4));
}

/* S5 (A→D) — requires validated direction */
function gateS5(db, userId) {
  const hasMission4 = missionSubmitted(db, userId, 4);
  const hasDirection = hasActiveDecision(db, userId, ['project', 'pivot', 'scope']);
  return evaluate([
    { label: 'Sprint 4 complété (Direction verrouillée)', met: hasMission4 },
    { label: 'Direction validée comme décision active', met: hasDirection },
  ], getOverride(db, userId, 5));
}

/* S6 — requires cible test + problem to investigate */
function gateS6(db, userId) {
  const hasPersona = hasActiveDecision(db, userId, ['persona']);
  const hasMission5 = missionSubmitted(db, userId, 5);
  return evaluate([
    { label: 'Sprint 5 complété (Cible & Problème)', met: hasMission5 },
    { label: 'Persona validé comme décision active', met: hasPersona },
  ], getOverride(db, userId, 6));
}

/* S7 — requires offer test V1 */
function gateS7(db, userId) {
  const submitted = missionSubmitted(db, userId, 6);
  return evaluate([
    { label: 'Offre Minimum Testable sprint 6 soumise', met: submitted },
  ], getOverride(db, userId, 7));
}

/* S8 (D→R) — requires offer + pitch + test price documented */
function gateS8(db, userId) {
  const hasMission7 = missionSubmitted(db, userId, 7);
  const hasProofD = proofsCount(db, userId, 'D') > 0;
  const hasRevenueDecision = hasActiveDecision(db, userId, ['revenue']);
  return evaluate([
    { label: 'Sprint 7 complété (Pitch rédigé)', met: hasMission7 },
    { label: 'Preuve déposée pour l\'étape D', met: hasProofD },
    { label: 'Modèle de revenus / prix test documenté', met: hasRevenueDecision },
  ], getOverride(db, userId, 8));
}

/* S9 — requires first real outreach sent */
function gateS9(db, userId) {
  const contacted = marketContactsCount(db, userId,
    ['contacted', 'conversation_started', 'interested', 'meeting_done', 'converted']) > 0;
  return evaluate([
    { label: 'Au moins un contact marché contacté réellement', met: contacted },
  ], getOverride(db, userId, 9));
}

/* S10 — requires usable real conversation evidence OR ORANGE documented exception */
function gateS10(db, userId) {
  const hasConversation = conversationsCount(db, userId) > 0;
  return evaluate([
    { label: 'Au moins une conversation réelle documentée', met: hasConversation },
  ], getOverride(db, userId, 10));
}

/* S11 (R→E) — market confrontation sufficient for a decision */
function gateS11(db, userId) {
  const hasConversation = conversationsCount(db, userId) > 0;
  const hasSignal = signalsCount(db, userId) > 0;
  return evaluate([
    { label: 'Conversations marché documentées', met: hasConversation },
    { label: 'Signaux marché enregistrés', met: hasSignal },
  ], getOverride(db, userId, 11));
}

/* S12 — requires bilan / go-no-go decision */
function gateS12(db, userId) {
  const hasGoNogo = hasActiveDecision(db, userId, ['go_nogo']);
  const hasMission11 = missionSubmitted(db, userId, 11);
  return evaluate([
    { label: 'Sprint 11 complété (Bilan décisionnel)', met: hasMission11 },
    { label: 'Décision Go/No-Go enregistrée', met: hasGoNogo },
  ], getOverride(db, userId, 12));
}

/* Sprint 12 completion (final) */
function gateFinal(db, userId) {
  const submitted = missionSubmitted(db, userId, 12);
  return evaluate([
    { label: 'Continuité 90 jours soumise (sprint 12)', met: submitted },
  ], getOverride(db, userId, 'final'));
}

export const GATE_EVALUATORS = {
  2: gateS2,
  3: gateS3,
  4: gateS4,
  5: gateS5,
  6: gateS6,
  7: gateS7,
  8: gateS8,
  9: gateS9,
  10: gateS10,
  11: gateS11,
  12: gateS12,
  final: gateFinal,
};

export function evaluateGate(db, userId, sprintNumber) {
  const fn = GATE_EVALUATORS[sprintNumber];
  if (!fn) return null;
  return fn(db, userId);
}
