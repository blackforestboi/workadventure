/Users/oliversauter/.bash_profile: line 16: alias: -s: not found
/Users/oliversauter/.rvm/scripts/rvm: line 29: /bin/ps: Operation not permitted
pyenv: cannot rehash: /Users/oliversauter/.pyenv/shims isn't writable
---
title: "fix: Persist generated map assets"
date: 2026-08-12
type: fix
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# fix: Persist generated map assets

## Goal Capsule

- **Objective:** Make accepted AI-generated map objects recoverable by requiring a successful local save before acceptance completes and, when authenticated, synchronize them to the user's durable generated-asset catalog.
- **Authority:** The user's request, then the existing avatar recovery and generated-asset API contracts, then surrounding editor conventions.
- **Execution profile:** Extend the existing entity-upload flow and owner-scoped API; do not add a second backend catalog.
- **Stop conditions:** Revisit the approach if browser persistence cannot store PNG blobs or if the existing generated-asset API is not owner-scoped.
- **Tail ownership:** The implementation owns local recovery, authenticated synchronization, catalog hydration, tests, and validation.

---

## Product Contract

### Summary

Accepted generated map objects currently exist only as transient component state and disappear on refresh.
The fix preserves the normalized PNG locally before continuing into the entity editor and synchronizes it to the signed-in user's existing generated-asset catalog.

### Problem Frame

`AssetGenerationPanel.svelte` passes the generated blob and provenance to `EntityUpload.svelte`, but the current callback keeps only the blob and creates an object URL.
The authenticated `TeapotGeneratedAssetApi` already supports upload, list, and download, yet its upload path has no production caller for map objects.

### Requirements

- R1. Acceptance completes only after the generated map object is stored in browser persistence; if that save fails, the review candidate remains open with a retryable storage error.
- R2. Locally stored generated map objects remain visible and reusable after page refresh or a development server restart.
- R3. When an authentication token exists, acceptance uploads the PNG and provider/model provenance to the user's `map-entity` catalog.
- R4. Catalog hydration correlates local recovery records with remote owner records by PNG fingerprint and renders one logical entry after retries or interrupted acknowledgements.
- R5. Anonymous users can generate, cache, reload, and reuse assets without remote API errors.
- R6. A remote upload, list, or download failure never destroys an existing cached PNG; cached items remain usable, while a remote-only download failure retains its metadata and exposes a retryable item error.
- R7. Local object URLs and browser database handles are cleaned up, and malformed or unavailable browser storage does not break the editor.
- R8. Authenticated browser records are partitioned by the stable local user UUID; anonymous records use a separate namespace and are not silently adopted by the next signed-in account.

### Acceptance Examples

- AE1. Given an anonymous user accepts a generated map object, when they refresh and reopen entity upload, then the object appears in Saved AI assets and can be configured without making an authenticated API request.
- AE2. Given a signed-in user accepts a generated map object, when acceptance completes, then the PNG exists locally and the server catalog receives one owner-scoped upload with its generation provenance.
- AE3. Given the server catalog is unavailable after generation, when the user refreshes, then the locally cached object remains reusable and the UI reports only the remote synchronization problem.
- AE4. Given the same accepted object exists locally and remotely, when the picker hydrates, then it renders one entry and prefers the remote metadata while retaining the local binary fallback.
- AE5. Given account A has cached generated assets, when account B signs in on the same browser, then account A's records are neither rendered nor synchronized as account B.

### Scope Boundaries

- In scope: AI-generated `map-entity` assets accepted from `EntityUpload.svelte`, local binary recovery, authenticated upload, merged retrieval, and failure-tolerant UI state.
- Out of scope: changing avatar persistence, tileset persistence, deletion controls, automatic claiming of anonymous assets after login, or migrating existing transient assets that were never cached.
- Existing visibility contract: `map-entity` raster bytes remain public by unguessable URL so published maps can render them; only catalog discovery and management are owner-scoped.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Use a dedicated IndexedDB store for map-asset PNGs.** Generated map objects are materially larger than Woka sheets, so storing binary `Blob`s avoids localStorage base64 expansion and quota pressure while following the avatar draft store's tested browser-database pattern.
- KTD2. **Cache before network synchronization.** The local record is the recovery guarantee; a failed local write rejects acceptance and keeps the candidate open, while an authenticated upload failure records a retryable sync state without erasing the PNG.
- KTD3. **Use token presence as the authentication gate.** `localUserStore.getAuthToken()` matches `TeapotGeneratedAssetApi`'s authorization contract and prevents anonymous list/upload calls.
- KTD4. **Partition local records by owner scope.** Authenticated records use `localUserStore.getLocalUser()?.uuid`; unauthenticated records use an anonymous namespace that is visible only while signed out and is never automatically uploaded into a later account.
- KTD5. **Correlate and deduplicate by validated PNG fingerprint.** The server exposes its existing SHA-256 metadata in asset views and reuses an owner's same-kind asset with the same fingerprint, allowing interrupted responses and multi-tab retries to converge on one durable record.
- KTD6. **Retain a local binary fallback.** Remote metadata is authoritative when present, while a cached blob remains the display/download fallback and local-only records retain stable client IDs plus pending, failed, or synced status.
- KTD7. **Keep persistence orchestration at the entity acceptance seam.** The generic generation panel remains target-agnostic; `EntityUpload.svelte` owns map-object naming, catalog hydration, selection, sync status, and retry.

### Assumptions

- The existing pusher generated-asset service remains owner-scoped and accepts browser-normalized PNGs.
- A failed remote sync is recoverable: the editor continues with the locally cached asset, records the failed state, and retries on explicit user action or the next authenticated hydration.
- Browser persistence is the acceptance gate; failure leaves the generated candidate intact instead of silently continuing without refresh safety.

### Sequencing

Implement the browser repository first, expose server fingerprints and idempotent acceptance second, then integrate acceptance and catalog hydration against both contracts.

---

## Implementation Units

### U1. Add a local generated-map-asset repository

- **Goal:** Persist generated map-object metadata, provenance, and PNG blobs in a versioned IndexedDB catalog.
- **Requirements:** R1, R2, R4, R6-R8; AE1, AE3-AE5.
- **Dependencies:** None.
- **Files:** `play/src/front/Services/GeneratedAssetLocalStore.ts`, `play/tests/front/Services/GeneratedAssetLocalStore.test.ts`
- **Approach:** Model stable client IDs, owner scope, PNG fingerprint, provenance, sync status, optional server view, and timestamps. Expose list/upsert/remove operations, validate loaded records, cap the archive by count and bytes while protecting unsynced records, and make storage failures explicit without corrupting readable siblings.
- **Patterns to follow:** `play/src/front/Services/AssetGeneration/AvatarGenerationDraftStore.ts` for IndexedDB lifecycle and `play/src/front/Services/GeneratedWokaLocalStore.ts` for dedupe and recovery semantics.
- **Test scenarios:**
  1. Store a non-empty PNG with metadata, reconstruct it after a new store instance, and preserve the exact bytes.
  2. Upsert a server-backed view over its client record and return one merged record with the cached blob.
  3. Ignore malformed database records while returning valid siblings.
  4. Propagate open/write/quota failures as a persistence error without deleting previously stored records.
  5. Enforce the retention bound by removing the oldest records only.
  6. List only the active owner scope and keep anonymous records isolated from authenticated UUID namespaces.
- **Verification:** A fresh repository instance lists accepted assets and exact PNG bytes; repeated synchronization does not duplicate them.

### U3. Make generated-asset reconciliation idempotent

- **Goal:** Expose the validated PNG fingerprint and reuse an owner's existing same-kind asset so interrupted uploads converge safely.
- **Requirements:** R3, R4, R6, R8; AE2, AE4, AE5.
- **Dependencies:** None.
- **Files:** `play/src/pusher/teapot/TeapotGeneratedAssetService.ts`, `play/src/front/Services/TeapotGeneratedAssetApi.ts`, `play/tests/pusher/TeapotGeneratedAssetService.test.ts`, `play/tests/front/Services/TeapotGeneratedAssetApi.test.ts`
- **Approach:** Include the existing SHA-256 metadata in generated-asset views. Before creating a new catalog record, reuse an undeleted asset owned by the same identity with the same kind and fingerprint. Keep public raster visibility and owner-scoped list/management behavior unchanged.
- **Patterns to follow:** Existing metadata lookup in `TeapotGeneratedAssetService.ts` and owner filtering in `TeapotDataRepository`.
- **Test scenarios:**
  1. Accept the same PNG twice for one owner and return the same durable asset ID without adding a second catalog record.
  2. Accept identical PNGs for different owners and retain separate owner records.
  3. Return `sha256` from upload and list responses and validate it in the browser API schema.
  4. Preserve public-by-link map-entity raster access and private owner catalog listing.
- **Verification:** Lost-response or multi-tab retries produce one owner asset, and browser hydration can correlate it with the cached PNG.

### U2. Persist and restore generated assets in entity upload

- **Goal:** Wire generated map-object acceptance to local-first persistence, optional authenticated upload, and a merged saved-asset picker.
- **Requirements:** R1-R8; AE1-AE5.
- **Dependencies:** U1, U3.
- **Files:** `play/src/front/Components/MapEditor/EntityEditor/EntityUpload/EntityUpload.svelte`, `play/tests/front/Components/MapEditor/EntityUploadPersistence.test.ts`, `play/src/front/Services/TeapotGeneratedAssetApi.ts`
- **Approach:** Preserve provider/model data from `AssetGenerationPanel`, resolve the active owner scope, and write the local record before opening the existing customization form. Upload only for an authenticated UUID scope, persist pending/failed/synced status, retry failed records explicitly or on the next authenticated hydration, and merge cached and remote records by server ID then fingerprint. Render cached cards immediately while remote hydration continues, keep them enabled if list/upload fails, scope remote-only download errors to the affected card, reuse cached blobs before network download, and revoke component-created object URLs during refresh and teardown.
- **Patterns to follow:** `play/src/front/Components/Woka/WokaSelectScene.svelte` for local/remote recovery merging and `play/src/front/Services/TeapotGeneratedAssetApi.ts` for authenticated catalog behavior.
- **Test scenarios:**
  1. Covers AE1. Accept as an anonymous user, verify no remote list/upload call, remount, and reuse the locally restored PNG.
  2. Covers AE2. Accept with a token and stable local UUID, verify local persistence precedes upload and the upload receives the bounded name, `map-entity` kind, provider ID, and model ID.
  3. Covers AE3. Reject the authenticated upload, then verify the editor and refreshed saved-assets view still use the cached PNG while exposing the sync error.
  4. Covers AE4. Simulate a committed upload with a lost response, retry after remount, and verify fingerprint reconciliation yields one server-backed item with local binary fallback.
  5. Return a remote-only item and verify selection downloads it through the authenticated API.
  6. Fail IndexedDB persistence and verify the review candidate remains open with a retryable storage error.
  7. Unmount after local previews are created and verify their object URLs are revoked.
  8. Fail the remote list while cached items exist and verify the cards render immediately, remain selectable, and show a scoped synchronization warning.
  9. Fail a remote-only download and verify its metadata remains visible with a retryable item error.
  10. Covers AE5. Switch from account A to B and verify A's local records are not listed or uploaded in B's scope; verify anonymous records remain separate after login.
- **Verification:** Generated map objects survive remounts locally, authenticated users retrieve them from the remote catalog on another session, and all failure paths preserve the accepted blob or clearly report loss of the local guarantee.

---

## Verification Contract

- Run the focused local-repository and entity-persistence Vitest tests once with the `play` workspace test script.
- Run existing asset-generation panel, generated Woka local-store, generated-asset service, owner-isolation, and authoring-route regression tests that cover adjacent contracts.
- Run `play` TypeScript typecheck, Svelte check, ESLint, and Prettier check.
- Run the `play` build if the focused and static checks pass.

---

## Definition of Done

- Every generated map-object acceptance completes local persistence before clearing the generation candidate; storage failure leaves the candidate open.
- Anonymous refresh recovery works without authenticated API calls.
- Signed-in acceptance uploads once to the owner-scoped catalog with provenance and is retrievable later.
- Local and remote hydration dedupe by durable ID or fingerprint while retaining cached binary fallback.
- Local records are partitioned by authenticated UUID or anonymous scope and never cross accounts.
- Upload/list/download and browser-storage failures have regression coverage and do not silently lose an accepted asset.
- Created object URLs and database resources are cleaned up.
- Focused tests and all relevant `play` validation gates pass.
- No abandoned persistence experiments or unrelated changes remain in the diff.

---

## Appendix

### Sources and Research

- `play/src/front/Components/MapEditor/EntityEditor/EntityUpload/EntityUpload.svelte` — transient acceptance and existing saved-assets picker.
- `play/src/front/Services/TeapotGeneratedAssetApi.ts` — authenticated owner upload/list/download contract.
- `play/src/front/Services/GeneratedWokaLocalStore.ts` and `play/src/front/Components/Woka/WokaSelectScene.svelte` — local/remote recovery behavior.
- `play/src/front/Services/AssetGeneration/AvatarGenerationDraftStore.ts` — IndexedDB blob persistence pattern.
- No `docs/solutions/` learning corpus exists in this repository.
