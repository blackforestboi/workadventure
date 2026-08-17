---
title: Temporary Universal Editor Access - Plan
type: fix
date: 2026-08-17
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Temporary Universal Editor Access - Plan

## Goal Capsule

- **Objective:** Keep the three-endorsement rollout disabled and grant editor access to every active, signed-in player who successfully joins an in-game WAM room.
- **Authority:** The user's temporary access policy overrides stored room edit restrictions for signed-in WAM sessions only; existing suspension, view, admin, guest, and direct/MCP boundaries remain authoritative.
- **Stop conditions:** Stop if the change requires persisting new roles or grants, weakening suspended-account checks, or broadening direct/MCP access.
- **Execution profile:** A focused authorization change with regression coverage at the room-policy and WAM coordinator boundaries.
- **Tail ownership:** The dormant invitation system and durable room policies remain available for a future rollout reversal.

---

## Product Contract

### Summary

Signed-in players who enter a room through the game receive temporary editor access even when that room's stored edit policy is `specific` or `nobody`.
The existing three-endorsement entry and authoring requirement stays disabled.

### Problem Frame

Invitation admission was already disabled in commit `129c0a6a8`, but editor access is only universal when a room has no explicit edit policy or uses `everyone`.
This leaves signed-in players unable to edit rooms configured as `specific` or `nobody`, which conflicts with the temporary open-editor posture.

### Requirements

- R1. Active, signed-in players who successfully join an in-game WAM room can edit regardless of the stored room edit policy.
- R2. Pending invitation status does not block world entry or authoring while invitation enforcement remains disabled.
- R3. Suspended identities remain unable to view or edit rooms.
- R4. Guest sessions retain existing legacy and temporary-root exceptions without gaining signed-in universal editor access.
- R5. Direct HTTP, MCP, publication, and other non-WAM authoring paths retain their existing capability and room-policy checks.
- R6. View and admin policies remain unchanged.

### Acceptance Examples

- AE1. Given an active signed-in player and an edit policy of `specific` that does not name them, when the player successfully joins through the game, then the join reports editor access and subsequent WAM mutations are authorized.
- AE2. Given an active signed-in player and an edit policy of `nobody`, when the player joins through the game, then the join reports editor access and subsequent WAM mutations are authorized.
- AE3. Given a guest without an existing guest-editor exception, when the guest joins a restrictive room, then the guest does not receive editor access.
- AE4. Given a suspended signed-in identity, when it attempts to join or mutate a room, then authorization fails before any temporary override.
- AE5. Given a direct or MCP author, when a restrictive room policy applies, then existing capabilities and policy grants still determine access.

### Scope Boundaries

- Keep invitation, endorsement, and admission records and APIs intact; only their rollout enforcement remains disabled.
- Do not persist creator roles, room grants, or policy rewrites for signed-in players.
- Do not change view or admin behavior, room-policy UI, or suspension error copy.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Implement universal editing as a WAM-session authorization override, not as a persisted role or room grant, so stored policies remain ready for later reactivation.
- KTD2. Evaluate the override after active-identity validation and only for successful signed-in WAM joins, preserving suspension as the first hard boundary.
- KTD3. Require an explicit login boolean for every WAM edit context and keep it separate from broader authoring-session eligibility; legacy and temporary-root guest exceptions must not masquerade as authentication.
- KTD4. Apply the same signal at join-time capability resolution and per-command lease authorization so editor UI and durable writes cannot disagree.
- KTD5. Use the existing `MAP_EDITOR_ALLOW_ALL_USERS` runtime setting as the emergency cutoff; disabling it immediately restores durable edit-policy enforcement without re-enabling invitation admission.

### Assumptions

- The existing coordinator-backed `wam` context means an in-game websocket authoring session, whether the joined room resolves from a WAM or a direct TMJ; direct HTTP and MCP authoring remain separate contexts.
- Stored `specific` and `nobody` edit policies may remain visible while temporarily ignored for signed-in WAM sessions.
- Policy changes during a signed-in session do not revoke WAM editing until this temporary override is removed.

### Sources and Research

- `play/src/pusher/teapot/TeapotInvitationAdmissionPolicy.ts` is the single rollout switch and currently returns `false`.
- `play/src/pusher/middlewares/TeapotAuthoringMiddleware.ts` preserves suspended-account denial while skipping pending-admission denial under that switch.
- `play/src/pusher/teapot/TeapotRoomAccessService.ts` centralizes room edit authorization for both join resolution and revision leases.
- `play/src/pusher/teapot/TeapotWamRevisionCoordinator.ts` currently conflates real login with legacy and temporary-root authoring eligibility; the two signals must be separated.
- No applicable `docs/solutions/` institutional learning corpus exists in this repository.

---

## Implementation Units

### U1. Separate authenticated WAM access from guest authoring eligibility

- **Goal:** Preserve the actual signed-in state across join and mutation authorization.
- **Requirements:** R1, R3, R4, R5.
- **Dependencies:** None.
- **Files:** `play/src/pusher/teapot/TeapotWamRevisionCoordinator.ts`, `play/tests/pusher/TeapotWamRevisionCoordinator.test.ts`.
- **Approach:** Require callers to provide the real login boolean, compute broader authoring-session eligibility separately, pass only the explicit login state into WAM edit contexts, and retain legacy/admin/root exceptions through their existing explicit fields.
- **Patterns to follow:** Existing `ResolveWamJoinAccessInput` and `BeginWamMutationInput` context propagation; existing join and lease reauthorization tests.
- **Test scenarios:**
  - Covers AE1 and AE2. A signed-in player under `specific` or `nobody` receives `canEdit: true` and can acquire a WAM mutation lease.
  - Covers AE3. A non-logged-in player without an existing exception remains unable to edit a restrictive room.
  - A temporary-root guest remains allowed through the existing narrow exception.
  - Covers AE4. Suspending an identity before its next mutation causes authorization to fail.
- **Verification:** Join-time editor capability and per-command authorization agree for authenticated and guest contexts.

### U2. Grant signed-in WAM sessions temporary universal editor access

- **Goal:** Bypass stored edit policies only for active, signed-in players who successfully joined through the game.
- **Requirements:** R1, R2, R3, R4, R5, R6.
- **Dependencies:** U1.
- **Files:** `play/src/pusher/teapot/TeapotRoomAccessService.ts`, `play/src/pusher/teapot/createTeapotDataServices.ts`, `play/src/pusher/teapot/TeapotDataRuntime.ts`, `play/tests/pusher/TeapotRoomAccessService.test.ts`, `play/tests/pusher/TeapotAdmissionService.test.ts`, `play/tests/pusher/TeapotAuthoringMiddleware.test.ts`.
- **Approach:** When `MAP_EDITOR_ALLOW_ALL_USERS` is enabled, return success for an explicitly authenticated successful in-game join after active-identity validation but before durable admin/edit policy evaluation; keep direct-capability validation confined to the unchanged direct and non-WAM branches, and restore stored policy enforcement when the setting is disabled.
- **Execution note:** Characterize restrictive-policy behavior in focused tests before changing the authorization branch.
- **Patterns to follow:** Existing early returns for immutable platform, legacy admin, and temporary-root editor access; existing separation between WAM and direct contexts.
- **Test scenarios:**
  - Covers AE1. An unlisted signed-in WAM player passes `specific` mode.
  - Covers AE2. A signed-in WAM player passes `nobody` mode and remains authorized when the policy changes during the session.
  - Covers AE3. An ordinary guest remains denied by restrictive policies.
  - Covers AE4. A suspended signed-in WAM player is denied before the temporary override.
  - Covers AE5. Direct callers without required capabilities or grants remain denied; permitted direct callers remain subject to durable policy behavior.
  - Disabling `MAP_EDITOR_ALLOW_ALL_USERS` restores restrictive edit-policy enforcement for signed-in in-game sessions.
  - Pending X-authenticated identities continue to enter and author while invitation enforcement is disabled.
- **Verification:** Focused room-access, coordinator, admission, and authoring-middleware tests prove the temporary override and unchanged boundaries.

---

## Verification Contract

| Gate                        | Scope                                                                                                                                                                                                                    | Done signal              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Focused authorization tests | `play/tests/pusher/TeapotRoomAccessService.test.ts`, `play/tests/pusher/TeapotWamRevisionCoordinator.test.ts`, `play/tests/pusher/TeapotAdmissionService.test.ts`, `play/tests/pusher/TeapotAuthoringMiddleware.test.ts` | All targeted tests pass. |
| Type safety                 | `play` package typecheck                                                                                                                                                                                                 | No TypeScript errors.    |
| Lint                        | `play` package lint                                                                                                                                                                                                      | No lint errors.          |
| Formatting                  | `play` package formatting check                                                                                                                                                                                          | No formatting drift.     |

---

## Definition of Done

- The three-endorsement requirement remains disabled at world-entry and authoring boundaries.
- Every active signed-in player who successfully joins through the game receives editor capability under absent, `everyone`, `specific`, and `nobody` edit policies.
- The same player can execute WAM mutations after join without a policy mismatch.
- Suspended identities, ordinary guests, view/admin policies, and direct/MCP authorization retain their current boundaries.
- Focused tests, typecheck, lint, and formatting checks pass.
- No abandoned or duplicate authorization path remains in the diff.
