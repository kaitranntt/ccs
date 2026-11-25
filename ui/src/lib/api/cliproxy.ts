import type { CLIProxyProvider } from '../provider-config';
import type {
  AiProviderFamilyId,
  ListAiProvidersResult,
  UpsertAiProviderEntryInput,
} from '../../../../src/cliproxy/ai-providers';
import type { ClaudePoolPolicyStatus } from '@shared/claude-pool-policy';
import { request, withApiBase, type CliTarget } from './core';

export interface Variant {
  name: string;
  provider: CLIProxyProvider;
  settings: string;
  account?: string;
  port?: number;
  model?: string;
  target?: CliTarget;
  type?: 'composite';
  default_tier?: 'opus' | 'sonnet' | 'haiku';
  tiers?: {
    opus: { provider: string; model: string; account?: string; thinking?: string };
    sonnet: { provider: string; model: string; account?: string; thinking?: string };
    haiku: { provider: string; model: string; account?: string; thinking?: string };
  };
}

export interface CreateVariant {
  name: string;
  provider: CLIProxyProvider;
  model?: string;
  account?: string;
  target?: CliTarget;
  type?: 'composite';
  default_tier?: 'opus' | 'sonnet' | 'haiku';
  tiers?: {
    opus: { provider: string; model: string; account?: string; thinking?: string };
    sonnet: { provider: string; model: string; account?: string; thinking?: string };
    haiku: { provider: string; model: string; account?: string; thinking?: string };
  };
}

export interface UpdateVariant {
  provider?: CLIProxyProvider;
  model?: string;
  account?: string;
  target?: CliTarget;
  type?: 'composite';
  default_tier?: 'opus' | 'sonnet' | 'haiku';
  tiers?: {
    opus: { provider: string; model: string; account?: string; thinking?: string };
    sonnet: { provider: string; model: string; account?: string; thinking?: string };
    haiku: { provider: string; model: string; account?: string; thinking?: string };
  };
}

/** OAuth account info for multi-account support */
export interface OAuthAccount {
  id: string;
  email?: string;
  nickname?: string;
  provider: CLIProxyProvider;
  isDefault: boolean;
  tokenFile: string;
  createdAt: string;
  lastUsedAt?: string;
  /** Whether account is paused (skipped in quota rotation) */
  paused?: boolean;
  /** ISO timestamp when account was paused */
  pausedAt?: string;
  /** Account tier: free, pro, ultra, or unknown */
  tier?: 'free' | 'pro' | 'ultra' | 'unknown';
  /** GCP Project ID (Antigravity only) - read-only */
  projectId?: string;
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

/** Provider accounts summary */
export type ProviderAccountsMap = Record<string, OAuthAccount[]>;

export type RoutingStrategy = 'round-robin' | 'fill-first';

export interface CliproxyPoolRoutingState {
  enabled: boolean;
  maxRetryCredentials?: number;
  /**
   * Whether the pool flag reflects the actual proxy. For a remote proxy target
   * the pool flag is local-only and may not be applied to the remote, so the
   * backend sets this to false. Undefined is treated as manageable (local).
   */
  manageable?: boolean;
  /** Explanation surfaced when manageable is false (remote target). */
  message?: string;
}

export interface CliproxyRoutingState {
  strategy: RoutingStrategy;
  source: 'live' | 'config';
  target: 'local' | 'remote';
  reachable: boolean;
  message?: string;
  /** Pool routing mode (proxy-wide). */
  poolRouting?: CliproxyPoolRoutingState;
}

export interface CliproxyRoutingApplyResult extends CliproxyRoutingState {
  applied: 'live' | 'live-and-config' | 'config-only';
}

export interface CliproxySessionAffinityState {
  enabled?: boolean;
  ttl?: string;
  source: 'config' | 'unsupported';
  target: 'local' | 'remote';
  reachable: boolean;
  manageable: boolean;
  message?: string;
}

export interface CliproxySessionAffinityApplyResult extends CliproxySessionAffinityState {
  applied: 'config-and-live' | 'config-only' | 'unsupported';
}

export interface CliproxyRetryValues {
  request_retry: number;
  max_retry_interval: number;
}

export interface CliproxyRetryState extends CliproxyRetryValues {
  source: 'live' | 'config';
  target: 'local' | 'remote';
  reachable: boolean;
  manageable: boolean;
  message?: string;
}

export interface CliproxyRetryApplyResult extends CliproxyRetryState {
  applied: 'live' | 'live-and-config' | 'config-only';
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

export interface CliproxyCatalogPresetMapping {
  default: string;
  opus: string;
  sonnet: string;
  haiku: string;
}

export interface CliproxyCatalogModel {
  id: string;
  name: string;
  tier?: 'free' | 'paid';
  description?: string;
  broken?: boolean;
  issueUrl?: string;
  deprecated?: boolean;
  deprecationReason?: string;
  extendedContext?: boolean;
  presetMapping?: CliproxyCatalogPresetMapping;
}

export interface CliproxyModelRoutingHint {
  modelId: string;
  modelName: string;
  prefix: string;
  pinnedModelId: string;
  recommendedModelId: string;
  pinnedAvailable: boolean;
  unprefixedStatus: 'safe' | 'shadowed' | 'prefix-only';
  effectiveProvider: string | null;
  effectiveDisplayName: string | null;
  effectiveOwnedBy: string | null;
  summary: string;
}

export interface CliproxyProviderRoutingHints {
  provider: string;
  displayName: string;
  prefix: string;
  safeCount: number;
  shadowedCount: number;
  prefixOnlyCount: number;
  models: CliproxyModelRoutingHint[];
}

export interface CliproxyProviderCatalog {
  provider: string;
  displayName: string;
  models: CliproxyCatalogModel[];
  defaultModel: string;
}

export interface CliproxyCatalogResponse {
  catalogs: Partial<Record<string, CliproxyProviderCatalog>>;
  routing?: Partial<Record<string, CliproxyProviderRoutingHints>>;
  source: 'live' | 'cache' | 'static';
  cache: {
    synced: boolean;
    age: string | null;
  };
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
  // Backend info
  backend: 'original' | 'plus';
  backendLabel: string;
  // Stability fields
  isStable: boolean; // Whether current version is at or below max stable
  maxStableVersion: string; // Maximum stable version (e.g., "6.6.80")
  stabilityMessage?: string; // Warning message if running unstable version
}

/** Backend and management panel repository selected for local CLIProxy */
export interface CliproxyBackendConfig {
  backend: 'original' | 'plus';
  managementPanelRepository: string;
}

/** Available versions list from GitHub releases */
export interface CliproxyVersionsResponse {
  versions: string[];
  latestStable: string;
  latest: string;
  currentVersion: string;
  maxStableVersion: string;
  faultyRange?: {
    min: string;
    max: string;
  };
  fromCache: boolean;
  checkedAt: number;
}

/** Result from installing a specific version */
export interface CliproxyInstallResult {
  success: boolean;
  version?: string;
  restarted?: boolean;
  port?: number;
  isFaulty?: boolean;
  isExperimental?: boolean;
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

export const cliproxyApi = {
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
  catalog: () => request<CliproxyCatalogResponse>('/cliproxy/catalog'),
  models: () => request<CliproxyModelsResponse>('/cliproxy/models'),
  updateModel: (provider: string, model: string) =>
    request(`/cliproxy/models/${provider}`, {
      method: 'PUT',
      body: JSON.stringify({ model }),
    }),
  getRoutingStrategy: () => request<CliproxyRoutingState>('/cliproxy/routing/strategy'),
  getClaudePoolPolicy: () => request<ClaudePoolPolicyStatus>('/cliproxy/routing/claude-quota'),
  updateClaudePoolPolicy: (enabled: boolean) =>
    request<ClaudePoolPolicyStatus>('/cliproxy/routing/claude-quota', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
  updateRoutingStrategy: (strategy: RoutingStrategy) =>
    request<CliproxyRoutingApplyResult>('/cliproxy/routing/strategy', {
      method: 'PUT',
      body: JSON.stringify({ value: strategy }),
    }),
  getSessionAffinity: () =>
    request<CliproxySessionAffinityState>('/cliproxy/routing/session-affinity'),
  updateSessionAffinity: (data: { enabled: boolean; ttl?: string }) =>
    request<CliproxySessionAffinityApplyResult>('/cliproxy/routing/session-affinity', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getRetrySettings: () => request<CliproxyRetryState>('/cliproxy/retry'),
  updateRetrySettings: (data: CliproxyRetryValues) =>
    request<CliproxyRetryApplyResult>('/cliproxy/retry', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  aiProviders: {
    list: () => request<ListAiProvidersResult>('/cliproxy/ai-providers'),
    create: (family: AiProviderFamilyId, data: UpsertAiProviderEntryInput) =>
      request(`/cliproxy/ai-providers/${encodeURIComponent(family)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (family: AiProviderFamilyId, entryId: string, data: UpsertAiProviderEntryInput) =>
      request(
        `/cliproxy/ai-providers/${encodeURIComponent(family)}/${encodeURIComponent(entryId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        }
      ),
    delete: (family: AiProviderFamilyId, entryId: string) =>
      request(
        `/cliproxy/ai-providers/${encodeURIComponent(family)}/${encodeURIComponent(entryId)}`,
        {
          method: 'DELETE',
        }
      ),
  },

  // Config YAML for Config tab
  getConfigYaml: async (): Promise<string> => {
    const res = await fetch(withApiBase('/cliproxy/config.yaml'));
    if (!res.ok) throw new Error('Failed to load config');
    return res.text();
  },
  saveConfigYaml: async (content: string): Promise<void> => {
    const res = await fetch(withApiBase('/cliproxy/config.yaml'), {
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
      withApiBase(`/cliproxy/auth-files/download?name=${encodeURIComponent(name)}`)
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
      request(`/cliproxy/auth/accounts/${provider}/${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
      }),
    pause: (provider: string, accountId: string) =>
      request<{ provider: string; accountId: string; paused: boolean }>(
        `/cliproxy/auth/accounts/${provider}/${encodeURIComponent(accountId)}/pause`,
        { method: 'POST' }
      ),
    resume: (provider: string, accountId: string) =>
      request<{ provider: string; accountId: string; paused: boolean }>(
        `/cliproxy/auth/accounts/${provider}/${encodeURIComponent(accountId)}/resume`,
        { method: 'POST' }
      ),
    /** Solo mode: activate one account, pause all others */
    solo: (provider: string, accountId: string) =>
      request<{ activated: string; paused: string[] }>('/accounts/solo', {
        method: 'POST',
        body: JSON.stringify({ provider, accountId }),
      }),
    /** Bulk pause multiple accounts */
    bulkPause: (provider: string, accountIds: string[]) =>
      request<{ succeeded: string[]; failed: Array<{ id: string; reason: string }> }>(
        '/accounts/bulk-pause',
        {
          method: 'POST',
          body: JSON.stringify({ provider, accountIds }),
        }
      ),
    /** Bulk resume multiple accounts */
    bulkResume: (provider: string, accountIds: string[]) =>
      request<{ succeeded: string[]; failed: Array<{ id: string; reason: string }> }>(
        '/accounts/bulk-resume',
        {
          method: 'POST',
          body: JSON.stringify({ provider, accountIds }),
        }
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
      const res = await fetch(withApiBase(`/cliproxy/error-logs/${encodeURIComponent(name)}`));
      if (!res.ok) throw new Error('Failed to load error log');
      return res.text();
    },
  },
};

/** CLIProxy server configuration API */
export const cliproxyServerApi = {
  /** Get cliproxy server configuration */
  get: () => request<CliproxyServerConfig>('/cliproxy-server'),
  /** Update cliproxy server configuration */
  update: (config: Partial<CliproxyServerConfig>) =>
    request<CliproxyServerConfig>('/cliproxy-server', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  /** Get backend setting */
  getBackend: () => request<CliproxyBackendConfig>('/cliproxy-server/backend'),
  /** Update backend setting */
  updateBackend: (backend: 'original' | 'plus', force = false) =>
    request<CliproxyBackendConfig>('/cliproxy-server/backend', {
      method: 'PUT',
      body: JSON.stringify({ backend, force }),
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
};
