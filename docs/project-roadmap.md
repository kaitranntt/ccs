# CCS Project Roadmap

Last Updated: 2026-04-30

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

- **2026-05-03**: **#1172** Local CLIProxy config generation now keeps the CPAMC management dashboard aligned with backend selection. `backend: original` points to the upstream dashboard, `backend: plus` points to the CCS-maintained CPAMC fork, `cliproxy.management_panel_repository` lets advanced users override the panel repository, and stale generated configs are regenerated when the expected panel source changes.
- **2026-04-30**: **#1153** Native Claude launches now accept session-scoped `--effort low|medium|high|xhigh|max` overrides through CCS without mutating global Claude settings. CCS validates invalid or missing effort values before spawning Claude, normalizes accepted values, keeps default headless `-p/--prompt` launches on native Claude instead of delegation parsing, and preserves CLIProxy/Codex/Droid effort aliases.
- **2026-04-28**: **#1123** CLIProxy quota failover now uses the dashboard/manual pause mechanism for all quota-visible OAuth providers with CCS quota fetchers: Antigravity, Claude, Codex, Gemini CLI, and GitHub Copilot. When a healthy fallback exists, CCS moves the exhausted account token out of the live `auth/` folder into `auth-paused/`, marks the account paused for dashboard visibility, persists the cooldown for auto-resume, and still avoids self-pausing the last usable account.
- **2026-04-28**: **#1115** CCS now exposes upstream CLIProxy session affinity as a first-class local managed setting. Users can inspect and toggle local `session-affinity` plus TTL from `ccs cliproxy routing affinity`, from the `/cliproxy` dashboard routing card, and through the local dashboard API. The generated local CLIProxy config now persists `routing.session-affinity` and `routing.session-affinity-ttl`, help/copy explains that CLIProxy prefers explicit session or thread identifiers before falling back to prompt-history hashing, and remote session-affinity management stays explicitly unsupported until upstream management APIs expose more than `routing.strategy`.
- **2026-04-24**: **#1065** Local CLIProxy Plus is available again as an explicit opt-in backend through the community-maintained `kaitranntt/CLIProxyAPIPlus` fork. CCS keeps `original` as the default backend, no longer downgrades saved `backend: plus` configs to `original`, updates Plus release lookups to the maintained fork, and documents Plus as a targeted path for plus-only providers.
- **2026-04-21**: CLIProxy quota failover now quarantines exhausted Claude and Antigravity accounts out of live rotation when a healthy fallback exists. CCS persists those quota-triggered pauses across launches, automatically resumes them after the configured cooldown window, and deliberately avoids auto-pausing the last available account so single-account setups still degrade gracefully instead of hard-locking themselves.
- **2026-04-20**: **#1051** Browser automation now defaults safe-off for new installs and upgrades that do not already carry explicit browser settings. CCS changes both Claude Browser Attach and Codex Browser Tools to start with `enabled: false` and `policy: manual`, normalizes missing browser policies on upgrade back to `manual`, preserves explicit existing enablement, and updates status/help/docs so browser tooling is never implied to auto-expose unless users opt in.
- **2026-04-19**: **#1051** Browser tooling now has an explicit exposure policy instead of only coarse enablement toggles. CCS adds `browser.<lane>.policy` (`auto` or `manual`) for both Claude Browser Attach and Codex Browser Tools, exposes CLI-first policy controls through `ccs browser policy`, `ccs browser enable`, and `ccs browser disable`, and adds one-run launch overrides `--browser` and `--no-browser` so users can force browser tooling on or off without editing saved config.
- **2026-04-19**: **#1049** Browser setup now has a real remediation path instead of status/doctor-only guidance. CCS adds `ccs browser setup` as the primary one-command flow for Claude Browser Attach, shortens managed browser-path output to home-relative display paths where appropriate, and updates browser readiness guidance to point users at setup first while keeping browser doctor read-only by default.
- **2026-04-18**: **#1038** Legacy OpenAI-compatible provider writes no longer self-destruct on the next `ccs cliproxy restart`. CCS now preserves AI-provider-managed top-level sections such as `openai-compatibility` during CLIProxy config regeneration, and the legacy `openai-compat` manager now rewrites only its own YAML section instead of dumping the whole file and stripping the generated version header. Regression coverage now proves the legacy helper keeps the generated header intact and that OpenAI-compatible connectors survive regeneration.
- **2026-04-16**: **#1030** Browser automation is now a first-class CCS surface instead of an env-only/runtime-only feature. CCS adds `ccs help browser`, `ccs browser status`, and `ccs browser doctor`; a dedicated `Settings -> Browser` dashboard tab for Claude Browser Attach and Codex Browser Tools; a new `browser` section in `~/.ccs/config.yaml`; explicit readiness/next-step messaging for attach-mode Chrome sessions; and Codex UI guidance that marks the managed `ccs_browser` entry as CCS-owned and redirects browser setup away from the generic MCP editor.
- **2026-04-15**: **#969** Local CLIProxy bootstrap no longer depends on live GitHub reachability during normal dashboard and runtime startup. CCS now skips hidden auto-update lookups on standard CLIProxy bootstrap paths, fails fast with explicit `ccs cliproxy install` guidance when a service start needs a binary that is not installed locally, and keeps `ccs config` able to open the dashboard in limited mode instead of stalling behind blocked release downloads.
- **2026-04-15**: **#1010** Remote dashboard auth guidance now explains the Docker boundary explicitly. The readonly banner, remote login/setup card, and dashboard-auth docs now tell users that integrated Docker deployments keep config inside the running `ccs-cliproxy` container volume, so `ccs config auth setup` must run there rather than in the outer host shell.
- **2026-04-14**: **#991** CCS now auto-routes Claude-target settings profiles that use OpenAI-compatible endpoints through a local Anthropic-compatible proxy instead of sending raw Anthropic `/v1/messages` traffic directly to chat-completions backends. The `ccs proxy` command now supports `start`, `status`, `activate`, and `stop` with explicit host binding, shell-aware activation helpers, and a fuller local runtime env contract. The proxy surface now exposes `GET /`, `/health`, `/v1/models`, and `/v1/messages`, logs routing decisions into CCS structured logs, supports Anthropic image blocks plus request-time `profile:model` overrides, and adds config-driven scenario routing (`background`, `think`, `longContext`, `webSearch`) on top of the compatible-profile path. Coverage now includes request routing, rate-limit/timeout/empty-upstream failures, chunked tool-call streaming, and disconnect cleanup alongside the existing unit, integration, and e2e suites.
- **2026-04-10**: **#765** `/providers` now includes a first-class Hugging Face preset for API Profiles. CCS exposes Hugging Face Inference Providers through the existing OpenAI-compatible profile flow with the official router endpoint `https://router.huggingface.co/v1`, a short `hf` default profile name, and `hf` preset alias support for both the dashboard chooser and `ccs api create --preset hf`.
- **2026-04-10**: **#944** Image Analysis auth readiness no longer collapses to native Read when merged runtime-status dependency overrides include a missing initializer value. CCS now preserves default dependency functions when override entries are `undefined`, still reads token-backed auth status directly in the local readiness path, and includes regression coverage for the missing-initializer case that previously surfaced as `deps.initializeAccounts is not a function`.
- **2026-04-10**: **#945** CCS now normalizes Gemini CLI and Antigravity tier signals around an explicit `free / pro / ultra / unknown` model, preserves raw tier ids such as `g1-pro-tier`, enriches Gemini quota responses with provider entitlement evidence, classifies `MODEL_CAPACITY_EXHAUSTED` separately from auth/entitlement failures, fixes the Antigravity CLI quota table so live quota-derived tiers no longer collapse back to stale `unknown`, adds Gemini tier ids to CLI quota output, extends Gemini Flash Lite grouping to cover `gemini-3.1-flash-lite-preview`, and allows Gemini account surfaces to render the same tier badge semantics as Antigravity.
- **2026-04-09**: **#938** Cliproxy model routing now exposes backend-pinned short prefixes for overlapping OAuth backends. CCS repairs managed OAuth auth-file prefixes for Gemini CLI (`gcli`) and Antigravity (`agy`), enriches `/api/cliproxy/catalog` with routing hints that show whether an unprefixed model is safe, shadowed, or prefix-only, upgrades `ccs cliproxy catalog` plus interactive variant model pickers to surface the pinned names, and updates the `ccs config` Cliproxy model selection UI so users can see the preferred call name and current effective backend before saving settings.
- **2026-04-08**: **#931** `/cliproxy` model pickers now source their provider catalogs from CLIProxy management model definitions instead of treating the UI catalog file as the dropdown source of truth. CCS now refreshes live model definitions for Gemini, Codex, Claude, Antigravity, Qwen, iFlow, Kiro, GitHub Copilot, and Kimi through `/api/cliproxy/catalog`, overlays CCS-only preset/default metadata on top of those upstream models, keeps `/api/cliproxy/models` as the live availability feed, and falls back to cached/static catalogs when the proxy is unavailable so the dashboard never goes blank.
- **2026-04-08**: **#929** Image Analysis hardening now makes the managed `ccs-image-analysis` MCP path authoritative on healthy Claude-target launches, suppresses stale CCS-managed image `Read` hooks instead of letting them compete with MCP, keeps the legacy hook available only as compatibility fallback when MCP provisioning fails, and extends self-heal to dashboard provisioning plus `ccs doctor --fix` so stale hook files and missing isolated MCP sync are repaired automatically.
- **2026-04-07**: CLIProxy routing strategy is now a first-class CCS surface. Users can inspect and explicitly change `round-robin` vs `fill-first` from `ccs cliproxy routing` and from a native `/cliproxy` dashboard card. Local mode now persists the chosen startup default into CCS-managed CLIProxy config generation, while untouched installs remain on `round-robin`. CCS deliberately does not infer strategy from account composition.
- **2026-04-07**: **#926** CCS now has a first-class structured logging layer under `src/services/logging/`, a bounded top-level `logging` config section in `~/.ccs/config.yaml`, automatic rotation/retention for CCS-owned logs under `~/.ccs/logs/`, native `/api/logs` dashboard endpoints, request tracing for the dashboard backend, and a dedicated `System -> Logs` dashboard route for browsing recent entries and editing retention settings. Legacy CLIProxy error files remain available as a labeled legacy source instead of acting as the primary logging model.
- **2026-04-06**: The dashboard login surface now distinguishes a real sign-in from a host-setup requirement. Remote/IP visitors no longer see a misleading blank credential form when dashboard auth is disabled or incomplete; they now get explicit guidance that CCS has no default credentials, should be enabled on the host with `ccs config auth setup`, or should be reopened via localhost when used on the same machine. The password field now includes a show/hide toggle, and the page exposes an explicit light/dark theme switch before sign-in.
- **2026-04-04**: The GitHub README was reduced from a wall-of-text reference dump into a shorter conversion surface that keeps the hero, proof screenshots, and fast-start commands while delegating deeper installation, provider, feature, and CLI-reference content to `docs.ccs.kaitran.ca`. The docs site now includes a dedicated `Product Tour` page for the screenshot-led walkthrough.
- **2026-04-05**: **#912 #913 #914** Kiro auth is now aligned with the current CLIProxyAPIPlus contract. CCS auto-selects the Builder ID path for the default `ccs kiro --auth` flow instead of stalling on the upstream Builder ID vs IDC chooser, callback-based Kiro auth methods can use `--paste-callback` by replaying the pasted redirect URL back into the local callback server, and the CLI now supports IDC auth via `--kiro-auth-method idc` plus `--kiro-idc-start-url`, `--kiro-idc-region`, and `--kiro-idc-flow`.
- **2026-04-03**: CCS CLI help and completion UX was refreshed. Root help is now shorter and task-oriented, `ccs help <topic|command>` routes to topic-aware help, and shell completions now delegate to the hidden `ccs __complete` backend.
- **2026-04-02**: Third-party image and PDF analysis now follows the same first-class local-tool model as WebSearch. CCS provisions `ccs-image-analysis` as a managed MCP tool, routes requests directly to provider-scoped CCS endpoints such as `/api/provider/agy/v1/messages`, keeps editable prompt templates under `~/.ccs/prompts/image-analysis/`, and demotes the old `Read` hook to a best-effort compatibility fallback. Launches now stay non-fatal and fall back to native `Read` when the managed runtime cannot be prepared.
- **2026-04-01**: The `Compatible -> Codex CLI` dashboard now exposes manual long-context controls for `model_context_window` and `model_auto_compact_token_limit`. CCS reads and patches those upstream Codex config keys directly, adds official guidance that GPT-5.4 long context is experimental and opt-in, and keeps the behavior manual-only so the dashboard never auto-fills or auto-saves long-context values for the user.
- **2026-03-30**: **#862** Third-party WebSearch now uses a first-class CCS-managed MCP tool path instead of relying on a denied native Anthropic `WebSearch` call as the normal UX. CCS provisions `ccs-websearch` into `~/.claude.json`, syncs it into isolated account configs when needed, suppresses native `WebSearch` on third-party launches, preserves the provider order `Exa -> Tavily -> Brave -> DuckDuckGo -> legacy CLI fallback`, and keeps the old hook runtime only as shared provider plumbing plus compatibility fallback. Uninstall cleanup now also removes the managed WebSearch MCP runtime.
- **2026-03-28**: **#773** CCS now ships a dedicated `Compatible -> Codex CLI` dashboard route with a real split-view control center. The page detects the local Codex binary, keeps overview/docs guidance, and adds guided editors for the user-owned `~/.codex/config.toml` layer: top-level runtime defaults, project trust, profiles, model providers, MCP servers, and supported feature flags. Structured saves intentionally normalize TOML formatting and drop comments, so the raw editor remains the fidelity escape hatch. Follow-up fixes added immediate raw snapshot refresh, refresh/discard recovery for stale raw drafts, dirty raw-editor guarding for structured controls, project-trust path validation, read-only handling for unreadable config files, preservation of unsupported upstream values such as granular `approval_policy`, and feature reset-to-default support. CCS still warns that transient runtime overrides such as `codex -c key=value` and `CCS_CODEX_API_KEY` may change effective behavior without persisting into the file.
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
- **#724**: Codex startup is now free-plan safe. CCS defaults new Codex sessions to a cross-plan model and uses runtime fallback handling for unsupported paid-only models without rewriting the saved dashboard settings.
- **#737**: Dashboard model pickers in Cursor, Copilot, and CLIProxy now use a searchable combobox with autofocus and explicit no-results states for large model catalogs.
- **#736**: `ccs config` now supports explicit dashboard bind hosts via `--host`, and surfaces remote-access warnings plus reachable URLs when the effective bind is non-loopback.
- **#1121**: Usage analytics pricing now refreshes cached models.dev metadata before cost derivation, keeps CCS static pricing as the offline fallback, and carries provider identity through CLIProxy/native runtime breakdowns so subscription-backed providers do not inherit paid API pricing.

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

## Historical Maintainability Gate (Retired)

This section is preserved as historical context from the original Issue `#539` work.

- The maintainability baseline gate is no longer part of the active CCS workflow.
- Current contributor and CI gates are documented in `CLAUDE.md`, `CONTRIBUTING.md`, and the GitHub workflow files.
- Do not assume `maintainability:baseline` or `maintainability:check` exist unless they are reintroduced in a future follow-up.

---

## Related Documentation

- [Codebase Summary](./codebase-summary.md) - Current structure
- [Code Standards](./code-standards.md) - Patterns and conventions
- [System Architecture](./system-architecture/index.md) - Architecture diagrams
- [Hardening Debt Burndown Tracker](./hardening-debt-burndown.md) - Legacy shim + sync-fs debt tracking
- [CLAUDE.md](../CLAUDE.md) - AI development guidance
