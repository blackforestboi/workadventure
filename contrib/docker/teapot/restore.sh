#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm" || -z "${2:-}" ]]; then
    echo "Usage: $0 --confirm /absolute/path/to/checkpoint" >&2
    exit 2
fi

checkpoint_dir="$(cd "$2" && pwd)"
for required in checkpoint.json SHA256SUMS postgres.dump woka-assets.tar.gz map-storage.tar.gz; do
    if [[ ! -f "${checkpoint_dir}/${required}" ]]; then
        echo "Checkpoint is missing ${required}" >&2
        exit 2
    fi
done
(
    cd "${checkpoint_dir}"
    shasum -a 256 -c SHA256SUMS
)

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/../../.." && pwd)"
env_file="${TEAPOT_ENV_FILE:-${repo_dir}/contrib/docker/.env.teapot}"
compose=(docker compose --env-file "${env_file}" -f "${repo_dir}/contrib/docker/docker-compose.prod.yaml" -f "${repo_dir}/contrib/docker/docker-compose.teapot.yaml")
writers=(play back map-storage teapot-mcp)

"${compose[@]}" stop "${writers[@]}"

"${compose[@]}" exec -T postgres sh -c \
    'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner' \
    <"${checkpoint_dir}/postgres.dump"

"${compose[@]}" run --rm --no-deps --entrypoint sh play \
    -c 'find /data/teapot-wokas -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'
"${compose[@]}" run --rm --no-deps --entrypoint tar play \
    -C /data/teapot-wokas -xzf - <"${checkpoint_dir}/woka-assets.tar.gz"

"${compose[@]}" run --rm --no-deps --entrypoint sh map-storage \
    -c 'find /maps -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'
"${compose[@]}" run --rm --no-deps --entrypoint tar map-storage \
    -C /maps -xzf - <"${checkpoint_dir}/map-storage.tar.gz"

"${compose[@]}" start "${writers[@]}"
echo "Teapot restored from ${checkpoint_dir}"
