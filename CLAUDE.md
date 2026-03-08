# Agent Guidelines

AI-facing guidance for agent tooling when working with this repository.

## Critical Constraints (NEVER VIOLATE)

### Test Isolation (MANDATORY)

**NEVER touch the user's real `~/.ccs/` or `~/.claude/` directories during tests.**

- All code accessing CCS paths MUST use `getCcsDir()` from `src/utils/config-manager.ts`
- This function respects `CCS_HOME` env var for test isolation
- **WRONG:** `path.join(os.homedir(), '.ccs', ...)`
- **CORRECT:** `path.join(getCcsDir(), ...)`

Tests set `process.env.CCS_HOME` to a temp directory. Code using `os.homedir()` directly will modify the user's real files.

## Core Function

CLI wrapper for instant switching between multiple provider accounts and alternative models (GLM, GLMT, Kimi). See README.md for user documentation.

## Design Principles (ENFORCE STRICTLY)

### Technical Excellence
- **YAGNI**: No features "just in case"
- **KISS**: Simple bash/PowerShell/Node.js only
- **DRY**: One source of truth (config.yaml)

### User Experience (EQUALLY IMPORTANT)
- **CLI-Complete**: All features MUST have CLI interface
- **Dashboard-Parity**: Configuration features MUST also have Dashboard interface
- **Execution is CLI**: Running profiles happens via terminal, not dashboard buttons
- **UX > Brevity**: Error messages and help text prioritize user success over terseness
- **Progressive Disclosure**: Simple by default, power features accessible but not overwhelming

### When Principles Conflict
- **UX > YAGNI** for user-facing features (if users need it, it's not "just in case")
- **KISS applies to BOTH** code AND user experience (simple journey, not just simple code)
- **DRY applies to BOTH** code AND interface patterns (consistent behavior across CLI/Dashboard)

## Common Mistakes (AVOID)

| Mistake | Consequence | Correct Action |
|---------|-------------|----------------|
| Running `validate` without `format` first | format:check fails | Run `bun run format` BEFORE validate |
| Assuming maintainability check is always strict | PR/feature branches run warning mode by default | Use `bun run maintainability:check:strict` before merge when touching debt-sensitive code |
| Using `chore:` for dev→main PR | No npm release triggered | Use `feat:` or `fix:` prefix |
| Committing directly to `main` or `dev` | Bypasses CI/review | Always use PRs |
| Manual version bump or git tag | Conflicts with semantic-release | Let CI handle versioning |
| Forgetting `--help` update | CLI docs out of sync | Update `src/commands/help-command.ts` |
| Forgetting docs update | User docs out of sync | Update `docs/` and CCS docs submodule |

## Quality Gates (MANDATORY)

Quality gates MUST pass before pushing. **Both projects have identical workflow.**

### Pre-Commit Sequence (FOLLOW THIS ORDER)

```bash
# Main project (from repo root)
bun run format              # Step 1: Fix formatting
bun run lint:fix            # Step 2: Fix lint issues
bun run validate            # Step 3: Full gate (typecheck + lint + format + maintainability + tests)
bun run validate:ci-parity  # Step 4: CI parity gate (build + validate + base branch check)

# UI project (if UI changed)
cd ui
bun run format              # Step 1: Fix formatting
bun run lint:fix            # Step 2: Fix lint issues
bun run validate            # Step 3: Final check (must pass)
```

**WHY THIS ORDER:**
- `validate` runs `format:check` which only VERIFIES—won't fix
- If format:check fails, you skipped step 1
- CI runs `validate` only (no auto-fix)—local must be clean

### What Validate Runs

| Project | Command | Runs |
|---------|---------|------|
| Main | `bun run validate` | typecheck + lint:fix + format:check + maintainability:check + test:all |
| UI | `bun run validate` | typecheck + lint:fix + format:check |

### ESLint Rules (ALL errors)

| Rule | Level | Notes |
|------|-------|-------|
| `@typescript-eslint/no-unused-vars` | error | Ignore `_` prefix |
| `@typescript-eslint/no-explicit-any` | error | Use proper types or `unknown` |
| `@typescript-eslint/no-non-null-assertion` | error | No `!` assertions |
| `prefer-const`, `no-var`, `eqeqeq` | error | Code quality |
| `react-hooks/*` (UI only) | recommended | Hooks rules |
| `react-refresh/*` (UI only) | vite | Fast refresh |

### TypeScript Options (strict mode)

| Option | Value | Notes |
|--------|-------|-------|
| `strict` | true | All strict flags enabled |
| `noUnusedLocals` | true | No unused variables |
| `noUnusedParameters` | true | No unused params |
| `noImplicitReturns` | true | All paths must return |
| `noFallthroughCasesInSwitch` | true | Explicit case handling |

### Automatic Enforcement

- `prepublishOnly` / `prepack` runs `build:all` + `validate` + `sync-version.js`
- CI/CD runs `bun run validate` on every PR (maintainability is warning mode on PR events)
- husky `pre-commit` runs quick lint/type/format checks
- husky `pre-push` runs `bun run validate:ci-parity` to block CI drift before push

### Maintainability Baseline Gate

- Baseline file: `docs/metrics/maintainability-baseline.json`
- Metric collector/check script: `scripts/maintainability-baseline.js`
- Branch-aware gate wrapper: `scripts/maintainability-check.js`
- Enforcement path: `bun run maintainability:check` (included in `bun run validate`)
- Gate modes:
  - `strict`: protected branches (`main`, `dev`, `hotfix/*`, `kai/hotfix-*`) and equivalent CI refs
  - `warn`: pull request CI and non-protected local branches (non-blocking for parallel PR workflow)
  - override commands:
    - `bun run maintainability:check:strict`
    - `bun run maintainability:check:warn`
- Gated metrics (must not increase vs baseline):
  - `processExitReferenceCount`
  - `synchronousFsApiReferenceCount`
- Informational metrics (collected but not gated):
  - `largeFileCountOver350Loc`
- Baseline update policy:
  1. Prefer reducing the metric and keeping the baseline unchanged.
  2. On protected-branch integration (strict mode), if increase is intentional and accepted, run `bun run maintainability:baseline`.
  3. Commit both the code change and `docs/metrics/maintainability-baseline.json`, and state reason in PR description.

## Critical Constraints (NEVER VIOLATE)

1. **NO EMOJIS in CLI output** - Terminal output uses ASCII only: [OK], [!], [X], [i]
   - **Scope:** CCS CLI terminal output (`src/` code that prints to stdout/stderr)
   - **Does NOT apply to:** PR descriptions, commit messages, documentation, comments, AI conversations
2. **TTY-aware colors** - Respect NO_COLOR env var
3. **Non-invasive** - NEVER modify external tool settings (`~/.claude/settings.json`) without explicit user request and confirmation (exception: `ccs persist` command)
4. **Cross-platform parity** - bash/PowerShell/Node.js must behave identically
5. **CLI documentation** - ALL CLI changes MUST update respective `--help` handler (see table below)
6. **Idempotent** - All install operations safe to run multiple times
7. **Dashboard parity** - Configuration features MUST work in both CLI and Dashboard

### Help Location Reference

| Command | Help Handler Location |
|---------|----------------------|
| `ccs --help` | `src/commands/help-command.ts` |
| `ccs api --help` | `src/commands/api-command.ts` → `showHelp()` |
| `ccs cleanup --help` | `src/commands/cleanup-command.ts` → `printHelp()` |
| `ccs cliproxy --help` | `src/commands/cliproxy-command.ts` → `showHelp()` |
| `ccs config --help` | `src/commands/config-command.ts` → `showHelp()` |
| `ccs copilot --help` | `src/commands/copilot-command.ts` → `handleHelp()` |
| `ccs cursor --help` | `src/commands/cursor-command.ts` → `handleHelp()` |
| `ccs doctor --help` | `src/commands/doctor-command.ts` → `showHelp()` |
| `ccs migrate --help` | `src/commands/migrate-command.ts` → `printMigrateHelp()` |
| `ccs env --help` | `src/commands/env-command.ts` → `showHelp()` |
| `ccs persist --help` | `src/commands/persist-command.ts` → `showHelp()` |
| `ccs setup --help` | `src/commands/setup-command.ts` → `showHelp()` |
| `ccs skills --help` | `src/commands/skills-command.ts` → `showHelp()` |

**Note:** `lib/ccs` and `lib/ccs.ps1` are bootstrap wrappers only—they delegate to Node.js and contain no help text.

## Documentation Requirements (MANDATORY)

**Documentation is a first-class citizen. ALL user-facing changes require docs updates.**

### Local Documentation (`docs/`)

Update local `docs/` folder for:
- Architecture changes
- Internal API documentation
- Development guides

### CCS Docs Submodule (Owner Only)

**For @kaitranntt (repository owner):** When adding/changing CLI commands or config options, you MUST also update the CCS docs submodule at `~/CloudPersonal/ccs/docs/`:

| Change Type | Files to Update |
|-------------|-----------------|
| New CLI command/flag | `reference/cli-commands.mdx` |
| New config option | `reference/config-schema.mdx` |
| Provider feature | `providers/<provider>.mdx` |
| New feature | `features/<feature>.mdx` |

**Workflow for docs submodule:**
```bash
cd ~/CloudPersonal/ccs/docs/
git checkout main && git pull
# Make changes
git add -A && git commit -m "docs: <description>"
git push origin main
```

**For external contributors:** Document changes in PR description. Owner will sync to CCS docs.

### Pre-Commit Docs Checklist

- [ ] Respective `--help` updated (see Help Location Reference table)
- [ ] Local `docs/` updated if architecture changed
- [ ] CCS docs submodule updated (owner) or PR description includes docs (contributor)

## Feature Interface Requirements

| Feature Type | CLI | Dashboard | Example |
|--------------|-----|-----------|---------|
| Profile creation | ✓ | ✓ | `ccs auth create`, Dashboard "Add Account" |
| Profile switching | ✓ | ✓ | `ccs <profile>` (execution is CLI-only) |
| API key config | ✓ | ✓ | `ccs api create`, Dashboard API Profiles |
| Health check | ✓ | ✓ | `ccs doctor`, Dashboard Live Monitor |
| OAuth auth flow | ✓ | ✓ | Browser opens from CLI or Dashboard |
| Analytics/monitoring | ✗ | ✓ | Dashboard Analytics (visual by nature) |
| WebSearch config | ✓ | ✓ | CLI flags, Dashboard Settings |
| Remote proxy config | ✓ | ✓ | CLI flags, Dashboard Settings |

## File Structure

```
src/           → TypeScript source (main project)
dist/          → Compiled JavaScript (npm package)
lib/           → Native shell scripts (bash, PowerShell)
ui/src/        → React components, hooks, pages
ui/src/components/ui/ → shadcn/ui components
dist/ui/       → Built UI bundle (served by Express)
```

## Key Technical Details

### Profile Mechanisms (Priority Order)

1. **CLIProxy hardcoded**: gemini, codex, agy → OAuth-based, zero config
2. **CLIProxy variants**: `config.cliproxy` section → user-defined providers
3. **Settings-based**: `config.profiles` section → GLM, GLMT, Kimi
4. **Account-based**: `profiles.json` → isolated instances via `CLAUDE_CONFIG_DIR`

### Settings Format (CRITICAL)

All env values MUST be strings (not booleans/objects) to prevent PowerShell crashes.

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.example.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-api-key",
    "ANTHROPIC_MODEL": "model-name"
  }
}
```

### Shared Data Architecture

Symlinked from `~/.ccs/shared/`: commands/, skills/, agents/
Profile-specific: settings.json, sessions/, todolists/, logs/
Windows fallback: Copies if symlinks unavailable

## Code Standards

### Architecture
- `lib/ccs`, `lib/ccs.ps1` - Bootstrap scripts (delegate to Node.js via npx)
- `src/*.ts` → `dist/*.js` - Main implementation (TypeScript)

### Bash (lib/*.sh)
- bash 3.2+, `set -euo pipefail`, quote all vars `"$VAR"`, `[[ ]]` tests
- NO external dependencies

### PowerShell (lib/*.ps1)
- PowerShell 5.1+, `$ErrorActionPreference = "Stop"`
- Native JSON only, no external dependencies

### TypeScript (src/*.ts)
- Node.js 14+, Bun 1.0+, TypeScript 5.3, strict mode
- `child_process.spawn`, handle SIGINT/SIGTERM

### Terminal Output
- ASCII only: [OK], [!], [X], [i] (NO emojis in CLI output)
- TTY detect before colors, respect NO_COLOR
- Box borders for errors: ╔═╗║╚╝

## Conventional Commits (MANDATORY)

**ALL commits MUST follow conventional commit format. Non-compliant commits are rejected by husky.**

### Format
```
<type>(<scope>): <description>
```

### Types (determines version bump)

| Type | Version Bump | Use For |
|------|--------------|---------|
| `feat:` | MINOR | New features |
| `fix:` | PATCH | Bug fixes |
| `perf:` | PATCH | Performance |
| `feat!:` | MAJOR | Breaking changes |
| `docs:`, `style:`, `refactor:`, `test:`, `chore:`, `ci:`, `build:` | None | Non-release |

### Examples
```bash
# Good
git commit -m "feat(cliproxy): add OAuth token refresh"
git commit -m "fix(doctor): handle missing config gracefully"

# Bad - REJECTED
git commit -m "added new feature"
git commit -m "Fixed bug"
```

## Branching Strategy

### Hierarchy
```
main (production) ← dev (integration) ← feat/* | fix/* | docs/*
     ↑
     └── hotfix/* (critical only, skips dev)
```

### Standard Workflow
```bash
git checkout dev && git pull origin dev
git checkout -b feat/my-feature
# ... develop with conventional commits ...
git push -u origin feat/my-feature
gh pr create --base dev --title "feat(scope): description"
# After testing in @dev:
gh pr create --base main --title "feat(release): promote dev to main"
```

### Hotfix Workflow (Production Emergencies Only)
```bash
git checkout main && git pull origin main
git checkout -b hotfix/critical-bug
# ... fix ...
gh pr create --base main --title "fix: critical issue"
# Then sync: git checkout dev && git merge main && git push
```

### Rules
1. **NEVER** commit directly to `main` or `dev`
2. Feature branches from `dev`, hotfixes from `main`
3. dev→main PRs MUST use `feat:` or `fix:` (not `chore:`)
4. Delete branches after merge

## Automated Releases (DO NOT MANUALLY TAG)

**Releases are FULLY AUTOMATED via semantic-release. NEVER manually bump versions or create tags.**

| Branch | npm Tag | When |
|--------|---------|------|
| `main` | `@latest` | Merge PR to main |
| `dev` | `@dev` | Push to dev branch |

**CI handles:** version bump, CHANGELOG.md, git tag, npm publish, GitHub release.

## Development

### Testing (REQUIRED before PR)
```bash
bun run test              # All tests
bun run test:npm          # npm package tests
bun run test:native       # Native install tests
bun run test:unit         # Unit tests
```

### Local Development
```bash
bun run dev               # Build + start config server (http://localhost:3000)
bun run dev:symlink       # Symlink global 'ccs' → dev dist/ccs.js (fast iteration)
bun run dev:unlink        # Restore original global ccs
./scripts/dev-install.sh  # Build, pack, install globally (full install)
rm -rf ~/.ccs             # Clean environment
```

**IMPORTANT:** Use `bun run dev` at CCS root for always up-to-date code. Do NOT use `ccs config` during development as it uses the globally installed version.

## Pre-Commit Checklist

**Quality (BLOCKERS):**
- [ ] `bun run format` — formatting fixed
- [ ] `bun run validate` — all checks pass
- [ ] `bun run validate:ci-parity` — CI parity passed (also enforced by pre-push hook)
- [ ] `cd ui && bun run format && bun run validate` — if UI changed
- [ ] If touching debt-sensitive code, run `bun run maintainability:check:strict` before opening/merging PR
- [ ] If strict mode fails and increase is intentional: `bun run maintainability:baseline` and commit `docs/metrics/maintainability-baseline.json`

**Code:**
- [ ] Conventional commit format (`feat:`, `fix:`, etc.)
- [ ] Respective `--help` updated (see Help Location Reference) — if CLI changed
- [ ] Tests added/updated — if behavior changed
- [ ] README.md updated — if user-facing

**Documentation:**
- [ ] CCS docs updated (owner: `~/CloudPersonal/ccs/docs/`) — if CLI/config changed
- [ ] Local `docs/` updated — if architecture changed

**Standards:**
- [ ] CLI output ASCII only (NO emojis in terminal output), NO_COLOR respected
- [ ] YAGNI/KISS/DRY alignment verified
- [ ] No manual version bump or tags

## Error Handling Principles

- Validate early, fail fast with clear messages
- Show available options on mistakes
- Never leave broken state
