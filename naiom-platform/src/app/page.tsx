import Link from "next/link";
import { redirect } from "next/navigation";
import { listAgents, ownedSlug } from "@/lib/agents";
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