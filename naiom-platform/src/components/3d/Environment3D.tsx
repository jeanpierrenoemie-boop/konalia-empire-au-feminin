import { useRef } from "react";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { QUARTIER_COLORS, QUARTIER_GLOWS, AGENT_QUARTIER_MAP } from "@/lib/konalia-metaverse";

// 🌍 KONALIA METAVERSE - WAKANDA STYLE
const QUARTIERS_METAVERSE = {
  centre_ville: {
    pos: [0, 0, 0] as [number, number, number],
    label: "Centre-Ville",
    description: "✨ Résidence Noémie Avatar ✨",
    color: QUARTIER_COLORS.centre_ville,
    glow: QUARTIER_GLOWS.centre_ville,
    size: 20,
  },
  quartier_business: {
    pos: [-40, 0, -40] as [number, number, number],
    label: "Quartier Business",
    description: "⚡ Stratégie & Analyse ⚡",
    color: QUARTIER_COLORS.quartier_business,
    glow: QUARTIER_GLOWS.quartier_business,
    size: 16,
  },
  quartier_creativo: {
    pos: [40, 0, -40] as [number, number, number],
    label: "Quartier Créatif",
    description: "🎨 Design & Création 🎨",
    color: QUARTIER_COLORS.quartier_creativo,
    glow: QUARTIER_GLOWS.quartier_creativo,
    size: 16,
  },
  quartier_marketing: {
    pos: [-40, 0, 40] as [number, number, number],
    label: "Quartier Marketing",
    description: "🌿 Community & Veille 🌿",
    color: QUARTIER_COLORS.quartier_marketing,
    glow: QUARTIER_GLOWS.quartier_marketing,
    size: 16,
  },
  quartier_consulting: {
    pos: [40, 0, 40] as [number, number, number],
    label: "Quartier Consulting",
    description: "👑 Bureau clients 👑",
    color: QUARTIER_COLORS.quartier_consulting,
    glow: QUARTIER_GLOWS.quartier_consulting,
    size: 16,
  },
  quartier_gaming: {
    pos: [-20, 0, -70] as [number, number, number],
    label: "Quartier Gaming",
    description: "🎮 Connais-tu l'Afrique 🎮",
    color: QUARTIER_COLORS.quartier_gaming,
    glow: QUARTIER_GLOWS.quartier_gaming,
    size: 14,
  },
  quartier_innovation: {
    pos: [20, 0, -70] as [number, number, number],
    label: "Quartier Innovation",
    description: "🔬 R&D & Innovation 🔬",
    color: QUARTIER_COLORS.quartier_innovation,
    glow: QUARTIER_GLOWS.quartier_innovation,
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
  size,
  glow
}: {
  quartier: string;
  label: string;
  position: [number, number, number];
  description: string;
  color: string;
  size: number;
  glow?: string;
}) {
  const glowColor = glow || color;

  return (
    <group position={position}>
      {/* Quartier Floor - Metallic Wakanda Style */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[size, 0.2, size]} />
        <meshStandardMaterial
          color={color}
          metalness={0.7}
          roughness={0.2}
          emissive={glowColor}
          emissiveIntensity={0.25}
        />
      </mesh>

      {/* Glow Ring - Torus around quartier */}
      <mesh position={[0, 0.25, 0]}>
        <torusGeometry args={[size/2 + 1, 0.3, 16, 100]} />
        <meshStandardMaterial
          color={glowColor}
          emissive={glowColor}
          emissiveIntensity={0.6}
          metalness={0.6}
          roughness={0.3}
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
        <lineBasicMaterial color={glowColor} linewidth={3} />
      </lineSegments>

      {/* Decorative Pillars at Corners - Enhanced */}
      {[
        [-size/2 + 1, 0, -size/2 + 1],
        [size/2 - 1, 0, -size/2 + 1],
        [size/2 - 1, 0, size/2 - 1],
        [-size/2 + 1, 0, size/2 - 1],
      ].map((pillarPos, idx) => (
        <group key={`pillar-${idx}`} position={pillarPos as [number, number, number]}>
          <mesh>
            <cylinderGeometry args={[0.3, 0.4, 3, 8]} />
            <meshStandardMaterial
              color={color}
              emissive={glowColor}
              emissiveIntensity={0.3}
              metalness={0.6}
              roughness={0.3}
            />
          </mesh>
          <pointLight
            position={[0, 1.5, 0]}
            color={glowColor}
            intensity={0.6}
            distance={6}
          />
        </group>
      ))}

      {/* Quartier Label */}
      <Text
        position={[0, 1, -size/2 - 2]}
        fontSize={1.2}
        color={glowColor}
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
        color={glowColor}
        anchorX="center"
        anchorY="top"
      >
        {description}
      </Text>

      {/* Multiple Glow Lights for Intense Effect */}
      <pointLight
        position={[0, 3, 0]}
        color={glowColor}
        intensity={0.8}
        distance={size * 2}
      />
      <pointLight
        position={[size/3, 2, size/3]}
        color={glowColor}
        intensity={0.5}
        distance={size * 1.5}
      />
      <pointLight
        position={[-size/3, 2, -size/3]}
        color={glowColor}
        intensity={0.5}
        distance={size * 1.5}
      />
    </group>
  );
}

export function Environment3D() {
  const gridRef = useRef<THREE.Group>(null);

  return (
    <group ref={gridRef}>
      {/* Huge Ground Plane - Wakanda Dark Foundation */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color="#0A0E27"
          metalness={0.3}
          roughness={0.8}
          emissive="#0F1B3F"
          emissiveIntensity={0.1}
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
          glow={quartier.glow}
        />
      ))}

      {/* Lighting - Wakanda Ambience */}
      <ambientLight intensity={0.8} color="#1a1a3f" />

      <directionalLight
        position={[50, 50, 50]}
        intensity={1.0}
        shadow-mapSize={[4096, 4096]}
        castShadow
        color="#ffffff"
      />

      <hemisphereLight
        args={["#4A90E2", "#0A0E27", 0.6]}
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
