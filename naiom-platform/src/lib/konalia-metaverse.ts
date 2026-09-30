// KONALIA METAVERSE - WAKANDA STYLE 👑
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

// 🌍 WAKANDA COLORS - Vibrant & Futuristic African
export const QUARTIER_COLORS = {
  centre_ville: "#FFD700", // Or pur - Noémie Avatar
  quartier_business: "#00D9FF", // Bleu électrique - Stratégie & Analyse
  quartier_creativo: "#FF006E", // Rose vif - Design & Création
  quartier_marketing: "#00FF88", // Vert émeraude - Community & Veille
  quartier_consulting: "#9D4EDD", // Violet royal - Consulting
  quartier_gaming: "#3A86FF", // Bleu profond - Gaming
  quartier_innovation: "#FB5607", // Orange électrique - Innovation
};

// Couleurs secondaires pour glow
export const QUARTIER_GLOWS = {
  centre_ville: "#FFD700",
  quartier_business: "#00D9FF",
  quartier_creativo: "#FF006E",
  quartier_marketing: "#00FF88",
  quartier_consulting: "#9D4EDD",
  quartier_gaming: "#3A86FF",
  quartier_innovation: "#FB5607",
};

// TYPE SAFE QUARTIER KEYS
export type QuartierKey = keyof typeof QUARTIER_POSITIONS;
