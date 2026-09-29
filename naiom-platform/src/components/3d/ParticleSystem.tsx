import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Particle {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface ParticleSystemProps {
  agentPositions: Map<string, [number, number, number]>;
}

export function ParticleSystem({ agentPositions }: ParticleSystemProps) {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<Particle[]>([]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Random agent emits particles
      const agents = Array.from(agentPositions.entries());
      if (agents.length > 0) {
        const randomAgent = agents[Math.floor(Math.random() * agents.length)];
        const [slug, pos] = randomAgent;

        const colors = ["#10B981", "#8B5CF6", "#EC4899", "#F59E0B"];
        const color = colors[Math.floor(Math.random() * colors.length)];

        // Emit burst of particles
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const speed = 0.3 + Math.random() * 0.3;

          const particle: Particle = {
            id: `${slug}-${Date.now()}-${i}`,
            position: new THREE.Vector3(pos[0], pos[1] + 0.5, pos[2]),
            velocity: new THREE.Vector3(
              Math.cos(angle) * speed,
              0.5 + Math.random() * 0.3,
              Math.sin(angle) * speed
            ),
            life: 1,
            maxLife: 2,
            color,
            size: 0.15 + Math.random() * 0.1,
          };

          particlesRef.current.push(particle);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [agentPositions]);

  useFrame((state) => {
    // Update particles
    particlesRef.current = particlesRef.current.filter((p) => p.life > 0);

    particlesRef.current.forEach((particle) => {
      particle.position.add(particle.velocity);
      particle.velocity.y -= 0.02; // Gravity
      particle.velocity.multiplyScalar(0.98); // Air resistance
      particle.life -= 0.016; // 60 FPS
    });

    // Render particles
    if (meshRef.current && particlesRef.current.length > 0) {
      particlesRef.current.forEach((particle, idx) => {
        const matrix = new THREE.Matrix4();
        const alpha = particle.life / particle.maxLife;

        matrix.compose(
          particle.position,
          new THREE.Quaternion(),
          new THREE.Vector3(particle.size * alpha, particle.size * alpha, particle.size * alpha)
        );

        meshRef.current!.setMatrixAt(idx, matrix);
      });

      meshRef.current.instanceMatrix.needsUpdate = true;
      meshRef.current.count = Math.min(particlesRef.current.length, 1000);
    }

    setParticles([...particlesRef.current]);
  });

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[new THREE.SphereGeometry(0.1, 8, 8), undefined, 1000]}
        castShadow
      >
        <meshStandardMaterial
          color="#FFFFFF"
          emissive="#FFFFFF"
          emissiveIntensity={0.8}
          transparent
          opacity={0.8}
        />
      </instancedMesh>
    </group>
  );
}
