---
title: "feat: Import legacy WorkAdventure map assets"
date: 2026-08-14
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Import legacy WorkAdventure map assets

## Goal Capsule

- **Objective:** Ship every historical Floor 0–2 and Lyon map image as a built-in, selectable map tilesheet without removing or rewriting the active Craftpix and wall-authoring worktree changes.
- **Authority:** The user's request to include all legacy assets; the existing map-editor catalog and collection patterns define the integration shape.
- **Stop conditions:** Do not alter unrelated uncommitted changes, and retain the original attribution and license information with the distributed assets.
- **Execution profile:** Extend the built-in floor library rather than storing legacy assets in the temporary review folder or as user-owned uploads.

---

## Product Contract

The historical WorkAdventure maps supplied 19 image files across Floor 0, Floor 1, Floor 2, and Lyon. None are currently shipped or registered in the map editor, so their walls, interior pieces, floors, signage, and street sheets cannot be selected.

### Requirements

- R1. Every legacy image from the pre-starter-kit `maps/Floor0`, `maps/Floor1`, `maps/Floor2`, and `maps/Lyon` directories is included in the Play distribution under a stable, discoverable path.
- R2. The floor editor exposes each legacy tilesheet through the built-in library and allows a user to add it to the map and paint any valid tile cell.
- R3. Legacy tilesheets remain ordinary tile-brush sources: they do not opt into terrain autotiling, terrain semantics, elevation rules, or implicit collision behavior.
- R4. The original attribution and license information is distributed with the imported files and is referenced by the catalog metadata.
- R5. Existing terrain atlases, Craftpix collections, generated/uploaded tilesets, and current uncommitted work continue to behave unchanged.
- R6. Legacy-library entries and cells are native keyboard-focusable controls with descriptive accessible names and an exposed selected state.

### Acceptance Examples

- AE1. A mapper opens the floor editor, searches for “legacy wall” or “Floor 0”, selects the corresponding tilesheet, and paints an individual wall tile into the map.
- AE2. A mapper selects a non-terrain sheet such as desks, signage, or parquet; the editor adds the correct image URL and dimensions to the map and paints the chosen cell without offering a shape/autotile control.
- AE3. A freshly created world can load the imported asset URLs from the Play distribution.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Preserve the original directory grouping below `play/public/collections/WorkAdventureLegacy/assets/` so file provenance is clear and source filenames remain stable.
- KTD2. Add a separate built-in floor-tileset catalog instead of classifying interior sheets as terrain. The existing terrain catalog remains the authority for terrain search, collision, and shape painting; the floor editor consumes the combined catalog for browsing and direct tile placement.
- KTD3. Treat each source image as a tilesheet with its real raster dimensions and 32-pixel grid. Do not split, resize, or normalize the historical source art.
- KTD4. Browse legacy sheets by their primary content type—Walls, Floors, Furniture, Signage, Decorations, and Streets—with Floor 0–2 or Lyon provenance as secondary metadata. Search aliases include the source-folder name and content terms such as `legacy wall`.
- KTD5. Retain native button semantics for library entries and cells. Accessible names identify the sheet and tile coordinate, and the existing pressed-state convention communicates selection.

### Assumptions

- The historical 19 files are the complete requested set because they are the assets present in all four legacy map folders immediately before their removal.
- Existing project licensing and the repository history authorize redistribution when the supplied attribution and license records accompany the files.

### Scope Boundaries

- In scope: static distribution, catalog registration, floor-editor selection, map image URL resolution, and tests.
- Deferred: converting sprite-sheet cells into independently placeable entity prefabs, adding semantic collision masks, or redesigning the object editor.

---

## Implementation Units

### U1. Distribute the legacy map asset collection

- **Goal:** Move the historical image set and attribution material from the repository revision that predates the starter-kit migration into a permanent Play public collection.
- **Requirements:** R1, R4.
- **Dependencies:** None.
- **Files:** `play/public/collections/WorkAdventureLegacy/assets/`, `play/public/collections/WorkAdventureLegacy/ATTRIBUTION.md`.
- **Approach:** Preserve Floor 0–2 and Lyon subdirectories, retain the original image bytes, and include the original base-asset attribution and licensing text in a collection-local record.
- **Patterns to follow:** `play/public/collections/CraftpixNature/` and `play/public/collections/CraftpixSummer/` for public collection layout.
- **Test scenarios:** Verify the expected legacy filenames are present; verify each image has a valid 32-pixel tile grid; verify attribution accompanies the files.
- **Verification:** The built public paths resolve to the original images and no source image is omitted.

### U2. Add a built-in legacy floor-tileset catalog

- **Goal:** Define stable metadata for every imported image without leaking non-terrain sheets into terrain-only APIs.
- **Requirements:** R1, R3, R4.
- **Dependencies:** U1.
- **Files:** `play/src/common/Teapot/LegacyWorkAdventureTilesetCatalog.ts`, `play/src/common/Teapot/BuiltInTerrainCatalog.ts`, `play/src/front/Services/BuiltInTerrainCatalog.ts`, `play/src/front/Phaser/Game/GameMap/TilesetImageUrl.ts`, `play/tests/front/Phaser/Game/MapEditor/BuiltInTerrainCatalog.test.ts`, `play/tests/front/Phaser/Game/GameMap/TilesetImageUrl.test.ts`.
- **Approach:** Introduce a common direct-placement tilesheet shape and a combined floor-library export. Keep terrain-specific search, shape, collision, and MCP catalogue behavior scoped to terrain atlases only. Give every legacy sheet a title, searchable tags, exact dimensions, grid geometry, source attribution reference, and a direct-tile group covering all cells.
- **Patterns to follow:** `play/src/common/Teapot/CraftpixSummerTerrainCatalog.ts` and the existing `BuiltInTerrainTileset` URL-matching contract.
- **Test scenarios:** Covers AE3. Assert all legacy sheet IDs and URLs are registered; assert dimensions, columns, rows, and tile counts match the image headers; assert terrain lookup does not classify legacy sheets as terrain; assert absolute map-storage URLs resolve to the matching legacy sheet.
- **Verification:** A legacy sheet can be embedded in a map as a valid tileset while terrain behavior remains limited to the two curated terrain atlases.

### U3. Expose legacy sheets in the floor-editor library

- **Goal:** Make every imported tilesheet searchable and directly selectable from the map editor.
- **Requirements:** R2, R3, R5, R6.
- **Dependencies:** U2.
- **Files:** `play/src/front/Components/MapEditor/FloorEditor/FloorEditor.svelte`, `play/tests/front/Components/MapEditor/FloorEditor/FloorEditorModes.test.ts`, `play/tests/front/Phaser/Game/MapEditor/FloorEditorRendering.test.ts`.
- **Approach:** Render terrain families and legacy tilesheets as distinct library entries. Group legacy entries by content type, retain Floor 0–2 or Lyon provenance in the subtitle and search index, never show the terrain-shape action, and use the same add-tileset and individual brush flow as a selected terrain cell. Reuse native buttons, existing `aria-pressed` state, and descriptive accessible labels for entry and cell selection.
- **Patterns to follow:** Existing `selectLibraryBrush`, `atlasTileStyle`, and terrain-family browsing in `FloorEditor.svelte`.
- **Test scenarios:** Covers AE1 and AE2. Assert searching `legacy wall` and `Floor 0` locates the intended sheets; selecting a tile embeds its exact image and raster dimensions; the non-terrain sheet offers tile painting but no shape mode; entry and cell buttons expose sheet/tile accessible names, keyboard focus, and selected state; existing Craftpix and LPC terrain groups still render and retain shape controls.
- **Verification:** The editor shows all legacy sheets and can paint their tile cells into an editable map without changing the current terrain workflow.

---

## Verification Contract

| Scope                      | Evidence                                                                                        | Units  |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| Legacy asset integrity     | Static image-grid and catalog tests pass for all imported files.                                | U1, U2 |
| Catalog and URL resolution | Focused Vitest catalog and tileset URL tests pass.                                              | U2     |
| Editor behavior            | Focused FloorEditor rendering and mode tests pass.                                              | U3     |
| Regression                 | Relevant Play typecheck, lint, and test commands pass without overwriting pre-existing changes. | U1–U3  |

---

## Definition of Done

- All 19 historical images are committed to the Play public distribution with attribution.
- Each sheet appears in the built-in floor library, is searchable, and supports direct cell placement.
- Legacy sheets are not reported as terrain and do not activate terrain shape or collision behavior.
- Focused catalog, URL-resolution, and floor-editor tests pass alongside the relevant package checks.
- The existing Craftpix and wall-authoring worktree changes are preserved.
