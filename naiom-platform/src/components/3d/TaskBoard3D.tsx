import { useState, useEffect } from "react";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { Task, getLiveTasksForAgent, getTaskProgress } from "@/lib/tasks";

interface TaskBoard3DProps {
  position: [number, number, number];
  agentSlug: string;
  quartier: string;
}

export function TaskBoard3D({ position, agentSlug, quartier }: TaskBoard3DProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);

  useEffect(() => {
    const agentTasks = getLiveTasksForAgent(agentSlug);
    setTasks(agentTasks);
    if (agentTasks.length > 0) {
      setCurrentTask(agentTasks[0]);
    }
  }, [agentSlug]);

  if (!currentTask) return null;

  const progress = getTaskProgress(currentTask);
  const progressColor =
    progress < 33 ? "#EF4444" : progress < 66 ? "#F59E0B" : "#10B981";

  return (
    <group position={position}>
      {/* Task Board - Floating Panel */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[3, 1.5]} />
        <meshStandardMaterial
          color="#1F2937"
          metalness={0.3}
          roughness={0.7}
          emissive="#1F2937"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Border */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                -1.5, 0.75, 0.01, 1.5, 0.75, 0.01, 1.5, 0.75, 0.01, 1.5,
                -0.75, 0.01, 1.5, -0.75, 0.01, -1.5, -0.75, 0.01, -1.5, -0.75,
                0.01, -1.5, 0.75, 0.01,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={progressColor} linewidth={2} />
      </lineSegments>

      {/* Task Title */}
      <Text
        position={[-1.3, 0.5, 0.05]}
        fontSize={0.25}
        color="#FFFFFF"
        anchorX="left"
        anchorY="top"
        maxWidth={2.4}
        fontWeight="bold"
      >
        {currentTask.title}
      </Text>

      {/* Progress Bar Background */}
      <mesh position={[-1.3, 0.1, 0.02]}>
        <planeGeometry args={[2.5, 0.2]} />
        <meshStandardMaterial color="#374151" />
      </mesh>

      {/* Progress Bar Fill */}
      <mesh
        position={[
          -1.3 + (progress / 100) * 1.25 - 1.25,
          0.1,
          0.03,
        ]}
      >
        <planeGeometry args={[(progress / 100) * 2.5, 0.2]} />
        <meshStandardMaterial
          color={progressColor}
          emissive={progressColor}
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Progress Percentage */}
      <Text
        position={[1.2, 0.1, 0.05]}
        fontSize={0.2}
        color="#FFFFFF"
        anchorX="right"
        anchorY="middle"
        fontWeight="bold"
      >
        {progress}%
      </Text>

      {/* Status */}
      <Text
        position={[-1.3, -0.35, 0.05]}
        fontSize={0.15}
        color="#9CA3AF"
        anchorX="left"
        anchorY="middle"
      >
        Status: {currentTask.status === "in_progress" ? "🟢 EN COURS" : "✅ COMPLÉTÉ"}
      </Text>

      {/* Glow Light */}
      <pointLight
        position={[0, 0, 0.5]}
        color={progressColor}
        intensity={0.4}
        distance={4}
      />
    </group>
  );
}
