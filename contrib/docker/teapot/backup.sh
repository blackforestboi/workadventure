#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../../.." && pwd)"
env_file="${TEAPOT_ENV_FILE:-${repo_dir}/contrib/docker/.env.teapot}"
backup_root="${TEAPOT_BACKUP_DIR:-${repo_dir}/backups/teapot}"
checkpoint="$(date -u +%Y%m%dT%H%M%SZ)"
destination="${backup_root}/${checkpoint}"
compose=(docker compose --env-file "${env_file}" -f "${repo_dir}/contrib/docker/docker-compose.prod.yaml" -f "${repo_dir}/contrib/docker/docker-compose.teapot.yaml")
writers=(play back map-storage teapot-mcp)
writers_stopped=false

restart_writers() {
    if [[ "${writers_stopped}" == "true" ]]; then
        "${compose[@]}" start "${writers[@]}" >/dev/null
    fi
}
trap restart_writers EXIT

mkdir -p "${destination}"

# A brief write pause makes PostgreSQL metadata, map bytes, generated Wokas, and
# their revision pointers one recoverable checkpoint rather than four unrelated backups.
"${compose[@]}" stop "${writers[@]}" >/dev/null
writers_stopped=true

"${compose[@]}" exec -T postgres sh -c \
    'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom --no-owner' \
    >"${destination}/postgres.dump"

"${compose[@]}" run --rm --no-deps --entrypoint tar play \
    -C /data/teapot-wokas -czf - . >"${destination}/woka-assets.tar.gz"
"${compose[@]}" run --rm --no-deps --entrypoint tar map-storage \
    -C /maps -czf - . >"${destination}/map-storage.tar.gz"

(
    cd "${destination}"
    shasum -a 256 postgres.dump woka-assets.tar.gz map-storage.tar.gz >SHA256SUMS
)

cat >"${destination}/checkpoint.json" <<EOF
{
  "checkpoint": "${checkpoint}",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "schema": 1,
  "components": ["postgres.dump", "woka-assets.tar.gz", "map-storage.tar.gz"]
}
EOF

restart_writers
writers_stopped=false
trap - EXIT

echo "Teapot checkpoint written to ${destination}"
