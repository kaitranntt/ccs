# CCS Codebase Summary

CCS is a TypeScript/Bun CLI and local React dashboard for selecting profiles,
preparing provider credentials, and launching Claude Code, Codex CLI, Factory
Droid, and compatible proxy-backed workflows. This page maps stable ownership;
source and tests remain the implementation truth.

## Runtime Surfaces

| Surface | Entry point | Responsibility |
| --- | --- | --- |
| `ccs` CLI | [`src/ccs.ts`](../src/ccs.ts) | Parse global input, register targets, resolve profiles, dispatch commands or runtimes |
| Runtime aliases | [`package.json`](../package.json) | Expose packaged binaries such as `ccs`, `ccsx`, and target-specific entry points |
| Command handlers | [`src/commands/`](../src/commands/) | Implement CCS-owned command families and help text |
| Local web server | [`src/web-server/index.ts`](../src/web-server/index.ts) | Serve configuration APIs, WebSocket updates, and the built dashboard |
| Dashboard | [`ui/src/main.tsx`](../ui/src/main.tsx) | Mount the React application used by `ccs config` |
| Bootstrap wrappers | [`lib/`](../lib/) | Start the packaged CLI on Unix and Windows |

Detailed user workflows and command reference live at
[docs.ccs.kaitran.ca](https://docs.ccs.kaitran.ca). Do not infer current flags
from this overview; inspect the owning handler and its tests.

## CLI Domain Ownership

| Domain | Main source | Owns |
| --- | --- | --- |
| Command routing | [`src/commands/`](../src/commands/) | Command parsing, command-specific help, setup, doctor, config, Docker, and management flows |
| Profile dispatch | [`src/dispatcher/`](../src/dispatcher/) | Resolve a launch into target-specific execution flows |
| Runtime targets | [`src/targets/`](../src/targets/) | Target metadata, resolution, adapters, binary detection, and execution |
| Configuration | [`src/config/`](../src/config/) | Schema validation, loading, and normalized configuration access |
| CLIProxy | [`src/cliproxy/`](../src/cliproxy/) | Provider auth, configuration, routing, quota, lifecycle, and execution |
| Authentication | [`src/auth/`](../src/auth/) and [`src/codex-auth/`](../src/codex-auth/) | Account and OAuth-oriented authentication flows |
| Channels | [`src/channels/`](../src/channels/) | Official Claude channel readiness and configuration |
| Local proxy | [`src/proxy/`](../src/proxy/) | Anthropic-compatible proxy server and request/response transformers |
| Web API | [`src/api/`](../src/api/) and [`src/web-server/`](../src/web-server/) | Local dashboard services, routes, middleware, health, usage, and live updates |
| Shared services | [`src/services/`](../src/services/) | Cross-cutting runtime services, including structured logging |
| Errors | [`src/errors/`](../src/errors/) | Typed error taxonomy, handling, and exit behavior |
| Utilities | [`src/utils/`](../src/utils/) | CCS path handling and bounded shared helpers for browser, hooks, web search, image analysis, and UI support |
| Compatibility | [`src/glmt/`](../src/glmt/), [`src/copilot/`](../src/copilot/), [`src/cursor/`](../src/cursor/) | Legacy translation and integration-specific behavior |
| Packaging/runtime bins | [`src/bin/`](../src/bin/) | Target-specific packaged entry points |

The table is intentionally domain-level. Use repository search and nearby tests
to find the current implementation instead of relying on a recursive file tree.

## Profile and Target Dispatch

Profile resolution follows the repository contract in
[`CLAUDE.md`](../CLAUDE.md):

1. built-in CLIProxy providers
2. user-defined `config.cliproxy` providers
3. settings-based `config.profiles`
4. account-based `profiles.json` entries with isolated `CLAUDE_CONFIG_DIR`

Target selection is a separate layer:

| Concern | Source |
| --- | --- |
| Target names, aliases, and persistence | [`src/targets/target-metadata.ts`](../src/targets/target-metadata.ts) |
| Selection priority and `--target` parsing | [`src/targets/target-resolver.ts`](../src/targets/target-resolver.ts) |
| Adapter interface | [`src/targets/target-adapter.ts`](../src/targets/target-adapter.ts) |
| Adapter registry | [`src/targets/target-registry.ts`](../src/targets/target-registry.ts) |
| Claude implementation | [`src/targets/claude-adapter.ts`](../src/targets/claude-adapter.ts) |
| Droid implementation | [`src/targets/droid-adapter.ts`](../src/targets/droid-adapter.ts) |
| Codex implementation | [`src/targets/codex-adapter.ts`](../src/targets/codex-adapter.ts) |

All targets currently marked `persistedTarget` in target metadata are valid
profile targets. Runtime aliases are also derived from that metadata. Link to
the source instead of maintaining a second target list here.

At startup, [`src/ccs.ts`](../src/ccs.ts) registers adapters. The dispatcher
resolves the profile and target, asks the adapter to prepare credentials and
arguments, then executes the selected CLI. Target-specific behavior belongs in
the adapter or its supporting target module, not in generic command routing.

## Configuration and Local State

[`src/utils/config-manager.ts`](../src/utils/config-manager.ts) owns CCS home
resolution and honors `CCS_HOME`. Tests must point `CCS_HOME` at a temporary
directory and must not touch a contributor's real `~/.ccs/` or `~/.claude/`.

Configuration schemas and loaders live under [`src/config/`](../src/config/).
Provider- and CLIProxy-specific persistence stays under
[`src/cliproxy/config/`](../src/cliproxy/config/). Values written to settings
environment maps must remain strings.

Some integrations intentionally write state owned by the launched runtime, such
as Claude channel configuration or Codex configuration. Verify those boundaries
in the owning module and tests before changing paths, permissions, or cleanup.

## Dashboard Ownership

The dashboard is a separate TypeScript package under [`ui/`](../ui/):

| Area | Path | Responsibility |
| --- | --- | --- |
| Pages | [`ui/src/pages/`](../ui/src/pages/) | Route-level orchestration and settings sections |
| Components | [`ui/src/components/`](../ui/src/components/) | Domain UI and shared primitives |
| Hooks | [`ui/src/hooks/`](../ui/src/hooks/) | Server-state access and reusable UI behavior |
| Contexts/providers | [`ui/src/contexts/`](../ui/src/contexts/) and [`ui/src/providers/`](../ui/src/providers/) | Cross-page client state |
| Libraries | [`ui/src/lib/`](../ui/src/lib/) | API client, localization, catalogs, formatting, and helpers |

The browser communicates with routes and services under
[`src/web-server/`](../src/web-server/). When a configuration feature supports
both surfaces, keep CLI and dashboard behavior aligned.

Localization codes, normalization, persistence, and fallback are owned by
[`ui/src/lib/locales.ts`](../ui/src/lib/locales.ts). Translation resources and
i18next wiring live in [`ui/src/lib/i18n.ts`](../ui/src/lib/i18n.ts).

## Logging and Operational Data

Structured CCS logging lives in
[`src/services/logging/`](../src/services/logging/). Dashboard log routes and
services live under [`src/web-server/`](../src/web-server/), with UI consumers
under [`ui/src/components/logs/`](../ui/src/components/logs/) and the matching
page and hooks.

Keep secrets and raw credentials out of logs. Treat legacy CLIProxy log files as
a distinct source rather than folding them into CCS-owned structured logs.

## Tests

Root TypeScript tests run with Bun's test runner. Bucket selection is implemented
by [`scripts/run-test-bucket.js`](../scripts/run-test-bucket.js). The dashboard
uses Vitest as configured in [`ui/package.json`](../ui/package.json).

| Coverage area | Location |
| --- | --- |
| Focused module behavior | [`tests/unit/`](../tests/unit/) and colocated `src/**/__tests__/` |
| Cross-module behavior | [`tests/integration/`](../tests/integration/) |
| CLI end-to-end behavior | [`tests/e2e/`](../tests/e2e/) |
| Package installation and exports | [`tests/npm/`](../tests/npm/) |
| Shell and platform behavior | [`tests/native/`](../tests/native/) |
| Docker public contracts | [`tests/docker/`](../tests/docker/) |
| Documentation checks | [`tests/docs/`](../tests/docs/) |
| Dashboard behavior | [`ui/tests/`](../ui/tests/) and colocated UI tests |

Commands and bucket behavior are documented in
[`tests/README.md`](../tests/README.md) and defined in
[`package.json`](../package.json). Avoid copying test counts or pass totals into
evergreen documentation.

## Build and Release

| Output or process | Source of truth |
| --- | --- |
| CLI compilation into `dist/` | root scripts in [`package.json`](../package.json) |
| Dashboard build into `dist/ui/` | UI and root build scripts |
| Bundle verification | [`scripts/verify-bundle.js`](../scripts/verify-bundle.js) |
| Local CI-equivalent gate | [`scripts/ci-parity-gate.sh`](../scripts/ci-parity-gate.sh) |
| Commit policy | [`commitlint.config.cjs`](../commitlint.config.cjs) |
| Branch-aware releases | [`.releaserc.cjs`](../.releaserc.cjs) |
| GitHub automation | [`.github/workflows/`](../.github/workflows/) |

Semantic-release owns versions, changelog updates, tags, npm publication, and
GitHub releases. Generated `dist/` contents and release artifacts are outputs,
not architectural source.

## Documentation Map

- [Maintainer docs index](./README.md)
- [Code standards](./code-standards.md)
- [System architecture](./system-architecture/index.md)
- [Project roadmap](./project-roadmap.md)
- [Dashboard i18n](./i18n-dashboard.md)
- [OpenAI-compatible provider routing](./openai-compatible-providers.md)
- [Image analysis user guide](https://docs.ccs.kaitran.ca/features/ai/image-analysis)
- [AI agent guide](../CLAUDE.md)
- [Contributor guide](../CONTRIBUTING.md)

Update this summary only when domain ownership, stable entry points, build
boundaries, or truth sources change.
