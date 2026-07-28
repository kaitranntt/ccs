# Hardening Debt Burndown

This document defines the live measurement method. Completed phase narratives
remain available in Git history and must not be copied forward as current state.

## Scope

The generated inventory measures:

- synchronous filesystem calls across source and in runtime hotpaths;
- legacy, shim, and compatibility markers;
- typed-error adoption;
- direct `console.error` and `console.warn` use outside CLI-UX exemptions;
- structured logger coverage;
- source files above maintainability size thresholds.

Runtime-hotpath metrics exclude test, fixture, and mock files. Repository-wide
totals may include them when the metric explicitly says `all`.

## Generate And Verify

```bash
bun run report:hardening
node scripts/hardening-inventory.js --check
```

Generated artifacts:

- `docs/reports/hardening-inventory.json` for tooling;
- `docs/reports/hardening-inventory.md` for review.

`--check` rebuilds the expected content in memory and compares both tracked
artifacts byte-for-byte. Any source change that affects a metric requires
regeneration in the same commit.

## Interpretation

- Treat rankings as investigation queues, not automatic refactor mandates.
- Characterize behavior before splitting large or compatibility-sensitive code.
- Separate user-facing terminal output from operational diagnostics before
  migrating console calls.
- Preserve intentional shims until their compatibility window and callers are
  verified.
- Prefer trend comparisons from Git history when historical context is needed;
  do not turn this live method into a dated progress ledger.

## Review Contract

A hardening change is complete only when focused tests pass, both inventory
artifacts match the current source tree, and the diff explains any material
metric movement.
