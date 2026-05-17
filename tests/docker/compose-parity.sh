#!/usr/bin/env bash
# tests/docker/compose-parity.sh
#
# Asserts that docker/compose.yaml and docker/docker-compose.integrated.yml
# agree on the fields that form the stable network contract:
#   - image name (without tag)
#   - exposed host ports
#   - named volume mounts
#
# This prevents drift between the public quickstart compose and the
# `ccs docker` CLI compose that is bundled with the package.
#
# Usage: bash tests/docker/compose-parity.sh
#   (called from repo root)
#
set -euo pipefail

CANONICAL="docker/compose.yaml"
INTEGRATED="docker/docker-compose.integrated.yml"

fail=0

log()  { printf '[i] %s\n' "$*"; }
ok()   { printf '[OK] %s\n' "$*"; }
fail() { printf '[X] %s\n' "$*" >&2; fail=1; }

# ---------------------------------------------------------------------------
# Helper: extract image name (repo path without tag) for a service.
# Handles both plain image references and ${VAR:-default} shell variable
# syntax (e.g. image: ${CCS_IMAGE:-ghcr.io/kaitranntt/ccs:latest}).
# ---------------------------------------------------------------------------
image_name() {
  local file="$1" service="$2"
  # Match lines like:
  #   image: ghcr.io/owner/repo:tag
  #   image: ${CCS_IMAGE:-ghcr.io/owner/repo:tag}
  grep -A 50 "^  ${service}:" "$file" \
    | grep -m1 '^\s*image:' \
    | sed 's/.*image:\s*//' \
    | sed 's/\${[^:-]*:-\([^}]*\)}/\1/' \
    | sed 's/:.*//' \
    | tr -d ' '
}

# ---------------------------------------------------------------------------
# Helper: extract sorted list of internal container ports exposed
# ---------------------------------------------------------------------------
exposed_ports() {
  local file="$1"
  # Match port mappings: "HOST:CONTAINER" — extract CONTAINER port number
  grep -E '^\s+- "[0-9]+:[0-9]+"' "$file" \
    | sed 's/.*:\([0-9]*\)".*/\1/' \
    | sort -n
}

# ---------------------------------------------------------------------------
# Helper: extract sorted list of named volume mount targets (container paths)
# ---------------------------------------------------------------------------
volume_targets() {
  local file="$1"
  # Match volume entries: - name:/container/path
  grep -E '^\s+- [a-z_]+:/' "$file" \
    | sed 's/.*:\(\/[^[:space:]]*\).*/\1/' \
    | sort
}

# ---------------------------------------------------------------------------
# Expected image names (without tag) — source of truth for this assertion.
#
# canonical (docker/compose.yaml):
#   Pulls from the public registry. Default image is ghcr.io/kaitranntt/ccs.
#
# integrated (docker/docker-compose.integrated.yml):
#   Built locally from Dockerfile.integrated; the resulting image is tagged
#   ccs-cliproxy (no registry prefix) so it stays separate from the public
#   image but is still clearly a CCS-family image.
# ---------------------------------------------------------------------------
EXPECTED_CANONICAL_IMAGE="ghcr.io/kaitranntt/ccs"
EXPECTED_INTEGRATED_IMAGE="ccs-cliproxy"

# ---------------------------------------------------------------------------
# 1. Image name (repo without tag) — assert exact match against expected names
# ---------------------------------------------------------------------------
log "Checking image name parity..."

CANONICAL_IMAGE=$(image_name "$CANONICAL" "ccs")
INTEGRATED_IMAGE=$(image_name "$INTEGRATED" "ccs-cliproxy")

if [[ "${CANONICAL_IMAGE}" != "${EXPECTED_CANONICAL_IMAGE}" ]]; then
  fail "Canonical image name mismatch — expected='${EXPECTED_CANONICAL_IMAGE}' got='${CANONICAL_IMAGE}'"
else
  ok "Canonical image name matches expected (${CANONICAL_IMAGE})"
fi

if [[ "${INTEGRATED_IMAGE}" != "${EXPECTED_INTEGRATED_IMAGE}" ]]; then
  fail "Integrated image name mismatch — expected='${EXPECTED_INTEGRATED_IMAGE}' got='${INTEGRATED_IMAGE}'"
else
  ok "Integrated image name matches expected (${INTEGRATED_IMAGE})"
fi

# ---------------------------------------------------------------------------
# 2. Exposed ports — both must expose 3000 and 8317
# Matches both quoted ("HOST:CONTAINER") and unquoted (HOST:CONTAINER) forms,
# as well as variable-interpolated host ports like "${VAR:-3000}:3000".
# ---------------------------------------------------------------------------
log "Checking exposed port parity..."

port_exposed() {
  local file="$1" port="$2"
  # Match container port in: "anything:PORT" or anything:PORT (quoted or bare)
  grep -E "(\"[^\"]*:${port}\"|[[:space:]]-[[:space:]]+[^\"]*:${port}[^0-9])" "$file" \
    > /dev/null 2>&1
}

REQUIRED_PORTS=("3000" "8317")
for port in "${REQUIRED_PORTS[@]}"; do
  IN_CANONICAL=0
  IN_INTEGRATED=0
  port_exposed "$CANONICAL" "$port"   && IN_CANONICAL=1 || true
  port_exposed "$INTEGRATED" "$port"  && IN_INTEGRATED=1 || true

  if [[ "$IN_CANONICAL" -eq 1 && "$IN_INTEGRATED" -eq 1 ]]; then
    ok "Port ${port} exposed in both compose files"
  elif [[ "$IN_CANONICAL" -eq 0 ]]; then
    fail "Port ${port} missing from ${CANONICAL}"
  else
    fail "Port ${port} missing from ${INTEGRATED}"
  fi
done

# ---------------------------------------------------------------------------
# 3. Named volume mount targets — both must mount /root/.ccs and /var/log/ccs
# ---------------------------------------------------------------------------
log "Checking volume mount parity..."

REQUIRED_MOUNTS=("/root/.ccs" "/var/log/ccs")
for mount in "${REQUIRED_MOUNTS[@]}"; do
  if grep -q ":${mount}" "$CANONICAL" && grep -q ":${mount}" "$INTEGRATED"; then
    ok "Volume mount ${mount} present in both compose files"
  elif ! grep -q ":${mount}" "$CANONICAL"; then
    fail "Volume mount ${mount} missing from ${CANONICAL}"
  else
    fail "Volume mount ${mount} missing from ${INTEGRATED}"
  fi
done

# ---------------------------------------------------------------------------
# 4. Network name — canonical must define ccs-net; integrated inherits default
# ---------------------------------------------------------------------------
log "Checking ccs-net network definition..."
if grep -q "name: ccs-net" "$CANONICAL"; then
  ok "ccs-net network defined in ${CANONICAL}"
else
  fail "ccs-net network definition missing from ${CANONICAL}"
fi

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ "$fail" -ne 0 ]]; then
  echo "" >&2
  echo "[X] Compose parity check FAILED — update ${INTEGRATED} to match ${CANONICAL}" >&2
  exit 1
fi

echo ""
ok "Compose parity check passed"
