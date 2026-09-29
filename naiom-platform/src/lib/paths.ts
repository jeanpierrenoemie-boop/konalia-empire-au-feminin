import path from "node:path";

export const REPO_ROOT = path.resolve(process.cwd(), "..");

export const PATHS = {
  agents: path.join(REPO_ROOT, ".claude", "agents"),
  briefs: path.join(REPO_ROOT, "briefs"),
  content: path.join(REPO_ROOT, "content"),
};

const DELIVERABLES_ROOT = path.join(REPO_ROOT, "deliverables");

export const DELIVERABLE_FOLDERS: Partial<Record<string, { abs: string; web: string }>> = {
  orchestrateur:    { abs: path.join(DELIVERABLES_ROOT, "orchestrateur"),    web: "/deliverables/orchestrateur" },
  strategiste:      { abs: path.join(DELIVERABLES_ROOT, "strategiste"),      web: "/deliverables/strategiste" },
  "createur-contenu": { abs: path.join(DELIVERABLES_ROOT, "createur-contenu"), web: "/deliverables/createur-contenu" },
  designer:         { abs: path.join(DELIVERABLES_ROOT, "designer"),         web: "/deliverables/designer" },
  analyste:         { abs: path.join(DELIVERABLES_ROOT, "analyste"),         web: "/deliverables/analyste" },
  presentateur:     { abs: path.join(DELIVERABLES_ROOT, "presentateur"),     web: "/deliverables/presentateur" },
  gmail:            { abs: path.join(DELIVERABLES_ROOT, "gmail"),            web: "/deliverables/gmail" },
  fireflies:        { abs: path.join(DELIVERABLES_ROOT, "fireflies"),        web: "/deliverables/fireflies" },
  proposition:      { abs: path.join(DELIVERABLES_ROOT, "proposition"),      web: "/deliverables/proposition" },
  cv:               { abs: path.join(DELIVERABLES_ROOT, "cv"),               web: "/deliverables/cv" },
  ecommerce:        { abs: path.join(DELIVERABLES_ROOT, "ecommerce"),        web: "/deliverables/ecommerce" },
  prospection:      { abs: path.join(DELIVERABLES_ROOT, "prospection"),      web: "/deliverables/prospection" },
  veille:           { abs: path.join(DELIVERABLES_ROOT, "veille"),           web: "/deliverables/veille" },
  comptabilite:     { abs: path.join(DELIVERABLES_ROOT, "comptabilite"),     web: "/deliverables/comptabilite" },
  cerveau:          { abs: path.join(DELIVERABLES_ROOT, "cerveau"),          web: "/deliverables/cerveau" },
};

