"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { AgentAvatar } from "./AgentAvatar";
import { scoreLead } from "./ProspectionStudio";
import { cn } from "@/lib/utils";

export interface PropCall {
  id: string; title: string; date: string; type: string; participants: string[]; summary: string;
}

interface Lead {
  id: string; name: string; niche: string; ville: string; category?: string; website?: string;
  rating?: number; reviewsCount?: number; emails?: string[]; phone?: string; insights?: string; status: string;
}

interface GenResult {
  prospect: string; reference: string; filename: string; downloadUrl: string;
  email: { subject: string; body: string };
}
interface GenItem { id: string; prospect: string; source: Source; res: GenResult; to: string; subject: string; message: string; sent: boolean; }

type Source = "lead" | "call";
const INTERNAL = /zeyneb|maxim|naiom/i;

function scoreTone(s: number) {
  if (s >= 75) return { color: "#188A5C", bg: "#DFF6EA", label: "🔥 Chaud" };
  if (s >= 60) return { color: "#B5651B", bg: "#FFF1E8", label: "Bon" };
  return { color: "#8A8A8A", bg: "#F1F0F7", label: "Tiède" };
}

export function PropositionStudio({ calls: allCalls }: { calls: PropCall[] }) {
  const calls = useMemo(() => allCalls.filter((c) => c.type !== "interne"), [allCalls]);
  const [source, setSource] = useState<Source>("lead");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoaded, setLeadsLoaded] = useState(false);
  const [leadSel, setLeadSel] = useState<Set<string>>(new Set());
  const [callSel, setCallSel] = useState<Set<string>>(new Set());

  const [gen, setGen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [results, setResults] = useState<GenItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/prospection/leads").then((r) => r.json()).then((d) => {
      if (Array.isArray(d.leads)) setLeads(d.leads);
    }).catch(() => {}).finally(() => setLeadsLoaded(true));
  }, []);

  const hotLeads = useMemo(() => [...leads].sort((a, b) => scoreLead(b) - scoreLead(a)).slice(0, 24), [leads]);
  const prospectOf = (c: PropCall) => {
    const paren = c.title.match(/\(([^),]+)/)?.[1]?.trim();
    if (paren) return paren;
    return c.participants.find((p) => !INTERNAL.test(p)) ?? c.title.replace(/^.*?—\s*/, "").split("(")[0].trim();
  };

  const sel = source === "lead" ? leadSel : callSel;
  const setSel = source === "lead" ? setLeadSel : setCallSel;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selCount = sel.size;

  const active = results.find((r) => r.id === activeId) ?? null;
  const patchActive = (patch: Partial<GenItem>) => setResults((rs) => rs.map((r) => (r.id === activeId ? { ...r, ...patch } : r)));

  async function genOne(source: Source, item: Lead | PropCall): Promise<GenItem | null> {
    const body = source === "lead"
      ? { lead: (() => { const l = item as Lead; return { name: l.name, niche: l.niche, ville: l.ville, category: l.category, website: l.website, rating: l.rating, reviewsCount: l.reviewsCount, emails: l.emails, phone: l.phone, insights: l.insights }; })() }
      : { callId: (item as PropCall).id };
    const r = await fetch("/api/propositions/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Génération impossible");
    const to = source === "lead" ? ((item as Lead).emails?.[0] ?? "") : "";
    return { id: `${(item as { id: string }).id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, prospect: j.prospect, source, res: j, to, subject: j.email?.subject ?? `Proposition — ${j.prospect}`, message: j.email?.body ?? "", sent: false };
  }

  async function generate() {
    const items: (Lead | PropCall)[] = source === "lead" ? hotLeads.filter((l) => leadSel.has(l.id)) : calls.filter((c) => callSel.has(c.id));
    if (!items.length) return;
    setGen(true); setErr(null);
    const fresh: GenItem[] = [];
    let firstId: string | null = null;
    for (let i = 0; i < items.length; i++) {
      const name = source === "lead" ? (items[i] as Lead).name : prospectOf(items[i] as PropCall);
      setProgress({ done: i, total: items.length, name });
      try {
        const it = await genOne(source, items[i]);
        if (it) { fresh.push(it); if (!firstId) firstId = it.id; }
      } catch (e) { setErr(e instanceof Error ? e.message : "Erreur sur un prospect"); }
    }
    setProgress(null); setGen(false);
    if (fresh.length) {
      setResults((rs) => [...fresh, ...rs]);
      setActiveId(firstId);
      setSel(new Set()); // vide la sélection après génération
      window.dispatchEvent(new Event("propositions:changed")); // rafraîchit le tableau de bord Suivi
    }
  }

  async function send() {
    if (!active) return;
    setSending(true); setErr(null);
    try {
      const r = await fetch("/api/propositions/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: active.res.filename, to: active.to, subject: active.subject, message: active.message }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Envoi impossible");
      patchActive({ sent: true });
      window.dispatchEvent(new Event("propositions:changed"));
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); } finally { setSending(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black tracking-tight text-[var(--color-ink)]">Studio Proposition — Victor</h2>
        <p className="text-[13px] text-[var(--color-muted)]">Choisis la source, coche <b>un ou plusieurs prospects</b>, et Victor génère toutes les propositions d&apos;un coup. Tu les relis et les envoies par mail.</p>
      </div>

      {/* sélecteur de source (2 agents) */}
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          { key: "lead" as Source, slug: "prospection", name: "Sacha", role: "Leads détectés", desc: "Prospection à froid — coche les prospects chauds à démarcher.", count: leads.length, unit: "leads" },
          { key: "call" as Source, slug: "fireflies", name: "Jules", role: "Calls analysés", desc: "Après rendez-vous — la propal reprend les besoins du call.", count: calls.length, unit: "calls" },
        ]).map((sc) => {
          const on = source === sc.key;
          return (
            <button key={sc.key} onClick={() => setSource(sc.key)}
              className={cn("flex items-center gap-3 rounded-2xl p-3 text-left transition hover-lift", on ? "border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/5" : "border border-[var(--color-line)] bg-[var(--color-bg)]")}>
              <div className={cn("relative shrink-0 rounded-full", on ? "ring-2 ring-[var(--color-accent)]" : "")}><AgentAvatar slug={sc.slug} size={52} animate={on} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="text-[15px] font-black text-[var(--color-ink)]">{sc.name}</span><span className="rounded-full bg-[var(--color-line)]/60 px-2 py-0.5 text-[10px] font-black text-[var(--color-muted)]">{sc.role}</span></div>
                <div className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--color-muted)]">{sc.desc}</div>
              </div>
              <span className={cn("shrink-0 text-[12px] font-black", on ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]")}>{sc.count} {sc.unit}</span>
            </button>
          );
        })}
      </div>

      {/* liste sélectionnable */}
      {source === "lead" ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><AgentAvatar slug="prospection" size={22} animate={false} /><span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--color-muted)]">Coche les leads les plus chauds de Sacha</span></div>
            {hotLeads.length > 0 && <button onClick={() => setLeadSel((s) => s.size === hotLeads.length ? new Set() : new Set(hotLeads.map((l) => l.id)))} className="text-[11px] font-bold text-[var(--color-accent)] hover:underline">{leadSel.size === hotLeads.length ? "Tout décocher" : "Tout cocher"}</button>}
          </div>
          {!leadsLoaded ? <div className="althea-card p-4 text-[13px] text-[var(--color-muted)]">Chargement des leads…</div>
            : hotLeads.length === 0 ? <div className="althea-card p-4 text-[13px] text-[var(--color-muted)]">Aucun lead — lance une détection dans l&apos;agent Sacha.</div>
            : (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", maxHeight: 340, overflowY: "auto" }}>
                {hotLeads.map((l) => {
                  const fit = scoreLead(l); const tone = scoreTone(fit); const on = leadSel.has(l.id); const hasEmail = (l.emails?.length ?? 0) > 0;
                  return (
                    <button key={l.id} onClick={() => toggle(l.id)} className={cn("relative flex flex-col rounded-xl p-2.5 text-left transition hover-lift", on ? "border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/5" : "border border-[var(--color-line)] bg-[var(--color-bg)]")}>
                      <span className={cn("absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-[5px] border text-[9px] text-white", on ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-line)] bg-white")}>{on ? "✓" : ""}</span>
                      <span className="inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black" style={{ background: tone.bg, color: tone.color }}>{fit} · {tone.label}</span>
                      <div className="mt-1 text-[12.5px] font-black leading-tight text-[var(--color-ink)] line-clamp-2 pr-5">{l.name}</div>
                      <div className="mt-0.5 text-[10.5px] text-[var(--color-muted)] line-clamp-1">{l.category ?? l.niche} · {l.ville}</div>
                      <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-[10px] font-bold text-[var(--color-muted)]">{l.rating != null && <span className="text-[#B47A24]">★ {l.rating}</span>}{l.reviewsCount != null && <span>· {l.reviewsCount} avis</span>}{hasEmail && <span className="ml-auto">✉️</span>}</div>
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><AgentAvatar slug="fireflies" size={22} animate={false} /><span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--color-muted)]">Coche les calls analysés par Jules</span></div>
            {calls.length > 0 && <button onClick={() => setCallSel((s) => s.size === calls.length ? new Set() : new Set(calls.map((c) => c.id)))} className="text-[11px] font-bold text-[var(--color-accent)] hover:underline">{callSel.size === calls.length ? "Tout décocher" : "Tout cocher"}</button>}
          </div>
          {calls.length === 0 ? <div className="althea-card p-4 text-[13px] text-[var(--color-muted)]">Aucun call disponible.</div> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {calls.map((c) => { const on = callSel.has(c.id); return (
                <button key={c.id} onClick={() => toggle(c.id)} className={cn("relative text-left rounded-xl p-3 transition hover-lift", on ? "border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/5" : "border border-[var(--color-line)] bg-[var(--color-bg)]")}>
                  <span className={cn("absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-[5px] border text-[9px] text-white", on ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-line)] bg-white")}>{on ? "✓" : ""}</span>
                  <div className="mb-1 flex items-center gap-2"><span className="chip emerald text-[10px]"><Icon name="Mic" size={10} /> {c.type}</span><span className="text-[11px] text-[var(--color-muted)]">{new Date(c.date).toLocaleDateString("fr-FR")}</span></div>
                  <div className="text-[13px] font-bold leading-tight text-[var(--color-ink)] pr-5">{prospectOf(c)}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--color-muted)]">{c.summary}</div>
                </button>
              ); })}
            </div>
          )}
        </div>
      )}

      {/* générer */}
      <div className="flex items-center gap-3">
        <button onClick={generate} disabled={selCount === 0 || gen}
          className="flex items-center gap-2 rounded-xl bg-[var(--color-ink)] px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-40">
          <Icon name={gen ? "Loader" : "FileSignature"} size={14} className={gen ? "animate-spin" : ""} />
          {gen ? "Victor rédige…" : selCount <= 1 ? `Générer la proposition${selCount ? "" : ""}` : `Générer ${selCount} propositions d'un coup`}
        </button>
        {progress && <span className="text-[12px] font-bold text-[var(--color-muted)]">{progress.done + 1}/{progress.total} · <b className="text-[var(--color-ink)]">{progress.name}</b>…</span>}
      </div>

      {err && <div className="althea-card border-red-300 p-3 text-[13px] text-red-600">{err}</div>}

      {/* liste des propositions générées */}
      {results.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {results.map((r) => (
            <button key={r.id} onClick={() => setActiveId(r.id)}
              className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-bold transition", activeId === r.id ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 text-[var(--color-ink)]" : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-ink)]")}>
              <span className="text-[11px]">{r.source === "lead" ? "🎯" : "📞"}</span>{r.prospect}
              {r.sent ? <span className="rounded-full bg-[#DFF6EA] px-1.5 text-[10px] font-black text-[#188A5C]">✓</span> : null}
            </button>
          ))}
        </div>
      )}

      {/* pane du résultat actif (PDF + email) */}
      {active && (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
          <div className="althea-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
              <div className="flex items-center gap-2 text-[12px] font-black text-[var(--color-ink)]"><Icon name="FileText" size={13} /> {active.res.reference} · {active.prospect}</div>
              <div className="flex items-center gap-3">
                <button onClick={() => setFull(true)} className="text-[11px] font-bold text-[var(--color-muted)] hover:text-[var(--color-ink)]">Plein écran ↗</button>
                <a href={active.res.downloadUrl} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-[var(--color-muted)] hover:text-[var(--color-ink)]">Télécharger</a>
              </div>
            </div>
            <iframe src={`${active.res.downloadUrl}#toolbar=1&view=FitH`} title="Proposition" className="h-[560px] w-full bg-black/5" />
          </div>

          <div className="althea-card p-4">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black text-[var(--color-ink)]"><Icon name="Mail" size={14} /> Email au prospect</div>
            <Field label="À"><input value={active.to} onChange={(e) => patchActive({ to: e.target.value })} placeholder="email@prospect.com" className="pinput" /></Field>
            <Field label="Objet"><input value={active.subject} onChange={(e) => patchActive({ subject: e.target.value })} className="pinput" /></Field>
            <Field label="Message"><textarea value={active.message} onChange={(e) => patchActive({ message: e.target.value })} rows={11} className="pinput resize-none" /></Field>
            <div className="mt-3 flex items-center justify-between">
              {active.sent ? <span className="text-[13px] font-bold text-emerald-600">Envoyée à {active.to} ✓</span> : <span className="text-[11px] text-[var(--color-muted)]">PDF joint : {active.res.filename}</span>}
              <button onClick={send} disabled={sending || !active.to || active.sent}
                className="flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-40">
                <Icon name={sending ? "Loader" : "Send"} size={14} className={sending ? "animate-spin" : ""} />
                {sending ? "Envoi…" : active.sent ? "Envoyée" : "Approuver & envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {full && active && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4" onClick={() => setFull(false)}>
          <div className="mb-2 flex justify-end"><button onClick={() => setFull(false)} className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-bold">Fermer ✕</button></div>
          <iframe src={active.res.downloadUrl} title="Proposition plein écran" className="w-full flex-1 rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <style jsx>{`.pinput{width:100%;border:1px solid var(--color-line);border-radius:10px;padding:9px 11px;font-size:13px;background:var(--color-bg);color:var(--color-ink);margin-bottom:2px}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-2"><div className="mb-1 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--color-muted)]">{label}</div>{children}</div>;
}
