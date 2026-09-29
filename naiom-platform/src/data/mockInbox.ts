export interface MockEmail {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  receivedAt: string; // ISO
  preview: string;
  body: string;
  category: "client" | "prospect" | "equipe" | "admin" | "newsletter";
  urgency: "high" | "medium" | "low";
  requiresReply: boolean;
  starred?: boolean;
}

// Mock inbox NAIOM — cohérent avec le business Davide/Lina/Alex etc.
export const MOCK_INBOX: MockEmail[] = [
  {
    id: "m1",
    from: "Sacha Navette",
    fromEmail: "sacha@warburg.ai",
    subject: "URGENT — bug sur Davide ce matin",
    receivedAt: "2026-04-20T07:18:00+02:00",
    preview: "Davide a envoyé 12 messages LinkedIn avec le mauvais template ce matin. Nos prospects vont halluciner...",
    body: "Salut Noémie, grosse alerte. Davide a envoyé 12 messages LinkedIn ce matin avec le template de mars (celui qu'on avait décidé de remplacer). 3 prospects ont déjà répondu en mode 'c'est quoi ce délire ?'. J'ai mis le workflow n8n en pause. Peux-tu regarder d'urgence ? On a un call client critique à 14h. Merci. Sacha",
    category: "client",
    urgency: "high",
    requiresReply: true,
    starred: true,
  },
];

export function renderInboxForPrompt(): string {
  return MOCK_INBOX.map(
    (e) =>
      `### Email ${e.id} - ${e.subject}`
  ).join("\n\n");
}
