import { NextResponse } from "next/server";
import { buildGraph } from "@/lib/cerveau/vault";

export const runtime = "nodejs";

/** GET /api/cerveau/graph — le cerveau de l'entreprise (nodes + edges du vault Obsidian). */
export async function GET() {
  const graph = await buildGraph();
  return NextResponse.json(graph);
}
