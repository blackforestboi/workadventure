---
title: Slim Play Runtime Image - Plan
type: perf
date: 2026-08-11
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Slim Play Runtime Image - Plan

## Goal Capsule

- **Objective:** Reduce the Railway `play` runtime image by excluding build-only caches, source maps, and duplicated static assets while preserving the existing Node Play service and deployment behavior.
- **Authority:** The current `play/Dockerfile` and its Railway deployment contract are authoritative.
- **Stop conditions:** Do not split the frontend into a separate service, alter application routing, or change runtime environment variables in this change.

## Product Contract

### Summary

The Play service should keep serving the same application but publish substantially less data to Railway on UI releases.

### Problem Frame

The final Docker stage copies the complete built `play` directory, including Vite cache data, source maps, source-only public assets, and duplicated static media.

### Requirements

- R1. The final image must contain only files required by the Play runtime.
- R2. The production build and `/ping` health endpoint must retain their current behavior.
- R3. Build-only Vite cache data and browser source maps must not ship in the final image.
- R4. Static assets must be copied once from the production build output rather than duplicated from `play/public`.

### Scope Boundaries

- Keep Railway’s existing `play` service, Dockerfile builder, health check, and deployment configuration.
- Defer a standalone static frontend/CDN architecture to later work.

## Planning Contract

### Key Technical Decisions

- KTD1. Preserve the multi-stage Docker build and narrow the final-stage copy boundary instead of introducing a new deployment service.
- KTD2. Retain the runtime server source required by `npm run start`, but copy only production distribution assets rather than the whole build directory.
- KTD3. Remove generated browser source maps from the final artifact; Sentry upload remains part of the builder stage.

### Assumptions

- The Play production server resolves static content from its build output and does not require `play/public` at runtime.
- The existing `npm run start` command identifies the minimal server source/runtime files that must remain available.

## Implementation Units

### U1. Define a minimal Play runtime file set

- **Goal:** Identify and encode the final-stage files that the Play server needs at runtime.
- **Requirements:** R1, R2, R4.
- **Dependencies:** None.
- **Files:** `play/Dockerfile`, `play/package.json`.
- **Approach:** Clean the builder's Play directory immediately after the production build, before the existing final-stage copy. Exclude Vite cache and source-only static directories while retaining the runtime source and generated output.
- **Test scenarios:** Build the production image and request `/ping`; load the Play entry page and a static map asset through the production route.
- **Verification:** The service starts and returns successful health and content responses with no missing runtime module or static asset errors.

### U2. Exclude browser debugging artifacts from the release image

- **Goal:** Prevent generated JavaScript source maps from increasing the pushed image size.
- **Requirements:** R1, R3.
- **Dependencies:** U1.
- **Files:** `play/Dockerfile`, `play/vite.config.ts` if needed.
- **Approach:** Keep source-map generation available to the builder/Sentry flow when required, but remove generated `.map` artifacts before copying production browser assets into the final stage.
- **Test scenarios:** Inspect the built runtime asset directory and confirm that it contains application scripts and required WASM/media files but no `.map` files.
- **Verification:** The production build succeeds and the final copied asset tree contains no browser source maps.

## Verification Contract

| Gate | Applies to | Done signal |
| --- | --- | --- |
| Play production build | U1, U2 | `npm run build --workspace=play` succeeds. |
| Container/runtime smoke check | U1, U2 | The Docker image starts and `/ping` returns success. |
| Live release check | U1, U2 | Railway deploys successfully and `https://tpot.world/` plus `https://tpot.world/~/maps/areas.wam` return HTTP 200. |

## Definition of Done

- The Play runtime image excludes the copied Vite cache, duplicate `public` tree, and browser source maps.
- The production image starts successfully and serves Play and map requests.
- The update is committed to `master`, deployed by Railway, and confirmed live.
