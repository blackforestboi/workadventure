---
title: Stop Inertial Pan on Click - Plan
type: fix
date: 2026-08-14
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Stop Inertial Pan on Click - Plan

## Goal Capsule

- **Objective:** Let a fresh primary-button press in the map editor Grab/Explore tool immediately stop an in-progress inertial camera glide.
- **Authority:** The user's requested interruption behavior governs; existing drag-to-pan, release momentum, decay, and object selection behavior remain authoritative.
- **Stop conditions:** Do not change momentum strength, the drag threshold, non-primary-button behavior, or other editor tools.

## Product Contract

### Summary

The Grab/Explore tool should retain its current throw-and-decay panning, but the user must be able to regain control immediately by pressing the map again.
A press that only stops momentum must not count as a drag or seed new momentum when released.

### Problem Frame

`ExplorerTool.pointerDownHandler` currently records a left-button pan candidate without stopping the camera.
The existing `stopSpeed()` call runs only after pointer movement crosses the four-pixel drag threshold, so a stationary second click cannot interrupt an active glide.

### Requirements

- R1. A fresh primary-button press while the Explore camera is gliding stops inertial movement immediately, without requiring pointer movement.
- R2. A press followed by a drag still begins panning only after the existing drag threshold and creates release momentum as it does today.
- R3. A click-only interruption does not create new momentum on pointer release.
- R4. Object and area selection on pointer release remains unchanged.
- R5. Non-primary-button presses do not gain new camera-cancellation behavior.

### Scope Boundaries

- Only the Grab/Explore gesture lifecycle changes.
- Camera speed calculation, decay, zoom conversion, cursor timing, and the shared camera animation implementation remain unchanged.
- Floor editor, entity editor, and normal-gameplay panning remain unchanged.

### Acceptance Examples

- AE1. Given an Explore camera gliding from a released drag, when the user presses the empty map with the primary button, then the camera stops before any further pointer movement.
- AE2. Given an Explore camera gliding, when the user presses and then drags beyond the threshold, then the old glide stops immediately, a new pan begins, and release starts the usual decaying momentum.
- AE3. Given an Explore camera gliding, when the user presses and releases without dragging, then pointer release does not restart momentum.
- AE4. Given an Explore camera gliding, when the user clicks a selectable entity or area, then the camera stops and the existing selection behavior still runs.
- AE5. Given an Explore camera gliding, when a non-primary button is pressed, then the new interruption path is not invoked.

## Planning Contract

### Key Technical Decisions

- KTD1. Use `CameraManager.stopSpeed()` at the left-button `pointerdown` seam. It is the existing centralized cancellation API, is safe when no speed animation is active, and avoids changing camera internals.
- KTD2. Relocate the existing cancellation from the drag-threshold branch instead of duplicating it. The new ordering stops old momentum on press while the existing threshold continues to govern when a press becomes a pan.
- KTD3. Preserve the current `wasPanning && pointer.velocity` release guard. A click-only interruption therefore cannot seed new inertia, while a real drag still can.
- KTD4. Extend the existing raw-source Vitest contract because this gesture lifecycle is already protected there and constructing a Phaser input runtime fixture would add unrelated rendering setup.

### Assumptions

- “Click on the map again” means a primary-button press anywhere handled by the active Explore tool, including selectable map objects; selection on release is still expected.
- Existing user changes in other map-editor files are unrelated and must remain untouched.

### Sources and Research

- `play/src/front/Phaser/Game/MapEditor/Tools/ExplorerTool.ts` owns the Explore pointer lifecycle and currently delays `stopSpeed()` until the drag threshold is crossed.
- `play/src/front/Phaser/Game/CameraManager.ts` implements inertial motion as a speed animation and exposes `stopSpeed()` as its interruption seam.
- `play/src/front/Phaser/Game/MapEditor/PanGesture.ts` defines the existing four-pixel drag threshold that remains unchanged.
- `play/tests/front/Phaser/Game/MapEditorMovementRouting.test.ts` is the established structural regression suite for map-editor camera gesture ordering.

## Implementation Units

### U1. Interrupt Explore inertia on a fresh primary-button press

- **Goal:** Stop an active camera glide as soon as a valid new Explore pan candidate begins.
- **Requirements:** R1, R2, R3, R4, R5.
- **Dependencies:** None.
- **Files:** `play/src/front/Phaser/Game/MapEditor/Tools/ExplorerTool.ts`.
- **Approach:** After confirming the press is a primary-button pan candidate, call the camera manager's existing speed-cancellation method before configuring pointer motion smoothing. Remove the later redundant cancellation from the threshold-crossing branch while leaving pan activation, cursor state, screen-delta scrolling, selection, and release velocity unchanged.
- **Patterns to follow:** Existing `ExplorerTool.clear()` cancellation and `CameraManager.stopSpeed()` lifecycle cleanup.
- **Test scenarios:** Covers AE1: primary press cancels speed before movement. Covers AE2: threshold and drag activation remain unchanged after cancellation. Covers AE3: click-only pointer-up sees no active pan and does not call release velocity. Covers AE4: pointer-up selection remains intact. Covers AE5: the primary-button guard precedes cancellation.
- **Verification:** The handler ordering expresses candidate assignment, non-primary early return, immediate speed stop, and existing motion-factor setup; no other gesture branch changes.

### U2. Protect click-to-stop ordering with a focused regression

- **Goal:** Make any future return to drag-threshold-only cancellation fail the existing map-editor movement suite.
- **Requirements:** R1, R2, R3, R5.
- **Dependencies:** U1.
- **Files:** `play/tests/front/Phaser/Game/MapEditorMovementRouting.test.ts`.
- **Approach:** Add a tightly bounded source-contract assertion for `pointerDownHandler` proving that the primary-button guard precedes `stopSpeed()` and motion-factor setup. Retain the existing assertion that panning and the grabbing cursor activate only after `hasPointerDragged()`.
- **Execution note:** Establish a red failure against the current handler before applying U1, then run the focused suite after the change.
- **Patterns to follow:** Neighboring ordered-regex assertions in `MapEditorMovementRouting.test.ts`.
- **Test scenarios:** Covers AE1 and AE5 through handler ordering. Covers AE2 and AE3 jointly with the existing drag-threshold and `wasPanning` release assertions.
- **Verification:** The new assertion fails when cancellation exists only in `pointerMoveHandler` and passes when it occurs in the guarded `pointerDownHandler`.

## Verification Contract

| Scope | Command | Done signal |
|---|---|---|
| Focused regression | `cd play && npm test -- --run tests/front/Phaser/Game/MapEditorMovementRouting.test.ts` | All map-editor movement routing assertions pass. |
| Frontend type safety | `cd play && npm run typecheck` | No TypeScript errors. |
| Frontend linting | `cd play && npm run lint` | No lint errors. |
| Frontend formatting | `cd play && npm run pretty-check` | Modified source and test files meet formatting rules. |
| Runtime smoke | In Explore mode, fling then click, fling then drag, and fling then select an object or area. | Click stops immediately; drag and release momentum still work; selection still occurs. |

## Definition of Done

- U1 and U2 meet their verification criteria.
- A primary-button press immediately stops active Explore inertia without requiring a drag.
- Drag threshold, release momentum and decay, object/area selection, and non-primary-button behavior remain unchanged.
- The implementation diff is limited to the Explore gesture and its focused regression, without overwriting unrelated working-tree changes.
