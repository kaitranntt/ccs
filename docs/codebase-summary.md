# CCS Codebase Summary

Last Updated: 2026-04-26

Comprehensive overview of the modularized CCS codebase structure following the Phase 9 modularization effort (Settings, Analytics, Auth Monitor splits + Test Infrastructure), v7.1 Remote CLIProxy feature, v7.2 Kiro + GitHub Copilot (ghcp) OAuth providers, v7.14 Hybrid Quota Management, v7.34 Image Analysis Hook, account-context validation hardening, Official Claude Channels runtime support, native Codex runtime target support, native Codex/Droid usage collectors, and models.dev-backed model pricing metadata.

## Repository Structure

```
ccs/
├── src/                      # CLI TypeScript source
├── dist/                     # Compiled JavaScript (npm package)
├── lib/                      # Native shell scripts (bash, PowerShell)
├── ui/                       # React dashboard application
│   ├── src/                  # UI source code
│   └── dist/                 # Built UI bundle
├── docker/                   # Docker deployment configuration
│   ├── Dockerfile            # Multi-stage build (bun 1.2.21, node:20-bookworm-slim)
│   ├── docker-compose.yml    # Compose setup with resource limits, healthcheck
│   ├── entrypoint.sh         # Entrypoint with privilege dropping, usage help
│   └── README.md             # Docker deployment guide
├── tests/                    # Test suites
├── docs/                     # Documentation
└── assets/                   # Static assets (logos, screenshots)
```

---

## CLI Source (`src/`)

The main CLI is organized into domain-specific modules with barrel exports.

### Directory Structure

```
src/
├── ccs.ts                    # Main entry point & profile execution flow
├── bin/                      # Dedicated runtime entrypoints
│   ├── droid-runtime.ts      # Forces droid target for ccs-droid / ccsd package bins
│   ├── codex-runtime.ts      # Forces codex target for ccs-codex / ccsx package bins
│   └── ccsxp-runtime.ts      # Forces codex target + native cliproxy override for ccsxp
├── types/                    # TypeScript type definitions
│   ├── index.ts              # Barrel export (aggregates all types)
│   ├── cli.ts                # CLI types (ParsedArgs, ExitCode)
│   ├── config.ts             # Config types (Settings, EnvVars)
│   ├── delegation.ts         # Delegation types (sessions, events)
│   ├── glmt.ts               # Legacy transformer types (messages, transforms)
│   └── utils.ts              # Utility types (ErrorCode, LogLevel)
│
├── commands/                 # CLI command handlers
│   ├── api-command/          # API profile subcommands (split facade + handlers)
│   │   ├── index.ts          # API command facade/router
│   │   ├── shared.ts         # Shared API arg parsing helpers
│   │   └── [subcommand files...]
│   ├── cliproxy-command.ts   # CLIProxy subcommand handling
│   ├── config-command.ts     # Config management commands
│   ├── config-image-analysis-command.ts  # First-class ImageAnalysis config (NEW v7.34)
│   ├── named-command-router.ts  # Reusable named-command dispatcher
│   ├── doctor-command.ts     # Health diagnostics
│   ├── env-command.ts        # Export shell env vars for third-party tools (v7.39)
│   ├── help-command.ts       # Help text generation
│   ├── install-command.ts    # Install/uninstall logic
│   ├── root-command-router.ts  # Extracted top-level command dispatch from ccs.ts
│   ├── shell-completion-command.ts
│   ├── sync-command.ts       # Symlink synchronization
│   ├── update-command.ts     # Self-update logic
│   └── version-command.ts    # Version display
│
├── targets/                  # Multi-target adapter system (NEW)
│   ├── index.ts              # Barrel export
│   ├── target-adapter.ts     # TargetAdapter interface contract
│   ├── target-registry.ts    # Registry for runtime adapter lookup
│   ├── target-resolver.ts    # Resolution logic (flag > runtime entrypoint / argv[0] > config)
│   ├── target-metadata.ts    # Runtime vs persisted target metadata and alias lists
│   ├── target-runtime-compatibility.ts # Guardrails for target/profile combinations
│   ├── claude-adapter.ts     # Claude Code CLI implementation
│   ├── droid-adapter.ts      # Factory Droid CLI implementation
│   ├── codex-adapter.ts      # Native Codex CLI implementation
│   ├── codex-detector.ts     # Codex binary detection and capability probing
│   ├── droid-detector.ts     # Droid binary detection & version checks
│   └── droid-config-manager.ts  # ~/.factory/settings.json management
│
├── auth/                     # Authentication module
│   ├── index.ts              # Barrel export
│   ├── commands/             # Auth-specific CLI commands
│   │   └── index.ts
│   ├── account-switcher.ts   # Account switching logic
│   └── profile-detector.ts   # Profile detection (474 lines)
│
├── config/                   # Configuration management
│   ├── index.ts              # Barrel export
│   ├── unified-config-loader.ts  # Central config loader (546 lines)
│   └── migration-manager.ts  # Config migration logic
│
├── proxy/                    # OpenAI-compatible proxy runtime
│   ├── index.ts              # Barrel export
│   ├── proxy-daemon-entry.ts # Daemon entrypoint
│   ├── proxy-daemon.ts       # Lifecycle, health, and port binding
│   ├── proxy-port-resolver.ts # Adaptive per-profile port selection
│   ├── request-router.ts     # Request-time profile/model routing
│   ├── profile-router.ts     # Profile resolution helpers
│   ├── proxy-env.ts          # Local runtime env construction
│   ├── routing-config.ts     # Proxy routing config parsing
│   ├── upstream-url.ts       # Upstream endpoint resolution
│   ├── proxy-daemon-state.ts # Persistent running-state metadata
│   ├── server/               # HTTP server and routes
│   └── transformers/         # Request and SSE translation
│
├── channels/                 # Official Claude channel integration
│   ├── official-channels-runtime.ts  # Runtime gating, plugin specs, setup guidance
│   └── official-channels-store.ts    # Claude channel token/env storage helpers
│
├── cliproxy/                 # CLIProxyAPI integration (heavily modularized)
│   ├── index.ts              # Barrel export (137 lines, extensive)
│   ├── auth/                 # OAuth handlers, token management
│   │   └── index.ts
│   ├── binary/               # Binary management
│   │   └── index.ts
│   ├── services/             # Service layer
│   │   └── index.ts
│   ├── cliproxy-executor.ts  # Main executor (666 lines)
│   ├── config-generator.ts   # Config file generation (531 lines)
│   ├── account-manager.ts    # Account management (509 lines)
│   ├── quota-manager.ts      # Hybrid quota management (NEW v7.14)
│   ├── quota-fetcher.ts      # Provider quota API integration (NEW v7.14)
│   ├── platform-detector.ts  # OS/arch detection
│   ├── binary-manager.ts     # Binary download/update
│   ├── auth-handler.ts       # Authentication handling
│   ├── model-catalog.ts      # Provider model definitions
│   ├── model-config.ts       # Model configuration
│   ├── codex-plan-compatibility.ts  # Codex free/paid model fallback guardrails
│   ├── service-manager.ts    # Background service
│   ├── proxy-detector.ts     # Running proxy detection
│   ├── startup-lock.ts       # Race condition prevention
│   ├── remote-proxy-client.ts    # Remote proxy health checks (v7.1)
│   ├── proxy-config-resolver.ts  # CLI/env/config merging (v7.1)
│   ├── types.ts              # ResolvedProxyConfig for local/remote modes
│   └── [more files...]
│
├── copilot/                  # GitHub Copilot integration
│   ├── index.ts              # Barrel export
│   └── copilot-package-manager.ts  # Package management (515 lines)
│
├── glmt/                     # Legacy transformer internals kept for compatibility
│   ├── index.ts              # Barrel export
│   ├── pipeline/             # Processing pipeline
│   │   └── index.ts
│   ├── glmt-proxy.ts         # Legacy proxy runtime kept for internal compatibility
│   └── delta-accumulator.ts  # Delta processing (484 lines)
│
├── delegation/               # Task delegation & headless execution
│   ├── index.ts              # Barrel export
│   ├── executor/             # Execution engine
│   └── [delegation files...]
│
├── errors/                   # Centralized error handling
│   ├── index.ts              # Barrel export
│   ├── error-handler.ts      # Main error handler
│   ├── exit-codes.ts         # Exit code definitions
│   └── cleanup.ts            # Cleanup logic
│
├── management/               # Doctor diagnostics
│   ├── index.ts              # Barrel export
│   ├── checks/               # Diagnostic checks
│   │   ├── index.ts
│   │   └── image-analysis-check.ts  # ImageAnalysis runtime validation (NEW v7.34)
│   └── repair/               # Auto-repair logic
│       └── index.ts
│
├── api/                      # API utilities & services
│   ├── index.ts              # Barrel export
│   └── services/             # API services
│       ├── index.ts
│       ├── profile-reader.ts
│       └── profile-writer.ts
│
├── utils/                    # Utilities (modularized into subdirs)
│   ├── index.ts              # Barrel export
│   ├── ui/                   # Terminal UI utilities
│   │   ├── index.ts
│   │   ├── boxes.ts          # Box drawing
│   │   ├── colors.ts         # Terminal colors
│   │   └── spinners.ts       # Progress spinners
│   ├── websearch/            # Search tool integrations
│   │   └── index.ts
│   ├── hooks/                # Claude Code compatibility hooks (NEW v7.34)
│   │   ├── index.ts
│   │   ├── image-analyzer-hook-installer.ts
│   │   ├── image-analyzer-hook-configuration.ts
│   │   ├── image-analyzer-profile-hook-injector.ts
│   │   └── get-image-analysis-hook-env.ts
│   ├── image-analysis/       # ImageAnalysis MCP/runtime utilities (NEW v7.34)
│   │   ├── index.ts
│   │   ├── hook-installer.ts
│   │   ├── mcp-installer.ts
│   │   └── claude-tool-args.ts
│   └── [utility files...]
│
└── web-server/               # Express web server (heavily modularized)
    ├── index.ts              # Server entry & barrel export
    ├── routes/               # 15+ route handlers
    │   ├── index.ts
    │   ├── accounts-route.ts
    │   ├── auth-route.ts
    │   ├── channels-routes.ts
    │   ├── cliproxy-route.ts
    │   ├── copilot-route.ts
    │   ├── doctor-route.ts
    │   ├── glmt-route.ts
    │   ├── health-route.ts
    │   ├── profiles-route.ts
    │   └── [more routes...]
    ├── health/               # Health check system
    │   └── index.ts
    ├── usage/                # Usage analytics module (default Claude, CCS instances, native Codex/Droid, CLIProxy snapshots)
    │   ├── index.ts
    │   ├── handlers.ts       # Request handlers (633 lines)
    │   ├── aggregator.ts     # Data aggregation (538 lines)
    │   ├── codex-native-usage-collector.ts  # Native Codex rollout JSONL collector
    │   ├── droid-native-usage-collector.ts  # Native Droid SQLite collector
    │   └── data-aggregator.ts
    ├── models-dev/           # Cached models.dev metadata/pricing registry integration
    │   ├── registry-cache.ts
    │   ├── pricing-resolver.ts
    │   └── types.ts
    ├── services/             # Shared services
    │   └── index.ts
    └── model-pricing.ts      # Static pricing fallback + models.dev resolver
```

### Module Categories

| Category | Directories | Purpose |
|----------|-------------|---------|
| Core | `commands/`, `errors/` | CLI commands, error handling |
| Targets | `bin/`, `targets/` | Multi-CLI adapter pattern (Claude Code, Factory Droid, Codex CLI, extensible) |
| Auth | `auth/`, `cliproxy/auth/` | Authentication across providers |
| Config | `config/`, `types/` | Configuration & type definitions |
| OpenAI Proxy | `proxy/` | Adaptive local OpenAI-compatible proxy runtime, profile routing, and SSE transforms |
| Providers | `cliproxy/`, `copilot/`, `glmt/` | Provider integrations plus retained legacy transformer internals |
| Quota | `cliproxy/quota-*.ts`, `account-manager.ts` | Hybrid quota management (v7.14) |
| Remote Proxy | `cliproxy/remote-*.ts`, `proxy-config-resolver.ts` | Remote CLIProxy support (v7.1) |
| Image Analysis | `utils/image-analysis/`, `utils/hooks/` | Vision model proxying (v7.34) |
| Services | `web-server/`, `api/` | HTTP server, API services |
| Utilities | `utils/`, `management/` | Helpers, diagnostics |

### Account Context Metadata Flow

- Source fields: `accounts.<name>.context_mode`, `accounts.<name>.context_group`, `accounts.<name>.continuity_mode` in `~/.ccs/config.yaml`.
- Runtime policy resolver: `src/auth/account-context.ts`.
- Metadata storage normalization: `src/auth/profile-registry.ts`.
- API write validation: `PUT /api/config` in `src/web-server/routes/config-routes.ts`.
- Rules:
  - mode is isolation-first (`isolated` default, `shared` opt-in)
  - shared mode requires non-empty valid `context_group`
  - shared mode continuity depth is `standard` by default, optional `deeper`
  - `context_group` is normalized (trim + lowercase + whitespace collapse to `-`)
  - API route rejects `context_group`/`continuity_mode` when mode is not `shared`
  - registry normalization drops malformed persisted `context_group` values

### Shared Plugin Layout

- Shared payload owner: `src/management/shared-manager.ts`.
- Profile entry point: `src/management/instance-manager.ts`.
- `plugins/marketplaces/`, `plugins/cache/`, and `installed_plugins.json` stay shared through the `~/.ccs/shared/` topology.
- `known_marketplaces.json` is now instance-local under `~/.ccs/instances/<profile>/plugins/` so Claude Code validates `installLocation` against the active `CLAUDE_CONFIG_DIR` instead of a last-writer-wins shared file.

### Official Claude Channels

- Runtime contract lives in `src/channels/official-channels-runtime.ts` and is consumed from `src/ccs.ts`, `src/commands/config-channels-command.ts`, and `src/web-server/routes/channels-routes.ts`.
- Canonical config lives under `channels.*` in `~/.ccs/config.yaml`; legacy `discord_channels.*` remains read-compatible only when canonical fields are absent.

### Native Codex Runtime Target

- Dedicated runtime entrypoints: `ccs-codex` and `ccsx` resolve through `src/bin/codex-runtime.ts`, while `ccsxp` resolves through `src/bin/ccsxp-runtime.ts`; all three set `CCS_INTERNAL_ENTRY_TARGET=codex` before delegating to `src/targets/target-resolver.ts`.
- Provider shortcut behavior: `ccsxp` strips user-supplied `--target` overrides and prepends `--config model_provider="cliproxy"` so it behaves like native Codex plus the CLIProxy provider recipe. The stricter CCS-managed bridge remains available explicitly through `ccs codex --target codex`. It pins `CODEX_HOME` to native `~/.codex` by default so inherited launcher state does not send history/config writes to a nonstandard Codex root; `CCSXP_CODEX_HOME` is the explicit override. On launch, CCS repairs the native `[model_providers.cliproxy]` stanza in `config.toml`, reads that provider's configured `env_key` (default `CLIPROXY_API_KEY`), and injects the effective CLIProxy auth token into that key for the child Codex process.
- Implicit Codex launches such as `ccs --target codex` and `ccsxp` use native Codex default mode even when the CCS default profile is a Claude account. Explicit unsupported profiles such as `ccs work --target codex` still fail fast with native-vs-pool guidance.
- `argv[0]` alias mapping still exists in `src/targets/target-resolver.ts` for same-binary/custom alias scenarios, but the built-in npm bins above do not depend on that map at runtime.
- Metadata boundary: `src/targets/target-metadata.ts` keeps Codex runtime-only in v1, so persisted default targets remain `claude | droid`.
- Compatibility guardrails: `src/targets/target-runtime-compatibility.ts` centralizes which profile types can execute on Codex.
- Adapter behavior: `src/targets/codex-adapter.ts` and `src/targets/codex-detector.ts` launch native Codex without rewriting `~/.codex/config.toml`; CCS-backed routes use transient `codex -c key=value` overrides and env-key injection.
- Dashboard control center: `src/web-server/services/codex-dashboard-service.ts`, `src/web-server/routes/codex-routes.ts`, `ui/src/pages/codex.tsx`, and `ui/src/components/compatible-cli/codex-*.tsx` expose a split-view Codex dashboard with guided editors for top-level settings, trust, profiles, providers, MCP servers, and feature flags plus a raw TOML fallback.
- Structured-edit boundary: guided Codex saves intentionally reserialize the whole TOML document, so comments/formatting are normalized and the raw editor remains the fidelity-preserving escape hatch.
- Follow-up behavior: structured saves refresh the raw snapshot immediately, refresh discards stale raw drafts, structured controls stay disabled while raw TOML is dirty/invalid/unreadable, project trust paths must be absolute or `~/...`, unsupported upstream top-level shapes are preserved instead of deleted, and feature flags can be reset to default.
- Supported Codex flows in v1:
  - `default`
  - CLIProxy provider `codex`
  - settings/API profiles only when they resolve to a Codex CLIProxy bridge
- Telegram and Discord bot tokens are intentionally written into Claude-managed machine state under `~/.claude/channels/<channel>/.env`, unless the official `*_STATE_DIR` environment override redirects that channel elsewhere.
- iMessage is tokenless, macOS-only, and still depends on Claude-side plugin install plus OS permissions.
- Auto-enable is gated on Bun availability, verified Claude Code v2.1.80+, verified `claude.ai` auth, native Claude `default/account` sessions, and per-channel setup readiness.
- The dashboard channels section surfaces Bun/version/auth/state-scope status from `/api/channels`, preserves token drafts when save-follow-up refresh fails, and keeps unsupported selected iMessage visible only so it can be turned off.

### Structured Logging Domain

- CCS-owned runtime logging now lives in `src/services/logging/`.
- The shared domain owns path resolution, redaction, rotation/pruning, buffered recent-entry reads, and the logger factory used by CLI/server/runtime code.
- Dashboard exposure lives in `src/web-server/routes/logs-routes.ts`, `src/web-server/services/logs-dashboard-service.ts`, and `src/web-server/middleware/request-logging-middleware.ts`.
- The native dashboard viewer lives at `ui/src/pages/logs.tsx` with supporting components under `ui/src/components/logs/` and hooks in `ui/src/hooks/use-logs.ts`.
- Legacy CLIProxy error files still exist under `~/.ccs/cliproxy/logs` and are surfaced as a labeled legacy source rather than the primary CCS logging model.

### Target Adapter Module

The targets module provides an extensible interface for dispatching profiles to different CLI implementations.

**Key components:**

1. **TargetAdapter Interface** - Contract that each CLI implementation must fulfill:
   - binary detection
   - credential preparation
   - target-specific args/env construction
   - process execution
   - profile compatibility checks

2. **Target Resolution** - Priority order:
   - `--target <cli>` flag (CLI argument)
   - Explicit runtime entrypoint via `CCS_INTERNAL_ENTRY_TARGET` (used by `src/bin/droid-runtime.ts`, `src/bin/codex-runtime.ts`, and `src/bin/ccsxp-runtime.ts`)
   - `argv[0]` detection for custom/same-binary runtime aliases
   - Per-profile `target` field (from config.yaml)
   - Default: `claude`

3. **Implementations:**
   - **ClaudeAdapter** - Wraps existing behavior; delivers credentials via environment variables
   - **DroidAdapter** - New; writes to ~/.factory/settings.json and spawns with `-m custom:ccs-<profile>` flag

4. **Registry** - Map-based lookup (O(1)) for registered adapters at runtime

**Usage flow:**
```
Profile resolution (existing)
  ↓
Target resolution (via resolver.ts)
  ↓
Get adapter from registry
  ↓
Prepare credentials (adapter.prepareCredentials)
  ↓
Build args & env (adapter.buildArgs, buildEnv)
  ↓
Spawn target CLI (adapter.exec)
```

---

## UI Source (`ui/src/`)

The React dashboard organized by domain with barrel exports at every level.

### Directory Structure

```
ui/src/
├── components/
│   ├── index.ts              # Main barrel (aggregates all domains)
│   │
│   ├── account/              # Account management
│   │   ├── index.ts          # Barrel export
│   │   ├── accounts-table.tsx
│   │   ├── add-account-dialog.tsx
│   │   └── flow-viz/         # Flow visualization (split from 1,144-line file)
│   │       ├── index.tsx     # Main component (200 lines)
│   │       ├── account-card.tsx
│   │       ├── account-card-stats.tsx
│   │       ├── connection-timeline.tsx
│   │       ├── flow-paths.tsx
│   │       ├── flow-viz-header.tsx
│   │       ├── provider-card.tsx
│   │       ├── hooks.ts
│   │       ├── types.ts
│   │       ├── utils.ts
│   │       ├── path-utils.ts
│   │       └── zone-utils.ts
│   │
│   ├── analytics/            # Usage charts, stats cards
│   │   ├── index.ts
│   │   ├── cliproxy-stats-card.tsx
│   │   └── usage-trend-chart.tsx
│   │
│   ├── cliproxy/             # CLIProxy configuration
│   │   ├── index.ts          # Barrel export (30 lines)
│   │   ├── provider-editor/  # Split from 921-line file
│   │   │   ├── index.tsx     # Main editor (250 lines)
│   │   │   └── [13 focused modules]
│   │   ├── config/           # YAML editor, file tree
│   │   │   ├── config-split-view.tsx
│   │   │   ├── diff-dialog.tsx
│   │   │   ├── file-tree.tsx
│   │   │   └── yaml-editor.tsx
│   │   ├── overview/         # Health lists, preferences
│   │   │   ├── credential-health-list.tsx
│   │   │   ├── model-preferences-grid.tsx
│   │   │   └── quick-stats-row.tsx
│   │   └── [7 top-level component files]
│   │
│   ├── copilot/              # Copilot settings
│   │   ├── index.ts
│   │   └── config-form/      # Split from 846-line file
│   │       └── [13 focused modules]
│   │
│   ├── health/               # System health gauges
│   │   └── index.ts
│   │
│   ├── layout/               # App structure
│   │   ├── index.ts
│   │   ├── sidebar.tsx
│   │   └── footer.tsx
│   │
│   ├── monitoring/           # Error logs, auth monitor
│   │   ├── index.ts
│   │   ├── proxy-status-widget.tsx
│   │   ├── auth-monitor/     # Split from 465-line file (8 files)
│   │   │   ├── index.tsx     # Main component
│   │   │   ├── types.ts
│   │   │   ├── hooks.ts
│   │   │   ├── utils.ts
│   │   │   └── components/
│   │   │       ├── live-pulse.tsx
│   │   │       ├── inline-stats-badge.tsx
│   │   │       ├── provider-card.tsx
│   │   │       └── summary-card.tsx
│   │   └── error-logs/       # Split from 617-line file
│   │       └── [6 focused modules]
│   │
│   ├── profiles/             # Profile management
│   │   ├── index.ts
│   │   ├── profile-dialog.tsx
│   │   ├── profile-create-dialog.tsx
│   │   └── editor/           # Split from 531-line file
│   │       └── [10 focused modules]
│   │
│   ├── setup/                # Quick setup wizard
│   │   ├── index.ts
│   │   └── wizard/           # Step-based wizard
│   │       ├── index.tsx
│   │       └── steps/
│   │
│   ├── shared/               # Reusable components (19 components)
│   │   ├── index.ts
│   │   ├── ccs-logo.tsx
│   │   ├── code-editor.tsx
│   │   ├── confirm-dialog.tsx
│   │   ├── provider-icon.tsx
│   │   ├── settings-dialog.tsx
│   │   ├── stat-card.tsx
│   │   └── [13 more shared components]
│   │
│   └── ui/                   # shadcn/ui primitives
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── searchable-select.tsx  # Shared searchable combobox for model pickers
│       ├── sidebar.tsx       # Custom sidebar (674 lines)
│       └── [UI primitives...]
│
├── contexts/                 # React Contexts
│   ├── privacy-context.tsx
│   ├── theme-context.tsx
│   └── websocket-context.tsx
│
├── hooks/                    # Custom hooks (domain-prefixed)
│   ├── use-accounts.ts
│   ├── use-cliproxy.ts
│   ├── use-health.ts
│   ├── use-profiles.ts
│   ├── use-websocket.ts
│   └── [more hooks...]
│
├── lib/                      # Utilities
│   ├── api.ts                # API client
│   ├── model-catalogs.ts     # Model definitions
│   └── utils.ts              # Helper functions
│
├── pages/                    # Page components (lazy-loaded)
│   ├── analytics/            # Split from 420-line file (8 files)
│   │   ├── index.tsx         # Main layout
│   │   ├── types.ts          # Analytics types
│   │   ├── hooks.ts          # Data fetching hooks
│   │   ├── utils.ts          # Utility functions
│   │   └── components/
│   │       ├── analytics-header.tsx
│   │       ├── analytics-skeleton.tsx
│   │       ├── charts-grid.tsx
│   │       └── cost-by-model-card.tsx
│   ├── settings/             # Split from 1,781-line file (20 files)
│   │   ├── index.tsx         # Main layout with lazy loading
│   │   ├── context.tsx       # Settings provider wrapper
│   │   ├── settings-context.ts
│   │   ├── types.ts
│   │   ├── hooks.ts          # Legacy re-exports
│   │   ├── hooks/
│   │   │   ├── index.ts
│   │   │   ├── context-hooks.ts
│   │   │   ├── use-official-channels-config.ts
│   │   │   ├── use-settings-tab.ts
│   │   │   ├── use-proxy-config.ts
│   │   │   ├── use-websearch-config.ts
│   │   │   ├── use-globalenv-config.ts
│   │   │   └── use-raw-config.ts
│   │   ├── components/
│   │   │   ├── section-skeleton.tsx
│   │   │   └── tab-navigation.tsx
│   │   └── sections/
│   │       ├── channels.tsx
│   │       ├── globalenv-section.tsx
│   │       ├── websearch/
│   │       │   ├── index.tsx
│   │       │   └── provider-card.tsx
│   │       └── proxy/
│   │           ├── index.tsx
│   │           ├── local-proxy-card.tsx
│   │           └── remote-proxy-card.tsx
│   ├── api.tsx               # API profiles page (350 lines)
│   ├── cliproxy.tsx          # CLIProxy page (405 lines)
│   ├── copilot.tsx           # Copilot page (295 lines)
│   └── health.tsx            # Health page (256 lines)
│
└── providers/                # Context providers
    └── websocket-provider.tsx
```

### Component Statistics

| Domain | Components | Subdirs | Split Files |
|--------|------------|---------|-------------|
| account | 3 | flow-viz (12 files) | 1 monster split |
| analytics | 3 | - | - |
| cliproxy | 10 | provider-editor, config, overview | 1 monster split |
| copilot | 2 | config-form (13 files) | 1 monster split |
| health | 2 | - | - |
| layout | 3 | - | - |
| monitoring | 3 | auth-monitor (8 files), error-logs (6 files) | 2 monster splits |
| profiles | 4 | editor (10 files) | 1 monster split |
| setup | 2 | wizard/steps | - |
| shared | 19 | - | - |
| **Total** | **51+** | **10 subdirs** | **7 splits** |

### Page Statistics

| Page | Structure | Files | Notes |
|------|-----------|-------|-------|
| analytics | Directory | 8 | Split 2025-12-21 |
| settings | Directory | 20 | Split 2025-12-21, lazy-loaded sections |
| api | Single file | 1 | 350 lines |
| cliproxy | Single file | 1 | 405 lines |
| copilot | Single file | 1 | 295 lines |
| health | Single file | 1 | 256 lines |

---

## Key File Metrics

### Largest Files (Acceptable Exceptions)

**CLI (`src/`):**

| File | Lines | Status |
|------|-------|--------|
| model-pricing.ts | 920 | Static pricing fallback and resolver entrypoint |
| glmt-proxy.ts | 675 | Legacy internal compatibility path - acceptable for now |
| cliproxy-executor.ts | 666 | Core logic - acceptable |
| cliproxy-command.ts | 634 | Could split if needed |
| usage/handlers.ts | 633 | Could split if needed |
| ccs.ts | 596 | Entry point - acceptable |
| unified-config-loader.ts | 546 | Complex - acceptable |

**UI (`ui/src/`):**

| File | Lines | Status |
|------|-------|--------|
| components/ui/sidebar.tsx | 674 | shadcn - acceptable |
| pages/cliproxy.tsx | 405 | Acceptable |
| pages/api.tsx | 350 | Acceptable |
| pages/copilot.tsx | 295 | Acceptable |
| pages/health.tsx | 256 | Acceptable |

**Split Files (Completed):**

| Original | Lines | New Location | Files |
|----------|-------|--------------|-------|
| pages/settings.tsx | 1,781 | pages/settings/ | 20 |
| pages/analytics.tsx | 420 | pages/analytics/ | 8 |
| monitoring/auth-monitor.tsx | 465 | monitoring/auth-monitor/ | 8 |

---

## Import Patterns

### Standard Import Path

```typescript
// From any file in src/
import { Config, Settings } from '../types';
import { execClaudeWithCLIProxy } from '../cliproxy';
import { handleError } from '../errors';

// From any file in ui/src/
import { AccountsTable, ProviderIcon, StatCard } from '@/components';
import { useAccounts, useProfiles } from '@/hooks';
```

### Barrel Export Pattern

Every domain directory has an `index.ts` that aggregates exports:

```typescript
// ui/src/components/cliproxy/index.ts
export { CategorizedModelSelector } from './categorized-model-selector';
export { CliproxyDialog } from './cliproxy-dialog';
// ...

// From subdirectories
export { ProviderEditor } from './provider-editor';
export type { ProviderEditorProps } from './provider-editor';
```

---

## Test Structure

```
tests/
├── unit/                     # Unit tests (7 core test files)
│   ├── data-aggregator.test.ts
│   ├── cliproxy/
│   │   └── remote-proxy-client.test.ts
│   ├── commands/
│   │   └── env-command.test.ts
│   ├── jsonl-parser.test.ts
│   ├── model-pricing.test.ts
│   ├── unified-config.test.ts
│   └── mcp-manager.test.ts
├── integration/              # Integration tests
├── native/                   # Native install tests
│   ├── linux/
│   ├── macos/
│   └── windows/
├── npm/                      # npm package tests
├── shared/                   # Shared test utilities
└── README.md
```

### Test Metrics

| Metric | Value |
|--------|-------|
| Total Tests | 1440 |
| Passing | 1440 |
| Skipped | 6 |
| Failed | 0 |
| Coverage Threshold | 90% |
| Test Files | 41 |

---

## Build Outputs

| Output | Source | Purpose |
|--------|--------|---------|
| `dist/` | `src/` | npm package (CLI) |
| `dist/ui/` | `ui/src/` | Built React app (served by Express) |
| `lib/` | N/A | Native shell scripts |

---

## Related Documentation

- [Code Standards](./code-standards.md) - Modularization patterns, file size rules
- [System Architecture](./system-architecture/index.md) - High-level architecture diagrams
- [Project Roadmap](./project-roadmap.md) - Modularization phases and future work
- [WebSearch](./websearch.md) - WebSearch feature documentation
- [Image Analysis](./image-analysis.md) - First-class ImageAnalysis runtime documentation
- [CLAUDE.md](../CLAUDE.md) - AI-facing development guidance
