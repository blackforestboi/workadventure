---
title: Shift-Accelerated Map Pan - Plan
type: feat
date: 2026-08-14
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Shift-Accelerated Map Pan - Plan

## Goal Capsule

- **Objective:** Let users hold Shift to move the map camera faster with the existing Explore keyboard navigation keys.
- **Authority:** The user's request governs accelerated navigation; current direction aliases, normal speed, zoom scaling, and pointer panning remain authoritative.
- **Stop conditions:** Do not change normal keyboard speed, diagonal normalization, pointer inertia, camera internals, or other editor tools.

## Product Contract

### Summary

Explore-mode keyboard panning should keep its current precision at normal speed and gain a temporary faster rate while Shift is held.
The modifier must work regardless of key press order and return to normal immediately when Shift is released.

### Problem Frame

`ExplorerTool.update()` currently applies one fixed movement factor for Arrow, WASD, and ZQSD navigation.
The application already teaches Shift as the standard speed-up key, but Explore's tool-local keyboard path does not consume it because normal player controls are disabled while the tool is active.

### Requirements

- R1. Holding Shift multiplies Explore keyboard pan distance by 2.5 for every existing direction key.
- R2. Without Shift, the existing `10 / zoomModifier` movement factor is unchanged.
- R3. Shift works whether it is pressed before or after a direction key and releasing it returns movement to normal while the direction remains held.
- R4. Arrow, WASD, and ZQSD aliases remain unchanged.
- R5. Existing diagonal behavior remains unchanged apart from applying the same multiplier to both active axes.
- R6. Tool switches and input-enable changes do not leave a stale speed-up state.

### Scope Boundaries

- Only Explore-tool keyboard pan speed changes.
- No shortcut copy, settings control, adjustable speed preference, or additional modifier is added.
- `CameraManager`, player movement, pointer gestures, and other map-editor tools remain unchanged.

### Acceptance Examples

- AE1. Given Explore mode and a held direction key, when Shift is pressed, then subsequent camera steps use 2.5 times the normal distance.
- AE2. Given Shift and a direction are held, when Shift is released while the direction remains held, then subsequent steps return immediately to normal distance.
- AE3. Given Shift is already held, when any Arrow, WASD, or ZQSD direction is pressed, then fast panning starts.
- AE4. Given two compatible direction keys are held, when Shift is held, then both existing axis steps use the accelerated factor.
- AE5. Given Explore mode is closed and later reopened, then acceleration reflects the current physical Shift state rather than stored tool state.

## Planning Contract

### Key Technical Decisions

- KTD1. Register Shift as a Phaser keyboard key and read its live `isDown` state during each `update()`. This supports both press orders and avoids a tool-local boolean that can become stale when keyup delivery is gated.
- KTD2. Use a named 2.5 multiplier, matching the existing Shift speed-up precedent in player movement.
- KTD3. Multiply the shared Explore movement factor before the existing direction branches. All aliases and both diagonal axes therefore inherit acceleration without duplicating logic.
- KTD4. Extend the established raw-source movement-routing regression. Constructing `ExplorerTool` as a runtime Phaser fixture would require unrelated scene, editor, store, and rendering infrastructure.

### Assumptions

- Fast navigation should use the same Shift convention and 2.5 multiplier as player movement rather than introducing a camera-specific shortcut or an ungrounded larger multiplier.
- Existing per-frame movement and diagonal magnitude are intentional and remain outside this change.

### Sources and Research

- `play/src/front/Phaser/Game/MapEditor/Tools/ExplorerTool.ts` owns tool-local Arrow/WASD/ZQSD state and the current zoom-adjusted factor.
- `play/src/front/Phaser/UserInput/UserInputManager.ts` defines Shift as `UserInputEvent.SpeedUp`.
- `play/src/front/Phaser/Player/Player.ts` applies a 2.5 multiplier for Shift-based speed-up.
- `play/src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts` and neighboring editor code read modifier state through Phaser `Key.isDown`.
- `play/tests/front/Phaser/Game/MapEditorMovementRouting.test.ts` is the existing structural regression suite for Explore camera input behavior.

## Implementation Units

### U1. Apply live Shift acceleration to Explore keyboard panning

- **Goal:** Accelerate all existing Explore direction keys while Shift is physically held.
- **Requirements:** R1, R2, R3, R4, R5, R6.
- **Dependencies:** None.
- **Files:** `play/src/front/Phaser/Game/MapEditor/Tools/ExplorerTool.ts`.
- **Approach:** Add named base-speed and speed-up constants, retain a Phaser Shift key reference, and choose the multiplier from its live `isDown` state when computing the shared zoom-adjusted movement factor. Leave directional key handlers and scroll branches unchanged.
- **Patterns to follow:** `UserInputManager` Shift registration, `Player.deduceSpeed()` multiplier, and editor-tool `Key.isDown` reads.
- **Test scenarios:** Covers AE1 and AE2 by reading Shift every update. Covers AE3 because current physical state is independent of direction-key ordering. Covers AE4 by keeping the shared factor for every direction branch. Covers AE5 by avoiding stored modifier state.
- **Verification:** Normal factor remains 10 divided by zoom modifier; Shift selects the 2.5 multiplier; existing direction aliases and scroll branches are unchanged.

### U2. Protect Shift acceleration and base-speed preservation

- **Goal:** Detect removal of Shift acceleration or accidental changes to normal Explore navigation.
- **Requirements:** R1, R2, R3, R4, R5.
- **Dependencies:** U1.
- **Files:** `play/tests/front/Phaser/Game/MapEditorMovementRouting.test.ts`.
- **Approach:** Add a focused source-contract assertion for Shift key registration, named speed constants, live `isDown` selection, zoom-adjusted factor calculation, and reuse of that factor by all four direction branches. Retain existing tests for pointer inertia and drag behavior.
- **Patterns to follow:** Neighboring ordered-regex assertions in `MapEditorMovementRouting.test.ts`.
- **Test scenarios:** Covers AE1-AE3 through live modifier selection, AE4 through factor reuse on both axes, and R4 by keeping the existing direction-handler source assertions in scope.
- **Verification:** The focused assertion passes only when normal speed stays fixed and Shift acceleration is wired through live keyboard state.

## Verification Contract

| Scope | Command | Done signal |
|---|---|---|
| Focused regression | `cd play && npm test -- --run tests/front/Phaser/Game/MapEditorMovementRouting.test.ts -t "accelerates explore keyboard panning"` | The Shift acceleration contract passes. |
| Frontend linting | `cd play && npx eslint src/front/Phaser/Game/MapEditor/Tools/ExplorerTool.ts tests/front/Phaser/Game/MapEditorMovementRouting.test.ts` | No lint errors in changed files. |
| Frontend formatting | `cd play && npx prettier --check src/front/Phaser/Game/MapEditor/Tools/ExplorerTool.ts tests/front/Phaser/Game/MapEditorMovementRouting.test.ts` | Changed files meet formatting rules. |
| Frontend build | `cd play && npm run build` | Production client build completes. |
| Runtime smoke | In Explore mode, pan normally, hold and release Shift during an axial pan, repeat with Shift held first, then repeat diagonally. While Shift is held, switch away from Explore or disable input, release Shift, restore Explore/input, and verify normal speed; repeat restoration while Shift remains physically held. | Normal speed is unchanged; Shift is clearly faster; release returns immediately to normal; aliases, diagonal movement, and lifecycle transitions reflect current physical Shift state. |

## Definition of Done

- U1 and U2 meet their verification criteria.
- Shift accelerates all existing Explore keyboard directions by 2.5 while held and never changes normal speed.
- Modifier press order, release while moving, tool re-entry, aliases, and diagonal behavior match the Product Contract.
- Pointer panning, camera inertia, other editor tools, and unrelated working-tree changes remain untouched.
- No abandoned modifier-state implementation or experimental camera logic remains in the diff.
