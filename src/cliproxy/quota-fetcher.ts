/**
 * Quota Fetcher for Antigravity Accounts
 *
 * Fetches quota information from Google Cloud Code internal API.
 * Used for displaying remaining quota percentages and reset times.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAuthDir } from './config-generator';
import { CLIProxyProvider } from './types';
import {
  getProviderAccounts,
  setAccountTier,
  type AccountInfo,
  type AccountTier,
} from './account-manager';

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
  /** True if account lacks quota access (403) */
  isForbidden?: boolean;
  /** Error message if fetch failed */
  error?: string;
  /** True if token is expired and needs re-auth */
  isExpired?: boolean;
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
}

/** Google Cloud Code API endpoints */
const ANTIGRAVITY_API_BASE = 'https://cloudcode-pa.googleapis.com';
const ANTIGRAVITY_API_VERSION = 'v1internal';

/** Google OAuth token endpoint */
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Antigravity OAuth credentials (from CLIProxyAPIPlus - public in open-source code) */
const ANTIGRAVITY_CLIENT_ID =
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const ANTIGRAVITY_CLIENT_SECRET = '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';

/** Headers for loadCodeAssist (matches CLIProxyAPI antigravity.go) */
const LOADCODEASSIST_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'google-api-nodejs-client/9.15.1',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata':
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
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

/** Token refresh response */
interface TokenRefreshResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
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

/**
 * Sanitize email to match CLIProxyAPI auth file naming convention
 * Replaces @ and . with underscores (matches Go sanitizeAntigravityFileName)
 */
function sanitizeEmail(email: string): string {
  return email.replace(/@/g, '_').replace(/\./g, '_');
}

/**
 * Check if token is expired based on the expired timestamp
 */
function isTokenExpired(expiredStr?: string): boolean {
  if (!expiredStr) return false;
  try {
    const expiredDate = new Date(expiredStr);
    return expiredDate.getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * Refresh access token using refresh_token via Google OAuth
 * This allows CCS to get fresh tokens independently of CLIProxyAPI
 */
async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string | null; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
      }).toString(),
    });

    clearTimeout(timeoutId);

    const data = (await response.json()) as TokenRefreshResponse;

    if (!response.ok || data.error) {
      return {
        accessToken: null,
        error: data.error_description || data.error || `OAuth error: ${response.status}`,
      };
    }

    if (!data.access_token) {
      return { accessToken: null, error: 'No access_token in response' };
    }

    return { accessToken: data.access_token };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return { accessToken: null, error: 'Token refresh timeout' };
    }
    return { accessToken: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Read auth data from auth file (access token, project_id, expiry status)
 */
function readAuthData(provider: CLIProxyProvider, accountId: string): AuthData | null {
  const authDir = getAuthDir();

  // Check if auth directory exists
  if (!fs.existsSync(authDir)) {
    return null;
  }

  // Sanitize accountId (email) to match auth file naming: @ and . → _
  const sanitizedId = sanitizeEmail(accountId);
  const prefix = provider === 'agy' ? 'antigravity-' : `${provider}-`;
  const expectedFile = `${prefix}${sanitizedId}.json`;
  const filePath = path.join(authDir, expectedFile);

  // Direct file access (most common case)
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as AntigravityAuthFile;
      if (!data.access_token) return null;
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        projectId: data.project_id || null,
        isExpired: isTokenExpired(data.expired),
        expiresAt: data.expired || null,
      };
    } catch {
      return null;
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

  return null;
}

/**
 * Map tier ID string to AccountTier type
 * Simplified: anything with 'pro' or 'ultra' = paid, 'free'/'legacy' = free
 */
function mapTierString(tierStr: string | undefined): AccountTier {
  if (!tierStr) return 'unknown';
  const normalized = tierStr.toLowerCase();
  if (normalized.includes('ultra') || normalized.includes('pro')) return 'paid';
  if (normalized.includes('free') || normalized.includes('legacy')) {
    return 'free';
  }
  // "standard-tier" and other unknown values should NOT map to 'free'
  // Let inferTierFromModels handle the detection
  return 'unknown';
}

/**
 * Infer tier from model access patterns.
 * - Paid: Has access to Claude models OR premium Gemini models
 * - Free: Only basic models
 *
 * Claude models are Ultra-exclusive, premium Gemini indicates Pro/Ultra.
 * Both are "paid" tier for our purposes.
 */
function inferTierFromModels(models: ModelQuota[]): AccountTier {
  if (models.length === 0) return 'unknown';

  // Check for Claude models (Ultra-exclusive) or premium Gemini (Pro/Ultra)
  const hasPaidAccess = models.some((m) => {
    const name = m.name.toLowerCase();
    return (
      name.includes('claude') ||
      name.includes('gemini-3-pro') ||
      name.includes('gemini-2.5-pro') ||
      name.includes('gemini-pro-high')
    );
  });

  return hasPaidAccess ? 'paid' : 'unknown';
}

/**
 * Get project ID and tier via loadCodeAssist endpoint
 * Uses allowedTiers array with isDefault=true (CLIProxyAPIPlus approach)
 */
async function getProjectId(accessToken: string): Promise<{
  projectId: string | null;
  tier?: AccountTier;
  error?: string;
  isUnprovisioned?: boolean;
}> {
  const url = `${ANTIGRAVITY_API_BASE}/${ANTIGRAVITY_API_VERSION}:loadCodeAssist`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ...LOADCODEASSIST_HEADERS,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        metadata: {
          ideType: 'IDE_UNSPECIFIED',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI',
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Return specific error based on status
      if (response.status === 401) {
        return { projectId: null, error: 'Token expired or invalid' };
      }
      if (response.status === 403) {
        return { projectId: null, error: 'Access forbidden' };
      }
      return { projectId: null, error: `API error: ${response.status}` };
    }

    const data = (await response.json()) as LoadCodeAssistResponse;

    // Extract project ID from response
    let projectId: string | undefined;
    if (typeof data.cloudaicompanionProject === 'string') {
      projectId = data.cloudaicompanionProject;
    } else if (typeof data.cloudaicompanionProject === 'object') {
      projectId = data.cloudaicompanionProject?.id;
    }

    if (!projectId?.trim()) {
      // Account authenticated but not provisioned - user needs to sign in via Antigravity app
      return {
        projectId: null,
        error: 'Sign in to Antigravity app to activate quota.',
        isUnprovisioned: true,
      };
    }

    // Extract tier using CLIProxyAPIPlus approach:
    // 1. Find tier with isDefault=true in allowedTiers array
    // 2. Fallback to paidTier > currentTier
    let tierStr: string | undefined;
    if (data.allowedTiers && Array.isArray(data.allowedTiers)) {
      const defaultTier = data.allowedTiers.find((t) => t.isDefault);
      tierStr = defaultTier?.id;
    }
    if (!tierStr) {
      tierStr = data.paidTier?.id || data.currentTier?.id;
    }
    const tier = mapTierString(tierStr);

    return { projectId: projectId.trim(), tier };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return { projectId: null, error: 'Request timeout' };
    }
    return { projectId: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Fetch available models with quota info
 * Note: projectId is kept for potential future use but not sent in body
 * (CLIProxyAPI sends empty {} body for this endpoint)
 */
async function fetchAvailableModels(accessToken: string, _projectId: string): Promise<QuotaResult> {
  const url = `${ANTIGRAVITY_API_BASE}/${ANTIGRAVITY_API_VERSION}:fetchAvailableModels`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    // Match CLIProxyAPI exactly: empty body, minimal headers
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ...FETCHMODELS_HEADERS,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });

    clearTimeout(timeoutId);

    if (response.status === 403) {
      return {
        success: false,
        models: [],
        lastUpdated: Date.now(),
        isForbidden: true,
        error: 'Quota access forbidden for this account',
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        models: [],
        lastUpdated: Date.now(),
        error: 'Access token expired or invalid',
      };
    }

    if (!response.ok) {
      return {
        success: false,
        models: [],
        lastUpdated: Date.now(),
        error: `API error: ${response.status}`,
      };
    }

    const data = (await response.json()) as FetchAvailableModelsResponse;
    const models: ModelQuota[] = [];

    if (data.models && typeof data.models === 'object') {
      for (const [modelId, modelData] of Object.entries(data.models)) {
        const quotaInfo = modelData.quotaInfo || modelData.quota_info;
        if (!quotaInfo) continue;

        // Extract remaining fraction (0-1 range)
        const remaining =
          quotaInfo.remainingFraction ?? quotaInfo.remaining_fraction ?? quotaInfo.remaining;

        // Skip invalid values (NaN, Infinity, non-numbers)
        if (typeof remaining !== 'number' || !isFinite(remaining)) continue;

        // Convert to percentage (0-100) and clamp to valid range
        const percentage = Math.max(0, Math.min(100, Math.round(remaining * 100)));

        // Extract reset time
        const resetTime = quotaInfo.resetTime || quotaInfo.reset_time || null;

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
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Fetch quota for an Antigravity account
 *
 * @param provider - Provider name (only 'agy' supported)
 * @param accountId - Account identifier (email)
 * @returns Quota result with models and percentages
 */
export async function fetchAccountQuota(
  provider: CLIProxyProvider,
  accountId: string
): Promise<QuotaResult> {
  // Only Antigravity supports quota fetching
  if (provider !== 'agy') {
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error: `Quota not supported for provider: ${provider}`,
    };
  }

  // Read auth data from auth file
  const authData = readAuthData(provider, accountId);
  if (!authData) {
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error: 'Auth file not found for account',
    };
  }

  // Determine which access token to use
  // File-based token is often stale (CLIProxyAPIPlus refreshes at runtime but doesn't persist)
  // Proactive refresh: refresh 5 minutes before expiry (matches CLIProxyAPIPlus behavior)
  let accessToken = authData.accessToken;
  const REFRESH_LEAD_TIME_MS = 5 * 60 * 1000; // 5 minutes

  if (authData.refreshToken) {
    const shouldRefresh =
      authData.isExpired || // Already expired
      !authData.expiresAt || // No expiry info - refresh to be safe
      new Date(authData.expiresAt).getTime() - Date.now() < REFRESH_LEAD_TIME_MS; // Expiring soon

    if (shouldRefresh) {
      const refreshResult = await refreshAccessToken(authData.refreshToken);
      if (refreshResult.accessToken) {
        accessToken = refreshResult.accessToken;
      }
      // If refresh fails, fall back to existing token (might still work)
    }
  }

  // Get project ID and tier - prefer stored project ID, but always call API for tier
  let projectId = authData.projectId;
  let apiTier: AccountTier = 'unknown';

  // Always call loadCodeAssist to get accurate tier from API
  let lastProjectResult = await getProjectId(accessToken);

  if (!lastProjectResult.projectId && !projectId) {
    // If project ID fetch fails, it might be token issue - try refresh if we haven't
    if (authData.refreshToken && accessToken === authData.accessToken) {
      const refreshResult = await refreshAccessToken(authData.refreshToken);
      if (refreshResult.accessToken) {
        accessToken = refreshResult.accessToken;
        lastProjectResult = await getProjectId(accessToken);
      }
    }
    if (!lastProjectResult.projectId) {
      return {
        success: false,
        models: [],
        lastUpdated: Date.now(),
        error: lastProjectResult.error || 'Failed to retrieve project ID',
        isUnprovisioned: lastProjectResult.isUnprovisioned,
      };
    }
  }

  // Use API project ID if available, else fallback to stored
  projectId = lastProjectResult.projectId || projectId;
  apiTier = lastProjectResult.tier || 'unknown';

  // Fetch models with quota
  const result = await fetchAvailableModels(accessToken, projectId as string);

  // If quota fetch fails with auth error and we haven't refreshed yet, try refresh
  if (!result.success && result.error?.includes('expired') && authData.refreshToken) {
    const refreshResult = await refreshAccessToken(authData.refreshToken);
    if (refreshResult.accessToken) {
      const retryResult = await fetchAvailableModels(
        refreshResult.accessToken,
        projectId as string
      );
      // Determine tier: model access (Claude = Ultra) > API tier > fallback
      if (retryResult.success) {
        let finalTier = inferTierFromModels(retryResult.models);
        if (finalTier === 'unknown') {
          finalTier = apiTier !== 'unknown' ? apiTier : 'paid';
        }
        retryResult.tier = finalTier;
        retryResult.accountId = accountId;
        setAccountTier(provider, accountId, finalTier);
      }
      return retryResult;
    }
  }

  // Determine tier: model access > API tier > fallback to paid
  if (result.success) {
    let finalTier = inferTierFromModels(result.models);
    if (finalTier === 'unknown') {
      finalTier = apiTier !== 'unknown' ? apiTier : 'paid';
    }
    result.tier = finalTier;
    result.accountId = accountId;
    setAccountTier(provider, accountId, finalTier);
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
 * @returns Results for all accounts with project grouping
 */
export async function fetchAllProviderQuotas(
  provider: CLIProxyProvider
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
    const quota = await fetchAccountQuota(provider, account.id);

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

/**
 * Find available account with remaining quota
 * Used by preflight check for auto-switching
 *
 * @param provider - Provider name
 * @param excludeAccountId - Account to exclude (current exhausted account)
 * @returns Account with available quota, or null if none available
 */
export async function findAvailableAccount(
  provider: CLIProxyProvider,
  excludeAccountId?: string
): Promise<{ account: AccountInfo; quota: QuotaResult } | null> {
  const allQuotas = await fetchAllProviderQuotas(provider);

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
