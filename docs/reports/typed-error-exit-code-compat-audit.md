# Typed-Error Exit-Code Compat Audit (P4)

Date: 2026-06-18. Phase 4 of the maintainability/traceability epic.

## Question (open Q1)

Are CCS CLI exit codes a documented public contract that users or CI scripts depend on? This determines whether migrating `throw new Error(...)` to typed errors (which changes the exit code) is safe.

## Finding

Typed exit codes are **already wired end-to-end**. `handleError` -> `getExitCode` extracts `error.code` from any `CCSError` and passes it to `process.exit` (`src/errors/error-handler.ts`, `src/ccs.ts:145`). The `ExitCode` enum and the class-to-code mapping in `src/errors/error-types.ts` are complete and pre-date this epic.

**Only documented public contract:** `ccs doctor` documents exit codes 0 (healthy) / 1 (unhealthy) in `src/commands/doctor-command.ts:55-58`. `ccs doctor` is OUTSIDE the P4 priority subdomains and is NOT touched by P4. Its 0/1 contract is preserved.

**No CI/scripts assert on ccs exit codes.** `scripts/ci-parity-gate.sh` uses `set -euo pipefail` but performs no `ccs` exit-code branching. `.github/workflows/*` perform no ccs exit-code assertions. Prior exit-code changes in CHANGELOG are treated as bugfixes; no documented breaking changes.

## Decision

**Migrate freely** in the P4 priority subdomains (`cliproxy/quota`, `cliproxy/auth`, `web-server/routes`, `auth`). Preserve `GENERAL_ERROR(1)` only where no clear subclass applies. Behavior-lock tests assert the new typed codes.

## Exit-code mapping (the contract this audit locks)

| Typed class | ExitCode | Value | Used for (P4 sites) |
|---|---|---:|---|
| `ProfileError` | `PROFILE_ERROR` | 7 | profile/account/variant not found, already exists |
| `AuthError` | `AUTH_ERROR` | 4 | OAuth/token/Kiro/GitLab auth flow failures, refresh ownership |
| `ConfigError` | `CONFIG_ERROR` | 2 | settings/config structure, path, not-initialized, read/write profiles |
| `ValidationError` | `GENERAL_ERROR` | 1 | input format validation (no exit-code shift) |
| `ProviderError` | `PROVIDER_ERROR` | 6 | unsupported provider backend |
| `NetworkError` | `NETWORK_ERROR` | 3 | (recoverable) |
| `ProxyError` | `PROXY_ERROR` | 8 | |
| `MigrationError` | `MIGRATION_ERROR` | 9 | |

## Per-site decisions

See the P4 commit for the full site list. Summary by subclass chosen:
- `ProfileError`: profile/account not-found + already-exists (`src/auth/profile-registry.ts`, `src/cliproxy/auth/auth-token-manager.ts`, `src/cliproxy/auth/auth-types.ts`).
- `AuthError`: OAuth start failed, paste-callback unavailable, Kiro auth method unsupported, token refresh ownership (`src/cliproxy/auth/oauth-handler.ts`, `provider-refreshers/index.ts`).
- `ConfigError`: invalid settings path, settings not found, CLIProxy config not initialized, GitLab URL format, failed read/write profiles, copilot sync failure (`src/web-server/routes/*`, `src/cliproxy/auth/oauth-handler.ts`, `src/auth/profile-registry.ts`).
- `ValidationError`: invalid profile name, invalid target, invalid host, Kiro IDC start-url (`src/web-server/routes/*`, `src/cliproxy/auth/auth-types.ts`).
- `ProviderError`: unsupported provider backend (`src/web-server/routes/image-analysis-routes.ts`).

## Outcome

Typed-error adoption in the locked subdomains: 0/23 -> 21/23 (91.3%), well above the 40% target. Exit-code changes are intentional and documented here; release notes for the epic PR should mention the differentiated exit codes.
