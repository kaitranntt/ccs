/**
 * Quota Fetcher for GitHub Copilot OAuth (ghcp) Accounts
 *
 * Fetches quota information from GitHub `/copilot_internal/user` endpoint
 * using the account token managed by CLIProxy auth flow.
 */

import * as fs from 'node:fs';
import { getAccountTokenPath, getProviderAccounts } from '../accounts/account-manager';
import type { GhcpQuotaResult, GhcpQuotaSnapshot } from './quota-types';
import { clampPercent } from '../../utils/percentage';
import { createLogger } from '../../services/logging';

// Diagnostic-only logger: token load failures, fetch progress, and upstream
// error reasons. accountId is attached as provider context; token values are
// never logged (the error string from readGhcpAccessToken is generic and
// contains no token material).
const logger = createLogger('cliproxy:quota:ghcp');

const GHCP_USAGE_URL = 'https://api.github.com/copilot_internal/user';
const GHCP_USAGE_TIMEOUT_MS = 10000;
/**
 * Mirrors headers currently accepted by GitHub Copilot internal usage endpoint.
 * Keep aligned with upstream Copilot client/API changes when quota calls break.
 */
const GHCP_USER_AGENT = 'GitHubCopilotChat/0.26.7';
const GHCP_API_VERSION = '2025-04-01';

interface RawGhcpQuotaSnapshot {
  entitlement?: number;
  overage_count?: number;
  overage_permitted?: boolean;
  percent_remaining?: number;
  quota_id?: string;
  quota_remaining?: number;
  remaining?: number;
  unlimited?: boolean;
}

interface RawGhcpUsageResponse {
  copilot_plan?: string;
  quota_reset_date?: string;
  quota_snapshots?: {
    premium_interactions?: RawGhcpQuotaSnapshot;
    chat?: RawGhcpQuotaSnapshot;
    completions?: RawGhcpQuotaSnapshot;
  };
}

interface TokenData {
  access_token?: string;
  token?: {
    access_token?: string;
  };
}

function normalizeSnapshot(raw?: RawGhcpQuotaSnapshot): GhcpQuotaSnapshot {
  const unlimited = Boolean(raw?.unlimited);
  const hasPercentSignal =
    typeof raw?.percent_remaining === 'number' && Number.isFinite(raw.percent_remaining);
  const rawRemaining = typeof raw?.remaining === 'number' ? raw.remaining : raw?.quota_remaining;
  const hasEntitlementRemainingSignal =
    typeof raw?.entitlement === 'number' &&
    Number.isFinite(raw.entitlement) &&
    raw.entitlement > 0 &&
    typeof rawRemaining === 'number' &&
    Number.isFinite(rawRemaining);
  const reported =
    raw !== undefined && (unlimited || hasPercentSignal || hasEntitlementRemainingSignal);
  const entitlement = Number(raw?.entitlement ?? 0);
  const remainingRaw = rawRemaining ?? 0;
  const remaining = Number(remainingRaw);
  const safeEntitlement = Number.isFinite(entitlement) ? Math.max(0, entitlement) : 0;
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  const used = Math.max(0, safeEntitlement - safeRemaining);

  const percentRemaining = unlimited
    ? 100
    : hasPercentSignal
      ? clampPercent(raw.percent_remaining as number)
      : reported && safeEntitlement > 0
        ? clampPercent((safeRemaining / safeEntitlement) * 100)
        : 0;

  return {
    reported,
    entitlement: safeEntitlement,
    remaining: safeRemaining,
    used,
    percentRemaining,
    percentUsed: clampPercent(100 - percentRemaining),
    unlimited,
    overageCount:
      typeof raw?.overage_count === 'number' && Number.isFinite(raw.overage_count)
        ? Math.max(0, raw.overage_count)
        : 0,
    overagePermitted: Boolean(raw?.overage_permitted),
    quotaId: raw?.quota_id || null,
  };
}

function extractAccessToken(tokenData: TokenData): string | null {
  if (typeof tokenData.access_token === 'string' && tokenData.access_token.trim()) {
    return tokenData.access_token.trim();
  }

  if (
    tokenData.token &&
    typeof tokenData.token === 'object' &&
    typeof tokenData.token.access_token === 'string' &&
    tokenData.token.access_token.trim()
  ) {
    return tokenData.token.access_token.trim();
  }

  return null;
}

function readGhcpAccessToken(accountId: string): { accessToken: string | null; error?: string } {
  const account = getProviderAccounts('ghcp').find((item) => item.id === accountId);
  if (!account) {
    return { accessToken: null, error: `Account not found: ${accountId}` };
  }

  const tokenPath = getAccountTokenPath(account);
  if (!tokenPath || !fs.existsSync(tokenPath)) {
    return { accessToken: null, error: 'Auth token file not found' };
  }

  try {
    const raw = fs.readFileSync(tokenPath, 'utf-8');
    const data = JSON.parse(raw) as TokenData;
    const accessToken = extractAccessToken(data);
    if (!accessToken) {
      return { accessToken: null, error: 'No access token in auth file' };
    }
    return { accessToken };
  } catch (error) {
    return {
      accessToken: null,
      error: error instanceof Error ? error.message : 'Failed to parse auth token file',
    };
  }
}

function buildEmptyQuotaResult(error: string, accountId?: string): GhcpQuotaResult {
  return {
    success: false,
    planType: null,
    quotaResetDate: null,
    snapshots: {
      premiumInteractions: normalizeSnapshot(),
      chat: normalizeSnapshot(),
      completions: normalizeSnapshot(),
    },
    lastUpdated: Date.now(),
    error,
    accountId,
  };
}

function normalizeUsageResponse(raw: RawGhcpUsageResponse): GhcpQuotaResult {
  const snapshots = raw.quota_snapshots || {};
  return {
    success: true,
    planType: raw.copilot_plan ?? null,
    quotaResetDate: raw.quota_reset_date ?? null,
    snapshots: {
      premiumInteractions: normalizeSnapshot(snapshots.premium_interactions),
      chat: normalizeSnapshot(snapshots.chat),
      completions: normalizeSnapshot(snapshots.completions),
    },
    lastUpdated: Date.now(),
  };
}

/**
 * Fetch quota for one ghcp account.
 */
export async function fetchGhcpQuota(accountId: string, verbose = false): Promise<GhcpQuotaResult> {
  const { accessToken, error } = readGhcpAccessToken(accountId);
  if (!accessToken) {
    // Safe diagnostic: accountId + generic error only (never log token values/file contents).
    if (verbose) {
      logger.error('ghcp.token_load_error', `ghcp quota token error (${accountId}): ${error}`, {
        provider: 'ghcp',
        accountId,
        reason: error ?? 'unknown',
      });
    }
    return buildEmptyQuotaResult(error || 'Failed to load auth token', accountId);
  }

  if (verbose) {
    logger.info('ghcp.fetch_start', `Fetching ghcp quota for ${accountId}...`, {
      provider: 'ghcp',
      accountId,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GHCP_USAGE_TIMEOUT_MS);

  try {
    const response = await fetch(GHCP_USAGE_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `token ${accessToken}`,
        'User-Agent': GHCP_USER_AGENT,
        'x-github-api-version': GHCP_API_VERSION,
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      return {
        ...buildEmptyQuotaResult('Authentication expired or invalid', accountId),
        needsReauth: true,
      };
    }

    if (response.status === 429) {
      return buildEmptyQuotaResult('Rate limited - try again later', accountId);
    }

    if (!response.ok) {
      return buildEmptyQuotaResult(`GitHub API error: ${response.status}`, accountId);
    }

    const data = (await response.json()) as RawGhcpUsageResponse;
    return {
      ...normalizeUsageResponse(data),
      accountId,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Request timeout'
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    return buildEmptyQuotaResult(message, accountId);
  }
}

/**
 * Fetch quota for all ghcp accounts.
 */
export async function fetchAllGhcpQuotas(
  verbose = false
): Promise<{ account: string; quota: GhcpQuotaResult }[]> {
  const accounts = getProviderAccounts('ghcp');
  const results = await Promise.all(
    accounts.map(async (account) => ({
      account: account.id,
      quota: await fetchGhcpQuota(account.id, verbose),
    }))
  );
  return results;
}

// Export for testing
export { normalizeSnapshot as normalizeGhcpSnapshot, extractAccessToken as extractGhcpAccessToken };
