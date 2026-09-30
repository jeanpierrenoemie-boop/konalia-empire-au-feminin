"use client";

import { useState, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { WorldScene } from "@/components/3d/WorldScene";
import { listAgentSync } from "@/lib/agents";

interface AgentState {
  slug: string;
  name: string;
  emoji: string;
  zone: string;
  mood: "productive" | "thinking" | "collaborating" | "resting";
  energy: number;
  position: [number, number, number];
}

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

// KONALIA METAVERSE - QUARTIERS & POSITIONS
const QUARTIER_POSITIONS = {
  centre_ville: { x: 0, z: 0 },
  quartier_business: { x: -40, z: -40 },
  quartier_creativo: { x: 40, z: -40 },
  quartier_marketing: { x: -40, z: 40 },
  quartier_consulting: { x: 40, z: 40 },
  quartier_gaming: { x: -20, z: -70 },
  quartier_innovation: { x: 20, z: -70 },
};

// ASSIGNATION AGENTS RÉELS AUX QUARTIERS
const AGENT_QUARTIER_MAP: Record<string, string> = {
  orchestrateur: "quartier_business",
  strategiste: "quartier_business",
  analyste: "quartier_business",
  designer: "quartier_creativo",
  createur_contenu: "quartier_creativo",
  fireflies: "quartier_creativo",
  community_manager: "quartier_marketing",
  prospection: "quartier_marketing",
  veille: "quartier_marketing",
  gmail: "quartier_consulting",
  noemie_k: "quartier_consulting",
  presentateur: "quartier_gaming",
  proposition: "quartier_gaming",
  cerveau: "quartier_innovation",
  cv: "quartier_innovation",
};

const MOODS = {
  productive: { label: "Productif", color: "#10B981" },
  thinking: { label: "En réflexion", color: "#8B5CF6" },
  collaborating: { label: "Collaborant", color: "#EC4899" },
  resting: { label: "Repos", color: "#6B7280" },
};

export default function World3DPage() {
  const agents = listAgentSync();
  const [agentStates, setAgentStates] = useState<AgentState[]>([]);
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const simulationRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    // Initialize agents with 3D positions in their assigned quartiers
    const initialStates: AgentState[] = agents.map((agent, idx) => {
      const quartier = AGENT_QUARTIER_MAP[agent.slug] || "quartier_business";
      const quartierPos = QUARTIER_POSITIONS[quartier as keyof typeof QUARTIER_POSITIONS];

      // Spread agents within their quartier (3x3 grid)
      const offsetX = (idx % 3 - 1) * 3;
      const offsetZ = (Math.floor(idx / 3) % 3 - 1) * 3;

      const moods = Object.keys(MOODS) as (
        | "productive"
        | "thinking"
        | "collaborating"
        | "resting"
      )[];

      return {
        slug: agent.slug,
        name: agent.name,
        emoji: AGENT_EMOJIS[agent.slug] || "🤖",
        zone: quartier,
        mood: moods[Math.floor(Math.random() * moods.length)],
        energy: Math.random() * 60 + 40,
        position: [
          quartierPos.x + offsetX,
          0,
          quartierPos.z + offsetZ,
        ] as [number, number, number],
      };
    });
    setAgentStates(initialStates);
  }, [agents]);

  // Simulation loop
  useEffect(() => {
    if (paused) return;

    simulationRef.current = setInterval(() => {
      setAgentStates((prev) =>
        prev.map((agent) => {
          const moods = Object.keys(MOODS) as (
            | "productive"
            | "thinking"
            | "collaborating"
            | "resting"
          )[];
          const newMood =
            Math.random() > 0.8
              ? moods[Math.floor(Math.random() * moods.length)]
              : agent.mood;

          return {
            ...agent,
            energy: Math.max(0, agent.energy - Math.random() * speed + 0.5),
            mood: newMood,
          };
        })
      );
    }, 2000 / speed);

    return () => clearInterval(simulationRef.current);
  }, [paused, speed]);

  const selectedAgent =
    selectedAgentSlug === "noemie-avatar"
      ? {
          slug: "noemie-avatar",
          name: "Noémie Avatar",
          emoji: "✨",
          zone: "centre_ville",
          mood: "talking" as const,
          energy: 100,
          position: [0, 0, 0] as [number, number, number],
        }
      : agentStates.find((a) => a.slug === selectedAgentSlug);

  return (
    <div className="w-full h-screen flex flex-col bg-slate-900">
      {/* Top Bar */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">🌍 Konalia World 3D</h1>
          <p className="text-xs text-slate-400">Phase 2 • Three.js</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-sm"
          >
            {paused ? "▶️ Play" : "⏸️ Pause"}
          </button>
          <Link href="/world" className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-sm">
            2D View
          </Link>
        </div>
      </div>

      {/* Main Canvas + Sidebar */}
      <div className="flex-1 flex gap-0">
        {/* 3D Canvas */}
        <div className="flex-1 relative">
          <Canvas shadows>
            <WorldScene
              agents={agentStates}
              selectedAgentSlug={selectedAgentSlug}
              onSelectAgent={setSelectedAgentSlug}
            />
          </Canvas>

          {/* Speed Control */}
          <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg p-3 z-10">
            <div className="text-xs text-slate-400 mb-2">
              Vitesse simulation: {speed.toFixed(1)}x
            </div>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-24"
            />
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 border-l border-slate-700 bg-slate-800/50 overflow-y-auto">
          {selectedAgent ? (
            <div className="p-4 space-y-4">
              {/* Agent Details */}
              <div>
                <button
                  onClick={() => setSelectedAgentSlug(null)}
                  className="text-slate-400 hover:text-white text-sm mb-2"
                >
                  ← Retour
                </button>
                <h2 className="text-xl font-bold">
                  {selectedAgent.emoji} {selectedAgent.name}
                </h2>
                {selectedAgent.slug === "noemie-avatar" ? (
                  <p className="text-sm text-slate-400">
                    Cœur du metaverse Konalia
                  </p>
                ) : (
                  <p className="text-sm text-slate-400">
                    Zone: {selectedAgent.zone}
                  </p>
                )}
              </div>

              {/* Noémie Avatar Special Panel */}
              {selectedAgent.slug === "noemie-avatar" && (
                <div className="space-y-3 border-t border-slate-700 pt-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Rôle</p>
                    <p className="text-sm font-semibold">
                      Orchestratrice du Metaverse
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Statut</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      <span className="text-sm">LIVE - En communication</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      Agents sous supervision
                    </p>
                    <p className="text-sm">{agentStates.length} agents actifs</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Tâches en cours</p>
                    <div className="space-y-1">
                      <p className="text-xs">
                        • Orchestrer workflow {agentStates.length}
                      </p>
                      <p className="text-xs">
                        • Monitorer collaborations
                      </p>
                      <p className="text-xs">• Recevoir visiteurs</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="space-y-3 border-t border-slate-700 pt-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">État</p>
                  <p className="text-sm">
                    {MOODS[selectedAgent.mood].label}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500 mb-1">Énergie</p>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${selectedAgent.energy}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {Math.round(selectedAgent.energy)}%
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <h3 className="font-bold text-sm">👥 Univers Konalia</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {/* Noémie Avatar Card */}
                <button
                  onClick={() => setSelectedAgentSlug("noemie-avatar")}
                  className="w-full text-left p-3 rounded bg-gradient-to-r from-slate-700/50 to-slate-600/50 hover:from-slate-600 hover:to-slate-500 transition border border-amber-500/30 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✨</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-amber-300">Noémie Avatar</p>
                      <p className="text-xs text-slate-300">Cœur du metaverse</p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  </div>
                </button>

                {/* Agents List */}
                {agentStates.map((agent) => (
                  <button
                    key={agent.slug}
                    onClick={() => setSelectedAgentSlug(agent.slug)}
                    className="w-full text-left p-2 rounded hover:bg-slate-700/50 transition text-sm group"
                  >
                    <div className="flex items-center gap-2">
                      <span>{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{agent.name}</p>
                        <p className="text-xs text-slate-500">
                          {MOODS[agent.mood].label}
                        </p>
                      </div>
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: MOODS[agent.mood].color }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="border-t border-slate-700 p-4 mt-auto">
            <h4 className="text-xs font-bold text-slate-400 mb-2">LÉGENDE</h4>
            <div className="space-y-1 text-xs">
              {Object.entries(MOODS).map(([key, mood]) => (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: mood.color }}
                  />
                  <span className="text-slate-400">{mood.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
