import { useState, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { Agent3D } from "./Agent3D";
import { Environment3D } from "./Environment3D";
import { ParticleSystem } from "./ParticleSystem";
import { CollaborationLines } from "./CollaborationLines";
import { VoiceIndicator } from "./VoiceIndicator";
import { AvatarNoemie3D } from "./AvatarNoemie3D";
import { TaskBoard3D } from "./TaskBoard3D";

interface AgentState {
  slug: string;
  name: string;
  emoji: string;
  zone: string;
  mood: "productive" | "thinking" | "collaborating" | "resting";
  energy: number;
  position: [number, number, number];
}

// KONALIA METAVERSE - POSITIONS QUARTIERS
const QUARTIER_POSITIONS = {
  centre_ville: { x: 0, z: 0 },
  quartier_business: { x: -40, z: -40 },
  quartier_creativo: { x: 40, z: -40 },
  quartier_marketing: { x: -40, z: 40 },
  quartier_consulting: { x: 40, z: 40 },
  quartier_gaming: { x: -20, z: -70 },
  quartier_innovation: { x: 20, z: -70 },
};

interface WorldSceneProps {
  agents: AgentState[];
  selectedAgentSlug: string | null;
  onSelectAgent: (slug: string) => void;
}

export function WorldScene({
  agents,
  selectedAgentSlug,
  onSelectAgent,
}: WorldSceneProps) {
  const controlsRef = useRef<any>(null);

  useFrame((state) => {
    if (controlsRef.current && selectedAgentSlug) {
      const selectedAgent = agents.find((a) => a.slug === selectedAgentSlug);
      if (selectedAgent) {
        const targetPos = {
          x: selectedAgent.position[0],
          y: selectedAgent.position[1] + 5,
          z: selectedAgent.position[2] + 8,
        };

        state.camera.position.lerp(
          new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z),
          0.05
        );
      }
    }
  });

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[0, 25, 35]}
        fov={60}
        near={0.1}
        far={1000}
      />
      <OrbitControls
        ref={controlsRef}
        minDistance={10}
        maxDistance={80}
        enableDamping
        dampingFactor={0.05}
      />

      {/* Scene Content */}
      <Environment3D />

      {/* Phase 2: Noémie Avatar - Centre du Metaverse */}
      <AvatarNoemie3D
        position={[0, 0, 0]}
        isActive={selectedAgentSlug === "noemie-avatar"}
        mood={
          selectedAgentSlug === "noemie-avatar"
            ? "talking"
            : agents.some((a) => a.mood === "collaborating")
            ? "celebrating"
            : "idle"
        }
        onClick={() => onSelectAgent("noemie-avatar")}
      />

      {/* Phase 3: Particle Effects */}
      <ParticleSystem
        agentPositions={new Map(agents.map((a) => [a.slug, a.position]))}
      />

      {/* Phase 3: Collaboration Lines */}
      <CollaborationLines
        agents={agents.map((a) => ({
          slug: a.slug,
          position: a.position,
          mood: a.mood,
        }))}
      />

      {/* Agents */}
      {agents.map((agent) => (
        <group key={agent.slug}>
          <Agent3D
            position={agent.position}
            name={agent.name}
            emoji={agent.emoji}
            mood={agent.mood}
            energy={agent.energy}
            onClick={() => onSelectAgent(agent.slug)}
            isSelected={agent.slug === selectedAgentSlug}
          />

          {/* Phase 3: Voice Indicator */}
          {agent.mood === "collaborating" && (
            <VoiceIndicator
              position={agent.position}
              isActive={true}
              agentName={agent.name}
            />
          )}

          {/* Phase 3: Task Board - Affiche ce que l'agent fait */}
          <TaskBoard3D
            position={[
              agent.position[0],
              agent.position[1] + 2.5,
              agent.position[2],
            ]}
            agentSlug={agent.slug}
            quartier={agent.zone}
          />
        </group>
      ))}

      {/* Fog */}
      <fog attach="fog" args={["#0F172A", 50, 120]} />
    </>
  );
}
