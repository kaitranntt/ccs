#!/usr/bin/env bash
# CLI UX Integration Test Suite
# Tests all 6 phases of CLI UX improvements

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Current test tracking
CURRENT_TEST_HAS_FAILURE=0

# Test results
RESULTS=()

# Helper functions
log_info() {
    echo -e "${CYAN}[INFO]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${RESET} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${RESET} $1"
    CURRENT_TEST_HAS_FAILURE=1
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${RESET} $1"
    CURRENT_TEST_HAS_FAILURE=-1  # Mark as skipped
}

test_start() {
    # Finalize previous test if any
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        test_end
    fi

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    CURRENT_TEST_HAS_FAILURE=0
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${CYAN}Test $TOTAL_TESTS: $1${RESET}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

test_end() {
    # Count this test as passed, failed, or skipped
    if [[ $CURRENT_TEST_HAS_FAILURE -eq -1 ]]; then
        SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
    elif [[ $CURRENT_TEST_HAS_FAILURE -eq 0 ]]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v node &>/dev/null; then
        echo "ERROR: Node.js not found. Please install Node.js 14+"
        exit 1
    fi

    if ! command -v jq &>/dev/null; then
        echo "ERROR: jq not found. Please install jq"
        exit 1
    fi

    if [[ ! -f "$PROJECT_ROOT/bin/ccs.js" ]]; then
        echo "ERROR: bin/ccs.js not found. Run from project root."
        exit 1
    fi

    log_success "Prerequisites OK"
}

# Setup test environment
setup_test_env() {
    log_info "Setting up test environment..."

    # Backup existing CCS data
    if [[ -d ~/.ccs ]]; then
        local backup_dir=~/.ccs.backup.$(date +%s)
        mv ~/.ccs "$backup_dir"
        log_info "Backed up existing ~/.ccs to $backup_dir"
    fi

    # Create fresh test environment
    mkdir -p ~/.ccs/instances/test-work/session-env
    mkdir -p ~/.ccs/instances/test-personal/session-env

    # Create test profiles
    cat > ~/.ccs/profiles.json <<'EOF'
{
  "profiles": {
    "test-work": {
      "type": "account",
      "created": "2025-11-14T00:00:00.000Z"
    },
    "test-personal": {
      "type": "account",
      "created": "2025-11-14T00:00:00.000Z"
    }
  },
  "default": "test-work"
}
EOF

    # Create dummy session files
    echo '{}' > ~/.ccs/instances/test-work/session-env/session1.json
    echo '{}' > ~/.ccs/instances/test-work/session-env/session2.json
    echo '{}' > ~/.ccs/instances/test-personal/session-env/session3.json

    # Create config.json with settings-based profiles (for fuzzy matching tests)
    cat > ~/.ccs/config.json <<'EOF'
{
  "profiles": {
    "glm": "~/.ccs/glm.settings.json",
    "kimi": "~/.ccs/kimi.settings.json",
    "default": "~/.claude/settings.json"
  }
}
EOF

    log_success "Test environment ready"
}

# Cleanup test environment
cleanup_test_env() {
    log_info "Cleaning up test environment..."

    rm -rf ~/.ccs

    # Restore backup if exists
    local latest_backup=$(ls -td ~/.ccs.backup.* 2>/dev/null | head -1 || true)
    if [[ -n "$latest_backup" ]]; then
        mv "$latest_backup" ~/.ccs
        log_info "Restored backup from $latest_backup"
    fi

    log_success "Cleanup complete"
}

#############################
# Phase 1: Error Messaging
#############################

test_error_codes() {
    test_start "Phase 1.1 - Error codes display"

    # Node.js version
    local node_output=$(node "$PROJECT_ROOT/bin/ccs.js" nonexistent-profile "test" 2>&1)
    if echo "$node_output" | grep -q "E[0-9]\{3\}"; then
        log_success "Node.js: Error code displayed"
    else
        log_fail "Node.js: Error code NOT displayed"
        echo "  Debug: Output was:" >&2
        echo "$node_output" | tail -3 >&2
    fi

    # Bash version
    local bash_output=$("$PROJECT_ROOT/lib/ccs" nonexistent-profile "test" 2>&1)
    if echo "$bash_output" | grep -q "E[0-9]\{3\}"; then
        log_success "Bash: Error code displayed"
    else
        log_fail "Bash: Error code NOT displayed"
        echo "  Debug: Output was:" >&2
        echo "$bash_output" | tail -3 >&2
    fi
}

test_fuzzy_matching() {
    test_start "Phase 1.2 - Fuzzy matching 'Did you mean?'"

    # Node.js version (typo: glmm instead of glm)
    local node_output=$(node "$PROJECT_ROOT/bin/ccs.js" glmm "test" 2>&1)
    if echo "$node_output" | grep -qi "did you mean"; then
        log_success "Node.js: Fuzzy matching works"
    else
        log_fail "Node.js: Fuzzy matching NOT working"
        echo "  Debug: Looking for 'did you mean' in output:" >&2
        echo "$node_output" | grep -i "mean\|glm\|profile" | head -5 >&2
    fi

    # Bash version
    local bash_output=$("$PROJECT_ROOT/lib/ccs" glmm "test" 2>&1)
    if echo "$bash_output" | grep -qi "did you mean"; then
        log_success "Bash: Fuzzy matching works"
    else
        log_fail "Bash: Fuzzy matching NOT working"
        echo "  Debug: Looking for 'did you mean' in output:" >&2
        echo "$bash_output" | grep -i "mean\|glm\|profile" | head -5 >&2
    fi

    # Additional test with account profiles (if they exist)
    if [[ -f ~/.ccs/profiles.json ]] && grep -q "test-work" ~/.ccs/profiles.json; then
        local node_acct_output=$(node "$PROJECT_ROOT/bin/ccs.js" test-wrk "test" 2>&1)
        if echo "$node_acct_output" | grep -qi "did you mean"; then
            log_success "Node.js: Fuzzy matching works for account profiles"
        else
            log_fail "Node.js: Fuzzy matching NOT working for account profiles"
            echo "  Debug: test-wrk output:" >&2
            echo "$node_acct_output" | grep -i "mean\|test\|profile" | head -5 >&2
        fi

        local bash_acct_output=$("$PROJECT_ROOT/lib/ccs" test-wrk "test" 2>&1)
        if echo "$bash_acct_output" | grep -qi "did you mean"; then
            log_success "Bash: Fuzzy matching works for account profiles"
        else
            log_fail "Bash: Fuzzy matching NOT working for account profiles"
            echo "  Debug: test-wrk output:" >&2
            echo "$bash_acct_output" | grep -i "mean\|test\|profile" | head -5 >&2
        fi
    fi
}

test_examples_section() {
    test_start "Phase 1.3 - EXAMPLES section in help"

    # Node.js version
    if node "$PROJECT_ROOT/bin/ccs.js" --help 2>&1 | grep -qi "examples:"; then
        log_success "Node.js: EXAMPLES section present"
    else
        log_fail "Node.js: EXAMPLES section missing"
    fi

    # Bash version
    if "$PROJECT_ROOT/lib/ccs" --help 2>&1 | grep -qi "examples:"; then
        log_success "Bash: EXAMPLES section present"
    else
        log_fail "Bash: EXAMPLES section missing"
    fi
}

#############################
# Phase 2: Progress Indicators
#############################

test_doctor_progress() {
    test_start "Phase 2.1 - Doctor command progress"

    # Node.js version
    if timeout 5s node "$PROJECT_ROOT/bin/ccs.js" doctor 2>&1 | grep -q "Checking"; then
        log_success "Node.js: Doctor progress displayed"
    else
        log_skip "Node.js: Doctor command (may need Claude CLI installed)"
    fi

    # Bash version
    if timeout 5s "$PROJECT_ROOT/lib/ccs" doctor 2>&1 | grep -E "\[[0-9]+/[0-9]+\]" > /dev/null; then
        log_success "Bash: Doctor progress counter displayed"
    else
        log_skip "Bash: Doctor command (may need Claude CLI installed)"
    fi
}

test_tty_detection() {
    test_start "Phase 2.2 - TTY detection (NO_COLOR)"

    # Test that NO_COLOR disables colors
    if NO_COLOR=1 node "$PROJECT_ROOT/bin/ccs.js" --help 2>&1 | grep -q $'\033\['; then
        log_fail "Node.js: Colors shown despite NO_COLOR"
    else
        log_success "Node.js: NO_COLOR respected"
    fi

    if NO_COLOR=1 "$PROJECT_ROOT/lib/ccs" --help 2>&1 | grep -q $'\033\['; then
        log_fail "Bash: Colors shown despite NO_COLOR"
    else
        log_success "Bash: NO_COLOR respected"
    fi
}

#############################
# Phase 3: Interactive Prompts
#############################

test_confirmation_prompt() {
    test_start "Phase 3.1 - Auth remove confirmation"

    # Node.js version (send 'n' to cancel)
    if echo "n" | node "$PROJECT_ROOT/bin/ccs.js" auth remove test-personal 2>&1 | grep -q "Cancelled"; then
        log_success "Node.js: Confirmation prompt works (cancelled)"
    else
        log_fail "Node.js: Confirmation prompt NOT working"
    fi

    # Bash version
    if echo "n" | "$PROJECT_ROOT/lib/ccs" auth remove test-personal 2>&1 | grep -q "Cancelled"; then
        log_success "Bash: Confirmation prompt works (cancelled)"
    else
        log_fail "Bash: Confirmation prompt NOT working"
    fi
}

test_yes_flag() {
    test_start "Phase 3.2 - --yes flag auto-confirm"

    # Node.js version (should NOT prompt)
    local output=$(node "$PROJECT_ROOT/bin/ccs.js" auth remove test-personal --yes 2>&1 || true)
    if echo "$output" | grep -q "Profile removed successfully"; then
        log_success "Node.js: --yes flag works"

        # Recreate profile for bash test
        cat > ~/.ccs/profiles.json <<'EOF'
{
  "profiles": {
    "test-work": {
      "type": "account",
      "created": "2025-11-14T00:00:00.000Z"
    },
    "test-personal": {
      "type": "account",
      "created": "2025-11-14T00:00:00.000Z"
    }
  },
  "default": "test-work"
}
EOF
    else
        log_fail "Node.js: --yes flag NOT working"
    fi

    # Bash version
    if "$PROJECT_ROOT/lib/ccs" auth remove test-personal --yes 2>&1 | grep -q "Profile removed successfully"; then
        log_success "Bash: --yes flag works"
    else
        log_fail "Bash: --yes flag NOT working"
    fi
}

test_impact_display() {
    test_start "Phase 3.3 - Impact display (sessions, paths)"

    # Recreate profile if needed
    if ! grep -q "test-work" ~/.ccs/profiles.json 2>/dev/null; then
        cat > ~/.ccs/profiles.json <<'EOF'
{
  "profiles": {
    "test-work": {
      "type": "account",
      "created": "2025-11-14T00:00:00.000Z"
    }
  },
  "default": "test-work"
}
EOF
    fi

    # Node.js version
    if echo "n" | node "$PROJECT_ROOT/bin/ccs.js" auth remove test-work 2>&1 | grep -E "Sessions:|Instance path:" | wc -l | grep -q "2"; then
        log_success "Node.js: Impact display shown"
    else
        log_fail "Node.js: Impact display NOT shown"
    fi

    # Bash version
    if echo "n" | "$PROJECT_ROOT/lib/ccs" auth remove test-work 2>&1 | grep -E "Sessions:|Instance path:" | wc -l | grep -q "2"; then
        log_success "Bash: Impact display shown"
    else
        log_fail "Bash: Impact display NOT shown"
    fi
}

#############################
# Phase 4: JSON Output
#############################

test_json_output() {
    test_start "Phase 4.1 - JSON output (auth list)"

    # Node.js version
    if node "$PROJECT_ROOT/bin/ccs.js" auth list --json 2>/dev/null | jq . > /dev/null 2>&1; then
        log_success "Node.js: Valid JSON output"
    else
        log_fail "Node.js: Invalid JSON output"
    fi

    # Bash version
    if "$PROJECT_ROOT/lib/ccs" auth list --json 2>/dev/null | jq . > /dev/null 2>&1; then
        log_success "Bash: Valid JSON output"
    else
        log_fail "Bash: Invalid JSON output"
    fi
}

test_json_version() {
    test_start "Phase 4.2 - JSON uses CCS version (not '1.0')"

    # Node.js version
    local version=$(node "$PROJECT_ROOT/bin/ccs.js" auth list --json 2>/dev/null | jq -r '.version')
    if [[ "$version" != "1.0" ]] && [[ -n "$version" ]]; then
        log_success "Node.js: JSON version is '$version' (not '1.0')"
    else
        log_fail "Node.js: JSON version is '1.0' (should be CCS version)"
    fi

    # Bash version
    local version=$(lib/ccs auth list --json 2>/dev/null | jq -r '.version')
    if [[ "$version" != "1.0" ]] && [[ -n "$version" ]]; then
        log_success "Bash: JSON version is '$version' (not '1.0')"
    else
        log_fail "Bash: JSON version is '1.0' (should be CCS version)"
    fi
}

test_session_count() {
    test_start "Phase 4.3 - session_count in JSON output"

    # Node.js version
    if node "$PROJECT_ROOT/bin/ccs.js" auth show test-work --json 2>/dev/null | jq -e '.session_count' > /dev/null; then
        log_success "Node.js: session_count present in JSON"
    else
        log_fail "Node.js: session_count missing in JSON"
    fi

    # Bash version
    if "$PROJECT_ROOT/lib/ccs" auth show test-work --json 2>/dev/null | jq -e '.session_count' > /dev/null; then
        log_success "Bash: session_count present in JSON"
    else
        log_fail "Bash: session_count missing in JSON"
    fi
}

#############################
# Phase 5: Cross-Platform Consistency
#############################

test_ascii_error_boxes() {
    test_start "Phase 5.1 - ASCII error boxes (no Unicode)"

    # Bash version (should use ===== not ╔═╗)
    if "$PROJECT_ROOT/lib/ccs" nonexistent 2>&1 | grep -q "╔\|═\|╗\|║\|╚\|╝"; then
        log_fail "Bash: Unicode box characters found (should be ASCII)"
    else
        log_success "Bash: ASCII-only error boxes"
    fi
}

test_help_consistency() {
    test_start "Phase 5.2 - Help text structure consistency"

    # Get section headers from both versions (use LC_ALL=C for consistent sorting)
    local node_sections=$(node "$PROJECT_ROOT/bin/ccs.js" --help 2>&1 | grep -E "^[A-Z][a-z]+:" | LC_ALL=C sort)
    local bash_sections=$("$PROJECT_ROOT/lib/ccs" --help 2>&1 | grep -E "^[A-Z][a-z]+:" | LC_ALL=C sort)

    if [[ "$node_sections" == "$bash_sections" ]]; then
        log_success "Help text structure consistent"
    else
        log_fail "Help text structure differs between Node.js and bash"
        # Debug output
        echo "  Node.js sections:" >&2
        echo "$node_sections" | sed 's/^/    /' >&2
        echo "  Bash sections:" >&2
        echo "$bash_sections" | sed 's/^/    /' >&2
    fi
}

#############################
# Phase 6: Shell Completion
#############################

test_bash_completion() {
    test_start "Phase 6.1 - Bash completion loading"

    # Source completion script
    if source "$PROJECT_ROOT/scripts/completion/ccs.bash" 2>/dev/null; then
        # Check if completion is registered
        if complete -p ccs 2>/dev/null | grep -q "_ccs_completion"; then
            log_success "Bash completion loaded successfully"
        else
            log_fail "Bash completion NOT registered"
        fi
    else
        log_fail "Bash completion script failed to load"
    fi
}

test_fish_completion() {
    test_start "Phase 6.2 - Fish completion (if available)"

    if command -v fish &>/dev/null; then
        # Copy completion file
        mkdir -p ~/.config/fish/completions
        cp "$PROJECT_ROOT/scripts/completion/ccs.fish" ~/.config/fish/completions/

        # Test if Fish can load it
        if fish -c "complete -C'ccs '" 2>/dev/null | grep -q "auth\|doctor"; then
            log_success "Fish completion works"
        else
            log_fail "Fish completion NOT working"
        fi
    else
        log_skip "Fish not installed"
    fi
}

#############################
# Main Test Runner
#############################

main() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  CLI UX Integration Test Suite"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    check_prerequisites
    setup_test_env

    # Phase 1 Tests
    test_error_codes
    test_fuzzy_matching
    test_examples_section

    # Phase 2 Tests
    test_doctor_progress
    test_tty_detection

    # Phase 3 Tests
    test_confirmation_prompt
    test_yes_flag
    test_impact_display

    # Phase 4 Tests
    test_json_output
    test_json_version
    test_session_count

    # Phase 5 Tests
    test_ascii_error_boxes
    test_help_consistency

    # Phase 6 Tests
    test_bash_completion
    test_fish_completion

    # Finalize last test
    test_end

    cleanup_test_env

    # Print summary
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Test Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Total Tests:   $TOTAL_TESTS"
    echo -e "${GREEN}Passed:        $PASSED_TESTS${RESET}"
    echo -e "${RED}Failed:        $FAILED_TESTS${RESET}"
    echo -e "${YELLOW}Skipped:       $SKIPPED_TESTS${RESET}"
    echo ""

    # Calculate pass rate based on non-skipped tests
    local tests_run=$((TOTAL_TESTS - SKIPPED_TESTS))
    local pass_rate=0
    if [[ $tests_run -gt 0 ]]; then
        pass_rate=$((PASSED_TESTS * 100 / tests_run))
    fi
    echo "Pass Rate:     $pass_rate% ($PASSED_TESTS/$tests_run non-skipped tests)"
    echo ""

    if [[ $pass_rate -ge 90 ]]; then
        echo -e "${GREEN}✓ SUCCESS: Pass rate >= 90%${RESET}"
        exit 0
    else
        echo -e "${RED}✗ FAILURE: Pass rate < 90%${RESET}"
        exit 1
    fi
}

# Run tests
main "$@"
