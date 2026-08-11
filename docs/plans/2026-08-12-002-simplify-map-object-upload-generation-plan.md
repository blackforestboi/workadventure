---
title: Simplify map object upload and AI generation
date: 2026-08-12
type: feature
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# Simplify map object upload and AI generation

## Goal Capsule

- **Objective:** Reduce the “Add object to your map” screen to a clear upload dropzone followed by a compact AI generation form.
- **Authority:** The supplied screenshot and requested layout take precedence; existing upload and generation behavior must remain intact.
- **Execution profile:** Localized Svelte UI change with smoke-first verification.
- **Stop conditions:** Do not alter generation providers, review/approval behavior, saved asset behavior, or other consumers of the shared generation panel.

## Product Contract

### Summary

The screen should present only the controls needed to upload an image or generate one with AI, without explanatory copy, reference-image controls, status decoration, or nested card chrome.

### Problem Frame

The current screen visually nests a large upload container and a second large generation card. Redundant headings, guidance, lifecycle state, and reference-file controls make a simple choice feel complex and consume most of the vertical space.

### Requirements

- R1. Remove the “Add your image” heading and upload guidance while preserving the drag-and-drop/file-picker dropzone.
- R2. Show a smaller “Generate with AI” section heading directly below the dropzone.
- R3. Show the prompt field without an enclosing generation card or outer screen container styling.
- R4. Hide reference-image controls and lifecycle decoration for map-object generation.
- R5. Place “AI settings” at the lower left and “Generate” at the lower right of the AI form.
- R6. Preserve upload handling, AI settings access, generation review/approval, error states, and generated-asset acceptance.
- R7. Keep the shared generation panel's existing presentation for other callers.

### Scope Boundaries

- In scope: the map-object upload screen and a caller-selectable compact presentation for the shared AI generation panel.
- Out of scope: provider settings, generation prompts, pricing approval flow, saved assets, floor generation, avatar generation, and Teapot proposal generation.

## Planning Contract

### Key Technical Decisions

- KTD1. Add explicit presentation props to `AssetGenerationPanel.svelte` instead of globally restyling it, because the component is shared by floor, avatar/proposal, and map-object flows.
- KTD2. Keep the hidden native upload input and label-backed dropzone so file-picker and drag-and-drop behavior remain unchanged while visible copy is simplified.
- KTD3. Hide optional reference input only for the environment-object caller; the underlying reference collection remains available for flows that require it.
- KTD4. Keep the existing paid-generation review step behind the newly labeled “Generate” button.

### Assumptions

- “Remove all container styles” applies to the outer `EntityUpload` content wrapper and the `AssetGenerationPanel` card on this screen, not to functional review/error/candidate states that appear after interaction.
- The dropzone may retain its dashed border and subtle background because the user explicitly requested a drag-and-drop field.

## Implementation Units

### U1. Add a compact shared-panel presentation

- **Goal:** Allow a caller to render the AI prompt and actions without card chrome, guidance, lifecycle badge, or reference controls.
- **Requirements:** R2, R3, R4, R5, R6, R7.
- **Files:** `play/src/front/Components/AssetGeneration/AssetGenerationPanel.svelte`.
- **Approach:** Introduce narrowly scoped props for plain presentation, reference visibility, and primary action copy. Preserve defaults so existing callers do not change. Align settings and primary actions at opposite edges only in the compact form.
- **Test scenarios:** Default callers retain the existing card, guidance, lifecycle, references, and review labels; compact environment-object mode renders only the smaller heading, prompt field, settings action, and “Generate” action; missing AI settings and generation errors remain visible.
- **Verification:** Svelte and TypeScript checks accept the new props and all call sites compile.

### U2. Simplify the map-object upload composition

- **Goal:** Match the requested minimal vertical layout on the “Add object to your map” screen.
- **Requirements:** R1, R2, R3, R4, R5, R6.
- **Files:** `play/src/front/Components/MapEditor/EntityEditor/EntityUpload/EntityUpload.svelte`.
- **Approach:** Remove the redundant upload title/description, reduce surrounding spacing/chrome, keep the dropzone as the first control, and configure the shared generation panel's compact mode beneath it.
- **Test scenarios:** Clicking or dropping a supported image still selects it; unsupported/multiple files still report errors; the AI form exposes settings and generation without references or extra cards; accepting a generated image still enters the existing object-editing flow.
- **Verification:** Visual browser smoke check at narrow/mobile width confirms the simplified hierarchy and button alignment.

## Verification Contract

- Run `npm run svelte-check` from `play/` for component and template correctness.
- Run `npm run lint` from `play/` for Svelte/TypeScript conventions.
- Run `npm run pretty-check` from `play/` for formatting.
- Run a browser smoke check of the map editor object upload screen at the narrow viewport represented by the supplied screenshot.

## Definition of Done

- The screen shows the dropzone, a small “Generate with AI” heading, the prompt field, “AI settings,” and “Generate” in that order.
- Removed copy, lifecycle badge, reference input, native “No file chosen” text, and nested card/outer container chrome are absent from this screen.
- Upload and generation flows remain functional, while other `AssetGenerationPanel` consumers retain their current UI.
- Relevant checks pass and no abandoned implementation code remains.
