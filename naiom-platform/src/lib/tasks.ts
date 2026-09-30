// SYSTÈME DE TÂCHES EN TEMPS RÉEL - KONALIA METAVERSE

export interface Task {
  id: string;
  agentSlug: string;
  title: string;
  description: string;
  progress: number; // 0-100
  status: "pending" | "in_progress" | "completed";
  quartier: string;
  startTime: number;
  estimatedDuration: number; // en secondes
}

// TÂCHES PAR QUARTIER - Simulées en temps réel
export const QUARTIER_TASKS: Record<string, Task[]> = {
  quartier_business: [
    {
      id: "task-1",
      agentSlug: "strategiste",
      title: "Stratégie Marketing - Connais-tu l'Afrique",
      description: "Définir les canaux d'acquisition et les tactics",
      progress: 65,
      status: "in_progress",
      quartier: "quartier_business",
      startTime: Date.now(),
      estimatedDuration: 3600,
    },
    {
      id: "task-2",
      agentSlug: "analyste",
      title: "Analytics - Derniers 30 jours",
      description: "Compiler les metrics et générer rapports",
      progress: 45,
      status: "in_progress",
      quartier: "quartier_business",
      startTime: Date.now() - 1800,
      estimatedDuration: 1800,
    },
  ],
  quartier_creativo: [
    {
      id: "task-3",
      agentSlug: "designer",
      title: "Design Assets - Réseaux Sociaux",
      description: "8 templates TikTok + Instagram stories",
      progress: 78,
      status: "in_progress",
      quartier: "quartier_creativo",
      startTime: Date.now() - 2700,
      estimatedDuration: 3600,
    },
    {
      id: "task-4",
      agentSlug: "createur_contenu",
      title: "Écriture Ebook 1 - Reprendre Contrôle",
      description: "Chapitre 3-5 en cours",
      progress: 52,
      status: "in_progress",
      quartier: "quartier_creativo",
      startTime: Date.now() - 1200,
      estimatedDuration: 5400,
    },
  ],
  quartier_marketing: [
    {
      id: "task-5",
      agentSlug: "community_manager",
      title: "Calendrier Contenu - Semaine 1",
      description: "15 posts planifiés (TikTok, Instagram, Facebook)",
      progress: 88,
      status: "in_progress",
      quartier: "quartier_marketing",
      startTime: Date.now() - 3600,
      estimatedDuration: 3600,
    },
    {
      id: "task-6",
      agentSlug: "veille",
      title: "Recherche Tendances - Afrique Gaming",
      description: "Top 20 hashtags + trending creators",
      progress: 34,
      status: "in_progress",
      quartier: "quartier_marketing",
      startTime: Date.now() - 600,
      estimatedDuration: 1800,
    },
  ],
};

// FONCTION POUR OBTENIR LES TÂCHES EN TEMPS RÉEL
export function getLiveTasksForAgent(agentSlug: string): Task[] {
  const allTasks = Object.values(QUARTIER_TASKS).flat();
  return allTasks.filter((t) => t.agentSlug === agentSlug);
}

// CALCULER PROGRÈS AUTOMATIQUE
export function getTaskProgress(task: Task): number {
  if (task.status === "completed") return 100;

  const elapsed = (Date.now() - task.startTime) / 1000;
  const progress = Math.min(100, (elapsed / task.estimatedDuration) * 100);
  return Math.round(progress);
}

// TÂCHES COMPLÉTÉES - ARCHIVES
export const COMPLETED_TASKS = [
  {
    id: "completed-1",
    title: "Stratégie Metaverse Phase 1",
    agent: "Orchestrateur",
    completedAt: "Il y a 2 heures",
  },
  {
    id: "completed-2",
    title: "Setup Infrastructure Quartiers",
    agent: "Strategiste",
    completedAt: "Il y a 1 heure",
  },
  {
    id: "completed-3",
    title: "Intégration Avatar Noémie",
    agent: "Designer",
    completedAt: "Il y a 30 min",
  },
];
