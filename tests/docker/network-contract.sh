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
# Usage: bash tests/docker/network-contract.sh
#   (called from repo root so docker/compose.yaml path resolves)
#
set -euo pipefail

COMPOSE_FILE="docker/compose.yaml"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { printf '[i] %s\n' "$*"; }
ok()  { printf '[OK] %s\n' "$*"; }
err() { printf '[X] %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# Bring stack up; register teardown on any exit
# ---------------------------------------------------------------------------
log "Bringing CCS stack up: $COMPOSE_FILE"
docker compose -f "$COMPOSE_FILE" up -d

cleanup() {
  log "Tearing down stack..."
  docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Wait for healthcheck (max 90s)
# ---------------------------------------------------------------------------
log "Waiting for healthcheck to pass (max 90s)..."
WAIT_MAX=45   # 45 x 2s = 90s
HEALTHY=0
for _i in $(seq 1 "$WAIT_MAX"); do
  STATUS=$(
    docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null \
      | python3 -c "
import sys, json
data = sys.stdin.read().strip()
if not data:
    print('unknown')
    raise SystemExit(0)
rows = json.loads('[' + ','.join(data.splitlines()) + ']')
for r in rows:
    if 'ccs' in r.get('Service', ''):
        print(r.get('Health', 'unknown'))
        raise SystemExit(0)
print('unknown')
" 2>/dev/null || echo "unknown"
  )
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
