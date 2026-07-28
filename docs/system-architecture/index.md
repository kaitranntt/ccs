# CCS System Architecture

CCS separates profile resolution, provider routing, and target execution. This
document describes stable boundaries; source registries and tests own mutable
provider and command inventories.

## System context

```text
User or automation
        |
        v
CCS CLI ------------------------> Target CLI
   |                                |
   | profile/provider state         | provider protocol
   v                                v
CCS local server <-----------> CLIProxy or direct API
   |
   v
React dashboard
```

The main implementation surfaces are:

| Surface | Ownership |
| --- | --- |
| `src/` | CLI, dispatch, server, provider integration, target adapters |
| `ui/src/` | Dashboard application |
| `dist/` and `dist/ui/` | Build outputs |
| `docker/` | Integrated and legacy container definitions |
| `tests/` | Unit, integration, end-to-end, native, and Docker contracts |

Dashboard localization is documented in the
[Dashboard i18n Guide](../i18n-dashboard.md).

## Execution pipeline

```text
Parse command
    |
Resolve command vs launch
    |
Resolve target
    |
Resolve profile type
    +-- account profile ------> isolated target config root
    +-- settings profile -----> profile environment
    +-- CLIProxy provider ----> local or remote proxy route
    |
Prepare target credentials
    |
Spawn target and forward lifecycle signals
```

Command routing stops before profile execution for management commands such as
configuration, diagnostics, proxy management, and environment export.

### Profile resolution

Profile resolution distinguishes:

1. built-in CLIProxy provider shortcuts;
2. user-defined CLIProxy profiles;
3. settings/API profiles; and
4. registered account profiles.

Canonical provider IDs and aliases come from
[`src/cliproxy/provider-capabilities.ts`](../../src/cliproxy/provider-capabilities.ts).
The detector and dispatcher consume those registries; documentation must not
maintain a second provider list.

### Target resolution

Provider and target are independent axes. The selected target is resolved from
explicit flags and runtime entry points before falling back to configuration
and the default target.

Each adapter owns credential delivery:

- **Claude Code:** launch environment and optional isolated
  `CLAUDE_CONFIG_DIR`;
- **Factory Droid:** CCS-managed custom-model entries in
  `~/.factory/settings.json`; and
- **Codex CLI:** transient `-c` overrides for CCS-routed launches while native
  user configuration remains separately owned.

See [Target Adapters](./target-adapters.md) for the detailed compatibility
contract.

## Provider routing

CCS supports three routing boundaries:

| Route | Credential and transport owner |
| --- | --- |
| Direct settings/API profile | Target receives the selected provider's environment |
| Local CLIProxy | CCS manages a local proxy binary, config, and auth directory |
| Remote CLIProxy | CCS connects to the configured remote service and applies the selected fallback policy |

Local backend choice is explicit. `original` is the default. `plus` is an
opt-in backend for provider capabilities unavailable in the original backend.
Compatibility restrictions are defined in
[`src/cliproxy/types/provider-types.ts`](../../src/cliproxy/types/provider-types.ts)
and enforced before local execution.

See [Provider Flows](./provider-flows.md).

## Configuration ownership

The effective CCS directory is resolved by
[`src/utils/config-manager.ts`](../../src/utils/config-manager.ts). The normal
default is `~/.ccs`; tests and scoped workflows can override it.

```text
CCS directory
├── config.yaml
├── profiles.json
├── <profile>.settings.json
├── instances/
├── logs/
└── cliproxy/
    ├── config.yaml
    ├── auth/
    └── bin/
```

### Settings-write contract

Normal launches do not rewrite shared Claude settings. API profiles store
string-valued launch environment in CCS-owned per-profile settings.

Persistent shared configuration is explicit:

- `ccs persist` reads and validates `~/.claude/settings.json`;
- it refuses unsafe symlink targets;
- it preserves unrelated settings while updating the requested managed fields;
- it creates a backup when an existing file is present; and
- it writes the replacement atomically under a settings-directory lock.

Target-owned writers follow their own boundary. For example, the Droid adapter
manages CCS custom-model entries in `~/.factory/settings.json`, not arbitrary
user settings.

## Local server and dashboard

The Express server exposes APIs used by the React dashboard for supported
configuration, auth, usage, health, and logging workflows. The dashboard is a
management surface over shared services; it must not implement a competing
configuration model.

Real-time updates use server-owned WebSocket messages. Event names and payloads
are code contracts and should be read from the server and UI implementations
rather than copied into this overview.

## Logging

CCS-owned structured runtime logging lives under `src/services/logging/`.
Top-level `logging.*` configuration controls CCS JSONL logs under the CCS
directory. `cliproxy.logging.*` controls upstream CLIProxy files and is a
separate contract.

The dashboard log reader excludes its own log-read requests from request
logging to prevent recursive noise. See [Logging Contract](../logging-contract.md).

## Managed tool preparation

WebSearch and image analysis are prepared before the target launch when the
selected profile needs CCS-managed tooling. They use provider-aware routes but
have different failure contracts: enabled third-party WebSearch fails closed if
its managed MCP replacement cannot be prepared, while image analysis can use a
compatible native path when available.

- [WebSearch](../websearch.md)
- [Provider Flows](./provider-flows.md)

## Security and trust boundaries

### Local host

CCS reads and writes user-authorized configuration and starts target processes.
That local filesystem access is more privileged than a provider API request.
Sensitive values must not enter logs or dashboard responses.

### Local proxy

The host CLI uses loopback for locally managed CLIProxy traffic. Local auth
files and the management API remain sensitive even when the transport never
leaves the machine.

### Remote proxy

A remote CLIProxy crosses a network and administrative boundary. TLS,
authentication, certificate policy, reachability, and local fallback are
explicit configuration choices. Remote-only mode must not silently start a
local proxy.

### Container deployment

The integrated container exposes dashboard and proxy ports through the
operator's port mappings. The image therefore does not inherit the host
installation's loopback-only assumption. Network exposure and access control
belong to the deployment operator.

## Build and distribution

```text
src/ -------- TypeScript --------> dist/
ui/src/ ----- Vite --------------> dist/ui/
                         |
                         v
                 npm package
                         |
                         v
             integrated Docker image
```

The package requires Node.js 18 or newer. Repository development supports Bun
1.0 or newer. CI can pin newer tool versions independently; those workflow pins
are not the minimum consumer runtime contract.

The integrated Docker image is built from
[`docker/Dockerfile.integrated`](../../docker/Dockerfile.integrated). It layers
CCS onto a digest-pinned CLIProxy base, runs CLIProxy and the dashboard under
supervision, and health-checks both services. It does not bundle Claude Code,
Gemini CLI, Codex CLI, Droid, or other target CLIs.

Release lane details are in [Release Process](../release-process.md).

## Architecture invariants

- Provider identity comes from the provider registry.
- Target compatibility is enforced at the adapter boundary.
- Environment values persisted in settings are strings.
- Shared target configuration changes require an explicit workflow.
- Local and remote proxy modes do not silently cross trust boundaries.
- Dashboard and CLI use the same domain services and configuration schema.
- Volatile capability details remain source-owned.

## Related documentation

- [Codebase Summary](../codebase-summary.md)
- [Code Standards](../code-standards.md)
- [Target Adapters](./target-adapters.md)
- [Provider Flows](./provider-flows.md)
- [Release Process](../release-process.md)
- [Project Roadmap](../project-roadmap.md)
