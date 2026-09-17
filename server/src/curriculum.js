/**
 * Static curriculum — V1 pilot structure.
 * Content fields are intentionally left as placeholders:
 *   result, understand, mission, support, deliverable, unlock_reason
 * They will be populated by Noémie via admin interface (future build).
 * Do NOT invent content here.
 */

export const CADRE_PHASES = [
  { step: 'C', label: 'Clarifier', sprints: [1, 2] },
  { step: 'A', label: 'Arbitrer',  sprints: [3, 4] },
  { step: 'D', label: 'Définir',   sprints: [5, 6, 7] },
  { step: 'R', label: 'Rencontrer',sprints: [8, 9, 10] },
  { step: 'E', label: 'Évoluer',   sprints: [11, 12] },
];

export const SPRINT_CADRE = {
  1: 'C', 2: 'C',
  3: 'A', 4: 'A',
  5: 'D', 6: 'D', 7: 'D',
  8: 'R', 9: 'R', 10: 'R',
  11: 'E', 12: 'E',
};

export const SPRINTS = [
  /* ── C — CLARIFIER ─────────────────────────── */
  {
    number: 1,
    cadre_step: 'C',
    title: 'Ton Point de Contrôle',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'C\'est le point de départ. Ce sprint est ouvert dès la fin de l\'onboarding.',
  },
  {
    number: 2,
    cadre_step: 'C',
    title: 'Tes Ressources Exploitables',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Complète et valide le Sprint 1 — Ton Point de Contrôle.',
  },

  /* ── A — ARBITRER ───────────────────────────── */
  {
    number: 3,
    cadre_step: 'A',
    title: 'Le Choix qui Libère',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Valide le Sprint 2 — Tes Ressources Exploitables pour accéder à Arbitrer.',
  },
  {
    number: 4,
    cadre_step: 'A',
    title: 'Verrouille ta Direction',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Complète et valide le Sprint 3 — Le Choix qui Libère.',
  },

  /* ── D — DÉFINIR ────────────────────────────── */
  {
    number: 5,
    cadre_step: 'D',
    title: 'Ta Cible & son Problème',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Valide le Sprint 4 — Verrouille ta Direction pour accéder à Définir.',
  },
  {
    number: 6,
    cadre_step: 'D',
    title: 'Ton Offre Minimum Testable',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Complète et valide le Sprint 5 — Ta Cible & son Problème.',
  },
  {
    number: 7,
    cadre_step: 'D',
    title: 'Dire ce que tu vends',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Complète et valide le Sprint 6 — Ton Offre Minimum Testable.',
  },

  /* ── R — RENCONTRER ─────────────────────────── */
  {
    number: 8,
    cadre_step: 'R',
    title: 'Sortir de la Préparation',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Valide le Sprint 7 — Dire ce que tu vends pour accéder à Rencontrer.',
  },
  {
    number: 9,
    cadre_step: 'R',
    title: 'Les Conversations Réelles',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Complète et valide le Sprint 8 — Sortir de la Préparation.',
  },
  {
    number: 10,
    cadre_step: 'R',
    title: 'Proposer & Observer',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Complète et valide le Sprint 9 — Les Conversations Réelles.',
  },

  /* ── E — ÉVOLUER ────────────────────────────── */
  {
    number: 11,
    cadre_step: 'E',
    title: 'Décider à partir du réel',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Valide le Sprint 10 — Proposer & Observer pour accéder à Évoluer.',
  },
  {
    number: 12,
    cadre_step: 'E',
    title: 'La Suite Sous Contrôle',
    result: null,
    understand: null,
    mission: null,
    support: null,
    deliverable: null,
    unlock_reason: 'Complète et valide le Sprint 11 — Décider à partir du réel.',
  },
];

export function getSprintByNumber(n) {
  return SPRINTS.find(s => s.number === n) ?? null;
}

export function getCadreStepForSprint(n) {
  return SPRINT_CADRE[n] ?? null;
}
