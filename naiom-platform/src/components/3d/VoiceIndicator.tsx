import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface VoiceIndicatorProps {
  position: [number, number, number];
  isActive: boolean;
  agentName: string;
}

export function VoiceIndicator({ position, isActive, agentName }: VoiceIndicatorProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const waveRef = useRef<THREE.Group>(null);
  const [waveScale, setWaveScale] = useState(1);

  useFrame((state) => {
    if (!isActive) return;

    // Pulse animation
    if (pulseRef.current) {
      const scale = 0.5 + Math.sin(state.clock.elapsedTime * 4) * 0.25;
      pulseRef.current.scale.set(scale, scale, scale);
    }

    // Wave rings
    if (waveRef.current) {
      waveRef.current.children.forEach((wave, idx) => {
        const delay = idx * 0.15;
        const waveProgress = (state.clock.elapsedTime * 2 - delay) % 1;
        const scale = 0.5 + waveProgress * 1.5;
        const opacity = Math.max(0, 1 - waveProgress);

        (wave as any).scale.set(scale, 1, scale);
        if ((wave as any).material) {
          (wave as any).material.opacity = opacity * 0.6;
        }
      });
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {isActive && (
        <>
          {/* Voice pulse core */}
          <mesh ref={pulseRef} position={[0, 1.2, 0]}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial
              color="#FF6B6B"
              emissive="#FF6B6B"
              emissiveIntensity={1}
              wireframe={false}
            />
          </mesh>

          {/* Wave rings */}
          <group ref={waveRef}>
            {[0, 1, 2].map((idx) => (
              <mesh key={`wave-${idx}`} position={[0, 1.2, 0]}>
                <torusGeometry args={[0.3, 0.05, 16, 32]} />
                <meshStandardMaterial
                  color="#FF6B6B"
                  transparent
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>

          {/* Active label */}
          <Text
            position={[0, 1.6, 0]}
            fontSize={0.2}
            color="#FF6B6B"
            anchorX="center"
            fontWeight="bold"
          >
            🎙️ LIVE
          </Text>
        </>
      )}
    </group>
  );
}
