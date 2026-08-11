# Teapot Maps MCP authoring server

This service exposes the MCP 2026-07-28 and stateless legacy Streamable HTTP endpoint at `POST /mcp`. It is deliberately stateless: every bearer credential is created in the authenticated Teapot Maps browser, stored only as a SHA-256 hash by the pusher, and revalidated against the pusher on every MCP request.

## Runtime contract

- `TEAPOT_PUSHER_URL` — internal pusher base URL; defaults to `http://127.0.0.1:3001`.
- `TEAPOT_MCP_HOST` — bind host; defaults to `127.0.0.1` outside the container.
- `TEAPOT_MCP_PORT` — bind port; defaults to `17374`.
- `TEAPOT_MCP_ALLOWED_HOSTS` — comma-separated exact HTTP Host header allowlist. It must include the public reverse-proxy host and any direct health-check host.
- `GET /healthz` — unauthenticated liveness endpoint returning `200 {"status":"ok","service":"teapot-mcp"}`. It does not query PostgreSQL or the pusher.
- `/mcp` — Streamable HTTP endpoint (POST plus protocol GET/DELETE where used) requiring `Authorization: Bearer <browser-issued-session-token>`. Invalid, revoked, or expired sessions receive `401` before MCP dispatch.

Production images build from the repository root with `docker build -f teapot-mcp/Dockerfile .`. The service handles `SIGINT` and `SIGTERM` by stopping new HTTP requests and closing the listener.

The MCP process cannot publish maps directly. Its tools send structured proposals to the pusher; only a browser approval can mint a one-time token bound to owner, session, tool, patch digest, expected revision, and expiry. Approved map changes return to the pusher's shared publication and revision service.

Paid generation is browser-only. After approval, the browser atomically claims the one-time token before dispatching exactly one request through the existing credential worker. Accepting a candidate first persists it in the player's owner-scoped Woka, tileset, map-entity, or generated-reference catalog. Generated reference outputs remain private; input reference images stay ephemeral in the browser and are never uploaded to Teapot. Only after persistence does the browser report a strict, bounded result containing the stable asset ID, URL, kind, and provider provenance (or a fixed failure reason). The pusher verifies that the recorded asset belongs to the proposal owner and matches the proposed purpose and dimensions before completing the proposal. Credentials, image bytes, prompts, and input reference images never enter the completion payload. Applying or placing that durable asset in a world remains a separate approval. A saved tileset can be introduced to an isolated TMJ draft with the semantic `import-tileset` operation, which accepts only an owner asset ID and safe name; the server resolves its canonical URL and dimensions and reports the allocated GID range before a separate publication approval.
