---
title: "feat: Serve Oliver's Tools game at /play"
type: feat
date: 2026-08-18
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Serve Oliver's Tools game at /play

## Goal Capsule

- **Objective:** Build the static game dependency for `https://olivers.tools/play` and make that landing path open the existing empty map as the main room.
- **Configuration:** Keep `publicOrigin` as the backend origin and add a normalized frontend base path so `/play` is not hardcoded into the packager.
- **Artifact:** Produce a website-overlay package whose game shell and Vite assets live below `/play`, while intentional root resources and backend routes remain at the origin root.
- **Compatibility:** Preserve the existing root-path package shape when no frontend base path is configured.

## Problem Frame

The package builder, Vite output, HTML base element, manifest, URL classifier, and local landing redirect currently assume `/`. Merely setting the domain would leave `/play` unsupported, restore a previously visited room, or request assets from the wrong location. The existing empty WAM is suitable as the initial room, but its collection URLs still reference localhost.

## Requirements

- **R1:** Add a validated `frontendBasePath` instance setting with a root-compatible default.
- **R2:** Project `FRONT_URL` to the configured frontend path while keeping WebSocket/API/map-storage/uploader/icon/MCP routes at the public origin root.
- **R3:** Build Vite with the selected base before packaging and emit `/play/index.html`, `/play/assets`, and `/play/manifest.webmanifest` for the Oliver's Tools profile.
- **R4:** Treat `/play` and `/play/` as the configured landing route, then open the configured empty room beneath the same visible frontend prefix.
- **R5:** Keep root `static`, `collections`, resources, and worker files available to the game without taking control of the rest of the website.
- **R6:** Add a tracked Oliver's Tools instance profile and remove localhost URLs from the empty WAM.
- **R7:** Document the website overlay, history fallback, and backend proxy precedence required by the generated artifact.

## Scope Boundaries

### In scope

- Static package and client/server URL handling for a configurable frontend subpath.
- Oliver's Tools configuration for `/play` and `map-storage/public/maps/empty.wam`.
- Root-path regression compatibility.

### Out of scope

- Deploying or changing the live `olivers.tools` website.
- Moving backend service routes below `/play`.
- Migrating every intentional root-relative public resource to an isolated `/play/**` namespace.

## Assumptions

- The consuming website copies the package's `public/` overlay into its output root.
- Backend routes remain same-origin and are matched before the `/play/*` static history fallback.
- `/play` is deterministic and opens the configured main room rather than restoring the last visited room.

## Key Technical Decisions

1. **Separate frontend path from service origin.** `publicOrigin` remains origin-only; `frontendBasePath` controls the browser URL and build base.
2. **Use a split overlay layout.** Vite-owned `assets` and the shell move below the frontend path, while public-root resources remain at root because existing runtime code intentionally requests them there.
3. **Keep room URLs under the frontend prefix.** Same-origin start-room paths are prefixed once, so the canonical room is `/play/~/maps/empty.wam` while map storage still resolves `/map-storage/maps/empty.wam`.
4. **Use config-aware build orchestration.** The package CLI reads the instance config before invoking Vite; shell command ordering can no longer build with the wrong base.

## Implementation Units

### U1. Add the frontend base-path configuration contract

**Goal:** Validate and project a frontend path consistently in TypeScript and Docker tooling.

**Requirements:** R1, R2, R6

**Files:**

- `play/src/pusher/config/InstanceConfig.ts`
- `play/tests/pusher/InstanceConfig.test.ts`
- `contrib/docker/instance-config.mjs`
- `contrib/docker/instance-config.test.mjs`
- `contrib/docker/instance.config.example.json`
- `../../Oliver's Website/config/tpot-maps.instance.json` (consumer-owned instance profile)

**Approach:** Accept an empty/root-compatible value or a normalized leading-slash path without trailing slash, query, hash, credentials, or traversal. Project `FRONT_URL` and same-origin start-room routes through that path while leaving service endpoints root-scoped.

**Test scenarios:** Accept root and `/play`; reject malformed and traversal paths; verify TS/MJS parity, backend URLs, `FRONT_URL`, and exactly-once start-room prefixing.

### U2. Make browser navigation base-path aware

**Goal:** Recognize, preserve, and write game URLs beneath the configured frontend prefix.

**Requirements:** R4, R5

**Files:**

- `play/src/front/Enum/EnvironmentVariable.ts`
- `play/src/front/Url/UrlManager.ts`
- `play/tests/front/Url/UrlManager.test.ts`
- `play/src/front/Network/ServiceWorker.ts`
- `play/src/front/Notification/MessageNotification.ts`

**Approach:** Derive the normalized base from `FRONT_URL`, classify the base landing as a deterministic room entry, strip the prefix only for route classification, and prepend it exactly once when writing history. Register workers with `/play/` scope while keeping their root script files.

**Test scenarios:** `/play` and `/play/` are landing routes; nested room/login routes classify correctly; `/playground` is untouched; history preserves query/hash and never doubles the prefix; root behavior remains unchanged.

### U3. Resolve the landing route and empty room

**Goal:** Make the configured landing path redirect safely to the empty WAM room.

**Requirements:** R4, R6

**Files:**

- `play/src/pusher/services/LocalAdmin.ts`
- `play/tests/pusher/LocalAdmin.test.ts`
- `play/tests/pusher/mocks/pusherEnvironmentVariableMock.ts`
- `map-storage/public/maps/empty.wam`

**Approach:** Match the normalized `FRONT_URL` pathname in addition to `/`, construct redirects with URL resolution rather than assigning an absolute URL to `pathname`, and use same-origin collection URLs in the empty WAM.

**Test scenarios:** `/play` and `/play/` redirect to `/play/~/maps/empty.wam`; absolute start-room values do not become `/https://...`; prefixed room paths resolve to `/map-storage/maps/empty.wam`; the WAM contains no localhost or insecure HTTP collection URL.

### U4. Build and package the `/play` website overlay

**Goal:** Generate an installable static dependency with correct physical and URL layout.

**Requirements:** R3, R5, R7

**Files:**

- `play/vite.config.ts`
- `play/package.json`
- `play/scripts/packageStaticWeb.ts`
- `play/tests/pusher/StaticWebPackager.test.ts`
- `docs/others/self-hosting/static-web-package.md`

**Dependencies:** U1

**Approach:** Load config before building, pass the normalized Vite base, render a base-aware shell and manifest, relocate the shell and Vite asset directory beneath the base path, retain public-root resources, and document copy/fallback/proxy behavior.

**Test scenarios:** Oliver's profile emits `/play/index.html`, `/play/assets`, `/play/manifest.webmanifest`, root resources/workers, and no template tokens; its manifest scope is `/play/`; the generic root profile retains the prior layout; the tarball installs as a file dependency.

## Risks & Dependencies

- The website must serve `/play` and `/play/*` with a history fallback to `/play/index.html`, after checking real files and backend routes.
- Public root resource names can collide with the host website; the documented overlay makes those files explicit.
- A live backend is still required for room resolution, WebSockets, map storage, uploads, and editing.

## Verification Contract

- Focused InstanceConfig, UrlManager, LocalAdmin, and static-packager tests pass.
- Typecheck, scoped lint/format, and the Docker config tests pass.
- A real package built from the consumer-owned `config/tpot-maps.instance.json` contains `/play` HTML/assets/manifest, root public resources, exact-state metadata, and no Mustache tokens.
- A static smoke server returns the shell for `/play`, `/play/`, and a prefixed room refresh, and serves a generated `/play/assets` file.
- Existing unrelated working-tree edits remain untouched.

## Definition of Done

- Visiting `https://olivers.tools/play` enters the empty main room through the packaged game shell.
- The package can be copied into the Oliver's Tools website output root and rebuilt from any local source state.
- The root-path packaging mode continues to pass its existing tests.
- Documentation states the remaining host routing and backend-service requirements.
