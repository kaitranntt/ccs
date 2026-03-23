# Contributing to CCS

CCS is a Bun + TypeScript CLI with a React dashboard. This guide is the shortest path to making a clean change without reverse-engineering the repo first.

## Before You Start

- An issue is helpful for medium or large changes, but small fixes and docs updates can go straight to a PR.
- Branch from `dev`.
- Open PRs against `dev`.
- Use conventional commits.
- If you change user-facing behavior, update the docs that describe it.
- Suspected security vulnerabilities do not go through public issues. Use [SECURITY.md](./SECURITY.md).

If you are new to the project, start with a docs fix, a focused bug fix, or an issue labeled `good first issue`.

## Repo Map

| Area | Main paths | Typical follow-up |
| --- | --- | --- |
| CLI runtime | `src/`, `lib/`, `config/`, `scripts/` | Add or update tests in `tests/` |
| Dashboard UI | `ui/src/` | Run `cd ui && bun run validate` |
| Web server and config APIs | `src/web-server/`, `src/api/`, `src/config/` | Add unit or integration coverage |
| Documentation | `https://docs.ccs.kaitran.ca`, `README.md`, `docs/`, `CONTRIBUTING.md` | Keep user-facing docs in sync |
| Static assets | `assets/` | Verify screenshots and references still match |

Useful directories:

- `tests/unit/` for focused logic tests
- `tests/integration/` for cross-module behavior
- `tests/npm/` for packaging checks
- `tests/native/` for shell and platform coverage
- `docs/` for architecture, roadmap, and internal implementation notes

## Environment Setup

### Prerequisites

- Node.js `>=18`
- Bun `>=1.0`
- GitHub CLI (`gh`) if you want to open PRs from the terminal

### Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/ccs.git
cd ccs
git remote add upstream https://github.com/kaitranntt/ccs.git

git checkout dev
git pull upstream dev

bun install
cd ui && bun install && cd ..
```

## Branching and PRs

Create all normal contribution branches from `dev`.

```bash
git checkout dev
git pull upstream dev
git checkout -b feat/short-description
```

Use these prefixes:

- `feat/*` for features
- `fix/*` for bug fixes
- `docs/*` for documentation-only changes

Rules:

- Never commit directly to `main` or `dev`.
- Open PRs to `dev`, not `main`.
- Treat `hotfix/*` as maintainer-only emergency flow from `main`.
- Delete your branch after merge.

Example:

```bash
git push -u origin docs/contributing-refresh
gh pr create --base dev --title "docs(contributing): refresh contributor guide"
```

## Local Development

### Safe test environment

CCS reads and writes under `~/.ccs/`. Do not test against your real setup when developing.

Unix:

```bash
export CCS_HOME="$(mktemp -d)"
```

PowerShell:

```powershell
$env:CCS_HOME = Join-Path $env:TEMP ("ccs-" + [guid]::NewGuid())
```

If you touch code that reads CCS paths, route it through `getCcsDir()` in `src/utils/config-manager.ts` so tests stay isolated.

### Common workflows

```bash
bun run build            # Compile CLI
bun run dev              # Build server and start local config dashboard
bun run dev:symlink      # Point global ccs to local build
bun run dev:unlink       # Restore original global ccs
cd ui && bun run dev     # Dashboard-only dev server
```

Use `bun run dev` from the repo root when working on the local dashboard experience behind `ccs config`.

## Validation

If you can, run these before you open or update a PR:

```bash
bun run format
bun run lint:fix
bun run validate
bun run validate:ci-parity
```

If you changed the dashboard:

```bash
cd ui
bun run format
bun run validate
```

Helpful targeted commands:

```bash
bun run test:unit
bun run test:all
bun run test:native
bun run test:e2e
```

`bun run validate` is the main gate. It covers typechecking, linting, format checks, maintainability checks, and automated tests for the main project.

If you cannot run the full suite, that is still fine for early or docs-only PRs. Just say what you did run, or what blocked you, in the PR.

## What To Update With Your Change

### If you change CLI behavior

- Update the relevant `--help` output in `src/commands/`.
- Add or update automated coverage in `tests/`.
- Update `README.md` if the user workflow changed.

### If you change dashboard behavior

- Keep CLI and dashboard parity where the feature supports both.
- Update `ui/src/` and any affected tests.
- Run UI validation from `ui/`.

### If you change config, providers, or architecture

- Update the relevant docs in `docs/`.
- Mention migration or compatibility notes in the PR.

## Commit Style

CCS uses conventional commits because the release and workflow tooling depend on them.

```bash
git commit -m "fix(doctor): handle missing config gracefully"
git commit -m "feat(cliproxy): add provider quota check"
git commit -m "docs(contributing): simplify contributor workflow"
```

Avoid:

```bash
git commit -m "fix stuff"
git commit -m "WIP"
git commit -m "update file"
```

## Release Notes

Releases are automated with semantic-release.

- Merges to `dev` publish the `@dev` channel.
- Merges to `main` publish the `@latest` channel.
- Do not manually bump versions, create tags, or run manual `npm publish`.

## Security Reporting

If you think you found a security vulnerability, do not open a public GitHub issue.

Use the private reporting path in [SECURITY.md](./SECURITY.md):

- https://github.com/kaitranntt/ccs/security/advisories/new

Public issues are fine for normal bugs, regressions, docs problems, and feature requests. They are not fine for exploit details, leaked credentials, or anything that could put users at risk before a fix ships.

## Need Help?

- Bugs and features: https://github.com/kaitranntt/ccs/issues
- Questions: https://github.com/kaitranntt/ccs/issues/new/choose
- Security reports: https://github.com/kaitranntt/ccs/security/advisories/new
- Hosted docs: https://docs.ccs.kaitran.ca
- User-facing docs: [README.md](./README.md)
- Internal architecture notes: [docs/](./docs)
- Community expectations: [`.github/CODE_OF_CONDUCT.md`](./.github/CODE_OF_CONDUCT.md)
