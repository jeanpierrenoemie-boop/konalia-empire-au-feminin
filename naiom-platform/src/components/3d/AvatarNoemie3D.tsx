import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface AvatarNoemie3DProps {
  position: [number, number, number];
  isActive?: boolean;
  mood?: "idle" | "talking" | "celebrating" | "thinking";
  onClick?: () => void;
}

export function AvatarNoemie3D({
  position,
  isActive = false,
  mood = "idle",
  onClick,
}: AvatarNoemie3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const [time, setTime] = useState(0);

  useFrame((state) => {
    setTime(state.clock.getElapsedTime());

    if (!groupRef.current) return;

    // Animations selon le mood
    if (mood === "idle") {
      // Gentle float animation
      groupRef.current.position.y = position[1] + Math.sin(time * 1.5) * 0.3;
    } else if (mood === "talking") {
      // Head bobbing while talking
      if (headRef.current) {
        headRef.current.rotation.x = Math.sin(time * 4) * 0.1;
        headRef.current.rotation.z = Math.sin(time * 3.5) * 0.05;
      }
    } else if (mood === "celebrating") {
      // Jump animation
      groupRef.current.position.y =
        position[1] + Math.abs(Math.sin(time * 3)) * 1.2;
      if (headRef.current) {
        headRef.current.rotation.z = Math.sin(time * 3) * 0.3;
      }
    } else if (mood === "thinking") {
      // Subtle rotation
      if (headRef.current) {
        headRef.current.rotation.y = Math.sin(time * 2) * 0.15;
      }
    }

    // Always rotate slightly
    groupRef.current.rotation.y += 0.002;
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {/* Body - Golden capsule */}
      <mesh ref={bodyRef} position={[0, 0, 0]} castShadow>
        <capsuleGeometry args={[0.6, 1.8, 4, 8]} />
        <meshStandardMaterial
          color="#D4AF37"
          metalness={0.7}
          roughness={0.2}
          emissive="#D4AF37"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Head - Sphere */}
      <mesh ref={headRef} position={[0, 1.3, 0]} castShadow>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial
          color="#E8D4A0"
          metalness={0.5}
          roughness={0.3}
          emissive="#D4AF37"
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Eyes - Two small spheres */}
      <mesh position={[-0.15, 1.5, 0.45]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color="#333333"
          emissive="#D4AF37"
          emissiveIntensity={isActive ? 0.8 : 0.3}
        />
      </mesh>

      <mesh position={[0.15, 1.5, 0.45]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color="#333333"
          emissive="#D4AF37"
          emissiveIntensity={isActive ? 0.8 : 0.3}
        />
      </mesh>

      {/* Halo/Crown - Ring above head */}
      <mesh position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.7, 0.12, 16, 100]} />
        <meshStandardMaterial
          color="#D4AF37"
          metalness={0.9}
          roughness={0.1}
          emissive="#D4AF37"
          emissiveIntensity={isActive ? 1 : 0.5}
        />
      </mesh>

      {/* Active indicator - Pulsing aura */}
      {isActive && (
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[1.2, 32, 32]} />
          <meshStandardMaterial
            color="#D4AF37"
            transparent
            opacity={0.1 + Math.sin(time * 3) * 0.05}
            emissive="#D4AF37"
            emissiveIntensity={0.3}
          />
        </mesh>
      )}

      {/* Name Label */}
      <Text
        position={[0, -1.5, 0]}
        fontSize={0.6}
        color="#D4AF37"
        anchorX="center"
        anchorY="top"
        fontWeight="bold"
      >
        ✨ Noémie Avatar ✨
      </Text>

      {/* Status indicator */}
      {isActive && (
        <Text
          position={[0, -2, 0]}
          fontSize={0.3}
          color="#10B981"
          anchorX="center"
          anchorY="top"
        >
          🎙️ LIVE
        </Text>
      )}

      {/* Lights around avatar */}
      <pointLight
        position={[0, 1, 1]}
        color="#D4AF37"
        intensity={0.5}
        distance={8}
      />
      <pointLight
        position={[-1, 1, -1]}
        color="#722F37"
        intensity={0.3}
        distance={6}
      />
    </group>
  );
}
