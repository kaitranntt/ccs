# Target Adapters

Last Updated: 2026-03-28

Detailed documentation of the target adapter pattern and implementations.

---

## Overview

The target adapter system enables CCS to dispatch credential-resolved profiles to different CLI implementations while maintaining a unified configuration and profile system.

**Key insight**: Profile resolution (detecting provider, loading auth, building credentials) is target-agnostic. Only the final credential delivery and process spawning differ per target.

---

## Target Adapter Interface

Each CLI target implements the `TargetAdapter` contract:

```typescript
export interface TargetAdapter {
  readonly type: TargetType;                               // 'claude' | 'droid' | 'codex'
  readonly displayName: string;                            // "Claude Code" | "Factory Droid" | "Codex CLI"

  /** Detect if the target CLI binary exists on system */
  detectBinary(): TargetBinaryInfo | null;

  /** Prepare credentials for delivery to target CLI */
  prepareCredentials(creds: TargetCredentials): Promise<void>;

  /** Build spawn arguments for the target CLI */
  buildArgs(
    profile: string,
    userArgs: string[],
    options?: {
      creds?: TargetCredentials;
      profileType?: ProfileType;
      binaryInfo?: TargetBinaryInfo;
    }
  ): string[];

  /** Build environment variables for the target CLI */
  buildEnv(creds: TargetCredentials, profileType: string): NodeJS.ProcessEnv;

  /** Spawn the target CLI process (replaces current process flow) */
  exec(args: string[], env: NodeJS.ProcessEnv, options?: { cwd?: string }): void;

  /** Check if a profile type is supported by this target */
  supportsProfileType(profileType: string): boolean;
}
```

### Type Definitions

```typescript
export type TargetType = 'claude' | 'droid' | 'codex';

export interface TargetCredentials {
  baseUrl: string;                                         // API endpoint
  apiKey: string;                                          // Auth token
  model?: string;                                          // Model ID
  provider?: 'anthropic' | 'openai' | 'generic-chat-completion-api';
  envVars?: NodeJS.ProcessEnv;                             // Additional env vars
}

export interface TargetBinaryInfo {
  path: string;                                            // Full path to binary
  needsShell: boolean;                                     // Windows .cmd/.bat/.ps1?
  version?: string;                                        // Optional version string
  features?: readonly string[];                            // Capability probes
}
```

---

## Target Resolution

CCS resolves which adapter to use via priority-ordered checks:

### Resolution Priority

```
1. --target flag (CLI argument) — highest priority
   └─ ccs --target droid glm
   └─ ccs --target codex

2. Per-profile config (from ~/.ccs/config.yaml or settings.json)
   └─ persisted targets are currently only `claude` and `droid`
   └─ profiles:
        glm:
          target: droid

3. argv[0] detection (runtime alias pattern) — binary name mapping
   └─ ccs-droid (explicit alias) → droid
   └─ ccsd (legacy shortcut) → droid
   └─ ccs-codex (explicit alias) → codex
   └─ ccsx (short alias) → codex
   └─ ccs (regular command) → default

4. Fallback: 'claude' — lowest priority
```

### Implementation

```typescript
// src/targets/target-resolver.ts

export function resolveTargetType(
  args: string[],
  profileConfig?: { target?: TargetType }
): TargetType {
  // 1. Parse --target flags (supports --target value and --target=value)
  // Repeated flags: last one wins.
  const parsed = parseTargetFlags(args);
  if (parsed.targetOverride) {
    return parsed.targetOverride;
  }

  // 2. Check profile config
  if (profileConfig?.target) {
    // Persisted targets intentionally exclude runtime-only codex.
    return profileConfig.target;
  }

  // 3. Check argv[0] (binary name)
  const binName = path.basename(process.argv[1] || process.argv0 || '').replace(/\.(cmd|bat|ps1|exe)$/i, '');
  if (ARGV0_TARGET_MAP[binName]) {
    return ARGV0_TARGET_MAP[binName];
  }

  // 4. Default to claude
  return 'claude';
}
```

---

## Claude Adapter

### Implementation

```typescript
// src/targets/claude-adapter.ts

export class ClaudeAdapter implements TargetAdapter {
  readonly type: TargetType = 'claude';
  readonly displayName = 'Claude Code';

  detectBinary(): TargetBinaryInfo | null {
    const info = getClaudeCliInfo();
    if (!info) return null;
    return { path: info.path, needsShell: info.needsShell };
  }

  async prepareCredentials(_creds: TargetCredentials): Promise<void> {
    // No-op: Claude receives credentials via environment variables
  }

  buildArgs(_profile: string, userArgs: string[]): string[] {
    return userArgs;  // Pass through user arguments unchanged
  }

  buildEnv(creds: TargetCredentials, profileType: string): NodeJS.ProcessEnv {
    const webSearchEnv = getWebSearchHookEnv();

    // For native profiles, strip stale proxy env to prevent interference
    const baseEnv =
      profileType === 'account' || profileType === 'default'
        ? stripAnthropicEnv(process.env)
        : process.env;

    const env: NodeJS.ProcessEnv = { ...baseEnv, ...webSearchEnv };

    if (creds.envVars) {
      Object.assign(env, creds.envVars);
    }

    // Deliver credentials via environment variables
    if (creds.baseUrl) env['ANTHROPIC_BASE_URL'] = creds.baseUrl;
    if (creds.apiKey) env['ANTHROPIC_AUTH_TOKEN'] = creds.apiKey;
    if (creds.model) env['ANTHROPIC_MODEL'] = creds.model;

    return env;
  }

  exec(args: string[], env: NodeJS.ProcessEnv, _options?: { cwd?: string }): void {
    const claudeCli = detectClaudeCli();
    if (!claudeCli) {
      void ErrorManager.showClaudeNotFound();
      process.exit(1);
      return;
    }

    // Handle Windows shell requirements
    const isWindows = process.platform === 'win32';
    const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(claudeCli);

    let child: ChildProcess;
    if (needsShell) {
      const cmdString = [claudeCli, ...args].map(escapeShellArg).join(' ');
      child = spawn(cmdString, { shell: true, stdio: 'inherit', env });
    } else {
      child = spawn(claudeCli, args, { stdio: 'inherit', env });
    }

    // Handle process termination
    const onSigInt = () => child.kill('SIGINT');
    const onSigTerm = () => child.kill('SIGTERM');
    process.once('SIGINT', onSigInt);
    process.once('SIGTERM', onSigTerm);
    child.on('exit', () => {
      process.removeListener('SIGINT', onSigInt);
      process.removeListener('SIGTERM', onSigTerm);
    });
  }

  supportsProfileType(profileType: string): boolean {
    // Claude supports all profile types
    return true;
  }
}
```

### Credential Delivery

**Method**: Environment variables

```bash
export ANTHROPIC_BASE_URL=https://api.anthropic.com
export ANTHROPIC_AUTH_TOKEN=sk-ant-...
export ANTHROPIC_MODEL=claude-opus-4-6
export WEBSEARCH_HOOK_ENV=...  # Image analysis, websearch
```

### Execution

```bash
# Direct invocation
ccs gemini
→ claude "args..."
  with ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN set

# With --target override
ccs --target claude glm
→ claude "args..."
  with ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN set
```

---

## Droid Adapter

### Implementation

```typescript
// src/targets/droid-adapter.ts

export class DroidAdapter implements TargetAdapter {
  readonly type: TargetType = 'droid';
  readonly displayName = 'Factory Droid';

  detectBinary(): TargetBinaryInfo | null {
    const info = getDroidBinaryInfo();
    if (!info) return null;

    // Non-blocking version compatibility check
    checkDroidVersion(info.path);
    return info;
  }

  async prepareCredentials(creds: TargetCredentials): Promise<void> {
    // Write custom model entry to ~/.factory/settings.json
    await upsertCcsModel(creds.profile, {
      model: creds.model || 'claude-opus-4-6',
      displayName: `CCS ${creds.profile}`,
      baseUrl: creds.baseUrl,
      apiKey: creds.apiKey,
      provider: creds.provider || 'anthropic',
    });
  }

  buildArgs(profile: string, userArgs: string[]): string[] {
    // Droid uses -m <model> syntax for model selection
    return ['-m', `custom:ccs-${profile}`, ...userArgs];
  }

  buildEnv(_creds: TargetCredentials, _profileType: string): NodeJS.ProcessEnv {
    // Droid reads from config file — minimal env needed
    return { ...process.env };
  }

  exec(args: string[], env: NodeJS.ProcessEnv, _options?: { cwd?: string }): void {
    const droidPath = detectDroidCli();
    if (!droidPath) {
      console.error('[X] Droid CLI not found. Install: npm i -g @factory/cli');
      process.exit(1);
      return;
    }

    // Handle Windows shell requirements
    const isWindows = process.platform === 'win32';
    const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(droidPath);

    let child: ChildProcess;
    if (needsShell) {
      const cmdString = [droidPath, ...args].map(escapeShellArg).join(' ');
      child = spawn(cmdString, { shell: true, stdio: 'inherit', env });
    } else {
      child = spawn(droidPath, args, { stdio: 'inherit', env });
    }

    // Handle process termination
    const onSigInt = () => child.kill('SIGINT');
    const onSigTerm = () => child.kill('SIGTERM');
    process.once('SIGINT', onSigInt);
    process.once('SIGTERM', onSigTerm);
    child.on('exit', () => {
      process.removeListener('SIGINT', onSigInt);
      process.removeListener('SIGTERM', onSigTerm);
    });
  }

  supportsProfileType(profileType: string): boolean {
    // Droid currently supports direct settings/default paths only
    return profileType === 'settings' || profileType === 'default';
  }
}
```

### Credential Delivery

**Method**: Config file (`~/.factory/settings.json`)

```json
{
  "customModels": [
    {
      "model": "claude-opus-4-6",
      "displayName": "CCS gemini",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
      "apiKey": "AIza...",
      "provider": "openai"
    },
    {
      "model": "glm-4",
      "displayName": "CCS glm",
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4/",
      "apiKey": "your-glm-key",
      "provider": "openai"
    }
  ]
}
```

### Execution

```bash
# Direct invocation
ccs gemini
→ droid -m custom:ccs-gemini "args..."
  (credentials loaded from ~/.factory/settings.json)

# With --target override
ccs --target droid glm
→ droid -m custom:ccs-glm "args..."
  (credentials loaded from ~/.factory/settings.json)
```

### Runtime Alias Pattern

```bash
# Built-in package bin aliases
ccs-droid glm
→ Target: droid (forced by runtime alias)
→ droid -m custom:ccs-glm "args..."

# Legacy shortcut still works
ccsd glm
→ Target: droid (forced by runtime alias)
→ droid -m custom:ccs-glm "args..."
```

On Windows, `ccs-droid.cmd`, `ccsd.cmd`, `ccsd.bat`, `ccsd.ps1`, and `ccsd.exe` wrappers are also recognized.

Additional alias names can be configured at runtime after you create a matching
symlink or another launcher that preserves the invoked basename. Use `CCS_TARGET_ALIASES` (preferred,
`target=alias1,alias2;...`) or legacy `CCS_DROID_ALIASES` (comma-separated).
Example:

```bash
ln -s /path/to/ccs /path/to/mydroid
CCS_TARGET_ALIASES=droid=mydroid
```

---

## Codex Adapter

### Implementation

The Codex adapter keeps CCS-backed Codex launches transient. It does not rewrite
`~/.codex/config.toml`. Instead it:

- passes through native default Codex sessions unchanged
- probes the installed Codex binary for `--config <key=value>` support
- injects CCS-backed provider credentials through temporary `-c` overrides
- stores the routed API key only in process env via `CCS_CODEX_API_KEY`

```typescript
// src/targets/codex-adapter.ts

export class CodexAdapter implements TargetAdapter {
  readonly type: TargetType = 'codex';
  readonly displayName = 'Codex CLI';

  detectBinary(): TargetBinaryInfo | null {
    return getCodexBinaryInfo();
  }

  async prepareCredentials(_creds: TargetCredentials): Promise<void> {
    // No file writes. Codex uses transient -c overrides plus env_key injection.
  }

  buildArgs(profile: string, userArgs: string[], options?: BuildOptions): string[] {
    if ((options?.profileType || 'default') === 'default') {
      return userArgs;
    }

    if (!codexBinarySupportsConfigOverrides(options?.binaryInfo)) {
      throw new Error('Upgrade Codex before using CCS-backed Codex profiles.');
    }

    return [
      '-c',
      'model_provider=\"ccs_runtime\"',
      '-c',
      'model_providers.ccs_runtime.base_url=\"http://127.0.0.1:8317/api/provider/codex\"',
      '-c',
      'model_providers.ccs_runtime.env_key=\"CCS_CODEX_API_KEY\"',
      '-c',
      'model_providers.ccs_runtime.wire_api=\"responses\"',
      ...userArgs,
    ];
  }

  buildEnv(creds: TargetCredentials, profileType: string): NodeJS.ProcessEnv {
    const env = { ...stripAnthropicEnv(process.env) };
    if (profileType !== 'default') {
      env['CCS_CODEX_API_KEY'] = creds.apiKey;
    }
    return env;
  }
}
```

### Support Matrix

Codex is a real runtime target, but it is intentionally narrower than Claude or Droid in v1:

| Profile Type | Codex Target | Notes |
|--------------|--------------|-------|
| `default` | Yes | Uses existing native Codex auth/config |
| `cliproxy` provider=`codex` | Yes | Routed through CLIProxy Codex Responses bridge |
| `cliproxy` composite | No | Not proven native-Codex-safe |
| `settings` with Codex bridge metadata | Yes | Only when the API profile resolves to a Codex CLIProxy bridge |
| `settings` generic API profile | No | Claude/Droid only |
| `account` | No | Claude-only account isolation concept |
| `copilot` | No | Not a native Codex provider path |

### Codex Dashboard Surface

CCS also exposes a dedicated dashboard route at `ccs config` -> `Compatible` -> `Codex CLI`.
That page is intentionally narrower than the Droid dashboard:

- reads and writes only the user config layer: `~/.codex/config.toml` or `$CODEX_HOME/config.toml`
- shows binary detection, user-layer config summaries, support-matrix guidance, and upstream docs
- warns that transient CCS runtime overrides such as `codex -c key=value` and
  `CCS_CODEX_API_KEY` can change the effective runtime without persisting into the file editor

This keeps the dashboard honest about Codex's merged configuration model while still giving users
one place to inspect and manage the user-owned layer safely.

### Runtime Alias Pattern

```bash
# Built-in package bin aliases
ccs-codex
→ Target: codex (forced by runtime alias)

ccsx codex
→ Target: codex (forced by runtime alias)
→ codex ...args
```

Runtime aliases can also be extended with `CCS_TARGET_ALIASES` or legacy
`CCS_CODEX_ALIASES` after creating a matching launcher:

```bash
ln -s /path/to/ccs /path/to/mycodex
CCS_TARGET_ALIASES='codex=mycodex'
# Legacy fallback:
CCS_CODEX_ALIASES='mycodex'
```

---

## Registry and Lookup

The target registry is a simple map-based store for adapters:

```typescript
// src/targets/target-registry.ts

const adapters = new Map<TargetType, TargetAdapter>();

export function registerTarget(adapter: TargetAdapter): void {
  adapters.set(adapter.type, adapter);
}

export function getTarget(type: TargetType): TargetAdapter {
  const adapter = adapters.get(type);
  if (!adapter) {
    throw new Error(`Unknown target "${type}"`);
  }
  return adapter;
}

export function getDefaultTarget(): TargetAdapter {
  return getTarget('claude');
}
```

### Adapter Registration

At startup, adapters self-register:

```typescript
// src/ccs.ts (initialization)

registerTarget(new ClaudeAdapter());
registerTarget(new DroidAdapter());
registerTarget(new CodexAdapter());
```

---

## Execution Flow

### Step-by-Step

```
1. Parse command-line arguments
   └─ args: ['--target', 'droid', 'glm']

2. Resolve target type
   └─ resolveTargetType(args) → 'droid'
   └─ stripTargetFlag(args) → ['glm']

3. Detect and resolve profile
   └─ detectProfile(['glm']) → { profile: 'glm', ... }
   └─ Load credentials from config/CLIProxy/env

4. Build credentials object
   └─ TargetCredentials {
        baseUrl: '...',
        apiKey: '...',
        model: 'claude-opus-4-6',
        envVars: { CCS_PROFILE_NAME: 'glm', ... }
      }

5. Get target adapter
   └─ getTarget('droid') → DroidAdapter instance

6. Prepare credentials
   └─ adapter.prepareCredentials(creds)
   └─ DroidAdapter: writes to ~/.factory/settings.json

7. Build spawn arguments
   └─ adapter.buildArgs('glm', []) → ['-m', 'custom:ccs-glm']

8. Build environment
   └─ adapter.buildEnv(creds, profileType) → process.env

9. Spawn target CLI
   └─ adapter.exec(spawnArgs, env)
   └─ exec spawn('droid', ['-m', 'custom:ccs-glm', ...])

10. Replace current process
    └─ Child process inherits stdio
    └─ Signal handlers propagate to child
```

---

## Adding a New Target

To support a new CLI (e.g., MyAI CLI), follow this pattern:

### 1. Create Adapter Class

```typescript
// src/targets/myai-adapter.ts

export class MyAiAdapter implements TargetAdapter {
  readonly type: TargetType = 'myai';
  readonly displayName = 'MyAI CLI';

  detectBinary(): TargetBinaryInfo | null {
    const path = which.sync('myai', { nothrow: true });
    if (!path) return null;
    return { path, needsShell: process.platform === 'win32' };
  }

  async prepareCredentials(creds: TargetCredentials): Promise<void> {
    // Write to ~/.myai/config or similar
  }

  buildArgs(profile: string, userArgs: string[]): string[] {
    return ['-p', profile, ...userArgs];
  }

  buildEnv(creds: TargetCredentials, _profileType: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      MYAI_API_KEY: creds.apiKey,
      MYAI_API_URL: creds.baseUrl,
    };
  }

  exec(args: string[], env: NodeJS.ProcessEnv): void {
    const myaiPath = this.detectBinary()?.path;
    if (!myaiPath) {
      console.error('[X] MyAI CLI not found');
      process.exit(1);
    }
    spawn(myaiPath, args, { stdio: 'inherit', env });
  }

  supportsProfileType(profileType: string): boolean {
    return true; // or implement specific logic
  }
}
```

### 2. Update Type Definition

```typescript
// src/targets/target-adapter.ts

export type TargetType = 'claude' | 'droid' | 'codex' | 'myai';
```

### 3. Register in ccs.ts

```typescript
registerTarget(new MyAiAdapter());
```

### 4. Update Documentation

- Add to [Codebase Summary](../codebase-summary.md)
- Update Code Standards adapter examples
- Document CLI-specific behavior

---

## Cross-Platform Considerations

### Windows Shell Detection

Both adapters check for shell-requiring binaries:

```typescript
const needsShell = isWindows && /\.(cmd|bat|ps1)$/i.test(binaryPath);

if (needsShell) {
  const cmdString = [binaryPath, ...args].map(escapeShellArg).join(' ');
  spawn(cmdString, { shell: true, stdio: 'inherit' });
} else {
  spawn(binaryPath, args, { stdio: 'inherit' });
}
```

### Environment Variable Escaping

Arguments passed to shell are escaped to prevent injection:

```typescript
export function escapeShellArg(arg: string): string {
  // Wrap in quotes and escape internal quotes
  return `"${arg.replace(/"/g, '\\"')}"`;
}
```

### Signal Handling

Both adapters propagate signals from parent to child:

```typescript
const onSigInt = () => child.kill('SIGINT');
const onSigTerm = () => child.kill('SIGTERM');
process.once('SIGINT', onSigInt);
process.once('SIGTERM', onSigTerm);

child.on('exit', () => {
  process.removeListener('SIGINT', onSigInt);
  process.removeListener('SIGTERM', onSigTerm);
});
```

This ensures CTRL+C and graceful shutdowns work correctly.

---

## Testing Target Adapters

### Unit Tests

```typescript
describe('ClaudeAdapter', () => {
  it('detects Claude CLI', () => {
    const adapter = new ClaudeAdapter();
    const binary = adapter.detectBinary();
    expect(binary).not.toBeNull();
  });

  it('builds env with credentials', () => {
    const adapter = new ClaudeAdapter();
    const env = adapter.buildEnv({
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-...',
      model: 'claude-opus-4-6',
    }, 'cliproxy');

    expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('sk-ant-...');
  });
});
```

### Integration Tests

```bash
# Test Claude adapter
ccs --target claude help

# Test Droid adapter (if installed)
ccs --target droid help

# Test Codex adapter (if installed)
ccs --target codex
ccs-codex

# Test argv[0] detection
ccs-droid help
ccsx
```

---

## Related Documentation

- [Codebase Summary](../codebase-summary.md) — Module structure
- [Code Standards](../code-standards.md) — Adapter pattern guidelines
- [System Architecture Index](./index.md) — Overall system design
