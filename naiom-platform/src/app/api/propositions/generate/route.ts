import { getMeetings } from "@/lib/dataSources";
import { generateProposal } from "@/lib/propositions/proposal";
import { generateProposalPDF } from "@/lib/propositions/proposalPdf";
import { addProposal } from "@/lib/propositions/store";

export const runtime = "nodejs";
export const maxDuration = 120;

const INTERNAL = /zeyneb|maxim|naiom/i;

/**
 * POST /api/propositions/generate { callId }
 * Idriss reprend le call (Fireflies) → proposition STRUCTURÉE → PDF pro (schémas + prix).
 * Renvoie le PDF (downloadUrl) + l'email d'accompagnement SÉPARÉ.
 */
interface LeadInput {
  name: string; niche?: string; ville?: string; category?: string; website?: string;
  rating?: number; reviewsCount?: number; emails?: string[]; phone?: string; insights?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { callId?: string; lead?: LeadInput };

    if (!process.env.ANTHROPIC_API_KEY)
      return Response.json({ error: "ANTHROPIC_API_KEY absente dans .env.local." }, { status: 412 });

    let proposal;

    if (body.lead?.name) {
      // ---- Source : LEAD détecté par Sékou (prospection) ----
      const l = body.lead;
      const prospect = l.name;
      const sizeLabel = (l.reviewsCount ?? 0) >= 300 ? "grande" : (l.reviewsCount ?? 0) >= 50 ? "moyenne" : "petite";
      const summary = [
        `${l.name} — ${l.category ?? l.niche ?? "entreprise"}${l.ville ? ` à ${l.ville}` : ""}.`,
        l.rating != null ? `Note Google ${l.rating}/5 sur ${l.reviewsCount ?? 0} avis (entreprise ${sizeLabel}).` : "",
        l.website ? `Site web : ${l.website}.` : "Pas de site web détecté — fort besoin de digitalisation.",
        l.phone ? `Téléphone : ${l.phone}.` : "",
        l.insights ? `Notes de Sékou : ${l.insights}` : "",
      ].filter(Boolean).join(" ");
      const keyPoints = [
        l.website ? "Présence digitale : site web existant" : "Pas de site web → opportunité de digitalisation",
        `${l.reviewsCount ?? 0} avis Google — entreprise ${sizeLabel}`,
        (l.emails?.length ?? 0) > 0 ? "Email de contact disponible" : "Email de contact à récupérer",
      ];
      proposal = await generateProposal(
        {
          title: `${l.name}${l.category ? ` (${l.category})` : ""}`,
          date: new Date().toISOString(),
          participants: [l.name],
          type: "prospection",
          sentiment: "à convaincre",
          summary,
          keyPoints,
          actionItems: [],
          transcript: l.insights ?? "",
        },
        prospect,
        "lead"
      );
    } else if (body.callId) {
      // ---- Source : CALL analysé (Fireflies / agent d'analyse de call) ----
      const { data: calls } = await getMeetings();
      const call = calls.find((c) => c.id === body.callId);
      if (!call) return Response.json({ error: "Call introuvable" }, { status: 404 });

      const prospect =
        call.participants.find((p) => !INTERNAL.test(p)) ??
        call.title.replace(/^.*?—\s*/, "").split("(")[0].trim();

      proposal = await generateProposal(
        {
          title: call.title, date: call.date, participants: call.participants, type: call.type,
          sentiment: call.sentiment, summary: call.summary, keyPoints: call.keyPoints,
          actionItems: call.actionItems, transcript: call.transcript,
        },
        prospect
      );
    } else {
      return Response.json({ error: "callId ou lead requis" }, { status: 400 });
    }

    const { filename, bytes } = await generateProposalPDF(proposal);

    // journalise pour le tableau de bord de suivi
    await addProposal({
      reference: proposal.reference,
      prospect: proposal.prospect,
      sector: proposal.sector,
      source: body.lead?.name ? "lead" : "call",
      filename,
      totalSetup: proposal.pricing.totalSetup,
      totalRecurring: proposal.pricing.totalRecurring,
      solutionsCount: proposal.solutions.length,
      contactEmail: body.lead?.emails?.[0],
    }).catch(() => undefined);

    return Response.json({
      success: true,
      prospect: proposal.prospect,
      reference: proposal.reference,
      filename,
      bytes,
      downloadUrl: `/api/reports/file/proposition/${encodeURIComponent(filename)}`,
      email: proposal.email,
    });
  } catch (err) {
    console.error("[propositions/generate]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
