#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?Usage: $0 https://teapot.example.com}"
base_url="${base_url%/}"

request() {
    local label="$1"
    local url="$2"
    local expected="$3"
    local status
    status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "${url}")"
    if [[ ! "${status}" =~ ${expected} ]]; then
        echo "FAIL ${label}: HTTP ${status}" >&2
        exit 1
    fi
    echo "OK   ${label}: HTTP ${status}"
}

request "play liveness" "${base_url}/ping" '^200$'
request "Teapot readiness" "${base_url}/teapot/health/ready" '^200$'
request "map storage" "${base_url}/map-storage/ping" '^200$'
request "X auth boundary" "${base_url}/teapot/auth/x/start" '^(302|303|400|503)$'
request "MCP auth boundary" "${base_url}/mcp" '^(400|401|405)$'

echo "HTTP smoke checks passed. Complete the two-browser checklist in TEAPOT_BETA_RUNBOOK.md."
