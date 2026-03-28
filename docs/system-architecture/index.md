# CCS System Architecture

Last Updated: 2026-03-28

High-level architecture overview for the CCS (Claude Code Switch) system.

---

## System Overview

CCS is a CLI wrapper that enables seamless switching between multiple Claude accounts and alternative AI providers (GLM, Gemini, Codex, Kiro, GitHub Copilot, OpenRouter, Qwen, Kimi, DeepSeek). It now supports multiple CLI targets (Claude Code, Factory Droid, Codex CLI) for credential delivery.

The system consists of two main components:

1. **CLI Application** (`src/`) - Node.js TypeScript CLI
2. **Dashboard UI** (`ui/`) - React web application served by Express

Dashboard localization (i18n) architecture and contributor workflow are documented in [Dashboard i18n Guide](../i18n-dashboard.md).

CCS v7.34 adds Image Analysis Hook for vision model proxying through CLIProxy with automatic injection for all profile types.

```
+===========================================================================+
|                              CCS System                                    |
+===========================================================================+
|                                                                           |
|   +------------------+      +-----------------+      +----------------+   |
|   |   User Terminal  | ---> |   CCS CLI       | ---> | Target CLI           |   |
|   |   (ccs command)  |      |   (src/ccs.ts)  |      | (claude/droid/codex) |   |
|   +------------------+      +-----------------+      +----------------+   |
|                                    |                        |             |
|                                    v                        v             |
|   +------------------+      +-----------------+      +----------------+   |
|   |   Dashboard UI   | <--> |   Express       | ---> | Provider APIs  |   |
|   |   (React SPA)    |      |   Web Server    |      | (Claude/GLM/   |   |
|   +------------------+      +-----------------+      |  Gemini/etc)   |   |
|                                    |                 +----------------+   |
|                                    v                                      |
|                        +---------------------+                            |
|                        |    CLIProxyAPI      |                            |
|                        |  (Local or Remote)  |                            |
|                        +---------------------+                            |
|                                                                           |
+===========================================================================+
```

---

## Component Architecture

### Multi-Target Adapter System

CCS v7.45 introduces the Target Adapter pattern, enabling seamless integration with different CLI implementations.

**Key architecture:**

```
Profile Resolution (CLIProxy, Settings/API, Account-based)
        |
        v
Target Resolution (--target flag > config > argv[0] > default)
        |
        v
Get Target Adapter (Claude, Droid, or Codex)
        |
        +---> detectBinary()     (find CLI on system)
        |
        +---> prepareCredentials() (write config or set env)
        |
        +---> buildArgs()        (construct CLI arguments)
        |
        +---> buildEnv()         (prepare environment variables)
        |
        v
Spawn Target Process
```

**Each target adapter implements different credential delivery:**

- **Claude Adapter**: Env var delivery (existing behavior)
  - `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`
  - No config files needed

- **Droid Adapter**: Config file delivery to `~/.factory/settings.json`
  - Writes custom model entry: `custom:ccs-<profile>`
  - Spawns: `droid -m custom:ccs-<profile> <args>`
  - Model config includes baseUrl, apiKey, provider

- **Codex Adapter**: Transient runtime overrides plus user-layer dashboard inspection
  - Uses `codex -c key=value` only for CCS-routed launches
  - Preserves native `~/.codex/config.toml` ownership
  - Dashboard page reads/writes only the user config layer with explicit runtime-vs-provider warnings

**Runtime alias pattern (built-in bins / argv[0]-style):**

```
ccs        → Target: claude (default)
ccs-droid  → Target: droid (explicit alias)
ccsd       → Target: droid (legacy shortcut)
ccs-codex  → Target: codex (explicit alias)
ccsx       → Target: codex (short alias)
```

For details on the adapter architecture, see [Target Adapters](./target-adapters.md).

### CLI Layer

```
+===========================================================================+
|                           CLI Architecture                                |
+===========================================================================+

  User Input (ccs [--target <cli>] <profile> [args])
        |
        v
  +-------------+
  |   ccs.ts    |  Entry point, command routing
  +-------------+
        |
        +---> [Version/Help/Doctor/etc.] ---> Exit
        |
        v
  +------------------+
  | Target Resolution | Determine which CLI to use
  +------------------+
        |
        v
  +-------------+
  |  Profile    |  Determines execution path
  |  Detection  |
  +-------------+
        |
        +---> [Native Claude Account] ---> execClaude()
        |                                       |
        +---> [CLIProxy Provider] ---> execClaudeWithCLIProxy()
        |                                       |
        +---> [Settings/API Profile] ---> normalize legacy glmt if needed
        |
        v
  +------------------+
  | Target Adapter   |  Get appropriate adapter
  +------------------+
        |
        v
  +------------------+
  | Prepare Creds    |  Deliver credentials
  +------------------+
        |
        v
  +------------------+
  | Target CLI       |  Claude Code or Droid
  +------------------+
```

---

## Data Flow Architecture

### CLI Execution Flow

```
+===========================================================================+
|                        CLI Execution Flow                                  |
+===========================================================================+

  1. Parse Arguments
        |
        v
  2. Resolve Target Type
        |
        v
  3. Detect Profile Type
        |
        +---> Native Claude ---> 3a. Load Account Settings
        |                              |
        |                              v
        |                        4a. Set CLAUDE_CONFIG_DIR
        |                              |
        |                              v
        |                        5a. Get Claude Target Adapter
        |
        +---> CLIProxy -------> 3b. Ensure Binary Installed
        |                              |
        |                              v
        |                        4b. Generate Config
        |                              |
        |                              v
        |                        5b. Resolve Target Adapter
        |                              |
        |                              v
        |                        6b. Prepare Credentials
        |                              |
        |                              v
        |                        7b. Spawn via Adapter
        |
        +---> Settings/API ---> 3c. Load settings env
                                      |
                                      v
                                4c. Normalize legacy glmt if needed
                                      |
                                      v
                                5c. Resolve Target Adapter
                                      |
                                      v
                                6c. Spawn via Adapter
```

---

## Provider Integration Architecture

For detailed provider flows (CLIProxyAPI, legacy GLMT compatibility, quota management), see [Provider Flows](./provider-flows.md).

---

## Configuration Architecture

### Config File Hierarchy

```
+===========================================================================+
|                     Configuration Hierarchy                                |
+===========================================================================+

  ~/.ccs/
    |
    +---> config.yaml              # Main CCS config (unified)
    |
    +---> profiles.json            # Claude account registry
    |
    +---> <profile>.settings.json  # Per-profile settings
    |
    +---> cliproxy/
    |       |
    |       +---> config.yaml      # CLIProxy configuration
    |       +---> auth/            # OAuth tokens
    |       +---> bin/             # CLIProxy binary
    |
    +---> shared/                  # Symlinked resources
            |
            +---> commands/        # Claude Code commands
            +---> skills/          # Custom skills
            +---> agents/          # Agent configurations
            +---> plugins/
                    |
                    +---> cache/               # Shared plugin payload/cache data
                    +---> marketplaces/        # Shared marketplace payload directories
                    +---> installed_plugins.json

  ~/.ccs/instances/<profile>/
    |
    +---> plugins/
            |
            +---> known_marketplaces.json      # Instance-local registry for active CLAUDE_CONFIG_DIR validation

  ~/.factory/ (Droid CLI)
    |
    +---> settings.json            # Droid config (custom models)
```

Plugin ownership note:
- `commands/`, `skills/`, `agents/`, and `settings.json` remain shared through the existing symlink/copy flow.
- Marketplace payload directories stay shared, but `known_marketplaces.json` is reconciled per instance so Claude Code can validate `installLocation` against that instance's `CLAUDE_CONFIG_DIR/plugins/marketplaces`.

### Config Loading Order

```
  1. Environment Variables (highest priority)
        |
        v
  2. CLI Arguments (including --target)
        |
        v
  3. Profile-specific settings (~/.ccs/<profile>.settings.json)
        |
        v
  4. Main config (~/.ccs/config.yaml)
        |
        v
  5. Default values (lowest priority)
```

---

## WebSocket Architecture

### Real-time Communication

```
+===========================================================================+
|                     WebSocket Communication                                |
+===========================================================================+

  Dashboard (React)                     Server (Express)
        |                                      |
        |<------ Connection Established ------>|
        |                                      |
        |<------ health:update ----------------|  Health status
        |                                      |
        |<------ auth:status ------------------|  Auth changes
        |                                      |
        |<------ usage:update -----------------|  Usage stats
        |                                      |
        |------- action:refresh -------------->|  User requests
        |                                      |
```

---

## Security Architecture

### Authentication Flow

See [Provider Flows](./provider-flows.md) → Authentication Flow section.

### Security Boundaries

```
  +------------------+
  | User Terminal    |
  +------------------+
        |
        | Local only (no network exposure)
        v
  +------------------+
  | CCS CLI          |
  +------------------+
        |
        | Localhost only (127.0.0.1)
        v
  +------------------+
  | CLIProxy/Legacy  |  Binds to localhost only
  +------------------+
        |
        | TLS encrypted
        v
  +------------------+
  | Target CLI       |  Spawned locally (claude/droid)
  +------------------+
        |
        | TLS encrypted
        v
  +------------------+
  | Provider APIs    |  External endpoints
  +------------------+
```

---

## Build and Distribution

### Build Pipeline

```
+===========================================================================+
|                        Build Pipeline                                      |
+===========================================================================+

  src/ (TypeScript)                    ui/src/ (React TSX)
        |                                      |
        v                                      v
  TypeScript Compiler                  Vite Build
        |                                      |
        v                                      v
  dist/ (JavaScript)                   dist/ui/ (Static assets)
        |                                      |
        +---------------+---------------------+
                        |
                        v
               npm package (@kaitranntt/ccs)
                        |
                        v
               npm registry / GitHub releases
```

### Package Contents

```
  @kaitranntt/ccs
        |
        +---> dist/           # Compiled CLI
        +---> dist/ui/        # Built dashboard
        +---> lib/            # Native scripts
        |       +---> ccs     # Bash bootstrap
        |       +---> ccs.ps1 # PowerShell bootstrap
        +---> package.json
```

---

## Deployment Architecture

### Local Installation

```
  npm install -g @kaitranntt/ccs
        |
        v
  Global node_modules
        |
        +---> Creates symlink: ccs --> dist/ccs.js
        |
        +---> Runtime aliases: ccs-droid / ccsd → ccs (auto-select droid target)
        |
        +---> First run creates: ~/.ccs/
```

### Runtime Dependencies

```
  +------------------+     +------------------+
  |   Node.js 14+    |     |   Claude CLI     |
  |   (required)     |     |   (required)     |
  +------------------+     +------------------+

  +------------------+     +------------------+
  |   CLIProxyAPI    |     |   Droid CLI      |
  |   (auto-managed) |     |   (optional)     |
  +------------------+     +------------------+
```

---

## Related Documentation

- [Codebase Summary](../codebase-summary.md) - Detailed directory structure
- [Code Standards](../code-standards.md) - Coding conventions & patterns
- [Target Adapters](./target-adapters.md) - Multi-CLI adapter architecture
- [Provider Flows](./provider-flows.md) - CLIProxy, legacy GLMT compatibility, authentication flows
- [Project Roadmap](../project-roadmap.md) - Development phases
