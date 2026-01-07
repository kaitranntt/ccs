import type {
  RouterProfileSummary,
  RouterProfile,
  CreateRouterProfile,
  UpdateRouterProfile,
  RouterProvider,
  ProfileTestResult,
} from './router-types';

/**
 * API Client
 * Phase 03: REST API Routes & CRUD
 */

const BASE_URL = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || res.statusText);
  }

  return res.json();
}

// Types
export interface Profile {
  name: string;
  settingsPath: string;
  configured: boolean;
}

export interface CreateProfile {
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
}

export interface UpdateProfile {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
}

export interface Variant {
  name: string;
  provider: 'gemini' | 'codex' | 'agy' | 'qwen' | 'iflow' | 'kiro' | 'ghcp';
  settings: string;
  account?: string;
  port?: number;
  model?: string;
}

export interface CreateVariant {
  name: string;
  provider: 'gemini' | 'codex' | 'agy' | 'qwen' | 'iflow' | 'kiro' | 'ghcp';
  model?: string;
  account?: string;
}

export interface UpdateVariant {
  provider?: 'gemini' | 'codex' | 'agy' | 'qwen' | 'iflow' | 'kiro' | 'ghcp';
  model?: string;
  account?: string;
}

/** OAuth account info for multi-account support */
export interface OAuthAccount {
  id: string;
  email?: string;
  nickname?: string;
  provider: 'gemini' | 'codex' | 'agy' | 'qwen' | 'iflow' | 'kiro' | 'ghcp';
  isDefault: boolean;
  tokenFile: string;
  createdAt: string;
  lastUsedAt?: string;
  /** Whether account is paused (skipped in quota rotation) */
  paused?: boolean;
  /** ISO timestamp when account was paused */
  pausedAt?: string;
  /** Account tier: free or paid (Pro/Ultra combined) */
  tier?: 'free' | 'paid' | 'unknown';
}

export interface AuthStatus {
  provider: string;
  displayName: string;
  authenticated: boolean;
  lastAuth: string | null;
  tokenFiles: number;
  accounts: OAuthAccount[];
  defaultAccount?: string;
}

/** Auth file info for Config tab */
export interface AuthFile {
  name: string;
  provider?: string;
}

/** CLIProxy model from /v1/models endpoint */
export interface CliproxyModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/** Categorized models response from CLIProxyAPI */
export interface CliproxyModelsResponse {
  models: CliproxyModel[];
  byCategory: Record<string, CliproxyModel[]>;
  totalCount: number;
}

/** Individual model quota info from Google Cloud Code API */
export interface ModelQuota {
  /** Model name, e.g., "gemini-3-pro-high" */
  name: string;
  /** Display name from API, e.g., "Gemini 3 Pro" */
  displayName?: string;
  /** Remaining quota as percentage (0-100) */
  percentage: number;
  /** ISO timestamp when quota resets, null if unknown */
  resetTime: string | null;
}

/** Quota fetch result */
export interface QuotaResult {
  /** Whether fetch succeeded */
  success: boolean;
  /** Quota for each available model */
  models: ModelQuota[];
  /** Timestamp of fetch */
  lastUpdated: number;
  /** True if account lacks quota access (403) */
  isForbidden?: boolean;
  /** Error message if fetch failed */
  error?: string;
}

/** Provider accounts summary */
export type ProviderAccountsMap = Record<string, OAuthAccount[]>;

export interface Account {
  name: string;
  type?: string;
  created: string;
  last_used?: string | null;
}

// Unified config types
export interface ConfigFormat {
  format: 'yaml' | 'json' | 'none';
  migrationNeeded: boolean;
  backups: string[];
}

export interface MigrationResult {
  success: boolean;
  backupPath?: string;
  error?: string;
  migratedFiles: string[];
  warnings: string[];
}

/** Model preset for quick model switching */
export interface ModelPreset {
  name: string;
  default: string;
  opus: string;
  sonnet: string;
  haiku: string;
}

export interface CreatePreset {
  name: string;
  default: string;
  opus?: string;
  sonnet?: string;
  haiku?: string;
}

/** Remote proxy status from health check */
export interface RemoteProxyStatus {
  reachable: boolean;
  latencyMs?: number;
  error?: string;
  errorCode?: 'CONNECTION_REFUSED' | 'TIMEOUT' | 'AUTH_FAILED' | 'UNKNOWN';
}

/** Remote proxy configuration */
export interface ProxyRemoteConfig {
  enabled: boolean;
  host: string;
  /** Port is optional - uses protocol default (443 for HTTPS, 80 for HTTP) */
  port?: number;
  protocol: 'http' | 'https';
  auth_token: string;
  /** Management key for /v0/management/* endpoints (optional, falls back to auth_token) */
  management_key?: string;
}

/** Fallback configuration */
export interface ProxyFallbackConfig {
  enabled: boolean;
  auto_start: boolean;
}

/** Local proxy configuration */
export interface ProxyLocalConfig {
  port: number;
  auto_start: boolean;
}

/** CLIProxy server configuration */
export interface CliproxyServerConfig {
  remote: ProxyRemoteConfig;
  fallback: ProxyFallbackConfig;
  local: ProxyLocalConfig;
}

/** CLIProxy process status from session tracker */
export interface ProxyProcessStatus {
  running: boolean;
  port?: number;
  pid?: number;
  sessionCount?: number;
  startedAt?: string;
}

/** Error log file metadata from CLIProxyAPI */
export interface CliproxyErrorLog {
  /** Filename (e.g., "error-v1-chat-completions-2025-01-15T10-30-00.log") */
  name: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp (Unix seconds) */
  modified: number;
}

/** Result from starting proxy service */
export interface ProxyStartResult {
  started: boolean;
  alreadyRunning: boolean;
  port: number;
  configRegenerated?: boolean;
  error?: string;
}

/** Result from stopping proxy service */
export interface ProxyStopResult {
  stopped: boolean;
  pid?: number;
  sessionCount?: number;
  error?: string;
}

/** Result from checking for CLIProxyAPI updates */
export interface CliproxyUpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  fromCache: boolean;
  checkedAt: number; // Unix timestamp of last check
  isStable: boolean; // Whether current version is at or below max stable
  maxStableVersion: string; // Maximum stable version (e.g., "6.6.80")
  stabilityMessage?: string; // Warning message if running unstable version
}

/** Available versions list from GitHub releases */
export interface CliproxyVersionsResponse {
  versions: string[];
  latestStable: string;
  latest: string;
  currentVersion: string;
  maxStableVersion: string;
  fromCache: boolean;
  checkedAt: number;
}

/** Result from installing a specific version */
export interface CliproxyInstallResult {
  success: boolean;
  version?: string;
  isUnstable?: boolean;
  requiresConfirmation?: boolean;
  message?: string;
  error?: string;
}

/** Result from restarting the proxy */
export interface CliproxyRestartResult {
  success: boolean;
  port?: number;
  error?: string;
}

// API
export const api = {
  profiles: {
    list: () => request<{ profiles: Profile[] }>('/profiles'),
    create: (data: CreateProfile) =>
      request('/profiles', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (name: string, data: UpdateProfile) =>
      request(`/profiles/${name}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (name: string) => request(`/profiles/${name}`, { method: 'DELETE' }),
  },
  cliproxy: {
    list: () => request<{ variants: Variant[] }>('/cliproxy'),
    getAuthStatus: () =>
      request<{ authStatus: AuthStatus[]; source?: 'remote' | 'local'; error?: string }>(
        '/cliproxy/auth'
      ),
    create: (data: CreateVariant) =>
      request('/cliproxy', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (name: string, data: UpdateVariant) =>
      request(`/cliproxy/${name}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (name: string) => request(`/cliproxy/${name}`, { method: 'DELETE' }),

    // Proxy process status and control
    proxyStatus: () => request<ProxyProcessStatus>('/cliproxy/proxy-status'),
    proxyStart: () => request<ProxyStartResult>('/cliproxy/proxy-start', { method: 'POST' }),
    proxyStop: () => request<ProxyStopResult>('/cliproxy/proxy-stop', { method: 'POST' }),
    updateCheck: () => request<CliproxyUpdateCheckResult>('/cliproxy/update-check'),

    // Version management
    versions: () => request<CliproxyVersionsResponse>('/cliproxy/versions'),
    install: (version: string, force?: boolean) =>
      request<CliproxyInstallResult>('/cliproxy/install', {
        method: 'POST',
        body: JSON.stringify({ version, force }),
      }),
    restart: () => request<CliproxyRestartResult>('/cliproxy/restart', { method: 'POST' }),

    // Stats and models for Overview tab
    stats: () => request<{ usage: Record<string, unknown> }>('/cliproxy/usage'),
    models: () => request<CliproxyModelsResponse>('/cliproxy/models'),
    updateModel: (provider: string, model: string) =>
      request(`/cliproxy/models/${provider}`, {
        method: 'PUT',
        body: JSON.stringify({ model }),
      }),

    // Config YAML for Config tab
    getConfigYaml: async (): Promise<string> => {
      const res = await fetch(`${BASE_URL}/cliproxy/config.yaml`);
      if (!res.ok) throw new Error('Failed to load config');
      return res.text();
    },
    saveConfigYaml: async (content: string): Promise<void> => {
      const res = await fetch(`${BASE_URL}/cliproxy/config.yaml`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/yaml' },
        body: content,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to save config' }));
        throw new Error(error.error || 'Failed to save config');
      }
    },

    // Auth files for Config tab
    getAuthFiles: () => request<{ files: AuthFile[] }>('/cliproxy/auth-files'),
    getAuthFile: async (name: string): Promise<string> => {
      const res = await fetch(
        `${BASE_URL}/cliproxy/auth-files/download?name=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error('Failed to load auth file');
      return res.text();
    },

    // Multi-account management
    accounts: {
      list: () => request<{ accounts: ProviderAccountsMap }>('/cliproxy/auth/accounts'),
      listByProvider: (provider: string) =>
        request<{ provider: string; accounts: OAuthAccount[] }>(
          `/cliproxy/auth/accounts/${provider}`
        ),
      setDefault: (provider: string, accountId: string) =>
        request(`/cliproxy/auth/accounts/${provider}/default`, {
          method: 'POST',
          body: JSON.stringify({ accountId }),
        }),
      remove: (provider: string, accountId: string) =>
        request(`/cliproxy/auth/accounts/${provider}/${accountId}`, { method: 'DELETE' }),
      pause: (provider: string, accountId: string) =>
        request<{ provider: string; accountId: string; paused: boolean }>(
          `/cliproxy/auth/accounts/${provider}/${accountId}/pause`,
          { method: 'POST' }
        ),
      resume: (provider: string, accountId: string) =>
        request<{ provider: string; accountId: string; paused: boolean }>(
          `/cliproxy/auth/accounts/${provider}/${accountId}/resume`,
          { method: 'POST' }
        ),
    },
    // OAuth flow
    auth: {
      /** Start OAuth flow - opens browser for authentication */
      start: (provider: string, nickname?: string) =>
        request<{ success: boolean; account: OAuthAccount }>(`/cliproxy/auth/${provider}/start`, {
          method: 'POST',
          body: JSON.stringify({ nickname }),
        }),
      /** Cancel in-progress OAuth flow */
      cancel: (provider: string) =>
        request<{ success: boolean; cancelled: number; provider: string }>(
          `/cliproxy/auth/${provider}/cancel`,
          { method: 'POST' }
        ),
      /** Import Kiro token from Kiro IDE (Kiro only) */
      kiroImport: () =>
        request<{ success: boolean; account: OAuthAccount | null; error?: string }>(
          '/cliproxy/auth/kiro/import',
          { method: 'POST' }
        ),
    },
    // Error logs
    errorLogs: {
      /** List error log files */
      list: () => request<{ files: CliproxyErrorLog[] }>('/cliproxy/error-logs'),
      /** Get content of a specific error log */
      getContent: async (name: string): Promise<string> => {
        const res = await fetch(`${BASE_URL}/cliproxy/error-logs/${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error('Failed to load error log');
        return res.text();
      },
    },
  },
  accounts: {
    list: () => request<{ accounts: Account[]; default: string | null }>('/accounts'),
    setDefault: (name: string) =>
      request('/accounts/default', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    resetDefault: () => request('/accounts/reset-default', { method: 'DELETE' }),
    delete: (name: string) => request(`/accounts/${name}`, { method: 'DELETE' }),
  },
  // Unified config API
  config: {
    format: () => request<ConfigFormat>('/config/format'),
    get: () => request<Record<string, unknown>>('/config'),
    update: (config: Record<string, unknown>) =>
      request<{ success: boolean }>('/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      }),
    migrate: (dryRun = false) =>
      request<MigrationResult>(`/config/migrate?dryRun=${dryRun}`, { method: 'POST' }),
    rollback: (backupPath: string) =>
      request<{ success: boolean }>('/config/rollback', {
        method: 'POST',
        body: JSON.stringify({ backupPath }),
      }),
  },
  /** Model presets for quick model switching */
  presets: {
    list: (profile: string) => request<{ presets: ModelPreset[] }>(`/settings/${profile}/presets`),
    create: (profile: string, data: CreatePreset) =>
      request<{ preset: ModelPreset }>(`/settings/${profile}/presets`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (profile: string, name: string) =>
      request<{ success: boolean }>(`/settings/${profile}/presets/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
  },
  /** CLIProxy server configuration API */
  cliproxyServer: {
    /** Get cliproxy server configuration */
    get: () => request<CliproxyServerConfig>('/cliproxy-server'),
    /** Update cliproxy server configuration */
    update: (config: Partial<CliproxyServerConfig>) =>
      request<CliproxyServerConfig>('/cliproxy-server', {
        method: 'PUT',
        body: JSON.stringify(config),
      }),
    /** Test remote proxy connection */
    test: (params: {
      host: string;
      /** Port is optional - uses protocol default (443 for HTTPS, 80 for HTTP) */
      port?: number;
      protocol: 'http' | 'https';
      authToken?: string;
      allowSelfSigned?: boolean;
    }) =>
      request<RemoteProxyStatus>('/cliproxy-server/test', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  },
  /** Account quota API */
  quota: {
    /** Fetch quota for a specific account */
    get: (provider: string, accountId: string) =>
      request<QuotaResult>(`/cliproxy/quota/${provider}/${encodeURIComponent(accountId)}`),
  },
  /** Router profile management API */
  router: {
    profiles: {
      list: () => request<{ profiles: RouterProfileSummary[] }>('/router/profiles'),
      get: (name: string) => request<RouterProfile>(`/router/profiles/${encodeURIComponent(name)}`),
      create: (data: CreateRouterProfile) =>
        request<{ success: boolean; name: string }>('/router/profiles', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (name: string, data: UpdateRouterProfile) =>
        request<{ success: boolean }>(`/router/profiles/${encodeURIComponent(name)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      delete: (name: string) =>
        request<{ success: boolean }>(`/router/profiles/${encodeURIComponent(name)}`, {
          method: 'DELETE',
        }),
      test: (name: string) =>
        request<ProfileTestResult>(`/router/profiles/${encodeURIComponent(name)}/test`, {
          method: 'POST',
        }),
      /** Get router profile settings (generated or customized) */
      getSettings: (name: string) =>
        request<{
          profile: string;
          settings: { env: Record<string, string> };
          mtime?: number;
          path: string;
          generated: boolean;
        }>(`/router/profiles/${encodeURIComponent(name)}/settings`),
      /** Update router profile settings */
      updateSettings: (
        name: string,
        settings: { env: Record<string, string> },
        expectedMtime?: number
      ) =>
        request<{ success: boolean; mtime: number; path: string; created: boolean }>(
          `/router/profiles/${encodeURIComponent(name)}/settings`,
          {
            method: 'PUT',
            body: JSON.stringify({ settings, expectedMtime }),
          }
        ),
      /** Regenerate settings from profile (overwrites customizations) */
      regenerateSettings: (name: string) =>
        request<{
          success: boolean;
          settings: { env: Record<string, string> };
          mtime: number;
          path: string;
        }>(`/router/profiles/${encodeURIComponent(name)}/settings/regenerate`, {
          method: 'POST',
        }),
    },
    providers: {
      list: () => request<{ providers: RouterProvider[] }>('/router/providers'),
    },
  },
};
