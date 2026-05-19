#!/usr/bin/env bash
# Asserts that a Docker image does not exceed a given byte budget.
#
# Usage: image-size.sh <image:tag> <max-bytes> [--platform <platform>]
# Exit:  0 on pass, 1 on fail
#
# When --platform is given the manifest for that specific platform is inspected
# via `docker buildx imagetools inspect`, summing compressed layer sizes from
# the registry manifest. This avoids pulling the image locally for each arch
# and works on a multi-arch manifest list.
#
# Without --platform the locally cached image is inspected via
# `docker image inspect`, which only reports the host-native architecture.
#
# Examples:
#   image-size.sh ghcr.io/kaitranntt/ccs:latest  367001600
#   image-size.sh ghcr.io/kaitranntt/ccs:latest  367001600  --platform linux/amd64
#   image-size.sh ghcr.io/kaitranntt/ccs:latest  367001600  --platform linux/arm64
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "[X] Usage: $0 <image:tag> <max-bytes> [--platform <platform>]" >&2
  exit 1
fi

IMAGE="$1"
MAX_BYTES="$2"
PLATFORM=""

# Parse optional --platform flag
shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    *)
      echo "[X] Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Validate that max-bytes is a positive integer
if ! [[ "$MAX_BYTES" =~ ^[0-9]+$ ]]; then
  echo "[X] max-bytes must be a positive integer, got: ${MAX_BYTES}" >&2
  exit 1
fi

MAX_MB=$(( MAX_BYTES / 1048576 ))

if [[ -n "$PLATFORM" ]]; then
  # Multi-arch path: sum compressed layer sizes from the registry manifest.
  # `docker buildx imagetools inspect --format` returns the manifest JSON for
  # the given platform. We sum the `size` field of each layer entry.
  echo "[i] Inspecting ${IMAGE} for platform ${PLATFORM} via registry manifest..." >&2
  ACTUAL_BYTES=$(
    docker buildx imagetools inspect "${IMAGE}" \
      --format "{{ range .Manifest.Layers }}{{ .Size }} {{ end }}" \
      --raw 2>/dev/null \
    | tr ' ' '\n' \
    | awk 'NF && /^[0-9]+$/ { sum += $1 } END { print sum+0 }' \
    2>/dev/null || echo ""
  )

  if [[ -z "$ACTUAL_BYTES" || "$ACTUAL_BYTES" == "0" ]]; then
    # Fallback: try the platform-specific sub-manifest
    echo "[i] Falling back to platform-scoped imagetools inspect..." >&2
    ACTUAL_BYTES=$(
      docker buildx imagetools inspect "${IMAGE}@$(
        docker buildx imagetools inspect "${IMAGE}" \
          --format "{{ range .Manifest.Manifests }}{{ if eq .Platform.OS \"$(echo "${PLATFORM}" | cut -d/ -f1)\" }}{{ if eq .Platform.Architecture \"$(echo "${PLATFORM}" | cut -d/ -f2)\" }}{{ .Digest }}{{ end }}{{ end }}{{ end }}" \
          2>/dev/null | head -1
      )" --format "{{ range .Manifest.Layers }}{{ .Size }} {{ end }}" 2>/dev/null \
      | tr ' ' '\n' \
      | awk 'NF && /^[0-9]+$/ { sum += $1 } END { print sum+0 }' \
      2>/dev/null || echo ""
    )
  fi

  if [[ -z "$ACTUAL_BYTES" || "$ACTUAL_BYTES" == "0" ]]; then
    echo "[X] Could not determine size for ${IMAGE} platform=${PLATFORM}" >&2
    echo "    Possible causes: buildx version too old, manifest format unsupported, image not pushed yet" >&2
    echo "    Refusing to silently pass — fix the inspection or push the image first" >&2
    exit 1
  fi
else
  # Local-image path: use docker image inspect (host architecture only)
  if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
    echo "[i] Pulling ${IMAGE}..." >&2
    docker pull "$IMAGE" >&2
  fi

  ACTUAL_BYTES=$(docker image inspect "$IMAGE" --format='{{.Size}}' 2>/dev/null)

  if [[ -z "$ACTUAL_BYTES" ]]; then
    echo "[X] Could not inspect image: ${IMAGE}" >&2
    exit 1
  fi
fi

ACTUAL_MB=$(( ACTUAL_BYTES / 1048576 ))
LABEL="${IMAGE}${PLATFORM:+ (${PLATFORM})}"

if (( ACTUAL_BYTES > MAX_BYTES )); then
  echo "[X] Image size check FAILED: ${LABEL}" >&2
  echo "    Actual:  ${ACTUAL_BYTES} bytes (${ACTUAL_MB} MB)" >&2
  echo "    Budget:  ${MAX_BYTES} bytes (${MAX_MB} MB)" >&2
  echo "    Excess:  $(( ACTUAL_BYTES - MAX_BYTES )) bytes ($(( ACTUAL_MB - MAX_MB )) MB over budget)" >&2
  exit 1
fi

echo "[OK] Image size check PASSED: ${LABEL}"
echo "     Actual:  ${ACTUAL_BYTES} bytes (${ACTUAL_MB} MB)"
echo "     Budget:  ${MAX_BYTES} bytes (${MAX_MB} MB)"
echo "     Margin:  $(( MAX_BYTES - ACTUAL_BYTES )) bytes ($(( MAX_MB - ACTUAL_MB )) MB remaining)"
