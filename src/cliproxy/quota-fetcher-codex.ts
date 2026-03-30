/**
 * Quota Fetcher for Codex (ChatGPT) Accounts
 *
 * Fetches quota information from ChatGPT backend API.
 * Used for displaying rate limit windows and reset times.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAuthDir } from './config-generator';
import { getAccount, getProviderAccounts, getPausedDir } from './account-manager';
import { sanitizeEmail, isTokenExpired } from './auth-utils';
import type { CodexQuotaResult, CodexQuotaWindow, CodexCoreUsageSummary } from './quota-types';
import { extractCanonicalEmailFromAccountId } from './accounts/email-account-identity';

/** ChatGPT backend API base URL */
const CODEX_API_BASE = 'https://chatgpt.com/backend-api';
const CODEX_QUOTA_TIMEOUT_MS = 12000;
const CODEX_QUOTA_MAX_ATTEMPTS = 2;
const CODEX_ERROR_DETAIL_MAX_LENGTH = 240;

/**
 * User agent matching Codex CLI for API compatibility.
 * Update when Codex CLI releases new versions to maintain compatibility.
 */
const USER_AGENT = 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal';

/** Auth data extracted from Codex auth file */
interface CodexAuthData {
  accessToken: string;
  accountId: string; // ChatGPT-Account-Id header
  isExpired: boolean;
  expiresAt: string | null;
}

/** Raw API response structure */
interface CodexUsageResponse {
  plan_type?: string;
  planType?: string;
  rate_limit?: CodexRateLimitWindow;
  rateLimit?: CodexRateLimitWindow;
  code_review_rate_limit?: CodexRateLimitWindow;
  codeReviewRateLimit?: CodexRateLimitWindow;
}

/** Rate limit window from API */
interface CodexRateLimitWindow {
  primary_window?: CodexWindowData;
  primaryWindow?: CodexWindowData;
  secondary_window?: CodexWindowData;
  secondaryWindow?: CodexWindowData;
}

/** Individual window data */
interface CodexWindowData {
  used_percent?: number;
  usedPercent?: number;
  reset_after_seconds?: number | null;
  resetAfterSeconds?: number | null;
}

interface ParsedCodexErrorBody {
  errorCode?: string;
  errorDetail?: string;
  message?: string;
}

type CodexWindowKind =
  | 'usage-5h'
  | 'usage-weekly'
  | 'code-review-5h'
  | 'code-review-weekly'
  | 'code-review'
  | 'unknown';

function getCodexWindowKind(label: string): CodexWindowKind {
  const lower = (label || '').toLowerCase();
  const isCodeReview = lower.includes('code review') || lower.includes('code_review');
  const isPrimary = lower.includes('primary');
  const isSecondary = lower.includes('secondary');

  if (isCodeReview) {
    if (isPrimary) return 'code-review-5h';
    if (isSecondary) return 'code-review-weekly';
    return 'code-review';
  }

  if (isPrimary) return 'usage-5h';
  if (isSecondary) return 'usage-weekly';
  return 'unknown';
}

function getUnknownCodexWindowLabels(windows: CodexQuotaWindow[]): string[] {
  const unknownLabels = windows
    .filter((window) => getCodexWindowKind(window.label) === 'unknown')
    .map((window) => window.label)
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0);
  return Array.from(new Set(unknownLabels));
}

function shouldLogCodexWindowWarnings(verbose: boolean): boolean {
  if (verbose) return true;
  const debugFlag = process.env['CCS_DEBUG'];
  return debugFlag === '1' || debugFlag === 'true';
}

/**
 * Build explicit 5h + weekly usage summary from raw Codex windows.
 * Falls back to shortest/longest reset windows if API labels change.
 */
export function buildCodexCoreUsageSummary(windows: CodexQuotaWindow[]): CodexCoreUsageSummary {
  if (!windows || windows.length === 0) {
    return { fiveHour: null, weekly: null };
  }

  let fiveHourWindow: CodexQuotaWindow | null = null;
  let weeklyWindow: CodexQuotaWindow | null = null;
  const nonCodeReviewWindows: CodexQuotaWindow[] = [];

  for (const window of windows) {
    const kind = getCodexWindowKind(window.label);
    if (kind === 'usage-5h') {
      if (!fiveHourWindow) fiveHourWindow = window;
      nonCodeReviewWindows.push(window);
      continue;
    }
    if (kind === 'usage-weekly') {
      if (!weeklyWindow) weeklyWindow = window;
      nonCodeReviewWindows.push(window);
      continue;
    }
    if (kind === 'unknown') {
      nonCodeReviewWindows.push(window);
    }
  }

  if ((!fiveHourWindow || !weeklyWindow) && nonCodeReviewWindows.length > 0) {
    const withReset = nonCodeReviewWindows
      .filter(
        (w) =>
          typeof w.resetAfterSeconds === 'number' &&
          isFinite(w.resetAfterSeconds) &&
          w.resetAfterSeconds >= 0
      )
      .sort((a, b) => (a.resetAfterSeconds || 0) - (b.resetAfterSeconds || 0));

    if (!fiveHourWindow) {
      fiveHourWindow = withReset[0] || nonCodeReviewWindows[0] || null;
    }

    if (!weeklyWindow) {
      weeklyWindow =
        withReset.length > 1
          ? withReset[withReset.length - 1]
          : nonCodeReviewWindows.find((w) => w !== fiveHourWindow) || null;
    }
  }

  const mapWindow = (window: CodexQuotaWindow | null): CodexCoreUsageSummary['fiveHour'] => {
    if (!window) return null;
    return {
      label: window.label,
      remainingPercent: window.remainingPercent,
      resetAfterSeconds: window.resetAfterSeconds,
      resetAt: window.resetAt,
    };
  };

  return {
    fiveHour: mapWindow(fiveHourWindow),
    weekly: mapWindow(weeklyWindow),
  };
}

/**
 * Read auth data from Codex auth file
 */
function readCodexAuthFile(filePath: string): CodexAuthData | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    if (!data.access_token) {
      return null;
    }

    return {
      accessToken: data.access_token,
      accountId: data.account_id || data.accountId || '',
      isExpired: isTokenExpired(data.expired),
      expiresAt: data.expired || null,
    };
  } catch {
    return null;
  }
}

function readCodexAuthData(accountId: string): CodexAuthData | null {
  const authDirs = [getAuthDir(), getPausedDir()];
  const registryAccount = getAccount('codex', accountId);
  if (registryAccount?.tokenFile) {
    for (const authDir of authDirs) {
      const filePath = path.join(authDir, registryAccount.tokenFile);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const authData = readCodexAuthFile(filePath);
      if (authData) {
        return authData;
      }
    }
  }

  const legacyEmail = extractCanonicalEmailFromAccountId(accountId) ?? accountId;
  const sanitizedId = sanitizeEmail(legacyEmail);
  const expectedFile = `codex-${sanitizedId}.json`;

  for (const authDir of authDirs) {
    if (!fs.existsSync(authDir)) continue;

    const filePath = path.join(authDir, expectedFile);
    if (fs.existsSync(filePath)) {
      const authData = readCodexAuthFile(filePath);
      if (authData) {
        return authData;
      }
    }

    // Fallback: scan directory for matching email in file content
    const files = fs.readdirSync(authDir);
    for (const file of files) {
      if (file.startsWith('codex-') && file.endsWith('.json')) {
        const candidatePath = path.join(authDir, file);
        try {
          const content = fs.readFileSync(candidatePath, 'utf-8');
          const data = JSON.parse(content);
          if (data.email === legacyEmail && data.access_token) {
            return {
              accessToken: data.access_token,
              accountId: data.account_id || data.accountId || '',
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
 * Build CodexQuotaWindow array from API response
 * Handles both snake_case and camelCase field names
 */
function buildCodexQuotaWindows(payload: CodexUsageResponse): CodexQuotaWindow[] {
  const windows: CodexQuotaWindow[] = [];

  // Get rate limit object (handles both cases)
  const rateLimit = payload.rate_limit || payload.rateLimit;
  const codeReviewRateLimit = payload.code_review_rate_limit || payload.codeReviewRateLimit;

  // Helper to extract window data
  const addWindow = (label: string, windowData: CodexWindowData | undefined): void => {
    if (!windowData) return;

    // Clamp usedPercent to [0, 100] range
    const rawUsedPercent = windowData.used_percent ?? windowData.usedPercent ?? 0;
    const usedPercent = Math.max(0, Math.min(100, rawUsedPercent));
    const resetAfterSeconds =
      windowData.reset_after_seconds ?? windowData.resetAfterSeconds ?? null;

    // Calculate reset timestamp if we have seconds
    let resetAt: string | null = null;
    if (resetAfterSeconds !== null && resetAfterSeconds > 0) {
      resetAt = new Date(Date.now() + resetAfterSeconds * 1000).toISOString();
    }

    windows.push({
      label,
      usedPercent,
      remainingPercent: Math.max(0, 100 - usedPercent),
      resetAfterSeconds,
      resetAt,
    });
  };

  // Add main rate limit windows
  if (rateLimit) {
    addWindow('Primary', rateLimit.primary_window || rateLimit.primaryWindow);
    addWindow('Secondary', rateLimit.secondary_window || rateLimit.secondaryWindow);
  }

  // Add code review rate limit windows
  if (codeReviewRateLimit) {
    addWindow(
      'Code Review (Primary)',
      codeReviewRateLimit.primary_window || codeReviewRateLimit.primaryWindow
    );
    addWindow(
      'Code Review (Secondary)',
      codeReviewRateLimit.secondary_window || codeReviewRateLimit.secondaryWindow
    );
  }

  return windows;
}

function buildCodexFailureResult(
  accountId: string,
  options: {
    error: string;
    httpStatus?: number;
    errorCode?: string;
    errorDetail?: string;
    actionHint?: string;
    retryable?: boolean;
    needsReauth?: boolean;
    isForbidden?: boolean;
  }
): CodexQuotaResult {
  return {
    success: false,
    windows: [],
    planType: null,
    lastUpdated: Date.now(),
    accountId,
    error: options.error,
    httpStatus: options.httpStatus,
    errorCode: options.errorCode,
    errorDetail: options.errorDetail,
    actionHint: options.actionHint,
    retryable: options.retryable,
    needsReauth: options.needsReauth,
    isForbidden: options.isForbidden,
  };
}

function sanitizeCodexErrorDetail(bodyText: string): string | undefined {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed) || /^<[^>]+>/.test(trimmed)) {
    return '[HTML error response omitted]';
  }

  let sanitized = trimmed
    .replace(
      /"(access[_-]?token|refresh[_-]?token|authorization|cookie|set-cookie|api[_-]?key|session[_-]?token|token)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"'
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/\s+/g, ' ');

  if (sanitized.length > CODEX_ERROR_DETAIL_MAX_LENGTH) {
    sanitized = `${sanitized.slice(0, CODEX_ERROR_DETAIL_MAX_LENGTH - 14)}...[truncated]`;
  }

  return sanitized;
}

function parseCodexErrorBody(bodyText: string): ParsedCodexErrorBody {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return {};
  }

  const sanitizedDetail = sanitizeCodexErrorDetail(trimmed);

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;

    const topLevelMessage =
      typeof parsed.message === 'string'
        ? parsed.message
        : typeof parsed.detail === 'string'
          ? parsed.detail
          : undefined;
    const topLevelCode = typeof parsed.code === 'string' ? parsed.code : undefined;

    if (parsed.error && typeof parsed.error === 'object') {
      const error = parsed.error as Record<string, unknown>;
      const errorCode = typeof error.code === 'string' ? error.code : topLevelCode;
      const errorMessage =
        typeof error.message === 'string'
          ? error.message
          : typeof error.error === 'string'
            ? error.error
            : topLevelMessage;
      return {
        errorCode,
        errorDetail: sanitizedDetail,
        message: errorMessage,
      };
    }

    if (parsed.detail && typeof parsed.detail === 'object') {
      const detail = parsed.detail as Record<string, unknown>;
      return {
        errorCode:
          typeof detail.code === 'string'
            ? detail.code
            : typeof detail.type === 'string'
              ? detail.type
              : topLevelCode,
        errorDetail: sanitizedDetail,
        message:
          typeof detail.message === 'string'
            ? detail.message
            : typeof detail.error === 'string'
              ? detail.error
              : topLevelMessage,
      };
    }

    return {
      errorCode: topLevelCode,
      errorDetail: sanitizedDetail,
      message: topLevelMessage,
    };
  } catch {
    return {
      errorDetail: sanitizedDetail,
      message: trimmed,
    };
  }
}

function buildCodexHttpFailureResult(
  accountId: string,
  status: number,
  bodyText: string
): CodexQuotaResult {
  const parsed = parseCodexErrorBody(bodyText);

  if (status === 401) {
    return buildCodexFailureResult(accountId, {
      error: 'Token expired or invalid',
      httpStatus: 401,
      errorCode: parsed.errorCode || 'reauth_required',
      errorDetail: parsed.errorDetail,
      actionHint: 'Run ccs cliproxy auth codex to re-authenticate this account.',
      needsReauth: true,
      retryable: false,
    });
  }

  if (status === 402) {
    if (parsed.errorCode === 'deactivated_workspace') {
      return buildCodexFailureResult(accountId, {
        error: 'Workspace deactivated (HTTP 402)',
        httpStatus: 402,
        errorCode: parsed.errorCode,
        errorDetail: parsed.errorDetail,
        actionHint:
          'Remove and re-add this account from an active ChatGPT workspace before retrying.',
        retryable: false,
      });
    }

    return buildCodexFailureResult(accountId, {
      error: parsed.message || 'Payment or workspace access required (HTTP 402)',
      httpStatus: 402,
      errorCode: parsed.errorCode || 'payment_required',
      errorDetail: parsed.errorDetail,
      actionHint: 'Confirm the ChatGPT workspace/subscription is active, then retry.',
      retryable: false,
    });
  }

  if (status === 403) {
    return buildCodexFailureResult(accountId, {
      error: 'Quota API access forbidden (HTTP 403)',
      httpStatus: 403,
      errorCode: parsed.errorCode || 'quota_api_forbidden',
      errorDetail: parsed.errorDetail,
      actionHint: 'This account cannot access the Codex quota endpoint.',
      isForbidden: true,
      retryable: false,
    });
  }

  if (status === 404) {
    return buildCodexFailureResult(accountId, {
      error: 'Codex quota endpoint not found (HTTP 404)',
      httpStatus: 404,
      errorCode: parsed.errorCode || 'quota_endpoint_not_found',
      errorDetail: parsed.errorDetail,
      actionHint: 'The upstream Codex quota endpoint changed or is unavailable.',
      retryable: false,
    });
  }

  if (status === 429) {
    return buildCodexFailureResult(accountId, {
      error: 'Rate limited - try again later',
      httpStatus: 429,
      errorCode: parsed.errorCode || 'rate_limited',
      errorDetail: parsed.errorDetail,
      actionHint: 'Retry after a short delay.',
      retryable: true,
    });
  }

  if (status >= 500) {
    return buildCodexFailureResult(accountId, {
      error: `Codex quota service unavailable (HTTP ${status})`,
      httpStatus: status,
      errorCode: parsed.errorCode || 'provider_unavailable',
      errorDetail: parsed.errorDetail,
      actionHint: 'Retry later. This looks like a temporary upstream problem.',
      retryable: true,
    });
  }

  return buildCodexFailureResult(accountId, {
    error: parsed.message || `Codex quota request failed (HTTP ${status})`,
    httpStatus: status,
    errorCode: parsed.errorCode || 'unknown_upstream_error',
    errorDetail: parsed.errorDetail,
    actionHint: 'Inspect the upstream response details and retry if appropriate.',
    retryable: false,
  });
}

/**
 * Fetch quota for a single Codex account
 *
 * @param accountId - Account identifier (email)
 * @param verbose - Show detailed diagnostics
 * @returns Quota result with windows and percentages
 */
export async function fetchCodexQuota(
  accountId: string,
  verbose = false
): Promise<CodexQuotaResult> {
  if (verbose) console.error(`[i] Fetching Codex quota for ${accountId}...`);

  const authData = readCodexAuthData(accountId);
  if (!authData) {
    const error = 'Auth file not found for Codex account';
    if (verbose) console.error(`[!] Error: ${error}`);
    return buildCodexFailureResult(accountId, {
      error,
      errorCode: 'auth_file_missing',
      actionHint: 'Remove the stale account or authenticate again with ccs cliproxy auth codex.',
      retryable: false,
    });
  }

  if (authData.isExpired) {
    const error = 'Token expired - re-authenticate with ccs cliproxy auth codex';
    if (verbose) console.error(`[!] Error: ${error}`);
    return buildCodexFailureResult(accountId, {
      error,
      errorCode: 'token_expired',
      actionHint: 'Run ccs cliproxy auth codex to refresh the token for this account.',
      needsReauth: true,
      retryable: false,
    });
  }

  if (!authData.accountId) {
    const error = 'Missing ChatGPT-Account-Id in auth file';
    if (verbose) console.error(`[!] Error: ${error}`);
    return buildCodexFailureResult(accountId, {
      error,
      errorCode: 'missing_account_id',
      actionHint: 'Remove and re-add this Codex account to refresh workspace metadata.',
      retryable: false,
    });
  }

  const url = `${CODEX_API_BASE}/wham/usage`;
  let lastErrorMsg = 'Unknown error';

  for (let attempt = 1; attempt <= CODEX_QUOTA_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CODEX_QUOTA_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${authData.accessToken}`,
          'ChatGPT-Account-Id': authData.accountId,
          'User-Agent': USER_AGENT,
        },
      });

      clearTimeout(timeoutId);

      if (verbose) console.error(`[i] Codex API status: ${response.status} (attempt ${attempt})`);

      if (!response.ok) {
        const bodyText = await response.text();
        return buildCodexHttpFailureResult(accountId, response.status, bodyText);
      }

      const data = (await response.json()) as CodexUsageResponse;
      const windows = buildCodexQuotaWindows(data);
      const unknownWindowLabels = getUnknownCodexWindowLabels(windows);
      if (unknownWindowLabels.length > 0 && shouldLogCodexWindowWarnings(verbose)) {
        console.error(
          `[!] Codex quota detected unknown window labels: ${unknownWindowLabels.join(', ')}`
        );
        console.error('    Window classification may need an update for upstream API changes.');
      }
      const coreUsage = buildCodexCoreUsageSummary(windows);

      // Extract plan type
      const planTypeRaw = data.plan_type || data.planType;
      let planType: 'free' | 'plus' | 'team' | null = null;
      if (planTypeRaw) {
        const normalized = planTypeRaw.toLowerCase();
        if (normalized === 'free') planType = 'free';
        else if (normalized === 'plus') planType = 'plus';
        else if (normalized === 'team') planType = 'team';
      }

      if (verbose) console.error(`[i] Codex windows found: ${windows.length}`);

      return {
        success: true,
        windows,
        coreUsage,
        planType,
        lastUpdated: Date.now(),
        accountId,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbortError = err instanceof Error && err.name === 'AbortError';
      lastErrorMsg = isAbortError
        ? 'Request timeout'
        : err instanceof Error
          ? err.message
          : 'Unknown error';

      if (verbose) {
        console.error(`[!] Codex quota error (attempt ${attempt}): ${lastErrorMsg}`);
      }

      // Retry timeout once; other failures return immediately.
      if (isAbortError && attempt < CODEX_QUOTA_MAX_ATTEMPTS) {
        continue;
      }

      return {
        success: false,
        windows: [],
        planType: null,
        lastUpdated: Date.now(),
        error: lastErrorMsg,
        accountId,
        errorCode: isAbortError ? 'network_timeout' : 'network_error',
        actionHint: isAbortError
          ? 'Retry later. The Codex quota endpoint timed out.'
          : 'Retry later or inspect network connectivity.',
        retryable: true,
      };
    }
  }

  return {
    success: false,
    windows: [],
    planType: null,
    lastUpdated: Date.now(),
    error: lastErrorMsg,
    accountId,
    errorCode: 'unknown_error',
    retryable: true,
  };
}

/**
 * Fetch quota for all Codex accounts
 *
 * @param verbose - Show detailed diagnostics
 * @returns Array of account quotas
 */
export async function fetchAllCodexQuotas(
  verbose = false
): Promise<{ account: string; quota: CodexQuotaResult }[]> {
  const accounts = getProviderAccounts('codex');

  if (accounts.length === 0) {
    return [];
  }

  const results = await Promise.all(
    accounts.map(async (account) => ({
      account: account.id,
      quota: await fetchCodexQuota(account.id, verbose),
    }))
  );

  return results;
}

// Export for testing
export { readCodexAuthData, buildCodexQuotaWindows, getUnknownCodexWindowLabels };
