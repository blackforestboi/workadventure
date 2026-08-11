---
title: "fix: Pan the map when editing without an active selection"
date: 2026-08-11
type: fix
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

## Goal Capsule

- **Objective:** Let a user click-drag to pan the map while the floor editor has no selected brush or the entity editor has no selected entity or placement preview, while retaining normal exploration panning and selected-item edits.
- **Authority:** The user's requested interaction takes precedence; the floor editor's existing paint and undo behavior must not regress.
- **Stop conditions:** The work is complete when an intentionally deselected brush enables camera pan without a tile mutation, and a selected brush still paints/erases through its existing pointer path.
- **Tail ownership:** Do not alter unrelated, already-dirty Teapot editor work.

## Product Contract

### Summary

The floor editor will distinguish an active brush from no brush, using no brush as the explicit click-drag camera-pan state.

### Problem Frame

The normal exploration tool already owns a grab-and-drag camera interaction.
The floor editor currently assigns every valid primary drag to painting because it always retains a layer and tile GID selection.
That makes it impossible to pan the edit canvas without risking a terrain mutation.

### Requirements

- R1. Normal exploration-mode click-drag panning remains available and unchanged.
- R2. In floor edit mode, click-drag pans the camera only when there is no active layer/brush selection.
- R2a. In entity edit mode, click-drag pans only over empty map space with no selected entity or placement preview.
- R3. When a floor brush or eraser is selected, click-drag continues the existing paint stroke behavior and does not pan the camera.
- R4. The UI provides an intentional way to clear the active brush and visibly represents the resulting no-selection state.
- R5. A no-brush drag creates no preview patch, terrain history entry, or publishable map change.
- R6. Pointer listeners, camera inertia, and cursor state are cleaned up when the gesture ends or the tool is cleared.

### Scope Boundaries

- The change targets the floor editor and the entity editor's empty-selection state. Area creation retains its existing empty-drag gesture, so it is intentionally unchanged.
- The existing right-click, keyboard, zoom, persistence, undo/redo, and remote-reconciliation behavior is out of scope.
- A selected eraser is an active brush and remains a paint gesture.

## Planning Contract

### Key Technical Decisions

- KTD1. Reuse the exploration tool's camera-drag lifecycle locally in `FloorEditorTool` rather than adding a global map-editor listener. Tool-local binding preserves pointer ordering and prevents a pan from racing a paint/select handler.
- KTD2. Model no selection as an empty floor layer, leaving GID `0` available as the active eraser. This keeps erasing semantically distinct from panning.
- KTD3. Toggle the currently selected floor brush off from the sidebar and avoid automatically selecting a replacement brush on editor initialization. Users can then enter the no-brush pan state deliberately.

### Assumptions

- The user's "item" maps to the active floor-editor brush or selected entity. Area creation remains an explicit blank-drag editing gesture.
- Existing exploration-mode panning already satisfies normal-mode panning and needs regression coverage rather than a new handler.

## Implementation Units

### U1. Represent and control the no-brush floor-editor state

- **Goal:** Allow the sidebar to clear an active terrain brush and display no brush as a valid interaction state.
- **Requirements:** R2, R4.
- **Dependencies:** None.
- **Files:** `play/src/front/Components/MapEditor/FloorEditor/FloorEditor.svelte`, `play/src/front/Stores/MapEditorFloorStore.ts`, `play/src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts`.
- **Approach:** Preserve `gid: 0` as an eraser selection, use an empty selected layer for no brush, prevent default-state reconciliation from immediately restoring a brush, and make clicking the active brush clear that state. Keep button pressed state and layer controls consistent with the absence of a brush.
- **Patterns to follow:** Existing `select-brush` action dispatch and `mapEditorFloorStateStore` synchronization in the floor editor.
- **Test scenarios:** Selecting a tile activates its brush; selecting the same active tile clears the brush; selecting the eraser remains an active erase brush; state initialization with compatible layers preserves no selection instead of silently selecting a tile.
- **Verification:** The sidebar can display no active brush and selecting a brush restores painting readiness.

### U2. Route eligible edit-mode primary drags to the camera

- **Goal:** Pan the floor-editor canvas for no-brush drags and the entity-editor canvas for empty-selection drags.
- **Requirements:** R1, R2, R2a, R3, R5, R6.
- **Dependencies:** U1.
- **Files:** `play/src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts`, `play/src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts`, `play/tests/front/Phaser/Game/MapEditor/MapEditorMovementRouting.test.ts`.
- **Approach:** Add tool-local drag states mirroring `ExplorerTool`: stop existing camera inertia, scroll by pointer deltas, apply release velocity, and restore cursor/gesture state on pointer-up, game-out, and cleanup. Start Floor panning only with no brush; start Entity panning only on empty map space with no selected entity and no placement preview. Keep selected-brush painting, entity dragging/resizing, and area creation untouched.
- **Patterns to follow:** `ExplorerTool` pointer lifecycle and its listener cleanup; `FloorEditorTool` pointer event ownership and `finishPaintStroke` cleanup.
- **Test scenarios:** A selected tile or eraser continues the paint-only path; no brush starts no paint stroke and delegates movement to camera scrolling; an entity selection or placement preview prevents panning; empty Entity map space pans; release and game-out reset the pan state; source-level movement routing confirms normal exploration remains available.
- **Verification:** Focused Vitest coverage passes and a browser smoke check confirms no-brush drag pans without changing terrain while selected-brush drag paints.

## Verification Contract

| Check | Applies to | Done signal |
| --- | --- | --- |
| Focused Vitest | U1, U2 | Floor-editor interaction tests pass. |
| Play lint and formatting checks | Changed frontend files | No lint or Prettier violations. |
| Play typecheck | Changed TypeScript and Svelte code | No type errors. |
| Browser smoke test | U2 | No-brush and empty-entity drags pan; selected-brush drag paints; normal exploration still pans. |

## Definition of Done

- R1-R6 are implemented with no change to selected-brush paint/erase semantics.
- The no-brush state is reachable from the floor editor UI and does not create terrain edits while panning.
- Relevant unit tests, lint, formatting, and type checks pass.
- The diff is limited to editor input/selection surfaces and focused regression coverage.
