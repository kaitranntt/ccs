/**
 * API Client
 * Phase 03: REST API Routes & CRUD
 */

import type { CLIProxyProvider } from './provider-config';
import type {
  AiProviderFamilyId,
  ListAiProvidersResult,
  UpsertAiProviderEntryInput,
} from '../../../src/cliproxy/ai-providers';
import type { ProviderEntitlementEvidence } from '../../../src/cliproxy/auth/provider-entitlement-types';
import type { BrowserRuntimeEnv } from '../../../src/utils/browser/chrome-reuse';

export const API_BASE_URL = '/api';
export const API_CONFLICT_ERROR_CODE = 'CONFLICT';
export type { ProviderEntitlementEvidence };

export class ApiConflictError extends Error {
  readonly code = API_CONFLICT_ERROR_CODE;

  constructor(message = 'Resource modified externally') {
    super(message);
    this.name = 'ApiConflictError';
  }
}

export function isApiConflictError(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === API_CONFLICT_ERROR_CODE
  );
}

export function withApiBase(path: string): string {
  if (!path) {
    return API_BASE_URL;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path === API_BASE_URL || path.startsWith(`${API_BASE_URL}/`)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const fallbackMessage = `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''})`;
  const bodyText = await response.text();
  if (!bodyText) {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(bodyText) as { error?: string; message?: string };
    if (parsed.error?.trim()) {
      return parsed.error;
    }
    if (parsed.message?.trim()) {
      return parsed.message;
    }
    return fallbackMessage;
  } catch {
    return bodyText.trim() || fallbackMessage;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(withApiBase(url), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }

  const bodyText = await res.text();
  if (!bodyText) {
    return undefined as T;
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    return bodyText as T;
  }
}

// Types
export type CliTarget = 'claude' | 'droid' | 'codex';

export interface CliproxyBridgeMetadata {
  provider: CLIProxyProvider;
  providerDisplayName: string;
  routePath: string;
  currentBaseUrl: string;
  source: 'local' | 'remote';
  usesCurrentTarget: boolean;
  usesCurrentAuthToken: boolean;
}

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

export interface Profile {
  name: string;
  settingsPath: string;
  configured: boolean;
  target?: CliTarget;
  cliproxyBridge?: CliproxyBridgeMetadata | null;
}

export type LocalRuntimeStatus = 'ready' | 'missing-model' | 'offline';

export interface LocalRuntimeReadiness {
  id: 'ollama' | 'llamacpp';
  name: string;
  endpoint: string;
  status: LocalRuntimeStatus;
  commandHint: string;
  recommendedModel: string | null;
  recommendedModelInstalled: boolean;
  detectedModelCount: number;
}

export interface LocalRuntimeReadinessResponse {
  runtimes: LocalRuntimeReadiness[];
}

export interface CreateProfile {
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
  extraModels?: string;
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
  target?: CliTarget;
}

export interface UpdateProfile {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  extraModels?: string;
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
  target?: CliTarget;
}

export interface ProfileValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  field?: string;
  hint?: string;
}

export interface ProfileValidationSummary {
  valid: boolean;
  issues: ProfileValidationIssue[];
}

export interface ApiProfileOrphanCandidate {
  name: string;
  settingsPath: string;
  validation: ProfileValidationSummary;
}

export interface DiscoverProfileOrphansResponse {
  orphans: ApiProfileOrphanCandidate[];
}

export interface RegisterProfileOrphansRequest {
  names?: string[];
  target?: CliTarget;
  force?: boolean;
}

export interface RegisterProfileOrphansResponse {
  registered: string[];
  skipped: Array<{ name: string; reason: string }>;
}

export interface CopyProfileRequest {
  destination: string;
  target?: CliTarget;
  force?: boolean;
}

export interface CopyProfileResponse {
  success: boolean;
  name?: string;
  settingsPath?: string;
  warnings?: string[];
}

export interface ApiProfileExportBundle {
  schemaVersion: 1;
  exportedAt: string;
  profile: {
    name: string;
    target: CliTarget;
  };
  settings: Record<string, unknown>;
}

export interface ExportProfileResponse {
  success: boolean;
  bundle: ApiProfileExportBundle;
  redacted?: boolean;
}

export interface ImportProfileRequest {
  bundle: ApiProfileExportBundle;
  name?: string;
  target?: CliTarget;
  force?: boolean;
}

export interface ImportProfileResponse {
  success: boolean;
  name?: string;
  warnings?: string[];
  validation?: ProfileValidationSummary;
}

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

export type RoutingStrategy = 'round-robin' | 'fill-first';

export interface CliproxyRoutingState {
  strategy: RoutingStrategy;
  source: 'live' | 'config';
  target: 'local' | 'remote';
  reachable: boolean;
  message?: string;
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
  /** Upstream HTTP status when available */
  httpStatus?: number;
  /** Stable machine-readable error code */
  errorCode?: string;
  /** Additional provider-specific detail/code from upstream */
  errorDetail?: string;
  /** True if account lacks quota access (403) */
  isForbidden?: boolean;
  /** Error message if fetch failed */
  error?: string;
  /** Provider-specific remediation guidance */
  actionHint?: string;
  /** True when the failure is temporary and retrying later may help */
  retryable?: boolean;
  /** True if token is expired and needs re-authentication */
  needsReauth?: boolean;
  /** Richer provider entitlement evidence derived from live/runtime signals */
  entitlement?: ProviderEntitlementEvidence;
}

/** Codex rate limit window */
export interface CodexQuotaWindow {
  /**
   * Window label, e.g.: "Primary", "Secondary",
   * "Code Review (Primary)", "Code Review (Secondary)",
   * or "GPT-5.3-Codex-Spark (Primary)" for additional rate limits.
   */
  label: string;
  /** Percentage used (0-100) */
  usedPercent: number;
  /** Percentage remaining (100 - usedPercent) */
  remainingPercent: number;
  /** Seconds until quota resets, null if unknown */
  resetAfterSeconds: number | null;
  /** ISO timestamp when quota resets, null if unknown */
  resetAt: string | null;
  /**
   * Window category indicating the bucket this window belongs to.
   * Optional for back-compat with cached data emitted before this field existed.
   * - 'usage'        -> standard rate_limit usage windows
   * - 'code-review'  -> code_review_rate_limit windows
   * - 'additional'   -> additional_rate_limits[] windows (e.g. GPT-5.3 Codex Spark)
   */
  category?: 'usage' | 'code-review' | 'additional';
  /** Cadence of the window: '5h' = primary, 'weekly' = secondary. Optional for legacy data. */
  cadence?: '5h' | 'weekly';
  /** Raw upstream feature label (e.g. 'GPT-5.3-Codex-Spark', 'Code Review'); absent for plain usage windows. */
  featureLabel?: string;
}

/** Core Codex usage window (5h/weekly) extracted from raw windows */
export interface CodexCoreUsageWindow {
  /** Source window label */
  label: string;
  /** Percentage remaining (0-100) */
  remainingPercent: number;
  /** Seconds until quota resets, null if unknown */
  resetAfterSeconds: number | null;
  /** ISO timestamp when quota resets, null if unknown */
  resetAt: string | null;
}

/** Core Codex usage summary with explicit 5h and weekly windows */
export interface CodexCoreUsageSummary {
  /** Short-cycle usage limit window (typically 5h) */
  fiveHour: CodexCoreUsageWindow | null;
  /** Long-cycle usage limit window (typically weekly) */
  weekly: CodexCoreUsageWindow | null;
}

/** Codex quota result */
export interface CodexQuotaResult {
  /** Whether fetch succeeded */
  success: boolean;
  /** Quota windows (primary, secondary, code review) */
  windows: CodexQuotaWindow[];
  /** Explicit core usage windows (5h + weekly) for easier reset display */
  coreUsage?: CodexCoreUsageSummary;
  /** Plan type: free, plus, pro, team, or null if unknown */
  planType: 'free' | 'plus' | 'pro' | 'team' | null;
  /** Timestamp of fetch */
  lastUpdated: number;
  /** Upstream HTTP status when available */
  httpStatus?: number;
  /** Stable machine-readable error code */
  errorCode?: string;
  /** Additional provider-specific detail/code from upstream */
  errorDetail?: string;
  /** Error message if fetch failed */
  error?: string;
  /** Account ID (email) this quota belongs to */
  accountId?: string;
  /** Provider-specific remediation guidance */
  actionHint?: string;
  /** True if token is expired and needs re-authentication */
  needsReauth?: boolean;
  /** True when the failure is temporary and retrying later may help */
  retryable?: boolean;
  /** True if result was served from cache */
  cached?: boolean;
  /** True if account lacks quota access (403) - displayed as 0% instead of error */
  isForbidden?: boolean;
}

/** Claude policy limit window */
export interface ClaudeQuotaWindow {
  /** Source identifier: five_hour, seven_day, seven_day_opus, seven_day_sonnet, overage, ... */
  rateLimitType: string;
  /** Human-friendly label for UI display */
  label: string;
  /** Upstream status: allowed, allowed_warning, rejected */
  status: string;
  /** Utilization ratio (0-1) when available */
  utilization: number | null;
  /** Utilization as percentage (0-100) */
  usedPercent: number;
  /** Remaining percentage (100 - usedPercent) */
  remainingPercent: number;
  /** Reset timestamp for this window, null if unknown */
  resetAt: string | null;
  surpassedThreshold?: boolean;
  severity?: string;
  overageStatus?: string;
  overageResetsAt?: string | null;
  overageDisabledReason?: string | null;
  isUsingOverage?: boolean;
  hasExtraUsageEnabled?: boolean;
}

/** Core Claude usage window (5h/weekly) */
export interface ClaudeCoreUsageWindow {
  rateLimitType: string;
  label: string;
  remainingPercent: number;
  resetAt: string | null;
  status: string;
}

/** Core Claude usage summary (5h + weekly) */
export interface ClaudeCoreUsageSummary {
  fiveHour: ClaudeCoreUsageWindow | null;
  weekly: ClaudeCoreUsageWindow | null;
}

/** Claude quota result */
export interface ClaudeQuotaResult {
  success: boolean;
  windows: ClaudeQuotaWindow[];
  coreUsage?: ClaudeCoreUsageSummary;
  lastUpdated: number;
  httpStatus?: number;
  errorCode?: string;
  errorDetail?: string;
  isForbidden?: boolean;
  error?: string;
  accountId?: string;
  actionHint?: string;
  needsReauth?: boolean;
  retryable?: boolean;
  /** True if result was served from cache */
  cached?: boolean;
}

/** Gemini CLI bucket (grouped by model series) */
export interface GeminiCliBucket {
  /** Unique bucket identifier (e.g., "gemini-flash-series::input") */
  id: string;
  /** Display label (e.g., "Gemini Flash Series") */
  label: string;
  /** Token type: "input", "output", or null if combined */
  tokenType: string | null;
  /** Remaining quota as fraction (0-1) */
  remainingFraction: number;
  /** Remaining quota as percentage (0-100) */
  remainingPercent: number;
  /** Remaining quota count when the upstream API provides it */
  remainingAmount?: number | null;
  /** ISO timestamp when quota resets, null if unknown */
  resetTime: string | null;
  /** Model IDs in this bucket */
  modelIds: string[];
}

/** Gemini CLI quota result */
export interface GeminiCliQuotaResult {
  /** Whether fetch succeeded */
  success: boolean;
  /** Quota buckets grouped by model series */
  buckets: GeminiCliBucket[];
  /** GCP project ID for this account */
  projectId: string | null;
  /** Human-readable Gemini tier label when available */
  tierLabel?: string | null;
  /** Stable Gemini tier identifier when available */
  tierId?: string | null;
  /** Available Google One AI credits when reported by the API */
  creditBalance?: number | null;
  /** Richer provider entitlement evidence derived from live/runtime signals */
  entitlement?: ProviderEntitlementEvidence;
  /** Timestamp of fetch */
  lastUpdated: number;
  /** Upstream HTTP status when available */
  httpStatus?: number;
  /** Stable machine-readable error code */
  errorCode?: string;
  /** Additional provider-specific detail/code from upstream */
  errorDetail?: string;
  /** True if account lacks quota access (403) */
  isForbidden?: boolean;
  /** Error message if fetch failed */
  error?: string;
  /** Account ID (email) this quota belongs to */
  accountId?: string;
  /** Provider-specific remediation guidance */
  actionHint?: string;
  /** True if token is expired and needs re-authentication */
  needsReauth?: boolean;
  /** True when the failure is temporary and retrying later may help */
  retryable?: boolean;
  /** True if result was served from cache */
  cached?: boolean;
}

/** GitHub Copilot quota snapshot */
export interface GhcpQuotaSnapshot {
  /** False when upstream omitted this quota category */
  reported?: boolean;
  /** Total quota allocation for this category */
  entitlement: number;
  /** Remaining quota count */
  remaining: number;
  /** Used quota count */
  used: number;
  /** Remaining quota percentage (0-100) */
  percentRemaining: number;
  /** Used quota percentage (0-100) */
  percentUsed: number;
  /** Whether this quota category is unlimited */
  unlimited: boolean;
  /** Overage usage count */
  overageCount: number;
  /** Whether overage is permitted */
  overagePermitted: boolean;
  /** Upstream quota identifier if available */
  quotaId: string | null;
}

/** GitHub Copilot (ghcp) quota result */
export interface GhcpQuotaResult {
  /** Whether fetch succeeded */
  success: boolean;
  /** Copilot plan type */
  planType: string | null;
  /** Quota reset date/time */
  quotaResetDate: string | null;
  snapshots: {
    premiumInteractions: GhcpQuotaSnapshot;
    chat: GhcpQuotaSnapshot;
    completions: GhcpQuotaSnapshot;
  };
  /** Timestamp of fetch */
  lastUpdated: number;
  /** Upstream HTTP status when available */
  httpStatus?: number;
  /** Stable machine-readable error code */
  errorCode?: string;
  /** Additional provider-specific detail/code from upstream */
  errorDetail?: string;
  /** True if account lacks quota access (403) */
  isForbidden?: boolean;
  /** Error message if fetch failed */
  error?: string;
  /** Account ID this quota belongs to */
  accountId?: string;
  /** Provider-specific remediation guidance */
  actionHint?: string;
  /** True if token is expired and needs re-authentication */
  needsReauth?: boolean;
  /** True when the failure is temporary and retrying later may help */
  retryable?: boolean;
  /** True if result was served from cache */
  cached?: boolean;
}

/** Provider accounts summary */
export type ProviderAccountsMap = Record<string, OAuthAccount[]>;

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
  provider?: string;
  displayName?: string;
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

// API
export const api = {
  profiles: {
    list: () => request<{ profiles: Profile[] }>('/profiles'),
    getLocalRuntimeReadiness: () =>
      request<LocalRuntimeReadinessResponse>('/profiles/local-runtime-readiness'),
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
    discoverOrphans: () => request<DiscoverProfileOrphansResponse>('/profiles/orphans'),
    registerOrphans: (data: RegisterProfileOrphansRequest) =>
      request<RegisterProfileOrphansResponse>('/profiles/orphans/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    copy: (name: string, data: CopyProfileRequest) =>
      request<CopyProfileResponse>(`/profiles/${name}/copy`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    export: (name: string, includeSecrets = false) =>
      request<ExportProfileResponse>(`/profiles/${name}/export`, {
        method: 'POST',
        body: JSON.stringify({ includeSecrets }),
      }),
    import: (data: ImportProfileRequest) =>
      request<ImportProfileResponse>('/profiles/import', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  imageAnalysis: {
    get: () => request<ImageAnalysisDashboardData>('/image-analysis'),
    update: (data: UpdateImageAnalysisSettingsPayload) =>
      request<ImageAnalysisDashboardData>('/image-analysis', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  browser: {
    get: () => request<BrowserDashboardPayload>('/browser'),
    getStatus: () => request<BrowserStatusPayload>('/browser/status'),
    update: (data: UpdateBrowserSettingsPayload) =>
      request<{ success: boolean; browser: BrowserDashboardPayload }>('/browser', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  logs: {
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
    catalog: () => request<CliproxyCatalogResponse>('/cliproxy/catalog'),
    models: () => request<CliproxyModelsResponse>('/cliproxy/models'),
    updateModel: (provider: string, model: string) =>
      request(`/cliproxy/models/${provider}`, {
        method: 'PUT',
        body: JSON.stringify({ model }),
      }),
    getRoutingStrategy: () => request<CliproxyRoutingState>('/cliproxy/routing/strategy'),
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
  },
  accounts: {
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
  },
  /** Account quota API */
  quota: {
    /** Fetch quota for a specific account */
    get: (provider: string, accountId: string) =>
      request<QuotaResult>(`/cliproxy/quota/${provider}/${encodeURIComponent(accountId)}`),
    /** Fetch Codex quota for a specific account */
    getCodex: (accountId: string) =>
      request<CodexQuotaResult>(`/cliproxy/quota/codex/${encodeURIComponent(accountId)}`),
    /** Fetch Claude quota for a specific account */
    getClaude: (accountId: string) =>
      request<ClaudeQuotaResult>(`/cliproxy/quota/claude/${encodeURIComponent(accountId)}`),
    /** Fetch Gemini CLI quota for a specific account */
    getGemini: (accountId: string) =>
      request<GeminiCliQuotaResult>(`/cliproxy/quota/gemini/${encodeURIComponent(accountId)}`),
  },
};
