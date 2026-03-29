# CCS Project Roadmap

Last Updated: 2026-03-28

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
| 9 | Test Infrastructure | 1407 tests, 90% coverage |
| 10 | Remote CLIProxy | `proxy-config-resolver.ts`, `remote-proxy-client.ts` |
| 11 | Kiro + ghcp Providers | OAuth support via CLIProxyAPIPlus (v7.2) |
| 12 | Hybrid Quota Management | `quota-manager.ts`, `quota-fetcher.ts` (v7.14) |
| 13 | Docker Support | `docker/` directory with Dockerfile, Compose, entrypoint |
| 14 | Image Analysis Hook | Vision proxying via CLIProxy transformers (v7.34) |
| 15 | Third-Party Tool Integration | `ccs env` command with multi-format export (v7.39) |

**Metrics Achieved**:
- Files >500 lines: 12 -> 5 (-58%)
- UI files >200 lines: 28 -> 8 (-71%)
- Barrel exports: 5 -> 39 (+680%)
- Test coverage: 0% -> 90%
- Total tests: 1440 (6 skipped)

---

## Current Status

### Recent Fixes

- **2026-03-28**: **#773** CCS now ships a dedicated `Compatible -> Codex CLI` dashboard route with a real split-view control center. The page detects the local Codex binary, keeps overview/docs guidance, and adds guided editors for the user-owned `~/.codex/config.toml` layer: top-level runtime defaults, project trust, profiles, model providers, MCP servers, and supported feature flags. Structured saves intentionally normalize TOML formatting and drop comments, so the raw editor remains the fidelity escape hatch. Follow-up fixes added immediate raw snapshot refresh, dirty raw-editor guarding for structured controls, project-trust path validation, and feature reset-to-default support. CCS still warns that transient runtime overrides such as `codex -c key=value` and `CCS_CODEX_API_KEY` may change effective behavior without persisting into the file.
- **2026-03-27**: WebSearch dashboard cards now manage Exa, Tavily, and Brave API keys inline instead of relying on a separate manual env step. CCS stores those secrets through `global_env`, reflects masked key state in `/api/websearch`, and counts dashboard-managed keys as ready in the WebSearch status flow.
- **2026-03-27**: **#812** CCS now includes a first-class `ccs docker` command suite for self-hosting the integrated Dashboard + CLIProxy stack. The CLI can stage bundled Docker assets locally or to a remote `--host` over SSH, report compose/supervisor status, stream CCS or CLIProxy logs, and run in-container update flows without relying on ad-hoc deployment scripts.
- **2026-03-24**: Official Claude Channels now follow Anthropic's actual runtime contract. CCS blocks auto-enable unless Bun is available, Claude Code is verified at v2.1.80+, and `claude.ai` auth is verified; treats `--allow-dangerously-skip-permissions` as an explicit override; keeps Telegram/Discord bot tokens in Claude's shared `~/.claude/channels/` state (or official `*_STATE_DIR` overrides); and upgrades the dashboard/CLI status flow with Bun/version/auth/state-scope guidance, safer token draft retention on refresh failures, and a non-macOS iMessage toggle that can still be turned off when already selected.
- **2026-03-23**: CLIProxy providers that do not expose an email no longer require a user-supplied nickname on first auth. CCS now derives a stable internal account identifier for Kiro/Copilot-style flows, preserves later rename support, hardens account discovery/registry sync around that identifier, and updates AI Provider CRUD to use stable entry IDs instead of dashboard list indexes.
- **2026-03-23**: Sensitive dashboard management routes now fail closed to localhost-only access whenever dashboard auth is disabled. Remote access remains available after `ccs config auth setup`, but AI Provider management, CLIProxy auth/status helpers, and other write-capable settings endpoints no longer trust unauthenticated non-loopback requests.
- **2026-03-19**: **#649** CCS splits CLIProxy provider-key authoring into a dedicated `CLIProxy -> AI Providers` dashboard route. `/cliproxy` now stays focused on OAuth accounts and variants, `/cliproxy/ai-providers` owns Gemini/Codex/Claude/Vertex/OpenAI-compatible key management, and `/providers` stays reserved for CCS-native API Profiles.
- **2026-03-18**: **#755** Marketplace refresh no longer reuses one shared `known_marketplaces.json` across isolated instances. CCS now keeps marketplace payload directories shared while reconciling per-instance marketplace metadata so Claude Code validation succeeds for alternating or concurrent profiles, including Windows copy fallback.
- **2026-03-17**: Deprecated user-facing GLMT discovery across CLI help, completions, presets, and docs. Existing `glmt` profiles now run through a compatibility path that normalizes legacy proxy settings to the direct GLM endpoint.
- **#748**: API profile creation now keeps provider selection compact by collapsing advanced presets behind an explicit toggle, shrinking chooser cards so the form fields stay visually primary, and giving `llama.cpp` a dedicated provider logo.
- **#744**: API profile creation now keeps featured providers in a horizontal rail with scroll fallback, moves Anthropic Direct API to the end, reuses the shared Claude logo, and separates the custom-endpoint entry point from advanced template discovery.
- **#724**: Codex startup is now free-plan safe. CCS defaults new Codex sessions to a cross-plan model and auto-repairs stale paid-only Codex defaults when the active account is on the free plan.
- **#737**: Dashboard model pickers in Cursor, Copilot, and CLIProxy now use a searchable combobox with autofocus and explicit no-results states for large model catalogs.
- **#736**: `ccs config` now supports explicit dashboard bind hosts via `--host`, and surfaces remote-access warnings plus reachable URLs when the effective bind is non-loopback.

### Maintainability Hardening Kickoff

- Issue owner: Stream D for **#542**
- Automated inventory command: `bun run report:hardening`
- Generated report artifacts:
  - `docs/reports/hardening-inventory.json`
  - `docs/reports/hardening-inventory.md`
- Debt burndown tracker: [Hardening Debt Burndown Tracker](./hardening-debt-burndown.md)

### Remaining Large Files (Acceptable)

**CLI** (complex core logic):
- `model-pricing.ts` (676 lines) - Data file
- `glmt-proxy.ts` (675 lines) - Legacy internal compatibility proxy
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
| #659 | Comprehensive Vietnamese i18n for dashboard | enhancement |

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
| Docker Support (PR #345) | COMPLETE | v7.23 |
| Image Analysis Hook | COMPLETE | v7.34 |
| Third-Party Tool Integration | COMPLETE | v7.39 |
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

## Maintainability Gate (Issue #539 Foundation)

- Baseline metrics artifact: `docs/metrics/maintainability-baseline.json`
- Branch-aware gate wrapper: `scripts/maintainability-check.js`
- Generate or refresh baseline:
  - `bun run maintainability:baseline`
  - `npm run maintainability:baseline`
- Run regression check gate:
  - `bun run maintainability:check`
  - `npm run maintainability:check`
  - `bun run maintainability:check:strict` (force strict locally)

The baseline/check scripts enumerate git-tracked files under `src` for deterministic results and fail fast if git file listing is unavailable.

Default gate behavior:
- strict mode on protected branches (`main`, `dev`, `hotfix/*`, `kai/hotfix-*`)
- warning mode on PR CI and non-protected branches (parallel PR friendly)

The check mode supports a maintainability regression gate that blocks increases in:
- `process.exit` references
- synchronous fs API references
- TypeScript files over 350 LOC

---

## Related Documentation

- [Codebase Summary](./codebase-summary.md) - Current structure
- [Code Standards](./code-standards.md) - Patterns and conventions
- [System Architecture](./system-architecture/index.md) - Architecture diagrams
- [Hardening Debt Burndown Tracker](./hardening-debt-burndown.md) - Legacy shim + sync-fs debt tracking
- [CLAUDE.md](../CLAUDE.md) - AI development guidance
