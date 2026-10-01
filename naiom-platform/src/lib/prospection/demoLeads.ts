import type { Lead } from "@/lib/prospection/store";

/**
 * Génère des leads FICTIFS mais crédibles pour la démo live (effet « waw » :
 * les prospects tombent un par un). Aucune donnée réelle — 100 % synthétique.
 */

const PREFIX = ["Groupe", "Studio", "Cabinet", "Agence", "Maison", "Atelier", "Espace", "Compagnie", "Résidence", ""];
const ROOT = ["Horizon", "Prestige", "Azur", "Lumière", "Nova", "Élite", "Concept", "Vision", "Harmonie", "Boréal", "Odéon", "Méridien", "Optima", "Céleste", "Aurore", "Impulse", "Vertige", "Origami", "Kairos", "Luna", "Soléa", "Néroli", "Cédre", "Ovation", "Alto", "Séquoia", "Volta"];
const LAST = ["Martin", "Bernard", "Dubois", "Robert", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "Roux", "Fournier", "Girard", "Bonnet", "Dupont", "Lambert", "Fontaine", "Rousseau", "Vincent", "Muller", "Faure", "André", "Mercier", "Blanc", "Guerin", "Boyer", "Garnier"];
const FIRST = ["camille", "thomas", "sofia", "lucas", "ines", "julie", "marc", "laura", "nicolas", "emma", "paul", "clara", "hugo", "lea", "antoine", "chloe", "maxime", "sarah", "yanis", "manon"];
const STREET = ["rue de la République", "avenue Jean-Jaurès", "rue Victor-Hugo", "cours Lafayette", "rue Gambetta", "boulevard des Belges", "rue de la Paix", "avenue de la Liberté", "rue des Fleurs", "place du Marché", "rue Nationale", "allée des Tilleuls", "quai du Rhône", "rue Sainte-Catherine", "avenue du Général-de-Gaulle"];

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function ri(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}

/** Nom d'entreprise plausible selon quelques patrons. */
function businessName(niche: string, ville: string): string {
  const nicheWord = niche.trim().split(/\s+/)[0].replace(/s$/, "");
  const pats = [
    () => `${pick(PREFIX)} ${pick(ROOT)}`.trim(),
    () => `${pick(ROOT)} & ${pick(ROOT)}`,
    () => `Cabinet ${pick(LAST)}`,
    () => `${pick(ROOT)} ${ville}`,
    () => `${pick(LAST)} ${pick(ROOT)}`,
    () => `${pick(ROOT)} ${nicheWord.charAt(0).toUpperCase() + nicheWord.slice(1)}`,
  ];
  return pick(pats)().replace(/\s+/g, " ").trim();
}

export function generateDemoLeads(niche: string, ville: string, n: number): Lead[] {
  const now = new Date().toISOString();
  const count = Math.max(1, Math.min(n, 300));
  const out: Lead[] = [];
  const seen = new Set<string>();
  const category = niche.trim().charAt(0).toUpperCase() + niche.trim().slice(1).replace(/s$/, "");

  for (let i = 0; i < count; i++) {
    let name = businessName(niche, ville);
    let guard = 0;
    while (seen.has(name) && guard++ < 8) name = businessName(niche, ville);
    seen.add(name);
    const slug = slugify(name);

    const hasSite = Math.random() < 0.78;
    const hasEmail = hasSite && Math.random() < 0.62;
    const verified = hasEmail && Math.random() < 0.55;
    const reviews = pick([ri(3, 40), ri(10, 120), ri(40, 320), ri(120, 800)]);
    const rating = Math.round((3.7 + Math.random() * 1.3) * 10) / 10;
    const tld = Math.random() < 0.8 ? "fr" : "com";
    const domain = `${slug}.${tld}`;
    const website = hasSite ? `https://www.${domain}` : undefined;
    const fn = pick(FIRST), ln = slugify(pick(LAST));
    const local = pick(["contact", "contact", "info", "hello", "bonjour", "accueil", "commercial", fn, `${fn}.${ln}`, `${fn.charAt(0)}.${ln}`]);
    const emails = hasEmail ? [`${local}@${domain}`] : [];
    const socials: string[] = [];
    if (hasSite && Math.random() < 0.5) socials.push(`https://www.linkedin.com/company/${slug}`);
    if (Math.random() < 0.45) socials.push(`https://www.instagram.com/${slug}`);

    out.push({
      id: `lead-${Date.now()}-${i}-${Math.floor(Math.random() * 1e4)}`,
      name,
      niche: niche.trim(),
      ville: ville.trim(),
      category,
      address: `${ri(1, 180)} ${pick(STREET)}, ${ri(1, 95).toString().padStart(2, "0")}${ri(100, 999)} ${ville.trim()}`,
      phone: `0${ri(1, 9)} ${ri(10, 99)} ${ri(10, 99)} ${ri(10, 99)} ${ri(10, 99)}`,
      website,
      mapsUrl: `https://www.google.com/maps/search/${encodeURIComponent(name + " " + ville)}`,
      rating,
      reviewsCount: reviews,
      emails,
      emailVerified: verified,
      socials,
      insights: hasSite
        ? `${category} à ${ville.trim()} · ${reviews} avis (${rating}★)${hasEmail ? " · email trouvé sur le site" : " · pas d'email public"}`
        : `${category} à ${ville.trim()} · ${reviews} avis (${rating}★) · pas de site web`,
      status: "detecte", // tout nouveau lead atterrit en Détection
      createdAt: now,
    });
  }
  return out;
}
