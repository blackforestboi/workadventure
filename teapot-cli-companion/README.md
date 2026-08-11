# Teapot AI agent bridge

This is Teapot Maps' internal server-side bridge for Codex and Claude subscription OAuth. A browser talks only to authenticated Play routes; Play forwards an opaque owner identifier and authenticates to this service with a separate shared secret. Provider credentials never enter browser storage or Play responses.

The production bridge image includes pinned Codex and Claude CLIs. Each Teapot owner gets isolated provider configuration below `TEAPOT_CODEX_AUTH_ROOT`, which must be a persistent, access-restricted server volume. OAuth state survives container restarts without mixing users.

The standard Compose environments build and start the service automatically. For direct server development from the repository checkout:

```sh
export TEAPOT_HOSTED_BRIDGE_SECRET="$(openssl rand -hex 32)"
export TEAPOT_CODEX_BRIDGE_SERVICE_SECRET="$TEAPOT_HOSTED_BRIDGE_SECRET"
TEAPOT_CLAUDE_AUTH_ROOT="$PWD/.teapot-data/agent-auth/claude" \
TEAPOT_CODEX_AUTH_ROOT="$PWD/.teapot-data/agent-auth/codex" \
TEAPOT_HOSTED_BRIDGE_HOST="127.0.0.1" \
TEAPOT_HOSTED_BRIDGE_PORT="17375" \
TEAPOT_CODEX_BRIDGE_HOST="127.0.0.1" \
TEAPOT_CODEX_BRIDGE_PORT="17375" \
npm run teapot:agent-bridge
```

Runtime variables:

- Play requires `TEAPOT_AGENT_BRIDGE_URL` and `TEAPOT_AGENT_BRIDGE_SECRET`; the URL must resolve only on the private service network.
- `TEAPOT_HOSTED_BRIDGE_SECRET` is required and must contain at least 32 characters. It must match Play's `TEAPOT_AGENT_BRIDGE_SECRET`. `TEAPOT_CODEX_BRIDGE_SERVICE_SECRET` is kept as the Codex bridge compatibility alias.
- `TEAPOT_CODEX_AUTH_ROOT` is required and stores isolated server-side provider sessions.
- `TEAPOT_CLAUDE_AUTH_ROOT` stores isolated Claude configuration and is set to `/var/lib/teapot-agent-auth/claude` by Compose.
- `TEAPOT_CODEX_BRIDGE_HOST` defaults to `0.0.0.0` in the container.
- `TEAPOT_CODEX_BRIDGE_PORT` is set to `17375` by Compose.
- `TEAPOT_CODEX_CLI` can override the Codex executable for controlled testing.
- `TEAPOT_CLAUDE_CLI` defaults to the pinned `claude` executable in the bridge image.

Do not publish the bridge port or attach Traefik labels. All paid generation still passes through Teapot's authenticated proposal/approval flow.
