---
title: "feat: Package a static Tpot Maps web build"
type: feat
date: 2026-08-18
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Package a static Tpot Maps web build

## Goal Capsule

- **Objective:** Produce a locally consumable, versioned web-build package from any checked-out Tpot Maps state so another website can pin that package as a `file:` dependency during its own build.
- **Artifact:** Emit both a stable unpacked package directory for local development and an immutable npm-compatible `.tgz` snapshot for deployment builds.
- **Configuration:** Pre-render the Play HTML shell and web manifest from the unified non-secret instance configuration.
- **Boundary:** The artifact contains the browser build only. Room state, WebSockets, authentication, APIs, map storage, uploads, MCP, and agent services still run separately at the configured public origin.

## Problem Frame

`npm run build --workspace=play` currently writes browser assets to `play/dist/public`, but the generated `index.html` still contains Mustache placeholders that the Play server normally resolves per request. There is no package command, package metadata, stable artifact location, or documented consumer workflow. Copying `dist/public` directly into another app therefore produces an incomplete shell and offers no reliable way to pin the exact source state.

## Requirements

- **R1:** Add one root command that builds Play and packages its browser output.
- **R2:** Accept an instance-config path and pre-render branding, metadata, runtime browser configuration, favicon, manifest, and public-origin values.
- **R3:** Emit an npm-compatible directory and `.tgz` with deterministic paths plus source-state metadata.
- **R4:** Preserve content-hashed Play assets without rebuilding them in the consuming website.
- **R5:** Fail clearly for missing/invalid config, missing Play output, unresolved template placeholders, or packaging failures.
- **R6:** Document local updating, `file:` dependency usage, copying the packaged public directory, deployment pinning, and the required backend routes.

## Scope Boundaries

### In scope

- A static browser artifact built from the current working tree.
- Build-time rendering from `instance.config.json`.
- Local directory and tarball consumption.
- Package tests and focused build verification.

### Out of scope

- Publishing to a public npm registry.
- Bundling or replacing the Play/pusher, back, map-storage, uploader, MCP, or agent services.
- Supporting a non-root base path in this first package format; the browser bundle continues to use root-relative assets and routes.
- Automating deployment of the consuming website.

## Key Technical Decisions

1. **Package the compiled browser, not source modules.** The website consumes an already-built artifact and does not inherit this monorepo's Vite/Svelte dependency graph.
2. **Render at package time.** The package command uses the existing validated instance configuration and frontend environment contract to eliminate Mustache placeholders before the artifact leaves this repository.
3. **Provide two pinning modes.** The stable directory supports rapid local iteration; the `.tgz` gives deployment builds an immutable snapshot that package managers can checksum and lock.
4. **Record exact dirty source state.** `build-info.json` carries the Git revision, dirty flag, and a content-derived source-state fingerprint; dirty package versions include that fingerprint.
5. **Make capabilities explicit.** The default static shell bakes an empty public capability map. Operators can provide a JSON capability snapshot at package time; packaging never contacts a live admin service.
6. **Keep backend requirements explicit.** A static shell is not a standalone multiplayer server; documentation names the same-origin HTTP/WebSocket routes that must still reach the running services.

## Implementation Units

### U1. Build and render the static web package

**Goal:** Convert `play/dist/public` into a complete npm-compatible static package using one validated instance config.

**Requirements:** R1, R2, R3, R4, R5

**Files:**

- `play/scripts/packageStaticWeb.ts`
- `play/package.json`
- `package.json`
- `.gitignore`

**Approach:** Build Play first, load and validate the selected instance JSON, project its public values into the existing frontend configuration, render `index.html` with Mustache, generate a static web manifest, copy the content-hashed assets, write package/build metadata, and create a versioned tarball plus a mutable convenience alias. Refuse output containing unresolved Mustache tags.

**Patterns to follow:**

- `play/src/pusher/controllers/FrontController.ts` for index rendering inputs.
- `play/src/pusher/config/InstanceConfig.ts` and `contrib/docker/instance-config.mjs` for validation and public-value projection.
- `play/src/pusher/services/MetaTagsBuilder.ts` for favicon and manifest metadata.

**Test scenarios:**

1. A custom brand/origin renders an HTML shell with browser configuration and no Mustache placeholders.
2. The generated manifest contains configured names, colors, favicon/manifest assets, and start URL.
3. Package metadata records the artifact format and source state.
4. Missing browser output or unresolved placeholders fail with actionable errors.
5. Rebuilding replaces the explicit artifact directory and mutable tarball alias while preserving versioned `.tgz` snapshots.
6. Documentation defines backend-route precedence and a history fallback for nested room URLs, and explains generic static metadata, request-time redirects, and capability snapshots.

**Verification:** Focused packager tests pass and a real command creates an installable tarball containing rendered HTML and compiled assets.

### U2. Document the consumer and update workflow

**Goal:** Make the package usable as a repeatable local dependency in another website build.

**Requirements:** R6

**Dependencies:** U1

**Files:**

- `docs/others/self-hosting/static-web-package.md`
- `contrib/docker/README.md`

**Approach:** Document the build command, stable directory and tarball outputs, example `file:` dependency declarations, a framework-neutral copy step, package-lock refresh behavior, source update/rebuild flow, and required reverse-proxy routes. State the root-path limitation and backend-service boundary prominently.

**Test scenarios:** Documentation commands and paths match the implemented CLI and generated package shape.

**Verification:** The generated package can be inspected and installed through the documented local dependency form.

## Verification Contract

- Focused tests cover HTML rendering, manifest generation, metadata, and failures.
- The real `package:web` command succeeds against `contrib/docker/instance.config.example.json`.
- The emitted tarball passes `npm pack --dry-run`/archive inspection and contains no unresolved Mustache placeholders.
- Play typecheck, scoped lint/format, and production build pass.
- Existing unrelated working-tree edits remain untouched.

## Definition of Done

- A developer can update this checkout, choose any local source state, run one packaging command, and receive a stable package directory plus a `.tgz` snapshot.
- A separate website can declare the output as a local dependency and copy its `public` directory into the website build.
- The packaged HTML and manifest reflect the selected instance configuration without requiring runtime template rendering.
- Artifact metadata identifies the source revision and whether the working tree was dirty.
- Documentation makes clear which backend routes/services remain required.
