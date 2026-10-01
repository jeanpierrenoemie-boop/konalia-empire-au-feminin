"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Kpi { label: string; value: string; sub: string; tone?: "accent" | "warn" | "ok" }
interface Dept {
  key: string; name: string; manager: string; role: string; avatar: string; color: string;
  tools: string[]; daily: string;
  onboarding: {
    formation: { module: string; duree: string }[];
    welcomeEmail: { subject: string; body: string };
    credentials: string[]; firstSteps: string[];
  };
}
interface Overview { kpis: Kpi[]; departments: Dept[] }

export function CerveauOverview({ onAsk }: { onAsk: (q: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [selKey, setSelKey] = useState<string>("automatisation");
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [step, setStep] = useState(-1);
  const [modal, setModal] = useState<null | "email" | "access">(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let ok = true;
    fetch("/api/cerveau/overview").then((r) => r.json()).then((d) => { if (ok) setData(d); }).catch(() => {});
    return () => { ok = false; if (timer.current) clearInterval(timer.current); };
  }, []);

  const dept = useMemo(() => data?.departments.find((d) => d.key === selKey) || data?.departments[0], [data, selKey]);
  const seq = useMemo(() => dept ? [
    { t: `Comptes créés sur ${dept.tools.length} outils`, d: dept.tools.join(" · ") },
    { t: "Identifiants provisionnés", d: `${dept.onboarding.credentials.length} accès générés en un coup` },
    { t: "Formation assignée", d: `${dept.onboarding.formation.length} modules prêts à regarder` },
    { t: "Emails de bienvenue préparés", d: dept.onboarding.welcomeEmail.subject },
    { t: "Doc de bienvenue généré", d: `Parcours ${dept.name} · réf. ${dept.manager}` },
    { t: "Recrue opérationnelle 🎉", d: "Prête dès le jour 1" },
  ] : [], [dept]);

  const launch = () => {
    if (!dept || phase === "running") return;
    setPhase("running"); setStep(0);
    if (timer.current) clearInterval(timer.current);
    let i = 0;
    timer.current = setInterval(() => {
      i += 1;
      if (i >= seq.length) { if (timer.current) clearInterval(timer.current); setStep(seq.length - 1); setPhase("done"); return; }
      setStep(i);
    }, 780);
  };
  const reset = () => { if (timer.current) clearInterval(timer.current); setPhase("idle"); setStep(-1); };

  if (!data || !dept) return <div className="co-load">Chargement du cerveau…</div>;

  return (
    <div className="co">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ===== Vue d'ensemble : KPIs ===== */}
      <div className="co-hd">
        <div>
          <div className="co-eyebrow">Vue d'ensemble · temps réel</div>
          <h2 className="co-title">Halo Studio, d'un coup d'œil</h2>
        </div>
        <button className="co-ask" onClick={() => onAsk("Fais-moi un point global sur l'entreprise aujourd'hui")}>Demander un point au cerveau →</button>
      </div>
      <div className="co-kpis">
        {data.kpis.map((k) => (
          <div key={k.label} className={`co-kpi ${k.tone || ""}`}>
            <div className="co-kpi-v">{k.value}</div>
            <div className="co-kpi-l">{k.label}</div>
            <div className="co-kpi-s">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ===== Départements & managers ===== */}
      <div className="co-sec-hd">Les départements &amp; leurs managers</div>
      <div className="co-deps">
        {data.departments.map((d) => (
          <div key={d.key} className="co-dep" style={{ ["--c" as string]: d.color }}>
            <div className="co-dep-top">
              <div className="co-av"><span className="co-av-glow" style={{ background: `radial-gradient(circle,${d.color}44,transparent 70%)` }} /><img src={d.avatar} alt={d.manager} /></div>
              <div className="co-dep-id">
                <div className="co-dep-name">{d.name}</div>
                <div className="co-dep-mgr">{d.manager}</div>
                <div className="co-dep-role">{d.role}</div>
              </div>
            </div>
            <p className="co-dep-daily">{d.daily}</p>
            <div className="co-tools">{d.tools.map((t) => <span key={t}>{t}</span>)}</div>
            <div className="co-dep-actions">
              <button onClick={() => onAsk(`Que fait ${d.manager} au quotidien et comment travaille le pôle ${d.name} ?`)}>Interroger le cerveau</button>
              <button className="co-dep-onb" onClick={() => { setSelKey(d.key); reset(); document.getElementById("co-onb")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Onboarder ici</button>
            </div>
          </div>
        ))}
      </div>

      {/* ===== Onboarding express ===== */}
      <div className="co-onb" id="co-onb">
        <div className="co-onb-head">
          <div>
            <div className="co-eyebrow" style={{ color: "#fff", opacity: .8 }}>Onboarding express · 1 clic</div>
            <h3>Une nouvelle recrue arrive ? Le cerveau l'onboarde.</h3>
            <p>Choisis son département. Kéïta prépare tout : comptes, accès, formation, emails de bienvenue.</p>
          </div>
          <div className="co-onb-pick">
            {data.departments.map((d) => (
              <button key={d.key} className={`co-pill ${selKey === d.key ? "on" : ""}`} onClick={() => { setSelKey(d.key); reset(); }}>
                <img src={d.avatar} alt="" />{d.name}
              </button>
            ))}
          </div>
        </div>

        <div className="co-onb-body">
          <div className="co-onb-left">
            <div className="co-onb-dept" style={{ ["--c" as string]: dept.color }}>
              <div className="co-av lg"><span className="co-av-glow" style={{ background: `radial-gradient(circle,${dept.color}55,transparent 70%)` }} /><img src={dept.avatar} alt={dept.manager} /></div>
              <div>
                <div className="co-onb-dn">Département {dept.name}</div>
                <div className="co-onb-mgr">Manager référent · {dept.manager}</div>
              </div>
            </div>
            {phase === "idle" && (
              <button className="co-launch" style={{ ["--c" as string]: dept.color }} onClick={launch}>
                🚀 Lancer l'onboarding — {dept.name}
              </button>
            )}
            {phase !== "idle" && (
              <button className="co-relaunch" onClick={reset}>↺ Recommencer</button>
            )}
          </div>

          <div className="co-onb-right">
            {phase === "idle" ? (
              <div className="co-preview">
                <div className="co-prev-row"><b>{dept.onboarding.formation.length}</b> modules de formation prêts</div>
                <div className="co-prev-row"><b>{dept.onboarding.credentials.length}</b> accès à provisionner</div>
                <div className="co-prev-row"><b>1</b> email de bienvenue rédigé</div>
                <div className="co-prev-row"><b>{dept.onboarding.firstSteps.length}</b> premiers pas jour 1</div>
                <div className="co-prev-hint">Clique sur « Lancer » pour voir le cerveau tout préparer en direct.</div>
              </div>
            ) : (
              <div className="co-seq">
                {seq.map((s, i) => (
                  <div key={i} className={`co-seq-row ${i < step ? "done" : i === step ? "run" : "wait"}`}>
                    <span className="co-seq-ic">{i < step ? "✓" : i === step && phase === "running" ? "" : i <= step ? "✓" : ""}</span>
                    <div><b>{s.t}</b><span>{s.d}</span></div>
                  </div>
                ))}
                {phase === "done" && (
                  <div className="co-seq-cta">
                    <button onClick={() => setModal("email")}>✉️ Voir l'email de bienvenue</button>
                    <button onClick={() => setModal("access")}>🔑 Voir les accès &amp; la formation</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== modal preview ===== */}
      {modal && (
        <div className="co-modal-back" onClick={() => setModal(null)}>
          <div className="co-modal" onClick={(e) => e.stopPropagation()}>
            <button className="co-modal-x" onClick={() => setModal(null)}>×</button>
            {modal === "email" ? (
              <>
                <div className="co-modal-hd">✉️ Email de bienvenue — {dept.name}</div>
                <div className="co-field"><label>Objet</label>{dept.onboarding.welcomeEmail.subject}</div>
                <div className="co-field co-area"><label>Message</label>{dept.onboarding.welcomeEmail.body}</div>
                <div className="co-modal-ft"><button className="co-send" onClick={() => setModal(null)}>Envoyer à la recrue</button></div>
              </>
            ) : (
              <>
                <div className="co-modal-hd">🔑 Accès &amp; formation — {dept.name}</div>
                <label className="co-lbl">Identifiants provisionnés</label>
                <ul className="co-list">{dept.onboarding.credentials.map((c) => <li key={c}>{c}</li>)}</ul>
                <label className="co-lbl">Formation assignée</label>
                <ul className="co-list">{dept.onboarding.formation.map((f) => <li key={f.module}>{f.module} <i>· {f.duree}</i></li>)}</ul>
                <label className="co-lbl">Premiers pas (jour 1)</label>
                <ul className="co-list">{dept.onboarding.firstSteps.map((s) => <li key={s}>{s}</li>)}</ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.co{font-family:inherit;color:#14121f}
.co-load{padding:60px;text-align:center;color:#8a8794}
.co-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.co-eyebrow{color:#F5411C;font-weight:800;text-transform:uppercase;letter-spacing:.14em;font-size:12px}
.co-title{font-size:30px;font-weight:900;letter-spacing:-.02em;margin-top:4px}
.co-ask{background:#14121f;color:#fff;border:none;border-radius:12px;padding:11px 18px;font-weight:800;font-size:14px;cursor:pointer}
.co-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
@media(max-width:1100px){.co-kpis{grid-template-columns:repeat(3,1fr)}}
@media(max-width:600px){.co-kpis{grid-template-columns:repeat(2,1fr)}}
.co-kpi{background:#fff;border:1px solid #e9e7e1;border-radius:16px;padding:16px}
.co-kpi.accent{background:linear-gradient(180deg,#fff,#fff3ee);border-color:#ffd9cf}
.co-kpi.warn{background:linear-gradient(180deg,#fff,#fff6ec);border-color:#ffe0c2}
.co-kpi.ok{background:linear-gradient(180deg,#fff,#eefaf1);border-color:#c9ecd2}
.co-kpi-v{font-size:24px;font-weight:900;letter-spacing:-.02em}
.co-kpi-l{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#57545f;margin-top:2px}
.co-kpi-s{font-size:11.5px;color:#8a8794;margin-top:3px}

.co-sec-hd{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#8a8794;margin:26px 0 14px}
.co-deps{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
@media(max-width:1100px){.co-deps{grid-template-columns:repeat(3,1fr)}}
@media(max-width:700px){.co-deps{grid-template-columns:repeat(2,1fr)}}
.co-dep{background:#fff;border:1px solid #e9e7e1;border-radius:18px;padding:16px;border-top:3px solid var(--c);display:flex;flex-direction:column}
.co-dep-top{display:flex;gap:10px;align-items:center}
.co-av{position:relative;width:54px;height:54px;flex:none;display:flex;align-items:flex-end;justify-content:center}
.co-av img{position:relative;height:54px;width:auto}
.co-av-glow{position:absolute;width:56px;height:56px;left:50%;top:44%;transform:translate(-50%,-50%);border-radius:50%;filter:blur(10px)}
.co-av.lg{width:76px;height:76px}.co-av.lg img{height:76px}.co-av.lg .co-av-glow{width:78px;height:78px}
.co-dep-name{font-size:15px;font-weight:900}
.co-dep-mgr{font-size:12.5px;color:#14121f;font-weight:700}
.co-dep-role{font-size:11px;color:#8a8794}
.co-dep-daily{font-size:12.5px;color:#57545f;line-height:1.4;margin:10px 0}
.co-tools{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}
.co-tools span{font-size:10.5px;background:#f4f2ec;border:1px solid #e9e7e1;border-radius:999px;padding:3px 9px;color:#57545f;font-weight:600}
.co-dep-actions{margin-top:auto;display:flex;flex-direction:column;gap:6px}
.co-dep-actions button{border:1px solid #e6e3db;background:#fff;border-radius:10px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;color:#14121f}
.co-dep-actions button:hover{border-color:var(--c)}
.co-dep-onb{background:var(--c)!important;color:#fff!important;border-color:var(--c)!important}

.co-onb{margin-top:26px;background:linear-gradient(135deg,#17131f,#241a3d);border-radius:24px;padding:26px;color:#fff;position:relative;overflow:hidden}
.co-onb::before{content:"";position:absolute;right:-60px;top:-60px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(245,65,28,.4),transparent 70%);filter:blur(20px)}
.co-onb-head{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;position:relative}
.co-onb-head h3{font-size:24px;font-weight:900;letter-spacing:-.02em;margin:6px 0 6px;max-width:22ch}
.co-onb-head p{font-size:14px;color:#c8c3dd;max-width:44ch}
.co-onb-pick{display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start;max-width:340px}
.co-pill{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#e9e7f5;border-radius:999px;padding:6px 12px 6px 6px;font-size:12.5px;font-weight:700;cursor:pointer}
.co-pill img{width:24px;height:24px;object-fit:contain;object-position:bottom}
.co-pill.on{background:#fff;color:#14121f;border-color:#fff}
.co-onb-body{display:grid;grid-template-columns:300px 1fr;gap:20px;margin-top:22px;position:relative}
@media(max-width:820px){.co-onb-body{grid-template-columns:1fr}}
.co-onb-dept{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:16px;display:flex;gap:12px;align-items:center;border-left:3px solid var(--c)}
.co-onb-dn{font-weight:900;font-size:16px}
.co-onb-mgr{font-size:12px;color:#c8c3dd;margin-top:2px}
.co-launch{margin-top:14px;width:100%;background:var(--c);color:#fff;border:none;border-radius:14px;padding:16px;font-weight:900;font-size:15px;cursor:pointer;box-shadow:0 16px 34px -14px var(--c)}
.co-launch:hover{filter:brightness(1.05)}
.co-relaunch{margin-top:14px;width:100%;background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:13px;font-weight:800;font-size:14px;cursor:pointer}
.co-onb-right{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:18px;min-height:230px}
.co-preview{display:flex;flex-direction:column;gap:10px}
.co-prev-row{font-size:14px;color:#e9e7f5}.co-prev-row b{color:#fff;font-size:18px;margin-right:6px}
.co-prev-hint{margin-top:6px;font-size:12.5px;color:#a49fc0}
.co-seq{display:flex;flex-direction:column;gap:8px}
.co-seq-row{display:flex;gap:12px;align-items:center;background:rgba(255,255,255,.05);border-radius:12px;padding:11px 14px;opacity:.4;transition:opacity .3s, background .3s}
.co-seq-row.done{opacity:1;background:rgba(75,224,142,.14)}
.co-seq-row.run{opacity:1;background:rgba(245,65,28,.16)}
.co-seq-ic{width:24px;height:24px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:13px;font-weight:900;background:rgba(255,255,255,.14);color:#fff}
.co-seq-row.done .co-seq-ic{background:#4be08e;color:#0b3a22}
.co-seq-row.run .co-seq-ic{background:#fff;color:#F5411C;animation:co-spin 1s linear infinite}
.co-seq-row.run .co-seq-ic::after{content:"◜"}
@keyframes co-spin{to{transform:rotate(360deg)}}
.co-seq-row b{font-size:14px;display:block}.co-seq-row span{font-size:12px;color:#c8c3dd}
.co-seq-cta{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap}
.co-seq-cta button{background:#fff;color:#14121f;border:none;border-radius:11px;padding:11px 16px;font-weight:800;font-size:13px;cursor:pointer}

.co-modal-back{position:fixed;inset:0;background:rgba(14,13,18,.55);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:200;padding:22px}
.co-modal{background:#fff;color:#14121f;border-radius:20px;max-width:540px;width:100%;padding:24px;position:relative;box-shadow:0 50px 100px -30px rgba(0,0,0,.55);max-height:80vh;overflow:auto}
.co-modal-x{position:absolute;top:16px;right:18px;width:32px;height:32px;border-radius:50%;border:1px solid #e9e7e1;background:#fff;font-size:18px;cursor:pointer;color:#8a8794}
.co-modal-hd{font-size:18px;font-weight:900;margin-bottom:16px}
.co-field{background:#faf9f6;border:1px solid #ece9e1;border-radius:12px;padding:12px 14px;font-size:14px;margin-bottom:10px}
.co-field label,.co-lbl{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a8794;font-weight:800;margin-bottom:5px}
.co-lbl{margin:14px 0 6px}
.co-area{white-space:pre-wrap;line-height:1.5}
.co-list{margin:0;padding-left:18px;font-size:13.5px;line-height:1.6;color:#2a2833}
.co-list i{color:#8a8794;font-style:normal;font-size:12px}
.co-modal-ft{margin-top:14px;display:flex;justify-content:flex-end}
.co-send{background:#14121f;color:#fff;border:none;border-radius:11px;padding:11px 20px;font-weight:800;font-size:14px;cursor:pointer}
`;
