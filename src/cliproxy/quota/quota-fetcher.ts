/**
 * Quota Fetcher for Antigravity Accounts
 *
 * Fetches quota information from Google Cloud Code internal API.
 * Used for displaying remaining quota percentages and reset times.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAuthDir } from '../config/config-generator';
import { CLIProxyProvider } from '../types';
import {
  getProviderAccounts,
  getPausedDir,
  setAccountTier,
  type AccountInfo,
  type AccountTier,
} from '../accounts/account-manager';
import { sanitizeEmail, isTokenExpired } from '../auth/auth-utils';
import {
  buildProviderEntitlementEvidence,
  getProviderTierLabel,
  normalizeProviderTierId,
} from '../auth/provider-entitlement-evidence';
import type { ProviderEntitlementEvidence } from '../auth/provider-entitlement-types';
import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
} from '../proxy/proxy-target-resolver';

/** Individual model quota info */
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
  /** True if token is expired and needs re-auth */
  isExpired?: boolean;
  /** True if token refresh cannot proceed and the account should be re-authenticated */
  needsReauth?: boolean;
  /** ISO timestamp when token expires/expired */
  expiresAt?: string;
  /** True if account hasn't been activated in official Antigravity app */
  isUnprovisioned?: boolean;
  /** Account ID (email) this quota belongs to */
  accountId?: string;
  /** GCP project ID for this account */
  projectId?: string;
  /** Detected account tier based on model access */
  tier?: AccountTier;
  /** Richer provider entitlement evidence derived from live/runtime signals */
  entitlement?: ProviderEntitlementEvidence;
}

/** Google Cloud Code API endpoints */
const ANTIGRAVITY_DAILY_API_BASE = 'https://daily-cloudcode-pa.googleapis.com';
const ANTIGRAVITY_API_BASE = 'https://cloudcode-pa.googleapis.com';
const ANTIGRAVITY_API_VERSION = 'v1internal';
const ANTIGRAVITY_LOADCODEASSIST_BASE_URLS = [
  ANTIGRAVITY_DAILY_API_BASE,
  ANTIGRAVITY_API_BASE,
] as const;
const MANAGEMENT_API_TIMEOUT_MS = 5000;

/** Headers for loadCodeAssist (matches current CLIProxyAPIPlus control-plane requests) */
const LOADCODEASSIST_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'antigravity/1.21.9 darwin/arm64 google-api-nodejs-client/10.3.0',
  'X-Goog-Api-Client': 'gl-node/22.21.1',
};

/** Headers for fetchAvailableModels (matches CLIProxyAPI antigravity_executor.go) */
const FETCHMODELS_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'antigravity/1.104.0 darwin/arm64',
};

/** Auth file structure */
interface AntigravityAuthFile {
  access_token: string;
  refresh_token?: string;
  email?: string;
  expired?: string;
  expires_in?: number;
  timestamp?: number;
  type?: string;
  project_id?: string;
}

/** Auth data returned from file */
interface AuthData {
  accessToken: string;
  refreshToken: string | null;
  projectId: string | null;
  isExpired: boolean;
  expiresAt: string | null;
}

/** Tier info from loadCodeAssist */
interface TierInfo {
  id?: string;
  isDefault?: boolean;
}

/** loadCodeAssist response */
interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id?: string };
  /** Current tier (may be trial/temporary) */
  currentTier?: TierInfo;
  /** Paid tier (reflects actual subscription - takes priority) */
  paidTier?: TierInfo;
  /** Array of allowed tiers - use isDefault=true to find active tier (CLIProxyAPIPlus approach) */
  allowedTiers?: TierInfo[];
}

/** fetchAvailableModels response model */
interface AvailableModel {
  name?: string;
  displayName?: string;
  quotaInfo?: {
    remainingFraction?: number;
    remaining_fraction?: number;
    remaining?: number;
    resetTime?: string;
    reset_time?: string;
  };
  quota_info?: {
    remainingFraction?: number;
    remaining_fraction?: number;
    remaining?: number;
    resetTime?: string;
    reset_time?: string;
  };
}

/** fetchAvailableModels response */
interface FetchAvailableModelsResponse {
  models?: Record<string, AvailableModel>;
}

interface ManagementAuthFile {
  auth_index?: string | number;
  provider?: string;
  type?: string;
  email?: string;
  name?: string;
}

interface ManagementApiCallResponse {
  status_code?: number;
  body?: string;
}

interface ManagedResponse {
  status: number;
  bodyText: string;
  json: unknown;
  viaManagement: boolean;
}

interface ProjectLookupResult {
  projectId: string | null;
  tier?: AccountTier;
  rawTierId?: string | null;
  rawTierLabel?: string | null;
  entitlement?: ProviderEntitlementEvidence;
  error?: string;
  errorCode?: string;
  errorDetail?: string;
  actionHint?: string;
  retryable?: boolean;
  httpStatus?: number;
  needsReauth?: boolean;
  isUnprovisioned?: boolean;
}

function safeParseJson(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

function normalizeErrorDetail(bodyText: string): string | undefined {
  const normalized = bodyText.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= 400) {
    return normalized;
  }
  return `${normalized.slice(0, 397)}...`;
}

function buildAntigravityFailure(
  status: number | undefined,
  bodyText?: string
): Pick<
  QuotaResult,
  | 'error'
  | 'errorCode'
  | 'errorDetail'
  | 'actionHint'
  | 'retryable'
  | 'httpStatus'
  | 'needsReauth'
  | 'entitlement'
> & { isForbidden?: boolean } {
  const detail = normalizeErrorDetail(bodyText || '');

  if (status === 401) {
    return {
      httpStatus: 401,
      error: 'Token expired or invalid',
      errorCode: 'reauth_required',
      actionHint:
        'Re-authenticate this account. If CLIProxy is running, retry after the proxy finishes refreshing the token.',
      needsReauth: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'medium',
        accessState: 'unknown',
        capacityState: 'unknown',
      }),
    };
  }

  if (status === 403) {
    return {
      httpStatus: 403,
      error: 'Access forbidden',
      errorCode: 'quota_api_forbidden',
      actionHint: 'This account does not have Gemini Code Assist quota access.',
      isForbidden: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'medium',
        accessState: 'not_entitled',
        capacityState: 'unknown',
      }),
    };
  }

  if (status === 429) {
    return {
      httpStatus: 429,
      error: 'Rate limited - try again later',
      errorCode: 'rate_limited',
      actionHint: 'Retry later. This looks temporary.',
      retryable: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'rate_limited',
      }),
    };
  }

  if (status === 408) {
    return {
      httpStatus: 408,
      error: 'Request timeout',
      errorCode: 'network_timeout',
      actionHint: 'Retry later. This looks temporary.',
      retryable: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'temporarily_unavailable',
      }),
    };
  }

  if (typeof status === 'number' && status >= 500) {
    return {
      httpStatus: status,
      error: `API error: ${status}`,
      errorCode: 'provider_unavailable',
      actionHint: 'Retry later. The provider appears unavailable.',
      retryable: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'temporarily_unavailable',
      }),
    };
  }

  if (typeof status === 'number' && status >= 400) {
    return {
      httpStatus: status,
      error: `API error: ${status}`,
      errorCode: 'quota_request_failed',
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'unknown',
      }),
    };
  }

  return {
    error: 'Quota request failed',
    errorCode: 'quota_request_failed',
    errorDetail: detail,
    entitlement: buildProviderEntitlementEvidence({
      normalizedTier: 'unknown',
      source: 'runtime_inference',
      confidence: 'low',
      accessState: 'unknown',
      capacityState: 'unknown',
    }),
  };
}

function mergeAntigravityTierEvidence(
  entitlement: ProviderEntitlementEvidence | undefined,
  tier: AccountTier,
  rawTierId: string | null,
  rawTierLabel: string | null
): ProviderEntitlementEvidence | undefined {
  if (tier === 'unknown' && !entitlement) {
    return undefined;
  }

  return buildProviderEntitlementEvidence({
    normalizedTier: tier,
    rawTierId,
    rawTierLabel,
    source: rawTierId ? 'runtime_api' : (entitlement?.source ?? 'runtime_inference'),
    confidence: rawTierId ? 'high' : (entitlement?.confidence ?? 'medium'),
    accessState: entitlement?.accessState ?? 'unknown',
    capacityState: entitlement?.capacityState ?? 'unknown',
    notes: entitlement?.notes ?? null,
  });
}

async function readManagedResponse(
  response: Response,
  viaManagement: boolean
): Promise<ManagedResponse> {
  const bodyText = await response.text();
  return {
    status: response.status,
    bodyText,
    json: safeParseJson(bodyText),
    viaManagement,
  };
}

function isAntigravityAuthFileForAccount(file: ManagementAuthFile, accountId: string): boolean {
  const provider = (file.provider || file.type || '').trim().toLowerCase();
  if (provider !== 'antigravity' && provider !== 'agy') {
    return false;
  }

  const normalizedAccount = accountId.trim().toLowerCase();
  const normalizedEmail = file.email?.trim().toLowerCase();
  if (normalizedEmail && normalizedEmail === normalizedAccount) {
    return true;
  }

  const normalizedName = file.name?.trim().toLowerCase();
  if (!normalizedName) {
    return false;
  }

  const sanitizedAccount = sanitizeEmail(accountId).toLowerCase();
  return (
    normalizedName === `antigravity-${sanitizedAccount}.json` ||
    normalizedName === `agy-${sanitizedAccount}.json`
  );
}

async function findManagedAntigravityAuthIndex(accountId: string): Promise<string | number | null> {
  const target = getProxyTarget();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MANAGEMENT_API_TIMEOUT_MS);

  try {
    const response = await fetch(buildProxyUrl(target, '/v0/management/auth-files'), {
      signal: controller.signal,
      headers: buildManagementHeaders(target),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { files?: ManagementAuthFile[] };
    const match = data.files?.find((file) => isAntigravityAuthFileForAccount(file, accountId));
    return match?.auth_index ?? null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function performManagedAntigravityRequest(
  accountId: string,
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<ManagedResponse | null> {
  const authIndex = await findManagedAntigravityAuthIndex(accountId);
  if (authIndex === null || authIndex === undefined) {
    return null;
  }

  const target = getProxyTarget();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MANAGEMENT_API_TIMEOUT_MS);

  try {
    const response = await fetch(buildProxyUrl(target, '/v0/management/api-call'), {
      method: 'POST',
      signal: controller.signal,
      headers: buildManagementHeaders(target, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        auth_index: authIndex,
        method: 'POST',
        url,
        header: {
          ...headers,
          Authorization: 'Bearer $TOKEN$',
        },
        data: body,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const apiResponse = (await response.json()) as ManagementApiCallResponse;
    const bodyText = typeof apiResponse.body === 'string' ? apiResponse.body : '';
    return {
      status: typeof apiResponse.status_code === 'number' ? apiResponse.status_code : 500,
      bodyText,
      json: safeParseJson(bodyText),
      viaManagement: true,
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function performAntigravityRequest(
  accountId: string,
  accessToken: string,
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<ManagedResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MANAGEMENT_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ...headers,
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    });
    clearTimeout(timeoutId);

    const directResult = await readManagedResponse(response, false);
    if (directResult.status !== 401) {
      return directResult;
    }

    const managedResult = await performManagedAntigravityRequest(accountId, url, headers, body);
    return managedResult ?? directResult;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        status: 408,
        bodyText: '',
        json: null,
        viaManagement: false,
      };
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 503,
      bodyText: message,
      json: null,
      viaManagement: false,
    };
  }
}

async function performAntigravityRequestWithBaseUrlFallback(
  accountId: string,
  accessToken: string,
  baseUrls: readonly string[],
  apiPath: string,
  headers: Record<string, string>,
  body: string
): Promise<ManagedResponse> {
  let lastResponse: ManagedResponse | null = null;

  for (const baseUrl of baseUrls) {
    const response = await performAntigravityRequest(
      accountId,
      accessToken,
      `${baseUrl}/${apiPath}`,
      headers,
      body
    );
    if (response.status >= 200 && response.status < 300) {
      return response;
    }
    lastResponse = response;
  }

  return (
    lastResponse ?? {
      status: 503,
      bodyText: 'No Antigravity API endpoint available',
      json: null,
      viaManagement: false,
    }
  );
}

/**
 * Read auth data from auth file (access token, project_id, expiry status)
 */
function readAuthData(provider: CLIProxyProvider, accountId: string): AuthData | null {
  // Check both active and paused auth directories (quota needed for paused accounts too)
  const authDirs = [getAuthDir(), getPausedDir()];

  // Sanitize accountId (email) to match auth file naming: @ and . → _
  const sanitizedId = sanitizeEmail(accountId);
  const prefix = provider === 'agy' ? 'antigravity-' : `${provider}-`;
  const expectedFile = `${prefix}${sanitizedId}.json`;

  for (const authDir of authDirs) {
    if (!fs.existsSync(authDir)) continue;

    const filePath = path.join(authDir, expectedFile);

    // Direct file access (most common case)
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as AntigravityAuthFile;
        if (!data.access_token) continue;
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || null,
          projectId: data.project_id || null,
          isExpired: isTokenExpired(data.expired),
          expiresAt: data.expired || null,
        };
      } catch {
        continue;
      }
    }

    // Fallback: scan directory for matching email in file content
    const files = fs.readdirSync(authDir);
    for (const file of files) {
      if (file.startsWith(prefix) && file.endsWith('.json')) {
        const candidatePath = path.join(authDir, file);
        try {
          const content = fs.readFileSync(candidatePath, 'utf-8');
          const data = JSON.parse(content) as AntigravityAuthFile;
          // Match by email field inside the auth file
          if (data.email === accountId && data.access_token) {
            return {
              accessToken: data.access_token,
              refreshToken: data.refresh_token || null,
              projectId: data.project_id || null,
              isExpired: isTokenExpired(data.expired),
              expiresAt: data.expired || null,
            };
          }
        } catch {
          continue;
        }
      }
    }
  }

  return null;
}

/**
 * Map tier ID string to AccountTier type
 * API returns: "g1-ultra-tier", "g1-pro-tier", "standard-tier", etc.
 * Priority: ultra > pro > free
 */
/**
 * Get project ID and tier via loadCodeAssist endpoint
 * Uses paidTier.id for accurate tier detection (g1-ultra-tier, g1-pro-tier)
 */
async function getProjectId(accountId: string, accessToken: string): Promise<ProjectLookupResult> {
  const body = JSON.stringify({
    metadata: {
      ide_name: 'antigravity',
      ide_type: 'ANTIGRAVITY',
      ide_version: '1.21.9',
    },
  });
  const response = await performAntigravityRequestWithBaseUrlFallback(
    accountId,
    accessToken,
    ANTIGRAVITY_LOADCODEASSIST_BASE_URLS,
    `${ANTIGRAVITY_API_VERSION}:loadCodeAssist`,
    LOADCODEASSIST_HEADERS,
    body
  );

  if (response.status < 200 || response.status >= 300) {
    return {
      projectId: null,
      ...buildAntigravityFailure(response.status, response.bodyText),
    };
  }

  const data = response.json as LoadCodeAssistResponse | null;
  if (!data) {
    return {
      projectId: null,
      error: 'Invalid quota response from provider',
      errorCode: 'provider_unavailable',
      retryable: true,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'temporarily_unavailable',
        notes: 'Provider returned a 2xx response with an empty or invalid project payload.',
      }),
    };
  }

  // Extract project ID from response
  let projectId: string | undefined;
  if (typeof data.cloudaicompanionProject === 'string') {
    projectId = data.cloudaicompanionProject;
  } else if (typeof data.cloudaicompanionProject === 'object') {
    projectId = data.cloudaicompanionProject?.id;
  }

  if (!projectId?.trim()) {
    return {
      projectId: null,
      error: 'Sign in to Antigravity app to activate quota.',
      errorCode: 'account_unprovisioned',
      actionHint: 'Complete sign-in in the Antigravity app, then retry quota refresh.',
      isUnprovisioned: true,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'medium',
        accessState: 'unknown',
        capacityState: 'unknown',
        notes: 'Project provisioning is incomplete for this account.',
      }),
    };
  }

  // Extract tier - paidTier reflects actual subscription status, takes priority
  const rawTierId = (data.paidTier?.id || data.currentTier?.id || '').trim() || null;
  const tier = normalizeProviderTierId(rawTierId);

  return {
    projectId: projectId.trim(),
    tier,
    rawTierId,
    rawTierLabel: getProviderTierLabel(rawTierId),
  };
}

/**
 * Fetch available models with quota info
 * Note: projectId is kept for potential future use but not sent in body
 * (CLIProxyAPI sends empty {} body for this endpoint)
 */
async function fetchAvailableModels(
  accountId: string,
  accessToken: string,
  _projectId: string
): Promise<QuotaResult> {
  const url = `${ANTIGRAVITY_API_BASE}/${ANTIGRAVITY_API_VERSION}:fetchAvailableModels`;
  const response = await performAntigravityRequest(
    accountId,
    accessToken,
    url,
    FETCHMODELS_HEADERS,
    JSON.stringify({})
  );

  if (response.status < 200 || response.status >= 300) {
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      ...buildAntigravityFailure(response.status, response.bodyText),
    };
  }

  const data = response.json as FetchAvailableModelsResponse | null;
  if (!data) {
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error: 'Invalid quota response from provider',
      errorCode: 'provider_unavailable',
      retryable: true,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'temporarily_unavailable',
        notes: 'Provider returned a 2xx response with an empty or invalid quota payload.',
      }),
    };
  }

  const models: ModelQuota[] = [];

  if (data.models && typeof data.models === 'object') {
    for (const [modelId, modelData] of Object.entries(data.models)) {
      const quotaInfo = modelData.quotaInfo || modelData.quota_info;
      if (!quotaInfo) continue;

      const remaining =
        quotaInfo.remainingFraction ?? quotaInfo.remaining_fraction ?? quotaInfo.remaining;
      const resetTime = quotaInfo.resetTime || quotaInfo.reset_time || null;

      let percentage: number;
      if (typeof remaining === 'number' && isFinite(remaining)) {
        percentage = Math.max(0, Math.min(100, Math.round(remaining * 100)));
      } else if (resetTime) {
        percentage = 0;
      } else {
        continue;
      }

      models.push({
        name: modelId,
        displayName: modelData.displayName,
        percentage,
        resetTime,
      });
    }
  }

  return {
    success: true,
    models,
    lastUpdated: Date.now(),
  };
}

/**
 * Fetch quota for an Antigravity account
 *
 * @param provider - Provider name (only 'agy' supported)
 * @param accountId - Account identifier (email)
 * @param verbose - Show detailed diagnostics
 * @returns Quota result with models and percentages
 */
export async function fetchAccountQuota(
  provider: CLIProxyProvider,
  accountId: string,
  verbose = false
): Promise<QuotaResult> {
  if (verbose) console.error(`[i] Fetching quota for ${accountId}...`);

  // Only Antigravity supports quota fetching
  if (provider !== 'agy') {
    const error = `Quota not supported for provider: ${provider}`;
    if (verbose) console.error(`[!] Error: ${error}`);
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error,
    };
  }

  // Read auth data from auth file (checks both active and paused directories)
  const authData = readAuthData(provider, accountId);
  if (!authData) {
    const error = 'Auth file not found for account';
    if (verbose) console.error(`[!] Error: ${error}`);
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error,
      errorCode: 'auth_file_missing',
      actionHint: 'Reconnect this account so CCS can read a current auth token.',
    };
  }

  const accessToken = authData.accessToken;
  if (verbose) {
    const expiryState = authData.isExpired
      ? 'expired'
      : authData.expiresAt
        ? `expires ${authData.expiresAt}`
        : 'expiry unknown';
    console.error(`[i] Auth token state: ${expiryState}`);
  }

  // Get project ID and tier - prefer stored project ID, but always call API for tier
  let projectId = authData.projectId;
  let apiTier: AccountTier = 'unknown';
  let rawTierId: string | null = null;
  let rawTierLabel: string | null = null;

  // Always call loadCodeAssist to get accurate tier from API.
  // If the file token is stale, the helper retries through CLIProxy management auth.
  const lastProjectResult = await getProjectId(accountId, accessToken);

  if (!lastProjectResult.projectId && !projectId) {
    const error = lastProjectResult.error || 'Failed to retrieve project ID';
    if (verbose) console.error(`[!] Error: ${error}`);
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error,
      errorCode: lastProjectResult.errorCode,
      errorDetail: lastProjectResult.errorDetail,
      actionHint: lastProjectResult.actionHint,
      retryable: lastProjectResult.retryable,
      httpStatus: lastProjectResult.httpStatus,
      needsReauth: lastProjectResult.needsReauth,
      isUnprovisioned: lastProjectResult.isUnprovisioned,
      entitlement: lastProjectResult.entitlement,
      isExpired: authData.isExpired,
      expiresAt: authData.expiresAt || undefined,
    };
  }

  // Use API project ID if available, else fallback to stored
  projectId = lastProjectResult.projectId || projectId;
  apiTier = lastProjectResult.tier || 'unknown';
  rawTierId = lastProjectResult.rawTierId || null;
  rawTierLabel = lastProjectResult.rawTierLabel || null;

  if (verbose) console.error(`[i] Project ID: ${projectId || 'not found'}`);

  // Fetch models with quota
  const result = await fetchAvailableModels(accountId, accessToken, projectId as string);

  if (verbose) console.error(`[i] Models found: ${result.models.length}`);
  result.accountId = accountId;
  result.projectId = projectId || undefined;

  // Determine tier from API response only
  if (result.success) {
    const finalTier = apiTier !== 'unknown' ? apiTier : 'unknown';
    result.tier = finalTier;
    result.entitlement = buildProviderEntitlementEvidence({
      normalizedTier: finalTier,
      rawTierId,
      rawTierLabel,
      source: rawTierId ? 'runtime_api' : 'runtime_inference',
      confidence: rawTierId ? 'high' : 'medium',
      accessState: 'entitled',
      capacityState: 'available',
    });
    if (finalTier !== 'unknown') {
      setAccountTier(provider, accountId, finalTier);
    }
  } else {
    result.isExpired = authData.isExpired;
    result.expiresAt = authData.expiresAt || undefined;
    result.entitlement = mergeAntigravityTierEvidence(
      result.entitlement,
      apiTier,
      rawTierId,
      rawTierLabel
    );
  }

  if (verbose && result.error) {
    console.log(`[!] Error: ${result.error}`);
  }

  return result;
}

/**
 * Read project ID directly from auth file without making API call
 * Used for quick project ID comparison in doctor command
 */
export function readProjectIdFromAuthFile(
  provider: CLIProxyProvider,
  accountId: string
): string | null {
  const authData = readAuthData(provider, accountId);
  return authData?.projectId || null;
}

/** Result for all accounts of a provider */
export interface AllAccountsQuotaResult {
  /** Provider name */
  provider: CLIProxyProvider;
  /** Results per account */
  accounts: Array<{
    account: AccountInfo;
    quota: QuotaResult;
  }>;
  /** Accounts grouped by project ID (for detecting shared projects) */
  projectGroups: Record<string, string[]>;
  /** Timestamp of fetch */
  lastUpdated: number;
}

/**
 * Fetch quota for all accounts of a provider
 * Also detects accounts sharing same GCP project (failover won't help)
 *
 * @param provider - Provider name (only 'agy' supported for quota)
 * @param verbose - Show detailed diagnostics
 * @returns Results for all accounts with project grouping
 */
export async function fetchAllProviderQuotas(
  provider: CLIProxyProvider,
  verbose = false
): Promise<AllAccountsQuotaResult> {
  const accounts = getProviderAccounts(provider);
  const results: AllAccountsQuotaResult = {
    provider,
    accounts: [],
    projectGroups: {},
    lastUpdated: Date.now(),
  };

  if (accounts.length === 0) {
    return results;
  }

  // Fetch quota for each account in parallel
  const quotaPromises = accounts.map(async (account) => {
    const quota = await fetchAccountQuota(provider, account.id, verbose);

    // Read project ID from auth file if not in quota result
    let projectId = quota.projectId;
    if (!projectId) {
      projectId = readProjectIdFromAuthFile(provider, account.id) || undefined;
    }

    return {
      account,
      quota: { ...quota, accountId: account.id, projectId },
    };
  });

  const quotaResults = await Promise.all(quotaPromises);

  // Build project groups for detecting shared projects
  for (const { account, quota } of quotaResults) {
    results.accounts.push({ account, quota });

    if (quota.projectId) {
      if (!results.projectGroups[quota.projectId]) {
        results.projectGroups[quota.projectId] = [];
      }
      results.projectGroups[quota.projectId].push(account.id);
    }
  }

  return results;
}

export const __testExports = {
  buildAntigravityFailure,
};

/**
 * Find available account with remaining quota
 * Used by preflight check for auto-switching
 *
 * @param provider - Provider name
 * @param excludeAccountId - Account to exclude (current exhausted account)
 * @param verbose - Show detailed diagnostics
 * @returns Account with available quota, or null if none available
 */
export async function findAvailableAccount(
  provider: CLIProxyProvider,
  excludeAccountId?: string,
  verbose = false
): Promise<{ account: AccountInfo; quota: QuotaResult } | null> {
  const allQuotas = await fetchAllProviderQuotas(provider, verbose);

  // Get excluded account's project ID to avoid switching to same-project accounts
  const excludedProjectId = allQuotas.accounts.find((a) => a.account.id === excludeAccountId)?.quota
    .projectId;

  for (const { account, quota } of allQuotas.accounts) {
    // Skip excluded account
    if (excludeAccountId && account.id === excludeAccountId) {
      continue;
    }

    // Skip failed quota fetches
    if (!quota.success) {
      continue;
    }

    // Skip accounts sharing same GCP project (quota is pooled)
    if (excludedProjectId && quota.projectId === excludedProjectId) {
      continue;
    }

    // Check if any model has remaining quota (> 5% to avoid edge cases)
    const hasQuota = quota.models.some((m) => m.percentage > 5);
    if (hasQuota) {
      return { account, quota };
    }
  }

  return null;
}
