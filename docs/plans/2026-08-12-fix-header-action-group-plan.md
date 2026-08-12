---
title: Header Action Group Polish - Plan
type: fix
date: 2026-08-12
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Header Action Group Polish - Plan

## Goal Capsule

Keep action-bar controls visually intact at narrow widths and place Login immediately before the profile button as one joined control group.

## Product Contract

### Requirements

- R1. The visible action-bar control group preserves its rounded outer corners instead of cutting off the first control.
- R2. When login is available, Login appears directly to the left of the profile/user control.
- R3. Login and the profile/user control read as one joined container while retaining their existing interactions.

### Scope Boundaries

- Do not change authentication behavior, map-editor behavior, or the responsive action-bar visibility rules.

## Implementation Units

### U1. Join account actions and prevent clipped action-bar edges

- **Goal:** Render Login alongside Profile and allow the action-bar group to keep its visible rounded edges.
- **Requirements:** R1, R2, R3.
- **Files:** `play/src/front/Components/ActionBar/ActionBar.svelte`, `play/src/front/Components/ActionBar/MenuIcons/ProfileMenu.svelte`, `play/src/front/Stores/MenuStore.ts`.
- **Approach:** Move Login out of the independently clipped right-menu sequence and render it immediately before Profile. Make their adjacent corners join cleanly; leave the responsive wrapper able to show the group’s complete edge.
- **Test scenarios:** Logged-out layouts show Login directly before the user control; visible map-editor and Share buttons retain their complete rounded edges; logged-in layouts keep the existing user control.
- **Verification:** `cd play && npm run svelte-check && npm run pretty-check`.

## Verification Contract

| Scope | Command | Done signal |
|---|---|---|
| Frontend structure and formatting | `cd play && npm run svelte-check && npm run pretty-check` | The updated Svelte components compile and format cleanly. |

## Definition of Done

- Action-bar control edges are not visually cut off.
- Login is directly left of the user control and the two controls form one visual group.
