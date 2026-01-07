# CCS Codebase Summary

Last Updated: 2026-01-06

Comprehensive overview of the modularized CCS codebase structure following the Phase 9 modularization effort (Settings, Analytics, Auth Monitor splits + Test Infrastructure), v7.1 Remote CLIProxy feature, v7.2 Kiro + GitHub Copilot (ghcp) OAuth providers, and v7.14 Hybrid Quota Management.

## Repository Structure

```
ccs/
├── src/                      # CLI TypeScript source
├── dist/                     # Compiled JavaScript (npm package)
├── lib/                      # Native shell scripts (bash, PowerShell)
├── ui/                       # React dashboard application
│   ├── src/                  # UI source code
│   └── dist/                 # Built UI bundle
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
├── ccs.ts                    # Main entry point & CLI router
├── types/                    # TypeScript type definitions
│   ├── index.ts              # Barrel export (aggregates all types)
│   ├── cli.ts                # CLI types (ParsedArgs, ExitCode)
│   ├── config.ts             # Config types (Settings, EnvVars)
│   ├── delegation.ts         # Delegation types (sessions, events)
│   ├── glmt.ts               # GLMT types (messages, transforms)
│   └── utils.ts              # Utility types (ErrorCode, LogLevel)
│
├── commands/                 # CLI command handlers
│   ├── cliproxy-command.ts   # CLIProxy subcommand handling
│   ├── doctor-command.ts     # Health diagnostics
│   ├── help-command.ts       # Help text generation
│   ├── install-command.ts    # Install/uninstall logic
│   ├── shell-completion-command.ts
│   ├── sync-command.ts       # Symlink synchronization
│   ├── update-command.ts     # Self-update logic
│   └── version-command.ts    # Version display
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
├── glmt/                     # GLM/GLMT integration
│   ├── index.ts              # Barrel export
│   ├── pipeline/             # Processing pipeline
│   │   └── index.ts
│   ├── glmt-proxy.ts         # Main proxy (675 lines)
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
│   │   └── index.ts
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
│   └── [utility files...]
│
└── web-server/               # Express web server (heavily modularized)
    ├── index.ts              # Server entry & barrel export
    ├── routes/               # 15+ route handlers
    │   ├── index.ts
    │   ├── accounts-route.ts
    │   ├── auth-route.ts
    │   ├── cliproxy-route.ts
    │   ├── copilot-route.ts
    │   ├── doctor-route.ts
    │   ├── glmt-route.ts
    │   ├── health-route.ts
    │   ├── profiles-route.ts
    │   └── [more routes...]
    ├── health/               # Health check system
    │   └── index.ts
    ├── usage/                # Usage analytics module
    │   ├── index.ts
    │   ├── handlers.ts       # Request handlers (633 lines)
    │   ├── aggregator.ts     # Data aggregation (538 lines)
    │   └── data-aggregator.ts
    ├── services/             # Shared services
    │   └── index.ts
    └── model-pricing.ts      # Model cost definitions (676 lines)
```

### Module Categories

| Category | Directories | Purpose |
|----------|-------------|---------|
| Core | `commands/`, `errors/` | CLI commands, error handling |
| Auth | `auth/`, `cliproxy/auth/` | Authentication across providers |
| Config | `config/`, `types/` | Configuration & type definitions |
| Providers | `cliproxy/`, `copilot/`, `glmt/` | Provider integrations (7 CLIProxy providers: gemini, codex, agy, qwen, iflow, kiro, ghcp) |
| Quota | `cliproxy/quota-*.ts`, `account-manager.ts` | Hybrid quota management (v7.14) |
| Remote Proxy | `cliproxy/remote-*.ts`, `proxy-config-resolver.ts` | Remote CLIProxy support (v7.1) |
| Services | `web-server/`, `api/` | HTTP server, API services |
| Utilities | `utils/`, `management/` | Helpers, diagnostics |

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
│   │   │   ├── use-settings-tab.ts
│   │   │   ├── use-proxy-config.ts
│   │   │   ├── use-websearch-config.ts
│   │   │   ├── use-globalenv-config.ts
│   │   │   └── use-raw-config.ts
│   │   ├── components/
│   │   │   ├── section-skeleton.tsx
│   │   │   └── tab-navigation.tsx
│   │   └── sections/
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
| model-pricing.ts | 676 | Data file - acceptable |
| glmt-proxy.ts | 675 | Complex streaming - acceptable |
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
├── unit/                     # Unit tests (6 core test files)
│   ├── data-aggregator.test.ts
│   ├── cliproxy/
│   │   └── remote-proxy-client.test.ts
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
| CLI Tests | 539 |
| UI Tests | 99 |
| Total Tests | 638 |
| Passing | 612 |
| Skipped | 6 |
| Failed | 0 (CLI), 26 (UI - jsdom setup) |
| Coverage Threshold | 90% |
| Test Files | 38 |

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
- [System Architecture](./system-architecture.md) - High-level architecture diagrams
- [Project Roadmap](./project-roadmap.md) - Modularization phases and future work
- [WebSearch](./websearch.md) - WebSearch feature documentation
- [CLAUDE.md](../CLAUDE.md) - AI-facing development guidance
