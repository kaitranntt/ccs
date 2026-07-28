# CCS Code Standards

These standards describe current repository practice. Enforced configuration
and tests take precedence over prose.

## Source of Truth

| Contract | Authoritative source |
| --- | --- |
| TypeScript and CLI lint rules | [`eslint.config.mjs`](../eslint.config.mjs) |
| Formatting | [`.prettierrc`](../.prettierrc) |
| Root commands and test entry points | [`package.json`](../package.json) |
| UI commands and dependencies | [`ui/package.json`](../ui/package.json) |
| Commit syntax | [`commitlint.config.cjs`](../commitlint.config.cjs) |
| Release effects | [`.releaserc.cjs`](../.releaserc.cjs) |
| Repository workflow | [`CLAUDE.md`](../CLAUDE.md) and [`CONTRIBUTING.md`](../CONTRIBUTING.md) |

Update this document when one of those contracts changes. Do not duplicate
exhaustive rule, command, target, or dependency lists here.

## Design Priorities

Apply these in order:

1. **YAGNI**: build only behavior required by the accepted scope.
2. **KISS**: prefer a small local change over a new abstraction or dependency.
3. **DRY**: share stable domain behavior, not incidental similarity.

Preserve public contracts unless the change intentionally updates them. Error
messages should explain recovery, and configuration changes should remain
CLI-complete with dashboard parity where the feature supports both surfaces.

## Organization and Imports

- Keep code inside the domain that owns its behavior.
- Split files at cohesive boundaries such as types, pure utilities, lifecycle
  services, hooks, or view components.
- Follow nearby naming and import patterns. New TypeScript files normally use
  descriptive kebab-case names.
- There is no universal maximum directory depth.
- Barrel exports are optional compatibility boundaries, not a repository-wide
  requirement. Preserve an existing barrel when consumers depend on it; use a
  direct import when that is the local pattern or the symbol is intentionally
  private.
- Before creating a module, check whether the runtime, standard library,
  installed dependencies, or an existing repository utility already owns the
  behavior.

## File Size

Two different thresholds serve different purposes:

- **200 lines is a review heuristic.** When a code file grows beyond roughly
  200 lines, check whether it contains multiple responsibilities. A cohesive
  file may remain larger.
- **400 lines is the current CLI lint warning.**
  [`eslint.config.mjs`](../eslint.config.mjs) configures `max-lines` as a
  warning for `src/**/*.ts`, excluding blank lines and comments.

Do not split mechanically to satisfy a number. Split when the result improves
ownership, testing, reuse, or reviewability. Preserve existing exports and
behavior when they are part of a consumed contract.

## TypeScript and Linting

The CLI uses strict TypeScript. Current enforced CLI rules include:

- no explicit `any`
- no non-null assertions
- no unused variables, except names intentionally prefixed with `_`
- `prefer-const`, `no-var`, and strict equality

Use `unknown` at untrusted boundaries and narrow it before use. Keep types close
to their owning domain; export types only when another module consumes them.

New generic `throw new Error(...)` sites are blocked by the local
`ccs/no-new-throw-error` rule. Use the typed errors in
[`src/errors/error-types.ts`](../src/errors/error-types.ts) so
[`src/errors/error-handler.ts`](../src/errors/error-handler.ts) can map failures
consistently. The generated baseline in
[`eslint-rules/throw-error-baseline.json`](../eslint-rules/throw-error-baseline.json)
grandfathers existing sites; do not expand it to bypass a new error design.

## Terminal and Process Behavior

- CLI terminal output is ASCII only: `[OK]`, `[!]`, `[X]`, `[i]`.
- Respect `NO_COLOR` and TTY-aware output.
- Prefer argument arrays when spawning processes. When a platform wrapper
  requires a shell, use the existing quoting and wrapper utilities rather than
  interpolating untrusted input.
- Preserve target-specific stdio, signal, and exit-code behavior. The adapter
  contract lives in
  [`src/targets/target-adapter.ts`](../src/targets/target-adapter.ts).

## Target Adapters

Runtime target behavior is divided across:

| Concern | Source |
| --- | --- |
| Target names, aliases, persistence | [`src/targets/target-metadata.ts`](../src/targets/target-metadata.ts) |
| Selection priority and flag parsing | [`src/targets/target-resolver.ts`](../src/targets/target-resolver.ts) |
| Adapter contract | [`src/targets/target-adapter.ts`](../src/targets/target-adapter.ts) |
| Registration and lookup | [`src/targets/target-registry.ts`](../src/targets/target-registry.ts) |
| Startup registration | [`src/ccs.ts`](../src/ccs.ts) |

A target change should update metadata, implementation, registration, tests,
help text, and public documentation as applicable. Do not copy the target list
into new guides; link to metadata when maintainers need the current set.

## Configuration and Test Isolation

- Treat persisted environment values as strings.
- Route CCS paths through `getCcsDir()` in
  [`src/utils/config-manager.ts`](../src/utils/config-manager.ts).
- Never run tests against a contributor's real `~/.ccs/` or `~/.claude/`.
  Set `CCS_HOME` to a temporary directory.
- Preserve documented configuration and profile-resolution priority. Add a
  focused test when changing precedence or fallback behavior.
- Treat Docker service `ccs` and network `ccs-net` as public contracts; see
  [`CONTRIBUTING.md`](../CONTRIBUTING.md#if-you-change-the-docker-network-or-service-name).

## Dashboard Code

- Keep page orchestration in `ui/src/pages/`, reusable UI in
  `ui/src/components/`, server-state access in `ui/src/hooks/`, and shared
  helpers in `ui/src/lib/` when that matches the owning domain.
- Preserve unsaved input across background refreshes. Destructive replacement
  of dirty state requires an explicit user action or confirmation.
- Use the existing API and query helpers before adding a new data-access layer.
- Keep accessibility, keyboard interaction, responsive layout, loading,
  empty, and error states in scope for user-facing changes.
- Locale codes and normalization are owned by
  [`ui/src/lib/locales.ts`](../ui/src/lib/locales.ts); translations are wired
  through [`ui/src/lib/i18n.ts`](../ui/src/lib/i18n.ts).

The UI has its own ESLint, TypeScript, Prettier, and Vitest configuration.
Verify commands against [`ui/package.json`](../ui/package.json).

## Tests and Quality Gates

The root TypeScript suites run with Bun's test runner. The dashboard uses
Vitest. Native shell and PowerShell probes cover platform-specific behavior.
See [`tests/README.md`](../tests/README.md) for ownership and commands.

Run the smallest relevant test first, then the normal gate:

```bash
bun run format
bun run lint:fix
bun run validate
```

Before review or merge confidence:

```bash
bun run validate:ci-parity
```

For dashboard changes:

```bash
cd ui
bun run format
bun run validate
bun run test:run
```

Do not weaken or skip a failing check to make a change pass. If a full gate
cannot run, report the exact focused checks completed and the blocker.

## Commits and Releases

Commitlint accepts conventional types defined in
[`commitlint.config.cjs`](../commitlint.config.cjs), with a 100-character header
limit. Use focused subjects such as:

```text
fix(doctor): handle missing config
feat(cliproxy): add provider quota check
docs(contributing): clarify validation
```

Semantic-release owns versions, changelog entries, tags, npm publishing, and
GitHub releases. Do not bump versions, tag, or publish manually. Release effects
for each branch and commit type are defined in
[`.releaserc.cjs`](../.releaserc.cjs).

## Documentation Triggers

Update the owning guide when a change affects behavior, commands, setup,
architecture, security posture, public contracts, or future maintainer
decisions. Start at [`docs/README.md`](./README.md). Public CLI, provider,
configuration, installation, or workflow changes also require the matching page
in the separate `kaitranntt/ccs-docs` repository; see the docs index for
checkout guidance.

Prefer source links over copied trees and metrics. Remove stale sections rather
than leaving TODO markers.
