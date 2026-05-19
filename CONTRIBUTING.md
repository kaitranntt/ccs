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

## CI and Release Flow

CCS now uses three separate automation lanes:

- `CI` runs on pull requests to `dev` and `main`. This is the review gate for contributor branches.
- `Push CI` runs after a merge lands on `dev`. This is the code-quality signal for the shared `dev` branch.
- `Dev Release` publishes the `@dev` package after `dev` changes land. It is release automation, not the primary contributor quality signal.

If `Dev Release` is red but your PR checks were green, check `Push CI` before assuming the merged code is broken.

If `CI` or `Push CI` stays queued for a long time, it is a maintainer infrastructure issue, not a contributor mistake. Leave a comment on your PR and a maintainer will address it.

## AI Agent Rules

`CONTRIBUTING.md` is the human entry point. For AI agents working in this repo, the authoritative automation and workflow rules live in [CLAUDE.md](./CLAUDE.md).

## AI Review Lane

CCS PR review no longer depends on `anthropics/claude-code-action`. The repository review lane is self-hosted PR-Agent:

- The retained `.github/workflows/ai-review.yml` runs PR-Agent in GitHub Actions.
- Use `/review` on the PR when you need a fresh pass after follow-up commits.
- Only the trusted `/review` comment path is enabled.
- Keep repository-level reviewer instructions in the root `.pr_agent.toml`.
- Keep runtime wiring and defaults in `ai-review.yml`, which still maps the existing `AI_REVIEW_BASE_URL`, `AI_REVIEW_MODEL`, and `AI_REVIEW_API_KEY` integrations onto PR-Agent's `OPENAI.*` and `config.*` settings.
- If you change review defaults, update the workflow or `.pr_agent.toml` alongside the contributor or architecture docs in the same PR.

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

Run this fast local gate before you open or update a PR:

```bash
bun run format
bun run lint:fix
bun run validate
```

`bun run validate` is the day-to-day contributor gate. It runs:

- `typecheck`
- `lint`
- `format:check`
- `test:fast`

Before you ask for review, or whenever you want the closest local equivalent to PR CI, run:

```bash
bun run validate:ci-parity
```

`bun run validate:ci-parity` adds:

- branch freshness check against `origin/dev` or `origin/main`
- `build:all`
- full non-e2e test suite via `test:all`
- `test:e2e` with `CCS_E2E_SKIP_BUILD=1`

If you changed the dashboard, run the UI gate too:

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

Use `bun run test:e2e` locally before review if you touch command routing, proxy flows, release automation, or workflow wiring and want to reproduce the same CLI e2e lane that PR CI runs.

### Why Did CI Fail?

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `format` fails in PR CI | `bun run format` was skipped locally | Run `bun run format`, recommit, push again |
| `lint` fails in PR CI | `validate` now uses read-only `lint` | Run `bun run lint:fix`, then rerun `bun run validate` |
| `test` fails in PR CI but `validate` passed | The failure is in `test:slow` or `test:e2e` | Run `bun run validate:ci-parity` locally |
| Checks stay queued for >10 min | Self-hosted runner is offline | Wait for maintainer intervention; rerunning usually does not help |
| `Dev Release` is red on `dev` after merge | Release-only failure or publish problem | Check `Push CI` first to confirm code quality |

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

### If you change the Docker network or service name

The `ccs-net` network name and the `ccs` service name in `docker/compose.yaml` are a **public contract**. Users attach their own containers to `ccs-net` and resolve CLIProxy at `http://ccs:8317`.

Changing either of these values is a **SemVer-major breaking change**. Before modifying `services.ccs.name` or `networks.ccs-net.name` in `docker/compose.yaml`:

- Open an issue to discuss the migration path.
- Update `docker/README.md`, `CHANGELOG.md`, and any docs that reference the stable names.
- Bump the major version (via a `feat!:` or `fix!:` commit with a `BREAKING CHANGE:` footer).

If you are unsure whether your change affects the contract, check `tests/docker/network-contract.sh` — the test will fail if the network or service DNS resolution breaks.

### If you change config, providers, or architecture

- Update the relevant docs in `docs/`.
- Mention migration or compatibility notes in the PR.
- If the change affects automated PR review behavior, update the `ai-review.yml` or `.pr_agent.toml` guidance as well.

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
