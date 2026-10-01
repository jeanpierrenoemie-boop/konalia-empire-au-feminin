import Link from "next/link";
import { listAgents } from "@/lib/agents";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AppNav } from "@/components/landing/AppNav";

export const dynamic = "force-dynamic";

const PRIORITES = [
  {
    titre: "Reprise de Contrôle",
    texte: "Aider les salarié·e·s du tertiaire (assistantes de direction, conseillères clientèle…) à bâtir un revenu complémentaire sans quitter leur emploi.",
    href: "/agents/strategiste",
    cta: "Préparer avec Amara",
  },
  {
    titre: "Code Liberté",
    texte: "Des contenus pour les mamans solo qui veulent apprendre une compétence et se lancer dans le digital (formation d'un tiers, en affiliation).",
    href: "/agents/createur-contenu",
    cta: "Créer avec Aïna",
  },
  {
    titre: "KatalyMode & KatalyBeauty",
    texte: "Faire connaître les deux marques avant les produits : contenus éducatifs, deux comptes séparés, liste d'attente.",
    href: "/agents/designer",
    cta: "Imaginer avec Zayna",
  },
];

export default async function HomePage() {
  const agents = (await listAgents()).filter((a) => a.status === "active");

  return (
    <div className="relative min-h-screen w-full overflow-x-clip">
      <AppNav active="accueil" />

      <main className="mx-auto max-w-[1100px] px-6 sm:px-10 pt-36 pb-20">
        <section className="text-center">
          <div className="flex justify-center"><span className="althea-eyebrow">Konalia</span></div>
          <h1 className="althea-logo mt-4" style={{ fontSize: "clamp(56px, 9vw, 104px)", lineHeight: 1 }}>
            Noémie.K
          </h1>
          <p className="mx-auto mt-6 max-w-[640px] text-[18px] leading-relaxed text-[var(--color-ink-soft)]">
            Ton équipe d&apos;agents IA, au service de ta vision. Chacun t&apos;aide à avancer sur tes priorités, et rien ne part sans ton accord.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/dashboard" className="bronx-cta-solid inline-flex">Ouvrir le Studio</Link>
            <Link href="/agents/orchestrateur" className="bronx-cta">
              Parler à Kélan <span className="bronx-cta-arrow">→</span>
            </Link>
          </div>
        </section>

        <section className="mt-24">
          <div className="althea-eyebrow">Tes priorités</div>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {PRIORITES.map((p) => (
              <div key={p.titre} className="rounded-3xl border border-[var(--color-line)] bg-white p-7 shadow-sm">
                <h2 className="text-[20px] font-black tracking-tight text-[var(--color-ink)]">{p.titre}</h2>
                <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--color-ink-soft)]">{p.texte}</p>
                <Link href={p.href} className="mt-5 inline-block text-[14px] font-bold text-[var(--color-bronx)] hover:underline">
                  {p.cta} →
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-24">
          <div className="althea-eyebrow">Ton équipe</div>
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-5">
            {agents.map((a) => (
              <Link key={a.slug} href={`/agents/${a.slug}`} className="group flex flex-col items-center text-center">
                <AgentAvatar slug={a.slug} size={96} animate={false} />
                <div className="mt-3 text-[15px] font-black text-[var(--color-ink)] group-hover:text-[var(--color-bronx)] transition">{a.name}</div>
                <div className="text-[12px] text-[var(--color-ink-soft)]">{a.role}</div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative px-6 sm:px-10 py-10 border-t border-[var(--color-line)]">
        <div className="mx-auto max-w-[1400px] flex flex-wrap items-center justify-between gap-3 text-[12px] text-[var(--color-ink-soft)]">
          <span className="althea-logo" style={{ fontSize: 22 }}>Noémie.K</span>
          <span>Noémie.K · Konalia · © 2026</span>
        </div>
      </footer>
    </div>
  );
}
