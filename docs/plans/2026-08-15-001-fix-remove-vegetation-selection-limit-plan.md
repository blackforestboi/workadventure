---
title: "fix: Remove vegetation selection dimension limit"
date: 2026-08-15
type: fix
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Remove Vegetation Selection Dimension Limit

## Goal Capsule

- **Objective:** Allow vegetation rectangles larger than 64 by 64 tiles across browser, server-side command, and MCP authoring paths.
- **Authority:** The user's request to remove the selection limit overrides the original beta boundary; the existing 500 accepted-placement cap remains in force.
- **Stop condition:** Large rectangles plan, validate, and apply without a dimension error, while malformed rectangles and batches above 500 placements remain rejected.

## Product Contract

### Summary

Vegetation selection dimensions are no longer capped at 64 tiles. Selection geometry remains a positive tile-aligned rectangle, and a resolved batch still contains at most 500 accepted placements.

### Problem Frame

The same 64 by 64 restriction is duplicated in the planner, the batch command, and the MCP schema. Removing only one check would leave other entry points rejecting the user's selection.

### Requirements

- R1. Vegetation rectangles wider or taller than 64 tiles must be accepted for planning.
- R2. Valid resolved plans for those rectangles must be accepted by the batch command.
- R3. The MCP contract must accept those rectangles and describe the uncapped selection behavior.
- R4. The 500 accepted-placement cap, digest validation, and positive-integer rectangle validation must remain unchanged.
- R5. Current operational documentation must no longer instruct testers to expect a 64 by 64 rejection.

## Planning Contract

### Key Technical Decisions

- KTD1. Remove the dimension guards rather than replacing 64 with a larger arbitrary value. This directly implements an uncapped selection surface.
- KTD2. Preserve the placement and attempt caps. Planning therefore remains bounded independently of rectangle area.
- KTD3. Leave the original vegetation authoring plan unchanged because it is a dated decision artifact; update only current contracts and operational guidance.

### Assumptions

- Browser-created rectangles remain bounded by the map, while programmatic inputs continue to require positive integers.
- The existing wire representation already supports dimensions above 64, so generated protocol code does not need to change.

## Implementation Units

### U1. Remove planner and batch-command dimension enforcement

- **Goal:** Accept large rectangles in both plan creation and atomic application.
- **Requirements:** R1, R2, R4.
- **Dependencies:** None.
- **Files:** `libs/map-editor/src/Authoring/VegetationAuthoring.ts`, `libs/map-editor/src/Commands/Entity/CreateVegetationBatchCommand.ts`, `libs/map-editor/tests/VegetationAuthoring.test.ts`, `libs/map-editor/tests/VegetationCommands.test.ts`.
- **Approach:** Delete the shared 64-tile constant and both width/height guards. Retain the 500-placement check and add regressions using rectangles above the old boundary.
- **Patterns to follow:** Existing focused Vitest coverage in `libs/map-editor/tests/VegetationAuthoring.test.ts` and `libs/map-editor/tests/VegetationCommands.test.ts`.
- **Test scenarios:** A 65 by 65 rectangle plans successfully and produces at most 500 placements; a correctly digested plan wider than 64 applies successfully.
- **Verification:** Focused map-editor tests and package typecheck pass.

### U2. Remove the MCP contract boundary and update current guidance

- **Goal:** Keep external validation and documentation consistent with the uncapped selection behavior.
- **Requirements:** R3, R4, R5.
- **Dependencies:** U1.
- **Files:** `teapot-mcp/src/contracts/domain.ts`, `teapot-mcp/tests/contracts.test.ts`, `contrib/docker/TEAPOT_BETA_RUNBOOK.md`.
- **Approach:** Retain positive integer validation but remove the 64 maximum from rectangle dimensions, update vocabulary, flip the existing 65-tile contract regression, and revise the beta scenario.
- **Patterns to follow:** Existing Zod contracts and focused contract tests in `teapot-mcp/tests/contracts.test.ts`.
- **Test scenarios:** A fill preview with a 65-tile dimension validates successfully; the accepted-count maximum remains 500.
- **Verification:** Focused MCP contract tests and package typecheck pass; the repo contains no active 64 by 64 vegetation-limit wording outside the historical plan.

## Verification Contract

- Map-editor focused tests cover planning and command application beyond the old boundary.
- MCP focused tests cover external schema acceptance beyond the old boundary.
- Typechecking passes in both changed packages.
- Formatting checks pass for both changed packages.
- A repository search confirms active enforcement and operational wording are removed while the 500-placement cap remains.

## Definition of Done

- Rectangles above 64 by 64 are accepted by the planner, command, and MCP contract.
- Regression tests protect every removed enforcement point.
- The 500-placement cap and other integrity checks are unchanged.
- Current beta guidance reflects the new behavior.
