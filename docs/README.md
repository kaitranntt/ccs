# CCS Maintainer Documentation

This directory explains how the CLI repository is organized and maintained.
User-facing guides and command reference live at
[docs.ccs.kaitran.ca](https://docs.ccs.kaitran.ca).

## Truth Hierarchy

Use the narrowest authoritative source:

1. Source, tests, package scripts, and workflows define implemented behavior.
2. [`CLAUDE.md`](../CLAUDE.md) and
   [`CONTRIBUTING.md`](../CONTRIBUTING.md) define repository workflow.
3. The documents below explain architecture, rationale, and maintainer
   decisions.
4. Build artifacts, releases, and runtime checks define shipped or observed
   state.

When sources disagree, verify the implementation first and update or remove the
stale prose. Avoid copying volatile counts, recursive trees, and exhaustive
option lists when a source link can remain accurate.

## Start Here

| Need | Owner |
| --- | --- |
| Repository domains and source entry points | [Codebase summary](./codebase-summary.md) |
| Coding, testing, error, and size conventions | [Code standards](./code-standards.md) |
| System boundaries and data flow | [System architecture](./system-architecture/index.md) |
| Current maintenance direction | [Project roadmap](./project-roadmap.md) |
| Release mechanics | [Release process](./release-process.md) |
| Dashboard localization | [Dashboard i18n](./i18n-dashboard.md) |
| Test layout and commands | [Test suite](../tests/README.md) |
| Dashboard development | [UI guide](../ui/README.md) |

Feature-specific maintainer notes remain in this directory. Discover them by
filename, then verify referenced behavior against the linked source.

## Update Triggers

Update the owning documentation in the same change when any of these move:

- CLI or dashboard behavior, commands, flags, or configuration
- installation, deployment, release, or contributor workflow
- architecture, data flow, persistence, security, or public contracts
- source ownership or the stable entry point named by a guide

Pure refactors need documentation changes only when they invalidate a
maintainer decision or navigation link. Public behavior changes also require a
matching update in the separate `kaitranntt/ccs-docs` repository on the same
target branch. Maintainers using the standard CloudPersonal checkout may have
that repository at `/Users/kaitran/CloudPersonal/ccs/docs`; fork contributors
can use their own checkout and coordinate the matching docs change in the PR.

## Validation

Before review:

```bash
bash tests/docs/quickstart-parity.sh
git diff --check
```

The repository-owned docs test currently checks the canonical quickstart
snippet only. For other changed Markdown, verify each relative link and
referenced path directly, then run the focused validation command for any code
or workflow the document describes.
