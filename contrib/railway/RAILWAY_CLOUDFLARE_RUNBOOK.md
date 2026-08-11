# Teapot Maps on Railway + Cloudflare

This deploys Teapot Maps independently of Memex. Create a new Railway project
named `tpot-world`; do not add these services to any existing Memex project.
Only the `gateway` service receives a public domain. All other service traffic
uses the `*.railway.internal` private network.

## Credentials for automated provisioning

Copy `.env.provisioning.example` to `.env.provisioning` in this directory and
keep the latter local. It is ignored by Git. Supply an **account-level Railway
token**; the existing Memex `RAILWAY_TOKEN` is a project token and cannot create
the separate project. Create a Cloudflare custom token restricted to the
`tpot.world` zone with **Zone:Read**, **DNS:Edit**, and **Zone Settings:Edit**.

Run `node contrib/railway/preflight-provisioning.mjs` from the repository root.
It makes read-only requests and confirms the scopes without logging either token.

## 1. Confirm Cloudflare ownership

Namecheap is already configured with the Cloudflare nameservers. In Cloudflare,
wait until the `tpot.world` zone is **Active** before creating records. Do not
leave a parallel Namecheap DNS zone in use.

## 2. Create the Railway production project

1. In Railway, create the empty `tpot-world` project and a `production`
   environment. Select a single European region for every service and attached
   volume.
2. Add Railway-managed **PostgreSQL** and **Redis** database services. Keep
   their default names `Postgres` and `Redis` so the reference variables in
   `.env.production.template` resolve.
3. Create these application services from this GitHub repository, using the
   exact service names and custom config paths below. Set each service root
   directory to `/` because this is a shared Node monorepo.

| Service | Custom Railway config file | Public? |
| --- | --- | --- |
| `gateway` | `/contrib/railway/gateway/railway.toml` | Yes — only this one |
| `play` | `/contrib/railway/play/railway.toml` | No |
| `back` | `/contrib/railway/back/railway.toml` | No |
| `map-storage` | `/contrib/railway/map-storage/railway.toml` | No |
| `uploader` | `/contrib/railway/uploader/railway.toml` | No |
| `teapot-mcp` | `/contrib/railway/teapot-mcp/railway.toml` | No |
| `teapot-agent-bridge` | `/contrib/railway/teapot-agent-bridge/railway.toml` | No |
| `icon` | Docker image `matthiasluedtke/iconserver:v3.21.0` | No |

The companion `docker-compose.railway.yaml` is a visual/import topology, not a
place to put production secrets. Railway's managed PostgreSQL and Redis replace
the database containers in that file.

## 3. Attach durable state before the first boot

Railway volumes mount as root. Set `RAILWAY_RUN_UID=0` on these services before
attaching their volumes, then attach the stated paths:

| Service | Volume | Mount path |
| --- | --- | --- |
| `play` | `teapot-woka-assets` | `/data/teapot-wokas` |
| `map-storage` | `map-storage-data` | `/maps` |
| `teapot-agent-bridge` | `teapot-agent-auth` | `/var/lib/teapot-agent-auth` |

The provider-auth volume is particularly sensitive: it contains subscription
authorization material and must never be public, copied to preview environments,
or included in ordinary application backups.

## 4. Set Railway variables

Use `.env.production.template` as the value contract. Create the listed shared
secrets in **Project Settings → Shared Variables**, seal them, and attach each
only to its named service. Then use the Railway variable editor's autocomplete
to add the `Postgres` and `Redis` reference variables — do not copy rendered
database credentials into source control.

Set these additional production values deliberately:

- `TEAPOT_X_CLIENT_ID`, `TEAPOT_X_CLIENT_SECRET`, and
  `TEAPOT_X_BOOTSTRAP_USER_IDS` on `play`.
- Register exactly `https://tpot.world/teapot/auth/x/callback` in the X OAuth
  application.
- Configure `TURN_SERVER`, `TURN_USER`, and `TURN_PASSWORD` (or
  `TURN_STATIC_AUTH_SECRET`) before inviting users on restrictive networks.
  The default STUN-only value is not a production substitute for TURN.
- Leave public networking disabled on every service other than `gateway`.

Deploy in dependency order: databases, `map-storage`, `back`,
`teapot-agent-bridge`, `teapot-mcp`, `play`, `icon`, then `gateway`. A failed
health check should be fixed before deploying the next dependent service.

## 5. Connect `tpot.world`

1. In Railway `gateway` → **Settings → Networking**, add custom domain
   `tpot.world`. Railway gives a CNAME target and a TXT ownership-verification
   record; those generated values are authoritative.
2. In Cloudflare DNS, add the Railway CNAME at name `@`, turn the orange cloud
   **on**, and add the Railway TXT record exactly as supplied. The TXT record
   is required even though the CNAME resolves.
3. In Cloudflare **SSL/TLS**, use **Full** encryption mode. Railway explicitly
   documents this mode for an orange-cloud custom domain; do not select Full
   (strict) for this setup.
4. In Cloudflare, verify WebSockets are enabled. Add cache-bypass rules for
   `/ws/*`, `/api/*`, `/map-storage/*`, `/uploader/*`, `/mcp*`, and `/teapot/*`.
   Static frontend assets can use the normal Cloudflare cache behavior.
5. Optionally add `www` as a proxied CNAME to `@` and a Cloudflare Redirect Rule
   to `https://tpot.world/$1`. Do not add `www` as a Railway custom domain when
   the redirect is handled at Cloudflare.

Once Railway reports both the domain and TLS as ready, test
`https://tpot.world/teapot/health/ready`.

## 6. Continuous deployment and rollback

Connect all application services to the same GitHub production branch. The
checked-in watch patterns rebuild only services affected by a change; shared
library changes correctly rebuild their consumers. Configure Railway to wait for
required GitHub checks before deploying, and keep preview/PR environments off
until they have isolated databases and volumes.

Before a production release, record the commit SHA and take Railway backups of
PostgreSQL and all three volumes. After deploy, run the existing smoke test and
the two-browser acceptance cases in `contrib/docker/TEAPOT_BETA_RUNBOOK.md`.
For an application regression, use Railway's rollback to the prior deployment;
for a persistence regression, restore the matching PostgreSQL and asset-volume
recovery point together.

## Security boundary

Cloudflare is the public edge; Railway `gateway` is the only public origin.
PostgreSQL, Redis, `play`, `back`, map storage, MCP, and the agent bridge remain
private to the `tpot-world/production` Railway environment. This is the
enforced separation from Memex.
