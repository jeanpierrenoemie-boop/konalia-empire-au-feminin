# 🌍 NAIOM World 3D Roadmap

## Vision
Créer un métaverse/univers immersif type Sims + Wakanda où les 15 agents IA vivent, travaillent et collaborent en 3D.

## Phase 1: MVP 3D (Current) ✅
**Page:** `/world` - Version 2D interactive
- ✅ 6 zones thématiques
- ✅ 15 agents avec états/moods
- ✅ Timeline d'événements
- ✅ Statistiques en live
- ✅ Auto-simulation d'activité

## Phase 2: 3D Basic (Next) 🚀
**Technologies:** React + Three.js + Drei

### Architecture 3D
```
World 3D Scene
├── Environment
│   ├── Sol/Terrain (Wakanda-style)
│   ├── Bâtiments/Zones
│   ├── Lighting
│   └── Skybox
├── Agents
│   ├── 3D Models/Avatars
│   ├── Animation de mouvement
│   ├── Name labels
│   └── Mood indicators
└── UI Overlay
    ├── Camera controls
    ├── Agent selection
    ├── Timeline
    └── Stats
```

### Components à créer
```typescript
// src/components/3d/WorldScene.tsx
- Canvas Three.js
- Camera controls (Orbit)
- Lighting setup

// src/components/3d/Environment3D.tsx
- Terrain generation
- Zone buildings (procedural)
- Lighting effects

// src/components/3d/Agent3D.tsx
- 3D avatar (cube/sphere animated)
- Name label
- Mood indicator (color)
- Path animation

// src/hooks/useWorldSimulation.ts
- Simulation logic
- Agent movement
- Event generation
- State management
```

### Visual Style
- **Inspiration:** Wakanda (sleek, high-tech, nature-integrated)
- **Palette:** 
  - Accent: Golds (#D4AF37), Deep purples (#553399)
  - Environment: Greens (#10B981), Blues (#3B82F6)
  - UI: Dark backgrounds with neon accents

### Agent Avatars
Option 1: Gltf models (télécharger)
Option 2: Procedural (Three.js geometries)
Option 3: Emoji-based 3D text

Recommandé: Mix Option 2 + 3 (rapide à implémenter)

### Interactions 3D
- Click on agent → Panel lateral avec détails
- Drag camera (Orbit controls)
- Speed slider (simulation speed)
- Pause/Play world
- Filter by mood/zone
- Follow agent (camera POV)

## Phase 3: Enhanced 3D
- Agent-to-agent interactions visualization
- Collaboration lines/connections
- Particle effects (pour les actions)
- Sound effects (optional)
- Voice indicators pour agents actifs

## Phase 4: Multiplayer Ready
- Real-time sync (WebSockets)
- Shared world state
- Agent learning from world
- Persistent world state (DB)

---

## Implementation Plan

### Week 1: Core 3D Setup
```bash
npm install three @react-three/fiber @react-three/drei
```

1. Create `/world-3d` route
2. Setup Three.js canvas with Drei
3. Basic environment (grid, lighting)
4. Agent positioning in 3D space

### Week 2: Agent 3D Models
1. Design agent avatar style
2. Create procedural agent models
3. Add animation system
4. Implement mood indicators

### Week 3: Interactions
1. Click detection (raycasting)
2. Agent details panel
3. Camera controls
4. Timeline integration

### Week 4: Polish
1. Particle effects
2. Sound design
3. Performance optimization
4. Mobile responsiveness

---

## Quick Start (when ready)

```typescript
// src/app/world-3d/page.tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { WorldScene } from "@/components/3d/WorldScene";

export default function World3D() {
  return (
    <div className="h-screen w-full">
      <Canvas camera={{ position: [0, 20, 30] }}>
        <OrbitControls />
        <WorldScene />
      </Canvas>
    </div>
  );
}
```

---

## Performance Targets
- 60 FPS with 15 agents
- <5s load time
- <50MB bundle size

## Stretch Goals
- VR support (Meta Quest)
- Mobile AR view
- Voice chat between agents
- Procedural world generation
- Seasonal themes

---

**Status:** 🚀 Ready to start Phase 2 whenever you want!
