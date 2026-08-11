# Teapot Maps beta deployment

This overlay deploys the repository's own `play` and `map-storage` images, PostgreSQL-backed Teapot records, a durable generated-Woka volume, the MCP service behind the existing TLS Traefik stack, and an internal AI agent bridge for Codex and Claude subscription OAuth. It deliberately does not use upstream `play` or `map-storage` images for Teapot code.

## First deployment

1. Copy `.env.teapot.example` to `.env.teapot` and replace every `CHANGE_ME` value. Keep the file out of Git and restrict it to the deployment account. `TEAPOT_AGENT_BRIDGE_SECRET` must be a unique random value of at least 32 characters.
2. Register this exact X callback URL: `https://<DOMAIN>/teapot/auth/x/callback`.
3. Set `TEAPOT_X_BOOTSTRAP_USER_IDS` to at least one stable X user ID. A bootstrap user can admit the first cohort; remove stale bootstrap IDs after operators exist.
4. Create the DNS record for `DOMAIN`, open TCP 80/443 (and 50051 only if the public room API is required), and verify the ACME email.
5. Build and start:

```bash
docker compose \
  --env-file contrib/docker/.env.teapot \
  -f contrib/docker/docker-compose.prod.yaml \
  -f contrib/docker/docker-compose.teapot.yaml \
  up -d --build
```

6. Inspect readiness without printing container environments:

```bash
docker compose \
  --env-file contrib/docker/.env.teapot \
  -f contrib/docker/docker-compose.prod.yaml \
  -f contrib/docker/docker-compose.teapot.yaml \
  ps

contrib/docker/teapot/smoke.sh "https://<DOMAIN>"
```

The browser stores OpenRouter keys only in session memory or in the encrypted client vault. Codex and Claude subscription credentials remain inside the access-restricted `teapot-agent-auth` server volume. The bridge has no published port or Traefik route: the browser reaches it only through authenticated Play endpoints.

After the first start, connect each provider from the in-game AI settings overlay. Codex displays its device verification URL and code. Claude displays its hosted authorization URL and, when required, accepts the returned authorization code. Restart `teapot-agent-bridge` and confirm both connections remain available before inviting testers.

## Beta acceptance: two browsers

Run this after every deploy and after every restore.

- Browser A authenticates with X. Before three distinct endorsements, the pending screen shows the current count and world entry remains blocked.
- Three already-admitted accounts confirm the named candidate once each. Replays, self-endorsement, duplicate endorsers, expired links, and a fourth use of a consumed confirmation do not advance the count.
- Browser A enters the same room as Browser B. Movement, proximity audio, text chat, and reconnect work in both directions.
- Browser A connects a hosted Codex or Claude subscription (or unlocks an encrypted OpenRouter vault), supplies a reference image, reviews one model/cost approval, generates a Woka, accepts it, and reconnects. Browser B sees the immutable generated texture.
- A rejected or malformed Woka leaves the prior avatar selected. Cancel and out-of-order generation results do not replace a newer candidate.
- Browser A generates a transparent map object, places it, waits for the server acknowledgement, reloads, and still sees it. A forced map-storage rejection retains the draft and retry reuses the same command/entity IDs.
- Browser A paints a small floor region and publishes revision N+1. Browser B sees the update. A stale expected revision is rejected without changing the map.
- An MCP client lists capabilities, validates and drafts a structured proposal. The browser inbox shows client/tool identity, change summary, preview, expected revision, expiry, and any paid cost. Deny and expiry are terminal; approve can be used once; the applied proposal is visible to Browser B.
- Restart `play`, `back`, and `map-storage`, then repeat reconnect checks for identity, admission, active Woka, map object, and map revision.

## Secret and log canary

Before inviting testers, submit unique fake canary strings through each credential, OAuth-code, and reference-image field. Exercise success, cancellation, provider 401/429, map rejection, and server error paths. Search the reverse proxy, Play, and agent-bridge logs for those strings. Do not proceed if a provider credential, OAuth code, Authorization header, provider request body, reference image, or encrypted-vault passphrase appears.

## Consistent backups

Teapot metadata and map/asset bytes live in different stores, so independent backups are not a valid recovery point. The backup script briefly stops write-capable services, then captures PostgreSQL, generated Wokas, and map-storage bytes into one checksummed checkpoint:

```bash
TEAPOT_ENV_FILE="$PWD/contrib/docker/.env.teapot" \
TEAPOT_BACKUP_DIR="/srv/teapot-backups" \
contrib/docker/teapot/backup.sh
```

Copy completed checkpoint directories to encrypted off-host storage. Test a restore on a non-production domain before relying on retention. Do not delete the last known-good checkpoint during a release.

The application checkpoint intentionally excludes `teapot-agent-auth`, because it contains live provider session credentials. The named volume survives service/container restarts. For host-loss recovery, reconnect subscriptions after restore; if operations require backing up this volume, use a separately encrypted credential backup with tighter access and rotation than application checkpoints.

## Restore

Restoration replaces application records and both asset stores. Verify the target directory and checksums, then use the explicit confirmation flag:

```bash
TEAPOT_ENV_FILE="$PWD/contrib/docker/.env.teapot" \
contrib/docker/teapot/restore.sh --confirm /srv/teapot-backups/20260809T120000Z
```

Run the HTTP smoke and complete the two-browser identity/Woka/map/MCP subset afterward. If restore verification fails, keep writers stopped and preserve both the failed target volumes and checkpoint for diagnosis.

## Release and rollback

1. Create a checkpoint.
2. Record the Git SHA and image digests.
3. Build with a new immutable `TEAPOT_IMAGE_TAG` and deploy.
4. Run the HTTP and two-browser acceptance checks.
5. For an application-only regression, redeploy the prior image tag. For a migration or persisted-data regression, restore the pre-release checkpoint before starting the prior images.

Never roll back only PostgreSQL or only map-storage: that can leave catalog IDs and revision pointers referring to missing or mismatched bytes.
