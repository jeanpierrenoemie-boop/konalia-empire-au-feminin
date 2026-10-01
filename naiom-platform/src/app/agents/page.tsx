import Link from "next/link";
import { listAgents } from "@/lib/agents-server";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Icon } from "@/components/Icon";

export default async function AgentsPage() {
  const agents = await listAgents();

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100 py-12">
      <div className="container max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">
            Votre équipe d'employés IA
          </h1>
          <p className="text-lg text-slate-600">
            Découvrez les {agents.length} agents spécialisés qui composent votre écosystème Noémie.K
          </p>
        </div>

        {/* Agent Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {agents.map((agent) => (
            <Link
              key={agent.slug}
              href={`/agents/${agent.slug}`}
              className="group relative"
            >
              <div className="h-full bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-6 flex flex-col">
                {/* Avatar */}
                <div className="mb-4 flex justify-center">
                  <div className="relative">
                    <AgentAvatar slug={agent.slug} />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 text-center">
                  <h3 className="font-bold text-lg text-slate-900 group-hover:text-blue-600 transition-colors">
                    {agent.name}
                  </h3>
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                    {agent.tagline}
                  </p>

                  {/* Meta */}
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-1">
                    <div className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{agent.role}</span>
                    </div>
                    {agent.model && (
                      <div className="text-xs text-slate-500">
                        Modèle: <span className="text-slate-700">{agent.model}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <div className="mt-4 text-center">
                  <Icon
                    name="ArrowRight"
                    size={16}
                    className="mx-auto group-hover:translate-x-1 transition-transform"
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-16 bg-white rounded-xl shadow-sm p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">À propos de votre équipe</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-3xl font-bold text-blue-600 mb-2">{agents.length}</div>
              <p className="text-slate-600">Agents spécialisés</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600 mb-2">24/7</div>
              <p className="text-slate-600">Disponibilité continue</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-600 mb-2">∞</div>
              <p className="text-slate-600">Capacités sans limites</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
