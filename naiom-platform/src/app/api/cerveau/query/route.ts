import { NextResponse } from "next/server";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { traverse, notesContent } from "@/lib/cerveau/vault";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `Tu es Kéïta, le "cerveau" de l'entreprise Halo Studio (studio d'automatisation IA & contenu).
Tu réponds UNIQUEMENT à partir des notes internes fournies (le vault de l'entreprise), en français, de façon concise, claire et actionnable.
Cite les faits EXACTS présents dans les notes : prix, dates, noms de personnes, noms de clients, montants.
Si l'information demandée n'est pas dans les notes, dis-le simplement au lieu d'inventer.
N'ajoute pas de disclaimer, pas de "en tant qu'IA". Va droit au but, comme un collègue qui connaît toute la boîte.

Après ta réponse, ajoute TOUJOURS un bloc d'actions concrètes que l'équipe peut lancer en un clic, au format EXACT (JSON, sans texte autour) :
<ACTIONS>
[{"type":"email","label":"Relancer Éric Ponti","to":"eric@trakio.io","subject":"...","body":"..."}]
</ACTIONS>
Types autorisés et champs :
- "email" → envoyer un email : { "type","label","to","subject","body" }
- "message" → message interne Slack : { "type","label","to","body" }
- "db" → mise à jour d'une base (Airtable/CRM) : { "type","label","target","change" }
- "call" → réserver un appel : { "type","label" }
- "note" → ajouter une note au vault : { "type","label","title","body" }
Donne 1 à 3 actions UTILES et cohérentes avec la question et les notes (ex : client qui attend une relance → email prérempli ; facture en retard → email + "db" ; prospect chaud → "call"). Préremplis vraiment les champs (destinataire, objet, corps) à partir des notes. Si aucune action n'a de sens, mets [].
Le bloc <ACTIONS> ne doit JAMAIS apparaître dans le texte visible de ta réponse.`;

/** Extrait et retire le bloc <ACTIONS>…</ACTIONS> de la réponse. */
function extractActions(text: string): { answer: string; actions: unknown[] } {
  const m = text.match(/<ACTIONS>([\s\S]*?)<\/ACTIONS>/i);
  if (!m) return { answer: text.trim(), actions: [] };
  const answer = text.replace(m[0], "").trim();
  let actions: unknown[] = [];
  try {
    const json = m[1].replace(/```(?:json)?/gi, "").trim();
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) actions = parsed.slice(0, 3);
  } catch { /* pas grave, pas d'actions */ }
  return { answer, actions };
}

/**
 * POST /api/cerveau/query { question }
 * → { path, visited, edges, answer }
 * `traverse` simule la recherche dans le graphe (pour animer le cerveau),
 * puis l'agent rédige la réponse à partir du CONTENU des notes visitées.
 */
export async function POST(req: Request) {
  try {
    const { question } = (await req.json()) as { question?: string };
    if (!question || !question.trim()) {
      return NextResponse.json({ error: "question requise" }, { status: 400 });
    }
    const t = await traverse(question, 6);

    let answer = "";
    let actions: unknown[] = [];
    if (t.visited.length && process.env.ANTHROPIC_API_KEY) {
      const ctx = await notesContent(t.path);
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const { text } = await generateText({
        model: anthropic("claude-sonnet-5"),
        maxOutputTokens: 1400,
        system: SYSTEM,
        prompt: `Voici les notes internes pertinentes du vault de l'entreprise :\n\n${ctx}\n\n---\nQuestion de l'équipe : ${question}\n\nRéponds à partir de ces notes, puis propose les actions.`,
      });
      const parsed = extractActions(text.trim());
      answer = parsed.answer;
      actions = parsed.actions;
    } else if (t.visited.length) {
      answer =
        "D'après mes notes internes :\n" +
        t.visited.map((v) => `• ${v.title} — ${v.excerpt}`).join("\n");
    } else {
      answer = "Je n'ai pas trouvé de note correspondante dans le cerveau de l'entreprise.";
    }

    return NextResponse.json({ ...t, answer, actions });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
