import type { BrowserRuntimeEnv } from '../../../../src/utils/browser/chrome-reuse';
import { request, type CliTarget } from './core';

export interface ImageAnalysisStatus {
  enabled: boolean;
  supported: boolean;
  status: 'active' | 'mapped' | 'attention' | 'disabled' | 'skipped' | 'hook-missing';
  backendId: string | null;
  backendDisplayName: string | null;
  model: string | null;
  resolutionSource:
    | 'cliproxy-provider'
    | 'cliproxy-variant'
    | 'cliproxy-composite'
    | 'copilot-alias'
    | 'cliproxy-bridge'
    | 'profile-backend'
    | 'fallback-backend'
    | 'native-compatible'
    | 'disabled'
    | 'unsupported-profile'
    | 'unresolved'
    | 'missing-model';
  reason: string | null;
  shouldPersistHook: boolean;
  persistencePath: string | null;
  runtimePath: string | null;
  usesCurrentTarget: boolean | null;
  usesCurrentAuthToken: boolean | null;
  hookInstalled: boolean | null;
  sharedHookInstalled: boolean | null;
  authReadiness: 'not-needed' | 'ready' | 'missing' | 'unknown';
  authProvider: string | null;
  authDisplayName: string | null;
  authReason: string | null;
  proxyReadiness: 'not-needed' | 'ready' | 'remote' | 'stopped' | 'unavailable' | 'unknown';
  proxyReason: string | null;
  effectiveRuntimeMode: 'cliproxy-image-analysis' | 'native-read';
  effectiveRuntimeReason: string | null;
  profileModel: string | null;
  nativeReadPreference: boolean;
  nativeImageCapable: boolean | null;
  nativeImageReason: string | null;
}

export interface ImageAnalysisSettingsConfig {
  enabled: boolean;
  timeout: number;
  providerModels: Record<string, string>;
  fallbackBackend: string | null;
  profileBackends: Record<string, string>;
}

export interface ImageAnalysisDashboardSummary {
  state: 'ready' | 'partial' | 'needs_setup' | 'disabled';
  title: string;
  detail: string;
  backendCount: number;
  mappedProfileCount: number;
  activeProfileCount: number;
  bypassedProfileCount: number;
  nativeProfileCount: number;
}

export interface ImageAnalysisDashboardBackend {
  backendId: string;
  displayName: string;
  model: string;
  state: 'ready' | 'starts_on_launch' | 'needs_auth' | 'needs_proxy' | 'review';
  authReadiness: ImageAnalysisStatus['authReadiness'];
  authReason: string | null;
  proxyReadiness: ImageAnalysisStatus['proxyReadiness'];
  proxyReason: string | null;
  profilesUsing: number;
}

export interface ImageAnalysisDashboardProfile {
  name: string;
  kind: 'profile' | 'variant';
  target: CliTarget;
  configured: boolean;
  settingsPath: string | null;
  backendId: string | null;
  backendDisplayName: string | null;
  resolutionSource: ImageAnalysisStatus['resolutionSource'];
  status: ImageAnalysisStatus['status'];
  effectiveRuntimeMode: ImageAnalysisStatus['effectiveRuntimeMode'];
  effectiveRuntimeReason: string | null;
  currentTargetMode:
    | 'active'
    | 'bypassed'
    | 'fallback'
    | 'setup'
    | 'disabled'
    | 'native'
    | 'unresolved';
  profileModel: string | null;
  nativeReadPreference: boolean;
  nativeImageCapable: boolean | null;
  nativeImageReason: string | null;
}

export interface ImageAnalysisDashboardCatalog {
  knownBackends: string[];
  profileNames: string[];
}

export interface ImageAnalysisDashboardData {
  config: ImageAnalysisSettingsConfig;
  summary: ImageAnalysisDashboardSummary;
  backends: ImageAnalysisDashboardBackend[];
  profiles: ImageAnalysisDashboardProfile[];
  catalog: ImageAnalysisDashboardCatalog;
}

export interface UpdateImageAnalysisSettingsPayload {
  enabled?: boolean;
  timeout?: number;
  providerModels?: Record<string, string | null>;
  fallbackBackend?: string | null;
  profileBackends?: Record<string, string>;
}

export type BrowserToolPolicy = 'auto' | 'manual';
export type BrowserEvalMode = 'disabled' | 'readonly' | 'readwrite';

export interface BrowserSettingsConfig {
  claude: {
    enabled: boolean;
    policy: BrowserToolPolicy;
    userDataDir: string;
    devtoolsPort: number;
    evalMode: BrowserEvalMode;
  };
  codex: {
    enabled: boolean;
    policy: BrowserToolPolicy;
    evalMode: BrowserEvalMode;
  };
}

export interface BrowserLaunchCommands {
  darwin: string;
  linux: string;
  win32: string;
}

export interface ClaudeBrowserStatus {
  enabled: boolean;
  policy: BrowserToolPolicy;
  source: 'config' | 'CCS_BROWSER_USER_DATA_DIR' | 'CCS_BROWSER_PROFILE_DIR';
  overrideActive: boolean;
  state: 'disabled' | 'path_missing' | 'browser_not_running' | 'endpoint_unreachable' | 'ready';
  title: string;
  detail: string;
  nextStep: string;
  effectiveUserDataDir: string;
  recommendedUserDataDir: string;
  devtoolsPort: number;
  evalMode: BrowserEvalMode;
  managedMcpServerName: string;
  managedMcpServerPath: string;
  launchCommands: BrowserLaunchCommands;
  runtimeEnv?: BrowserRuntimeEnv;
}

export interface CodexBrowserStatus {
  enabled: boolean;
  policy: BrowserToolPolicy;
  state: 'disabled' | 'enabled' | 'unsupported_build';
  title: string;
  detail: string;
  nextStep: string;
  serverName: string;
  evalMode: BrowserEvalMode;
  supportsConfigOverrides: boolean;
  binaryPath: string | null;
  version?: string;
}

export interface BrowserStatusPayload {
  claude: ClaudeBrowserStatus;
  codex: CodexBrowserStatus;
}

export interface BrowserDashboardPayload {
  config: BrowserSettingsConfig;
  status: BrowserStatusPayload;
}

export interface UpdateBrowserSettingsPayload {
  claude?: Partial<BrowserSettingsConfig['claude']>;
  codex?: Partial<BrowserSettingsConfig['codex']>;
}

export interface Account {
  name: string;
  type?: string;
  created: string;
  last_used?: string | null;
  context_mode?: 'isolated' | 'shared';
  context_group?: string;
  continuity_mode?: 'standard' | 'deeper';
  context_inferred?: boolean;
  continuity_inferred?: boolean;
  shared_resource_mode?: 'shared' | 'profile-local';
  shared_resource_inferred?: boolean;
  provider?: string;
  displayName?: string;
}

export interface UpdateAccountSharedResources {
  shared_resource_mode: 'shared' | 'profile-local';
}

export interface PlainCcsLane {
  kind: 'native' | 'account-default' | 'account-inherited' | 'profile-default' | 'ambient';
  label: string;
  account_name?: string | null;
  profile_name?: string | null;
  project_count: number;
}

export interface UpdateAccountContext {
  context_mode: 'isolated' | 'shared';
  context_group?: string;
  continuity_mode?: 'standard' | 'deeper';
}

export type LogsLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogsConfig {
  enabled: boolean;
  level: LogsLevel;
  rotate_mb: number;
  retain_days: number;
  redact: boolean;
  live_buffer_size: number;
}

export interface LogsSource {
  source: string;
  label: string;
  kind: 'native' | 'legacy';
  count: number;
  lastTimestamp: string | null;
}

export interface LogsEntry {
  id: string;
  timestamp: string;
  level: LogsLevel;
  source: string;
  event: string;
  message: string;
  processId: number | null;
  runId: string | null;
  context?: unknown;
  // Structured-log fields from #1141 contract. All optional; UI ships first,
  // backend fills these incrementally. Order is stable and additive.
  requestId?: string;
  module?: string;
  stage?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  error?: { message: string; stack?: string; code?: string };
}

export interface LogsEntriesParams {
  source?: string;
  level?: LogsLevel;
  search?: string;
  limit?: number;
}

export type UpdateLogsConfigPayload = Partial<LogsConfig>;

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

export const imageAnalysisApi = {
  get: () => request<ImageAnalysisDashboardData>('/image-analysis'),
  update: (data: UpdateImageAnalysisSettingsPayload) =>
    request<ImageAnalysisDashboardData>('/image-analysis', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

export const browserApi = {
  get: () => request<BrowserDashboardPayload>('/browser'),
  getStatus: () => request<BrowserStatusPayload>('/browser/status'),
  update: (data: UpdateBrowserSettingsPayload) =>
    request<{ success: boolean; browser: BrowserDashboardPayload }>('/browser', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

export const logsApi = {
  getConfig: () => request<{ logging: LogsConfig }>('/logs/config'),
  updateConfig: (data: UpdateLogsConfigPayload) =>
    request<{ success: boolean; logging: LogsConfig }>('/logs/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getSources: () => request<{ sources: LogsSource[] }>('/logs/sources'),
  getEntries: ({ source, level, search, limit }: LogsEntriesParams = {}) => {
    const params = new URLSearchParams();

    if (source) {
      params.set('source', source);
    }

    if (level) {
      params.set('level', level);
    }

    if (search) {
      params.set('search', search);
    }

    if (typeof limit === 'number') {
      params.set('limit', String(limit));
    }

    const query = params.toString();
    return request<{ entries: LogsEntry[] }>(`/logs/entries${query ? `?${query}` : ''}`);
  },
};

export const accountsApi = {
  list: () =>
    request<{ accounts: Account[]; default: string | null; plain_ccs_lane?: PlainCcsLane }>(
      '/accounts'
    ),
  setDefault: (name: string) =>
    request('/accounts/default', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  resetDefault: () => request('/accounts/reset-default', { method: 'DELETE' }),
  delete: (name: string) => request(`/accounts/${name}`, { method: 'DELETE' }),
  updateContext: (name: string, data: UpdateAccountContext) =>
    request(`/accounts/${encodeURIComponent(name)}/context`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  updateSharedResources: (name: string, data: UpdateAccountSharedResources) =>
    request(`/accounts/${encodeURIComponent(name)}/shared-resources`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// Unified config API
export const configApi = {
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
};
