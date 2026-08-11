---
title: Local-player asset occlusion
date: 2026-08-12
type: feature
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: conversation
---

# Local-player asset occlusion

## Goal Capsule

- **Objective:** Fade a placed world asset to 60% opacity while it visually covers the local avatar.
- **Authority:** This is a local render effect only; remote avatars and networked entity state never participate.
- **Stop conditions:** The asset's prior opacity is restored when the local avatar is no longer behind it, and intentional world depth sorting remains unchanged.

## Product Contract

- R1. An overlapping asset in front of the local avatar renders at no more than 60% opacity.
- R2. Assets behind the local avatar or not overlapping it retain their existing opacity.
- R3. Leaving the occluded area restores the asset's exact prior opacity.
- R4. Remote avatars cannot trigger the effect, and no opacity change is synchronized to other clients.
- R5. Multiple, late-added, and removed assets are handled independently without stale state.

## Implementation Units

### U1. Local occlusion state

- Add a scene-local controller that compares the local avatar bounds/depth with placed entity bounds/depth.
- Track original alpha only while an entity is faded, avoid redundant writes, and clean up stale entities.
- Cover front/behind, overlap, restoration, multiple assets, and stable-frame behavior with runtime-state unit tests.

### U2. Game-scene integration

- Run the controller after local and remote movement updates using only `CurrentPlayer` and the placed entity collection.
- Mark the dirty scene only when opacity actually changes.
- Keep tile bands, entity depth formulas, remote-player processing, and network payloads untouched.

## Verification

- Run the focused Vitest file.
- Run Play type checking and formatting checks for the changed files.
