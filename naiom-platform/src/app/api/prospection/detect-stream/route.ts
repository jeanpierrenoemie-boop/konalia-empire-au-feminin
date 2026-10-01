import { apifyConfigured, startDetectRun, runStatus, datasetItems, abortRun, type GmapsPlace } from "@/lib/integrations/apify";
import { addLeads, type Lead } from "@/lib/prospection/store";
import { generateDemoLeads } from "@/lib/prospection/demoLeads";

export const runtime = "nodejs";
export const maxDuration = 600;

function place2lead(p: GmapsPlace, niche: string, ville: string, i: number): Lead {
  const emails = (p.emails ?? []).filter(Boolean);
  const socials = [...(p.linkedIns ?? []), ...(p.instagrams ?? []), ...(p.facebooks ?? [])];
  return {
    id: `lead-${Date.now()}-${i}-${Math.floor(Math.random() * 1e4)}`,
    name: p.title!, niche, ville, category: p.categoryName, address: p.address, phone: p.phone,
    website: p.website, mapsUrl: p.url, rating: p.totalScore, reviewsCount: p.reviewsCount,
    emails, emailVerified: false, socials,
    status: "detecte", // tout nouveau lead atterrit en Détection
    createdAt: new Date().toISOString(),
  };
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

/** Flux SSE de secours : leads de démo révélés un par un. */
function demoStream(niche: string, ville: string, target: number): Response {
  const leads = generateDemoLeads(niche, ville, target);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode(`event: start\ndata: ${JSON.stringify({ total: leads.length, source: "demo" })}\n\n`));
      let n = 0;
      for (const lead of leads) {
        const added = await addLeads([lead]);
        if (!added.length) continue;
        n++;
        c.enqueue(enc.encode(`data: ${JSON.stringify(lead)}\n\n`));
        await new Promise((r) => setTimeout(r, 130 + Math.random() * 90));
      }
      c.enqueue(enc.encode(`event: done\ndata: ${n}\n\n`));
      c.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * POST /api/prospection/detect-stream — recherche EN DIRECT.
 * Vraies données Apify (Google Maps) : on démarre le run puis on renvoie chaque
 * entreprise DÈS qu'elle sort du scraper (streaming incrémental). Fallback démo.
 */
export async function POST(req: Request) {
  const { niche, ville, max } = await req.json().catch(() => ({}));
  if (!niche?.trim() || !ville?.trim()) {
    return Response.json({ error: "Niche et ville requises." }, { status: 400 });
  }
  const target = Math.max(1, Math.min(Number(max) || 100, 300));
  const nq = niche.trim(), vq = ville.trim();

  if (!apifyConfigured()) return demoStream(nq, vq, target);

  // démarre le vrai run Apify ; si ça échoue, on bascule sur la démo
  let runId: string, datasetId: string;
  try {
    ({ runId, datasetId } = await startDetectRun({ niche: nq, ville: vq, max: target }));
  } catch {
    return demoStream(nq, vq, target);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      const evt = (name: string, data: string) => c.enqueue(enc.encode(`event: ${name}\ndata: ${data}\n\n`));
      evt("start", JSON.stringify({ total: target, source: "apify" }));

      let offset = 0, idx = 0, emptyPolls = 0;
      const deadline = Date.now() + 9 * 60_000;
      try {
        for (;;) {
          let items: GmapsPlace[] = [];
          try { items = await datasetItems(datasetId, offset, 50); } catch { items = []; }
          if (items.length) {
            offset += items.length;
            emptyPolls = 0;
            for (const p of items) {
              if (!p.title || idx >= target) continue;
              const lead = place2lead(p, nq, vq, idx);
              const added = await addLeads([lead]); // dédoublonne par nom+ville
              if (!added.length) continue; // déjà vu → on n'émet pas de doublon
              idx++;
              send(lead);
              await new Promise((r) => setTimeout(r, 45));
            }
          } else {
            emptyPolls += 1;
          }
          if (idx >= target) break;

          let status = "RUNNING";
          try { status = (await runStatus(runId)).status; } catch { /* garde RUNNING */ }
          if (status === "SUCCEEDED") {
            // dernière lecture des items restants
            let rest: GmapsPlace[] = [];
            try { rest = await datasetItems(datasetId, offset, 300); } catch { rest = []; }
            for (const p of rest) {
              if (!p.title || idx >= target) continue;
              const lead = place2lead(p, nq, vq, idx);
              const added = await addLeads([lead]);
              if (!added.length) continue;
              idx++;
              send(lead);
              await new Promise((r) => setTimeout(r, 45));
            }
            break;
          }
          if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
            evt("error", JSON.stringify({ message: `Scraping interrompu (${status}).` }));
            break;
          }
          if (Date.now() > deadline || emptyPolls > 80) { await abortRun(runId); break; }
          if (!items.length) await new Promise((r) => setTimeout(r, 900)); // attendre de nouveaux items
        }
      } catch (e) {
        evt("error", JSON.stringify({ message: e instanceof Error ? e.message : "Erreur" }));
      }
      evt("done", String(idx));
      c.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
