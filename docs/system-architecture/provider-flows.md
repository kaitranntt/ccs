# Provider Integration Flows

Last Updated: 2026-03-30

Detailed provider integration flows including CLIProxyAPI, legacy GLMT compatibility transforms, remote CLIProxy, quota management, and authentication.

---

## CLIProxyAPI Flow

### Overview

CLIProxyAPI is a local OAuth proxy binary that enables seamless integration with multiple AI providers. CCS manages the binary and configuration automatically.

```
+===========================================================================+
|                      CLIProxyAPI Integration                               |
+===========================================================================+

  Claude CLI
        |
        | ANTHROPIC_BASE_URL = localhost:XXXX
        v
  +------------------+
  |   CLIProxyAPI    |  Local proxy binary (CLIProxyAPIPlus for kiro/ghcp)
  |   (binary)       |
  +------------------+
        |
        +---> OAuth Authentication
        |           |
        |           +---> Authorization Code Flow (port-based)
        |           |         - Gemini, Codex, Antigravity, Kiro (port 9876)
        |           |         - Opens browser for user auth
        |           |         - Callback to localhost:PORT
        |           |
        |           +---> Device Code Flow (no port needed)
        |                     - GitHub Copilot (ghcp)
        |                     - User enters code at github.com/login/device
        |                     - Polls for token completion
        |           |
        |           v
        |     +------------------+
        |     |   OAuth Server   |  Browser-based auth
        |     +------------------+
        |
        +---> Request Transformation
        |           |
        |           v
        |     Anthropic Format --> Provider Format
        |
        +---> Image Analysis Hook (v7.34)
        |           |
        |           v
        |     Vision Model Proxying (gemini, codex, agy, clipproxy)
        |           - Auto-injected via claude-hooks
        |           - Skip for Claude Sub accounts (native vision)
        |           - Fallback with deprecated block-image-read
        |
        +---> Provider APIs
                    |
                    +---> Google (Gemini)
                    +---> GitHub (Codex)
                    +---> Antigravity (AGY)
                    +---> AWS Kiro (Claude-powered)
                    +---> GitHub Copilot (ghcp)
                    +---> OpenAI-compatible endpoints
```

### Supported Hardcoded Providers

| Provider | ID | Auth Method | Port | Binary |
|----------|----|----|------|--------|
| Gemini | `gemini` | Authorization Code | 9876 | CLIProxyAPI |
| Codex | `codex` | Authorization Code | 9876 | CLIProxyAPI |
| Antigravity | `agy` | Authorization Code | 9876 | CLIProxyAPI |
| Kiro (AWS) | `kiro` | Method-aware (default: Device Code) | 9876 | CLIProxyAPIPlus |
| GitHub Copilot | `ghcp` | Device Code | none | CLIProxyAPIPlus |

### Codex Duplicate-Email Account Identity

Codex can legitimately produce multiple auth files for the same email when the user has both a team/business login and a personal/free login. CCS now treats those as separate accounts instead of collapsing them by email.

- Internal account IDs stay duplicate-aware for Codex only: `email#variant`
- Variant keys are derived from the auth filename, for example `kaidu.kd@gmail.com#04a0f049-team` and `kaidu.kd@gmail.com#free`
- Dashboard surfaces continue to show the canonical email, with a compact variant badge such as `Team` or `Free`
- Quota fetch resolves the exact registry `tokenFile` for the selected account instead of scanning by email and taking the first match
- Live usage/account monitor stats key by `provider + account identity`, so duplicate Codex emails no longer merge into one runtime bucket

This preserves the user-visible distinction between business and personal Codex sessions while keeping other providers on their existing email-backed identity model.

### Hardcoded Provider Detection

CCS detects hardcoded providers via `profile-detector.ts` and routes through `execClaudeWithCLIProxy()`.

```typescript
// Profile name matching
const hardcodedProviders = ['gemini', 'codex', 'agy', 'kiro', 'ghcp'];

if (hardcodedProviders.includes(profileName)) {
  return execClaudeWithCLIProxy(claudeCli, profileName, args);
}
```

---

## Legacy GLMT Compatibility Flow

### Overview

GLMT is no longer a marketed runtime surface in CCS. Existing `glmt` profiles are kept as a compatibility path and normalized at launch to the direct GLM endpoint. The `src/glmt/` module remains because Cursor response translation still imports its transformer pipeline.

```
+===========================================================================+
|                Legacy GLMT Compatibility + Internal Transforms             |
+===========================================================================+

  Claude CLI
        |
        | legacy glmt settings detected
        v
  +------------------+
  | Compatibility    |  normalizeDeprecatedGlmtEnv()
  | Layer            |  (src/utils/glmt-deprecation.ts)
  +------------------+
        |
        v
  +------------------+
  | Direct GLM API   |  https://api.z.ai/api/anthropic
  +------------------+
        |
        v
  +------------------+
  | src/glmt/*       |  retained for Cursor translation
  +------------------+
```

### Supported Migration Targets

| Provider | Config Key | Endpoint | Auth |
|----------|------------|----------|------|
| Z.AI (GLM) | `glm` | https://api.z.ai/api/anthropic | API key |
| Kimi API | `km` | https://api.kimi.com/coding/ | API key |
| Legacy compatibility | `glmt` | normalized to direct GLM at runtime | existing profile only |

Use `ccs glm` for Z.AI profiles and `ccs km` for reasoning-first Kimi API profiles. Keep `glmt` only when migrating an existing settings file.

### Runtime Handling

CCS detects the deprecated `glmt` profile name and normalizes legacy proxy-only settings before dispatching through the normal settings-profile flow:

```typescript
if (isDeprecatedGlmtProfileName(profileName)) {
  const normalized = normalizeDeprecatedGlmtEnv(settingsEnv);
  // warn user, validate against direct GLM endpoint, continue through settings flow
}
```

---

## Remote CLIProxy Flow (v7.1)

### Overview

Remote CLIProxy enables CCS to delegate authentication to a central proxy server instead of spawning a local binary.

```
+===========================================================================+
|                    Remote CLIProxy Architecture (v7.1)                    |
+===========================================================================+

  Config Resolution (proxy-config-resolver.ts)
        |
        +---> Priority: CLI flags > ENV vars > config.yaml > defaults
        |
        v
  +------------------+
  | ResolvedProxyConfig |
  | mode: local|remote |
  +------------------+
        |
        +---> [mode = local] ---> Spawn local CLIProxyAPI binary
        |                              |
        |                              v
        |                        localhost:8317
        |
        +---> [mode = remote] ---> Connect to remote server
                                       |
                                       v
                                 +------------------+
                                 | Health Check     |  remote-proxy-client.ts
                                 | /v1/models       |  2s timeout
                                 +------------------+
                                       |
                                       +---> [reachable] ---> Use remote
                                       |                           |
                                       |                           v
                                       |                      protocol://host:port
                                       |
                                       +---> [unreachable] ---> Fallback decision
                                                                     |
                                       +-----------------------------+
                                       |
                                       +---> [fallbackEnabled] ---> Start local
                                       |
                                       +---> [remoteOnly] ---> Fail with error

  CLI Flags:
    --proxy-host <host>         Remote hostname/IP
    --proxy-port <port>         Port (default: 8317 HTTP, 443 HTTPS)
    --proxy-protocol <proto>    http or https
    --proxy-auth-token <token>  Bearer authentication
    --local-proxy               Force local mode
    --remote-only               Fail if remote unreachable

  Environment Variables:
    CCS_PROXY_HOST              Remote hostname
    CCS_PROXY_PORT              Remote port
    CCS_PROXY_PROTOCOL          Protocol (http/https)
    CCS_PROXY_AUTH_TOKEN        Auth token
    CCS_PROXY_FALLBACK_ENABLED  Enable fallback (true/false)
```

### Configuration Resolution

```typescript
// proxy-config-resolver.ts: Priority order
const resolved = {
  ...DEFAULT_CONFIG,                    // 4. Defaults (lowest)
  ...yamlConfig,                        // 3. config.yaml
  ...envConfig,                         // 2. Environment variables
  ...cliFlags,                          // 1. CLI flags (highest)
};
```

### Health Check

```typescript
// remote-proxy-client.ts
async function checkRemoteProxyHealth(config: ResolvedProxyConfig): Promise<boolean> {
  try {
    const url = `${config.protocol}://${config.host}:${config.port}/v1/models`;
    const response = await fetch(url, {
      headers: config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {},
      timeout: 2000,
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

---

## Quota Management Flow (v7.14)

### Overview

Hybrid quota management enables automatic detection of exhausted accounts and failover to next available account.

```
+===========================================================================+
|                      Quota Management Architecture (v7.14)                |
+===========================================================================+

  Pre-Flight Check (before session start)
        |
        v
  +------------------+
  | quota-manager.ts |  Hybrid quota management
  +------------------+
        |
        +---> Get all active accounts for provider
        |
        +---> For each account:
        |           |
        |           v
        |     +------------------+
        |     | quota-fetcher.ts |  Provider-specific API calls
        |     +------------------+
        |           |
        |           +---> Check isPaused flag --> Skip if paused
        |           |
        |           +---> Fetch quota from provider API
        |           |       - Gemini: /models endpoint
        |           |       - Codex: /api/v1/account
        |           |       - Kiro: /api/usage
        |           |
        |           +---> Detect tier (free/paid/unknown)
        |           |
        |           +---> Check exhaustion status
        |
        +---> Select best account (not paused, not exhausted)
        |
        +---> Auto-failover to next account if current exhausted

  CLI Commands:
    ccs cliproxy pause <account>   --> Set isPaused=true in account-manager
    ccs cliproxy resume <account>  --> Set isPaused=false
    ccs cliproxy status [account]  --> Display quota + tier info

  Dashboard UI:
    - Pause/Resume toggle per account
    - Tier badge (free/paid/unknown)
    - Quota usage display
```

### Account Selection Algorithm

```typescript
// quota-manager.ts: Best account selection
function selectBestAccount(accounts: AccountInfo[]): AccountInfo | null {
  // Priority:
  // 1. Not paused
  // 2. Not exhausted
  // 3. Paid tier over free tier
  // 4. Highest remaining quota

  return accounts
    .filter(acc => !acc.isPaused && !acc.isExhausted)
    .sort((a, b) => {
      if (a.tier !== b.tier) return (a.tier === 'paid' ? -1 : 1);
      return (b.remainingQuota || 0) - (a.remainingQuota || 0);
    })[0] || null;
}
```

---

## Authentication Flow

### OAuth Providers - Authorization Code Flow

**Providers**: Gemini, Codex, Antigravity, Kiro (aws method)

```
+===========================================================================+
|              OAuth - Authorization Code Flow (Port-based)                 |
+===========================================================================+

  1. User runs: ccs gemini
        |
        v
  2. Check token cache (~/.ccs/cliproxy/auth/)
        |
        +---> [Valid token] ---> Use cached token
        |
        +---> [No/Expired token]
                    |
                    v
  3. Start local OAuth server (localhost:9876)
        |
        v
  4. Open browser with OAuth request
        |     https://oauth-provider/authorize?redirect_uri=http://localhost:9876/callback
        v
  5. User authorizes in browser
        |
        v
  6. OAuth provider redirects to localhost:9876/callback?code=XXXX
        |
        v
  7. Exchange auth code for access token
        |
        v
  8. Cache token locally (~/.ccs/cliproxy/auth/gemini.json)
        |
        v
  9. Proceed with Claude CLI
```

### OAuth Providers - Device Code Flow

**Providers**: GitHub Copilot (ghcp)

Provider identity note:
- Providers that do not expose a reliable email no longer require a manual nickname during first auth.
- CCS derives a stable internal account identifier from the token/cache context and still allows the user to rename the account later.

```
+===========================================================================+
|               OAuth - Device Code Flow (No Port Needed)                   |
+===========================================================================+

  1. User runs: ccs ghcp
        |
        v
  2. Check token cache (~/.ccs/cliproxy/auth/)
        |
        +---> [Valid token] ---> Use cached token
        |
        +---> [No/Expired token]
                    |
                    v
  3. Request device code from GitHub
        |
        v
  4. Display user code + verification URL
        |     "Enter code XXXX-XXXX at github.com/login/device"
        v
  5. User opens URL in browser and enters code
        |
        v
  6. Poll GitHub for token completion
        |
        v
  7. Receive and cache token locally
        |
        v
  8. Proceed with Claude CLI
```

### Kiro OAuth - Method-Aware Flow

**Supported methods**:
- `aws`: Device Code (default, AWS org friendly)
- `aws-authcode`: Authorization Code via CLI flow
- `google`: Social OAuth via management API
- `github`: Social OAuth via management API (Dashboard flow)

```
+===========================================================================+
|                    Kiro OAuth - Method-Aware Flow                         |
+===========================================================================+

  Configuration:
    ccs_profile:
      target: claude
      cliproxy:
        provider: kiro
        kiro_method: aws  # or aws-authcode, google, github

  Flow:
    Device Code (aws)
      → /start endpoint (no callback port)
      → Opens browser
      → User enters code
      → Poll /status

    Authorization Code (aws-authcode, google, github)
      → /start-url endpoint
      → Returns auth_url
      → User visits URL
      → Callback handled
      → Poll /status for completion

  Key behavior:
    - Device Code method uses /start route (no callback port)
    - Callback/social methods use /start-url + status polling
    - Some management flows return state first, auth_url later
    - Manual nicknames are optional when the upstream provider does not return an email
    - Account storage uses a stable internal identifier so reauth/update flows do not depend on dashboard list order
```

### API Key Profiles (GLM, Kimi)

```
+===========================================================================+
|                     API Key Profile (Non-OAuth)                          |
+===========================================================================+

  1. User configures API key in settings
        |
        v
  2. Key stored in ~/.ccs/<profile>.settings.json
        |
        v
  3. Profile detection: APIKeyProfile
        |
        v
  4. Key passed via ANTHROPIC_AUTH_TOKEN env var
        |
        v
  5. Target adapter (Claude/Droid) handles delivery
        |
        └─ Claude: env var
        └─ Droid: config file (~/.factory/settings.json)
```

### Anthropic Direct API Key

```
+===========================================================================+
|                  Anthropic Direct API Key (Native Auth)                   |
+===========================================================================+

  1. User creates profile: ccs api create --preset anthropic
        |
        v
  2. Key stored in ~/.ccs/<profile>.settings.json
        |  env: { ANTHROPIC_API_KEY: "sk-ant-..." }
        |  (NO ANTHROPIC_BASE_URL, NO ANTHROPIC_AUTH_TOKEN)
        v
  3. Profile detection: settings-based
        |
        v
  4. Key passed via ANTHROPIC_API_KEY env var
        |  Claude CLI uses native endpoint (api.anthropic.com)
        v
  5. Claude CLI authenticates with x-api-key header

  Detection logic (profile-writer.ts):
    - apiKey.startsWith('sk-ant-') -> native mode
    - baseUrl.includes('api.anthropic.com') -> native mode
    - Otherwise -> proxy mode (existing behavior)
```

---

## Image Analysis Hook Flow (v7.34)

### Overview

Image Analysis Hook enables vision model proxying through CLIProxy with automatic injection for all profile types.

```
+===========================================================================+
|                    Image Analysis Hook Flow (v7.34)                       |
+===========================================================================+

  Claude CLI with image input
        |
        v
  Hook Installer (ensureProfileHooks)
        |
        +---> Check ~/.claude/hooks/openai-vision-hook.cjs exists
        |
        +---> If missing: auto-install via image-analyzer-hook-installer
        |
        v
  Hook Configuration
        |
        +---> Set ANTHROPIC_IMAGE_HOOK_URL
        |           (proxy endpoint URL)
        |
        v
  Claude CLI processes image request
        |
        v
  Hook intercepts image request
        |
        v
  Vision Model Proxying (via CLIProxyAPI)
        |
        +---> Gemini, Codex, AGY support vision
        |
        +---> Kiro (Claude native vision)
        |
        +---> Skip for Claude Sub accounts (native vision)
        |
        v
  Vision response returned to Claude CLI
```

### Hook Environment

```typescript
// getImageAnalysisHookEnv()
{
  ANTHROPIC_IMAGE_HOOK_URL: 'http://localhost:8317/api/image-analysis',
  // or for remote proxy:
  ANTHROPIC_IMAGE_HOOK_URL: 'https://proxy.example.com:8317/api/image-analysis',
}
```

### Provider Support

| Provider | Vision Support | Notes |
|----------|---|---|
| Gemini | ✓ | Via CLIProxy image analysis |
| Codex | ✓ | Via CLIProxy image analysis |
| Antigravity | ✓ | Via CLIProxy image analysis |
| Kiro | ✓ | Native Claude vision (no proxy needed) |
| Copilot | ✗ | Not supported |
| GLM/Kimi | ✗ | Requires direct API implementation |

---

## Session Tracking

All execution paths record session metadata including target CLI used:

```typescript
{
  profileName: 'gemini',
  profileType: 'clipproxy',
  provider: 'google-gemini',
  targetCli: 'claude',        // NEW: which target was used
  timestamp: '2026-02-16T10:40:00Z',
  duration: 12345,
  exitCode: 0,
  model: 'claude-opus-4-6',
}
```

This enables analytics on target CLI usage and adoption.

---

## Related Documentation

- [System Architecture Index](./index.md) — Overall system design
- [Target Adapters](./target-adapters.md) — Multi-CLI adapter pattern
- [Codebase Summary](../codebase-summary.md) — Module structure
- [Code Standards](../code-standards.md) — Implementation guidelines
