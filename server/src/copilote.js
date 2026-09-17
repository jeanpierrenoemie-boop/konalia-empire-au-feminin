/**
 * COPILOTE — Context builder
 * Builds structured context for AI assistant based on shortcut type.
 */

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 * @param {'perdue'|'trente_minutes'|'challenge_offre'|'analyse_retours'|'nouvelle_idee'|'ma_semaine'|'general'} shortcutType
 * @returns {{ summary: string, structured: object }}
 */
export function buildCopiloteContext(db, userId, shortcutType = 'general') {
  // ── fetch data ──────────────────────────────────────────────────────────────
  const profile = db.prepare(
    `SELECT p.*, u.email, u.first_name, u.tier,
            o.content AS onboarding_data
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN (
       SELECT owner_id, content
       FROM participant_data
       WHERE data_type = 'onboarding_draft' AND owner_id = ?
       ORDER BY updated_at DESC LIMIT 1
     ) o ON o.owner_id = p.user_id
     WHERE p.user_id = ?`
  ).get(userId, userId)
    ?? db.prepare(`SELECT u.id AS user_id, u.email, u.first_name, u.tier FROM users u WHERE u.id = ?`).get(userId);

  const progress = db.prepare(
    `SELECT up.*, c.name AS cohort_name, c.start_date AS cohort_start
     FROM user_progress up
     LEFT JOIN cohorts c ON c.id = up.cohort_id
     WHERE up.user_id = ? LIMIT 1`
  ).get(userId);

  const pilotage = db.prepare(
    `SELECT * FROM pilotage_state WHERE user_id = ?`
  ).get(userId);

  const activeDecisions = db.prepare(
    `SELECT id, decision_type, title, context, rationale, created_at
     FROM decisions
     WHERE user_id = ? AND status = 'active'
     ORDER BY created_at DESC`
  ).all(userId);

  const recentSignals3 = db.prepare(
    `SELECT id, signal_type, content, strength, created_at
     FROM market_signals WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 3`
  ).all(userId);

  const recentSignals5 = db.prepare(
    `SELECT id, signal_type, content, strength, created_at
     FROM market_signals WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 5`
  ).all(userId);

  // ── market CRM data ─────────────────────────────────────────────────────────
  const SIGNAL_LEVELS_ORDER = [
    'politesse','probleme_exprime','comportement_passe',
    'interet_solution','intention_commerciale','engagement',
  ];

  const marketContacts = db.prepare(
    `SELECT id, name, status, circle, commercial_intent, next_action, last_contact_date
     FROM market_contacts WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(userId);

  const marketContactsWithCeiling = marketContacts.map(c => {
    const sigs = db.prepare(
      `SELECT signal_type FROM market_signals WHERE user_id = ? AND contact_id = ?`
    ).all(userId, c.id);
    let maxIdx = -1;
    for (const s of sigs) {
      const idx = SIGNAL_LEVELS_ORDER.indexOf(s.signal_type);
      if (idx > maxIdx) maxIdx = idx;
    }
    return { ...c, signal_ceiling: maxIdx >= 0 ? SIGNAL_LEVELS_ORDER[maxIdx] : null };
  });

  const recentConversations5 = db.prepare(
    `SELECT mc.id, mc.title, mc.date_occurred, mc.summary,
            co.name AS contact_name
     FROM market_conversations mc
     LEFT JOIN market_contacts co ON co.id = mc.contact_id
     WHERE mc.user_id = ?
     ORDER BY mc.date_occurred DESC LIMIT 5`
  ).all(userId);

  const recentMarketSignals5 = db.prepare(
    `SELECT ms.id, ms.signal_type, ms.content, ms.strength, ms.created_at,
            co.name AS contact_name
     FROM market_signals ms
     LEFT JOIN market_contacts co ON co.id = ms.contact_id
     WHERE ms.user_id = ?
     ORDER BY ms.created_at DESC LIMIT 5`
  ).all(userId);

  const market_summary = {
    contacts: marketContactsWithCeiling,
    recent_conversations: recentConversations5,
    recent_signals: recentMarketSignals5,
  };

  const parkingAgir = db.prepare(
    `SELECT id, title, description, category
     FROM parking_ideas
     WHERE user_id = ? AND dispersion_status = 'AGIR_MAINTENANT'
     ORDER BY created_at DESC`
  ).all(userId);

  const parkingCount = db.prepare(
    `SELECT COUNT(*) AS cnt FROM parking_ideas WHERE user_id = ?`
  ).get(userId)?.cnt ?? 0;

  const passport = db.prepare(
    `SELECT project_name, vision, target_persona, core_problem, proposed_solution, revenue_model, stage, validation_score
     FROM project_passport WHERE user_id = ?`
  ).get(userId);

  // ── build structured per shortcut type ──────────────────────────────────────
  let structured = {};

  switch (shortcutType) {
    case 'perdue':
      structured = {
        profile: _profileSnippet(profile),
        progress: _progressSnippet(progress),
        pilotage: pilotage ?? null,
        active_decisions: activeDecisions,
        recent_signals: recentSignals3,
        parking_agir_maintenant: parkingAgir,
        passport: passport ?? null,
        market_summary,
      };
      break;

    case 'trente_minutes':
      structured = {
        next_action: pilotage?.next_action ?? null,
        current_priority: pilotage?.current_priority ?? null,
        duration_estimate: pilotage?.duration_estimate ?? null,
      };
      break;

    case 'challenge_offre':
      structured = {
        passport: passport ?? null,
        recent_signals: recentSignals3,
        market_summary,
      };
      break;

    case 'analyse_retours':
      structured = {
        recent_signals: recentSignals5,
        market_summary,
      };
      break;

    case 'nouvelle_idee':
      structured = {
        current_priority: pilotage?.current_priority ?? null,
        parking_total_count: parkingCount,
        parking_agir_maintenant_count: parkingAgir.length,
      };
      break;

    case 'ma_semaine':
      structured = {
        progress: _progressSnippet(progress),
        pilotage: pilotage ? {
          current_priority: pilotage.current_priority,
          next_action: pilotage.next_action,
          blocker: pilotage.blocker,
        } : null,
        active_decisions_count: activeDecisions.length,
      };
      break;

    case 'general':
    default:
      structured = {
        profile: _profileSnippet(profile),
        progress: _progressSnippet(progress),
        pilotage: pilotage ?? null,
        active_decisions: activeDecisions,
        recent_signals: recentSignals3,
        passport: passport ?? null,
        parking_agir_count: parkingAgir.length,
        market_summary,
      };
      break;
  }

  // ── build human-readable summary ─────────────────────────────────────────────
  const summary = _buildSummary(shortcutType, structured, profile, progress, pilotage);

  return { summary, structured };
}

function _profileSnippet(profile) {
  if (!profile) return null;
  return {
    first_name: profile.first_name ?? null,
    tier: profile.tier ?? null,
    employment_status: profile.employment_status ?? null,
    sector: profile.sector ?? null,
    weekly_hours_available: profile.weekly_hours_available ?? null,
    onboarding_data: profile.onboarding_data ? JSON.parse(profile.onboarding_data) : null,
  };
}

function _progressSnippet(progress) {
  if (!progress) return null;
  return {
    cadre_step: progress.cadre_step,
    sprint_number: progress.sprint_number,
    week_in_sprint: progress.week_in_sprint,
    gate_status: progress.gate_status,
    cohort_name: progress.cohort_name ?? null,
  };
}

function _buildSummary(shortcutType, structured, profile, progress, pilotage) {
  const name = profile?.first_name ?? 'Participante';
  const step = progress ? `étape ${progress.cadre_step}, sprint ${progress.sprint_number}, semaine ${progress.week_in_sprint}` : 'progression inconnue';

  switch (shortcutType) {
    case 'perdue':
      return `${name} est à ${step}. Priorité actuelle : ${pilotage?.current_priority ?? 'non définie'}. Prochaine action : ${pilotage?.next_action ?? 'non définie'}. Décisions actives : ${structured.active_decisions?.length ?? 0}.`;

    case 'trente_minutes':
      return `Prochaine action disponible : "${structured.next_action ?? 'non définie'}". Priorité courante : "${structured.current_priority ?? 'non définie'}".`;

    case 'challenge_offre':
      const p = structured.passport;
      return `Projet : "${p?.project_name ?? 'non nommé'}". Persona : ${p?.target_persona ?? 'non défini'}. ${structured.recent_signals?.length ?? 0} signaux marché récents.`;

    case 'analyse_retours':
      return `${structured.recent_signals?.length ?? 0} signaux marché récents à analyser.`;

    case 'nouvelle_idee':
      return `Priorité actuelle : "${structured.current_priority ?? 'non définie'}". ${structured.parking_total_count} idées en parking, dont ${structured.parking_agir_maintenant_count} à traiter maintenant.`;

    case 'ma_semaine':
      return `${name} : ${step}. Priorité : ${structured.pilotage?.current_priority ?? 'non définie'}. ${structured.active_decisions_count} décisions actives.`;

    default:
      return `Contexte général pour ${name} à ${step}.`;
  }
}
