---
title: Room-scoped editor access
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
deepened: 2026-08-11
---

# Room-scoped editor access

## Goal Capsule

Let each room's admins decide who may edit that room: everyone, only named people, or no one else. Viewing remains unchanged. The rule must be enforced by the server across live WAM edits and Teapot/MCP publications, not only by hiding editor controls in the browser.

## Product Contract

- **R1 — Per-room policy:** Every canonical map may have one editor policy: `everyone`, `specific`, or `nobody`.
- **R2 — Admin management:** Users currently carrying the room-aware `admin` tag may read and change the policy from Room settings. Platform `map.manage-any` operators remain a recovery path. Management permission does not implicitly grant content-edit permission.
- **R3 — Specific editors:** Admins may add or remove people by their exact stable WorkAdventure identifier, with an optional display label. Stored grants bind to immutable Teapot user IDs, not labels. Local deployments without a user directory may accept a typo as an inert, removable grant rather than claiming to validate that account's existence.
- **R4 — Complete enforcement:** The effective policy is checked immediately before every map mutation. Browser/WAM, TMJ publication, and MCP mutation paths cannot bypass one another.
- **R5 — Immediate revocation:** Removing an explicit editor or changing to `nobody` blocks that non-recovery-operator user's next mutation even if their existing browser or MCP session remains open.
- **R6 — Compatibility:** Rooms without a stored policy keep the current global/environment/tag behavior. Once an admin saves a room policy, that scoped policy becomes authoritative; platform `map.manage-any` remains a recovery override.
- **R7 — Unchanged viewing:** The feature does not alter room entry, viewing, visitor tracking, or admin-role assignment.

## Planning Contract

### Key Technical Decisions

- **KTD1:** Key policy records by the canonical TMJ URL already used by `teapot_map_revisions`. Resolve play-room and WAM URLs through `AdminTeapotMapUrlResolver` before any policy read or write.
- **KTD2:** Add one shared `TeapotRoomAccessService` and repository contract. Every map-specific preflight and `TeapotMapRevisionService.acquire()` use it so WAM/TMJ/MCP cannot bypass the stored policy; global MCP connection/approval prerequisites remain separate.
- **KTD3:** Keep the existing join-time `canEdit` value for UI/map-storage compatibility, but compute it from the room policy when one exists and re-check the policy in the mutation path to prevent stale-session authorization.
- **KTD4:** Treat room-admin status separately from edit permission. Revalidate the current room-aware `admin` tag on every policy-management request and do not persist it locally. Admins can always manage the policy but edit content only when the selected mode grants it; `map.manage-any` is the sole break-glass edit override.
- **KTD5:** Use an atomic, version-checked replace operation for mode plus explicit editor IDs, append an attributable audit event, and never trust client-supplied user IDs without resolving them through the identity boundary. Conflicting admin saves return `409` instead of silently overwriting one another.
- **KTD6:** For WAM, `everyone` means a connected user whose successful room join proves entry authorization; `specific` means the explicit set; `nobody` means no ordinary user. Direct TMJ/MCP surfaces keep their existing global authoring prerequisites in addition to the room policy because they carry no connected-room proof. Suspended identities are denied before any room grant; `map.manage-any` is the recovery override.

### Scope Boundaries

- No view-access controls or view/edit/admin matrix.
- No visitor-history collection or visitor picker.
- No persistence or UI for assigning room admins; the existing room-aware admin source remains authoritative.
- No invitations, notifications, bulk imports, or conditional policies.
- No direct MCP tool for changing access policy; humans change it in Room settings.

### Applicable documented learnings

The repository contains no `CONCEPTS.md` or `docs/solutions/` entries for this area. The implementation therefore follows the existing Teapot repository, audit, map-revision, authenticated-controller, and room-settings patterns.

## Implementation Units

### U1. Persist room editor policies and grants

- **Requirements:** R1, R2, R3, R6
- **Files:** Create the next SQL migration under `play/src/pusher/teapot/migrations/`; modify `TeapotRecords.ts`, `TeapotDataRepository.ts`, `PostgresTeapotDataRepository.ts`, and `InMemoryTeapotDataRepository.ts`.
- **Approach:** Store policy mode/version by canonical map ID and explicit editor membership with foreign keys to `teapot_users`. Expose get/version-checked-replace/editor lookup methods and include the records in repository export/restore where that contract requires it. Preserve the explicit list when switching away from `specific`; the mode controls whether it is active.
- **Test scenarios:** Absent policy; each mode; atomic replacement; duplicate grants; foreign-key safety; independent policies for two maps.
- **Verification:** Focused in-memory/service tests and migration coverage.

### U2. Centralize effective room-edit authorization

- **Dependencies:** U1
- **Requirements:** R2, R4, R5, R6
- **Files:** Create `TeapotRoomAccessService.ts`; modify `createTeapotDataServices.ts`, `TeapotMapRevisionService.ts`, `TeapotWamRevisionCoordinator.ts`, `TeapotMcpAuthoringService.ts`, `TeapotRequestIdentityResolver.ts`, and the WebSocket join/edit handling in `IoSocketController.ts`.
- **Approach:** Resolve canonical map ID, reject suspended identities, then apply operator recovery, policy modes, and legacy fallback in one service. WAM supplies successful-join context and legacy join authorization; direct TMJ/MCP calls retain their global authoring prerequisite. Re-evaluate stored policy on every preflight and revision lease acquisition. Set join-time `canEdit` from the same service so the browser and map-storage receive the effective initial value. If canonicalization or policy reading fails during join, continue room entry with `canEdit=false`; use legacy fallback only after canonical resolution proves no policy exists.
- **Test scenarios:** all modes; room A cannot grant room B; operator recovery; suspended identity; legacy fallback; known-URL outsider cannot use direct publication; live revocation; WAM/TMJ/MCP policy enforcement.
- **Verification:** Service, coordinator, and map-revision unit tests.

### U3. Add admin-only room access HTTP API

- **Dependencies:** U1, U2
- **Requirements:** R2, R3, R6
- **Files:** Create `TeapotRoomAccessController.ts`; modify `Authenticated.ts` only as needed to preserve decoded access-token/tag context; register the controller in `play/src/pusher/app.ts`.
- **Approach:** Add no-store GET and PUT endpoints validated with Zod. Authenticate the WorkAdventure JWT, resolve the room through the admin service, and revalidate the actor's current room-aware `admin` tag on every request; current `map.manage-any` operators pass as recovery managers. Resolve submitted exact identifiers through the single `workadventure` identity boundary, replace the policy atomically, and return only the policy plus editor labels needed by the UI.
- **Test scenarios:** unauthenticated; malformed URL/body; non-admin forbidden; revoked admin tag; redirects/canonicalization; admin/operator GET/PUT; arbitrary stable identifier that has not visited; duplicate/inert mistyped identity; no editor-list disclosure to non-admins; concurrent writes yield one success and one `409`.
- **Verification:** Controller tests with stubbed admin/map resolvers.

### U4. Add the editor policy controls to Room settings

- **Dependencies:** U3
- **Requirements:** R1, R2, R3, R7
- **Files:** Create a small frontend API service and `RoomEditorAccessSettings.svelte`; add it as an admin-visible section/tab in `WAMSettingsEditor.svelte`; add English translation keys in the authoritative i18n source and regenerate/check generated translations as required by `play/AGENTS.md`.
- **Approach:** Load the current policy for `gameManager.currentStartedRoom.href`, render a three-option control, show exact-identifier/label entry and removable chips only for `specific`, and give access policy its own independent save/loading/error/conflict states rather than coupling it to WAM metadata. Preserve the inactive specific list across mode changes. Explain that admins manage but are not automatically editors, a policy-less room is still using legacy editor rules, and newly granted users may need to reconnect for editor controls to appear.
- **Test scenarios:** loading/error/disabled states; mode switching; add/remove/deduplicate editor; save error preserves draft; non-specific modes hide the list; narrow layout.
- **Verification:** Svelte/type checks plus browser QA in the running room editor.

## Verification Contract

- Run focused Vitest suites for room access, repository behavior, map-revision/coordinator enforcement, and HTTP validation.
- Run `cd play && npm run typecheck`, `npm run svelte-check`, targeted lint/Prettier checks, and the relevant unit test command from `play/package.json`.
- In a local room, verify an admin can select all three modes, maintain specific users, and recover from `nobody`; an allowed and denied user receive the expected editor state after reconnect; a revoked already-connected editor's next mutation fails.
- Verify equivalent authorization for direct TMJ/MCP publication and confirm viewing/entry is unchanged.

## Security and Rollout Notes

- Deny active-policy edits unless a single server-side rule grants them; validate the object-level permission on every mutation.
- Canonicalize before lookup to prevent alternate room/WAM/TMJ URL bypasses.
- Do not expose the specific editor list outside the admin-only endpoint.
- Preserve policy-less legacy behavior so deployment does not unexpectedly lock existing rooms. Admins opt a room into scoped enforcement by saving its first policy.

## Definition of Done

- Room settings contains `Everyone`, `Specific people`, and `No one else` editor controls for room admins.
- The persisted policy is independent per canonical map and specific grants use Teapot identity IDs.
- WAM, TMJ, and MCP mutations all consult the same current policy; revocation takes effect on the next mutation.
- Existing rooms retain prior behavior until a policy is saved, viewing is unaffected, and focused/static/browser checks pass.

## Sources

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) — deny by default and validate object permissions on every request.
- [OWASP Business Logic Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html) — recompute authorization server-side rather than trusting client roles or identifiers.
- [PostgreSQL Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) — foreign-key and uniqueness design for policies and memberships.
