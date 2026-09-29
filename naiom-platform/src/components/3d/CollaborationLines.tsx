import { useMemo, useEffect, useState } from "react";
import * as THREE from "three";

interface CollaboratingAgent {
  slug: string;
  position: [number, number, number];
  mood: string;
}

interface CollaborationLinesProps {
  agents: CollaboratingAgent[];
}

const MOOD_COLORS = {
  productive: 0x10b981,
  thinking: 0x8b5cf6,
  collaborating: 0xec4899,
  resting: 0x6b7280,
};

export function CollaborationLines({ agents }: CollaborationLinesProps) {
  const [collaborations, setCollaborations] = useState<
    Array<{ from: number; to: number; mood: string }>
  >([]);

  useEffect(() => {
    // Find agents in "collaborating" mood and create connections
    const collaboratingAgents = agents.filter((a) => a.mood === "collaborating");

    if (collaboratingAgents.length >= 2) {
      const newCollaborations: Array<{ from: number; to: number; mood: string }> = [];

      for (let i = 0; i < collaboratingAgents.length; i++) {
        for (let j = i + 1; j < Math.min(i + 3, collaboratingAgents.length); j++) {
          newCollaborations.push({
            from: agents.findIndex((a) => a.slug === collaboratingAgents[i].slug),
            to: agents.findIndex((a) => a.slug === collaboratingAgents[j].slug),
            mood: "collaborating",
          });
        }
      }

      setCollaborations(newCollaborations);
    }
  }, [agents]);

  const lines = useMemo(() => {
    return collaborations.map((collab, idx) => {
      const fromPos = agents[collab.from]?.position;
      const toPos = agents[collab.to]?.position;

      if (!fromPos || !toPos) return null;

      return (
        <line key={`collab-${idx}`}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([...fromPos, ...toPos]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={MOOD_COLORS[collab.mood as keyof typeof MOOD_COLORS] || 0xec4899}
            linewidth={2}
            transparent
            opacity={0.6}
          />
        </line>
      );
    });
  }, [collaborations, agents]);

  return <group>{lines}</group>;
}
