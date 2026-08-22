---
title: Reuse Matching Terrain Fields - Plan
type: fix
date: 2026-08-18
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Reuse Matching Terrain Fields - Plan

## Goal Capsule

- **Objective:** A terrain stroke that begins inside an existing field from the selected tileset expands that field on its current layer instead of creating another surface layer above it.
- **Authority:** The user-requested same-tileset merge behavior takes precedence, followed by the existing surface-stack and per-stroke placement conventions.
- **Execution profile:** Localized TypeScript change in the `play` workspace with regression coverage before integration edits.
- **Stop conditions:** Stop if layer reuse cannot be determined from the starting cell without changing persisted map schema or if reuse would require mutating a surface hidden beneath a different topmost field.
- **Tail ownership:** The implementation owns focused tests, type checking, linting, and build verification; unrelated working-tree changes remain untouched.

## Product Contract

### Summary

Resolve the stroke's destination from its starting cell: reuse the visible topmost field when it belongs to the selected tileset, otherwise retain the existing unique-overlay behavior.

### Problem Frame

`FloorEditorTool` currently allocates a UUID-backed surface overlay before it resolves the pointer-down tile. That new layer name then becomes the stroke target unconditionally, so starting inside a compatible field still stacks another layer above it instead of extending the field's occupancy and autotile contour.

### Requirements

- R1. A tile or shape stroke beginning on an occupied visible surface from the selected tileset reuses that surface layer.
- R2. The layer selected at pointer-down remains the target for the entire stroke so freehand and shape growth extend one field consistently.
- R3. A stroke beginning on an empty cell, a hidden surface, or a topmost field from another tileset creates a fresh UUID-backed overlay as it does today.
- R4. The change preserves current water, elevation, collision, preview, undo, and persistence behavior.

### Acceptance Examples

- AE1. Given an occupied field using the selected tileset, when drawing starts inside it and continues outside its prior boundary, then the existing layer gains the new tiles and no additional surface layer is created.
- AE2. Given a matching field below a different occupied field, when drawing starts on the top field, then the buried matching layer is not reused.
- AE3. Given a matching field that does not occupy the starting cell, when drawing starts outside it, then a new placement layer is created.

### Scope Boundaries

- Water underlays and elevation sculpting retain their specialized target-resolution paths.
- Surface layer naming and persisted `teapot:tilesetFirstGid` metadata remain unchanged.
- No global one-layer-per-tileset consolidation is introduced; reuse is decided only from the stroke's starting cell.

## Planning Contract

### Key Technical Decisions

- KTD1. Put start-cell surface resolution in `FloorEditorCatalog.ts` as a pure stack query, following the existing `findTopmostErasableLayer` and `findTopmostSurfaceLayer` pattern.
- KTD2. Inspect related visible surfaces back-to-front and stop at the first occupied surface. Reuse it only when the occupant's GID resolves to the selected tileset, preventing edits to a buried field.
- KTD3. Resolve once at pointer-down and store the result in `surfaceStrokeLayerName`; the existing preview, history, and mutation pipeline already supports writes to an existing layer without `layerJson`.

### Assumptions

- The selected base layer itself may be reused when its occupied starting tile belongs to the selected tileset; this treats an original map field and a later surface overlay consistently.
- Tileset membership is derived from the map's ordered `firstgid` ranges rather than from layer-name parsing, while overlay metadata remains a corroborating persisted convention.

## Implementation Units

### U1. Resolve the matching start surface

- **Goal:** Provide a pure resolver for the topmost occupied surface associated with the selected base layer and tileset.
- **Requirements:** R1, R3; AE1, AE2, AE3.
- **Dependencies:** None.
- **Files:**
  - `play/src/front/Phaser/Game/MapEditor/Tools/FloorEditorCatalog.ts`
  - `play/tests/front/Phaser/Game/MapEditor/FloorEditorCatalog.test.ts`
- **Approach:** Traverse visible base/overlay surfaces in render order, inspect only the starting cell, resolve its GID to a tileset range, and return a layer only when the first occupied surface matches the selected tileset.
- **Execution note:** Add failing regression cases before implementing the resolver.
- **Patterns to follow:** `findTopmostSurfaceLayer`, `flattenLayersWithVisibility`, and `getTileLayerGid` in `FloorEditorCatalog.ts`.
- **Test scenarios:**
  - Covers AE1. A matching occupied overlay is returned and can be expanded.
  - Covers AE1. A matching occupied base layer is returned when no overlay covers the cell.
  - Covers AE2. A different-tileset top surface returns no match even when a matching surface exists below it.
  - Covers AE3. An empty starting cell returns no match.
  - A hidden matching overlay is ignored in favor of the next visible occupied surface.
- **Verification:** Focused catalog tests prove stack order, visibility, occupancy, and tileset-range behavior without Phaser setup.

### U2. Pin each stroke to the resolved field or UUID fallback

- **Goal:** Use the resolver during pointer-down before tile/shape initialization and preserve the result through stroke completion.
- **Requirements:** R1, R2, R3, R4; AE1, AE2, AE3.
- **Dependencies:** U1.
- **Files:**
  - `play/src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts`
  - `play/tests/front/Phaser/Game/MapEditor/FloorEditorRendering.test.ts`
- **Approach:** Obtain the start coordinates, select an existing compatible surface when available, and mint the current UUID placement only as the fallback. Keep the selected layer in existing stroke state so both freehand and shape paths target it until pointer-up.
- **Patterns to follow:** Existing `surfaceStrokeLayerName` lifecycle, `getMissingSurfaceOverlayLayer`, and source-contract assertions around editor integration.
- **Test scenarios:**
  - Covers AE1. Pointer-down selects the matching existing layer before the first paint mutation.
  - Covers AE3. Pointer-down still prepares a unique placement layer when the resolver returns no match.
  - A shape drag and freehand stroke each retain one target layer for their full lifetime.
  - Water and elevation branches do not enter matching-surface reuse.
- **Verification:** Focused rendering-contract tests confirm the integration seam while catalog tests carry behavioral coverage.

## Verification Contract

- Run `cd play && npm test -- --run tests/front/Phaser/Game/MapEditor/FloorEditorCatalog.test.ts tests/front/Phaser/Game/MapEditor/FloorEditorRendering.test.ts` to prove the regression and integration contract.
- Run `cd play && npm run typecheck` for TypeScript correctness.
- Run `cd play && npm run lint -- src/front/Phaser/Game/MapEditor/Tools/FloorEditorCatalog.ts src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts tests/front/Phaser/Game/MapEditor/FloorEditorCatalog.test.ts tests/front/Phaser/Game/MapEditor/FloorEditorRendering.test.ts` for scoped lint coverage.
- Run `cd play && npm run build` to verify the Phaser/Svelte production bundle.

## Definition of Done

- U1 is complete when the pure resolver passes matching, empty, hidden, and different-topmost-tileset scenarios.
- U2 is complete when freehand and shape strokes reuse a matching start field while unmatched starts retain UUID-backed placement.
- Water, elevation, collision, preview, history, and persistence tests remain green.
- The focused tests, typecheck, scoped lint, and production build pass.
- The final diff contains no abandoned attempts and does not alter unrelated user changes.
