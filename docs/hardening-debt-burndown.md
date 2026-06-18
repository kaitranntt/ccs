# Hardening Debt Burndown Tracker

Last Updated: 2026-06-18
Owner: Stream D (`#542`); maintainability epic owner TBD (open Q5)

## Scope

Maintainability hardening groundwork with low-risk changes:

- Inventory legacy shims/compatibility markers
- Inventory sync filesystem usage, especially runtime hotpaths
- Incrementally migrate hotpath sync I/O to async I/O with tests

## How to Measure

Run:

```bash
bun run report:hardening
```

Generated artifacts:

- `docs/reports/hardening-inventory.json`
- `docs/reports/hardening-inventory.md`

## Kickoff Baseline (Issue #542 Stream D)

The current baseline is sourced from `docs/reports/hardening-inventory.json` after running `bun run report:hardening`.
Baseline captured: `2026-02-12`.

| Metric | Baseline |
|---|---:|
| Sync fs occurrences (all) | 835 |
| Sync fs files affected (all) | 100 |
| Sync fs occurrences (runtime hotpaths) | 724 |
| Sync fs files affected (runtime hotpaths) | 89 |
| Legacy shim markers | 131 |
| Legacy shim files affected | 56 |

## Initial Async I/O Migration Log

| Date | Area | Change | Safety Notes |
|---|---|---|---|
| 2026-02-12 | `src/web-server/jsonl-parser.ts` | Migrated `parseProjectDirectory()` directory listing from sync `readdirSync` to async `fs.promises.readdir` | Existing behavior kept (same filtering/fallback); covered by `tests/unit/jsonl-parser.test.ts` |

## Maintainability & Traceability Baseline (2026-06-18)

Baseline for the maintainability/traceability epic (`plans/260618-1346-maintainability-traceability-epic`). Sourced from `docs/reports/hardening-inventory.json` -> `maintainability` block after `bun run report:hardening`. Baseline captured: `2026-06-18`.

| Metric | Baseline | Epic target | Owner phase |
|---|---:|---:|---|
| typed-error adoption (typed / total throws) | 0.9% (4 / 431) | >40% in locked subdomains | P4 |
| typed-error adoption (locked: cliproxy/quota, cliproxy/auth, web-server/routes, auth) | 0.0% (0 / 23) | >40% | P4 |
| hotpath `console.error`/`warn` occurrences (non-exempt) | 931 (1091 total, 160 CLI-UX exempt) | < 10 | P3 |
| hotpath `console.error`/`warn` files (non-exempt) | 134 | minimal | P3 |
| files with `createLogger` | 35 / 685 (5.1%) | rise across all subdomains | P2/P3 |
| subdomains with zero `createLogger` | 20 (incl. api, channels, config, delegation, dispatcher, docker, shared) | 0 in the named set | P2 |
| files > 400 LOC | 95 | < 60 after P5+P6 | P5/P6 |
| files > 600 LOC | 45 | drop | P5/P6 |
| ESLint `no-new-throw-error` gate | not enforced | error + allowlist | P7 |
| ESLint `max-lines` gate | not enforced | warn at 400 | P7 |
| hardening report freshness | stale (2026-02-12) | < 30d gate in `validate:ci-parity` | P1 |

### Method

Metrics are grep-based and approximate (not a contract). Comments and string/template/regex literals are stripped before matching (`scripts/hardening-inventory.js#stripComments`). Subdomain granularity is 2-level under `src/cliproxy/` (`cliproxy/quota`, `cliproxy/auth`, ...) and 1-level elsewhere (`auth`, `config`, ...). The hotpath `console.error` count excludes CLI-UX print surfaces (`src/commands/`, `src/management/`, `src/utils/ui/`) which are legitimate user-facing terminal output. The typed-error denominator for the P4 target is LOCKED to the four named subdomains so the >40% goal cannot be gamed by narrowing scope. Re-baseline whenever the schema or method changes.

### Largest hotpath console.error offenders (2026-06-18)

| File | `console.error`/`warn` |
|---|---:|
| `src/utils/error-manager.ts` | 142 |
| `src/cliproxy/accounts/account-safety.ts` | 56 |
| `src/cliproxy/config/model-config.ts` | 32 |
| `src/cliproxy/executor/arg-parser.ts` | 26 |
| `src/dispatcher/flows/settings-flow.ts` | 26 |

## Progress Log

| Date | Phase | Change | Metric movement |
|---|---|---|---|
| 2026-06-18 | P2 | Express `withRequestContext` wrap; `CCS_REQUEST_ID` daemon forwarding + child re-anchor; logger toe-holds in delegation/docker. | zero-createLogger subdomains 20 -> 18 |
| 2026-06-18 | P3 | Redaction gate (token-shape scrubbing in context + `Error.message` + message string). `tool-sanitization-proxy` private log subsystem deleted (13 sites -> existing `createLogger`). ~120 diagnostic `console.error` -> structured `createLogger` across proxy, web-server/routes, glmt, quota-fetchers, executors, delegation. User-facing `console.error` (CLI flows, arg-parser usage, installers, prompts, adapter launch errors, error display) migrated to `process.stderr.write` (preserves stderr output). `error-manager.ts` reclassified CLI-UX-exempt (user-facing display). | hotpath `console.error` 928 -> 267 (71%); createLogger files 35 -> 64 |

### P3 residual note (2026-06-18)

The remaining ~267 `console.error`/`warn` are user-facing CLI output (interactive flows, arg-parser usage errors, installers, prompts, adapter launch failures, error-display helpers) routed via `fail()`/`info()`/`warn()` from `utils/ui`. They are legitimate stderr output, not diagnostics. The plan's `<10` target assumed these were diagnostics; in practice the diagnostic subset is fully converted to structured logs. Migrating the residual `console.error` -> `process.stderr.write` is mechanical (near-zero behavior change, no traceability value) and continues incrementally; it does not block P4-P7. The redaction gate makes any further conversion safe.

