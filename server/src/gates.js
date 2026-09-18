/**
 * Deterministic gate conditions — Build 7 (async adapter — Build 20).
 *
 * Dual-mode: works synchronously with a raw better-sqlite3 db (test files pass this)
 * and asynchronously with the async adapter (route files pass this).
 * evaluateGate detects the db type and returns a plain value or a Promise accordingly.
 */

/* ── Sync helpers (raw better-sqlite3) ─────────────────────────────────────── */

function _missionSubmittedSync(db, userId, sprintNumber) {
  return !!db.prepare(`
    SELECT 1 FROM mission_submissions ms
    JOIN missions m ON m.id = ms.mission_id
    WHERE ms.user_id = ? AND m.sprint_number = ?
      AND ms.status IN ('submitted','reviewed','approved')
    LIMIT 1
  `).get(userId, sprintNumber);
}

function _hasActiveDecisionSync(db, userId, types) {
  const placeholders = types.map(() => '?').join(',');
  return !!db.prepare(`
    SELECT 1 FROM decisions
    WHERE user_id = ? AND status = 'active'
      AND decision_type IN (${placeholders})
    LIMIT 1
  `).get(userId, ...types);
}

function _marketContactsCountSync(db, userId, statuses) {
  const placeholders = statuses.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM market_contacts
    WHERE user_id = ? AND status IN (${placeholders})
  `).get(userId, ...statuses);
  return row?.n ?? 0;
}

function _conversationsCountSync(db, userId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM market_conversations WHERE user_id = ?`).get(userId)?.n ?? 0;
}

function _signalsCountSync(db, userId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM market_signals WHERE user_id = ?`).get(userId)?.n ?? 0;
}

function _proofsCountSync(db, userId, cadreStep) {
  return db.prepare(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ? AND cadre_step = ?`).get(userId, cadreStep)?.n ?? 0;
}

function _getOverrideSync(db, userId, sprintNumber) {
  return db.prepare(`SELECT exception_type, reason FROM gate_overrides WHERE user_id = ? AND sprint_number = ?`)
    .get(userId, sprintNumber) ?? null;
}

/* ── Async helpers (adapter) ────────────────────────────────────────────────── */

async function _missionSubmitted(db, userId, sprintNumber) {
  const row = await db.queryOne(`
    SELECT 1 FROM mission_submissions ms
    JOIN missions m ON m.id = ms.mission_id
    WHERE ms.user_id = ? AND m.sprint_number = ?
      AND ms.status IN ('submitted','reviewed','approved')
    LIMIT 1
  `, [userId, sprintNumber]);
  return !!row;
}

async function _hasActiveDecision(db, userId, types) {
  const placeholders = types.map(() => '?').join(',');
  const row = await db.queryOne(`
    SELECT 1 FROM decisions
    WHERE user_id = ? AND status = 'active'
      AND decision_type IN (${placeholders})
    LIMIT 1
  `, [userId, ...types]);
  return !!row;
}

async function _marketContactsCount(db, userId, statuses) {
  const placeholders = statuses.map(() => '?').join(',');
  const row = await db.queryOne(`
    SELECT COUNT(*) AS n FROM market_contacts
    WHERE user_id = ? AND status IN (${placeholders})
  `, [userId, ...statuses]);
  return row?.n ?? 0;
}

async function _conversationsCount(db, userId) {
  const row = await db.queryOne(`SELECT COUNT(*) AS n FROM market_conversations WHERE user_id = ?`, [userId]);
  return row?.n ?? 0;
}

async function _signalsCount(db, userId) {
  const row = await db.queryOne(`SELECT COUNT(*) AS n FROM market_signals WHERE user_id = ?`, [userId]);
  return row?.n ?? 0;
}

async function _proofsCount(db, userId, cadreStep) {
  const row = await db.queryOne(`SELECT COUNT(*) AS n FROM proofs WHERE user_id = ? AND cadre_step = ?`, [userId, cadreStep]);
  return row?.n ?? 0;
}

async function _getOverride(db, userId, sprintNumber) {
  return (await db.queryOne(`
    SELECT exception_type, reason FROM gate_overrides WHERE user_id = ? AND sprint_number = ?
  `, [userId, sprintNumber])) ?? null;
}

/* ── Shared ─────────────────────────────────────────────────────────────────── */

function evaluate(conditions, override) {
  const missing = conditions.filter(c => !c.met).map(c => c.label);
  if (missing.length === 0) return { status: 'VERT', conditions, missing };
  if (override) return { status: override.exception_type, conditions, missing, override_reason: override.reason };
  return { status: 'ROUGE', conditions, missing };
}

/* ── Sync gate evaluators ────────────────────────────────────────────────────── */

function gateS2Sync(db, userId) {
  const submitted = _missionSubmittedSync(db, userId, 1) || _proofsCountSync(db, userId, 'C') > 0;
  return evaluate([{ label: 'Inventaire sprint 1 soumis ou preuve deposee', met: submitted }], _getOverrideSync(db, userId, 2));
}
function gateS3Sync(db, userId) {
  return evaluate([
    { label: 'Pistes S2 soumises', met: _missionSubmittedSync(db, userId, 2) },
  ], _getOverrideSync(db, userId, 3));
}
function gateS4Sync(db, userId) {
  return evaluate([{ label: 'Matrice arbitrage sprint 3 soumise', met: _missionSubmittedSync(db, userId, 3) }], _getOverrideSync(db, userId, 4));
}
function gateS5Sync(db, userId) {
  return evaluate([
    { label: 'Sprint 4 complete', met: _missionSubmittedSync(db, userId, 4) },
    { label: 'Direction validee', met: _hasActiveDecisionSync(db, userId, ['project','pivot','scope']) },
  ], _getOverrideSync(db, userId, 5));
}
function gateS6Sync(db, userId) {
  return evaluate([
    { label: 'Sprint 5 complete', met: _missionSubmittedSync(db, userId, 5) },
    { label: 'Persona valide', met: _hasActiveDecisionSync(db, userId, ['persona']) },
  ], _getOverrideSync(db, userId, 6));
}
function gateS7Sync(db, userId) {
  return evaluate([{ label: 'Offre Minimum Testable sprint 6 soumise', met: _missionSubmittedSync(db, userId, 6) }], _getOverrideSync(db, userId, 7));
}
function gateS8Sync(db, userId) {
  return evaluate([
    { label: 'Sprint 7 complete', met: _missionSubmittedSync(db, userId, 7) },
    { label: 'Preuve deposee etape D', met: _proofsCountSync(db, userId, 'D') > 0 },
    { label: 'Modele de revenus documente', met: _hasActiveDecisionSync(db, userId, ['revenue']) },
  ], _getOverrideSync(db, userId, 8));
}
function gateS9Sync(db, userId) {
  return evaluate([
    { label: 'Au moins un contact contacte', met: _marketContactsCountSync(db, userId, ['en_cours','converti']) > 0 },
  ], _getOverrideSync(db, userId, 9));
}
function gateS10Sync(db, userId) {
  return evaluate([{ label: 'Au moins une conversation documentee', met: _conversationsCountSync(db, userId) > 0 }], _getOverrideSync(db, userId, 10));
}
function gateS11Sync(db, userId) {
  return evaluate([
    { label: 'Conversations documentees', met: _conversationsCountSync(db, userId) > 0 },
    { label: 'Signaux marche enregistres', met: _signalsCountSync(db, userId) > 0 },
  ], _getOverrideSync(db, userId, 11));
}
function gateS12Sync(db, userId) {
  return evaluate([
    { label: 'Sprint 11 complete', met: _missionSubmittedSync(db, userId, 11) },
    { label: 'Decision Go/No-Go enregistree', met: _hasActiveDecisionSync(db, userId, ['go_nogo']) },
  ], _getOverrideSync(db, userId, 12));
}
function gateFinalSync(db, userId) {
  return evaluate([{ label: 'Continuite 90 jours soumise', met: _missionSubmittedSync(db, userId, 12) }], _getOverrideSync(db, userId, 'final'));
}

/* ── Async gate evaluators ────────────────────────────────────────────────────── */

async function gateS2(db, userId) {
  const [submitted, proofs, override] = await Promise.all([_missionSubmitted(db, userId, 1), _proofsCount(db, userId, 'C'), _getOverride(db, userId, 2)]);
  return evaluate([{ label: 'Inventaire sprint 1 soumis ou preuve deposee', met: submitted || proofs > 0 }], override);
}
async function gateS3(db, userId) {
  const [hasMission2, override] = await Promise.all([_missionSubmitted(db, userId, 2), _getOverride(db, userId, 3)]);
  return evaluate([{ label: 'Pistes S2 soumises', met: hasMission2 }], override);
}
async function gateS4(db, userId) {
  const [submitted, override] = await Promise.all([_missionSubmitted(db, userId, 3), _getOverride(db, userId, 4)]);
  return evaluate([{ label: 'Matrice arbitrage sprint 3 soumise', met: submitted }], override);
}
async function gateS5(db, userId) {
  const [hasMission4, hasDirection, override] = await Promise.all([_missionSubmitted(db, userId, 4), _hasActiveDecision(db, userId, ['project','pivot','scope']), _getOverride(db, userId, 5)]);
  return evaluate([{ label: 'Sprint 4 complete', met: hasMission4 }, { label: 'Direction validee', met: hasDirection }], override);
}
async function gateS6(db, userId) {
  const [hasPersona, hasMission5, override] = await Promise.all([_hasActiveDecision(db, userId, ['persona']), _missionSubmitted(db, userId, 5), _getOverride(db, userId, 6)]);
  return evaluate([{ label: 'Sprint 5 complete', met: hasMission5 }, { label: 'Persona valide', met: hasPersona }], override);
}
async function gateS7(db, userId) {
  const [submitted, override] = await Promise.all([_missionSubmitted(db, userId, 6), _getOverride(db, userId, 7)]);
  return evaluate([{ label: 'Offre Minimum Testable sprint 6 soumise', met: submitted }], override);
}
async function gateS8(db, userId) {
  const [hasMission7, hasProofD, hasRevenueDecision, override] = await Promise.all([_missionSubmitted(db, userId, 7), _proofsCount(db, userId, 'D'), _hasActiveDecision(db, userId, ['revenue']), _getOverride(db, userId, 8)]);
  return evaluate([{ label: 'Sprint 7 complete', met: hasMission7 }, { label: 'Preuve deposee etape D', met: hasProofD > 0 }, { label: 'Modele de revenus documente', met: hasRevenueDecision }], override);
}
async function gateS9(db, userId) {
  const [contacted, override] = await Promise.all([_marketContactsCount(db, userId, ['en_cours','converti']), _getOverride(db, userId, 9)]);
  return evaluate([{ label: 'Au moins un contact contacte', met: contacted > 0 }], override);
}
async function gateS10(db, userId) {
  const [hasConversation, override] = await Promise.all([_conversationsCount(db, userId), _getOverride(db, userId, 10)]);
  return evaluate([{ label: 'Au moins une conversation documentee', met: hasConversation > 0 }], override);
}
async function gateS11(db, userId) {
  const [hasConversation, hasSignal, override] = await Promise.all([_conversationsCount(db, userId), _signalsCount(db, userId), _getOverride(db, userId, 11)]);
  return evaluate([{ label: 'Conversations documentees', met: hasConversation > 0 }, { label: 'Signaux marche enregistres', met: hasSignal > 0 }], override);
}
async function gateS12(db, userId) {
  const [hasGoNogo, hasMission11, override] = await Promise.all([_hasActiveDecision(db, userId, ['go_nogo']), _missionSubmitted(db, userId, 11), _getOverride(db, userId, 12)]);
  return evaluate([{ label: 'Sprint 11 complete', met: hasMission11 }, { label: 'Decision Go/No-Go enregistree', met: hasGoNogo }], override);
}
async function gateFinal(db, userId) {
  const [submitted, override] = await Promise.all([_missionSubmitted(db, userId, 12), _getOverride(db, userId, 'final')]);
  return evaluate([{ label: 'Continuite 90 jours soumise', met: submitted }], override);
}

/* ── Exports ─────────────────────────────────────────────────────────────────── */

export const GATE_EVALUATORS = { 2:gateS2, 3:gateS3, 4:gateS4, 5:gateS5, 6:gateS6, 7:gateS7, 8:gateS8, 9:gateS9, 10:gateS10, 11:gateS11, 12:gateS12, final:gateFinal };

const GATE_EVALUATORS_SYNC = { 2:gateS2Sync, 3:gateS3Sync, 4:gateS4Sync, 5:gateS5Sync, 6:gateS6Sync, 7:gateS7Sync, 8:gateS8Sync, 9:gateS9Sync, 10:gateS10Sync, 11:gateS11Sync, 12:gateS12Sync, final:gateFinalSync };

/**
 * Dual-mode evaluator.
 * - If db has .queryOne (async adapter): returns Promise<result>
 * - If db has .prepare (raw better-sqlite3): returns result synchronously
 */
export function evaluateGate(db, userId, sprintNumber) {
  if (typeof db.queryOne === 'function') {
    const fn = GATE_EVALUATORS[sprintNumber];
    if (!fn) return Promise.resolve(null);
    return fn(db, userId);
  }
  const fn = GATE_EVALUATORS_SYNC[sprintNumber];
  if (!fn) return null;
  return fn(db, userId);
}
