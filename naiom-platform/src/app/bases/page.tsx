import Link from "next/link";
import { AppNav } from "@/components/landing/AppNav";
import { Icon } from "@/components/Icon";

export const metadata = {
  title: "Les bases · Noémie.K",
  description:
    "C'est quoi un LLM, une automatisation, un agent IA ? La différence expliquée simplement, avec des schémas animés.",
};

/**
 * /bases — Introduction aux agents IA, en slides animées (même langage que
 * /live) : LLM, automatisation (déterministe), agent IA (interprète et
 * décide), la différence côte à côte, et quand utiliser quoi.
 * Zéro jargon : une comparaison de la vie courante par slide.
 */
export default function BasesPage() {
  return (
    <div className="bronx-page lv-snap min-h-screen w-full">
      <AppNav active="bases" />

      {/* ============ SLIDE 0 — COVER ============ */}
      <section className="lv-slide" id="b-top">
        <div className="lv-board lav items-center justify-center text-center" style={{ gap: "2.4vh" }}>
          <div className="lv-eyebrow">Les bases · avant la démo</div>
          <h1
            className="bronx-hero-title"
            style={{ fontSize: "clamp(32px, 4.4vw, 64px)", maxWidth: "24ch", lineHeight: 1.1 }}
          >
            <span className="lv-mark">Agent IA</span> ou{" "}
            <span className="lv-mark m2">automatisation</span>&nbsp;?
            <br />
            Les bases, expliquées simplement
          </h1>
          <p className="bronx-body" style={{ maxWidth: 560 }}>
            Cinq idées à comprendre avant de voir l'équipe d'employés IA tourner — chacune
            avec un schéma animé et une comparaison de la vie de tous les jours.
          </p>
          <nav className="lv-toc">
            <a href="#b1"><span className="n">01</span>C&apos;est quoi un LLM</a>
            <a href="#b2"><span className="n">02</span>C&apos;est quoi une automatisation</a>
            <a href="#b3"><span className="n">03</span>C&apos;est quoi un agent IA</a>
            <a href="#b4"><span className="n">04</span>La différence, côte à côte</a>
            <a href="#b5"><span className="n">05</span>Quand utiliser quoi</a>
            <a href="#b6"><span className="n">06</span>Des exemples concrets</a>
          </nav>
          <div className="text-[13px] text-[#8A8A8A]">
            Navigue avec <Kbd>↓</Kbd> <Kbd>↑</Kbd> — chaque schéma tourne en boucle
          </div>
        </div>
      </section>

      {/* ============ SLIDE 1 — LE LLM ============ */}
      <section className="lv-slide" id="b1">
        <div className="lv-board">
          <div className="lv-eyebrow">01 · Le moteur</div>
          <h2 className="lv-h2">
            C&apos;est quoi un <span className="lv-mark">LLM</span> ?
          </h2>
          <div className="flex flex-wrap gap-y-2">
            <div className="lv-goal">🎯 à retenir : il lit du texte, il produit du texte — c&apos;est tout</div>
            <div className="lv-analog">📚 c&apos;est comme un cerveau qui a lu toute la bibliothèque… mais sans bras</div>
          </div>
          <div className="lv-fig">
            <svg viewBox="0 0 1200 520" className="w-full h-auto">
              <rect width="1200" height="520" fill="none" />
              <text x="600" y="260" textAnchor="middle" fontSize="24" fill="#5B4DEE">
                LLM Explainer
              </text>
            </svg>
          </div>
          <div className="lv-why">
            🎓 Un LLM (comme ChatGPT, Claude…) c&apos;est le <b>cerveau</b> : brillant pour comprendre
            et rédiger, mais sans bras ni jambes. Pour qu&apos;il <b>fasse</b> des choses, il faut
            lui donner des outils — c&apos;est là qu&apos;arrivent les agents.
          </div>
        </div>
      </section>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-[#0F0F0F] bg-white px-1.5 py-0.5 font-mono text-[0.9em]">
      {children}
    </kbd>
  );
}