---
title: Self-organized room access and visitor roles
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: active-goal
execution: code
deepened: 2026-08-11
---

# Self-organized room access and visitor roles

## Goal Capsule

Every canonical map/room owns its access rules. Room admins configure who may view, edit, or administer the room using the same three modes for each role: everyone, specific people, or no one. Admins can assign specific roles from the room's complete visitor history or by entering an exact username that has never visited.

## Product Contract

- **R1 — Three-role matrix:** A canonical map has independent `view`, `edit`, and `admin` policies, each using `everyone`, `specific`, or `nobody`.
- **R2 — Role inheritance:** Admin implies edit and view; edit implies view. The platform's current room-owner/admin source remains an immutable recovery path.
- **R3 — Server enforcement:** View is checked before WebSocket admission, edit is checked before every WAM/TMJ/MCP mutation, and admin is checked on every access-management request.
- **R4 — Stable membership:** Specific grants store immutable Teapot user IDs. The UI and API resolve exact WorkAdventure identifiers and may create an inert identity for a username that has not visited.
- **R5 — Complete visitor history:** Every successful room admission records first visit, latest visit, and visit count by canonical map and immutable user ID. Denied attempts are not visitors.
- **R6 — Admin workflow:** The Room settings UI renders the full policy matrix, exact-username assignment, every recorded visitor, and per-visitor role checkboxes.
- **R7 — Compatibility:** A missing view policy preserves successful legacy admission; a missing edit policy preserves legacy edit/global-author rules; a missing admin policy preserves the existing room-admin source.
- **R8 — Concurrency and audit:** Policy writes are independently versioned by role, return `409` on stale versions, and append an attributable audit event.

## Key Technical Decisions

- Use the canonical TMJ URL already shared with map revisions as the room key. Redirects and WAM aliases therefore share access and visitor history.
- Store generic policies by `(map_id, role)`, grants by `(map_id, role, user_id)`, and visitors by `(map_id, user_id)`.
- Keep global direct-authoring capabilities in addition to room edit policy because direct MCP/TMJ calls do not prove a live room join.
- Resolve effective access at join once for UI tags, then re-check edit/admin policy at each authoritative server boundary so revocation does not require reconnecting.
- Preserve inactive specific-member lists when a role switches to Everyone or No one; the mode determines whether those grants are effective.
- Room-owner/admin recovery is deliberately outside the configurable admin row so an accidental `admin = nobody` cannot permanently lock the room.

## Implementation Units

### U1. Generic persistence and history

- Replace editor-only tables with role-keyed policy and grant tables plus durable visitor history.
- Extend in-memory/Postgres repositories, export/restore schema v4, legacy schema restoration, optimistic role versions, and canonical-map isolation.
- Verify independent roles, grant deduplication, conflicts, visit increments, and export/restore.

### U2. Shared role authorization

- Extend `TeapotRoomAccessService` with view, edit, and admin checks plus role inheritance, suspension denial, legacy fallbacks, and operator recovery.
- Reject unauthorized viewers before socket upgrade; append effective editor/admin tags only after server approval.
- Re-check edits at WAM revision acquisition and existing TMJ/MCP preflights.
- Record visitor history only after view authorization succeeds.

### U3. Admin API

- Serve no-store GET/PUT `/teapot/rooms/access` endpoints.
- GET returns all three policies, explicit members, and the full visitor history with current explicit roles.
- PUT version-replaces one role after current server-side admin proof, resolves exact identifiers, and writes an audit event.
- Verify delegated admins, current platform admins, forbidden users, conflicts, visitor disclosure boundaries, and never-visited usernames.

### U4. Room settings matrix

- Render roles as rows and Everyone / Specific people / No one as columns.
- Add a username/identifier field with role selection.
- Render all visitors with search, visit metadata, and View/Edit/Admin checkboxes.
- Show specific members per role, including users who have never visited, and preserve draft state across save errors/conflicts.

## Verification Contract

- Focused Vitest coverage proves every policy mode, inheritance, legacy fallbacks, immediate mutation revocation, denied-view behavior, successful visitor recording, repository export/restore, route protection, visitor response, and never-visited assignment.
- Run TypeScript, Svelte diagnostics, ESLint, changed-file Prettier, migration tests, and the full Play test suite; distinguish feature regressions from confirmed base-branch failures.
- Browser QA must exercise the matrix, visitor picker, username assignment, mode switching, persistence after reload, view denial, delegated admin access, and conflict recovery when `agent-browser` is available.

## Definition of Done

- Room settings exposes all nine role/mode combinations.
- Specific users can be assigned from complete visitor history or exact username without a prior visit.
- View, edit, and admin checks are enforced server-side on their authoritative boundaries.
- Visitors are stored durably per canonical room and shown only to authorized room admins.
- Existing rooms preserve legacy behavior until each role is configured.
- Focused tests and static checks pass; any unavailable browser or base-branch validation is reported explicitly.
