# Target Adapters

Target adapters are the last-mile boundary between CCS profile resolution and a
supported CLI runtime. Profile discovery and credential resolution happen
before this boundary; the selected adapter owns binary detection, target-native
credential delivery, argument and environment construction, and child-process
execution.

Related architecture:

- [System architecture](./index.md)
- [Provider flows](./provider-flows.md)

## Contract

The canonical interface and data types live in
[`src/targets/target-adapter.ts`](../../src/targets/target-adapter.ts). Each
adapter must:

1. detect its runtime binary without changing user configuration;
2. reject unsupported profile types before launch;
3. prepare only the target-owned configuration needed for the launch;
4. construct an argument vector and environment without exposing credentials in
   arguments;
5. spawn the target with inherited stdio and forward process signals.

The registry in
[`src/targets/target-registry.ts`](../../src/targets/target-registry.ts) maps a
target type to its adapter. Target names, built-in aliases, legacy alias
environment variables, and persistence eligibility are centralized in
[`src/targets/target-metadata.ts`](../../src/targets/target-metadata.ts).

Do not duplicate the TypeScript interface in this guide. Interface signatures
and credential fields change with runtime requirements; the source files are
the contract checked by the compiler.

## Target Resolution

[`src/targets/target-resolver.ts`](../../src/targets/target-resolver.ts) selects
the runtime in this order:

1. `--target <name>` or `--target=<name>`; if repeated, the last flag wins.
2. A trusted package runtime entrypoint identified by
   `CCS_INTERNAL_ENTRY_TARGET`.
3. The invoked binary name, including built-in or configured aliases.
4. A persisted per-profile target.
5. `claude`.

All `--target` flags are removed before the remaining arguments reach the
runtime. Parsing stops at the `--` option terminator.

The built-in runtime aliases are derived from target metadata:

| Target | Built-in aliases |
| --- | --- |
| Claude Code | Base `ccs` command |
| Factory Droid | `ccs-droid`, `ccsd` |
| Codex CLI | `ccs-codex`, `ccsx`, `ccsxp` |

Custom aliases use `CCS_TARGET_ALIASES` with entries such as
`droid=team-droid;codex=team-codex`. The target-specific legacy environment
variables remain compatibility inputs. Alias values are validated and cannot
replace reserved package binary names.

## Runtime Compatibility

Adapter-level checks are deliberately conservative. Flow-specific compatibility
is evaluated in
[`src/targets/target-runtime-compatibility.ts`](../../src/targets/target-runtime-compatibility.ts),
which has the provider and bridge context needed for an accurate decision.

| Profile flow | Claude | Droid | Codex |
| --- | --- | --- | --- |
| Native default | Supported | Conditional: requires resolved `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` | Supported |
| Settings/API profile | Supported | Supported | Codex CLIProxy bridge only |
| CLIProxy profile | Supported | Supported | Non-composite `codex` provider only |
| Claude account | Supported | Not supported | Not supported |
| Copilot | Supported | Not supported | Not supported |
| Cursor local proxy | Supported | Not supported | Not supported |

When changing compatibility, update both the runtime evaluator and its focused
tests. The authoritative coverage is in
[`tests/unit/targets/target-runtime-compatibility.test.ts`](../../tests/unit/targets/target-runtime-compatibility.test.ts).

The compatibility evaluator accepts Droid's native-default flow, but adapter
preparation still validates the resolved credentials. A default Droid launch
cannot proceed without both a non-empty base URL and auth token.

## Credential and Configuration Boundaries

### Claude Code

[`src/targets/claude-adapter.ts`](../../src/targets/claude-adapter.ts) delivers
resolved provider values through the child environment. Native account and
default launches remove stale Anthropic routing variables before execution.
Browser and WebSearch launch preparation may add runtime-specific arguments and
environment values.

The adapter does not persist provider credentials to Claude settings.

### Factory Droid

[`src/targets/droid-adapter.ts`](../../src/targets/droid-adapter.ts) validates
the resolved base URL and token, then delegates the target-owned write to
[`src/targets/droid-config-manager.ts`](../../src/targets/droid-config-manager.ts).
That manager updates the CCS custom model and active model in Factory settings.
The adapter passes user arguments through; it does not inject a `-m` selector.

Factory settings are a persistent user-owned surface. Writes must preserve
unrelated settings and use the configuration manager rather than direct JSON
replacement.

### Codex CLI

[`src/targets/codex-adapter.ts`](../../src/targets/codex-adapter.ts) keeps normal
CCS-backed launches transient:

- native default sessions keep native Codex authentication and configuration;
- CCS-backed sessions use `-c key=value` overrides for a Responses-compatible
  runtime provider;
- the resolved API key is supplied through the provider's environment key, not
  on the command line;
- stale Anthropic and nested Codex-session variables are removed before spawn.

The `ccsxp` shortcut is the explicit exception. It may repair the dedicated
`cliproxy` provider block in the active Codex configuration through
[`src/targets/codex-cliproxy-provider-config.ts`](../../src/targets/codex-cliproxy-provider-config.ts).
That repair preserves a valid custom base URL and the configured environment-key
name. General Codex launches must not rewrite `config.toml`.

## Execution Invariants

The dispatcher owns the order of operations:

1. parse CCS-owned arguments and resolve the target;
2. resolve the profile and provider credentials;
3. evaluate target/profile/provider compatibility;
4. detect the target binary;
5. call `prepareCredentials`;
6. build target arguments and environment;
7. execute the child runtime.

Flow implementations live under
[`src/dispatcher/flows/`](../../src/dispatcher/flows/). Shared target execution
logic lives in
[`src/dispatcher/target-executor.ts`](../../src/dispatcher/target-executor.ts).

All adapters must preserve these invariants:

- user credentials never appear in documented examples, logs, or spawn
  arguments;
- target-owned persistent writes are explicit and scoped;
- stale routing variables from another runtime do not leak into the child;
- Windows wrapper handling does not use a shell unless the wrapper format
  requires one;
- child signals and exit behavior propagate to the CCS process;
- binary and launch failures run registered cleanup before exit.

## Adding or Changing a Target

Change the smallest complete set:

1. update `TargetType` and the adapter contract only when required;
2. add target metadata and aliases in `target-metadata.ts`;
3. implement and register the adapter through `src/targets/index.ts`;
4. add flow-aware compatibility rules;
5. add focused resolver, adapter, compatibility, and integration tests;
6. update CLI help and dashboard controls if the target becomes user
   configurable.

Start with these test suites:

- [`tests/unit/targets/target-resolver.test.ts`](../../tests/unit/targets/target-resolver.test.ts)
- [`tests/unit/targets/target-registry.test.ts`](../../tests/unit/targets/target-registry.test.ts)
- [`tests/unit/targets/target-runtime-compatibility.test.ts`](../../tests/unit/targets/target-runtime-compatibility.test.ts)
- target-specific tests under
  [`tests/unit/targets/`](../../tests/unit/targets/)

Do not describe a target as supported from adapter registration alone. Support
requires a compatible profile flow, safe credential delivery, binary detection,
execution behavior, and tests for the full combination.
