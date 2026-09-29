import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface Agent3DProps {
  position: [number, number, number];
  name: string;
  emoji: string;
  mood: "productive" | "thinking" | "collaborating" | "resting";
  energy: number;
  onClick: () => void;
  isSelected: boolean;
}

const MOOD_COLORS = {
  productive: "#10B981",
  thinking: "#8B5CF6",
  collaborating: "#EC4899",
  resting: "#6B7280",
};

export function Agent3D({
  position,
  name,
  emoji,
  mood,
  energy,
  onClick,
  isSelected,
}: Agent3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.005;
      if (isSelected) {
        groupRef.current.scale.lerp(new THREE.Vector3(1.3, 1.3, 1.3), 0.1);
      } else {
        groupRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
      }
    }

    if (meshRef.current) {
      const scaleY = 0.8 + (energy / 100) * 0.4;
      meshRef.current.scale.y = scaleY;
      meshRef.current.position.y = (scaleY - 1) / 2;
    }
  });

  return (
    <group ref={groupRef} position={position} onClick={onClick}>
      {/* Main Agent Body */}
      <mesh
        ref={meshRef}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <boxGeometry args={[0.4, 1, 0.4]} />
        <meshStandardMaterial
          color={MOOD_COLORS[mood]}
          emissive={MOOD_COLORS[mood]}
          emissiveIntensity={hovered || isSelected ? 0.8 : 0.3}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Head with Emoji */}
      <mesh position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial
          color={MOOD_COLORS[mood]}
          emissive={MOOD_COLORS[mood]}
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Emoji Label */}
      <Text
        position={[0, 0.7, 0.3]}
        fontSize={0.4}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {emoji}
      </Text>

      {/* Name Label */}
      <Text
        position={[0, 1.3, 0]}
        fontSize={0.15}
        color="#ffffff"
        anchorX="center"
        anchorY="bottom"
        maxWidth={1}
      >
        {name}
      </Text>

      {/* Energy Ring */}
      <mesh position={[0, 0, 0]}>
        <torusGeometry args={[0.5, 0.05, 8, 32]} />
        <meshStandardMaterial
          color={energy > 60 ? "#10B981" : energy > 30 ? "#F59E0B" : "#EF4444"}
          emissive={energy > 60 ? "#10B981" : energy > 30 ? "#F59E0B" : "#EF4444"}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Selection Halo */}
      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshStandardMaterial
            color={MOOD_COLORS[mood]}
            transparent
            opacity={0.1}
            wireframe
          />
        </mesh>
      )}

      {/* Mood Indicator */}
      <mesh position={[0, -0.6, 0]}>
        <planeGeometry args={[0.6, 0.1]} />
        <meshStandardMaterial
          color={MOOD_COLORS[mood]}
          emissive={MOOD_COLORS[mood]}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}
