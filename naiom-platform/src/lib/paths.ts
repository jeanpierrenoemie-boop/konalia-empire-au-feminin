import path from "node:path";

export const REPO_ROOT = path.resolve(process.cwd(), "..");

export const PATHS = {
  agents: path.join(REPO_ROOT, ".claude", "agents"),
  briefs: path.join(REPO_ROOT, "briefs"),
  content: path.join(REPO_ROOT, "content"),
  creatives: path.join(REPO_ROOT, "creatives"),
  vault: path.join(REPO_ROOT, "vault"),
};

// Dossier de travail de chaque agent (relatif à la racine du dépôt) : c'est là que ses prompts lui demandent d'écrire.
const REL: Record<string, string> = {
  orchestrateur: "deliverables/orchestrateur",
  strategiste: "briefs",
  "createur-contenu": "content",
  designer: "prompts-images",
  analyste: "analytics",
  presentateur: "decks",
  gmail: "gmail",
  fireflies: "meetings",
  proposition: "propositions",
  cv: "hiring",
  ecommerce: "ecommerce-videos",
  prospection: "prospection",
  veille: "veille",
  comptabilite: "compta",
  cerveau: "vault",
};

export const DELIVERABLE_FOLDERS: Record<string, { abs: string; rel: string }> = Object.fromEntries(
  Object.entries(REL).map(([slug, rel]) => [slug, { abs: path.join(REPO_ROOT, rel), rel }])
);
