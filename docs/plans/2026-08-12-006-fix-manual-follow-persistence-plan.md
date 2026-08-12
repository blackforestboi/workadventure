---
title: Manual Follow Persistence - Plan
type: fix
date: 2026-08-12
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Manual Follow Persistence - Plan

## Goal Capsule

- **Objective:** Keep an accepted follow relationship active while the follower is idle or the leader is temporarily unavailable in the local Phaser player map.
- **Authority:** The user’s request governs follow persistence; existing explicit stop controls and confirmed server-side departure cleanup remain authoritative.
- **Stop conditions:** Do not change the follow protocol, manual unfollow controls, or room/scene-disconnect cleanup.

---

## Product Contract

### Summary

An accepted follow relationship should remain linked until either participant uses an existing explicit stop-follow action or existing authoritative server and scene lifecycle cleanup ends it.
Temporary local absence of the leader avatar must stop automatic movement safely without sending a follow-abort or clearing the active relationship.

### Problem Frame

`Player.computeFollowMovement` currently treats a missing entry in `MapPlayersByKey` as a reason to emit `followAbortMessage` and set local follow state to off.
That local condition can occur independently of an intentional unfollow, so a user who is idling near their leader can be silently unbound.

### Requirements

- R1. An accepted follower remains in the active follow state when its leader is temporarily unavailable in the local Phaser player map.
- R2. While the leader is unavailable locally, the follower stops automatic movement without emitting a client follow-abort request.
- R3. Existing manual stop paths continue to emit the abort protocol and clear local follow state.
- R4. Server-driven cleanup for a real user departure, room transition, or scene shutdown remains unchanged.

### Scope Boundaries

- The follow protobuf contract and server ownership model remain unchanged.
- Reconnection semantics beyond the current server/scene lifecycle are not added.
- UI copy and the existing manual unfollow controls are unchanged.

### Acceptance Examples

- AE1. Given an active follower whose leader avatar is temporarily absent from `MapPlayersByKey`, when the game updates, then the follower remains linked and does not send a follow-abort message.
- AE2. Given an active follower whose leader avatar returns, when the game updates, then automatic following can resume without a new request.
- AE3. Given an active follow relationship, when either participant uses an existing stop-follow action, then the existing abort and UI cleanup behavior still occurs.
- AE4. Given an active follow relationship, when the server sends a follow-abort because a participant leaves, then both clients still clear their follow UI and state.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Treat a missing local avatar as a temporary movement-data condition, not as evidence that the follow relationship should end. The backend already sends the authoritative abort when a participant leaves the room.
- KTD2. Preserve the current movement guard: return zero movement while no leader sprite is available, then resume normal distance-based following once it reappears.
- KTD3. Add a focused regression test alongside Phaser game tests that protects the distinction between temporary local absence and the existing explicit/server abort flows.

### Assumptions

- The reported idle unbinding follows the existing client-side missing-avatar branch rather than an undiscovered server idle timeout; the codebase contains no follow-specific idle timer.
- Existing server abort delivery remains the source of truth for actual disconnects and must not be bypassed.

### Sources and Research

- `play/src/front/Phaser/Player/Player.ts` contains the only non-manual follow-abort branch, in `computeFollowMovement`.
- `back/src/Model/GameRoom.ts` and `back/src/Model/User.ts` detach follows when a user truly leaves, then notify both participants.
- `play/src/front/Phaser/Game/FollowManager.ts`, `play/src/front/Components/PopUp/PopUpFollow.svelte`, `play/src/front/Components/ActionBar/MenuIcons/FollowMenuItem.svelte`, and `play/src/front/Phaser/UserInput/GameSceneUserInputHandler.ts` define the manual and received-abort paths to preserve.

---

## Implementation Units

### U1. Preserve active following across temporary leader-avatar loss

- **Goal:** Remove the automatic client unbind caused solely by a missing local leader sprite.
- **Requirements:** R1, R2, R4.
- **Dependencies:** None.
- **Files:** `play/src/front/Phaser/Player/Player.ts`.
- **Approach:** Keep the existing safe no-movement result when the leader cannot be resolved from `MapPlayersByKey`, but leave the follow store and connection protocol untouched. Continue using received server abort messages and scene teardown for genuine lifecycle cleanup.
- **Patterns to follow:** Existing `FollowManager` abort-message subscription and `GameRoom.leave` lifecycle cleanup.
- **Test scenarios:** Covers AE1. A temporarily missing leader produces no movement without emitting follow abort or clearing active state. Covers AE2. A later-resolved leader still uses the existing distance-based movement calculation. Covers AE4. This change does not interfere with the existing received-abort cleanup path.
- **Verification:** The missing-player branch has no local abort side effect, and normal follow movement behavior is unchanged when a leader sprite exists.

### U2. Add follow-persistence regression coverage

- **Goal:** Make the accidental local-abort behavior detectable in the `play` Vitest suite.
- **Requirements:** R1, R2, R3, R4.
- **Dependencies:** U1.
- **Files:** `play/tests/front/Phaser/Game/FollowPersistence.test.ts`.
- **Approach:** Test the client follow-movement contract at the smallest practical Phaser seam, using existing source-contract testing only if a real Phaser player fixture cannot be created without unrelated rendering setup. Assert the absence of the automatic abort/state-reset behavior and preserve coverage of the manual/server abort boundary through the existing code path.
- **Execution note:** Prefer runtime-state assertions if the test fixture can exercise `Player`; do not assert only rendered UI.
- **Patterns to follow:** `play/tests/front/Phaser/Game/PlayerMovement.test.ts` and source-contract tests under `play/tests/front/Phaser/Game/MapEditor/`.
- **Test scenarios:** Covers AE1. A missing local leader does not initiate a follow abort. Covers AE3. Manual stop behavior remains an explicit protocol action. Covers AE4. Received server abort remains the mechanism that clears follow state.
- **Verification:** The new focused test fails against the previous automatic-abort implementation and passes once persistence is restored.

---

## Verification Contract

| Scope | Command | Done signal |
|---|---|---|
| Focused regression | `cd play && npm test -- --run tests/front/Phaser/Game/FollowPersistence.test.ts` | The persistence regression passes. |
| Frontend type safety | `cd play && npm run typecheck` | No TypeScript errors. |
| Frontend linting | `cd play && npm run lint` | No lint errors. |
| Frontend formatting | `cd play && npm run pretty-check` | Modified source and test files meet formatting rules. |

---

## Definition of Done

- U1 and U2 meet their verification criteria.
- A temporary missing leader avatar no longer sends a follow abort or clears active follow state.
- Manual stop, received abort, real room departure, and scene teardown retain their current cleanup behavior.
- No generated protocol files, unrelated map-editor edits, or abandoned experiment code are included in the implementation diff.
