# Typed-Error Exit-Code Compatibility Audit

Status: resolved contract.

## Question

Are CCS CLI exit codes a documented public contract that users or CI scripts depend on? This determines whether migrating `throw new Error(...)` to typed errors (which changes the exit code) is safe.

## Finding

Typed exit codes are wired end-to-end. `handleError` calls the local
`getExitCode` helper and passes the resulting code to `process.exit` in
`src/errors/error-handler.ts`. The CLI entry point delegates uncaught errors to
`handleError` in `src/ccs.ts`. `src/errors/exit-codes.ts` and
`src/errors/error-types.ts` define the stable mapping.

`ccs doctor` separately documents exit codes 0 (healthy) and 1 (unhealthy) in
`src/commands/doctor-command.ts`. Preserve that command contract.

The typed taxonomy is enforced by
`src/errors/__tests__/typed-error-migration-exit-codes.test.ts`; do not treat
the mapping as an untested migration note.

## Decision

Use the most specific typed error in `cliproxy/quota`, `cliproxy/auth`,
`web-server/routes`, and `auth`. Preserve `GENERAL_ERROR(1)` only where no clear
subclass applies. Update the behavior-lock test with any intentional taxonomy
change.

## Exit-code mapping (the contract this audit locks)

| Typed class | ExitCode | Value | Typical use |
|---|---|---:|---|
| `ProfileError` | `PROFILE_ERROR` | 7 | profile/account/variant not found, already exists |
| `AuthError` | `AUTH_ERROR` | 4 | OAuth/token/Kiro/GitLab auth flow failures, refresh ownership |
| `ConfigError` | `CONFIG_ERROR` | 2 | settings/config structure, path, not-initialized, read/write profiles |
| `ValidationError` | `GENERAL_ERROR` | 1 | input format validation (no exit-code shift) |
| `ProviderError` | `PROVIDER_ERROR` | 6 | unsupported provider backend |
| `NetworkError` | `NETWORK_ERROR` | 3 | (recoverable) |
| `ProxyError` | `PROXY_ERROR` | 8 | |
| `MigrationError` | `MIGRATION_ERROR` | 9 | |

Current adoption counts belong in the generated hardening inventory. Git history
contains the completed migration narrative.
