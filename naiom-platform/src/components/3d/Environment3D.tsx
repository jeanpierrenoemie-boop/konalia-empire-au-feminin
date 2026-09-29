import { useRef } from "react";
import { Text, useTexture } from "@react-three/drei";
import * as THREE from "three";

const ZONES_3D = {
  bureau: { pos: [-15, 0, -15], label: "Bureau" },
  labo: { pos: [0, 0, -15], label: "Labo IA" },
  creative: { pos: [15, 0, -15], label: "Studio Créatif" },
  reflection: { pos: [-15, 0, 0], label: "Zone Réflexion" },
  collaboration: { pos: [0, 0, 0], label: "Espace Collab" },
  rest: { pos: [15, 0, 0], label: "Zone Détente" },
};

const ZONE_COLORS = {
  bureau: "#3B82F6",
  labo: "#10B981",
  creative: "#F59E0B",
  reflection: "#8B5CF6",
  collaboration: "#EC4899",
  rest: "#6B7280",
};

export function Environment3D() {
  const gridRef = useRef<THREE.Group>(null);

  return (
    <group ref={gridRef}>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial
          color="#1F2937"
          metalness={0.3}
          roughness={0.8}
        />
      </mesh>

      {/* Grid Pattern */}
      <gridHelper args={[60, 12]} />

      {/* Zones */}
      {Object.entries(ZONES_3D).map(([key, zone]) => {
        const color = ZONE_COLORS[key as keyof typeof ZONE_COLORS];
        return (
          <group key={key} position={zone.pos as [number, number, number]}>
            {/* Zone Floor */}
            <mesh position={[0, 0, 0]} receiveShadow>
              <boxGeometry args={[8, 0.2, 8]} />
              <meshStandardMaterial
                color={color}
                metalness={0.5}
                roughness={0.3}
                emissive={color}
                emissiveIntensity={0.2}
              />
            </mesh>

            {/* Zone Boundary */}
            <lineSegments>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  count={8}
                  array={new Float32Array([
                    -4, 0.1, -4, 4, 0.1, -4, 4, 0.1, -4, 4, 0.1, 4, 4, 0.1,
                    4, -4, 0.1, 4, -4, 0.1, 4, -4, 0.1, -4,
                  ])}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial color={color} linewidth={2} />
            </lineSegments>

            {/* Zone Label */}
            <Text
              position={[0, 0.5, -4]}
              fontSize={0.8}
              color={color}
              anchorX="center"
              anchorY="bottom"
              fontWeight="bold"
            >
              {zone.label}
            </Text>

            {/* Ambient Zone Glow */}
            <pointLight
              position={[0, 2, 0]}
              color={color}
              intensity={0.3}
              distance={15}
            />
          </group>
        );
      })}

      {/* Lighting */}
      <ambientLight intensity={0.6} />

      <directionalLight
        position={[20, 30, 20]}
        intensity={0.8}
        shadow-mapSize={[2048, 2048]}
        castShadow
      />

      <hemisphereLight
        skyColor="#9333EA"
        groundColor="#1F2937"
        intensity={0.4}
      />

      {/* Environment Info Text */}
      <Text
        position={[0, 8, -30]}
        fontSize={1.5}
        color="#FFFFFF"
        anchorX="center"
        fontWeight="bold"
      >
        🌍 Konalia World 3D
      </Text>

      <Text
        position={[0, 7, -30]}
        fontSize={0.6}
        color="#9CA3AF"
        anchorX="center"
      >
        Univers des Agents IA • Wakanda Inspired
      </Text>
    </group>
  );
}
