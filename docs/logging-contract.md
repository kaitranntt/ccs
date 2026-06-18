# Logging Contract

Single source of truth for structured backend logging in CCS CLI. Companion to GitHub issues #1138 (umbrella) and #1141 (backend instrumentation).

## Overview

CCS emits structured JSONL log entries for backend behavior (proxy daemons, OAuth flows, target spawn lifecycle, executor errors, etc.). This document defines the canonical schema, request-correlation pattern, lifecycle stages, and redaction policy.

> CLI text output (`ok / info / warn / fail` from `src/utils/ui.ts`) is **NOT** affected by this contract. Logs are a separate channel — never printed to stdout/stderr.

## Schema (`LogEntry`)

Defined in `src/services/logging/log-types.ts`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | yes | UUID per entry. |
| `timestamp` | `string` | yes | ISO 8601. |
| `level` | `'error'\|'warn'\|'info'\|'debug'` | yes | |
| `source` | `string` | yes | Module-scoped identifier (e.g. `proxy:openai-compat:messages`). |
| `event` | `string` | yes | Dotted machine-readable event name (e.g. `request.received`). |
| `message` | `string` | yes | Human-readable summary. |
| `processId` | `number` | yes | `process.pid`. |
| `runId` | `string` | yes | Stable per-process id. |
| `context` | `object` | no | Free-form structured fields (redacted). |
| `requestId` | `string` | no | Correlates entries belonging to one inbound request across stages. |
| `stage` | `LogStage` | no | Lifecycle stage tag. |
| `latencyMs` | `number` | no | Elapsed ms (typically on `respond` / `cleanup`). |
| `error` | `{name, message, code?, stack?}` | no | Structured error metadata; never raw token strings. |

Old free-form entries (no `requestId` / `stage`) are still valid; new fields are additive.

### Example

```jsonl
{"id":"...","timestamp":"2026-04-30T12:34:56.000Z","level":"info","source":"proxy:openai-compat:messages","event":"request.received","message":"Proxy /v1/messages request received","processId":42,"runId":"r1","requestId":"a1b2...","stage":"intake","context":{"method":"POST"}}
```

## Lifecycle Stages

`LogStage` is one of:

| Stage | When to emit |
|-------|--------------|
| `intake` | Inbound request received at an entry edge (HTTP handler, CLI dispatch). |
| `route` | Destination/profile/target resolution. |
| `auth` | Authentication / authorization (token exchange, profile auth). |
| `dispatch` | Outbound request prepared / child process spawned. |
| `upstream` | Upstream call in flight (provider HTTP / spawned child running). |
| `transform` | Payload translation (request/response shape conversion). |
| `respond` | Response written / dispatched (`latencyMs` typically populated). |
| `cleanup` | Error path, abort, teardown. |

Stages may be skipped or repeated. Streaming responses tag `upstream` only at start/end (NOT per chunk).

## RequestId Propagation (AsyncLocalStorage)

`requestId` is propagated implicitly via Node `AsyncLocalStorage`. Entry edges wrap their handler in `withRequestContext`; every `createLogger`-emitted entry inside the context auto-merges `requestId` from the active store.

```ts
import { withRequestContext, createLogger } from './services/logging';

const logger = createLogger('proxy:my-edge');

http.createServer((req, res) => {
  const requestId = req.headers['x-ccs-request-id'] ?? randomUUID();
  res.setHeader('x-ccs-request-id', requestId);
  withRequestContext({ requestId }, async () => {
    logger.stage('intake', 'request.received', 'inbound');
    // ... downstream work emits with the same requestId
  });
});
```

### Cross-daemon header

`x-ccs-request-id` round-trips across the proxy edge:
- Inbound: if the header is present and matches the UUID-ish guard (`/^[A-Za-z0-9._-]{8,128}$/`), it is reused; otherwise a fresh UUID is minted.
- Outbound (response): the resolved id is echoed back via `res.setHeader('x-ccs-request-id', ...)`.
- When CCS calls another daemon (copilot, cursor, glmt), forward the active id in the same header so that daemon can correlate.

### Ordering guarantee

Emit-time ordering of entries within a single `requestId` is monotonic — the active context is single-threaded relative to the request, so `timestamp` ordering reflects emit order. The UI layer (#1142) consumes this guarantee.

### What NOT to put in the context

The ALS context object is mixed into every downstream entry. Never store:
- Raw tokens, API keys, refresh tokens, OAuth codes
- Raw request/response bodies
- User-supplied secrets

Only benign correlation metadata: `requestId`, `method`, `path`, `command`, `profile`.

### Worker threads / spawned children

ALS context is **not** inherited by worker threads or `child_process.spawn` stdio pipes. At those boundaries, mint a fresh `requestId` at the child entry and pass the parent id explicitly via env var or header for correlation.

## Redaction

`src/services/logging/log-redaction.ts` is the single source of truth.

### Sensitive key matcher

`SENSITIVE_KEY_PATTERN` matches (case-insensitive, with `_` / `-` / camelCase variants):
`authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `password`, `password_hash`, `secret`, `client_secret`, `token`, `auth_token`, `access_token`, `refresh_token`, `id_token`, `bearer`, `assertion`, `api_key`, `x-api-key`, `x-goog-api-key`, `management_key`, `copilot_token`, `cursor_session_key`, `oauth_code`, `auth_code`.

String/object values for matching keys are replaced with `[redacted]`. Numeric/boolean values pass through (e.g., `expires_at` epoch numbers stay readable).

### Auth-scheme value masking

Raw string values whose prefix matches `^(Bearer|Basic|Token)\s+\S+` are rewritten to `<scheme> [redacted]` even when nested under non-sensitive keys.

### Argv redaction

`redactArgv(argv)` redacts the value following any sensitive flag (`--token`, `--api-key`, `--auth`, `--bearer`, `--secret`, `--client-secret`, `--access-token`, `--refresh-token`, `--id-token`, `--password`).

### Adding new sensitive keys

1. Extend `SENSITIVE_KEY_PATTERN` in `src/services/logging/log-redaction.ts`.
2. Add a unit test in `tests/unit/services/logging/log-redaction-extended.test.ts`.
3. Verify regex stays O(1) per key (no catastrophic backtracking).

## Contributor Guide

### When to use `logger.stage()` vs `logger.info()`

Use `stage()` whenever the entry corresponds to one of the canonical lifecycle stages — this is what observability tooling and the dashboard rely on. Use `info()` / `warn()` / `error()` for one-off events that don't fit a stage.

### What NOT to log

- Token values (use metadata: `expires_at`, `scopes`, account display name).
- Request/response bodies (sample lengths only).
- Authorization headers (log header *names* present, not values).

### Level guidance

| Level | Use for |
|-------|---------|
| `error` | Failures requiring action (cleanup stage). |
| `warn` | Recoverable issues (auth rejected, route fallback). |
| `info` | Lifecycle stage entries by default. |
| `debug` | High-volume detail (per-chunk stream metrics, lock acquire/release). |

### Level config

Default level is `info`. Configure via `logging.level` in `~/.ccs/config.yaml`. Streaming providers MUST gate per-chunk metrics behind `debug`.

## `error.code` values (exit codes)

Typed errors (`src/errors/error-types.ts`) carry an `ExitCode` that `handleError` propagates to `process.exit`. Log readers can branch on `error.code` for differentiated handling. The full mapping lives in `src/errors/exit-codes.ts`; the per-class assignment:

| Typed class | ExitCode | Value |
|---|---|---:|
| `ConfigError` | `CONFIG_ERROR` | 2 |
| `NetworkError` | `NETWORK_ERROR` | 3 (recoverable) |
| `AuthError` | `AUTH_ERROR` | 4 |
| `BinaryError` | `BINARY_ERROR` | 5 |
| `ProviderError` | `PROVIDER_ERROR` | 6 (recoverable) |
| `ProfileError` | `PROFILE_ERROR` | 7 |
| `ProxyError` | `PROXY_ERROR` | 8 |
| `MigrationError` | `MIGRATION_ERROR` | 9 |
| `UserAbortError` | `USER_ABORT` | 130 |
| `ValidationError`, `RetryableError` | `GENERAL_ERROR` | 1 |

New throws must use a typed class (enforced by `ccs/no-new-throw-error`, see `docs/code-standards.md`). Redaction scrubs credential token shapes in both context values and message strings, so routing errors into the logger is safe — but keep messages clean prose and put sensitive data in context under a sensitive key (auto-redacted).

## Backward Compatibility

- All new `LogEntry` fields (`requestId`, `stage`, `latencyMs`, `error`) are optional. Old readers ignore them.
- Existing `console.*` UX prints in `src/commands/`, `src/utils/ui.ts`, and similar user-facing paths are intentionally **not** converted to logger.
- `/api/logs` reader unchanged in this PR; UI surfacing of new fields tracked under #1142.

## Future Work

- UI surfacing of `requestId` / `stage` / `latencyMs` in the dashboard (#1142).
- `ccs logs` CLI improvements (filter by `requestId` / `stage`).
- Per-stage performance budgets (see #1071).
