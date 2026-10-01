/**
 * Client Apify — scraping pour l'agent prospection (Sékou / IAcquisition™).
 *
 * Auth : APIFY_TOKEN dans .env.local (Apify → Settings → Integrations → API token).
 * Acteur utilisé pour la DÉTECTION : compass/crawler-google-places
 * (Google Maps : nom, téléphone, site, note, nombre d'avis — par niche + ville).
 *
 * Le run est asynchrone : on démarre l'acteur, on poll son statut, puis on
 * lit les items du dataset.
 */

const BASE = "https://api.apify.com/v2";
// Acteur Google Maps officiel du store Apify
const GMAPS_ACTOR = "compass~crawler-google-places";

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) {
    throw new Error(
      "APIFY_TOKEN absent : créez un token sur console.apify.com (Settings → API & Integrations) et ajoutez APIFY_TOKEN=... dans naiom-platform/.env.local, puis relancez le serveur."
    );
  }
  return t;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}token=${token()}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Apify ${path.split("?")[0]} → ${res.status} : ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}