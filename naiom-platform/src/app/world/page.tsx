"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listAgentSync } from "@/lib/agents";
import { Icon } from "@/components/Icon";

interface Agent {
  slug: string;
  name: string;
  emoji: string;
  zone: string;
  mood: "productive" | "thinking" | "collaborating" | "resting";
  energy: number;
}

interface WorldEvent {
  id: string;
  timestamp: Date;
  agent: string;
  action: string;
  icon: string;
}

const ZONES = {
  bureau: { x: 100, y: 100, label: "Bureau", color: "#3B82F6" },
  labo: { x: 350, y: 100, label: "Labo IA", color: "#10B981" },
  creative: { x: 600, y: 100, label: "Studio Créatif", color: "#F59E0B" },
  reflection: { x: 100, y: 300, label: "Zone Réflexion", color: "#8B5CF6" },
  collaboration: { x: 350, y: 300, label: "Espace Collab", color: "#EC4899" },
  rest: { x: 600, y: 300, label: "Zone Détente", color: "#6B7280" },
};

const AGENT_EMOJIS: Record<string, string> = {
  orchestrateur: "🎼",
  strategiste: "♟️",
  createur_contenu: "✍️",
  designer: "🎨",
  analyste: "📊",
  presentateur: "🎤",
  gmail: "📧",
  fireflies: "🎙️",
  proposition: "💡",
  cv: "📄",
  ecommerce: "🛒",
  prospection: "🎯",
  veille: "👁️",
  comptabilite: "💰",
  cerveau: "🧠",
};

const MOODS = {
  productive: { label: "Productif", color: "#10B981", icon: "⚡" },
  thinking: { label: "En réflexion", color: "#8B5CF6", icon: "💭" },
  collaborating: { label: "Collaborant", color: "#EC4899", icon: "🤝" },
  resting: { label: "Repos", color: "#6B7280", icon: "😴" },
};

export default function WorldPage() {
  const agents = listAgentSync();
  const [agentStates, setAgentStates] = useState<Agent[]>([]);
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // Initialize agent states with random zones and moods
    const initialStates: Agent[] = agents.map((agent, idx) => {
      const zoneKeys = Object.keys(ZONES);
      const moods = Object.keys(MOODS) as ("productive" | "thinking" | "collaborating" | "resting")[];
      return {
        slug: agent.slug,
        name: agent.name,
        emoji: AGENT_EMOJIS[agent.slug] || "🤖",
        zone: zoneKeys[idx % zoneKeys.length],
        mood: moods[Math.floor(Math.random() * moods.length)],
        energy: Math.random() * 60 + 40,
      };
    });
    setAgentStates(initialStates);

    // Add initial events
    const initialEvents: WorldEvent[] = initialStates.slice(0, 5).map((agent, idx) => ({
      id: `event-${idx}`,
      timestamp: new Date(Date.now() - idx * 60000),
      agent: agent.name,
      action: `${agent.name} commence à travailler dans la ${ZONES[agent.zone as keyof typeof ZONES].label}`,
      icon: agent.emoji,
    }));
    setEvents(initialEvents);
  }, [agents]);

  // Simulate world activity
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
      setAgentStates((prev) =>
        prev.map((agent) => ({
          ...agent,
          energy: Math.max(0, agent.energy - Math.random() * 5 + 2),
          mood: Math.random() > 0.7 ? (Math.random() > 0.5 ? "collaborating" : "thinking") : agent.mood,
        }))
      );

      // Random new event
      if (Math.random() > 0.7) {
        const randomAgent = agentStates[Math.floor(Math.random() * agentStates.length)];
        if (randomAgent) {
          const actions = [
            `commence une nouvelle tâche`,
            `collabore avec un collègue`,
            `analyse les données`,
            `crée du contenu`,
            `prend une pause`,
          ];
          setEvents((prev) => [
            {
              id: `event-${Date.now()}`,
              timestamp: new Date(),
              agent: randomAgent.name,
              action: `${randomAgent.name} ${actions[Math.floor(Math.random() * actions.length)]}`,
              icon: randomAgent.emoji,
            },
            ...prev.slice(0, 9),
          ]);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [agentStates]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">🌍 Konalia World</h1>
            <p className="text-sm text-slate-400">
              Univers vivant de {agents.length} agents IA • {time.toLocaleTimeString("fr-FR")}
            </p>
          </div>
          <Link href="/agents" className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition">
            Vue Grille
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main World Canvas */}
        <div className="lg:col-span-3">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 aspect-video relative overflow-hidden">
            {/* World Background */}
            <svg className="w-full h-full absolute inset-0" viewBox="0 0 800 400">
              {/* Zones */}
              {Object.entries(ZONES).map(([key, zone]) => (
                <g key={key}>
                  <rect
                    x={zone.x - 60}
                    y={zone.y - 40}
                    width="120"
                    height="80"
                    fill={zone.color}
                    opacity="0.1"
                    rx="8"
                  />
                  <rect
                    x={zone.x - 60}
                    y={zone.y - 40}
                    width="120"
                    height="80"
                    fill="none"
                    stroke={zone.color}
                    strokeWidth="2"
                    rx="8"
                    opacity="0.5"
                  />
                  <text
                    x={zone.x}
                    y={zone.y - 20}
                    textAnchor="middle"
                    fontSize="12"
                    fill={zone.color}
                    opacity="0.7"
                  >
                    {zone.label}
                  </text>
                </g>
              ))}

              {/* Agents */}
              {agentStates.map((agent, idx) => {
                const zone = ZONES[agent.zone as keyof typeof ZONES] || ZONES.bureau;
                const offsetX = (idx % 3 - 1) * 25;
                const offsetY = Math.floor(idx / 3) * 25 - 20;
                const mood = MOODS[agent.mood];

                return (
                  <g
                    key={agent.slug}
                    onClick={() => setSelectedAgent(agent)}
                    className="cursor-pointer"
                  >
                    {/* Aura */}
                    <circle
                      cx={zone.x + offsetX}
                      cy={zone.y + offsetY}
                      r="20"
                      fill={mood.color}
                      opacity="0.2"
                      className="hover:opacity-40 transition"
                    />

                    {/* Agent Circle */}
                    <circle
                      cx={zone.x + offsetX}
                      cy={zone.y + offsetY}
                      r="16"
                      fill={mood.color}
                      opacity="0.8"
                      stroke="white"
                      strokeWidth="2"
                    />

                    {/* Emoji */}
                    <text
                      x={zone.x + offsetX}
                      y={zone.y + offsetY + 6}
                      textAnchor="middle"
                      fontSize="16"
                    >
                      {agent.emoji}
                    </text>

                    {/* Energy bar */}
                    <rect
                      x={zone.x + offsetX - 12}
                      y={zone.y + offsetY + 18}
                      width={(agent.energy / 100) * 24}
                      height="3"
                      fill="#10B981"
                      rx="1"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected Agent Details */}
          {selectedAgent && (
            <div className="mt-4 bg-slate-800 rounded-xl border border-slate-700 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold">
                    {selectedAgent.emoji} {selectedAgent.name}
                  </h3>
                  <p className="text-sm text-slate-400">
                    Zone: {ZONES[selectedAgent.zone as keyof typeof ZONES]?.label}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 space-y-2">
                <div>
                  <p className="text-xs text-slate-500 mb-1">État</p>
                  <p className="flex items-center gap-2">
                    <span>{MOODS[selectedAgent.mood].icon}</span>
                    {MOODS[selectedAgent.mood].label}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Énergie</p>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full"
                      style={{ width: `${selectedAgent.energy}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">{Math.round(selectedAgent.energy)}%</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Timeline & Stats */}
        <div className="lg:col-span-1 space-y-4">
          {/* Stats */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <h3 className="font-bold mb-3 text-sm">📊 Statistiques</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Agents actifs</span>
                <span className="font-bold">
                  {agentStates.filter((a) => a.energy > 30).length}/{agentStates.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Collaborations</span>
                <span className="font-bold">
                  {agentStates.filter((a) => a.mood === "collaborating").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">En réflexion</span>
                <span className="font-bold">
                  {agentStates.filter((a) => a.mood === "thinking").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Énergie moyenne</span>
                <span className="font-bold">
                  {Math.round(agentStates.reduce((sum, a) => sum + a.energy, 0) / agentStates.length)}%
                </span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <h3 className="font-bold mb-3 text-sm">📡 Timeline</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.map((event) => (
                <div key={event.id} className="text-xs border-l-2 border-slate-700 pl-2 py-1">
                  <p className="text-slate-400">
                    {event.timestamp.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </p>
                  <p className="text-slate-200">
                    {event.icon} {event.action}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <h3 className="font-bold mb-3 text-sm">🎯 Légende</h3>
            <div className="space-y-2 text-xs">
              {Object.entries(MOODS).map(([key, mood]) => (
                <div key={key} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: mood.color }}
                  />
                  <span className="text-slate-400">{mood.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-700 bg-slate-900/50 mt-8 py-4">
        <div className="container mx-auto px-4 text-center text-sm text-slate-400">
          <p>Konalia World 🌍 - Un univers où vos agents IA vivent et collaborent en temps réel</p>
          <p className="mt-1">Version 2D • 3D coming soon 🚀</p>
        </div>
      </div>
    </div>
  );
}
