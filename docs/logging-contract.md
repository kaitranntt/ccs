# Logging Contract

CCS structured logs are a machine-readable JSONL channel for backend and
runtime events. They are separate from terminal UX output and must never be
used as a substitute for user-facing recovery messages.

The canonical schema is
[`src/services/logging/log-types.ts`](../src/services/logging/log-types.ts).
Defaults are defined in
[`src/config/schemas/logging.ts`](../src/config/schemas/logging.ts).

## Entry Schema

| Field | Type | Required | Contract |
| --- | --- | --- | --- |
| `id` | `string` | yes | Unique entry id. |
| `timestamp` | `string` | yes | ISO 8601 emission time. |
| `level` | `error`, `warn`, `info`, or `debug` | yes | Severity. |
| `source` | `string` | yes | Stable module-scoped producer id. |
| `event` | `string` | yes | Stable machine-readable event name. |
| `message` | `string` | yes | Short human-readable summary. |
| `processId` | `number` | yes | Emitting process id. |
| `runId` | `string` | yes | Stable for the current process. |
| `context` | object | no | Event fields after configured redaction. |
| `requestId` | `string` | no | Cross-stage correlation id. |
| `stage` | `LogStage` | no | Canonical lifecycle stage. |
| `latencyMs` | `number` | no | Elapsed milliseconds, normally at completion. |
| `error` | `LogErrorInfo` | no | Structured error metadata. |

Additive optional fields preserve compatibility with older readers. Consumers
must not assume every event has a stage, request id, latency, or structured
error.

## Lifecycle Stages

Use `logger.stage()` for events that map to the canonical lifecycle:

| Stage | Meaning |
| --- | --- |
| `intake` | Request or command entered a CCS boundary. |
| `route` | Profile, provider, target, or destination resolution. |
| `auth` | Authentication or authorization work. |
| `dispatch` | Outbound request or child launch prepared. |
| `upstream` | Provider request or child operation in flight. |
| `transform` | Request or response translation. |
| `respond` | Result dispatched to the caller. |
| `cleanup` | Failure, abort, or teardown path. |

Stages can be skipped or repeated. Use `logger.info()`, `warn()`, or `error()`
for events that do not represent a lifecycle stage. High-volume details,
including streaming chunk metrics, belong at `debug`.

Example:

```ts
logger.stage('respond', 'request.completed', 'Request completed', {
  statusCode: 200,
}, {
  latencyMs: 42,
});
```

See [`src/services/logging/logger.ts`](../src/services/logging/logger.ts) for the
compiler-checked signature.

## Request Correlation

[`src/services/logging/log-context.ts`](../src/services/logging/log-context.ts)
uses Node async-local storage within a process. Entry edges establish a
context; loggers created downstream read its `requestId` automatically.

Async-local context does not cross child processes or worker threads. A child
process can inherit the active id through `CCS_REQUEST_ID` and establish a new
local context. HTTP edges may use `x-ccs-request-id`; each edge owns whether it
accepts an incoming id or mints a new one.

Only the characters and length accepted by `REQUEST_ID_PATTERN` are valid for
forwarded ids. Do not treat request ids as authentication or authorization
material.

There is no global ordering guarantee across concurrent async work or processes.
Use `timestamp`, stage, event, and process/run identifiers together when
reconstructing a request.

## Redaction and Data Minimization

[`src/services/logging/log-redaction.ts`](../src/services/logging/log-redaction.ts)
is the implementation source of truth. With the default `logging.redact: true`,
the logger:

- replaces values under known credential-bearing keys;
- masks common authorization schemes and credential token shapes in strings;
- redacts sensitive CLI flag values, including inline assignments;
- limits string length and nested object depth;
- strips an `Error` object to safe structured fields.

The matcher evolves as credential surfaces change. Link to the implementation
instead of copying its complete key or token-pattern list into other docs.

Redaction is defense in depth, not permission to log sensitive data. Never log:

- tokens, passwords, cookies, OAuth codes, or authorization values;
- raw request or response bodies;
- raw prompts or prompt-bearing CLI arguments;
- personal identifiers when a non-identifying account or profile label works.

When a new secret-bearing field or flag is introduced, update the redactor and
its tests under
[`tests/unit/services/logging/`](../tests/unit/services/logging/).

## Error Codes and Process Exit Codes

These are separate contracts:

- `LogEntry.error.code` is an optional **string** supplied as part of structured
  error metadata. It can carry a runtime, system, or provider error identifier.
- `CCSError.code` is a numeric `ExitCode`. The centralized CLI error handler
  writes it as `context.exitCode` and passes it to `process.exit`.

Do not put a numeric process exit code in `LogEntry.error.code`, and do not make
log consumers derive process status from that string field.

The numeric mapping lives in
[`src/errors/exit-codes.ts`](../src/errors/exit-codes.ts). Typed error
assignments live in
[`src/errors/error-types.ts`](../src/errors/error-types.ts), and propagation is
implemented by
[`src/errors/error-handler.ts`](../src/errors/error-handler.ts).

## Configuration

CCS-owned logging uses the `logging` section in the unified config. Its defaults
enable logging and redaction at `info` level with bounded rotation, retention,
and live-buffer settings. This is distinct from `cliproxy.logging`, which
controls CLIProxy runtime logging.

When adding a logging setting, update the schema/defaults, configuration loader,
dashboard surface if applicable, and focused logging tests. Do not document a
default that is not present in `DEFAULT_LOGGING_CONFIG`.
