import Link from "next/link";
import { redirect } from "next/navigation";
import { ownedSlug } from "@/lib/agents";
import { countDeliverables } from "@/lib/deliverables";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Icon } from "@/components/Icon";
import { LandingNav } from "@/components/landing/LandingNav";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import {
  ShapeSphere,
  ShapePyramid,
  ShapeStar,
  ShapeBlob,
  ShapeCylinder,
  ShapeCube,
  ShapeCubeBlue,
} from "@/components/landing/Shapes";
import type { AgentMeta } from "@/lib/types";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <LandingNav />
      <main className="container mx-auto py-8">
        <h1 className="text-4xl font-bold">NAIOM</h1>
        <p className="mt-4">Your AI Employee Platform</p>
      </main>
    </div>
  );
}