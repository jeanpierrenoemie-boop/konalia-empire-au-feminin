/**
 * Vue d'ensemble structurée de l'entreprise (Halo Studio) pour le dashboard de Clément.
 * Aligné avec le vault Obsidian (profils managers + kits d'onboarding par département).
 */

export interface Kpi { label: string; value: string; sub: string; tone?: "accent" | "warn" | "ok" }

export const KPIS: Kpi[] = [
  { label: "MRR", value: "4 300 €", sub: "objectif Q3 : 8 000 €", tone: "accent" },
  { label: "Trésorerie", value: "18 200 €", sub: "encaissé 6 300 € en sept." },
  { label: "Clients actifs", value: "5", sub: "1 en pipeline (Trakio)" },
  { label: "Factures en retard", value: "1 · 2 700 €", sub: "E-shop Verde · 12 j", tone: "warn" },
  { label: "Effectif", value: "5", sub: "5 départements" },
  { label: "Parcours onboarding", value: "5", sub: "prêts à lancer", tone: "ok" },
];

export interface OnboardStep { title: string; detail: string }
export interface Department {
  key: string;
  name: string;
  manager: string;
  role: string;
  avatar: string; // /avatars/…-cut.png
  color: string;
  tools: string[];
  daily: string;
  onboarding: {
    formation: { module: string; duree: string }[];
    welcomeEmail: { subject: string; body: string };
    credentials: string[];
    firstSteps: string[];
  };
}

export const DEPARTMENTS: Department[] = [
  {
    key: "direction", name: "Direction", manager: "Camille Fontaine", role: "Fondatrice & CEO",
    avatar: "/avatars/funko-curly-book-cut.png", color: "#F5411C",
    tools: ["Notion", "Airtable", "Fireflies", "Gmail"],
    daily: "Revue des chiffres le matin, calls grands comptes, arbitrage des priorités, pilotage de l'équipe.",
    onboarding: {
      formation: [
        { module: "Vision & positionnement de Halo Studio", duree: "12 min" },
        { module: "Lire les chiffres : MRR, marge, trésorerie", duree: "18 min" },
        { module: "Pilotage d'équipe & rituels", duree: "15 min" },
      ],
      welcomeEmail: {
        subject: "Bienvenue à la Direction de Halo Studio 🎯",
        body: "Bonjour et bienvenue !\n\nTu rejoins la Direction. Tes 30 premiers jours : t'approprier la vision, les chiffres et les rituels. Ta formation (3 modules) est déjà prête dans ton espace. On se cale un point demain 9h.\n\nCamille",
      },
      credentials: ["Notion — accès admin espace Direction", "Airtable — dashboard Finances", "Fireflies", "Gmail pro"],
      firstSteps: ["Lire Positionnement & Valeurs Halo", "Prendre en main le dashboard MRR", "Bloquer les rituels (point hebdo)"],
    },
  },
  {
    key: "automatisation", name: "Automatisation", manager: "Thomas Mercier", role: "Lead Automatisation",
    avatar: "/avatars/funko-glasses-pen-cut.png", color: "#5B4DEE",
    tools: ["n8n", "Make", "Airtable", "GitHub"],
    daily: "Build des workflows, recette, doc de passation, support technique des clients en retainer.",
    onboarding: {
      formation: [
        { module: "Stack technique : n8n, Make, Airtable", duree: "20 min" },
        { module: "Le Process de livraison, pas à pas", duree: "16 min" },
        { module: "Doc de passation & zéro dépendance", duree: "10 min" },
      ],
      welcomeEmail: {
        subject: "Bienvenue dans l'équipe Automatisation ⚙️",
        body: "Salut !\n\nBienvenue chez Halo Studio, pôle Automatisation. Ton binôme est déjà assigné. Commence par les 3 modules de formation, puis on clone ensemble un workflow existant pour te lancer.\n\nThomas",
      },
      credentials: ["n8n — compte + workspace", "Make", "Airtable", "GitHub", "Accès environnements clients (VPN)"],
      firstSteps: ["Cloner un workflow existant", "Lire une doc de passation d'un sprint", "Shadow d'une recette avec Thomas"],
    },
  },
  {
    key: "contenu", name: "Contenu", manager: "Sofia Nadir", role: "Content Lead",
    avatar: "/avatars/funko-curly-phone-cut.png", color: "#e64980",
    tools: ["Notion", "Canva", "Buffer", "Meta"],
    daily: "Calendrier éditorial, rédaction/validation des posts et scripts, veille tendances.",
    onboarding: {
      formation: [
        { module: "La marque, le ton, la charte", duree: "14 min" },
        { module: "Du brief à la publication (Pack Contenu IA)", duree: "18 min" },
        { module: "Calendrier éditorial & programmation", duree: "12 min" },
      ],
      welcomeEmail: {
        subject: "Bienvenue au pôle Contenu ✍️",
        body: "Hello !\n\nRavie de t'accueillir au Contenu. Le guide de style est en pièce jointe — c'est ta bible. Après les modules, tu rédiges un premier post test qu'on valide ensemble.\n\nSofia",
      },
      credentials: ["Notion — calendrier éditorial", "Canva", "Buffer", "Meta Business Suite", "Outils IA de rédaction"],
      firstSteps: ["Lire le guide de style", "Rédiger un premier post test", "Prendre en main le calendrier clients"],
    },
  },
  {
    key: "vente", name: "Vente", manager: "Lucas Berger", role: "Closer",
    avatar: "/avatars/funko-bearded-headset-cut.png", color: "#12b886",
    tools: ["Gmail", "CRM", "Fireflies", "Calendly"],
    daily: "Prospection, calls discovery & closing, relances du pipeline, reporting du CA.",
    onboarding: {
      formation: [
        { module: "Les offres & prix par cœur", duree: "15 min" },
        { module: "Le Process de vente : discovery → closing", duree: "20 min" },
        { module: "Objections & réponses types", duree: "14 min" },
      ],
      welcomeEmail: {
        subject: "Bienvenue dans l'équipe Vente 🤝",
        body: "Salut !\n\nBienvenue chez Halo. Tu as accès au pipeline. Écoute 2 calls gagnants sur Fireflies, apprends la grille tarifaire, et on fait un jeu de rôle closing demain.\n\nLucas",
      },
      credentials: ["Gmail pro", "CRM (pipeline)", "Fireflies", "Calendly"],
      firstSteps: ["Écouter 2 calls Fireflies gagnants", "Apprendre la grille tarifaire", "Jeu de rôle closing avec Lucas"],
    },
  },
  {
    key: "ops", name: "Ops & Projet", manager: "Inès Caron", role: "Ops & Chef de projet",
    avatar: "/avatars/funko-blonde-headset-cut.png", color: "#f59f00",
    tools: ["Notion", "Airtable", "Gmail", "Slack"],
    daily: "Coordination des projets, onboarding client, facturation & relances, satisfaction.",
    onboarding: {
      formation: [
        { module: "Vue d'ensemble des projets & clients", duree: "16 min" },
        { module: "Onboarding client & suivi des jalons", duree: "14 min" },
        { module: "Facturation & relances", duree: "12 min" },
      ],
      welcomeEmail: {
        subject: "Bienvenue au pôle Ops 🗂️",
        body: "Bonjour !\n\nBienvenue chez Halo Studio, pôle Ops. La checklist d'onboarding client est en pièce jointe. Commence par prendre en main le suivi projets, puis on déroule une checklist à blanc ensemble.\n\nInès",
      },
      credentials: ["Notion", "Airtable (Clients + Finances)", "Gmail pro", "Slack"],
      firstSteps: ["Prendre en main le suivi projets", "Dérouler une checklist onboarding client", "Comprendre le circuit de facturation"],
    },
  },
];

export function getDepartment(key: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.key === key);
}
