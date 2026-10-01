"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CerveauOverview } from "./CerveauOverview";

/**
 * CerveauStudio — le "cerveau de l'entreprise" de Kéïta.
 * Rend le vault Obsidian sous forme de graphe force-directed, et ANIME la
 * recherche : quand on pose une question, on voit le cerveau parcourir les
 * notes une à une (nœuds qui s'allument, arêtes qui pulsent, lecture affichée).
 */

export interface GNode { id: string; title: string; group: string; source: string; tags: string[]; degree: number }
export interface GEdge { source: string; target: string }
export interface Graph { nodes: GNode[]; edges: GEdge[]; groups: string[]; sources: string[]; count: number }
interface Visited { id: string; title: string; group: string; source: string; excerpt: string }
interface CAction {
  type: "email" | "message" | "db" | "call" | "note";
  label: string;
  to?: string; subject?: string; body?: string; target?: string; change?: string; title?: string;
}
interface QueryResp { query: string; path: string[]; visited: Visited[]; edges: GEdge[]; answer: string; actions?: CAction[] }

const CALL_URL = "http://l.postlix.com/cadeau-appel";
const ACT_ICON: Record<CAction["type"], string> = { email: "✉️", message: "💬", db: "🗄️", call: "📞", note: "📝" };
const ACT_CTA: Record<CAction["type"], string> = { email: "Envoyer l'email", message: "Envoyer le message", db: "Mettre à jour la base", call: "Ouvrir le calendrier", note: "Ajouter la note" };

const GROUP_COLORS: Record<string, string> = {
  "Entreprise": "#FF6A3D", "Équipe": "#7B6CFF", "Offres": "#12b886", "Clients": "#ff6b9d",
  "Réunions": "#ffa94d", "Finances": "#4dabf7", "Process": "#b197fc", "Onboarding": "#22d3ee", "Outils": "#ff8787",
};
const col = (g: string) => GROUP_COLORS[g] || "#adb5bd";
const TERRA = "#cf6a44";

/** Petit sunburst (mark premium) — remplace l'emoji cerveau. */
function Spark({ size = 18, color = TERRA }: { size?: number; color?: string }) {
  const n = 11, r = 14, w = 7;
  const rays = Array.from({ length: n }).map((_, i) => {
    const len = [46, 44, 47, 43, 46, 45, 47, 44, 46, 45, 47][i];
    return <rect key={i} x={50 - w / 2} y={50 - len} width={w} height={len - r} rx={w / 2} transform={`rotate(${i * (360 / n)} 50 50)`} />;
  });
  return <svg width={size} height={size} viewBox="0 0 100 100" fill={color} style={{ display: "block" }}><g>{rays}<circle cx="50" cy="50" r={r} /></g></svg>;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Layout 3D : force-directed dans l'espace (repulsion + ressorts + gravité au centre). */
function computeLayout3D(nodes: GNode[], edges: GEdge[]): Record<string, { x: number; y: number; z: number }> {
  const n = nodes.length; if (!n) return {};
  const idx = new Map(nodes.map((d, i) => [d.id, i]));
  const pos = nodes.map((_, i) => {
    const a = i * 2.399963, zz = 1 - (2 * i + 1) / n, rr = Math.sqrt(Math.max(0, 1 - zz * zz));
    return { x: Math.cos(a) * rr * 180 + ((i % 7) - 3), y: zz * 180, z: Math.sin(a) * rr * 180 + ((i % 5) - 2), vx: 0, vy: 0, vz: 0 };
  });
  const links = edges.map((e) => ({ s: idx.get(e.source)!, t: idx.get(e.target)! })).filter((l) => l.s != null && l.t != null);
  const deg = new Array(n).fill(0); for (const l of links) { deg[l.s] += 1; deg[l.t] += 1; }
  const ITER = 430, kRep = 52000, L = 88, kSpring = 0.02, kCenter = 0.006, damp = 0.85;
  for (let it = 0; it < ITER; it++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, dz = pos[i].z - pos[j].z;
      let d2 = dx * dx + dy * dy + dz * dz; if (d2 < 0.01) { d2 = 0.01; dx = Math.random(); }
      const d = Math.sqrt(d2), f = kRep / d2, fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
      pos[i].vx += fx; pos[i].vy += fy; pos[i].vz += fz; pos[j].vx -= fx; pos[j].vy -= fy; pos[j].vz -= fz;
    }
    for (const l of links) {
      const a = pos[l.s], b = pos[l.t];
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const f = (d - L) * kSpring, fx = dx / d * f, fy = dy / d * f, fz = dz / d * f;
      a.vx += fx; a.vy += fy; a.vz += fz; b.vx -= fx; b.vy -= fy; b.vz -= fz;
    }
    for (let i = 0; i < n; i++) {
      const cg = kCenter * (1 + deg[i] * 0.04);
      pos[i].vx += -pos[i].x * cg; pos[i].vy += -pos[i].y * cg; pos[i].vz += -pos[i].z * cg;
      pos[i].vx = Math.max(-26, Math.min(26, pos[i].vx * damp));
      pos[i].vy = Math.max(-26, Math.min(26, pos[i].vy * damp));
      pos[i].vz = Math.max(-26, Math.min(26, pos[i].vz * damp));
      pos[i].x += pos[i].vx; pos[i].y += pos[i].vy; pos[i].z += pos[i].vz;
    }
  }
  let maxR = 1; for (const p of pos) maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z));
  const s = 235 / maxR;
  const out: Record<string, { x: number; y: number; z: number }> = {};
  nodes.forEach((d, i) => { out[d.id] = { x: pos[i].x * s, y: pos[i].y * s, z: pos[i].z * s }; });
  return out;
}

/** Rendu 3D canvas : sphère de nœuds qui tourne, perspective, pastilles terracotta sur le parcours. */
export function Graph3D({ graph, activeIds, currentId, dimming, onAsk }: {
  graph: Graph; activeIds: string[]; currentId: string | null; dimming: boolean; onAsk: (t: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pos3d = useMemo(() => computeLayout3D(graph.nodes, graph.edges), [graph]);
  const degById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.degree])), [graph]);
  const titleById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.title])), [graph]);
  const stateRef = useRef({ activeIds, currentId, dimming });
  useEffect(() => { stateRef.current = { activeIds, currentId, dimming }; }, [activeIds, currentId, dimming]);
  const hoverRef = useRef<string | null>(null);
  const angleRef = useRef(0.2);
  const projRef = useRef<Record<string, { sx: number; sy: number; scale: number; z: number }>>({});

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current; if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0, W = 0, H = 0; const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { W = wrap.clientWidth; H = wrap.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); const ro = new ResizeObserver(resize); ro.observe(wrap);
    const tilt = -0.42, focal = 780;
    const nodes = graph.nodes, edges = graph.edges;

    const render = () => {
      const st = stateRef.current; const activeSet = new Set(st.activeIds);
      const cx = W / 2, cy = H / 2, zoom = Math.min(W, H) / 520;
      ctx.clearRect(0, 0, W, H);
      const a = angleRef.current, ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tilt), stt = Math.sin(tilt);
      const proj: Record<string, { sx: number; sy: number; scale: number; z: number }> = {};
      for (const nd of nodes) {
        const p = pos3d[nd.id]; if (!p) continue;
        const x1 = p.x * ca + p.z * sa, z1 = -p.x * sa + p.z * ca, y1 = p.y;
        const y2 = y1 * ct - z1 * stt, z2 = y1 * stt + z1 * ct;
        const scale = focal / (focal - z2);
        proj[nd.id] = { sx: cx + x1 * scale * zoom, sy: cy + y2 * scale * zoom, scale, z: z2 };
      }
      projRef.current = proj;
      // arêtes
      for (const e of edges) {
        const A = proj[e.source], B = proj[e.target]; if (!A || !B) continue;
        const on = activeSet.has(e.source) && activeSet.has(e.target);
        const near = hoverRef.current && (e.source === hoverRef.current || e.target === hoverRef.current);
        ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy);
        if (on) { ctx.strokeStyle = "rgba(207,106,68,0.9)"; ctx.lineWidth = 1.8; }
        else if (near) { ctx.strokeStyle = "rgba(207,106,68,0.42)"; ctx.lineWidth = 1.2; }
        else { const depth = (A.scale + B.scale) / 2; ctx.strokeStyle = `rgba(20,18,31,${Math.min((st.dimming ? 0.05 : 0.08) * depth, 0.13)})`; ctx.lineWidth = 0.8; }
        ctx.stroke();
      }
      // nœuds (loin → près)
      const order = [...nodes].sort((n1, n2) => proj[n1.id].z - proj[n2.id].z);
      for (const nd of order) {
        const pr = proj[nd.id]; if (!pr) continue;
        const deg = degById.get(nd.id) || 0;
        const isActive = activeSet.has(nd.id), isCurrent = st.currentId === nd.id;
        const r = (4.5 + Math.min(deg, 10) * 0.85) * pr.scale * zoom * 0.62;
        const depthO = Math.max(0, Math.min(1, (pr.scale - 0.62) / (1.55 - 0.62)));
        let alpha = 0.4 + depthO * 0.6; if (st.dimming && !isActive) alpha *= 0.32;
        if (isActive) { ctx.beginPath(); ctx.arc(pr.sx, pr.sy, r + 7, 0, Math.PI * 2); ctx.fillStyle = "rgba(207,106,68,0.18)"; ctx.fill(); }
        ctx.beginPath(); ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? (isCurrent ? `rgba(181,84,47,${alpha})` : `rgba(207,106,68,${alpha})`) : `rgba(24,22,34,${alpha})`;
        ctx.fill();
        ctx.beginPath(); ctx.arc(pr.sx - r * 0.32, pr.sy - r * 0.36, r * 0.42, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${0.28 * alpha})`; ctx.fill();
      }
      // ping sur le nœud courant
      if (st.currentId && proj[st.currentId]) {
        const pr = proj[st.currentId]; const t = (Date.now() % 1100) / 1100;
        ctx.beginPath(); ctx.arc(pr.sx, pr.sy, 8 + t * 26, 0, Math.PI * 2); ctx.strokeStyle = `rgba(207,106,68,${1 - t})`; ctx.lineWidth = 2 * (1 - t); ctx.stroke();
      }
      // pastilles (parcours + survol)
      ctx.font = "700 12px Archivo, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const labelIds = new Set(st.activeIds); if (hoverRef.current) labelIds.add(hoverRef.current);
      for (const id of labelIds) {
        const pr = proj[id]; if (!pr) continue;
        const title = titleById.get(id) || ""; const label = title.length > 22 ? title.slice(0, 21) + "…" : title;
        const isActive = activeSet.has(id);
        const pw = ctx.measureText(label).width + 18, ph = 20, py = pr.sy - 32 - ph;
        ctx.beginPath(); ctx.moveTo(pr.sx, pr.sy - 3); ctx.lineTo(pr.sx, py + ph); ctx.strokeStyle = "rgba(20,18,31,0.5)"; ctx.lineWidth = 1; ctx.stroke();
        roundRect(ctx, pr.sx - pw / 2, py, pw, ph, 6);
        ctx.fillStyle = isActive ? "#d2694a" : "#ffffff"; ctx.fill();
        if (!isActive) { ctx.strokeStyle = "rgba(20,18,31,0.12)"; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.fillStyle = isActive ? "#2a1408" : "#14121f"; ctx.fillText(label, pr.sx, py + ph / 2 + 0.5);
      }
      angleRef.current += st.dimming ? 0.0012 : 0.0024;
      raf = requestAnimationFrame(render);
    };

    const onMove = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect(); const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      let best: string | null = null, bd = Infinity;
      for (const id in projRef.current) { const pr = projRef.current[id]; const dx = pr.sx - mx, dy = pr.sy - my; const d2 = dx * dx + dy * dy; if (d2 < 200 && d2 < bd) { bd = d2; best = id; } }
      hoverRef.current = best; canvas.style.cursor = best ? "pointer" : "grab";
    };
    const onClick = () => { if (hoverRef.current) onAsk(`Parle-moi de : ${titleById.get(hoverRef.current)}`); };
    canvas.addEventListener("mousemove", onMove); canvas.addEventListener("click", onClick);
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener("mousemove", onMove); canvas.removeEventListener("click", onClick); };
  }, [graph, pos3d, degById, titleById, onAsk]);

  return <div ref={wrapRef} className="cv-canvas-wrap"><canvas ref={canvasRef} /></div>;
}

const SUGGESTIONS = [
  "Quel est le prix du Sprint Automatisation ?",
  "Où en est le client Trakio ?",
  "Quel est notre MRR ?",
  "Qui s'occupe de la Boulangerie Lévain ?",
  "Résume le dernier point d'équipe",
  "Quelles factures sont en retard ?",
];

export function CerveauStudio() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<QueryResp | null>(null);
  const [step, setStep] = useState(-1); // index de la note active dans le parcours
  const [phase, setPhase] = useState<"idle" | "searching" | "reading" | "done">("idle");
  const [action, setAction] = useState<CAction | null>(null);
  const [sent, setSent] = useState(false);
  const [sub, setSub] = useState<"overview" | "graph">("overview");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const openAction = (a: CAction) => {
    if (a.type === "call") { window.open(CALL_URL, "_blank"); return; }
    setSent(false); setAction(a);
  };
  const confirmAction = () => { setSent(true); setTimeout(() => setAction(null), 1600); };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cerveau/graph").then((r) => r.json()).then((g) => { if (!cancelled) setGraph(g); }).catch(() => {});
    return () => { cancelled = true; if (timer.current) clearInterval(timer.current); };
  }, []);

  const activePath = resp && step >= 0 ? resp.path.slice(0, step + 1) : [];
  const current = resp && step >= 0 ? resp.path[step] : null;
  const dimming = phase === "searching" || phase === "reading" || phase === "done";

  const ask = useCallback(async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true); setResp(null); setStep(-1); setPhase("searching");
    if (timer.current) clearInterval(timer.current);
    try {
      const r = await fetch("/api/cerveau/query", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }),
      });
      const j: QueryResp = await r.json();
      setResp(j);
      if (!j.visited?.length) { setPhase("done"); setBusy(false); return; }
      setPhase("reading");
      let i = 0; setStep(0);
      timer.current = setInterval(() => {
        i += 1;
        if (i >= j.visited.length) { if (timer.current) clearInterval(timer.current); setPhase("done"); setBusy(false); return; }
        setStep(i);
      }, 850);
    } catch {
      setPhase("idle"); setBusy(false);
    }
  }, [busy]);

  const reset = () => { if (timer.current) clearInterval(timer.current); setResp(null); setStep(-1); setPhase("idle"); setBusy(false); };

  return (
    <div className="cv-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="cv-subnav">
        <button className={sub === "overview" ? "on" : ""} onClick={() => setSub("overview")}>Vue d'ensemble</button>
        <button className={sub === "graph" ? "on" : ""} onClick={() => setSub("graph")}>Graphe &amp; questions</button>
      </div>

      {sub === "overview" && <CerveauOverview onAsk={(q) => { setSub("graph"); setQ(q); setTimeout(() => ask(q), 80); }} />}

      {sub === "graph" && (<>
      {/* barre de requête */}
      <div className="cv-ask">
        <div className="cv-ask-row">
          <span className="cv-ask-ic"><Spark size={19} /></span>
          <input
            className="cv-input" placeholder="Demande quelque chose au cerveau de l'entreprise…"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(q); }} disabled={busy}
          />
          <button className="cv-go" onClick={() => ask(q)} disabled={busy || !q.trim()}>
            {busy ? "…" : "Demander"}
          </button>
          {phase !== "idle" && <button className="cv-reset" onClick={reset} title="Réinitialiser">↺</button>}
        </div>
        <div className="cv-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="cv-chip" onClick={() => { setQ(s); ask(s); }} disabled={busy}>{s}</button>
          ))}
        </div>
      </div>

      <div className="cv-main">
        {/* graphe */}
        <div className="cv-graph">
          <div className="cv-graph-hd">
            <b>Cerveau de l'entreprise</b>
            <span>{graph ? `${graph.count} notes` : "…"} · branché sur Obsidian</span>
          </div>
          {graph && <Graph3D graph={graph} activeIds={activePath} currentId={current} dimming={dimming} onAsk={ask} />}

          {/* caption sources (façon carte premium) */}
          {graph && <div className="cv-globe-cap">Connecté à {graph.sources.join(" · ")}</div>}
        </div>

        {/* panneau : lecture + réponse */}
        <div className="cv-panel">
          {phase === "idle" && (
            <div className="cv-idle">
              <div className="cv-idle-ic"><Spark size={38} /></div>
              <b>Le cerveau est prêt</b>
              <p>Pose une question : je vais parcourir les notes de l'entreprise sous tes yeux, puis te répondre.</p>
              <div className="cv-sources">
                {graph?.sources.map((s) => <span key={s} className="cv-src">{s}</span>)}
              </div>
            </div>
          )}

          {phase !== "idle" && (
            <>
              <div className="cv-panel-hd">
                <span className={`cv-status ${phase === "done" ? "ok" : "run"}`}>
                  {phase !== "done" && <span className="cv-status-sp"><Spark size={14} /></span>}
                  {phase === "searching" ? "Analyse du cerveau…" : phase === "reading" ? "Lecture des notes…" : "Réponse prête"}
                </span>
              </div>
              {phase === "done" && resp && (
                <div className="cv-answer">
                  <div className="cv-answer-hd"><span className="cv-clem">C</span> Kéïta répond</div>
                  <div className="cv-answer-body">{resp.answer}</div>
                  {!!resp.actions?.length && (
                    <div className="cv-actions">
                      <div className="cv-actions-hd">Passer à l'action</div>
                      {resp.actions.map((a, i) => (
                        <button key={i} className="cv-act" onClick={() => openAction(a)}>
                          <span className="cv-act-ic">{ACT_ICON[a.type] || "⚡"}</span>{a.label}<span className="cv-act-go">→</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="cv-reading">
                {phase === "done" && resp && <div className="cv-sources-hd">Notes consultées · {resp.visited.length}</div>}
                {resp?.visited.slice(0, Math.max(step + 1, 0)).map((v, i) => (
                  <div key={v.id} className={`cv-read ${i === step && phase === "reading" ? "live" : ""}`} style={{ borderColor: col(v.group) }}>
                    <div className="cv-read-hd">
                      <i style={{ background: col(v.group) }} />
                      <b>{v.title}</b>
                      <span className="cv-read-src">{v.source}</span>
                    </div>
                    <p>{v.excerpt}</p>
                  </div>
                ))}
                {phase === "searching" && <div className="cv-scan">Analyse du graphe…</div>}
              </div>
            </>
          )}
        </div>
      </div>
      </>)}

      {/* modal d'action (email / message / db / note) */}
      {action && (
        <div className="cv-modal-back" onClick={() => setAction(null)}>
          <div className="cv-modal" onClick={(e) => e.stopPropagation()}>
            {!sent ? (
              <>
                <div className="cv-modal-hd">
                  <span className="cv-modal-ic">{ACT_ICON[action.type]}</span>
                  <b>{action.label}</b>
                  <button className="cv-modal-x" onClick={() => setAction(null)}>×</button>
                </div>
                <div className="cv-modal-body">
                  {(action.type === "email" || action.type === "message") && (
                    <>
                      <label>À</label><div className="cv-field">{action.to || "—"}</div>
                      {action.subject && (<><label>Objet</label><div className="cv-field">{action.subject}</div></>)}
                      <label>Message</label><div className="cv-field cv-area">{action.body}</div>
                    </>
                  )}
                  {action.type === "db" && (
                    <>
                      <label>Base / enregistrement</label><div className="cv-field">{action.target}</div>
                      <label>Mise à jour</label><div className="cv-field cv-area">{action.change}</div>
                    </>
                  )}
                  {action.type === "note" && (
                    <>
                      <label>Titre de la note</label><div className="cv-field">{action.title}</div>
                      <label>Contenu</label><div className="cv-field cv-area">{action.body}</div>
                    </>
                  )}
                </div>
                <div className="cv-modal-ft">
                  <button className="cv-btn-ghost" onClick={() => setAction(null)}>Annuler</button>
                  <button className="cv-btn-go" onClick={confirmAction}>{ACT_CTA[action.type]}</button>
                </div>
              </>
            ) : (
              <div className="cv-sent"><div className="cv-sent-ic">✓</div><b>C'est fait !</b><span>{ACT_CTA[action.type]} — action exécutée par Kéïta.</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.cv-wrap{display:flex;flex-direction:column;gap:16px;font-family:inherit}
.cv-subnav{display:flex;gap:6px;background:#f0ede6;border:1px solid #e6e2d8;border-radius:14px;padding:5px;width:fit-content}
.cv-subnav button{background:transparent;border:none;border-radius:10px;padding:9px 18px;font-size:13.5px;font-weight:800;color:#8a8794;cursor:pointer;transition:all .15s}
.cv-subnav button.on{background:#fff;color:#14121f;box-shadow:0 4px 12px -6px rgba(20,18,31,.3)}
.cv-ask{display:flex;flex-direction:column;gap:10px}
.cv-ask-row{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e9e7e1;border-radius:16px;padding:8px 8px 8px 14px;box-shadow:0 10px 30px -22px rgba(20,18,31,.5)}
.cv-ask-ic{display:flex;align-items:center}
.cv-input{flex:1;border:none;outline:none;font-size:15.5px;background:transparent;color:#14121f}
.cv-go{background:#14121f;color:#fff;border:none;border-radius:11px;padding:10px 20px;font-weight:800;font-size:14px;cursor:pointer}
.cv-go:disabled{opacity:.5;cursor:default}
.cv-reset{background:#f3f1ec;border:1px solid #e9e7e1;border-radius:10px;width:38px;height:38px;font-size:16px;cursor:pointer;color:#6c6a78}
.cv-chips{display:flex;flex-wrap:wrap;gap:8px}
.cv-chip{background:#f6f4ef;border:1px solid #e9e7e1;border-radius:999px;padding:7px 13px;font-size:12.5px;color:#4a4658;cursor:pointer;transition:all .15s}
.cv-chip:hover{background:#fff;border-color:#d0ccc2;transform:translateY(-1px)}

.cv-main{display:grid;grid-template-columns:1.55fr 1fr;gap:16px;align-items:stretch}
@media(max-width:1000px){.cv-main{grid-template-columns:1fr}}

.cv-graph{position:relative;background:radial-gradient(760px 520px at 50% 44%, #ffffff 0%, #f6f2ea 58%, #efe9df 100%);border:1px solid #e9e3d6;border-radius:22px;overflow:hidden;height:660px}
.cv-graph::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(20,18,31,.09) 1px, transparent 1.7px);background-size:16px 16px;-webkit-mask:radial-gradient(closest-side at 50% 46%, #000 42%, transparent 78%);mask:radial-gradient(closest-side at 50% 46%, #000 42%, transparent 78%);pointer-events:none}
.cv-canvas-wrap{position:absolute;inset:0;z-index:1}
.cv-canvas-wrap canvas{display:block;width:100%;height:100%}
.cv-graph-hd{position:absolute;top:16px;left:18px;z-index:2;color:#14121f;display:flex;flex-direction:column;gap:1px;pointer-events:none}
.cv-graph-hd b{font-size:15px;letter-spacing:-.01em}
.cv-graph-hd span{font-size:11.5px;color:#8a8794}
.cv-svg{width:100%;height:100%;display:block;transition:opacity .4s;position:relative}
.cv-svg.dim .cv-edges{opacity:.6}
.cv-edge{stroke:rgba(20,18,31,.07);stroke-width:1}
.cv-edge.near{stroke:rgba(207,106,68,.4);stroke-width:1.3}
.cv-edge.on{stroke:#cf6a44;stroke-width:2;stroke-dasharray:6 5;animation:cv-flow 1s linear infinite}
@keyframes cv-flow{to{stroke-dashoffset:-22}}
.cv-node{cursor:pointer;transition:opacity .4s}
.cv-node .cv-dot{fill:#14121f;transition:fill .3s, r .3s}
.cv-node.off{opacity:.28}
.cv-node.act .cv-dot{fill:#cf6a44}
.cv-node.cur .cv-dot{fill:#b5542f}
.cv-ping{stroke:#cf6a44;stroke-width:2;opacity:.9;animation:cv-ping 1.1s ease-out infinite}
@keyframes cv-ping{0%{transform:scale(.5);opacity:.9;stroke-width:2.5}100%{transform:scale(1.7);opacity:0;stroke-width:0}}
.cv-pin-line{stroke:#14121f;stroke-width:1;opacity:.5}
.cv-pill{fill:#d2694a}
.cv-pill-tx{fill:#2a1408;font-size:12px;font-weight:800;pointer-events:none}
.cv-hint-label{fill:#57545f;font-size:11px;font-weight:600;paint-order:stroke;stroke:#f4f0e8;stroke-width:3px;pointer-events:none}
.cv-globe-cap{position:absolute;bottom:16px;left:0;right:0;text-align:center;font-size:11.5px;color:#8a8794;z-index:2;pointer-events:none}

.cv-panel{background:#fff;border:1px solid #e9e7e1;border-radius:20px;padding:18px;display:flex;flex-direction:column;height:660px;overflow:hidden}
.cv-idle{margin:auto;text-align:center;max-width:280px;color:#6c6a78}
.cv-idle-ic{display:flex;justify-content:center;margin-bottom:12px}
.cv-idle b{display:block;color:#14121f;font-size:17px;margin-bottom:6px}
.cv-idle p{font-size:14px;line-height:1.5}
.cv-sources{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:16px}
.cv-src{background:#f6f4ef;border:1px solid #e9e7e1;border-radius:999px;padding:5px 11px;font-size:11.5px;color:#4a4658}
.cv-panel-hd{margin-bottom:12px}
.cv-status{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:7px 14px;border-radius:999px;display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #ece7db;color:#14121f;box-shadow:0 8px 20px -14px rgba(20,18,31,.5)}
.cv-status.run{color:#b5542f}
.cv-status-sp{display:flex;animation:cv-spin 2.4s linear infinite}
@keyframes cv-spin{to{transform:rotate(360deg)}}
.cv-status.ok{background:#eef7f0;border-color:#cdeacf;color:#1a9e57}
@keyframes cv-blink{50%{opacity:.2}}
.cv-reading{display:flex;flex-direction:column;gap:9px;overflow-y:auto;flex:1;min-height:0}
.cv-read{border-left:3px solid;background:#faf9f6;border-radius:0 12px 12px 0;padding:10px 12px;animation:cv-in .35s ease}
.cv-read.live{background:#fff7f1;box-shadow:0 0 0 1px #ffd9c2 inset}
@keyframes cv-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
.cv-read-hd{display:flex;align-items:center;gap:7px;margin-bottom:3px}
.cv-read-hd i{width:8px;height:8px;border-radius:50%;flex:none}
.cv-read-hd b{font-size:13.5px;color:#14121f;flex:1;line-height:1.2}
.cv-read-src{font-size:10.5px;color:#8a8794;white-space:nowrap}
.cv-read p{font-size:12px;color:#57545f;line-height:1.45;margin:0}
.cv-scan{font-size:12px;color:#8a8794;padding:8px;animation:cv-blink 1s infinite}
.cv-answer{background:#faf9f6;border:1px solid #ece9e1;border-radius:14px;padding:14px 16px;margin-bottom:12px;max-height:300px;overflow:auto;flex:none}
.cv-answer-hd{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;color:#14121f;margin-bottom:8px}
.cv-clem{width:24px;height:24px;border-radius:8px;background:linear-gradient(135deg,#F5411C,#7B6CFF);color:#fff;display:grid;place-items:center;font-size:13px}
.cv-answer-body{font-size:14px;line-height:1.55;color:#2a2833;white-space:pre-wrap}
.cv-sources-hd{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a8794;margin:2px 0 4px;font-weight:800}
.cv-actions{margin-top:12px;border-top:1px dashed #e9e7e1;padding-top:11px;display:flex;flex-direction:column;gap:7px}
.cv-actions-hd{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#F5411C;font-weight:800;margin-bottom:1px}
.cv-act{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #e6e3db;border-radius:11px;padding:10px 12px;font-size:13.5px;font-weight:600;color:#14121f;cursor:pointer;text-align:left;transition:all .14s}
.cv-act:hover{border-color:#F5411C;background:#fff6f2;transform:translateX(2px)}
.cv-act-ic{font-size:16px}
.cv-act-go{margin-left:auto;color:#F5411C;font-weight:800}
.cv-modal-back{position:fixed;inset:0;background:rgba(14,13,18,.5);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;z-index:200;padding:22px;animation:cv-fade .18s ease}
@keyframes cv-fade{from{opacity:0}to{opacity:1}}
.cv-modal{background:#fff;border-radius:20px;max-width:520px;width:100%;box-shadow:0 50px 100px -30px rgba(0,0,0,.55);overflow:hidden;animation:cv-pop .22s cubic-bezier(.2,.9,.3,1.25)}
@keyframes cv-pop{from{transform:translateY(16px) scale(.97);opacity:0}to{transform:none;opacity:1}}
.cv-modal-hd{display:flex;align-items:center;gap:10px;padding:18px 20px;border-bottom:1px solid #f0ede7}
.cv-modal-ic{font-size:20px}
.cv-modal-hd b{font-size:16px;color:#14121f;flex:1}
.cv-modal-x{width:32px;height:32px;border-radius:50%;border:1px solid #e9e7e1;background:#fff;color:#8a8794;font-size:18px;cursor:pointer}
.cv-modal-body{padding:18px 20px;display:flex;flex-direction:column;gap:4px;max-height:50vh;overflow:auto}
.cv-modal-body label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a8794;font-weight:800;margin-top:10px}
.cv-field{background:#faf9f6;border:1px solid #ece9e1;border-radius:10px;padding:10px 12px;font-size:14px;color:#2a2833}
.cv-area{white-space:pre-wrap;line-height:1.5;min-height:70px}
.cv-modal-ft{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid #f0ede7;background:#faf9f6}
.cv-btn-ghost{background:#fff;border:1px solid #e6e3db;border-radius:11px;padding:10px 18px;font-weight:700;font-size:14px;color:#57545f;cursor:pointer}
.cv-btn-go{background:#14121f;color:#fff;border:none;border-radius:11px;padding:10px 22px;font-weight:800;font-size:14px;cursor:pointer}
.cv-sent{padding:44px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}
.cv-sent-ic{width:56px;height:56px;border-radius:50%;background:#eafaf0;color:#1a9e57;display:grid;place-items:center;font-size:30px;font-weight:900;margin-bottom:6px;animation:cv-pop .3s ease}
.cv-sent b{font-size:19px;color:#14121f}
.cv-sent span{font-size:13.5px;color:#6c6a78;max-width:300px}
`;
