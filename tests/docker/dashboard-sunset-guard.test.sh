#!/usr/bin/env bash
# Unit tests for scripts/docker-dashboard-sunset-guard.js.
# Run: bash tests/docker/dashboard-sunset-guard.test.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT_DIR}/scripts/docker-dashboard-sunset-guard.js"

PASS=0
FAIL=0

run_guard() {
  local output_file="$1"
  local target="$2"
  local baseline="$3"
  local window="$4"
  local tags="$5"

  GITHUB_OUTPUT="$output_file" node "$SCRIPT" \
    --target "$target" \
    --baseline "$baseline" \
    --window "$window" \
    --tags-stdin <<< "$tags" >/dev/null 2>&1
}

assert_case() {
  local name="$1"
  local expected_exit="$2"
  local expected_publish="$3"
  local expected_elapsed="$4"
  local target="$5"
  local baseline="$6"
  local window="$7"
  local tags="$8"

  local output_file
  output_file="$(mktemp)"
  local actual_exit=0
  run_guard "$output_file" "$target" "$baseline" "$window" "$tags" || actual_exit=$?

  local actual_publish=""
  local actual_elapsed=""
  if [[ -s "$output_file" ]]; then
    actual_publish="$(grep '^publish=' "$output_file" | tail -1 | cut -d= -f2- || true)"
    actual_elapsed="$(grep '^elapsed=' "$output_file" | tail -1 | cut -d= -f2- || true)"
  fi
  rm -f "$output_file"

  if [[ "$actual_exit" -eq "$expected_exit" &&
        "$actual_publish" == "$expected_publish" &&
        "$actual_elapsed" == "$expected_elapsed" ]]; then
    echo "[OK] ${name}"
    (( PASS++ )) || true
  else
    echo "[X] ${name}: exit=${actual_exit}/${expected_exit} publish=${actual_publish}/${expected_publish} elapsed=${actual_elapsed}/${expected_elapsed}"
    (( FAIL++ )) || true
  fi
}

assert_failure() {
  local name="$1"
  shift
  local output_file
  output_file="$(mktemp)"
  local actual_exit=0
  GITHUB_OUTPUT="$output_file" node "$SCRIPT" "$@" --tags-stdin <<< "v7.80.0" >/dev/null 2>&1 || actual_exit=$?
  rm -f "$output_file"

  if [[ "$actual_exit" -ne 0 ]]; then
    echo "[OK] ${name}"
    (( PASS++ )) || true
  else
    echo "[X] ${name}: expected non-zero exit"
    (( FAIL++ )) || true
  fi
}

echo ""
echo "Running dashboard sunset guard tests..."
echo ""

assert_case "allows the baseline release" 0 true 0 \
  "v7.80.0" "7.80.0" "2" \
  $'v7.79.1\nv7.80.0'

assert_case "allows first stable release after baseline" 0 true 1 \
  "v7.80.1" "7.80.0" "2" \
  $'v7.79.1\nv7.80.0\nv7.80.1'

assert_case "skips once the two-release sunset is reached" 0 false 2 \
  "v7.80.2" "7.80.0" "2" \
  $'v7.79.1\nv7.80.0\nv7.80.1\nv7.80.2'

assert_case "allows releases before the baseline" 0 true 0 \
  "v7.79.1" "7.80.0" "2" \
  $'v7.79.1'

assert_case "honors a larger configured window" 0 true 2 \
  "v7.80.2" "7.80.0" "3" \
  $'v7.80.0\nv7.80.1\nv7.80.2'

assert_case "skips at the larger configured window boundary" 0 false 3 \
  "v7.80.3" "7.80.0" "3" \
  $'v7.80.0\nv7.80.1\nv7.80.2\nv7.80.3'

assert_failure "rejects prerelease target tags" \
  --target "v7.80.0-rc.1" --baseline "7.80.0" --window "2"

assert_case "skips deprecated publish when baseline tag is unavailable after baseline" 0 false 2 \
  "v7.81.2" "7.81.0" "2" \
  $'v7.80.0'

echo ""
echo "Dashboard sunset guard tests complete: ${PASS} passed, ${FAIL} failed."
echo ""

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
