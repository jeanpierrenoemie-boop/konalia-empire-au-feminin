import { Icon } from "@/components/Icon";
import { getInbox, getMeetings, getCandidates, getYouTubeSnapshot, getDriveSnapshot } from "@/lib/dataSources";
import { SyncButton } from "@/components/SyncButton";
import { getGoogleStatus, isGoogleConfigured } from "@/lib/integrations/google";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Integration {
  id: "anthropic" | "fireflies" | "google" | "youtube" | "gmail" | "drive" | "cv";
  title: string;
  agent: string;
  icon: string;
  envVar: string;
  configured: boolean;
  live?: boolean;
  lastUpdated?: string;
  itemsCount?: number;
  syncEndpoint?: string;
  connectUrl?: string;
  email?: string;
  setupSteps: string[];
  notes?: string;
}

aqync function getIntegrations(): Promise<Integration[]> {
  const [meetings, inbox, candidates, googleStatus, yt, drive] = await Promise.all([
    getMeetings(),
    getInbox(),
    getCandidates(),
    getGoogleStatus(),
    getYouTubeSnapshot(),
    getDriveSnapshot(),
  ]);

  return [
    {
      id: "anthropic",
      title: "Anthropic (Claude)",
      agent: "Tous les agents",
      icon: "Cpu",
      envVar: "ANTHROPIC_API_KEY",
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      setupSteps: [
        "Créez une clé sur console.anthropic.com",
        "Collez-la dans .env.local à la variable ANTHROPIC_API_KEY=",
        "Redémarrez le dev server",
      ],
      notes:
        "Moteur de raisonnement de tous les agents. Claude Sonnet 4.6 en production.",
    },
    {
      id: "fireflies",
      title: "Fireflies (calls)",
      agent: "Agent Fireflies",
      icon: "Mic",
      envVar: "FIREFLIES_API_KEY",
      configured: Boolean(process.env.FIREFLIES_API_KEY),
      syncEndpoint: "/api/integrations/fireflies/sync?limit=20",
      live: meetings.live,
      lastUpdated: meetings.lastUpdated,
      itemsCount: meetings.data.length,
      setupSteps: [
        "Sur app.fireflies.ai → Settings → Developer settings → Generate API Key",
        "Collez la clé dans .env.local à FIREFLIES_API_KEY=",
        "Redémarrez le dev server",
        "Cliquez « Synchroniser » pour fetch les 20 derniers calls",
      ],
      notes:
        "Chaque clic fetch vos calls récents (titre, date, participants, résumé, action items) depuis l'API GraphQL Fireflies.",
    },
    {
      id: "google",
      title: "Google (compte)",
      agent: "Agents YouTube + Gmail",
      icon: "Chrome",
      envVar: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET",
      configured: isGoogleConfigured() && googleStatus.connected,
      email: googleStatus.email,
      lastUpdated: googleStatus.connectedAt,
      connectUrl: isGoogleConfigured() ? "/api/integrations/google/start" : undefined,
      setupSteps: [
        "Credentials OAuth configurées dans .env.local ✓",
        "Cliquez « Connecter Google » pour l'écran de consentement",
        "Approuvez les accès YouTube + Gmail",
        "Vous serez redirigé ici automatiquement",
      ],
      notes:
        "Un seul consentement couvre YouTube (analytics, vidéos) et Gmail (lecture). Le refresh token est persisté localement, vous ne re-consentez pas à chaque session.",
    },
    {
      id: "youtube",
      title: "YouTube (chaîne + analytics)",
      agent: "L'Analyste",
      icon: "Youtube",
      envVar: "via Google OAuth",
      configured: googleStatus.connected,
      syncEndpoint: "/api/integrations/youtube/sync?days=30&videos=20",
      live: yt.live,
      lastUpdated: yt.lastUpdated,
      itemsCount: 0,
      setupSteps: [
        "Connectez d'abord Google ci-dessus",
        "Cliquez « Synchroniser » pour fetch les 30 derniers jours d'analytics + les 20 dernières vidéos",
        "Posez ensuite vos questions à L'Analyste — il a les données en contexte",
      ],
      notes:
        "Fetch via YouTube Data API v3 + YouTube Analytics API. Infos chaîne (abonnés, vues cumul), dernières vidéos (titre, stats), analytics période (vues/jour, durée moyenne, abonnés gagnés).",
    },
    {
      id: "gmail",
      title: "Gmail (inbox)",
      agent: "Agent Gmail",
      icon: "Mail",
      envVar: "via Google OAuth",
      configured: googleStatus.connected,
      syncEndpoint: "/api/integrations/gmail/sync?limit=20",
      live: inbox.live,
      lastUpdated: inbox.lastUpdated,
      itemsCount: inbox.data.length,
      setupSteps: [
        "Google connecté (scope gmail.readonly inclus) ✓",
        "Cliquez « Synchroniser » pour fetch les 20 derniers emails de votre inbox",
      ],
      notes: "Fetch les 20 derniers emails.",
    },
    {
      id: "drive",
      title: "Google Drive (fichiers)",
      agent: "Tous les agents",
      icon: "HardDrive",
      envVar: "via Google OAuth",
      configured: googleStatus.connected,
      syncEndpoint: "/api/integrations/drive/sync?limit=30",
      live: drive.live,
      lastUpdated: drive.lastUpdated,
      itemsCount: (drive.data as { files?: unknown[] } | undefined)?.files?.length ?? 0,
      setupSteps: [],
    },
    {
      id: "cv",
      title: "Candidatures",
      agent: "Agent CV",
      icon: "Users",
      envVar: "(source à définir)",
      configured: false,
      live: candidates.live,
      lastUpdated: candidates.lastUpdated,
      itemsCount: candidates.data.candidates.length,
      setupSteps: [],
    },
  ];
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; google_error?: string }>;
}) {
  const integrations = await getIntegrations();
  const sp = await searchParams;
  const configured = integrations.filter((i) => i.configured).length;
  return (
    <div>
      <h1>Settings: {configured} / {integrations.length} actives</h1>
    </div>
  );
}
