# CCS Project Roadmap

Last Updated: 2026-01-06

Forward-looking roadmap documenting current priorities, GitHub issues, and future feature plans.

---

## Completed Modularization Summary

All major modularization work is complete. The codebase evolved from monolithic files to a well-structured modular architecture.

| Phase | Description | Key Result |
|-------|-------------|------------|
| 1 | Type System | `src/types/` with barrel exports |
| 2 | CLI Commands | `src/commands/` (8 handlers extracted) |
| 3 | CLIProxy | `src/cliproxy/` with auth/, binary/, services/ subdirs |
| 4 | Utils/Errors | `src/utils/ui/`, `src/errors/`, `src/management/` |
| 5 | UI Components | 5 monster files split into modular dirs (54+ modules) |
| 6 | Settings Page | `pages/settings/` (1,781->20 files) |
| 7 | Analytics Page | `pages/analytics/` (420->8 files) |
| 8 | Auth Monitor | `monitoring/auth-monitor/` (465->8 files) |
| 9 | Test Infrastructure | 99 UI tests + 539 CLI tests, 90% coverage |
| 10 | Remote CLIProxy | `proxy-config-resolver.ts`, `remote-proxy-client.ts` |
| 11 | Kiro + ghcp Providers | OAuth support via CLIProxyAPIPlus (v7.2) |
| 12 | Hybrid Quota Management | `quota-manager.ts`, `quota-fetcher.ts` (v7.14) |

**Metrics Achieved**:
- Files >500 lines: 12 -> 5 (-58%)
- UI files >200 lines: 28 -> 8 (-71%)
- Barrel exports: 5 -> 39 (+680%)
- Test coverage: 0% -> 90%
- Total tests: 638 (539 CLI + 99 UI)

---

## Current Status

### Remaining Large Files (Acceptable)

**CLI** (complex core logic):
- `model-pricing.ts` (676 lines) - Data file
- `glmt-proxy.ts` (675 lines) - Streaming proxy
- `cliproxy-executor.ts` (666 lines) - Core execution
- `ccs.ts` (596 lines) - Entry point

**UI** (external/shadcn):
- `components/ui/sidebar.tsx` (674 lines) - shadcn component

---

## GitHub Issues Backlog

### Critical (Blocking Users)

| Issue | Title | Type |
|-------|-------|------|
| #158 | AGY not working - Missing API Key - Run /login | bug |
| #155 | Invalid JSON payload error with Gemini/Antigravity | bug |
| #124 | Incorrect model ID for Claude 3.5 Sonnet (Thinking) | bug |

### High Priority (Features)

| Issue | Title | Type | Status |
|-------|-------|------|--------|
| #142 | Configure with available CLIProxyAPI | enhancement | **COMPLETE** (v7.1) |
| #157 | Support for Kiro auth from CLIProxyAPIPlus | enhancement | **COMPLETE** (v7.2) |
| #123 | Add More Models | enhancement | Ongoing |
| #114 | OpenCode Zen Free model + Auto Rotation API Key | enhancement | - |

### Medium Priority

| Issue | Title | Type |
|-------|-------|------|
| #137 | CCS Cannot Connect to IDE, but Native Claude Works | support |
| #89 | Add Claude Code CLI flag passthrough for delegation | enhancement |

### Low Priority / Questions

| Issue | Title | Type |
|-------|-------|------|
| #156 | Configure API for Zed IDE | docs |
| #140 | Do we support ampcode? | question |
| #111 | Factory droid CLI support | enhancement |
| #103 | /context command returns incorrect context | invalid |

---

## Future Roadmap

### Priority 1: Multiple CLIProxyAPI Instances

Support connecting to multiple CLIProxyAPI servers simultaneously.

**Use Cases**:
- Load balancing across multiple proxy servers
- Failover when primary server unavailable
- Geographic distribution for latency optimization
- Separate proxies for different provider groups

**Proposed Config**:
```yaml
cliproxy:
  instances:
    primary:
      url: http://localhost:8000
      providers: [gemini, codex]
      weight: 80
    secondary:
      url: http://192.168.1.100:8000
      providers: [agy]
      weight: 20
    failover:
      url: http://backup.example.com:8000
      priority: 2  # Only if primary/secondary fail
  strategy: weighted-round-robin
```

### Priority 2: Native Git Worktree Support

Opt-in automatic git worktree management for features/issues.

**Use Cases**:
- Automatic worktree creation when starting issue
- Isolation of feature development
- Easy cleanup after merge
- Integration with GitHub issues

**Proposed Settings**:
```yaml
worktrees:
  enabled: true
  base_path: ~/.ccs/worktrees
  auto_create: true
  auto_cleanup: true
  naming: "{issue-number}-{short-title}"
```

### Priority 3: Enhanced Model Support

- **#123**: Expand model catalog with new releases
- **#124**: Fix Claude 3.5 Sonnet (Thinking) model ID
- **#114**: OpenCode Zen free model + API key rotation

### Priority 4: IDE Integration

- **#137**: Debug CCS-to-IDE connection issues
- **#156**: Zed IDE configuration documentation
- **#140**: Investigate ampcode compatibility
- **#111**: Factory droid CLI support assessment

### Priority 5: Authentication Enhancements

- **#158**: Fix AGY OAuth flow
- **#157**: ~~Add Kiro auth support from CLIProxyAPIPlus~~ **COMPLETE** (v7.2)
- GitHub Copilot (ghcp) Device Code flow **COMPLETE** (v7.2)
- Hybrid quota management **COMPLETE** (v7.14)

---

## Milestones

| Milestone | Status | Target |
|-----------|--------|--------|
| Modularization (Phases 1-9) | COMPLETE | - |
| Remote CLIProxy Support (#142) | COMPLETE | v7.1 |
| Kiro + GitHub Copilot OAuth (#157) | COMPLETE | v7.2 |
| Hybrid Quota Management | COMPLETE | v7.14 |
| Critical Bug Fixes (#158, #155, #124) | PLANNED | Q1 2026 |
| Multiple CLIProxyAPI Instances | PLANNED | Q1 2026 |
| Git Worktree Support | PLANNED | Q2 2026 |
| Enhanced Model Support | PLANNED | Q2 2026 |

---

## Success Criteria

All criteria achieved:

- [x] Files under 200 lines (except documented exceptions)
- [x] Every directory has barrel export
- [x] No circular dependencies
- [x] TypeScript strict mode passing
- [x] 90%+ test coverage
- [x] Clear domain boundaries
- [x] Consistent naming conventions

---

## Related Documentation

- [Codebase Summary](./codebase-summary.md) - Current structure
- [Code Standards](./code-standards.md) - Patterns and conventions
- [System Architecture](./system-architecture.md) - Architecture diagrams
- [CLAUDE.md](../CLAUDE.md) - AI development guidance
