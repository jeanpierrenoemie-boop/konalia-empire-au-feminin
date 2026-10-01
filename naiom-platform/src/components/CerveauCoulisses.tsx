"use client";

/**
 * Onglet « Coulisses » de Kéïta — UNE seule scène 3D, même univers/DA que le
 * cerveau du dashboard (fond beige en dégradé + texture pointillée, accents
 * terracotta). Tout est en 3D et bouge (rotation + flottement). On clique sur
 * l'objet, il se transforme :
 *
 *   0. l'ordinateur 3D → 1. un dossier 3D → 2. une note 3D (+ comparaison de
 *   taille) → 3. un nuage de notes 3D → 4. LE CERVEAU 3D (le vrai graphe).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Graph3D, type Graph } from "./CerveauStudio";

const TERRA = "#cf6a44";

const HINTS = ["cliquez sur le Mac", "cliquez sur le dossier", "cliquez sur la note", "survolez un nœud · cliquez pour continuer"];

interface QVisited { id: string; title: string; group: string; source: string; excerpt: string }
interface QResp { path: string[]; visited: QVisited[]; answer: string }

const DEMO_QUERIES = [
  { ic: "🏢", label: "Le client Trakio", q: "Où en est le client Trakio ?" },
  { ic: "💰", label: "Notre MRR", q: "Quel est notre MRR ?" },
  { ic: "🧾", label: "Factures en retard", q: "Quelles factures sont en retard ?" },
];

/** Nuage de notes 3D (étape 3) : mini-cartes flottant en profondeur. */
const CLOUD = [
  { x: 0, y: 0, z: 60, s: 1.08 }, { x: -190, y: -70, z: -40, s: 0.9 }, { x: 175, y: -95, z: 10, s: 0.96 },
  { x: 205, y: 60, z: -60, s: 0.86 }, { x: -205, y: 80, z: 20, s: 0.94 }, { x: -60, y: 130, z: -30, s: 0.9 },
  { x: 95, y: 145, z: 40, s: 1 }, { x: -120, y: -140, z: 30, s: 0.98 }, { x: 60, y: -155, z: -50, s: 0.88 },
];
/** Contenu des notes révélées au survol des nœuds (étape 3). */
const NOTE_INFO = [
  { t: "Offre — AI Sales", s: "Un agent qui relance les prospects tout seul.", c: "#cf6a44" },
  { t: "Client — Halo", s: "SaaS B2B, onboarding en cours.", c: "#ff6b9d" },
  { t: "Prix & devis", s: "Sprint Automatisation : 4 900 €.", c: "#12b886" },
  { t: "Réunion 12-09", s: "Point équipe hebdo, actions à suivre.", c: "#ffa94d" },
  { t: "Finances", s: "MRR, factures, trésorerie du mois.", c: "#4dabf7" },
  { t: "Process onboarding", s: "Les étapes d'accueil d'un nouveau client.", c: "#b197fc" },
  { t: "Équipe", s: "Rôles, responsabilités, qui fait quoi.", c: "#7B6CFF" },
  { t: "Outils", s: "La stack : n8n, Airtable, Gmail…", c: "#22d3ee" },
  { t: "Onboarding", s: "La séquence de bienvenue automatisée.", c: "#ff8787" },
];

export function CerveauCoulisses() {
  const [stage, setStage] = useState(0);
  const last = 4;
  const advance = () => setStage((s) => (s >= last ? s : s + 1));

  const [graph, setGraph] = useState<Graph | null>(null);
  const [resp, setResp] = useState<QResp | null>(null);
  const [qStep, setQStep] = useState(-1);
  const [phase, setPhase] = useState<"idle" | "searching" | "reading" | "done">("idle");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const replay = () => { reset(); setStage(0); };

  useEffect(() => {
    if (stage < 3 || graph) return;
    let off = false;
    fetch("/api/cerveau/graph").then((r) => r.json()).then((g) => { if (!off) setGraph(g); }).catch(() => {});
    return () => { off = true; };
  }, [stage, graph]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const activePath = resp && qStep >= 0 ? resp.path.slice(0, qStep + 1) : [];
  const current = resp && qStep >= 0 ? resp.path[qStep] : null;
  const dimming = phase !== "idle";

  const ask = useCallback(async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true); setResp(null); setQStep(-1); setPhase("searching");
    if (timer.current) clearInterval(timer.current);
    try {
      const r = await fetch("/api/cerveau/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const j: QResp = await r.json();
      setResp(j);
      if (!j.visited?.length) { setPhase("done"); setBusy(false); return; }
      setPhase("reading"); let i = 0; setQStep(0);
      timer.current = setInterval(() => {
        i += 1;
        if (i >= j.visited.length) { if (timer.current) clearInterval(timer.current); setPhase("done"); setBusy(false); return; }
        setQStep(i);
      }, 750);
    } catch { setPhase("idle"); setBusy(false); }
  }, [busy]);
  function reset() { if (timer.current) clearInterval(timer.current); setResp(null); setQStep(-1); setPhase("idle"); setBusy(false); }

  const atEnd = stage === last;

  return (
    <div className="space-y-3">
      <style>{CSS}</style>

      <div className="px-1">
        <div className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: TERRA }}>Coulisses · comment ça marche</div>
        <h2 className="mt-1 text-[24px] font-black tracking-tight text-[#14121F]">D'un simple fichier… au cerveau de l'entreprise</h2>
      </div>

      <div
        role="button" tabIndex={0}
        onClick={atEnd ? undefined : advance}
        onKeyDown={(e) => { if (!atEnd && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); advance(); } }}
        className={`cc-stage ${atEnd ? "" : "cc-clickable"}`}
        title={atEnd ? "" : HINTS[stage]}
      >
        <button type="button" onClick={(e) => { e.stopPropagation(); replay(); }} className="cc-replay">↺ Refaire</button>
        {!atEnd && <div className="cc-hint-pill">👆 {HINTS[stage]}</div>}

        {/* ---------- SCÈNE 3D (étapes 0→3) ---------- */}
        <div className="cc-scene" style={{ opacity: atEnd ? 0 : 1, transition: "opacity .7s" }}>
          {/* 0 · MACBOOK (vue de face, à plat) */}
          {stage === 0 && (
            <div className="cc-in cc-bob" style={{ width: 380, maxWidth: "82%" }}>
              <svg viewBox="0 0 600 340" className="w-full" style={{ filter: "drop-shadow(0 28px 34px rgba(20,18,31,.3))" }}>
                <defs>
                  <linearGradient id="mac-alu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f2f3f6" /><stop offset="0.5" stopColor="#dcdee3" /><stop offset="1" stopColor="#c1c3ca" />
                  </linearGradient>
                  <linearGradient id="mac-alu2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#e9eaee" /><stop offset="1" stopColor="#bcbec6" />
                  </linearGradient>
                  <linearGradient id="mac-wall" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#16306e" /><stop offset="0.45" stopColor="#5b2a86" /><stop offset="0.75" stopColor="#a3395f" /><stop offset="1" stopColor="#cf6a44" />
                  </linearGradient>
                  <filter id="mac-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20" /></filter>
                  <clipPath id="mac-scr"><rect x="168" y="46" width="264" height="200" rx="9" /></clipPath>
                </defs>
                {/* socle (trapèze) */}
                <path d="M92 266 H508 L488 302 Q484 309 476 309 H124 Q116 309 112 302 Z" fill="url(#mac-alu2)" stroke="#b0b3ba" strokeWidth="1.5" />
                <path d="M270 266 h60 a9 9 0 0 1 -9 9 h-42 a9 9 0 0 1 -9 -9 z" fill="#cbcdd4" stroke="#b0b3ba" strokeWidth="1" />
                {/* écran */}
                <rect x="152" y="30" width="296" height="236" rx="20" fill="url(#mac-alu)" stroke="#b0b3ba" strokeWidth="1.5" />
                <rect x="162" y="40" width="276" height="216" rx="13" fill="#0b0b11" />
                {/* fond d'écran coloré */}
                <g clipPath="url(#mac-scr)">
                  <rect x="168" y="46" width="264" height="200" fill="url(#mac-wall)" />
                  <ellipse cx="232" cy="108" rx="92" ry="72" fill="#ff9a4d" opacity="0.7" filter="url(#mac-soft)" />
                  <ellipse cx="360" cy="120" rx="80" ry="72" fill="#5a7cff" opacity="0.78" filter="url(#mac-soft)" />
                  <ellipse cx="322" cy="212" rx="100" ry="70" fill="#9a52eb" opacity="0.7" filter="url(#mac-soft)" />
                  <ellipse cx="210" cy="212" rx="72" ry="56" fill="#22c8be" opacity="0.6" filter="url(#mac-soft)" />
                </g>
                {/* reflet + caméra */}
                <path d="M168 46 h264 v40 q-132 34 -264 0 z" fill="#fff" opacity="0.06" clipPath="url(#mac-scr)" />
                <circle cx="300" cy="37" r="2.4" fill="#3a3a44" />
              </svg>
            </div>
          )}

          {/* 1 · DOSSIER */}
          {stage === 1 && (
            <div className="cc-in cc-bob">
              <div className="cc-obj cc-folder">
                <div className="tab" /><div className="back" /><div className="front" />
              </div>
            </div>
          )}

          {/* 2 · UNE NOTE + comparaison */}
          {stage === 2 && (
            <div className="cc-in cc-note-row">
              <div className="cc-bob">
                <div className="cc-obj cc-note">
                  <div className="acc" />
                  <b>Offre AI Sales</b>
                  <hr />
                  <p>Un agent qui relance les prospects tout seul.</p>
                  <ul><li>Cible : PME B2B</li><li>Vendu au Client Halo</li></ul>
                </div>
              </div>
              <div className="cc-cmp">
                <div className="cc-cmp-hd">La même note, selon le format</div>
                {([["📝 note", 7, "≈ 3 Ko", "#188A5C"], ["📘 Word", 30, "≈ 24 Ko", "#B5651B"], ["📕 PDF", 80, "≈ 120 Ko", "#C22F0D"]] as const).map(([l, w, t, c]) => (
                  <div key={l} className="cc-cmp-row">
                    <span className="cc-cmp-l">{l}</span>
                    <span className="cc-cmp-bar" style={{ width: `${w}%`, background: c }} />
                    <span className="cc-cmp-t" style={{ color: c }}>{t}</span>
                  </div>
                ))}
                <div className="cc-cmp-note"><b>→ 40× plus léger.</b> C'est pour ça que le cerveau complet coûte <b>presque rien</b> à garder.</div>
              </div>
            </div>
          )}

          {/* 3 · NUAGE DE NŒUDS 3D (survol = la note s'ouvre) */}
          {stage === 3 && (
            <div className="cc-in cc-cloud">
              {CLOUD.map((n, i) => (
                <div key={i} className="cc-node3d" style={{ transform: `translate3d(${n.x}px,${n.y}px,${n.z}px) scale(${n.s})` }}>
                  <div className="cc-node-pop">
                    <span className="acc" style={{ background: NOTE_INFO[i].c }} />
                    <b>{NOTE_INFO[i].t}</b>
                    <p>{NOTE_INFO[i].s}</p>
                  </div>
                  <div className="cc-node-dot" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------- ÉTAPE 4 : CERVEAU 3D ---------- */}
        {stage >= 3 && graph && (
          <div className="cc-brain" style={{ opacity: atEnd ? 1 : 0, pointerEvents: atEnd ? "auto" : "none" }}>
            <div className="cvc-wrap"><Graph3D graph={graph} activeIds={activePath} currentId={current} dimming={dimming} onAsk={ask} /></div>

            <div className="cc-brain-hd">
              <div className="t">Le cerveau de l'entreprise</div>
              <div className="s">{graph.count} notes reliées · en 3D, ça tourne tout seul</div>
            </div>

            <div className="cc-queries">
              <div className="cc-queries-hd">Demande au cerveau</div>
              {DEMO_QUERIES.map((d) => (
                <button key={d.q} type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); ask(d.q); }} className="cc-qbtn">
                  <span>{d.ic}</span>{d.label}
                </button>
              ))}
              <div className="cc-queries-tip">…ou clique un nœud dans le cerveau.</div>
            </div>

            <div className="cc-status">
              {phase === "idle" ? (
                <div className="cc-status-idle">🧠 Voici le cerveau — clique un bouton, les notes reliées s'allument une à une.</div>
              ) : (
                <div className="cc-status-run">
                  <div className="cc-status-t" style={{ color: phase === "done" ? "#188A5C" : TERRA }}>
                    {phase !== "done" && <span className="cc-dot" />}
                    {phase === "searching" ? "Analyse du cerveau…" : phase === "reading" ? `Lecture des notes reliées… (${qStep + 1}/${resp?.visited.length ?? 0})` : `Réponse prête · ${resp?.visited.length ?? 0} notes consultées`}
                  </div>
                  {phase === "done" && resp && <p>{resp.answer}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.cc-stage{ position:relative; overflow:hidden; border-radius:24px; min-height:540px;
  background: radial-gradient(760px 520px at 50% 46%, #ffffff 0%, #f6f2ea 58%, #efe9df 100%); }
.cc-stage::before{ content:""; position:absolute; inset:0; background-image: radial-gradient(rgba(20,18,31,.09) 1px, transparent 1.7px);
  background-size:16px 16px; -webkit-mask: radial-gradient(closest-side at 50% 46%, #000 42%, transparent 80%);
  mask: radial-gradient(closest-side at 50% 46%, #000 42%, transparent 80%); pointer-events:none; z-index:0 }
.cc-clickable{ cursor:pointer }
.cc-replay{ position:absolute; right:16px; top:16px; z-index:30; display:inline-flex; align-items:center; gap:6px;
  border:1px solid #E3D9C6; background:rgba(255,255,255,.8); backdrop-filter:blur(6px); border-radius:999px;
  padding:6px 12px; font-size:12px; font-weight:700; color:#8A7B5E; cursor:pointer }
.cc-replay:hover{ color:#14121f }
.cc-hint-pill{ position:absolute; bottom:16px; left:50%; transform:translateX(-50%); z-index:30; pointer-events:none;
  background:rgba(255,255,255,.72); backdrop-filter:blur(6px); border-radius:999px; padding:5px 13px; font-size:12px; font-weight:700; color:#B79A72 }

/* --- scène 3D --- */
.cc-scene{ position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; perspective:1300px; }
.cc-in{ animation: cc-in .55s cubic-bezier(.2,.8,.3,1) both }
@keyframes cc-in{ from{ opacity:0; transform:scale(.9) } to{ opacity:1; transform:none } }
.cc-bob{ animation: cc-bob 5.5s ease-in-out infinite; transform-style:preserve-3d }
@keyframes cc-bob{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-14px) } }
.cc-obj{ transform-style:preserve-3d; animation: cc-turn 9s ease-in-out infinite }
@keyframes cc-turn{ 0%,100%{ transform:rotateY(-19deg) rotateX(6deg) } 50%{ transform:rotateY(19deg) rotateX(-3deg) } }


/* nœuds 3D (étape 3) — comme le cerveau ; survol = la note s'ouvre */
.cc-node3d{ position:absolute; left:-13px; top:-13px; transform-style:preserve-3d }
.cc-node-dot{ width:26px; height:26px; border-radius:50%; cursor:pointer; transition:transform .2s, background .2s, box-shadow .2s;
  background:radial-gradient(circle at 34% 30%, #524d63, #17151f 72%); box-shadow:0 12px 22px -8px rgba(20,18,31,.55) }
.cc-node3d:hover{ z-index:20 }
.cc-node3d:hover .cc-node-dot{ transform:scale(1.3); background:radial-gradient(circle at 34% 30%, #ef9a76, #cf6a44 72%); box-shadow:0 0 0 8px rgba(207,106,68,.16), 0 14px 26px -8px rgba(207,106,68,.5) }
.cc-node-pop{ position:absolute; left:50%; bottom:32px; width:172px; transform:translateX(-50%) translateY(8px) scale(.96);
  background:#fff; border-radius:12px; padding:11px 12px 12px; text-align:left; opacity:0; pointer-events:none; transition:all .22s cubic-bezier(.2,.8,.3,1);
  box-shadow:0 30px 55px -22px rgba(20,18,31,.55), 0 0 0 1px #efe6d6; z-index:25 }
.cc-node-pop .acc{ display:block; height:5px; border-radius:6px; margin:-3px -4px 8px }
.cc-node-pop b{ display:block; font-size:12.5px; font-weight:800; color:#14121f }
.cc-node-pop p{ margin:3px 0 0; font-size:11px; line-height:1.45; color:#57545f }
.cc-node-pop::after{ content:""; position:absolute; left:50%; bottom:-6px; transform:translateX(-50%) rotate(45deg); width:12px; height:12px; background:#fff; border-right:1px solid #efe6d6; border-bottom:1px solid #efe6d6 }
.cc-node3d:hover .cc-node-pop{ opacity:1; transform:translateX(-50%) translateY(0) scale(1) }

/* dossier 3D */
.cc-folder{ width:210px; height:150px; position:relative }
.cc-folder .tab{ position:absolute; left:12px; top:2px; width:88px; height:26px; border-radius:11px 11px 0 0; background:#b5542f }
.cc-folder .back{ position:absolute; left:0; top:20px; width:210px; height:130px; border-radius:14px; background:linear-gradient(#b5542f,#9a4526) }
.cc-folder .front{ position:absolute; left:0; top:34px; width:210px; height:118px; border-radius:14px; transform:rotateX(-14deg); transform-origin:bottom;
  background:linear-gradient(#e07f57,#cf6a44); box-shadow:0 30px 44px -22px rgba(160,60,30,.6) }

/* note 3D (carte) */
.cc-note-row{ display:flex; align-items:center; gap:40px; flex-wrap:wrap; justify-content:center; padding:0 24px }
.cc-note{ position:relative; width:210px; padding:20px 20px 18px; background:#fff; border-radius:16px;
  box-shadow:0 44px 70px -34px rgba(20,18,31,.6), 0 0 0 1px #efe6d6; text-align:left }
.cc-note .acc{ position:absolute; left:0; top:0; right:0; height:6px; border-radius:16px 16px 0 0; background:${TERRA} }
.cc-note b{ display:block; font-size:15px; color:#14121f; margin-top:6px }
.cc-note hr{ border:none; border-top:1px solid #f0eadb; margin:8px 0 }
.cc-note p{ font-size:12.5px; color:#57545f; line-height:1.5; margin:0 0 6px }
.cc-note ul{ margin:0; padding-left:16px; font-size:12.5px; color:#57545f; line-height:1.7 }

/* comparaison de taille */
.cc-cmp{ width:270px; text-align:left }
.cc-cmp-hd{ font-size:11px; font-weight:900; letter-spacing:.05em; text-transform:uppercase; color:#B79A72; margin-bottom:10px }
.cc-cmp-row{ display:flex; align-items:center; gap:8px; margin-bottom:9px }
.cc-cmp-l{ width:64px; font-size:12px; font-weight:700; color:#3A3746; flex:none; white-space:nowrap }
.cc-cmp-bar{ height:12px; border-radius:6px; flex:none; transition:width .6s }
.cc-cmp-t{ font-size:10.5px; font-weight:800; white-space:nowrap; flex:none }
.cc-cmp-note{ margin-top:8px; font-size:12px; line-height:1.5; color:#57545f }
.cc-cmp-note b{ color:#186a48 }

/* nuage de notes 3D */
.cc-cloud{ position:relative; width:1px; height:1px; transform-style:preserve-3d; animation: cc-cloud 14s ease-in-out infinite }
@keyframes cc-cloud{ 0%,100%{ transform:rotateY(-13deg) rotateX(4deg) } 50%{ transform:rotateY(13deg) rotateX(-3deg) } }

/* --- cerveau 3D --- */
.cc-brain{ position:absolute; inset:0; z-index:5; transition:opacity .8s }
.cvc-wrap{ position:absolute; inset:0 } .cvc-wrap .cv-canvas-wrap{ position:absolute; inset:0; z-index:1 }
.cvc-wrap .cv-canvas-wrap canvas{ display:block; width:100%; height:100% }
.cc-brain-hd{ position:absolute; left:20px; top:16px; z-index:10; pointer-events:none }
.cc-brain-hd .t{ font-size:15px; font-weight:900; letter-spacing:-.01em; color:#14121f }
.cc-brain-hd .s{ font-size:11.5px; font-weight:700; color:#8A8794 }
.cc-queries{ position:absolute; right:20px; top:60px; z-index:10; width:210px; display:flex; flex-direction:column; gap:8px }
.cc-queries-hd{ font-size:10.5px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; color:#B79A72 }
.cc-qbtn{ display:inline-flex; align-items:center; gap:8px; border:1px solid #E7DFCF; background:rgba(255,255,255,.9); backdrop-filter:blur(6px);
  border-radius:12px; padding:9px 12px; font-size:12.5px; font-weight:700; color:#14121f; cursor:pointer; text-align:left; box-shadow:0 6px 16px -10px rgba(20,18,31,.4); transition:all .15s }
.cc-qbtn:hover{ transform:translateY(-2px); border-color:${TERRA} } .cc-qbtn:disabled{ opacity:.5; cursor:default }
.cc-qbtn span{ font-size:15px }
.cc-queries-tip{ font-size:10.5px; line-height:1.4; color:#8A8794 }
.cc-status{ position:absolute; bottom:16px; left:50%; transform:translateX(-50%); z-index:10; width:min(560px,92%) }
.cc-status-idle{ text-align:center; background:rgba(255,255,255,.8); backdrop-filter:blur(6px); border-radius:999px; padding:8px 16px; font-size:12.5px; font-weight:700; color:#8A7B5E }
.cc-status-run{ background:rgba(255,255,255,.95); backdrop-filter:blur(6px); border:1px solid #EFE7D8; border-radius:16px; padding:12px 14px; box-shadow:0 20px 40px -24px rgba(20,18,31,.5) }
.cc-status-t{ display:flex; align-items:center; gap:8px; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px }
.cc-dot{ width:8px; height:8px; border-radius:50%; background:currentColor; animation:cc-blink 1s infinite }
@keyframes cc-blink{ 50%{ opacity:.25 } }
.cc-status-run p{ font-size:12.5px; line-height:1.5; color:#2A2833; margin:0; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden }
@media (prefers-reduced-motion: reduce){ .cc-bob,.cc-turn,.cc-obj,.cc-cloud,.cc-cloud-card{ animation:none !important } }
`;
