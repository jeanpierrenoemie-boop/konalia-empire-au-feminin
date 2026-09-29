import type { AgentMeta, AgentSlug } from "./types";

// Mapping slug → icône Lucide + accent
export const AGENT_UI: Record<AgentSlug, { icon: string; accent: AgentMeta["accent"]; tagline: string }> = {
  orchestrateur:      { icon: "Network",         accent: "marine", tagline: "Pilote toute l'équipe d'agents en chaîne ou à la demande." },
  strategiste:        { icon: "Compass",         accent: "marine", tagline: "ICP, positionnement, briefs de campagne." },
  "createur-contenu": { icon: "PenLine",         accent: "nude",   tagline: "Posts LinkedIn, Reels, scripts YouTube, emails." },
  designer:           { icon: "Sparkles",        accent: "nude",   tagline: "Creative Strategist — créatives à la chaîne (Higgsfield), DA, dashboard + programmation." },
  analyste:           { icon: "LineChart",       accent: "marine", tagline: "Rapports perf + plan d'optim 30 jours." },
  presentateur:       { icon: "Presentation",    accent: "marine", tagline: "Decks structurés prêts à monter dans Canva." },
  gmail:              { icon: "Mail",            accent: "marine", tagline: "Tri des emails + to-do list priorisée." },
  fireflies:          { icon: "Mic",             accent: "nude",   tagline: "Analyse de calls + plan d'action équipe." },
  proposition:        { icon: "FileSignature",   accent: "marine", tagline: "Reprend le call analysé → proposition commerciale PDF envoyée au prospect." },
  cv:                 { icon: "UserCheck",       accent: "marine", tagline: "Score les candidatures + réponses automatisées." },
  ecommerce:          { icon: "ShoppingBag",     accent: "nude",   tagline: "Vidéos produit avec avatars IA (Arcads), prêtes à publier." },
  prospection:        { icon: "Radar",           accent: "marine", tagline: "Détecte, enrichit et contacte vos prospects — pipeline rempli la nuit." },
  veille:             { icon: "TrendingUp",      accent: "nude",   tagline: "Reels Instagram les plus vus d'un hashtag + script de chaque vidéo." },
  comptabilite:       { icon: "Calculator",      accent: "marine", tagline: "Toute la compta de la boîte — dashboard, rapports, factures, TVA." },
  cerveau:            { icon: "Brain",           accent: "nude",   tagline: "Le cerveau de l'entreprise — connaît offres, prix, réunions, clients, process. Branché sur Obsidian." },
};

export const ACTIVE_SLUGS: AgentSlug[] = [
  "orchestrateur",
  "strategiste",
  "createur-contenu",
  "designer",
  "analyste",
  "presentateur",
  "gmail",
  "fireflies",
  "proposition",
  "cv",
  "ecommerce",
  "prospection",
  "veille",
  "comptabilite",
  "cerveau",
];

export const PLACEHOLDER_SLUGS: AgentSlug[] = [];

export const PRETTY_NAMES: Record<AgentSlug, string> = {
  orchestrateur: "Noam",
  strategiste: "Antoine",
  "createur-contenu": "Léa",
  designer: "Mia",
  analyste: "Léo",
  presentateur: "Hugo",
  gmail: "Inès",
  fireflies: "Jules",
  proposition: "Victor",
  cv: "Clara",
  ecommerce: "Emma",
  prospection: "Sacha",
  veille: "Nina",
  comptabilite: "Chloé",
  cerveau: "Clément",
};

export const ROLES: Record<AgentSlug, string> = {
  orchestrateur: "Chef d'orchestre",
  strategiste: "Stratège",
  "createur-contenu": "Créateur de contenu",
  designer: "Creative Strategist",
  analyste: "Analyste",
  presentateur: "Présentateur",
  gmail: "Assistant email",
  fireflies: "Analyste de calls",
  proposition: "Proposition commerciale",
  cv: "Recruteuse",
  ecommerce: "Agente e-commerce",
  prospection: "Agent prospection",
  veille: "Veille tendances",
  comptabilite: "Comptable",
  cerveau: "Cerveau de l'entreprise",
};

export function listAgentSync(): Array<{ slug: AgentSlug; name: string; role: string }> {
  return ACTIVE_SLUGS.map((slug) => ({
    slug,
    name: PRETTY_NAMES[slug],
    role: ROLES[slug],
  }));
}

/** L'agent débloqué de ce template (ou null sur la plateforme complète). */
export function ownedSlug(): string | null {
  return process.env.OWNED_AGENT?.trim() || null;
}
