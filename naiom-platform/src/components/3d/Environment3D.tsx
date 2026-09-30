import { useRef } from "react";
import { Text } from "@react-three/drei";
import * as THREE from "three";

// KONALIA METAVERSE - 7 QUARTIERS PRINCIPAUX
const QUARTIERS_METAVERSE = {
  centre_ville: {
    pos: [0, 0, 0],
    label: "Centre-Ville",
    description: "Résidence Noémie Avatar",
    color: "#D4AF37",
    size: 20,
  },
  quartier_business: {
    pos: [-40, 0, -40],
    label: "Quartier Business",
    description: "Orchestrateur • Strategiste • Analyste",
    color: "#3B82F6",
    size: 16,
  },
  quartier_creativo: {
    pos: [40, 0, -40],
    label: "Quartier Créatif",
    description: "Designer • Createur_contenu • Fireflies",
    color: "#F59E0B",
    size: 16,
  },
  quartier_marketing: {
    pos: [-40, 0, 40],
    label: "Quartier Marketing",
    description: "Community Manager • Prospection • Veille",
    color: "#EC4899",
    size: 16,
  },
  quartier_consulting: {
    pos: [40, 0, 40],
    label: "Quartier Consulting",
    description: "Noémie.K • Bureau clients",
    color: "#10B981",
    size: 16,
  },
  quartier_gaming: {
    pos: [-20, 0, -70],
    label: "Quartier Gaming",
    description: "Connais-tu l'Afrique",
    color: "#8B5CF6",
    size: 14,
  },
  quartier_innovation: {
    pos: [20, 0, -70],
    label: "Quartier Innovation",
    description: "Cerveau R&D • Proposition",
    color: "#6B7280",
    size: 14,
  },
};

// ASSIGNATION AGENTS À QUARTIERS
const AGENTS_PAR_QUARTIER = {
  centre_ville: ["noémie_avatar"],
  quartier_business: ["orchestrateur", "strategiste", "analyste"],
  quartier_creativo: ["designer", "createur_contenu", "fireflies"],
  quartier_marketing: ["community_manager", "prospection", "veille"],
  quartier_consulting: ["noemie_k", "gmail"],
  quartier_gaming: ["presentateur", "proposition"],
  quartier_innovation: ["cerveau", "cv"],
};

function QuartierZone({
  quartier,
  label,
  position,
  description,
  color,
  size
}: {
  quartier: string;
  label: string;
  position: [number, number, number];
  description: string;
  color: string;
  size: number;
}) {
  return (
    <group position={position}>
      {/* Quartier Floor */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[size, 0.2, size]} />
        <meshStandardMaterial
          color={color}
          metalness={0.4}
          roughness={0.4}
          emissive={color}
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Quartier Boundary - Enhanced Border */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([
              -size/2, 0.15, -size/2, size/2, 0.15, -size/2,
              size/2, 0.15, -size/2, size/2, 0.15, size/2,
              size/2, 0.15, size/2, -size/2, 0.15, size/2,
              -size/2, 0.15, size/2, -size/2, 0.15, -size/2,
            ]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} linewidth={3} />
      </lineSegments>

      {/* Decorative Pillars at Corners */}
      {[
        [-size/2 + 1, 0, -size/2 + 1],
        [size/2 - 1, 0, -size/2 + 1],
        [size/2 - 1, 0, size/2 - 1],
        [-size/2 + 1, 0, size/2 - 1],
      ].map((pillarPos, idx) => (
        <mesh key={`pillar-${idx}`} position={pillarPos as [number, number, number]}>
          <cylinderGeometry args={[0.3, 0.4, 3, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
        </mesh>
      ))}

      {/* Quartier Label */}
      <Text
        position={[0, 1, -size/2 - 2]}
        fontSize={1.2}
        color={color}
        anchorX="center"
        anchorY="bottom"
        fontWeight="bold"
      >
        {label}
      </Text>

      {/* Description */}
      <Text
        position={[0, 0.5, -size/2 - 2]}
        fontSize={0.5}
        color="#9CA3AF"
        anchorX="center"
        anchorY="top"
      >
        {description}
      </Text>

      {/* Glow Light */}
      <pointLight
        position={[0, 3, 0]}
        color={color}
        intensity={0.4}
        distance={size * 1.5}
      />
    </group>
  );
}

export function Environment3D() {
  const gridRef = useRef<THREE.Group>(null);

  return (
    <group ref={gridRef}>
      {/* Huge Ground Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color="#0F172A"
          metalness={0.2}
          roughness={0.9}
        />
      </mesh>

      {/* Grid Pattern */}
      <gridHelper args={[200, 20]} />

      {/* QUARTIERS METAVERSE */}
      {Object.entries(QUARTIERS_METAVERSE).map(([key, quartier]) => (
        <QuartierZone
          key={key}
          quartier={key}
          label={quartier.label}
          position={quartier.pos as [number, number, number]}
          description={quartier.description}
          color={quartier.color}
          size={quartier.size}
        />
      ))}

      {/* Lighting */}
      <ambientLight intensity={0.7} />

      <directionalLight
        position={[50, 50, 50]}
        intensity={0.9}
        shadow-mapSize={[4096, 4096]}
        castShadow
      />

      <hemisphereLight
        args={["#D4AF37", "#1F2937", 0.5]}
      />

      {/* Metaverse Info - Top Center */}
      <Text
        position={[0, 15, -100]}
        fontSize={2}
        color="#D4AF37"
        anchorX="center"
        fontWeight="bold"
      >
        ✨ KONALIA METAVERSE ✨
      </Text>

      <Text
        position={[0, 13, -100]}
        fontSize={0.8}
        color="#9CA3AF"
        anchorX="center"
      >
        L'univers digital où l'IA travaille en temps réel
      </Text>

      {/* Quartiers Guide - Right Side */}
      <Text
        position={[90, 12, 0]}
        fontSize={0.7}
        color="#D4AF37"
        anchorX="left"
        fontWeight="bold"
      >
        🌍 7 QUARTIERS
      </Text>

      <Text
        position={[90, 10, 0]}
        fontSize={0.4}
        color="#9CA3AF"
        anchorX="left"
      >
        Centre-Ville • Business • Créatif
      </Text>

      <Text
        position={[90, 9, 0]}
        fontSize={0.4}
        color="#9CA3AF"
        anchorX="left"
      >
        Marketing • Consulting • Gaming
      </Text>

      <Text
        position={[90, 8, 0]}
        fontSize={0.4}
        color="#9CA3AF"
        anchorX="left"
      >
        Innovation
      </Text>
    </group>
  );
}
