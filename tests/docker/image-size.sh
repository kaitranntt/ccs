#!/usr/bin/env bash
# Asserts that a Docker image does not exceed a given byte budget.
#
# Usage: image-size.sh <image:tag> <max-bytes>
# Exit:  0 on pass, 1 on fail
#
# Examples:
#   image-size.sh ghcr.io/kaitranntt/ccs:latest    367001600   # 350 MB
#   image-size.sh ghcr.io/kaitranntt/ccs:full      629145600   # 600 MB
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "[X] Usage: $0 <image:tag> <max-bytes>" >&2
  exit 1
fi

IMAGE="$1"
MAX_BYTES="$2"

# Validate that max-bytes is a positive integer
if ! [[ "$MAX_BYTES" =~ ^[0-9]+$ ]]; then
  echo "[X] max-bytes must be a positive integer, got: ${MAX_BYTES}" >&2
  exit 1
fi

# Pull the image if not already present (allows use in a clean CI environment)
if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  echo "[i] Pulling ${IMAGE}..." >&2
  docker pull "$IMAGE" >&2
fi

ACTUAL_BYTES=$(docker image inspect "$IMAGE" --format='{{.Size}}' 2>/dev/null)

if [[ -z "$ACTUAL_BYTES" ]]; then
  echo "[X] Could not inspect image: ${IMAGE}" >&2
  exit 1
fi

ACTUAL_MB=$(( ACTUAL_BYTES / 1048576 ))
MAX_MB=$(( MAX_BYTES / 1048576 ))

if (( ACTUAL_BYTES > MAX_BYTES )); then
  echo "[X] Image size check FAILED: ${IMAGE}" >&2
  echo "    Actual:  ${ACTUAL_BYTES} bytes (${ACTUAL_MB} MB)" >&2
  echo "    Budget:  ${MAX_BYTES} bytes (${MAX_MB} MB)" >&2
  echo "    Excess:  $(( ACTUAL_BYTES - MAX_BYTES )) bytes ($(( ACTUAL_MB - MAX_MB )) MB over budget)" >&2
  exit 1
fi

echo "[OK] Image size check PASSED: ${IMAGE}"
echo "     Actual:  ${ACTUAL_BYTES} bytes (${ACTUAL_MB} MB)"
echo "     Budget:  ${MAX_BYTES} bytes (${MAX_MB} MB)"
echo "     Margin:  $(( MAX_BYTES - ACTUAL_BYTES )) bytes ($(( MAX_MB - ACTUAL_MB )) MB remaining)"
