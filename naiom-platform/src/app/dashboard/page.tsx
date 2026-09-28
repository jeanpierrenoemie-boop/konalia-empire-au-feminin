import Link from "next/link";
import {
  YouTubeWidget,
  FirefliesWidget,
  GmailWidget,
  DriveWidget,
  RecentDeliverablesWidget,
} from "@/components/dashboard/Widgets";
import { Icon } from "@/components/Icon";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AppNav } from "@/components/landing/AppNav";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { ShapeStar, ShapeSphere, ShapeCubeBlue } from "@/components/landing/Shapes";
import {
  getInbox,
  getMeetings,
  getYouTubeSnapshot,
  getDriveSnapshot,
} from "@/lib/dataSources";
import { listAgents } from "@/lib/agents";
import { listAllDeliverables } from "@/lib/deliverables";
import { getGoogleStatus } from "@/lib/integrations/google";
import type { YTSnapshot } from "@/lib/integrations/youtube";
import type { DriveSnapshot } from "@/lib/integrations/drive";
import type { AgentMeta } from "@/lib/types";

export const dynamic = "force-dynamic";

const AGENT_TILE_COLORS: Record<string, string> = {
  orchestrateur: "#5B4DEE",
  strategiste: "#EDE9FF",
  "createur-contenu": "#FFE9DC",
  designer: "#FFE3EE",
  analyste: "#E0F0FF",
  presentateur: "#FFF3D1",
  gmail: "#DFF6EA",
  fireflies: "#F3E8FF",
  cv: "#EAF9DF",
  ecommerce: "#FFEFD6",
  prospection: "#E4F0FE",
};

export default async function DashboardPage() {
  const [inbox, meetings, yt, drive, deliverables, google, agents] = await Promise.all([
    getInbox(),
    getMeetings(),
    getYouTubeSnapshot(),
    getDriveSnapshot(),
    listAllDeliverables(),
    getGoogleStatus(),
    listAgents(),
  ]);

  const ytData = (yt.data as YTSnapshot | undefined) ?? null;
  const driveData = (drive.data as DriveSnapshot | undefined) ?? null;
  const pastMeetings = meetings.data.filter((m) => new Date(m.date) <= new Date());
  const urgentMails = inbox.data.filter((e) => e.urgency === "high").length;
  const deliverablesTotal = deliverables.length;
  const pdfsTotal = deliverables.filter((d) => d.filename.toLowerCase().endsWith(".pdf")).length;

  const orchestrateur = agents.find((a) => a.slug === "orchestrateur");
  const team = agents.filter((a) => a.slug !== "orchestrateur" && a.status === "active");

  return (
    <div className="bronx-page min-h-screen w-full">
      <AppNav active="studio" />
      <ScrollReveal />
      <section className="relative px-6 sm:px-10 pt-28 sm:pt-32 pb-10">
        <div className="mx-auto max-w-[1400px] text-center">
          <h1>Studio</h1>
        </div>
      </section>
    </div>
  );
}
