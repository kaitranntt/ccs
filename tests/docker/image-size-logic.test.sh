#!/usr/bin/env bash
# Unit tests for image-size.sh pass/fail logic using mock docker output.
# Does NOT require a real Docker daemon or pulled images.
# Run: bash tests/docker/image-size-logic.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/image-size.sh"

PASS=0
FAIL=0

run_test() {
  local name="$1"
  local expected_exit="$2"
  shift 2
  # Remaining args: env vars to set before calling the script
  local actual_exit=0
  (
    # Override docker with a mock that returns a fixed size
    eval "$@"
    bash "$SCRIPT" "mock-image:tag" "$MAX_BYTES" > /dev/null 2>&1
  ) || actual_exit=$?

  if [[ "$actual_exit" -eq "$expected_exit" ]]; then
    echo "[OK] ${name}"
    (( PASS++ )) || true
  else
    echo "[X] ${name}: expected exit ${expected_exit}, got ${actual_exit}"
    (( FAIL++ )) || true
  fi
}

# ------------------------------------------------------------------
# We mock docker by injecting a wrapper into PATH that echoes a fixed
# size value for `docker image inspect` and pretends inspect succeeds.
# ------------------------------------------------------------------

MOCK_DIR="$(mktemp -d)"
COMPOSE_FIXTURE_DIR=""
trap 'rm -rf "$MOCK_DIR" "$COMPOSE_FIXTURE_DIR"' EXIT

make_mock_docker() {
  local size="$1"
  cat > "${MOCK_DIR}/docker" <<EOF
#!/usr/bin/env bash
# Mock docker for image-size.sh tests
if [[ "\$1" == "image" && "\$2" == "inspect" ]]; then
  echo "${size}"
  exit 0
fi
# pull / other sub-commands: succeed silently
exit 0
EOF
  chmod +x "${MOCK_DIR}/docker"
}

run_mock_test() {
  local name="$1"
  local expected_exit="$2"
  local mock_size="$3"
  local max_bytes="$4"

  make_mock_docker "$mock_size"

  local actual_exit=0
  PATH="${MOCK_DIR}:${PATH}" bash "$SCRIPT" "mock-image:tag" "$max_bytes" > /dev/null 2>&1 || actual_exit=$?

  if [[ "$actual_exit" -eq "$expected_exit" ]]; then
    echo "[OK] ${name}"
    (( PASS++ )) || true
  else
    echo "[X] ${name}: expected exit ${expected_exit}, got ${actual_exit}"
    (( FAIL++ )) || true
  fi
}

# ------------------------------------------------------------------
# Tests
# ------------------------------------------------------------------

echo ""
echo "Running image-size.sh unit tests..."
echo ""

# Pass: actual < budget
run_mock_test "pass when actual size < budget" 0 \
  "300000000" "367001600"

# Pass: actual == budget (boundary)
run_mock_test "pass when actual size == budget (boundary)" 0 \
  "367001600" "367001600"

# Fail: actual > budget by 1 byte
run_mock_test "fail when actual size exceeds budget by 1 byte" 1 \
  "367001601" "367001600"

# Fail: actual is much larger than budget
run_mock_test "fail when actual size greatly exceeds budget" 1 \
  "900000000" "629145600"

# Error: wrong arg count (no args)
actual_exit=0
bash "$SCRIPT" > /dev/null 2>&1 || actual_exit=$?
if [[ "$actual_exit" -ne 0 ]]; then
  echo "[OK] fail when called with no args"
  (( PASS++ )) || true
else
  echo "[X] fail when called with no args: expected non-zero exit"
  (( FAIL++ )) || true
fi

# Error: non-integer max-bytes
actual_exit=0
PATH="${MOCK_DIR}:${PATH}" bash "$SCRIPT" "mock-image:tag" "not-a-number" > /dev/null 2>&1 || actual_exit=$?
if [[ "$actual_exit" -ne 0 ]]; then
  echo "[OK] fail when max-bytes is not an integer"
  (( PASS++ )) || true
else
  echo "[X] fail when max-bytes is not an integer: expected non-zero exit"
  (( FAIL++ )) || true
fi

# ------------------------------------------------------------------
# --platform branch tests (multi-arch via imagetools)
# ------------------------------------------------------------------
# Mock docker that handles `docker buildx imagetools inspect` by echoing
# a fixed layer-size string (space-separated byte counts as imagetools does).
# The mock ignores the --format flag and just prints precomputed sizes.
# ------------------------------------------------------------------

make_mock_docker_platform() {
  local layer_output="$1"   # space-separated byte values, e.g. "100000000 50000000"
  cat > "${MOCK_DIR}/docker" <<'MOCK_EOF'
#!/usr/bin/env bash
# Mock docker for --platform branch tests
if [[ "$1" == "buildx" && "$2" == "imagetools" && "$3" == "inspect" ]]; then
MOCK_EOF
  # Inject the layer_output value into the mock script
  printf '  echo "%s"\n' "$layer_output" >> "${MOCK_DIR}/docker"
  cat >> "${MOCK_DIR}/docker" <<'MOCK_EOF'
  exit 0
fi
# image inspect / pull / other sub-commands: succeed silently
exit 0
MOCK_EOF
  chmod +x "${MOCK_DIR}/docker"
}

make_mock_docker_platform_fail() {
  # imagetools inspect returns nothing (simulates buildx incompatibility)
  cat > "${MOCK_DIR}/docker" <<'MOCK_EOF'
#!/usr/bin/env bash
if [[ "$1" == "buildx" && "$2" == "imagetools" && "$3" == "inspect" ]]; then
  exit 1
fi
exit 0
MOCK_EOF
  chmod +x "${MOCK_DIR}/docker"
}

make_mock_docker_platform_raw_index() {
  # First inspect returns a multi-arch index; digest inspect returns the
  # platform manifest with real layer sizes. This mirrors GHCR OCI output.
  cat > "${MOCK_DIR}/docker" <<'MOCK_EOF'
#!/usr/bin/env bash
if [[ "$1" == "buildx" && "$2" == "imagetools" && "$3" == "inspect" ]]; then
  ref="$4"
  if [[ "$ref" == "mock-image:tag" ]]; then
    cat <<'JSON'
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "manifests": [
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "sha256:amd64digest",
      "platform": { "os": "linux", "architecture": "amd64" }
    },
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "sha256:arm64digest",
      "platform": { "os": "linux", "architecture": "arm64" }
    }
  ]
}
JSON
    exit 0
  fi
  if [[ "$ref" == "mock-image:tag@sha256:amd64digest" ]]; then
    cat <<'JSON'
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "layers": [
    { "size": 100000000 },
    { "size": 57671680 }
  ]
}
JSON
    exit 0
  fi
  exit 1
fi
exit 0
MOCK_EOF
  chmod +x "${MOCK_DIR}/docker"
}

run_platform_test() {
  local name="$1"
  local expected_exit="$2"
  local max_bytes="$3"
  # mock docker already set by caller

  local actual_exit=0
  PATH="${MOCK_DIR}:${PATH}" bash "$SCRIPT" "mock-image:tag" "$max_bytes" \
    --platform linux/amd64 > /dev/null 2>&1 || actual_exit=$?

  if [[ "$actual_exit" -eq "$expected_exit" ]]; then
    echo "[OK] ${name}"
    (( PASS++ )) || true
  else
    echo "[X] ${name}: expected exit ${expected_exit}, got ${actual_exit}"
    (( FAIL++ )) || true
  fi
}

echo ""
echo "Running --platform branch tests..."
echo ""

# --platform pass: two layers summing to 150 MB, budget 200 MB
make_mock_docker_platform "100000000 57671680"
run_platform_test "--platform: pass when platform-scoped size < budget" 0 "209715200"

# --platform fail: two layers summing to 250 MB, budget 200 MB
make_mock_docker_platform "150000000 112000000"
run_platform_test "--platform: fail when platform-scoped size > budget" 1 "209715200"

# --platform raw OCI index: resolve the platform digest then sum manifest layers
make_mock_docker_platform_raw_index
run_platform_test "--platform: resolves raw OCI index before summing layers" 0 "209715200"

# --platform inspect failure → must exit 1 (REV5 regression guard)
make_mock_docker_platform_fail
run_platform_test "--platform: fail loudly when imagetools inspect fails (REV5 guard)" 1 "209715200"

# --platform returns "0" → must exit 1 (REV5 guard for zero-byte output)
make_mock_docker_platform "0"
run_platform_test "--platform: fail loudly when reported size is 0 (REV5 guard)" 1 "209715200"

# --platform returns empty string → must exit 1 (REV5 guard for empty output)
make_mock_docker_platform ""
run_platform_test "--platform: fail loudly when size output is empty (REV5 guard)" 1 "209715200"

# ------------------------------------------------------------------
# compose-parity image_name() regression — M5 guard
#
# Verifies the sed pipeline in tests/docker/compose-parity.sh correctly
# strips only the trailing :tag and does NOT truncate at the first colon
# (which would break registry:port/owner/repo references).
# ------------------------------------------------------------------
echo ""
echo "Running compose-parity image_name() regex tests..."
echo ""

# Inline the updated image_name() logic from compose-parity.sh so these tests
# run without depending on a compose file on disk.
_image_name_from_raw() {
  local raw="$1"
  printf '%s' "$raw" \
    | sed -E "s/^[\"']//; s/[\"']$//" \
    | sed -E 's/^\$\{[A-Za-z_][A-Za-z0-9_]*:-//; s/\}$//' \
    | sed 's|:[^:/]*$||' \
    | tr -d ' '
}

run_image_name_test() {
  local name="$1" input="$2" expected="$3"
  local got
  got=$(_image_name_from_raw "$input")
  if [[ "$got" == "$expected" ]]; then
    echo "[OK] ${name}"
    (( PASS++ )) || true
  else
    echo "[X] ${name}: expected='${expected}' got='${got}'"
    (( FAIL++ )) || true
  fi
}

# Plain image reference — tag stripped
run_image_name_test \
  "plain image: strip :tag" \
  "ghcr.io/kaitranntt/ccs:latest" \
  "ghcr.io/kaitranntt/ccs"

# Env-var-with-default syntax — wrapper stripped, then tag stripped
run_image_name_test \
  "env-var default: strip wrapper and :tag" \
  '${CCS_IMAGE:-ghcr.io/kaitranntt/ccs:latest}' \
  "ghcr.io/kaitranntt/ccs"

# Registry with port — internal colon preserved, only :tag stripped
run_image_name_test \
  "registry:port/owner/repo:tag — preserve internal colon" \
  "registry.local:5000/owner/repo:tag" \
  "registry.local:5000/owner/repo"

# ------------------------------------------------------------------
# compose-parity service-scoped extraction regression — reviewer guard
#
# Verifies the real compose-parity script does not read a later sidecar image
# when services.ccs itself lacks an image.
# ------------------------------------------------------------------
echo ""
echo "Running compose-parity scoped extraction tests..."
echo ""

COMPOSE_FIXTURE_DIR="$(mktemp -d)"
CANONICAL_FIXTURE="${COMPOSE_FIXTURE_DIR}/compose.yaml"
INTEGRATED_FIXTURE="${COMPOSE_FIXTURE_DIR}/integrated.yaml"

cat > "$CANONICAL_FIXTURE" <<'YAML'
services:
  ccs:
    ports:
      - "3000:3000"
      - "8317:8317"
    volumes:
      - ccs_home:/root/.ccs
      - ccs_logs:/var/log/ccs
    networks:
      - ccs-net
  sidecar:
    image: ghcr.io/kaitranntt/ccs:latest
volumes:
  ccs_home:
  ccs_logs:
networks:
  ccs-net:
    name: ccs-net
YAML

cat > "$INTEGRATED_FIXTURE" <<'YAML'
services:
  ccs-cliproxy:
    image: ccs-cliproxy:latest
    ports:
      - "3000:3000"
      - "8317:8317"
    volumes:
      - ccs_home:/root/.ccs
      - ccs_logs:/var/log/ccs
volumes:
  ccs_home:
  ccs_logs:
YAML

actual_exit=0
COMPOSE_PARITY_CANONICAL="$CANONICAL_FIXTURE" \
  COMPOSE_PARITY_INTEGRATED="$INTEGRATED_FIXTURE" \
  bash "${SCRIPT_DIR}/compose-parity.sh" > /dev/null 2>&1 || actual_exit=$?

if [[ "$actual_exit" -ne 0 ]]; then
  echo "[OK] compose-parity does not bleed into later sidecar image"
  (( PASS++ )) || true
else
  echo "[X] compose-parity should fail when services.ccs lacks an image"
  (( FAIL++ )) || true
fi

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
