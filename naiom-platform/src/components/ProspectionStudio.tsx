"use client";

/**
 * Pipeline IAcquisition™ de l'agent prospection (Sékou) — CRM Kanban.
 *
 * DÉTECTION (Apify) → ENRICHISSEMENT (site) → PERSONNALISATION (Claude)
 * → CONTACT (Gmail). Vue en 4 colonnes façon CRM ; clic sur un prospect →
 * fiche détaillée en panneau latéral avec tout ce qu'on sait + l'action
 * suivante expliquée AVANT de cliquer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

type LeadStatus = "detecte" | "enrichi" | "pret" | "contacte";

interface Lead {
  id: string;
  name: string;
  niche: string;
  ville: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  mapsUrl?: string;
  rating?: number;
  reviewsCount?: number;
  emails?: string[];
  emailVerified?: boolean;
  socials?: string[];
  insights?: string;
  status: LeadStatus;
  outreach?: { subject: string; email: string; linkedin: string };
  createdAt: string;
  enrichedAt?: string;
  contactedAt?: string;
}

const STAGES: {
  key: LeadStatus;
  n: number;
  label: string;
  sub: string;
  color: string;
  soft: string;
}[] = [
  { key: "detecte", n: 1, label: "Détection", sub: "Ciblé", color: "#5B4DEE", soft: "#EDEBFF" },
  { key: "enrichi", n: 2, label: "Enrichissement", sub: "Profilé", color: "#8B5CF6", soft: "#F1EBFE" },
  { key: "pret", n: 3, label: "Personnalisation", sub: "Prêt", color: "#F5411C", soft: "#FFEBE4" },
  { key: "contacte", n: 4, label: "Contact", sub: "Contacté", color: "#188A5C", soft: "#DFF6EA" },
];

/** Taille estimée d'après le volume d'avis Google (proxy honnête). */
function sizeBucket(reviews?: number): { key: "petite" | "moyenne" | "grande"; label: string } {
  const r = reviews ?? 0;
  if (r >= 300) return { key: "grande", label: "Grande" };
  if (r >= 50) return { key: "moyenne", label: "Moyenne" };
  return { key: "petite", label: "Petite" };
}

/**
 * Score de « fit » du prospect pour NAIOM (agence d'agents IA & automatisations
 * pour PME). Bonne cible = PME active, avec présence digitale et un peu de budget
 * — ni micro-commerce, ni grande chaîne. 0-99 ; ≥ 70 = pré-sélectionné.
 */
export function scoreLead(l: { reviewsCount?: number; website?: string; rating?: number; phone?: string; emails?: string[] }): number {
  let s = 38;
  const r = l.reviewsCount ?? 0;
  if (r >= 30 && r <= 600) s += 26;        // sweet spot PME
  else if (r > 600) s += 10;               // grande chaîne : moins prioritaire
  else if (r >= 8) s += 14;
  else s += 4;
  if (l.website) s += 18;                   // présence digitale = plus mûr
  if ((l.rating ?? 0) >= 4.2) s += 12; else if ((l.rating ?? 0) >= 3.8) s += 6;
  if (l.phone) s += 5;
  if ((l.emails?.length ?? 0) > 0) s += 6;  // joignable par email
  return Math.max(5, Math.min(99, s));
}
function scoreTone(s: number): { color: string; bg: string; label: string } {
  if (s >= 75) return { color: "#188A5C", bg: "#DFF6EA", label: "Top" };
  if (s >= 60) return { color: "#B5651B", bg: "#FFF1E8", label: "Bon" };
  return { color: "#8A8A8A", bg: "#F1F0F7", label: "Moyen" };
}
const FIT_THRESHOLD = 70; // au-dessus → pré-coché

/** Ce que fait chaque action, expliqué avant le clic. */
const ACTION_HELP: Record<LeadStatus, { title: string; desc: string } | null> = {
  detecte: {
    title: "Enrichir ce prospect",
    desc: "Sékou visite son site web pour récupérer son adresse email, ses réseaux sociaux et comprendre son activité. Gratuit, ~10 secondes.",
  },
  enrichi: {
    title: "Personnaliser l'approche",
    desc: "Claude rédige un email + un message LinkedIn sur mesure, basés sur ce qu'on sait vraiment de ce prospect (avis, métier, ville). ~15 secondes.",
  },
  pret: {
    title: "Envoyer le message",
    desc: "Relisez l'email généré, choisissez l'adresse d'envoi, puis l'email part depuis votre Gmail. Le prospect passe en « Contacté ».",
  },
  contacte: null,
};

export function ProspectionStudio() {
  const [needsConfig, setNeedsConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);

  const [niche, setNiche] = useState("");
  const [ville, setVille] = useState("");
  const [max, setMax] = useState(100);
  const [detecting, setDetecting] = useState(false);
  const [found, setFound] = useState(0);
  const [sel, setSel] = useState<Set<string>>(() => new Set());

  const [busy, setBusy] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState("");

  // ---- pipeline : focus sur une étape à la fois ----
  const [activeStage, setActiveStage] = useState<LeadStatus>("detecte");
  // formulaire de recherche repliable (pour laisser le pipeline en haut de l'écran)
  const [searchOpen, setSearchOpen] = useState(false);

  // ---- filtres ----
  const [fSearch, setFSearch] = useState("");
  const [fNiche, setFNiche] = useState("");
  const [fVille, setFVille] = useState("");
  const [fEmail, setFEmail] = useState(""); // "" | "avec" | "verifie" | "sans"
  const [fSize, setFSize] = useState(""); // "" | "petite" | "moyenne" | "grande"
  const [fRating, setFRating] = useState(0); // note minimum

  const load = useCallback(async () => {
    const res = await fetch("/api/prospection/leads");
    const data = await res.json();
    if (data.leads) setLeads(data.leads);
    if (data.configured === false) setNeedsConfig(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId]
  );

  // valeurs distinctes pour peupler les listes déroulantes
  const niches = useMemo(() => [...new Set(leads.map((l) => l.niche))].sort(), [leads]);
  const villes = useMemo(() => [...new Set(leads.map((l) => l.ville))].sort(), [leads]);

  // application des filtres
  const filtered = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    return leads.filter((l) => {
      if (q && !l.name.toLowerCase().includes(q) && !(l.category ?? "").toLowerCase().includes(q)) return false;
      if (fNiche && l.niche !== fNiche) return false;
      if (fVille && l.ville !== fVille) return false;
      if (fSize && sizeBucket(l.reviewsCount).key !== fSize) return false;
      if (fRating && (l.rating ?? 0) < fRating) return false;
      const hasEmail = (l.emails?.length ?? 0) > 0;
      if (fEmail === "avec" && !hasEmail) return false;
      if (fEmail === "verifie" && !l.emailVerified) return false;
      if (fEmail === "sans" && hasEmail) return false;
      return true;
    });
  }, [leads, fSearch, fNiche, fVille, fSize, fRating, fEmail]);

  const activeFilters =
    (fSearch ? 1 : 0) + (fNiche ? 1 : 0) + (fVille ? 1 : 0) + (fEmail ? 1 : 0) + (fSize ? 1 : 0) + (fRating ? 1 : 0);
  function resetFilters() {
    setFSearch(""); setFNiche(""); setFVille(""); setFEmail(""); setFSize(""); setFRating(0);
  }

  async function detect() {
    if (!niche.trim() || !ville.trim()) {
      setError("Indiquez une niche et une ville (ex. « agences immobilières » à « Lyon »).");
      return;
    }
    setError(null);
    setDetecting(true);
    setFound(0);
    try {
      const res = await fetch("/api/prospection/detect-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, ville, max }),
      });
      if (res.status === 412) {
        const d = await res.json().catch(() => ({}));
        setNeedsConfig(true); if (d.error) setError(d.error); return;
      }
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Erreur de détection");
      }
      // lecture du flux : chaque lead « tombe » un par un
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (frame.startsWith("event:")) continue; // marqueurs start/done
          const dl = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!dl) continue;
          try {
            const lead = JSON.parse(dl.slice(5).trim()) as Lead;
            setLeads((prev) => {
              const key = `${lead.name.toLowerCase()}::${lead.ville.toLowerCase()}`;
              if (prev.some((l) => `${l.name.toLowerCase()}::${l.ville.toLowerCase()}` === key)) return prev;
              return [lead, ...prev];
            });
            // pré-sélection auto des meilleurs prospects (score de fit ≥ seuil)
            if (scoreLead(lead) >= FIT_THRESHOLD) setSel((s) => { const n = new Set(s); n.add(lead.id); return n; });
            setFound((f) => f + 1);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDetecting(false);
    }
  }

  async function act(lead: Lead, action: "enrich" | "personalize" | "contact", body?: object) {
    setError(null);
    setBusy((b) => ({ ...b, [lead.id]: action }));
    try {
      const res = await fetch(`/api/prospection/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, ...(body ?? {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      if (data.lead) setLeads((ls) => ls.map((l) => (l.id === lead.id ? data.lead : l)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[lead.id]; return n; });
    }
  }

  const toggleSel = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /** Fait avancer les leads SÉLECTIONNÉS d'une colonne (ou toute la colonne si rien n'est coché). */
  async function advanceSelected(status: LeadStatus, action: "enrich" | "personalize") {
    const inCol = filtered.filter((l) => l.status === status);
    const chosen = inCol.filter((l) => sel.has(l.id));
    const targets = chosen.length ? chosen : inCol;
    setSel((s) => { const n = new Set(s); targets.forEach((t) => n.delete(t.id)); return n; });
    for (const lead of targets) await act(lead, action);
  }

  async function clearAll() {
    if (!window.confirm("Vider tout le pipeline ? Tous les prospects actuels seront supprimés.")) return;
    await fetch("/api/prospection/leads", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }),
    });
    setLeads([]); setSelectedId(null); setFound(0);
  }

  async function removeLead(lead: Lead) {
    if (!window.confirm(`Supprimer « ${lead.name} » du pipeline ?`)) return;
    await fetch("/api/prospection/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id }),
    });
    setLeads((ls) => ls.filter((l) => l.id !== lead.id));
    if (selectedId === lead.id) setSelectedId(null);
  }

  // avance la sélection (ou toute la colonne) pour une étape donnée
  function advanceButton(stageKey: LeadStatus, colLen: number, selInCol: number) {
    if (stageKey !== "detecte" && stageKey !== "enrichi") return null;
    const stage = STAGES.find((s) => s.key === stageKey)!;
    return (
      <button
        type="button"
        onClick={() => advanceSelected(stageKey, stageKey === "detecte" ? "enrich" : "personalize")}
        className="rounded-lg px-3.5 py-2 text-[12px] font-black text-white shadow-sm transition-transform hover:-translate-y-0.5"
        style={{ background: stage.color }}
      >
        {stageKey === "detecte"
          ? (selInCol > 0 ? `→ Enrichir la sélection (${selInCol})` : `→ Tout enrichir (${colLen})`)
          : (selInCol > 0 ? `→ Personnaliser la sélection (${selInCol})` : `→ Tout personnaliser (${colLen})`)}
      </button>
    );
  }

  /* ---------- PIPELINE : ÉTAPES (stepper + focus une étape) ---------- */
  function renderStepper() {
    const stage = STAGES.find((s) => s.key === activeStage)!;
    const col = filtered.filter((l) => l.status === activeStage);
    const colIds = col.map((l) => l.id);
    const selInCol = colIds.filter((id) => sel.has(id)).length;
    const allSel = col.length > 0 && selInCol === col.length;
    const selectable = activeStage === "detecte" || activeStage === "enrichi";
    const toggleColAll = () => setSel((s) => { const n = new Set(s); if (allSel) colIds.forEach((id) => n.delete(id)); else colIds.forEach((id) => n.add(id)); return n; });
    return (
      <div className="space-y-4">
        {/* rail d'étapes cliquable */}
        <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
          {STAGES.map((s, i) => {
            const n = filtered.filter((l) => l.status === s.key).length;
            const on = s.key === activeStage;
            return (
              <div key={s.key} className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveStage(s.key)}
                  className={cn("flex min-w-[150px] flex-col rounded-2xl border px-3.5 py-2.5 text-left transition-all", on ? "bg-white shadow-[0_6px_20px_rgba(20,18,31,0.10)]" : "border-transparent bg-[#F7F6FC] hover:bg-white")}
                  style={{ borderColor: on ? s.color : "transparent" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: on ? s.color : "#C9C6BE" }}>{s.n}</span>
                    <span className={cn("text-[12.5px] font-black", on ? "" : "text-[#8A8A8A]")} style={{ color: on ? s.color : undefined }}>{s.label}</span>
                    <span className="ml-auto rounded-full px-2 py-0.5 text-[12px] font-black" style={{ background: on ? s.soft : "#EEEDF3", color: on ? s.color : "#8A8A8A" }}>{n}</span>
                  </div>
                  <div className="mt-1 text-[10.5px] font-bold text-[#A8A4B4]">→ {s.sub}</div>
                </button>
                {i < STAGES.length - 1 && <span className="flex items-center text-[#D8D5E0]">→</span>}
              </div>
            );
          })}
        </div>

        {/* corps de l'étape sélectionnée */}
        <div className="althea-card p-4" style={{ borderTop: `3px solid ${stage.color}` }}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl text-[15px] font-black text-white" style={{ background: stage.color }}>{stage.n}</span>
            <div>
              <div className="text-[15px] font-black text-[#14121F]">{stage.label}</div>
              <div className="text-[11.5px] font-bold text-[#8A8A8A]">{col.length} prospect{col.length > 1 ? "s" : ""} à cette étape</div>
            </div>
            {selectable && col.length > 0 && (
              <div className="ml-auto flex items-center gap-3">
                <label className="flex items-center gap-2 text-[11.5px] font-bold text-[#8A8A8A] cursor-pointer select-none">
                  <input type="checkbox" checked={allSel} onChange={toggleColAll} className="h-3.5 w-3.5 accent-[#5B4DEE]" />
                  Tout sélectionner{selInCol > 0 ? ` · ${selInCol}` : ""}
                </label>
                {advanceButton(activeStage, col.length, selInCol)}
              </div>
            )}
          </div>
          {col.length === 0 ? (
            <div className="px-2 py-10 text-center text-[12.5px] text-[#B8B5C4]">Aucun prospect à l&apos;étape « {stage.label} » pour l&apos;instant.</div>
          ) : (
            <div
              className="grid gap-2 overflow-y-auto pr-0.5 no-scrollbar"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(176px, 1fr))", maxHeight: "58vh" }}
            >
              {col.map((lead) => (
                <LeadCard key={lead.id} lead={lead} stage={stage} active={selectedId === lead.id} busy={busy[lead.id]} selectable={selectable} checked={sel.has(lead.id)} onToggle={() => toggleSel(lead.id)} onOpen={() => { setSelectedId(lead.id); setSendTo(lead.emails?.[0] ?? ""); }} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (needsConfig) {
    return (
      <div className="althea-card p-10 text-center">
        <div className="text-[44px] mb-3">🕵️</div>
        <h3 className="bronx-name mb-2">Branchez Apify pour la détection</h3>
        <p className="text-[14px] text-[#5A5A5A] max-w-[480px] mx-auto leading-relaxed">
          La détection scrape Google Maps via Apify. Créez un token sur <b>console.apify.com</b>
          → Settings → API &amp; Integrations, puis :
        </p>
        <pre className="mt-4 mx-auto max-w-[420px] rounded-xl bg-[#191627] text-[#B9F0C5] text-left text-[13px] p-4">
APIFY_TOKEN=apify_api_...
        </pre>
        <p className="mt-3 text-[13px] text-[#8A8A8A]">
          dans <code className="bg-[#F7F6FC] px-1.5 py-0.5 rounded">naiom-platform/.env.local</code>, puis relancez le serveur.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: "@keyframes leadpop{from{opacity:0;transform:translateY(-10px) scale(.97)}to{opacity:1;transform:none}}.lead-pop{animation:leadpop .4s cubic-bezier(.2,.8,.3,1.2)}" }} />
      {error && (
        <div className="rounded-xl border border-[#F5411C]/40 bg-[#F5411C]/8 px-4 py-3 text-[13px] font-semibold text-[#C22F0D]">
          ⚠ {error}
        </div>
      )}

      {/* ============ DÉTECTION ============ */}
      <section className="althea-card p-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#5B4DEE] text-[12px] font-black text-white">1</span>
          <h3 className="bronx-name" style={{ fontSize: 17 }}>Trouver de nouveaux prospects</h3>
          <span className="hidden sm:inline text-[12px] text-[#8A8A8A]">— Sékou fait remonter les entreprises <b>une par une, en direct</b></span>
          {leads.length > 0 && !detecting && (
            <button
              type="button"
              onClick={() => setSearchOpen((o) => !o)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#E4E1F5] px-3 py-1.5 text-[12px] font-bold text-[#5B4DEE] transition-colors hover:border-[#5B4DEE]"
            >
              <Icon name={searchOpen ? "ChevronUp" : "Plus"} size={13} />
              {searchOpen ? "Réduire" : "Nouvelle recherche"}
            </button>
          )}
        </div>

        {(searchOpen || leads.length === 0) && (
        <>
        <div className="mt-3 flex flex-col sm:flex-row gap-3">
          <input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="Niche (ex. agences immobilières, dentistes, salles de sport…)"
            className="flex-1 rounded-xl border border-[#E4E1F5] px-4 py-2.5 text-[14px] outline-none focus:border-[#F5411C]"
          />
          <input
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder="Ville (ex. Lyon)"
            className="sm:w-[170px] rounded-xl border border-[#E4E1F5] px-4 py-2.5 text-[14px] outline-none focus:border-[#F5411C]"
          />
          <select
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
            className="rounded-xl border border-[#E4E1F5] px-3 py-2.5 text-[13px] font-semibold outline-none"
          >
            {[10, 25, 50, 100, 200, 300].map((n) => <option key={n} value={n}>{n} leads</option>)}
          </select>
          <button
            type="button"
            onClick={detect}
            disabled={detecting}
            className="bronx-cta-solid whitespace-nowrap disabled:opacity-50"
          >
            {detecting ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Détection…</>
            ) : (<>🕵️ Détecter</>)}
          </button>
        </div>

        {/* raccourcis : niches + villes fréquentes (pour lancer plus vite) */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-black uppercase tracking-wide text-[#8A8A8A]">Niches</span>
          {["Restaurants", "Agences immobilières", "Agences marketing", "Salles de sport", "Dentistes", "Coiffeurs", "Boulangeries", "Cabinets d'avocats", "Garages auto", "Kinés"].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNiche(n)}
              disabled={detecting}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-50",
                niche === n ? "border-[#F5411C] bg-[#FFF1EC] text-[#F5411C]" : "border-[#E4E1F5] bg-white text-[#4A4658] hover:border-[#F5411C] hover:text-[#F5411C]"
              )}
            >
              {n}
            </button>
          ))}
          <span className="ml-2 mr-0.5 text-[11px] font-black uppercase tracking-wide text-[#8A8A8A]">Villes</span>
          {["Lyon", "Paris", "Marseille", "Bordeaux", "Lille", "Nantes", "Toulouse"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVille(v)}
              disabled={detecting}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-50",
                ville === v ? "border-[#5B4DEE] bg-[#EDEBFF] text-[#5B4DEE]" : "border-[#E4E1F5] bg-white text-[#4A4658] hover:border-[#5B4DEE] hover:text-[#5B4DEE]"
              )}
            >
              {v}
            </button>
          ))}
        </div>
        </>
        )}

        {detecting && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[12.5px] font-bold text-[#5B4DEE]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#5B4DEE] animate-pulse" /> {found === 0 ? "Connexion à Google Maps… le scan démarre" : `Sékou remonte les prospects en direct — ${niche} à ${ville}`}</span>
              <span className="tabular-nums">{found} / {max}</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#EDEBFF]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#5B4DEE] to-[#8B5CF6] transition-all duration-200" style={{ width: `${Math.min(100, (found / Math.max(1, max)) * 100)}%` }} />
            </div>
          </div>
        )}
      </section>

      {/* ============ BARRE DE FILTRES ============ */}
      {leads.length > 0 && (
        <section className="althea-card p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A8A]">
                <Icon name="Search" size={14} />
              </span>
              <input
                value={fSearch}
                onChange={(e) => setFSearch(e.target.value)}
                placeholder="Rechercher un nom, un secteur…"
                className="w-full rounded-full border border-[#E4E1F5] bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#F5411C]"
              />
            </div>
            <FSelect value={fNiche} onChange={setFNiche} options={[["", "Tous secteurs"], ...niches.map((n) => [n, n] as [string, string])]} />
            <FSelect value={fVille} onChange={setFVille} options={[["", "Toutes villes"], ...villes.map((v) => [v, v] as [string, string])]} />
            <FSelect
              value={fEmail}
              onChange={setFEmail}
              options={[["", "Email : tous"], ["verifie", "✓ vérifié"], ["avec", "avec email"], ["sans", "sans email"]]}
            />
            <FSelect
              value={fSize}
              onChange={setFSize}
              options={[["", "Taille : toutes"], ["grande", "Grande"], ["moyenne", "Moyenne"], ["petite", "Petite"]]}
            />
            <FSelect
              value={String(fRating)}
              onChange={(v) => setFRating(Number(v))}
              options={[["0", "Note : toutes"], ["4.5", "≥ 4,5 ⭐"], ["4", "≥ 4 ⭐"], ["3.5", "≥ 3,5 ⭐"]]}
            />
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#F5411C]/10 px-3 py-2 text-[12px] font-bold text-[#F5411C] hover:bg-[#F5411C]/15"
              >
                <Icon name="X" size={12} /> {activeFilters} filtre{activeFilters > 1 ? "s" : ""}
              </button>
            )}
          </div>
          <div className="mt-2 px-1 flex items-center justify-between gap-2 text-[12px] text-[#8A8A8A]">
            <span>
              {filtered.length} prospect{filtered.length > 1 ? "s" : ""}
              {activeFilters > 0 && ` sur ${leads.length}`} · taille estimée d&apos;après le nombre d&apos;avis Google
            </span>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#E4E1F5] px-3 py-1.5 text-[12px] font-bold text-[#8A8A8A] transition-colors hover:border-[#F5411C] hover:text-[#F5411C]"
            >
              <Icon name="Trash2" size={12} /> Vider le pipeline
            </button>
          </div>
        </section>
      )}

      {/* ============ LE PIPELINE (3 dispositions au choix) ============ */}
      {leads.length === 0 ? (
        <div className="althea-card p-10 text-center text-[13.5px] text-[#8A8A8A]">
          Aucun prospect pour l&apos;instant — lancez votre première détection 👆
        </div>
      ) : (
        <div className={cn("grid gap-4", selected ? "lg:grid-cols-[1fr_380px]" : "")}>
          <div className="min-w-0">{renderStepper()}</div>

          {/* ============ FICHE PROSPECT (panneau latéral) ============ */}
          {selected && (
            <LeadDetail
              lead={selected}
              busy={busy[selected.id]}
              sendTo={sendTo}
              setSendTo={setSendTo}
              onClose={() => setSelectedId(null)}
              onAct={act}
              onRemove={removeLead}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ================= Carte de prospect (colonne Kanban) ================= */

function LeadCard({
  lead, stage, active, busy, onOpen, selectable, checked, onToggle,
}: {
  lead: Lead;
  stage: (typeof STAGES)[number];
  active: boolean;
  busy?: string;
  onOpen: () => void;
  selectable?: boolean;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const hasEmail = (lead.emails?.length ?? 0) > 0;
  const dot = lead.emailVerified ? "#16A34A" : hasEmail ? "#F59E0B" : "#D8D5E4";
  const dotTitle = lead.emailVerified ? "email vérifié" : hasEmail ? "email trouvé" : "pas d'email";
  const fit = scoreLead(lead);
  const tone = scoreTone(fit);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      title={`${lead.name} · ${lead.category ?? lead.niche} · ${lead.ville} · fit ${fit}/100`}
      className="lead-pop group relative flex min-h-[122px] flex-col rounded-xl border bg-white p-2.5 text-left cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: active || checked ? stage.color : "#EAE8F3", boxShadow: active || checked ? `0 0 0 2px ${stage.color}33` : undefined }}
    >
      {/* haut : score de fit + case */}
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black" style={{ background: tone.bg, color: tone.color }} title={`Fit NAIOM : ${fit}/100`}>
          {fit}<span className="font-bold opacity-80">· {tone.label}</span>
        </span>
        {selectable && (
          <input
            type="checkbox"
            checked={!!checked}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); onToggle?.(); }}
            className="h-4 w-4 accent-[#5B4DEE] cursor-pointer"
          />
        )}
        {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#E4E1F5] border-t-[#F5411C]" />}
      </div>
      {/* nom */}
      <div className="text-[12px] font-black leading-[1.15] text-[#1F1D2B] line-clamp-2">{lead.name}</div>
      {/* secteur · ville */}
      <div className="mt-0.5 text-[10.5px] text-[#8A8A8A] line-clamp-1">{lead.category ?? lead.niche} · {lead.ville}</div>
      {/* bas : note + taille + email */}
      <div className="mt-auto flex items-center gap-1.5 pt-1.5">
        {lead.rating != null && <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-[#B47A24]">★ {lead.rating}</span>}
        <span className="text-[9.5px] font-bold text-[#B8B5C4]">{sizeBucket(lead.reviewsCount).label}</span>
        <span title={dotTitle} className="ml-auto flex items-center gap-1 text-[9.5px] font-bold" style={{ color: dot }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
          {lead.emailVerified ? "vérifié" : hasEmail ? "email" : ""}
        </span>
      </div>
    </div>
  );
}

/* ================= Fiche détaillée ================= */

function LeadDetail({
  lead, busy, sendTo, setSendTo, onClose, onAct, onRemove,
}: {
  lead: Lead;
  busy?: string;
  sendTo: string;
  setSendTo: (v: string) => void;
  onClose: () => void;
  onAct: (lead: Lead, action: "enrich" | "personalize" | "contact", body?: object) => void;
  onRemove: (lead: Lead) => void;
}) {
  const stage = STAGES.find((s) => s.key === lead.status)!;
  const help = ACTION_HELP[lead.status];

  return (
    <aside className="althea-card overflow-hidden self-start lg:sticky lg:top-24">
      {/* bandeau étape */}
      <div className="px-5 py-3.5 flex items-center justify-between" style={{ background: stage.soft }}>
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: stage.color }}>
            {stage.n}
          </span>
          <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: stage.color }}>
            {stage.label} → {stage.sub}
          </span>
        </div>
        <button type="button" onClick={onClose} className="text-[#8A8A8A] hover:text-[#0F0F0F]">
          <Icon name="X" size={16} />
        </button>
      </div>

      <div className="p-5 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
        {/* identité */}
        <div>
          <h3 className="bronx-name" style={{ fontSize: 18, lineHeight: 1.2 }}>{lead.name}</h3>
          <div className="mt-0.5 text-[12.5px] text-[#8A8A8A]">{lead.category ?? lead.niche} · {lead.ville}</div>
        </div>

        {/* fiche : ce qu'on sait */}
        <div className="rounded-xl bg-[#F7F6FC] p-3.5 space-y-2 text-[13px]">
          {lead.rating != null && (
            <InfoRow icon="Star" label="Réputation">
              {lead.rating}/5 · {lead.reviewsCount ?? 0} avis Google
            </InfoRow>
          )}
          <InfoRow icon="Building2" label="Taille estimée">
            {sizeBucket(lead.reviewsCount).label}{" "}
            <span className="text-[#A8A4B4]">(d&apos;après {lead.reviewsCount ?? 0} avis)</span>
          </InfoRow>
          {lead.phone && (
            <InfoRow icon="Phone" label="Téléphone">
              <a href={`tel:${lead.phone}`} className="hover:text-[#F5411C]">{lead.phone}</a>
            </InfoRow>
          )}
          {lead.website && (
            <InfoRow icon="Globe" label="Site web">
              <a href={lead.website} target="_blank" rel="noreferrer" className="text-[#5B4DEE] hover:underline break-all">
                {lead.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}
              </a>
            </InfoRow>
          )}
          {lead.address && <InfoRow icon="MapPin" label="Adresse">{lead.address}</InfoRow>}
          {(lead.emails?.length ?? 0) > 0 && (
            <InfoRow icon="Mail" label={lead.emailVerified ? "Emails · vérifié ✓" : "Emails"}>
              <div className="flex flex-col gap-0.5">
                {lead.emails!.map((e) => (
                  <span key={e} className="break-all inline-flex items-center gap-1">
                    {lead.emailVerified && <Icon name="BadgeCheck" size={12} className="text-[#188A5C] shrink-0" />}
                    {e}
                  </span>
                ))}
                {lead.emailVerified && (
                  <span className="text-[11px] text-[#188A5C]">domaine avec serveur mail actif</span>
                )}
              </div>
            </InfoRow>
          )}
          {(lead.socials?.length ?? 0) > 0 && (
            <InfoRow icon="Share2" label="Réseaux">
              <div className="flex flex-wrap gap-1.5">
                {lead.socials!.map((s) => {
                  const net = s.includes("linkedin") ? "LinkedIn" : s.includes("instagram") ? "Instagram" : "Facebook";
                  return (
                    <a key={s} href={s} target="_blank" rel="noreferrer"
                      className="rounded-full bg-white border border-[#E4E1F5] px-2 py-0.5 text-[11px] font-bold hover:border-[#F5411C]">
                      {net}
                    </a>
                  );
                })}
              </div>
            </InfoRow>
          )}
          {lead.mapsUrl && (
            <InfoRow icon="Map" label="Google Maps">
              <a href={lead.mapsUrl} target="_blank" rel="noreferrer" className="text-[#5B4DEE] hover:underline">Voir la fiche</a>
            </InfoRow>
          )}
        </div>

        {/* insights (après enrichissement) */}
        {lead.insights && (
          <div className="rounded-xl border border-[#EEEDF6] p-3.5">
            <div className="text-[10.5px] font-black uppercase tracking-wider text-[#8A8A8A] mb-1">🔎 Ce que Sékou a compris</div>
            <p className="text-[12.5px] leading-relaxed text-[#3A3A3A]">{lead.insights}</p>
          </div>
        )}

        {/* message généré (étape prêt / contacté) */}
        {lead.outreach && (
          <div className="space-y-3">
            <div>
              <div className="text-[10.5px] font-black uppercase tracking-wider text-[#8A8A8A] mb-1">✉️ Email — objet</div>
              <div className="text-[13px] font-bold mb-1.5">{lead.outreach.subject}</div>
              <div className="rounded-xl bg-[#F7F6FC] p-3 text-[12.5px] leading-relaxed whitespace-pre-wrap">{lead.outreach.email}</div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10.5px] font-black uppercase tracking-wider text-[#8A8A8A]">💼 Message LinkedIn</div>
                <button type="button" onClick={() => navigator.clipboard.writeText(lead.outreach!.linkedin)}
                  className="text-[11px] font-bold text-[#5B4DEE] hover:underline inline-flex items-center gap-1">
                  <Icon name="Copy" size={11} /> Copier
                </button>
              </div>
              <div className="rounded-xl bg-[#F7F6FC] p-3 text-[12.5px] leading-relaxed whitespace-pre-wrap">{lead.outreach.linkedin}</div>
            </div>
          </div>
        )}

        {/* ---- ACTION suivante, expliquée AVANT le clic ---- */}
        {help && (
          <div className="rounded-xl border-2 p-3.5" style={{ borderColor: stage.color, background: stage.soft }}>
            <div className="text-[13px] font-black mb-1" style={{ color: stage.color }}>
              Prochaine étape — {help.title}
            </div>
            <p className="text-[12px] leading-relaxed text-[#3A3A3A] mb-3">{help.desc}</p>

            {lead.status === "pret" ? (
              <div className="space-y-2">
                <input
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="destinataire@entreprise.fr"
                  className="w-full rounded-lg border border-[#E4E1F5] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#F5411C]"
                />
                <button
                  type="button"
                  disabled={busy === "contact" || !sendTo.trim()}
                  onClick={() => onAct(lead, "contact", { to: sendTo.trim() })}
                  className="bronx-cta-solid w-full justify-center text-[13px] disabled:opacity-50"
                >
                  {busy === "contact" ? "Envoi…" : "📤 Envoyer via Gmail"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => onAct(lead, lead.status === "detecte" ? "enrich" : "personalize")}
                className="bronx-cta-solid w-full justify-center text-[13px] disabled:opacity-50"
              >
                {busy ? "En cours…" : lead.status === "detecte" ? "🔎 Enrichir" : "✨ Personnaliser"}
              </button>
            )}
          </div>
        )}

        {lead.status === "contacte" && (
          <div className="rounded-xl bg-[#DFF6EA] p-3.5 text-center">
            <div className="text-[13px] font-black text-[#188A5C]">✓ Prospect contacté</div>
            {lead.contactedAt && (
              <div className="text-[11px] text-[#5A8B72] mt-0.5">
                Email envoyé le {new Date(lead.contactedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => onRemove(lead)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-full py-2 text-[12px] font-bold text-[#B8B5C4] hover:text-[#F5411C] transition-colors"
        >
          <Icon name="Trash2" size={13} /> Retirer du pipeline
        </button>
      </div>
    </aside>
  );
}

function FSelect({
  value, onChange, options,
}: {
  value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "rounded-full border bg-white px-3 py-2 text-[12.5px] font-semibold outline-none focus:border-[#F5411C]",
        value ? "border-[#F5411C] text-[#F5411C]" : "border-[#E4E1F5] text-[#3A3A3A]"
      )}
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function InfoRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Icon name={icon} size={14} className="mt-0.5 shrink-0 text-[#8A8A8A]" />
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#A8A4B4]">{label}</div>
        <div className="text-[12.5px] text-[#3A3A3A]">{children}</div>
      </div>
    </div>
  );
}
