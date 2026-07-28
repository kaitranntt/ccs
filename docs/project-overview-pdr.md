# CCS Product Development Requirements

## Product Overview

**Product name:** CCS (Claude Codex Switch)

**Purpose:** Provide one profile and runtime-management surface for Claude Code,
Codex CLI, Factory Droid, CLIProxy-backed OAuth providers, and compatible API
profiles.

CCS includes:

- a TypeScript CLI and local server;
- a React dashboard for configuration, account, health, and usage workflows;
- isolated account contexts and per-profile settings;
- local or remote CLIProxy routing;
- optional managed tools such as WebSearch and image analysis; and
- an integrated Docker image containing CCS, CLIProxy, and the dashboard.

Release versions and completed-release inventories belong in
[`CHANGELOG.md`](../CHANGELOG.md), not this evergreen requirements document.

## Problem

Developers need to switch between accounts, providers, and compatible CLIs
without repeatedly editing credentials or allowing one session's configuration
to leak into another. They also need a visible, reversible way to manage local
proxy state and diagnose provider readiness.

## Product Principles

1. **CLI first:** Core configuration and launch behavior remains scriptable.
2. **Explicit state:** Users can inspect which profile, provider, target, and
   proxy mode CCS selected.
3. **Isolation:** Account sessions use separate configuration roots where the
   target supports them.
4. **Compatibility:** CCS adapts provider credentials to a target without
   redefining the provider or target protocol.
5. **Reversibility:** Persistent writes are explicit and recoverable.
6. **Local ownership:** Credentials and profile state remain on infrastructure
   selected by the user.

## Users

| User | Primary need |
| --- | --- |
| Individual developer | Separate accounts, projects, and provider profiles |
| Consultant or agency | Isolate client contexts |
| API consumer | Reuse Anthropic-compatible and OpenAI-compatible providers |
| Power user | Manage OAuth accounts, routing, health, and quota state |
| Team operator | Run a shared remote CLIProxy or integrated Docker service |

## Functional Requirements

### FR-001: Profile resolution and launch

- Launch the default profile with `ccs`.
- Launch named settings, account, and CLIProxy profiles.
- Pass target-specific arguments without losing CCS-owned routing constraints.
- Resolve provider and target aliases through canonical registries.

### FR-002: Account isolation

- Maintain an account registry.
- Use isolated `CLAUDE_CONFIG_DIR` roots for Claude account profiles.
- Keep shared resources and instance-owned state distinguishable.
- Prevent one account's provider overrides from leaking into another launch.

### FR-003: Provider integration

- Support API-key profiles and OAuth-backed CLIProxy providers.
- Support local and remote CLIProxy operation.
- Keep original and Plus CLIProxy backends explicit; do not silently substitute
  one when a requested provider requires the other.
- Treat provider capability metadata as code-owned, not prose-owned. See
  [`src/cliproxy/provider-capabilities.ts`](../src/cliproxy/provider-capabilities.ts)
  and
  [`src/cliproxy/types/provider-types.ts`](../src/cliproxy/types/provider-types.ts).

### FR-004: Target adapters

- Support Claude Code, Factory Droid, and Codex CLI through target adapters.
- Deliver credentials in the form owned by each target:
  environment variables for Claude launches, managed custom-model state for
  Droid, and transient configuration overrides for CCS-routed Codex launches.
- Preserve user-owned target configuration outside the explicitly managed
  fields.

### FR-005: Configuration management

- Store CCS configuration under the directory resolved by
  [`getCcsDir()`](../src/utils/config-manager.ts).
- Store API profile launch settings in `<profile>.settings.json` files under
  that directory.
- Require all environment values written to settings files to be strings.
- Keep shared Claude settings unchanged during normal profile launches.
- Allow the explicit `ccs persist` workflow to merge a profile into
  `~/.claude/settings.json`; back up the existing file and write atomically.
- Reject unsafe settings-file targets such as symlinks.

### FR-006: Dashboard and diagnostics

- Provide local APIs and a React UI for supported configuration workflows.
- Surface health, authentication, provider, routing, and usage state without
  exposing credentials.
- Keep dashboard changes aligned with the same configuration contracts used by
  the CLI.

### FR-007: Managed tools

- Provide WebSearch and image-analysis integration for profiles that need
  CCS-managed alternatives.
- Prefer explicit provider routes.
- Fail closed when enabled third-party WebSearch cannot prepare its constrained
  MCP replacement.
- Allow image analysis to use compatible native behavior when its managed route
  is unavailable.

### FR-008: Remote proxy

- Resolve remote proxy settings from supported CLI flags, environment
  variables, and CCS configuration.
- Verify reachability before use.
- Fall back to a local proxy only when fallback is enabled.
- Fail instead of falling back when remote-only mode is selected.

### FR-009: Quota and account-pool management

- Display supported quota and account health data.
- Let users pause and resume accounts.
- Keep routing-strategy changes explicit.
- Temporarily remove exhausted accounts from rotation only under the
  CCS-managed cooldown contract and restore only CCS-created pauses.

### FR-010: Docker deployment

- Publish an integrated multi-architecture image containing CCS, CLIProxy, and
  the dashboard.
- Persist CCS state and service logs in declared volumes.
- Expose dashboard and CLIProxy service ports.
- Health-check both services.
- Do not bundle target AI CLIs into the integrated image; consumers that need
  them run sibling containers or install them separately.

### FR-011: Shell and editor integration

- Export shell-safe environment values through `ccs env`.
- Support the documented shell output formats.
- Keep persistent shared settings behind `ccs persist`.
- Keep editor-specific writes scoped to the selected editor and user layer.

## Non-Functional Requirements

### NFR-001: Security

- Do not print or log credentials.
- Bind local proxy services to loopback unless the user explicitly selects a
  deployment that exposes them.
- Validate file types and use safe replacement semantics for managed sensitive
  configuration.
- Keep remote transport and authentication choices explicit.

### NFR-002: Reliability

- Make setup and repair operations idempotent where practical.
- Preserve existing user state when merging managed configuration.
- Report recovery actions in actionable error messages.
- Clean up child processes and temporary runtime state on exit.

### NFR-003: Portability

- Support macOS, Linux, and Windows for the host CLI where target dependencies
  allow.
- Support Node.js 18 or newer, as declared by
  [`package.json`](../package.json).
- Support Bun 1.0 or newer for development and supported runtime workflows.
- Keep terminal output ASCII-only and respect `NO_COLOR` and TTY detection.

### NFR-004: Maintainability

- Keep provider metadata centralized.
- Use target adapters instead of target checks scattered through dispatch code.
- Validate CLI, server, and dashboard contracts with focused tests.
- Keep generated or volatile inventories out of evergreen architecture prose.

## Runtime and Deployment Requirements

| Surface | Requirement |
| --- | --- |
| Host npm install | Node.js 18+ |
| Development and repository gates | Bun 1.0+ and Node.js 18+ |
| Claude launches | Claude Code installed and authenticated as required by the selected profile |
| Droid launches | Factory Droid installed |
| Codex launches | Codex CLI installed |
| Local OAuth proxy | CCS-managed CLIProxy binary |
| Integrated Docker | Docker or compatible container runtime; target CLIs are not bundled |

## Architecture Constraints

### AC-001: Profile state and shared settings are separate

Normal launches consume CCS-owned profile files and environment state.
`~/.claude/settings.json` is written only through an explicit persistence or
approved settings-management workflow.

### AC-002: Provider and target are independent axes

A provider supplies credentials and routing. A target adapter determines how a
compatible CLI receives them. Unsupported combinations must fail clearly.

### AC-003: Proxy trust boundary is visible

Local CLIProxy, remote CLIProxy, and direct API profiles have different
transport and credential boundaries. CCS must not present them as equivalent or
silently cross those boundaries.

### AC-004: Source owns volatile capability data

Provider IDs, aliases, OAuth flow types, callback ports, refresh ownership,
backend restrictions, and quota support must be read from the provider
registries and tests. Documentation describes how to find them rather than
copying a second mutable table.

## Acceptance Criteria

- A user can create or select a supported profile and launch it on a compatible
  target without manual credential-file editing.
- Concurrent account profiles do not share target session state accidentally.
- Local and remote proxy failures follow the configured fallback policy.
- Persistent settings writes preserve unrelated keys and create a recovery
  path.
- Dashboard operations produce configuration compatible with CLI operations.
- Release automation publishes only from the documented branches and lanes.
- Documentation links resolve and architecture claims are traceable to source.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Provider auth contracts change | Central capability registry plus provider-specific tests |
| Target CLI configuration changes | Adapter boundary and compatibility checks |
| Credential leakage | Local storage, redaction, safe file handling, no secret logging |
| Remote proxy outage | Reachability checks and explicit fallback policy |
| Configuration corruption | Validation, backup, locking, and atomic replacement where supported |
| Documentation drift | Link volatile details to code; keep this document version-neutral |

## Related Documentation

- [Codebase Summary](./codebase-summary.md)
- [Code Standards](./code-standards.md)
- [System Architecture](./system-architecture/index.md)
- [Provider Flows](./system-architecture/provider-flows.md)
- [Release Process](./release-process.md)
- [Project Roadmap](./project-roadmap.md)
