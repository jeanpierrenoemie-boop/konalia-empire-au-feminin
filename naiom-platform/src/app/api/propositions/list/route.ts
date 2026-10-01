import { readProposals } from "@/lib/propositions/store";

export const runtime = "nodejs";

/** GET /api/propositions/list → toutes les propositions (pour le tableau de bord). */
export async function GET() {
  const proposals = await readProposals();
  return Response.json({ proposals });
}
