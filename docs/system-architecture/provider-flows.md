# Provider Integration Flows

CCS routes profiles through direct target configuration or CLIProxy. This
document describes the durable flow and trust boundaries. Mutable provider
capabilities are linked to their source registries.

## Sources of truth

| Detail | Authoritative source |
| --- | --- |
| Canonical provider IDs, aliases, auth-flow type, callback ports, refresh ownership | [`src/cliproxy/provider-capabilities.ts`](../../src/cliproxy/provider-capabilities.ts) |
| Original vs Plus backend restrictions | [`src/cliproxy/types/provider-types.ts`](../../src/cliproxy/types/provider-types.ts) |
| Provider/backend enforcement | [`src/cliproxy/services/variant-service.ts`](../../src/cliproxy/services/variant-service.ts) |
| Remote proxy precedence and fallback | [`src/cliproxy/proxy/proxy-config-resolver.ts`](../../src/cliproxy/proxy/proxy-config-resolver.ts) |
| Provider capability regression tests | [`src/cliproxy/__tests__/provider-capabilities.test.ts`](../../src/cliproxy/__tests__/provider-capabilities.test.ts) |

Do not copy provider inventories, callback ports, or quota-supported lists into
this document. They change independently of the architecture.

## Route selection

```text
Resolved profile
    |
    +-- account profile
    |      └── target-native authenticated context
    |
    +-- settings/API profile
    |      └── direct or compatible upstream URL and credential environment
    |
    └-- CLIProxy provider
           |
           +-- reachable configured remote proxy
           |
           └-- local proxy, when selected or fallback is allowed
                    |
                    └── original or Plus backend
```

The provider route is resolved before the target adapter prepares credentials.
This keeps provider selection independent from whether Claude Code, Droid, or
Codex receives the route.

## Local CLIProxy

CCS manages the local binary, generated configuration, auth files, lifecycle,
and provider-specific launch environment.

The local backend contract is:

- `original` is the default upstream CLIProxy backend;
- `plus` is an explicit opt-in community-maintained distribution;
- providers declared Plus-only fail clearly on the original backend; and
- CCS does not silently downgrade a configured Plus backend.

The management-panel repository is generated to match the selected backend
unless the user supplies the supported override.

Local target traffic uses a provider-compatible endpoint and an internal
credential. CLIProxy owns upstream OAuth token use and request translation
according to the selected provider.

## Remote CLIProxy

Remote mode delegates proxy lifecycle and stored authentication to another
CLIProxy installation.

```text
CLI flags and environment
          |
          v
CCS proxy configuration
          |
          v
Reachability check
    +-----+-----+
    |           |
reachable   unreachable
    |           |
 remote     remote-only? ---- yes ---> fail
                |
                no
                |
         fallback enabled? -- no ----> fail
                |
               yes
                |
             local proxy
```

Configuration precedence and accepted environment names are implemented in
[`proxy-config-resolver.ts`](../../src/cliproxy/proxy/proxy-config-resolver.ts).
The stable behavioral contract is:

- CLI flags override other sources where supported;
- environment can select a remote host;
- configuration supplies persistent remote settings;
- HTTPS and HTTP defaults remain protocol-aware;
- `--remote-only` disables local fallback; and
- an unreachable remote proxy falls back only when fallback is enabled.

A remote proxy is a separate trust boundary. Its operator can receive provider
traffic and owns its stored OAuth state. Use TLS and authentication appropriate
to that boundary.

## Authentication

CCS asks the selected CLIProxy backend to start the provider's supported auth
flow. The provider registry identifies whether that is an authorization-code
flow, device-code flow, browser polling flow, or currently unsupported account
linking.

```text
Select canonical provider
        |
Validate backend and auth-start support
        |
Start backend-owned auth flow
        |
User completes provider interaction
        |
Backend writes provider auth file
        |
CCS reconciles account identity and readiness
        |
Launch through provider route
```

Provider tokens live under the configured CLIProxy auth directory. Documentation
and examples must use neutral account labels; raw email addresses, token
filenames, access tokens, and refresh tokens are not architecture data.

Some providers can produce more than one account with the same display email.
CCS keeps runtime identity tied to the exact registered auth file rather than
collapsing accounts by display text. The dashboard can show a safe variant
label without exposing the internal identifier.

## API-key profiles

API-key profiles store string-valued environment under the CCS profile
settings file.

```text
Create or edit API profile
        |
Write CCS-owned <profile>.settings.json
        |
Resolve direct/native vs compatible proxy-style auth
        |
Target adapter prepares credentials
        |
Spawn target
```

Native Anthropic profiles use `ANTHROPIC_API_KEY` without forcing a proxy base
URL. Compatible providers typically use `ANTHROPIC_BASE_URL` and
`ANTHROPIC_AUTH_TOKEN`. The profile writer owns that distinction; callers
should not infer it from documentation examples.

Normal launches do not write `~/.claude/settings.json`. Users who want shared
Claude settings must select the explicit `ccs persist` workflow.

## Legacy GLMT compatibility

`glmt` is a compatibility input, not a current provider architecture. Existing
legacy settings are normalized to the direct GLM path before normal
settings-profile dispatch. Internal GLMT transformer modules can remain in use
by other compatibility surfaces without making GLMT a supported standalone
runtime.

New configuration should use current API profile commands and provider names.

## Quota and account-pool flow

Quota support is provider-specific and intentionally sourced from
[`provider-capabilities.ts`](../../src/cliproxy/provider-capabilities.ts).

The stable pool contract is:

1. Reconcile registered accounts with live auth files.
2. Exclude manually paused accounts from rotation.
3. Fetch quota only for providers with an implemented quota fetcher.
4. Distinguish an exhausted account from a provider-wide or transient failure.
5. When a healthy fallback exists, CCS can create a temporary quota pause for
   an exhausted account.
6. Persist the cooldown so later launches observe the same state.
7. Auto-resume only pauses created by CCS quota management; never override a
   user's manual pause.

Routing strategy remains an explicit user choice. CCS must not infer
round-robin or fill-first from account count, plan tier, or quota state.

## Image analysis

For profiles that need managed vision support, CCS prepares the image-analysis
route before launch:

```text
Resolve profile and provider
        |
Resolve supported provider backend
        |
Provision managed MCP/runtime configuration
        |
Target invokes ImageAnalysis
        |
CCS sends provider-scoped request
        |
Return text result
```

The managed route must not expose its internal credential in logs or user
settings. If managed preparation, authentication, or proxy readiness is
unavailable, CCS falls back to compatible native behavior where possible
instead of failing the entire target launch.

Provider-specific vision mappings are implementation data and should be read
from the image-analysis routing services and tests.

## Session and observability boundary

Execution paths can record non-secret metadata such as profile identity,
profile type, canonical provider, target type, timestamps, duration, and
numeric process exit status. Logs must not contain provider tokens, API keys,
raw auth payloads, or personal account identifiers.

Textual CCS log codes and numeric child-process exit statuses are different
contracts. See [Logging Contract](../logging-contract.md).

## Invariants

- Canonical provider identity is registry-driven.
- Provider aliases normalize before execution.
- Backend restrictions are validated before starting local auth or routing.
- Remote-only mode never starts a local fallback.
- Persistent environment values are strings.
- Account display text is not a unique runtime identity.
- Manual pauses are never auto-resumed by quota management.
- Provider credentials never appear in architecture examples.

## Related documentation

- [System Architecture](./index.md)
- [Target Adapters](./target-adapters.md)
- [Logging Contract](../logging-contract.md)
- [Codebase Summary](../codebase-summary.md)
- [Code Standards](../code-standards.md)
