---
title: "feat: Grow terrain with a single-tile brush"
date: 2026-08-12
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

## Goal Capsule

- **Objective:** Let a user drag from anywhere inside or along the edge of a compatible terrain field and grow that field as a solid freehand core with automatically rebuilt edges and corners.
- **Stop conditions:** The gesture remains ordinary tile painting unless it begins on the selected terrain family; freehand growth preserves one undo action and never rejects a matching edge start.

## Product Contract

### Requirements

- R1. Selecting any tile of a verified terrain shape family exposes its family contour to the normal tile brush without changing its visible selection mode.
- R2. A normal paint stroke begins auto-growing when its first cell contains any GID from the selected verified terrain family, including center, edge, corner, and inner-corner tiles.
- R3. A stroke using any selected verified-family tile treats each swept cell as the family’s solid center and generates a one-tile contour around the path, so a straight one-cell core becomes three tiles wide while merging cleanly into the source field.
- R4. Edge-started strokes are accepted and expand the same connected terrain field rather than being rejected or requiring an exact-GID match.
- R5. Starting on a different family, or selecting a non-shape terrain tile, retains current raw single-tile painting behavior.
- R6. The gesture transition is immediate and cumulative: pointer-down anywhere in matching terrain activates without changing terrain; moves within it preserve the field; the first outside cell joins the solid interior, the former shared boundary becomes interior, and a new contour appears around the exposed perimeter.
- R7. Pointer sampling cannot leave gaps: every grid cell crossed between successive pointer events joins the cumulative core, including diagonal and multi-cell jumps.

## Planning Contract

### Key Technical Decisions

- KTD1. Resolve compatible terrain contours from the built-in catalog at tile-selection time and activate growth by family membership at pointer-down, not exact-GID equality.
- KTD2. Model a drag with any selected verified-family tile as a persistent family-center core plus a derived one-tile contour, using the in-progress draft as the source of truth and the existing stroke edit group as one undo action.
- KTD3. Keep logical occupancy separate from presentation roles: the shape is the existing connected terrain interior unioned with every swept core cell, while edge, corner, and inner-corner GIDs are derived output. Existing contour GIDs must never be mistaken for core or treated as an activation barrier.

## Implementation Units

### U1. Resolve a single selected tile to its verified contour family

- **Goal:** Make catalog metadata available for regular tile selection when that tile belongs to an autotile family.
- **Requirements:** R1, R5.
- **Files:** `play/src/common/Teapot/BuiltInTerrainCatalog.ts`, `play/src/front/Services/BuiltInTerrainCatalog.ts`, `play/tests/front/Phaser/Game/MapEditor/TerrainAutotile.test.ts`.
- **Approach:** Export a tile-ID lookup that returns the family’s complete contour only for verified shape-ready groups; convert it to map GIDs during embedded selection.
- **Test scenarios:** Shape-family center and edge tile IDs resolve to the same contour; ordinary catalog tiles resolve to no contour.
- **Verification:** Focused terrain/autotile tests pass.

### U2. Grow a compatible field from any matching start tile

- **Goal:** Accept a stroke beginning anywhere on the selected terrain family and expand it as a solid core with a regenerated contour.
- **Requirements:** R2, R3, R4, R5, R6, R7.
- **Dependencies:** U1.
- **Files:** `play/src/common/Teapot/TerrainAutotile.ts`, `play/src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts`, `play/tests/front/Phaser/Game/MapEditor/TerrainAutotile.test.ts`, `play/tests/front/Phaser/Game/MapEditor/FloorEditorRendering.test.ts`.
- **Approach:** At pointer-down, activate whenever the starting GID belongs to the selected family, independent of both tiles’ roles. The tool owns the gesture’s seed, previous cell, cumulative swept cells, and edit group; the pure terrain helper derives the connected logical interior and its contour from the current layer. Interpolate every crossed grid cell and add it to the persistent core. Rebuild the affected connected component so old shared edges become center tiles and the new perimeter receives outward-facing edges, convex corners, and concave inner corners. Pointer-up or game-out commits and clears the gesture as one action.
- **Test scenarios:** Cover the selected-role × starting-role matrix for center, outer-edge, corner, and inner-corner roles; pointer-down in matching terrain leaves occupancy unchanged and arms growth; moves inside preserve the field; the first outside cell creates a three-cell cross-section with a solid center and removes the old shared edge; repeated and skipped-cell pointer moves extend a gapless cumulative core horizontally, vertically, and diagonally; a 90-degree turn, reversal, edge-parallel pass, re-entry, and self-overlap produce edges facing away from the final union and inner corners at concave turns; a mismatched family remains raw paint; pointer-up and game-out each commit one grouped edit and reset gesture state.
- **Verification:** Focused tests and changed-file formatting pass.

## Verification Contract

- Run `npm test -- --run tests/front/Phaser/Game/MapEditor/TerrainAutotile.test.ts` from `play/`.
- Run the focused freehand terrain cases in `play/tests/front/Phaser/Game/MapEditor/FloorEditorRendering.test.ts`.
- Run Prettier against changed source and test files.

## Definition of Done

- A normal tile brush can “swoosh” an existing compatible field outward from any matching center or boundary tile.
- A one-cell-wide center stroke produces a solid center path with a one-cell contour on each side.
- Matching edge starts are accepted immediately and continue painting as the pointer crosses outside the original field.
- Existing raw painting and shape-drag behavior are unchanged outside that activation condition.
