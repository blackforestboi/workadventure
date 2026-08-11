---
title: Simplify the custom image editor
date: 2026-08-12
type: feature
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# Simplify the custom image editor

## Goal Capsule

- **Objective:** Recompose the custom image editor into a compact header, a large directly editable image grid, and two clear Metadata and Positioning columns.
- **Authority:** The supplied screenshot and follow-up description define the intended hierarchy; existing save/delete/collision behavior must remain intact.
- **Execution profile:** Localized Svelte UI and interaction change with focused source and helper coverage.
- **Stop conditions:** Do not change prefab persistence schemas or map-placement sizing in this UI pass.

## Product Contract

### Summary

The editor should feel like a direct image workspace rather than a nested settings card. The image and collision grid are primary; metadata and positioning controls sit below it.

### Requirements

- R1. Show a back button and “Edit image” title at top left, with Save at top right.
- R2. Remove the filename-as-heading, explanatory subtitle, outer card chrome, and header collision action.
- R3. Give the image/collision grid the full available content width and substantially more vertical space.
- R4. Always show the collision grid; clicking any cell automatically enables collision for the asset.
- R5. Expose one clear action for removing all selected collision cells.
- R6. Present metadata below the image in a left column containing image name, tags, and depth.
- R7. Present positioning in a right column containing preview padding, collision grid size, and collision guidance.
- R8. Preserve Save, Back/Cancel, Delete, custom depth, upload flow, and collision persistence behavior.

### Scope Boundaries

- In scope: editor composition, collision activation interaction, preview padding, and collision-grid resolution in the editing session.
- Out of scope: new persisted prefab sizing fields, automatic resizing of placed map entities, image bitmap padding, and changes to generated protobuf contracts.

## Planning Contract

### Key Technical Decisions

- KTD1. Keep the existing `EntityPrefab` contract unchanged; “Grid size” controls collision-mask granularity, while “Padding” controls breathing room in the editor preview.
- KTD2. Derive the no-collision state from whether any grid cell is active instead of requiring a separate activation mode.
- KTD3. Resample the collision mask when grid size changes so existing painted areas are retained approximately rather than discarded.
- KTD4. Keep Back wired to the existing `closeForm` callback and Save wired to the existing modification callback.

### Assumptions

- This pass prototypes the requested editing experience without introducing a new persisted default placement scale; that requires a separate cross-layer prefab/message contract.
- Responsive layouts stack Metadata above Positioning on narrow screens and use two columns when space allows.

## Implementation Units

### U1. Add collision-grid resizing behavior

- **Goal:** Let users change collision-cell granularity while retaining painted regions and enabling collision directly by clicking cells.
- **Requirements:** R4, R5, R7, R8.
- **Files:** `play/src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.svelte`, `play/src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.test.ts`.
- **Approach:** Track a selectable cell size, rebuild/resample the mask against the source image, set collision active when a cell is toggled, and clear all cells through one action.
- **Test scenarios:** Clicking an initially empty cell saves a collision grid; clearing returns the asset to no-collision state; changing cell size yields the expected row/column counts and carries active regions forward; saving unchanged metadata remains compatible.
- **Verification:** Focused tests prove resize/activation semantics and Svelte checks accept the interaction bindings.

### U2. Recompose the image editor layout

- **Goal:** Match the requested header, full-width workspace, and two-column information hierarchy.
- **Requirements:** R1, R2, R3, R5, R6, R7, R8.
- **Files:** `play/src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.svelte`.
- **Approach:** Replace card/header chrome with a plain toolbar, move collision controls below the image, enlarge the workspace, and group existing inputs under Metadata and Positioning headings.
- **Test scenarios:** Both upload and existing-asset editors show Back/Edit image/Save; delete remains available only where previously supported; narrow screens stack the columns; the image and overlay stay aligned across padding/grid changes.
- **Verification:** Focused source assertions plus browser smoke inspection at narrow and desktop widths.

## Verification Contract

- Run focused Vitest coverage for the custom image editor.
- Run targeted ESLint and Prettier checks on changed files.
- Run `npm run svelte-check` and `npm run typecheck`, recording unrelated baseline failures separately.
- Run browser smoke inspection when `agent-browser` is available.

## Definition of Done

- The editor header reads “Edit image” with Back on the left and Save on the right.
- The large image grid is the primary surface and collision activates through direct cell clicks.
- Metadata and Positioning render as responsive sibling columns below the image.
- Clear collision, Delete, Back, Save, depth, tags, and name behaviors remain functional.
- Relevant focused checks pass and no unrelated worktree files are modified.
