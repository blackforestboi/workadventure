---
title: "Elevation-Aware Vegetation Anchoring - Plan"
date: 2026-08-15
type: fix
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Elevation-Aware Vegetation Anchoring - Plan

## Goal Capsule

- **Objective:** Keep vegetation planted on the same rendered elevation surface that moves when terrain elevation changes.
- **Authority hierarchy:** The persisted elevation field and its interpolated sampler remain canonical; vegetation keeps ordinary 2D authored coordinates and derives only its rendered vertical offset.
- **Stop conditions:** Vegetation planning preserves a bottom-center planting anchor, placed entities use the terrain elevation at that anchor, and existing terrain sculpting, density, collision, persistence, undo, and immediate-placement behavior remain intact.
- **Execution profile:** Lightweight code fix with focused shared-library and Phaser regression coverage.

## Product Contract

### Summary

Vegetation will rise and fall with the rendered terrain because both use the same elevation-derived pixel offset at the vegetation planting point.

### Problem Frame

The terrain renderer already converts elevation into a vertical surface displacement and applies the same sampled offset to world entities. Vegetation planning currently stores its randomized ground point as the entity's top-left coordinate, so tall or wide plants later sample elevation from a different tile.

### Requirements

- R1. Increasing or decreasing terrain elevation moves vegetation by the same elevation-to-pixel function used by the surface mesh.
- R2. A vegetation placement's authored rectangle preserves its randomized bottom-center planting point regardless of sprite dimensions.
- R3. Immediately placed vegetation renders from the elevation sampled at its planting anchor.
- R4. Vegetation density, scale, collision footprint, deterministic identity, persistence, and undo semantics do not change.

### Acceptance Examples

- AE1. Given a tall tree planted at a randomized ground point, when the underlying elevation rises by one step, then the tree and surface move upward by the same half-tile pixel offset.
- AE2. Given vegetation placed on raised terrain, when the next world-object update runs, then the entity samples the elevation beneath its planting point rather than a neighboring tile.

### Scope Boundaries

- Elevation does not create, delete, scale, or regenerate vegetation.
- Navigation and collision remain on the authored 2D plane.
- Existing unrelated pointer-event edits in the floor editor remain untouched.

## Planning Contract

### Key Technical Decisions

- KTD1. Treat the planner's randomized point as the vegetation foot anchor and derive the stored top-left rectangle from the resolved display dimensions.
- KTD2. Keep vegetation on the existing immediate-placement and `Entity.setElevationOffset` paths; fix the authored rectangle so the renderer's existing bottom-center sample receives the intended planting point.

### Assumptions

- The phrase “vegetation increase” means vegetation should rise with the surface, not that higher terrain should increase vegetation density or sprite size.
- Bottom-center is the intended planting anchor because runtime elevation sampling and vegetation depth/occlusion already use the entity's feet.

## Implementation Units

### U1. Preserve the vegetation planting anchor

- **Goal:** Convert randomized ground points into authored top-left entity rectangles without moving the planting point.
- **Requirements:** R2, R4; AE1.
- **Dependencies:** None.
- **Files:** `libs/map-editor/src/Authoring/VegetationAuthoring.ts`, `libs/map-editor/tests/VegetationAuthoring.test.ts`.
- **Approach:** Resolve display dimensions first, center the entity horizontally on the randomized point, and place its bottom edge on that point. Keep spacing, footprint checks, IDs, and plan digests deterministic.
- **Patterns to follow:** Existing bottom-center sampling in `play/src/front/Phaser/Game/GameMap/ElevationRenderer.ts` and authored/rendered bounds separation in `play/src/front/Phaser/Game/MapEditor/Entities/EntityResizeMath.ts`.
- **Test scenarios:** A one-tile grass placement and a two-tile-tall tree both retain the deterministic planting point at their bottom center; repeated runs with the same seed remain identical; dimensions and placement caps remain unchanged.
- **Verification:** Shared map-editor vegetation tests prove anchor math and existing deterministic planning behavior.

## Verification Contract

| Gate | Scope | Done signal |
|---|---|---|
| Map-editor tests | `libs/map-editor/tests/VegetationAuthoring.test.ts`, `libs/map-editor/tests/ElevationTerrain.test.ts` | Anchor math, deterministic plans, and elevation sampling pass |
| Existing Play regression | `play/tests/front/Phaser/Game/MapEditor/FloorEditorRendering.test.ts` | Unchanged coverage continues to prove world entities use the terrain elevation offset |
| Static checks | `libs/map-editor` and `play` package checks for touched files | Type checking and linting report no new failures |

## Definition of Done

- U1 satisfies its named test scenarios.
- Raising elevation moves the surface and placed vegetation consistently from the same planting point.
- No density, sprite-size, collision, persistence, or undo contract changes are introduced.
- Existing user-authored pointer-event changes are preserved.
- No abandoned or duplicate elevation-offset code remains in the diff.
