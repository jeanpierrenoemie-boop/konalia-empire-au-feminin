export type AgentSlug =
  | "orchestrateur"
  | "strategiste"
  | "createur-contenu"
  | "designer"
  | "analyste"
  | "presentateur"
  | "gmail"
  | "fireflies"
  | "proposition"
  | "cv"
  | "ecommerce"
  | "prospection"
  | "veille"
  | "comptabilite"
  | "cerveau";

export type AgentStatus = "active" | "coming-soon" | "locked";

export interface AgentMeta {
  slug: AgentSlug;
  name: string;
  role: string;
  tagline: string;
  model: string;
  tools: string[];
  status: AgentStatus;
  accent: "marine" | "nude" | "muted";
  icon: string;
  systemPrompt: string;
  deliverableFolder?: string;
}

export interface Deliverable {
  slug: string;
  filename: string;
  title: string;
  folder: string;
  absolutePath: string;
  bytes: number;
  modifiedAt: string;
  frontmatter: Record<string, unknown>;
}

export interface CalendarSlot {
  day: string;
  channel: "LinkedIn" | "Instagram" | "YouTube" | "Email";
  time: string;
  title: string;
  author: string;
  status: "programmé" | "brouillon" | "publié";
  deliverableRef?: string;
}
