---
title: "feat: Render continuous elevation slopes"
date: 2026-08-13
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

## Goal Capsule

- **Objective:** Replace visible integer elevation terraces with one continuously interpolated, warped 2D surface.
- **Authority hierarchy:** The existing sparse integer height field remains canonical; mesh vertices are derived rendering data.
- **Stop conditions:** The editor overlay renders a connected smooth surface and keeps existing sculpt, sync, persistence, and history behavior. Player movement and grade-aware collision remain deferred.

## Requirements

- R1. Adjacent tile heights interpolate continuously rather than rendering fixed half-tile walls between levels.
- R2. Interpolation produces deterministic Phaser-free vertex and triangle geometry.
- R3. Phaser renders the derived geometry through `Mesh2D`, with a Graphics fallback for non-WebGL renderers.
- R4. Elevation editing, persistence, synchronization, lowering, wide brushes, and mode selection remain unchanged.
- R5. Empty terrain creates no mesh; the outer halo returns smoothly to ground height.

## Implementation Units

### U1. Derive a smooth elevation surface

- **Files:** `libs/map-editor/src/Authoring/ElevationTerrain.ts`, `libs/map-editor/tests/ElevationTerrain.test.ts`.
- **Approach:** Smoothstep-interpolate the canonical cell-center heights on a subdivided grid, add a zero-height halo, and emit indexed triangles only where the surface rises above ground.
- **Verification:** Tests cover continuity, halo, signed coordinates, deterministic topology, and adjacent height gradients.

### U2. Render the surface as a Phaser Mesh2D

- **Files:** `play/src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts`, `play/tests/front/Phaser/Game/MapEditor/FloorEditorRendering.test.ts`.
- **Approach:** Convert tile-space mesh vertices to world coordinates with interpolated vertical displacement, tint a white texture as the terrain overlay, preserve scroll/depth behavior, and remove the integer band loop.
- **Verification:** Renderer contract tests assert mesh creation and absence of integer elevation-band rendering.

## Definition of Done

- A multi-level sculpt displays as one continuous slope without the stacked layer-cake edges.
- Focused elevation geometry, editor renderer, history, and protocol tests pass.
