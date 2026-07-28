# CCS Project Roadmap

This repository does not maintain a hand-copied backlog snapshot. Current work
lives in GitHub so status, ownership, and dependencies stay live.

## Find Current Work

- [Open issues](https://github.com/kaitranntt/ccs/issues)
- [Project boards](https://github.com/users/kaitranntt/projects)
- [Open pull requests](https://github.com/kaitranntt/ccs/pulls)
- [Releases](https://github.com/kaitranntt/ccs/releases)

Filter issues by area and type labels before selecting work. Verify the issue
body, recent comments, and linked pull requests rather than relying on an old
roadmap copy.

## Planning Guidance

1. Confirm the issue still reproduces against `origin/dev`.
2. Read `CLAUDE.md` and the affected source, tests, help, and public docs.
3. Keep the implementation and compatibility boundary explicit.
4. Run focused validation, then the repository quality gate appropriate to the
   change.
5. State public-doc impact before handoff.

Plans are workspace-only and belong under ignored `plans/`; they are not product
roadmap truth.

## Maintainability Work

Use [Hardening Debt Burndown](./hardening-debt-burndown.md) for measurement
methodology. Its generated inventory is an exact source-tree snapshot, not a
historical progress log.

## Stable Product Direction

CCS remains a CLI-first profile and runtime manager with dashboard parity for
configuration. New work should preserve:

- isolated account/profile state;
- explicit provider and runtime selection;
- actionable, ASCII-safe terminal errors;
- compatible CLI, dashboard, and public-doc contracts;
- safe local defaults for credentials, browser access, and proxy routing.

## Related Documentation

- [Codebase Summary](./codebase-summary.md)
- [Code Standards](./code-standards.md)
- [System Architecture](./system-architecture/index.md)
- [CLAUDE.md](../CLAUDE.md)
