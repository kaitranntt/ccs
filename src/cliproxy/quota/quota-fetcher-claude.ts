/**
 * Quota Fetcher for Claude (Anthropic) Accounts
 *
 * Fetches OAuth usage windows from Claude API and normalizes 5h + weekly windows.
 */

import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import { getAuthDir } from '../config/config-generator';
import { getPausedDir, getProviderAccounts } from '../accounts/account-manager';
import { sanitizeEmail, isTokenExpired } from '../auth/auth-utils';
import type { ClaudeQuotaResult } from './quota-types';
import {
  buildClaudeQuotaWindows,
  buildClaudeCoreUsageSummary,
  buildClaudeGeneralWindowPresence,
} from './quota-fetcher-claude-normalizer';
import { createLogger } from '../../services/logging';
import {
  CLAUDE_PROBE_SHARED_TTL_MS,
  buildStaleClaudeResult,
  computeClaudeProbeCooldownMs,
  parseRetryAfterMs,
  readClaudeProbeState,
  writeClaudeProbeState,
} from './quota-fetcher-claude-probe-state';

const logger = createLogger('cliproxy:quota:claude');

export { buildClaudeQuotaWindows, buildClaudeCoreUsageSummary, buildClaudeGeneralWindowPresence };

export const CLAUDE_OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const CLAUDE_QUOTA_TIMEOUT_MS = 10000;
const CLAUDE_QUOTA_MAX_ATTEMPTS = 2;
const CLAUDE_OAUTH_BETA_HEADER = 'oauth-2025-04-20';
const CLAUDE_QUOTA_ERROR_BODY_MAX_BYTES = 8192;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Claude quota request cancelled');
    error.name = 'AbortError';
    throw error;
  }
}

/** Bound caller waits even when a response-body implementation ignores fetch cancellation. */
function waitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      try {
        throwIfAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
    if (signal.aborted) onAbort();
  });
}

interface ClaudeAuthData {
  accessToken: string;
  isExpired: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractAccessToken(data: Record<string, unknown>): string | null {
  const direct = asString(data['access_token']);
  if (direct) return direct;

  const nested = toObject(data['token']);
  if (nested) {
    const nestedToken = asString(nested['access_token']);
    if (nestedToken) return nestedToken;
  }

  return null;
}

function extractExpiry(data: Record<string, unknown>): string | null {
  const direct = asString(data['expired']);
  if (direct) return direct;

  const nested = toObject(data['token']);
  if (nested) {
    return asString(nested['expiry']);
  }

  return null;
}

function isAuthExpired(expiry: string | null): boolean {
  return expiry ? isTokenExpired(expiry) : false;
}

function extractErrorMessage(payload: unknown): string | null {
  const root = toObject(payload);
  if (!root) return null;

  const direct = asString(root['message']);
  if (direct) return direct;

  const nested = toObject(root['error']);
  if (!nested) return null;
  return asString(nested['message']);
}

async function readResponseErrorMessage(response: Response): Promise<string | null> {
  try {
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > CLAUDE_QUOTA_ERROR_BODY_MAX_BYTES) {
      return null;
    }

    const reader = response.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > CLAUDE_QUOTA_ERROR_BODY_MAX_BYTES) return null;

      chunks.push(decoder.decode(value, { stream: true }));
    }

    chunks.push(decoder.decode());
    const body = chunks.join('').trim();
    if (!body) return null;

    try {
      const parsed = JSON.parse(body) as unknown;
      const extracted = extractErrorMessage(parsed);
      if (extracted) return extracted;
    } catch {
      // fall through to plain-text fallback
    }

    return body;
  } catch {
    return null;
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fsp.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return toObject(parsed);
  } catch {
    return null;
  }
}

async function readAuthCandidate(filePath: string): Promise<ClaudeAuthData | null> {
  const data = await readJsonFile(filePath);
  if (!data) return null;

  const accessToken = extractAccessToken(data);
  if (!accessToken) return null;

  const expiry = extractExpiry(data);
  return {
    accessToken,
    isExpired: isAuthExpired(expiry),
  };
}

async function readClaudeAuthData(accountId: string): Promise<ClaudeAuthData | null> {
  const authDirs = [getAuthDir(), getPausedDir()];
  const sanitizedId = sanitizeEmail(accountId);
  const expectedFiles = [`claude-${sanitizedId}.json`, `anthropic-${sanitizedId}.json`];

  for (const authDir of authDirs) {
    for (const expectedFile of expectedFiles) {
      const filePath = path.join(authDir, expectedFile);
      const authData = await readAuthCandidate(filePath);
      if (authData) {
        return authData;
      }
    }

    let files: string[];
    try {
      files = await fsp.readdir(authDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (
        !file.endsWith('.json') ||
        (!file.startsWith('claude-') && !file.startsWith('anthropic-'))
      ) {
        continue;
      }

      const filePath = path.join(authDir, file);
      const data = await readJsonFile(filePath);
      if (!data) continue;

      const accessToken = extractAccessToken(data);
      if (!accessToken) continue;

      const fileEmail = asString(data['email']);
      const typeValue = asString(data['type']);
      const isClaudeType =
        typeValue === null || typeValue === 'claude' || typeValue === 'anthropic';
      const matchesEmail = fileEmail === accountId;
      const matchesFile = file.includes(sanitizedId);

      if ((matchesEmail || matchesFile) && isClaudeType) {
        const expiry = extractExpiry(data);
        return {
          accessToken,
          isExpired: isAuthExpired(expiry),
        };
      }
    }
  }

  return null;
}

function buildEmptyResult(
  error: string,
  accountId: string,
  needsReauth = false
): ClaudeQuotaResult {
  return {
    success: false,
    windows: [],
    coreUsage: { fiveHour: null, weekly: null },
    lastUpdated: Date.now(),
    error,
    accountId,
    needsReauth,
  };
}

/**
 * Run the Anthropic OAuth usage fetch loop for a known-good access token.
 *
 * This is the single Anthropic-call surface shared by both the CLIProxy-managed
 * path (fetchClaudeQuota) and the native-login path (fetchClaudeQuotaWithToken).
 * It owns the 401/403/404/429/5xx branch logic, the bounded retry loop, and the
 * window normalization so neither caller re-implements the hostile-endpoint
 * handling. The callers differ only in WHERE the token comes from.
 */
async function runClaudeUsageFetch(
  accessToken: string,
  accountId: string,
  verbose: boolean,
  signal?: AbortSignal
): Promise<ClaudeQuotaResult> {
  let lastError = 'Unknown error';

  for (let attempt = 1; attempt <= CLAUDE_QUOTA_MAX_ATTEMPTS; attempt++) {
    throwIfAborted(signal);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeoutId = setTimeout(() => controller.abort(), CLAUDE_QUOTA_TIMEOUT_MS);

    try {
      const response = await waitWithAbort(
        fetch(CLAUDE_OAUTH_USAGE_URL, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'anthropic-beta': CLAUDE_OAUTH_BETA_HEADER,
          },
        }),
        controller.signal
      );
      throwIfAborted(signal);

      if (verbose) {
        logger.info('quota.fetch.status', `Claude OAuth usage status: ${response.status}`, {
          provider: 'claude',
          status: response.status,
          attempt,
        });
      }

      if (response.status === 401) {
        const errorMessage = await waitWithAbort(
          readResponseErrorMessage(response),
          controller.signal
        );
        throwIfAborted(signal);
        return buildEmptyResult(
          errorMessage || 'Authentication required for Claude OAuth usage',
          accountId,
          true
        );
      }

      if (response.status === 404) {
        return buildEmptyResult('Claude OAuth usage endpoint not found', accountId);
      }

      if (response.status === 403) {
        return buildEmptyResult('Not authorized for Claude OAuth usage', accountId);
      }

      if (!response.ok) {
        lastError =
          (await waitWithAbort(readResponseErrorMessage(response), controller.signal)) ||
          `Claude OAuth usage API error: ${response.status}`;
        throwIfAborted(signal);
        // Surface the upstream status + Retry-After so an outer caller (the
        // native collector's circuit-breaker) can honor backoff guidance.
        const retryAfter = response.headers.get('retry-after');
        // Do not inner-retry 429 with no delay; the outer cache + circuit breaker
        // honor Retry-After and bound total volume. Inner retry stays for
        // transient 5xx only.
        if (attempt < CLAUDE_QUOTA_MAX_ATTEMPTS && response.status >= 500) {
          continue;
        }
        if (response.status === 429) {
          return {
            ...buildEmptyResult('Claude usage status temporarily unavailable', accountId),
            httpStatus: response.status,
            errorCode: 'usage_probe_unavailable',
            actionHint:
              'Inference may still be available. Retry the Claude quota status check later.',
            retryable: true,
            ...(retryAfter ? { errorDetail: `retry-after:${retryAfter}` } : {}),
          };
        }
        return {
          ...buildEmptyResult(lastError, accountId),
          httpStatus: response.status,
          retryable: response.status >= 500,
          ...(retryAfter ? { errorDetail: `retry-after:${retryAfter}` } : {}),
        };
      }

      let payload: unknown;
      try {
        payload = await waitWithAbort(response.json(), controller.signal);
      } catch {
        throwIfAborted(signal);
        return buildEmptyResult('Invalid Claude OAuth usage format', accountId);
      }
      throwIfAborted(signal);

      if (!toObject(payload)) {
        return buildEmptyResult('Invalid Claude OAuth usage format', accountId);
      }

      const windows = buildClaudeQuotaWindows(payload as Record<string, unknown>);
      const coreUsage = buildClaudeCoreUsageSummary(windows);
      const generalWindowPresence = buildClaudeGeneralWindowPresence(
        payload as Record<string, unknown>
      );

      return {
        success: true,
        windows,
        coreUsage,
        generalWindowPresence,
        lastUpdated: Date.now(),
        accountId,
      };
    } catch (error) {
      throwIfAborted(signal);
      lastError =
        error instanceof Error && error.name === 'AbortError'
          ? 'Claude OAuth usage request timeout'
          : error instanceof Error
            ? error.message
            : 'Unknown error';

      if (verbose) {
        logger.warn(
          'quota.fetch.failed',
          `Claude OAuth usage failed (attempt ${attempt}): ${lastError}`,
          {
            provider: 'claude',
            attempt,
            err:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { message: String(error) },
          }
        );
      }

      if (attempt >= CLAUDE_QUOTA_MAX_ATTEMPTS) {
        return { ...buildEmptyResult(lastError, accountId), retryable: true };
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return { ...buildEmptyResult(lastError, accountId), retryable: true };
}

/**
 * Fetch quota using a directly-supplied native OAuth access token.
 *
 * Reuses the exact Anthropic call + normalization as fetchClaudeQuota; the only
 * difference is the token source (the logged-in Claude Code credential rather
 * than a CLIProxy-managed auth file). Lives in this file so it can share the
 * file-private beta header, timeout, attempt count, and branch logic.
 */
export async function fetchClaudeQuotaWithToken(
  accessToken: string,
  accountId = 'claude-code',
  verbose = false,
  signal?: AbortSignal
): Promise<ClaudeQuotaResult> {
  throwIfAborted(signal);
  if (!accessToken || accessToken.trim().length === 0) {
    return buildEmptyResult('Missing native Claude access token', accountId, true);
  }
  return runClaudeUsageFetch(accessToken.trim(), accountId, verbose, signal);
}

/**
 * Fetch quota for a single Claude account.
 */
export async function fetchClaudeQuota(
  accountId: string,
  verbose = false,
  signal?: AbortSignal
): Promise<ClaudeQuotaResult> {
  throwIfAborted(signal);
  const authData = await readClaudeAuthData(accountId);
  throwIfAborted(signal);
  if (!authData) {
    return buildEmptyResult('Auth file not found for Claude account', accountId);
  }

  if (authData.isExpired) {
    return buildEmptyResult(
      'Token expired - re-authenticate with ccs cliproxy auth claude',
      accountId,
      true
    );
  }

  const pending = pendingClaudeFetches.get(accountId);
  if (pending) return waitForSharedFetch(accountId, pending, signal);

  const controller = new AbortController();
  const entry: PendingClaudeFetch = {
    controller,
    waiters: 0,
    settled: false,
    promise: fetchClaudeQuotaWithSharedState(
      authData.accessToken,
      accountId,
      verbose,
      controller.signal
    ).finally(() => {
      entry.settled = true;
      if (pendingClaudeFetches.get(accountId) === entry) pendingClaudeFetches.delete(accountId);
    }),
  };
  pendingClaudeFetches.set(accountId, entry);
  return waitForSharedFetch(accountId, entry, signal);
}

/** In-process coalescing; the on-disk probe state coordinates across processes. */
interface PendingClaudeFetch {
  promise: Promise<ClaudeQuotaResult>;
  controller: AbortController;
  waiters: number;
  settled: boolean;
}
const pendingClaudeFetches = new Map<string, PendingClaudeFetch>();

/** Only the last departing caller may cancel a shared provider request. */
function waitForSharedFetch(
  accountId: string,
  entry: PendingClaudeFetch,
  signal?: AbortSignal
): Promise<ClaudeQuotaResult> {
  entry.waiters++;
  return new Promise<ClaudeQuotaResult>((resolve, reject) => {
    let done = false;
    const release = () => {
      if (done) return false;
      done = true;
      signal?.removeEventListener('abort', onAbort);
      entry.waiters--;
      if (!entry.settled && entry.waiters === 0) {
        if (pendingClaudeFetches.get(accountId) === entry) pendingClaudeFetches.delete(accountId);
        entry.controller.abort();
      }
      return true;
    };
    const onAbort = () => {
      if (!release()) return;
      try {
        throwIfAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    entry.promise.then(
      (value) => {
        if (release()) resolve(value);
      },
      (error: unknown) => {
        if (release()) reject(error);
      }
    );
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function buildCooldownHint(cooldownUntil: number): string {
  return `Inference may still be available. Anthropic rate-limited the usage check; CCS retries after ${new Date(cooldownUntil).toLocaleTimeString()}.`;
}

/** Result for a probe skipped because the account is in a 429 cooldown. */
function buildCooldownResult(accountId: string, cooldownUntil: number): ClaudeQuotaResult {
  return {
    ...buildEmptyResult('Claude usage status temporarily unavailable', accountId),
    httpStatus: 429,
    errorCode: 'usage_probe_unavailable',
    actionHint: buildCooldownHint(cooldownUntil),
    retryable: true,
    errorDetail: `cooldown-until:${new Date(cooldownUntil).toISOString()}`,
  };
}

/**
 * Probe Anthropic through the shared on-disk state: reuse a fresh result from
 * any CCS process, skip the network during a 429 cooldown, and serve the last
 * good result (stale: true) while the probe is rate-limited or failing.
 */
async function fetchClaudeQuotaWithSharedState(
  accessToken: string,
  accountId: string,
  verbose: boolean,
  signal?: AbortSignal
): Promise<ClaudeQuotaResult> {
  throwIfAborted(signal);
  const state = readClaudeProbeState(accountId);
  const now = Date.now();

  if (state.lastGood && now - state.lastGood.lastUpdated < CLAUDE_PROBE_SHARED_TTL_MS) {
    return state.lastGood;
  }

  if (now < state.cooldownUntil) {
    const stale = state.lastGood ? buildStaleClaudeResult(state.lastGood, now) : null;
    return stale ?? buildCooldownResult(accountId, state.cooldownUntil);
  }

  const result = await runClaudeUsageFetch(accessToken, accountId, verbose, signal);
  throwIfAborted(signal);

  if (result.success) {
    writeClaudeProbeState(accountId, {
      ...state,
      lastGood: result,
      consecutive429: 0,
      cooldownUntil: 0,
    });
    return result;
  }

  if (result.httpStatus === 429) {
    const consecutive429 = state.consecutive429 + 1;
    const cooldownMs = computeClaudeProbeCooldownMs(
      consecutive429,
      parseRetryAfterMs(result.errorDetail, Date.now())
    );
    const cooldownUntil = Date.now() + cooldownMs;
    writeClaudeProbeState(accountId, { ...state, consecutive429, cooldownUntil });
    logger.warn('quota.fetch.rate_limited', 'Claude OAuth usage probe rate-limited', {
      provider: 'claude',
      consecutive429,
      cooldownMs,
    });
    const stale = state.lastGood ? buildStaleClaudeResult(state.lastGood, Date.now()) : null;
    return stale ?? { ...result, actionHint: buildCooldownHint(cooldownUntil) };
  }

  // Transient failures (5xx, timeouts) keep the last good numbers visible;
  // auth and access failures are shown as-is so the user can act on them.
  if (result.retryable && state.lastGood) {
    return buildStaleClaudeResult(state.lastGood, Date.now()) ?? result;
  }
  return result;
}

/**
 * Fetch quota for all Claude accounts.
 */
export async function fetchAllClaudeQuotas(
  verbose = false
): Promise<{ account: string; quota: ClaudeQuotaResult }[]> {
  const accounts = getProviderAccounts('claude');
  const results = await Promise.all(
    accounts.map(async (account) => ({
      account: account.id,
      quota: await fetchClaudeQuota(account.id, verbose),
    }))
  );
  return results;
}
