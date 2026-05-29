#!/usr/bin/env bash
# Unit test for network-contract.sh Docker Compose env and args.
# Uses a fake docker binary; no Docker daemon required.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/network-contract.sh"

PASS=0
FAIL=0
MOCK_DIR="$(mktemp -d)"
LOG_FILE="${MOCK_DIR}/docker.log"
COMPOSE_FILE="${MOCK_DIR}/compose.yaml"
trap 'rm -rf "$MOCK_DIR"' EXIT

cat > "$COMPOSE_FILE" <<'YAML'
services:
  ccs:
    image: ${CCS_IMAGE:-ghcr.io/kaitranntt/ccs:latest}
YAML

cat > "${MOCK_DIR}/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

printf 'cmd=%s env_image=%s env_dashboard=%s env_cliproxy=%s args=%s\n' \
  "$1" "${CCS_IMAGE:-}" "${CCS_DASHBOARD_PORT:-}" "${CCS_CLIPROXY_PORT:-}" "$*" \
  >> "$DOCKER_MOCK_LOG"

if [[ "$1" == "compose" ]]; then
  if printf '%s\n' "$*" | grep -q 'ps --format json'; then
    printf '[{"Service":"ccs","Health":"healthy"}]\n'
  fi
  exit 0
fi

if [[ "$1" == "network" && "$2" == "inspect" && "$3" == "ccs-net" ]]; then
  exit 0
fi

if [[ "$1" == "run" ]]; then
  exit 0
fi

exit 1
MOCK
chmod +x "${MOCK_DIR}/docker"

run_test() {
  local name="$1"
  shift

  if "$@"; then
    echo "[OK] ${name}"
    (( PASS++ )) || true
  else
    echo "[X] ${name}"
    (( FAIL++ )) || true
  fi
}

run_contract() {
  PATH="${MOCK_DIR}:${PATH}" \
  DOCKER_MOCK_LOG="$LOG_FILE" \
  bash "$SCRIPT" "$COMPOSE_FILE" "ghcr.io/kaitranntt/ccs:test" >/dev/null
}

echo ""
echo "Running network-contract.sh env tests..."
echo ""

run_contract

run_test "compose up receives safe host ports and image override" \
  grep -q 'env_image=ghcr.io/kaitranntt/ccs:test env_dashboard=13001 env_cliproxy=18318 args=compose -f .* up -d --remove-orphans' "$LOG_FILE"

run_test "compose ps receives the same safe host ports" \
  grep -q 'env_image=ghcr.io/kaitranntt/ccs:test env_dashboard=13001 env_cliproxy=18318 args=compose -f .* ps --format json' "$LOG_FILE"

run_test "compose down removes volumes and orphans through cleanup trap" \
  grep -q 'env_image=ghcr.io/kaitranntt/ccs:test env_dashboard=13001 env_cliproxy=18318 args=compose -f .* down -v --remove-orphans' "$LOG_FILE"

run_test "sibling probes keep the ccs-net DNS contract" \
  grep -q 'args=run --rm --network ccs-net curlimages/curl:latest -fsS --max-time 10 http://ccs:8317/' "$LOG_FILE"

run_test "dashboard sibling probe keeps internal port 3000" \
  grep -q 'args=run --rm --network ccs-net curlimages/curl:latest -fsS --max-time 10 http://ccs:3000/' "$LOG_FILE"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
