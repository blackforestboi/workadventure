---
title: Terrain family explorer and shape drawing
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Terrain family explorer and shape drawing

## Goal Capsule

Turn the flat terrain tile list into a two-level explorer of coherent terrain families. A user chooses a named terrain, sees only compatible tiles arranged like their source field, and can either paint one tile or drag a rectangle that is automatically composed from that family's corners, edges, and center.

## Product Contract

- **R1 — Family-first browsing:** The first terrain-library level shows searchable cards with a coherent preview, name, type, and description.
- **R2 — Coherent detail:** Opening a card shows only that family's compatible tiles in source-atlas order and never mixes palette/color families.
- **R3 — Manual painting:** Clicking any detail tile keeps the existing single-tile brush behavior.
- **R4 — Shape drawing:** Families backed by authoritative Wang metadata expose `Draw shape`; dragging an inclusive rectangle selects the correct corners, edges, and fill.
- **R5 — Deterministic boundaries:** Reverse drags, one-cell-wide, one-cell-high, and one-cell rectangles produce deterministic results.
- **R6 — Editor semantics:** A completed shape drag is one immediately saved, real-time mutation and one undo step. The shape tool stays armed for another drag.
- **R7 — Compatibility:** Existing no-brush panning, erasing, manual terrain painting, embedded tileset loading, and layer selection continue to work.
- **R8 — Honest capability:** Only families with verified auto-tile metadata expose shape drawing; other classified atlas families remain manual-only.

## Planning Contract

### Key Technical Decisions

- **KTD1:** Use the fork's Wang metadata as the authority for Light dirt, Dark dirt, Meadow grass, and Water; do not infer auto-tiling from pixel colors.
- **KTD2:** Store explicit nine-slice roles in the shared terrain catalog so the editor and future map-generation/MCP consumers use the same contract.
- **KTD3:** Put rectangle normalization and nine-slice generation in a pure shared helper, independent of Phaser.
- **KTD4:** Route tile and shape choices through one discriminated pending-tileset selection so first-use tileset embedding activates the intended tool atomically.
- **KTD5:** Preview shape bounds without mutating the draft map; build and commit one rectangular patch only on pointer-up.
- **KTD6:** Keep non-Wang families available as manual families, but split verified 3-column palette bands that the current broad ranges incorrectly combine.

### Scope Boundaries

- No freehand polygon/lasso fill.
- No procedural inference for unclassified terrain families.
- No changes to object placement, collision editing, or interaction editing.
- No new AI/API-key flow.

### Applicable documented learnings

The repository contains no `CONCEPTS.md` or `docs/solutions/` entries for this area, so implementation follows current catalog/editor patterns and the authoritative Wang data in `maps/Tuto/tutoV3.json`.

## Implementation Units

### U1. Model coherent terrain families and auto-tile metadata

- **Requirements:** R1, R2, R8
- **Files:** Modify `play/src/common/Teapot/BuiltInTerrainCatalog.ts`; modify `play/tests/front/Phaser/Game/MapEditor/BuiltInTerrainCatalog.test.ts`.
- **Approach:** Add stable family IDs, descriptions, preview IDs, curated display IDs, and optional nine-slice roles. Split the known mixed palette ranges and attach exact Wang-derived roles to the four verified families.
- **Patterns to follow:** Existing catalog validation and front-service re-export.
- **Test scenarios:** Unique IDs; previews and auto-tile IDs belong to their family; exact four Wang matrices; no dirt family crosses its 3-column palette band.
- **Verification:** Catalog unit tests and TypeScript checks in final validation.

### U2. Add a pure rectangle auto-tile generator

- **Dependencies:** U1
- **Requirements:** R4, R5, R6
- **Files:** Create `play/src/common/Teapot/TerrainAutotile.ts`; create `play/tests/front/Phaser/Game/MapEditor/TerrainAutotile.test.ts`.
- **Approach:** Normalize inclusive bounds and return one row-major patch. Use center-column roles for width 1, center-row roles for height 1, and center for 1×1.
- **Test scenarios:** 1×1, 1×N, N×1, 2×2, 3×3, larger repeated centers, and reverse drag.
- **Verification:** Focused helper tests in final validation.

### U3. Add shape selection and rectangle interaction to the floor tool

- **Dependencies:** U1, U2
- **Requirements:** R3, R4, R5, R6, R7
- **Files:** Modify `play/src/front/Stores/MapEditorFloorStore.ts`; modify `play/src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts`.
- **Approach:** Add a `select-library-shape` action and visible tool mode. Generalize pending tileset activation, draw a non-mutating rectangle preview during drag, then preview/commit one patch on release. Reset shape state when selecting a tile, eraser, layer, or clearing the brush.
- **Patterns to follow:** Existing `select-library-brush` embedding flow and `AreaEditorTool` rectangle lifecycle.
- **Test scenarios:** Existing tileset and newly embedded tileset; reverse drag; repeated shapes; cancellation/clear; panning with no brush; undo receives one edit.
- **Verification:** TypeScript/lint plus helper/history coverage and browser checks in final validation.

### U4. Replace the flat picker with the family explorer

- **Dependencies:** U1, U3
- **Requirements:** R1, R2, R3, R4, R8
- **Files:** Modify `play/src/front/Components/MapEditor/FloorEditor/FloorEditor.svelte`.
- **Approach:** Render family cards first. Drill into a selected family with Back, metadata, a source-positioned tile field, manual tile controls, and Draw shape only for compatible families. Search filters the active level.
- **Patterns to follow:** Existing picker buttons, atlas CSS backgrounds, and floor action dispatch.
- **Test scenarios:** Search, drill-down/back, selected tile styling, selected shape styling, manual-only family, responsive overflow.
- **Verification:** Svelte/TypeScript checks and desktop browser QA in final validation.

## Verification Contract

- Run focused Vitest suites for catalog, auto-tiling, and floor history.
- Run the repository's relevant play workspace type/Svelte check and targeted lint command discovered from package scripts.
- In the local map editor, verify family cards, a coherent 3×3 dirt field, manual painting, Draw shape forward/reverse drag, skinny rectangles, immediate save, and Cmd+Z as one undo.
- Check that no-brush dragging still pans and manual-only families do not show Draw shape.

## Definition of Done

- The terrain sidebar opens on coherent named family cards instead of hundreds of raw cells.
- The four Wang-backed families render correct compatible tile fields and support rectangle drawing.
- A rectangle is visually previewed while dragging and committed once on release with correct nine-slice tiles.
- Single-tile painting and existing editor navigation remain functional.
- Focused tests and static checks pass, and the feature is verified in the running editor.
