import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { readLeads, updateLead } from "@/lib/prospection/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/prospection/personalize — ÉTAPE 3 · PERSONNALISATION (Profilé → Prêt)
 * body: { leadId }
 * Claude rédige l'email + le message LinkedIn personnalisés à partir de la fiche.
 */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY absente dans .env.local." },
      { status: 412 }
    );
  }
  try {
    const { leadId } = await req.json();
    const lead = (await readLeads()).find((l) => l.id === leadId);
    if (!lead) return Response.json({ error: "Lead introuvable" }, { status: 404 });

    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { text } = await generateText({
      model: anthropic("claude-sonnet-5"),
      prompt: `Tu es Sékou, l'agent prospection de Noémie (Noémie.K, marque Konalia).

Contexte : Noémie prépare un programme pour des salariées du tertiaire (assistantes, conseillères clientèle) qui veulent devenir prestataires administratifs pour des TPE et des artisans. Avant de construire quoi que ce soit, elle veut COMPRENDRE comment les patrons de TPE et les artisans gèrent aujourd'hui leur administratif (devis, factures, relances, mails). Elle ne vend rien.

Rédige une demande d'échange personnalisée pour ce prospect :

- Entreprise : ${lead.name}
- Activité : ${lead.category ?? lead.niche} à ${lead.ville}
- Site web : ${lead.website ?? "aucun"}
- Réputation : ${lead.reviewsCount ?? 0} avis Google, note ${lead.rating ?? "?"}/5
- Ce qu'on sait : ${lead.insights ?? "rien de plus"}

Objectif : obtenir 20 minutes d'échange (téléphone ou visio) pour comprendre comment il ou elle gère l'administratif. AUCUNE vente, AUCUN prix, AUCUNE offre, AUCUNE promesse de résultat.

Règles STRICTES :
- Email : objet ≤ 8 mots, corps ≤ 120 mots, vouvoiement. 1re phrase = un fait PRÉCIS sur eux (leurs avis, leur activité, leur ville — pas de flatterie générique). 1 seule demande : 20 minutes pour comprendre leur quotidien administratif. CTA doux. Signer « Noémie ». Mentionner qu'ils peuvent refuser d'être recontactés.
- LinkedIn : ≤ 280 caractères, ton direct, pas de "j'espère que vous allez bien".
- Aucun chiffre inventé, aucun jargon creux.

Réponds UNIQUEMENT en JSON valide :
{"subject": "...", "email": "...", "linkedin": "..."}`,
    });

    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const parsed = JSON.parse(cleaned.slice(start)) as {
      subject: string;
      email: string;
      linkedin: string;
    };

    const updated = await updateLead(leadId, {
      status: "pret",
      outreach: { ...parsed, generatedAt: new Date().toISOString() },
    });
    return Response.json({ success: true, lead: updated });
  } catch (err) {
    console.error("[prospection/personalize]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
