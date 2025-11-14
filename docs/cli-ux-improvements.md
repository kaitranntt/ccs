# CLI UI/UX Improvements

**Plan Location:** `claude-plans/20251114-0000-cli-ux-improvement/`
**Status:** Ready for Implementation
**Created:** 2025-11-14

## Quick Start

**To begin implementation:**
```bash
# Read main plan
cat claude-plans/20251114-0000-cli-ux-improvement/plan.md

# Start with Phase 1 (highest priority)
cat claude-plans/20251114-0000-cli-ux-improvement/phase-01-error-messaging.md

# Begin implementation following Primary Workflow
```

## Overview

Comprehensive CLI UX enhancement plan addressing error messaging, progress feedback, interactive confirmations, output formats, and cross-platform consistency.

**Principles:** Strictly follows YAGNI, KISS, DRY while maintaining:
- ASCII-only output (no emojis)
- Cross-platform parity (bash/PowerShell/Node.js)
- Non-invasive behavior
- TTY-aware colors with NO_COLOR support

## Phases Summary

### Phase 1: Error Messaging (P0 - 1-2 days) ⭐ START HERE
**High Impact, Quick Wins**
- Error codes (E001-E999) with documentation
- "Did you mean?" for profile typos
- Enhanced error structure with actionable guidance
- EXAMPLES section in --help

**Files:** `bin/ccs.js`, `lib/ccs`, `lib/ccs.ps1`, `bin/utils/error-manager.js`

### Phase 2: Progress Indicators (P1 - 2-3 days)
**Eliminate "is it frozen?" confusion**
- GLMT proxy startup spinner
- Doctor command progress display
- TTY-aware rendering

**New Files:** `bin/utils/progress-indicator.js`, `lib/progress-indicator.sh`

### Phase 3: Interactive UX (P1 - 2-3 days)
**Better discoverability**
- Interactive confirmations for destructive ops
- `--yes`/`--no-input` flags
- Impact display before deletion

**New Files:** `bin/utils/prompt.js`, `lib/prompt.sh`

### Phase 4: Output Formats (P2 - 2-3 days)
**Automation support**
- `--json` mode for auth commands
- `--quiet` mode
- Structured schemas

### Phase 5: Cross-Platform Consistency (P2 - 1-2 days)
**Unified experience**
- Identical error formatting
- Integration tests for parity
- ASCII-only box drawing

### Phase 6: Advanced Features (P3 - 3-4 days, OPTIONAL)
**Power user productivity**
- Bash/Zsh auto-complete
- Command abbreviations
- Man pages

## Implementation Workflow

**Per Phase:**
1. Read phase details from plan directory
2. Implement changes in all 3 implementations (bash, PowerShell, Node.js)
3. Update --help in all 3 implementations
4. Write tests
5. Delegate to `tester` - run tests on all platforms
6. Delegate to `code-reviewer` - verify cross-platform consistency
7. Delegate to `docs-manager` - update README/docs if needed
8. Delegate to `project-manager` - update plan status
9. Move to next phase

**Platform Test Matrix:**
- macOS (bash)
- Linux (bash)
- Windows (PowerShell + Git Bash)

## Key Constraints

**MUST maintain:**
- ASCII-only: [OK], [!], [X], [i] (NO emojis)
- TTY detection + NO_COLOR support
- Non-zero exit codes for errors
- Idempotent operations
- Three-way parity (bash/PowerShell/Node.js)

**MUST update for all changes:**
- bin/ccs.js (Node.js)
- lib/ccs (bash)
- lib/ccs.ps1 (PowerShell)

## Research Basis

Plan based on modern CLI best practices from:
- **gh CLI** - Error codes and suggestions
- **npm** - "Did you mean?" for typos
- **cargo** - Detailed context in errors
- **kubectl** - Progress indicators
- **clig.dev** - Modern CLI guidelines

## Success Metrics

| Metric | Before | Target |
|:-------|:-------|:-------|
| Error clarity | Basic | Actionable with codes |
| GLMT startup UX | Silent 5s | Visual spinner |
| Cross-platform parity | 85% | 95% |
| Help discoverability | Medium | High (EXAMPLES) |

## Timeline

**Total:** 11-17 days (excluding optional Phase 6)
- Sprint 1 (Days 1-2): Phase 1
- Sprint 2 (Days 3-8): Phases 2-3
- Sprint 3 (Days 9-13): Phases 4-5

## Open Questions

1. Error docs: docs/errors.md or separate site?
2. Progress library: custom vs external dependency?
3. Auto-complete: generate from --help or manual?
4. Version bump: minor (3.5.0) or patch (3.4.7)?

## Related Files

**Plan Directory:** `claude-plans/20251114-0000-cli-ux-improvement/`
- `plan.md` - Main overview
- `phase-01-error-messaging.md` through `phase-06-discoverability.md`
- `research/01-cli-best-practices.md` - Research report
- `reports/01-current-state-analysis.md` - Gap analysis

**Implementation Files:**
- Node.js: `bin/ccs.js`, `bin/utils/`, `bin/auth/`, `bin/management/`
- Bash: `lib/ccs`
- PowerShell: `lib/ccs.ps1`
- Tests: `tests/edge-cases.sh`, `tests/edge-cases.ps1`
- Docs: `README.md`, `CLAUDE.md`

---

**Next Action:** Begin Phase 1 implementation (error messaging enhancement)
