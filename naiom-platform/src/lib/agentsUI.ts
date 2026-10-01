/**
 * UI helpers agent-specific, utilisables côté client ET serveur.
 */

export function agentGlow(slug: string): string {
  switch (slug) {
    case "orchestrateur": return "rgba(232, 70, 31, 0.35)";
    case "strategiste": return "rgba(180, 100, 211, 0.3)";
    case "createur-contenu": return "rgba(245, 116, 171, 0.3)";
    case "designer": return "rgba(245, 116, 68, 0.3)";
    case "analyste": return "rgba(96, 165, 250, 0.3)";
    case "presentateur": return "rgba(232, 70, 31, 0.3)";
    case "gmail": return "rgba(245, 158, 11, 0.3)";
    case "fireflies": return "rgba(180, 100, 211, 0.3)";
    case "cv": return "rgba(16, 185, 129, 0.3)";
    case "proposition": return "rgba(16, 185, 129, 0.32)";
    case "comptabilite": return "rgba(96, 165, 250, 0.3)";
    case "cerveau": return "rgba(232, 120, 60, 0.34)";
    default: return "rgba(232, 70, 31, 0.3)";
  }
}

export const AVATAR_MAP: Record<string, string> = Object.fromEntries(
  [
    "orchestrateur", "strategiste", "createur-contenu", "designer", "analyste", "presentateur", "gmail",
    "fireflies", "cv", "ecommerce", "prospection", "proposition", "comptabilite", "cerveau", "veille",
  ].map((slug) => [slug, `/avatars-konalia/${slug}.svg`])
);

export const DEFAULT_AVATAR = "/avatars-konalia/orchestrateur.svg";
