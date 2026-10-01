import { NextResponse } from "next/server";
import { KPIS, DEPARTMENTS } from "@/lib/cerveau/company";

export const runtime = "nodejs";

/** GET /api/cerveau/overview — vue d'ensemble entreprise (KPIs + départements + onboarding). */
export async function GET() {
  return NextResponse.json({ kpis: KPIS, departments: DEPARTMENTS });
}
