---
title: Tree Visual Size Tiers - Plan
type: fix
date: 2026-08-14
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Tree Visual Size Tiers - Plan

## Goal Capsule

- **Objective:** Render newly placed trees at visible sizes of one tile, one and a half tiles, or two tiles so even the smallest tree reads at avatar scale and larger variants remain visibly larger.
- **Authority order:** The user's requested visual tiers govern behavior; current entity-prefab and Phaser placement contracts govern implementation; scoped `AGENTS.md` files govern local conventions.
- **Execution profile:** Correct the existing tree-only placement-size helper and its editor preview call site without changing asset files, generic entity sizing, collision metadata, persistence, or already resized entities.
- **Stop conditions:** Stop and surface a blocker only if guarded visible-bound extraction and a non-blocking tree fallback cannot both be implemented, or if the fix requires rewriting source images or collision grids.
- **Tail ownership:** The implementation owns focused utility coverage, call-site integration coverage, formatting, type checking, and a browser placement check when the local editor is runnable.

## Product Contract

### Summary

Tree placement will use the non-transparent pixels in each loaded tree image to select and render one of three visual size tiers. Small trees render at 32 px, medium trees at 48 px, and large trees at 64 px along their longest visible dimension while retaining their original aspect ratio.

### Problem Frame

The current tree-specific helper forces every full image canvas to a two-tile height. Built-in tree canvases contain different amounts of transparent padding, so the visible tree can still be smaller than the one-tile avatar even when its full transparent canvas is nominally two tiles tall. The same normalization also erases the intended size difference between small, medium, and large source variants.

### Requirements

- R1. A small tree's longest visible dimension renders at one 32 px map tile.
- R2. A medium tree's longest visible dimension renders at one and a half map tiles, or 48 px.
- R3. A large tree's longest visible dimension renders at two map tiles, or 64 px.
- R4. Tree scaling preserves the source image aspect ratio and includes transparent canvas margins without treating those margins as visible tree size.
- R5. Bushes, grass, other vegetation, and ordinary entity prefabs retain their current placement sizing behavior.
- R6. Placement preview dimensions remain the dimensions persisted for the newly created entity.

### Acceptance Examples

- AE1. Given the default smallest tree shown in the reported screenshot, when it is selected and placed, then its visible pixels span approximately one map tile instead of appearing smaller than the avatar.
- AE2. Given representative built-in small (`craftpix-trees-tree3`, 43 px opaque maximum), medium (`craftpix-trees-tree2`, 62 px), and large (`craftpix-trees-tree1`, 74 px) variants, when each is selected, then its longest visible dimension is 32 px, 48 px, and 64 px respectively.
- AE3. Given a non-tree prefab, when it is selected and placed, then tree-specific visible-bound normalization does not change its preview or persisted dimensions.

### Scope Boundaries

- Existing entities with explicitly stored width and height are not retroactively resized.
- Source PNG files, entity collision grids, vegetation footprints, render depth, and occlusion rules are unchanged.
- The change does not add user-configurable tree-size controls or alter custom-entity authoring metadata.

## Planning Contract

### Key Technical Decisions

- KTD1. Measure opaque texture bounds at selection time and scale the full canvas from those bounds. This fixes transparent-padding distortion while leaving source assets and collision coordinates intact.
- KTD2. Classify the longest authored opaque dimension with exact inclusive boundaries: small is at most 48 px and targets 32 px; medium is 49–64 px and targets 48 px; large is at least 65 px and targets 64 px. These boundaries separate the complete built-in tree catalog into observed ranges of 13–47 px, 49–64 px, and 67–220 px, while the default tree family provides readable characterization examples for all three bands.
- KTD3. Keep visible-bound extraction separate from the pure size calculation. The pure helper remains deterministic and unit-testable; the Phaser-facing extractor returns a safe fallback when pixel inspection is unavailable.
- KTD4. Preserve the current 64 px-height tree normalization for unreadable or invalid textures so a cross-origin or unsupported image cannot prevent placement. Only non-trees continue through the generic entity-size helper.

### Assumptions

- The built-in pixel-art assets' opaque source dimensions encode their authored relative size. The exact boundaries above were checked against all 75 built-in tree prefabs, not inferred from one family alone.
- “Tile sized” refers to the longest visible tree dimension, not the transparent source canvas or collision footprint.
- Only newly placed trees need corrected defaults; manual resizing and stored entity dimensions remain authoritative.

### Sequencing

Add characterization tests for the three visible-size bands and fallback behavior, implement the pure scaling and texture-bound extraction, connect the extractor to the existing placement preview, then run focused and package-level validation.

### Risks and Mitigations

- Reading texture pixels can fail for cross-origin images; catch the failure and retain the current safe tree fallback.
- Phaser's per-pixel alpha helper performs one canvas readback per pixel; instead, draw the selected frame once to a temporary canvas, call `getImageData` once, scan the alpha buffer, catch canvas security failures, and cache the result per texture frame.
- Incorrect band thresholds could misclassify edge assets; keep the verified 48 px and 64 px inclusive boundaries as named constants and cover values on both sides of each boundary.

## Implementation Units

### U1. Normalize trees by visible bounds

- **Goal:** Produce aspect-ratio-preserving display dimensions whose longest opaque tree dimension matches the requested small, medium, or large tile target.
- **Requirements:** R1, R2, R3, R4, R5
- **Dependencies:** None
- **Files:** `play/src/front/Utils/EntityPrefabSize.ts`, `play/tests/front/Utils/EntityPrefabSize.test.ts`
- **Approach:** Replace the fixed two-tile tree height with named 48 px and 64 px inclusive band boundaries and 32 px, 48 px, and 64 px targets. Accept visible source bounds as an input to the pure helper, classify the longest opaque dimension, scale the full natural canvas by the corresponding target-to-visible ratio, and preserve the current undefined result for non-tree categories.
- **Patterns to follow:** Keep size arithmetic in `EntityPrefabSize.ts`, use `MAP_TILE_SIZE`, return plain width/height values, and cover behavior with table-driven Vitest cases.
- **Test scenarios:**
  - Covers AE2. Representative 43 px, 62 px, and 74 px opaque bounds yield longest visible dimensions of 32 px, 48 px, and 64 px after applying the returned scale.
  - Boundary values 48/49 px and 64/65 px select the documented adjacent tiers.
  - A non-square tree canvas preserves its natural width-to-height ratio in every tier.
  - Invalid natural or visible dimensions take the safe fallback path without producing `NaN`, infinity, or blocking placement.
  - Covers AE3. Bush, grass, other, and undefined categories continue to bypass tree normalization.
- **Verification:** Focused utility tests prove all three exact tile targets, aspect-ratio preservation, boundary classification, and non-tree behavior.

### U2. Apply visible-bound sizing to the Phaser placement preview

- **Goal:** Make the preview and newly persisted tree entity use the normalized visible size.
- **Requirements:** R4, R5, R6
- **Dependencies:** U1
- **Files:** `play/src/front/Utils/EntityPrefabSize.ts`, `play/src/front/Phaser/Helpers/TexturesHelper.ts`, `play/src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts`, `play/tests/front/Utils/EntityPrefabSize.test.ts`
- **Approach:** When a prefab preview is created, draw the selected texture frame once to a temporary canvas, read one image-data buffer, scan its alpha channel, cache the visible dimensions by frame, and pass those dimensions into the pure tree-size helper. Catch unavailable/cross-origin pixel reads and use the existing 64 px-height tree normalization; retain `getEntityDisplaySize` unchanged for non-trees. Do not change the placement command, which already persists `displayWidth` and `displayHeight` from the preview.
- **Patterns to follow:** Mirror the guarded Phaser texture handling used by neighboring rendering utilities, keep browser-specific extraction out of shared map-editor schemas, and preserve the existing preview-to-create-command data flow.
- **Test scenarios:**
  - Covers AE1. A representative padded small-tree texture supplies its opaque bounds and produces a one-tile visible result.
  - Opaque-bound extraction happens during preview creation rather than on every pointer move.
  - An unreadable texture falls back without throwing and still permits tree placement.
  - Covers AE3. The call site still routes non-tree prefabs through `getEntityDisplaySize` unchanged.
- **Verification:** Focused integration assertions prove the preview calls visible-bound normalization and the placement path persists the preview's display dimensions.

## Verification Contract

| Gate             | Command                                                                                                                                                                                                                      | Done signal                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Focused behavior | `cd play && npm test -- --run tests/front/Utils/EntityPrefabSize.test.ts`                                                                                                                                                    | All tree-tier, fallback, aspect-ratio, and non-tree cases pass.                                                                         |
| Formatting       | `cd play && npx prettier --check src/front/Utils/EntityPrefabSize.ts src/front/Phaser/Helpers/TexturesHelper.ts src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts tests/front/Utils/EntityPrefabSize.test.ts` | Changed files conform to repository formatting.                                                                                         |
| Type safety      | `cd play && npm run typecheck`                                                                                                                                                                                               | No new TypeScript errors; unrelated pre-existing failures, if any, are identified separately.                                           |
| Package tests    | `cd play && npm test -- --run tests/front/Utils/EntityPrefabSize.test.ts tests/front/Phaser/Game/MapEditor/EntityRenderDepth.test.ts`                                                                                        | Sizing and adjacent tree render-depth coverage pass together.                                                                           |
| Runtime check    | Local map-editor browser placement                                                                                                                                                                                           | Representative small, medium, and large trees visibly measure about 1, 1.5, and 2 tiles and remain anchored/collidable at their trunks. |

## Definition of Done

- Small, medium, and large placed trees render at visible longest dimensions of 32 px, 48 px, and 64 px.
- Tree canvases preserve aspect ratio and transparent padding no longer makes the visible sprite undersized.
- Non-tree entity placement, collision metadata, render depth, existing entities' stored dimensions, and the persistence schema/data flow are unchanged; newly placed trees persist the corrected preview dimensions.
- Focused tests and relevant package checks pass, or any unrelated pre-existing failure is documented with evidence.
- Browser validation confirms the default small tree is no longer smaller than the one-tile avatar and larger variants scale distinctly.
- The final diff contains no abandoned experiments and does not overwrite unrelated working-tree changes.
