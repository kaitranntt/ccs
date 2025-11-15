#!/usr/bin/env bash
set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0

echo -e "${CYAN}╔════════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║   CCS Delegation System - Test Suite              ║${RESET}"
echo -e "${CYAN}╚════════════════════════════════════════════════════╝${RESET}"
echo ""

# Function to run a test file
run_test() {
  local test_file="$1"
  local test_name=$(basename "$test_file" .test.js)

  echo -e "${CYAN}Running: ${test_name}${RESET}"
  echo "----------------------------------------"

  if node "$test_file"; then
    echo -e "${GREEN}[OK] ${test_name} passed${RESET}"
    echo ""
    return 0
  else
    echo -e "${RED}[X] ${test_name} failed${RESET}"
    echo ""
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# Run all tests
run_test "$SCRIPT_DIR/delegation-validator.test.js"
run_test "$SCRIPT_DIR/prompt-enhancer.test.js"
run_test "$SCRIPT_DIR/cwd-resolver.test.js"
run_test "$SCRIPT_DIR/result-formatter.test.js"
run_test "$SCRIPT_DIR/integration.test.js"

# Summary
echo "========================================"
if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}All delegation tests passed!${RESET}"
  exit 0
else
  echo -e "${RED}$FAILED test suite(s) failed${RESET}"
  exit 1
fi
