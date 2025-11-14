# Phase 5: Cross-Platform Consistency

## Context

**Parent Plan:** [CLI UI/UX Improvement Plan](plan.md)
**Priority:** P2 | **Status:** Not Started

## Overview

Ensure identical output, error messages, and behavior across bash, PowerShell, and Node.js implementations.

## Current Gaps

1. Error box drawing chars differ (═ vs =)
2. Color codes work differently
3. Minor formatting inconsistencies
4. Help text slight variations

## Requirements

1. Identical error message format across platforms
2. Consistent color scheme (when TTY available)
3. Unified help text (bash/PowerShell/Node.js)
4. Cross-platform integration tests

## Implementation

### Standardize Error Boxes

**Unified Format:**
```
==============================================
  ERROR
==============================================

{Error message}

{Error code and URL}
```

**Remove Unicode box chars** (╔═╗║╚╝) → use ASCII (===)

### Integration Test Suite

```bash
# tests/integration/cross-platform-parity.sh
test_help_consistency() {
  local bash_help=$(lib/ccs --help 2>&1)
  local node_help=$(bin/ccs.js --help 2>&1)

  # Strip ANSI codes
  bash_help=$(echo "$bash_help" | sed 's/\x1b\[[0-9;]*m//g')
  node_help=$(echo "$node_help" | sed 's/\x1b\[[0-9;]*m//g')

  # Compare
  diff <(echo "$bash_help") <(echo "$node_help")
}
```

## Implementation Steps

1. Audit all error messages across implementations
2. Standardize to ASCII-only box drawing
3. Align help text wording
4. Create cross-platform test suite
5. Fix identified inconsistencies
6. Document parity requirements

## Todo List

- [ ] Audit error messages (bash vs PowerShell vs Node.js)
- [ ] Standardize error box format to ASCII
- [ ] Align help text across platforms
- [ ] Create integration test suite
- [ ] Fix all identified inconsistencies
- [ ] Add CI checks for parity
- [ ] Document standards

## Success Criteria

- [ ] Error messages identical (modulo line endings)
- [ ] Help text identical across platforms
- [ ] Integration tests pass on all platforms
- [ ] CI enforces parity going forward

## Related Files

- `lib/ccs` L28-36 - msg_error
- `lib/ccs.ps1` L22-31 - Write-ErrorMsg
- `bin/utils/error-manager.js` - error formatting
- **NEW:** `tests/integration/cross-platform-parity.sh`

---

**Effort:** 1-2 days | **Ready:** After Phase 1
