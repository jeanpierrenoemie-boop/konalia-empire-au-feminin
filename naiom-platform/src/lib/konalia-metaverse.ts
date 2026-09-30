// KONALIA METAVERSE - CONFIGURATION CENTRALE
export const QUARTIER_POSITIONS = {
  centre_ville: { x: 0, z: 0, label: "Centre-Ville", size: 20 },
  quartier_business: { x: -40, z: -40, label: "Quartier Business", size: 16 },
  quartier_creativo: { x: 40, z: -40, label: "Quartier Créatif", size: 16 },
  quartier_marketing: { x: -40, z: 40, label: "Quartier Marketing", size: 16 },
  quartier_consulting: { x: 40, z: 40, label: "Quartier Consulting", size: 16 },
  quartier_gaming: { x: -20, z: -70, label: "Quartier Gaming", size: 14 },
  quartier_innovation: { x: 20, z: -70, label: "Quartier Innovation", size: 14 },
};

// ASSIGNATION AGENTS AUX QUARTIERS
export const AGENT_QUARTIER_MAP: Record<string, string> = {
  orchestrateur: "quartier_business",
  strategiste: "quartier_business",
  analyste: "quartier_business",
  designer: "quartier_creativo",
  createur_contenu: "quartier_creativo",
  fireflies: "quartier_creativo",
  community_manager: "quartier_marketing",
  prospection: "quartier_marketing",
  veille: "quartier_marketing",
  gmail: "quartier_consulting",
  noemie_k: "quartier_consulting",
  presentateur: "quartier_gaming",
  proposition: "quartier_gaming",
  cerveau: "quartier_innovation",
  cv: "quartier_innovation",
};

// COLORS POUR QUARTIERS
export const QUARTIER_COLORS = {
  centre_ville: "#D4AF37",
  quartier_business: "#3B82F6",
  quartier_creativo: "#F59E0B",
  quartier_marketing: "#EC4899",
  quartier_consulting: "#10B981",
  quartier_gaming: "#8B5CF6",
  quartier_innovation: "#6B7280",
};

// TYPE SAFE QUARTIER KEYS
export type QuartierKey = keyof typeof QUARTIER_POSITIONS;
