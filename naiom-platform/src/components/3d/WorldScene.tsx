import { useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Agent3D } from "./Agent3D";
import { Environment3D } from "./Environment3D";

interface AgentState {
  slug: string;
  name: string;
  emoji: string;
  zone: string;
  mood: "productive" | "thinking" | "collaborating" | "resting";
  energy: number;
  position: [number, number, number];
}

const ZONE_POSITIONS = {
  bureau: { x: -15, z: -15 },
  labo: { x: 0, z: -15 },
  creative: { x: 15, z: -15 },
  reflection: { x: -15, z: 0 },
  collaboration: { x: 0, z: 0 },
  rest: { x: 15, z: 0 },
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

      {/* Agents */}
      {agents.map((agent) => (
        <Agent3D
          key={agent.slug}
          position={agent.position}
          name={agent.name}
          emoji={agent.emoji}
          mood={agent.mood}
          energy={agent.energy}
          onClick={() => onSelectAgent(agent.slug)}
          isSelected={agent.slug === selectedAgentSlug}
        />
      ))}

      {/* Fog */}
      <fog attach="fog" args={["#0F172A", 50, 120]} />
    </>
  );
}

import { useRef } from "react";
import * as THREE from "three";
