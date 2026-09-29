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

const AVATAM_VERSION = "5-cutout";
const v = `?v=${AVATAR_VERSION}`;

export const AVATAR_MAP: Record<string, string> = {
  orchestrateur: `/avatars/funko-bearded-headset.png${v}`,
  strategiste: `/avatars/funko-glasses-pen.png${v}`,
  "createur-contenu": `/avatars/funko-curly-book.png${v}`,
  designer: `/avatars/funko-glasses-laptop.png${v}`,
  analyste: `/avatars/funko-glasses-pen.png${v}`,
  presentateur: `/avatars/funko-clean-wave.png${v}`,
  gmail: `/avatars/funko-curly-phone.png${v}`,
  fireflies: `/avatars/funko-bearded-headset.png${v}`,
  cv: `/avatars/funko-blonde-headset.png${v}`,
  ecommerce: `/avatars/funko-curly-phone.png${v}`,
  prospection: `/avatars/funko-glasses-pen.png${v}`,
  proposition: `/avatars/funko-bearded-headset.png${v}`,
  comptabilite: `/avatars/funko-blonde-headset.png${v}`,
  cerveau: `/avatars/funko-glasses-pen.png${v}`,
};

export const DEFAULT_AVATAR = `/avatars/funko-clean-wave.png${v}`;
