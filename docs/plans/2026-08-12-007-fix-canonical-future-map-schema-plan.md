---
title: "fix: enforce a canonical editor schema for future maps"
date: 2026-08-12
type: fix
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Fix: Enforce a Canonical Editor Schema for Future Maps

## Goal Capsule

Ensure every map created through the product's single new-world endpoint begins with the same editable terrain schema.

The required schema is the canonical tile-layer set `floor`, `collisions`, `walls`, `start`, and `exit`, plus the existing `floorLayer` object layer for entities.

Do not change, migrate, or normalize maps that already exist or are supplied through the generic upload path.

## Product Contract

### Requirements

- R1. Every future map created through `TeapotWorldCreationService` contains the canonical editor layers needed by Floor, Collision, Walls, Start, and Exit controls.
- R2. The created terrain controls resolve to real layers rather than becoming unavailable because a layer is absent.
- R3. New-world creation remains centered, infinite, and retains the existing dirt floor, entry, exit, WAM, and ownership behavior.
- R4. Existing and imported maps are explicitly out of scope.

### Acceptance Examples

- AE1. A newly created map has a populated `floor` layer and empty `collisions` and `walls` layers.
- AE2. Passing the new map's tile layers to the Floor Editor mode resolver yields usable Floor, Collision, Walls, Start, and Exit modes.
- AE3. The map's layer IDs and `nextlayerid` remain internally consistent after the canonical layers are added.

## Planning Contract

### Key Technical Decisions

- Treat `TeapotWorldCreationService.createBlankInfiniteWorldTemplate` as the authoritative future-map boundary: it is the sole in-product path reached from the Create World API.
- Express the invariant as an end-to-end contract test against `getTerrainModeOptions`, not only by asserting layer names. This prevents the creation template and the editor's alias rules from drifting apart.
- Preserve the current canonical collision alias, `collisions`, which is recognized by both the Floor Editor and runtime collision loader.

### Scope Boundaries

- No stored-map migration.
- No changes to generic TMJ upload behavior.
- No new map type, capability flag, or editor-side fallback for legacy documents.

## Implementation Units

### U1. Lock the future-map editor schema to the editor contract

**Goal:** Make the creation template and its test state the full canonical layer invariant for all future in-product maps.

**Requirements:** R1, R2, R3, R4; Covers AE1, AE2, AE3.

**Dependencies:** None.

**Files:** `play/src/pusher/teapot/TeapotWorldCreationService.ts`, `play/tests/pusher/TeapotWorldCreationService.test.ts`.

**Approach:** Keep the tile layers named `floor`, `collisions`, `walls`, `start`, and `exit`; use stable unique IDs and advance `nextlayerid` beyond the final layer. Strengthen the existing world-template test to feed its tile layers into the pure Floor Editor mode resolver and assert every supported map-editing mode resolves to a concrete layer.

**Patterns to follow:** `play/tests/front/Components/MapEditor/FloorEditor/FloorEditorModes.test.ts` for mode-resolution assertions; `play/tests/pusher/TeapotWorldCreationService.test.ts` for creation-template coverage.

**Test scenarios:**

- A fresh template keeps its dirt data in `floor` and initializes `collisions` and `walls` as empty cells.
- A fresh template exposes `floor`, `collisions`, `walls`, `start`, and `exit` through `getTerrainModeOptions`.
- Entry and exit tiles, centered coordinates, object layer, WAM metadata, and upload behavior retain their current contract.

**Verification:** The focused world-creation test, Floor Editor mode test, collision test, TypeScript check, and formatting check pass.

## Verification Contract

- `play/tests/pusher/TeapotWorldCreationService.test.ts` protects the product creation boundary.
- `play/tests/front/Components/MapEditor/FloorEditor/FloorEditorModes.test.ts` protects the resolver semantics.
- `play/tests/front/Phaser/Game/GameMap/AuthoringCollision.test.ts` protects the runtime `collisions` alias.
- Run `npm run typecheck` and `npm run pretty-check` from `play` after the focused tests.

## Definition of Done

- U1 is complete and the only product code/test edits are scoped to the new-world template contract.
- New maps created through the in-product Create World route expose all five terrain-editor modes without unavailable-layer tooltips.
- Existing and imported maps are unchanged.
- The verification contract passes.
