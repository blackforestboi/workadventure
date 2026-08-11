---
title: Universal animated assets
date: 2026-08-12
type: feature
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: conversation
---

# Universal animated assets

## Goal Capsule

- **Objective:** Make animation an optional property of the shared visual-asset flow so tiles, terrain, map objects, generated assets, saved assets, and existing Woka sheets can use the same static-or-animated mental model.
- **Authority:** A placed asset remains one asset to the user; intrinsic frame geometry describes its source image, while placement width and height remain freely resizable display geometry.
- **Execution profile:** Cross-package schema, transport, persistence, generator, editor, and Phaser-renderer change with backward-compatible defaults.
- **Stop conditions:** Existing static entities, saved assets, tilesets, and Wokas must continue to load without migration; animation metadata must never change collision or placement dimensions.

## Product Contract

### Summary

Creators can upload, reuse, generate, place, and resize an asset without choosing a different workflow for animated content. Animation is optional metadata attached to the asset. Generic non-Woka animated raster assets use one horizontal frame strip with a frame size, frame count, and uniform duration; Woka assets retain their established directional sheet layout. Render adapters translate the same small descriptor into Phaser entity animation or Tiled tile animation.

### Requirements

- R1. Every visual asset contract can express “static” or an optional looping animation without creating separate asset kinds.
- R2. Existing assets with no animation metadata remain valid and render exactly as before.
- R3. Map objects/entities play their animation in the world, previews, and saved/reused asset flow.
- R4. Tiles and terrain export valid Tiled tile animation data and play through WorkAdventure’s existing tile animation runtime.
- R5. Intrinsic frame width/height are defaults derived from the source strip; per-placement width/height remain independently editable and scale the rendered animation.
- R6. The shared asset generator lets creators request a static asset or a short animation and previews the result as motion before acceptance.
- R7. Animation metadata survives upload, generated-asset persistence, catalog reuse, entity transport, and map persistence.
- R8. Existing directional Woka sheets continue to use their established animation contract and are represented as already animated in shared generation/persistence surfaces.
- R9. Invalid animation geometry, frame counts, or durations fail with actionable validation instead of silently rendering the wrong crop.

### Key Flows

- F1. Creator selects “Animated,” chooses/defaults to four frames and a frame duration, generates an asset, sees it animate in review, accepts it, places it, and resizes the placement without altering frame geometry.
- F2. Creator uploads a horizontal frame strip, configures animation metadata in the existing asset-edit form, previews it, uploads it, and later reuses it from saved assets with metadata intact.
- F3. Creator generates or uploads animated terrain, saves it as one terrain asset, paints with it, and the compiler/runtime emit and play the corresponding Tiled animation.
- F4. Existing object and terrain assets without animation metadata, and existing directional Woka assets, load through unchanged paths and require no new user action.

### Scope Boundaries

- In scope: one looping horizontal raster strip; entity and tile runtime adapters; generator controls and preview; persistence and transport; backward compatibility.
- Out of scope: GIF/video playback, arbitrary atlases, per-placement playback speed, event-triggered clips, non-looping state machines, skeletal animation, and changing the established directional Woka sheet layout.

## Planning Contract

### Key Technical Decisions

- KTD1. Define one optional descriptor with `frameWidth`, `frameHeight`, `frameCount`, and `frameDurationMs`. Absence means static. Animated assets contain one looping horizontal strip of two to eight frames.
- KTD2. Store source geometry only in animation metadata. Keep `WAMEntityData.width` and `height` as placement geometry so resizing scales the complete sprite and never rewrites frame dimensions.
- KTD3. Use a horizontal strip as the authoring and generation interchange format. It maps deterministically to Phaser spritesheets and to Tiled tile IDs while remaining a single uploaded asset.
- KTD4. Keep renderer-specific translation at adapters: entity loading creates a Phaser spritesheet and looping animation; tile import expands the strip into adjacent 32×32 tiles and attaches Tiled `tiles[].animation` to the first tile.
- KTD5. Propagate metadata beside the raster through shared schemas and persisted catalog provenance. Do not infer animation from a wide image, because legitimate static wide objects must stay static.
- KTD6. Keep Woka’s existing twelve-frame directional contract unchanged. It is already animated and does not need the generic map-asset descriptor.
- KTD7. Default new generic animations to four frames at 200 ms each. Defaults are editable metadata, not hard-coded placement sizes.

### Assumptions

- The first release needs one continuously looping sequence for generic map assets.
- Tile animation frames are 32×32 because WorkAdventure maps use that grid; object animation frames may use any validated positive dimensions.

## Implementation Units

### U1. Add the shared optional animation contract

- **Goal:** Give generic map asset paths one small validated descriptor for source frames and timing while leaving the existing directional Woka path unchanged.
- **Requirements:** R1, R2, R5, R8, R9.
- **Files:** `libs/map-editor/src/types.ts`, `play/src/front/Services/AssetGeneration/AssetGenerationTypes.ts`, shared tests under `libs/map-editor/tests/`.
- **Approach:** Add one reusable Zod/type definition; make entity prefab and generated candidate animation optional; expose small helpers for strip dimensions and Phaser/Tiled frame conversion. Keep absent metadata backward compatible.
- **Test scenarios:** Missing metadata parses as before; four valid frames parse; zero/negative sizes, empty frames, non-positive durations, and frames outside the strip fail; one frame normalizes to static; placement width/height are not part of the source contract.
- **Verification:** Map-editor typecheck and focused schema tests pass.

### U2. Carry animation through entity upload, editing, and persistence

- **Goal:** Preserve animation metadata from generation/upload through saved assets and map entity prefabs.
- **Requirements:** R2, R3, R5, R7, R9; flows F1, F2, F4.
- **Files:** `messages/protos/messages.proto`, generated message bindings, `play/src/front/Components/MapEditor/EntityEditor/EntityUpload/EntityUpload.svelte`, `play/src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.svelte`, upload commands/stores, map-storage custom-entity services, `play/src/front/Services/TeapotGeneratedAssetApi.ts`, `play/src/pusher/teapot/TeapotGeneratedAssetService.ts`, asset repository/provenance types and tests.
- **Approach:** Add optional JSON animation payload to upload/modify messages and entity prefabs; expose an animated toggle, frame count, duration, and live strip preview in the existing edit form; persist the metadata with catalog records and return it in list/upload APIs. Imported strips remain static until explicitly marked animated.
- **Test scenarios:** Static upload remains unchanged; animated upload validates exact strip geometry; edit/retry retains metadata; saved asset list/reuse restores it; malformed persisted metadata is rejected safely; resized placements retain animation metadata unchanged.
- **Verification:** Message generation, map-editor typecheck, upload command tests, and generated-asset service/API tests pass.

### U3. Render animated objects without changing placement behavior

- **Goal:** Play entity animation in Phaser while preserving interaction, collision, depth, outlines, drag, and resize behavior.
- **Requirements:** R2, R3, R5, R9; flows F1, F2, F4.
- **Files:** `play/src/front/Phaser/ECS/Entity.ts`, `play/src/front/Phaser/Game/GameMap/EntitiesManager.ts`, map-editor entity tools, `play/src/front/Phaser/Helpers/TexturesHelper.ts`, focused Phaser/helper tests.
- **Approach:** Load animated prefabs with `load.spritesheet`, make `Entity` sprite-capable, register a deterministic animation key, and start the loop after texture load. Continue applying `setDisplaySize` from placement data so every frame shares the placed size. Preserve the image loader for static prefabs.
- **Test scenarios:** Static entity uses the old image path; animated entity registers ordered frames and loops; two instances reuse the texture/animation safely; resize scales display dimensions while frame dimensions remain fixed; unload/reload does not duplicate or leak animation registrations.
- **Verification:** Focused renderer tests and play typecheck pass; browser smoke shows animation during placement and after reload.

### U4. Support animated terrain through Tiled-compatible tilesets

- **Goal:** Save and paint animated terrain as a single catalog asset that compiles to native Tiled animation.
- **Requirements:** R2, R4, R5, R7, R9; flows F3, F4.
- **Files:** `play/src/front/Services/AssetGeneration/TilesetRasterNormalizer.ts`, `play/src/front/Services/TeapotTilesetService.ts`, `play/src/front/Components/MapEditor/FloorEditor/FloorEditor.svelte`, pusher tileset validation/services, semantic patch compiler, related tests.
- **Approach:** Accept a 32px-high horizontal strip only when animation metadata is present; store all frames as adjacent tiles; set the first tile’s Tiled animation array; expose only the first logical tile to the terrain palette; keep the current one-tile path for static terrain.
- **Test scenarios:** Static 32×32 input remains unchanged; four-frame 128×32 input yields four tiles and one looping Tiled animation; mismatched geometry is rejected; painting uses the first GID; native WorkAdventure runtime displays all frames.
- **Verification:** Normalizer, tileset service, compiler tests, and a browser terrain smoke check pass.

### U5. Add animation generation and review to the shared generator

- **Goal:** Let each applicable generation surface request and preview a static or animated asset without a separate workflow.
- **Requirements:** R1, R6, R8, R9; flows F1, F3, F4.
- **Files:** `play/src/front/Components/AssetGeneration/AssetGenerationPanel.svelte`, `play/src/front/Services/AssetGeneration/AssetGenerationTypes.ts`, provider prompt/request tests, caller components for floor and entity assets.
- **Approach:** Add an animation option with four-frame/200 ms defaults for generic targets; request one horizontal strip with consistent subject/camera/lighting across frames; normalize to `frameWidth × frameCount` by `frameHeight`; attach metadata to the accepted asset; preview by stepping background position or canvas frames. Woka callers display their existing animated-by-contract behavior and retain staged generation.
- **Test scenarios:** Static request/prompt/output are unchanged; animated request includes strip constraints and acceptance metadata; review visibly cycles frames; object caller receives arbitrary frame geometry; terrain caller receives 32×32 frames; Woka staged generation remains valid.
- **Verification:** Asset-generation unit/component tests and browser generation-preview smoke pass.

### U6. Document and verify the universal asset behavior

- **Goal:** Make the supported format discoverable and protect cross-surface compatibility.
- **Requirements:** R1-R9.
- **Files:** `docs/map-building/tiled-editor/animations.md`, relevant editor help copy, integration/browser tests.
- **Approach:** Document horizontal strips, defaults, tile constraints, object resizing, static fallback, and Woka exception; add end-to-end fixtures covering one animated object and one animated water terrain.
- **Test scenarios:** Existing static fixture loads; animated object plays before and after placement resize/reload; animated water plays after paint/save/reload; saved catalog reuse preserves motion.
- **Verification:** Documentation links resolve and browser tests cover both renderer adapters.

## System-Wide Impact

- **Data flow:** Generator/upload → optional animation metadata → catalog provenance or entity upload message → entity/tileset prefab → Phaser/Tiled adapter → runtime loop.
- **State lifecycle:** The raster and metadata must be committed and retried together. A missing metadata record deliberately falls back to static; malformed metadata does not partially animate.
- **APIs and schemas:** Protobuf bindings and Zod schemas change additively; generated artifacts must be regenerated through repository scripts rather than hand-edited.
- **Performance:** Animated entities share texture and animation definitions by asset key. Frame count and total strip dimensions are bounded to avoid excessive GPU memory.
- **Compatibility:** Existing map JSON, entity catalogs, generated assets, and one-tile tilesets require no migration.

## Risks & Dependencies

- AI image models may not reliably produce clean frame strips. Mitigate with exact prompts, deterministic raster normalization, preview-before-acceptance, and geometry validation.
- Phaser `Image` to `Sprite` changes can regress outlines/interactions. Mitigate with focused parity tests for display size, collision, dragging, depth, and activation.
- Tile frames consume adjacent GIDs and must not appear as independent palette choices. Mitigate in the tileset adapter and palette filtering tests.
- Protobuf generation may touch broad generated files. Regenerate once with the repo script and review only the expected additive field changes.

## Verification Contract

- Run focused tests for map-editor schemas, entity upload/resize, asset generation, tileset normalization/service/compiler, and generated-asset persistence.
- Run package typechecks for `libs/map-editor`, `messages`, `play`, and affected server packages.
- Run `npm run svelte-check`, `npm run lint`, and `npm run pretty-check` from `play/`.
- Run browser checks for an animated object and animated terrain, including resize and reload; also verify one existing static fixture.

## Definition of Done

- A creator can generate or upload one generic asset as static or animated, preview it, accept it, save/reuse it, place it, and resize it.
- Animated objects and animated terrain visibly loop in WorkAdventure through their native renderer adapters.
- Intrinsic frame dimensions remain unchanged when a placement is resized.
- Static assets and existing Woka animation behavior remain backward compatible.
- Invalid animation metadata produces an actionable error, relevant automated/browser checks pass, and the format is documented.
