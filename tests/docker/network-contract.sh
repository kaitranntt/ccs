#!/usr/bin/env bash
# tests/docker/network-contract.sh
#
# Verifies the stable ccs-net Docker network contract:
#   - Network name: ccs-net
#   - Service DNS:  ccs
#   - CLIProxy:     http://ccs:8317
#   - Dashboard:    http://ccs:3000
#
# Requires: Docker with compose plugin, internet access to pull curlimages/curl
# Usage: bash tests/docker/network-contract.sh [compose-file] [image-ref]
#   compose-file  Path to compose file (default: docker/compose.yaml)
#   image-ref     Override the image used in the compose file (optional).
#                 When set, the compose stack is run with that image instead
#                 of whatever is pinned in the compose file.
#   Called from repo root so the default path resolves.
#
set -euo pipefail

COMPOSE_FILE="${1:-docker/compose.yaml}"
IMAGE_OVERRIDE="${2:-}"
DASHBOARD_HOST_PORT="${CCS_NETWORK_CONTRACT_DASHBOARD_PORT:-${CCS_DASHBOARD_PORT:-13001}}"
CLIPROXY_HOST_PORT="${CCS_NETWORK_CONTRACT_CLIPROXY_PORT:-${CCS_CLIPROXY_PORT:-18318}}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { printf '[i] %s\n' "$*"; }
ok()  { printf '[OK] %s\n' "$*"; }
err() { printf '[X] %s\n' "$*" >&2; }

compose() {
  if [[ -n "$IMAGE_OVERRIDE" ]]; then
    CCS_IMAGE="$IMAGE_OVERRIDE" \
    CCS_DASHBOARD_PORT="$DASHBOARD_HOST_PORT" \
    CCS_CLIPROXY_PORT="$CLIPROXY_HOST_PORT" \
      docker compose -f "$COMPOSE_FILE" "$@"
    return
  fi

  CCS_DASHBOARD_PORT="$DASHBOARD_HOST_PORT" \
  CCS_CLIPROXY_PORT="$CLIPROXY_HOST_PORT" \
    docker compose -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  log "Tearing down stack..."
  compose down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Bring stack up; register teardown on any exit
# ---------------------------------------------------------------------------
log "Bringing CCS stack up: $COMPOSE_FILE"
log "Using host ports: dashboard=${DASHBOARD_HOST_PORT}, cliproxy=${CLIPROXY_HOST_PORT}"
if [[ -n "$IMAGE_OVERRIDE" ]]; then
  log "Overriding image with: $IMAGE_OVERRIDE"
fi
compose up -d --remove-orphans

# ---------------------------------------------------------------------------
# Wait for healthcheck (max 90s) — use jq instead of python3 for CI portability
# ---------------------------------------------------------------------------
log "Waiting for healthcheck to pass (max 90s)..."
WAIT_MAX=45   # 45 x 2s = 90s
HEALTHY=0
for _i in $(seq 1 "$WAIT_MAX"); do
  STATUS=$(
    compose ps --format json 2>/dev/null \
      | jq -r 'if type == "array" then .[] else . end | select(.Service != null and (.Service | contains("ccs"))) | .Health // "unknown"' \
      2>/dev/null | head -1 || echo "unknown"
  )
  STATUS="${STATUS:-unknown}"
  if [ "$STATUS" = "healthy" ]; then
    HEALTHY=1
    break
  fi
  log "Health: $STATUS (attempt ${_i}/${WAIT_MAX})"
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  err "Container did not become healthy within 90s"
  exit 1
fi
ok "Container is healthy"

# ---------------------------------------------------------------------------
# Verify ccs-net network exists on the host
# ---------------------------------------------------------------------------
log "Inspecting ccs-net network..."
docker network inspect ccs-net >/dev/null
ok "ccs-net network exists"

# ---------------------------------------------------------------------------
# Verify DNS resolution from a sibling container on ccs-net
# ---------------------------------------------------------------------------
log "Testing http://ccs:8317 from sibling container..."
docker run --rm \
  --network ccs-net \
  curlimages/curl:latest \
  -fsS --max-time 10 \
  http://ccs:8317/ \
  >/dev/null
ok "CLIProxy reachable at http://ccs:8317"

log "Testing http://ccs:3000 from sibling container..."
docker run --rm \
  --network ccs-net \
  curlimages/curl:latest \
  -fsS --max-time 10 \
  http://ccs:3000/ \
  >/dev/null
ok "Dashboard reachable at http://ccs:3000"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
ok "network contract verified"
