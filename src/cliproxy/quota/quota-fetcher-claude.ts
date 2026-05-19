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
} from './quota-fetcher-claude-normalizer';

export { buildClaudeQuotaWindows, buildClaudeCoreUsageSummary };

export const CLAUDE_OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const CLAUDE_QUOTA_TIMEOUT_MS = 10000;
const CLAUDE_QUOTA_MAX_ATTEMPTS = 2;
const CLAUDE_OAUTH_BETA_HEADER = 'oauth-2025-04-20';
const CLAUDE_QUOTA_ERROR_BODY_MAX_BYTES = 8192;

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
 * Fetch quota for a single Claude account.
 */
export async function fetchClaudeQuota(
  accountId: string,
  verbose = false
): Promise<ClaudeQuotaResult> {
  const authData = await readClaudeAuthData(accountId);
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

  let lastError = 'Unknown error';

  for (let attempt = 1; attempt <= CLAUDE_QUOTA_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLAUDE_QUOTA_TIMEOUT_MS);

    try {
      const response = await fetch(CLAUDE_OAUTH_USAGE_URL, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${authData.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'anthropic-beta': CLAUDE_OAUTH_BETA_HEADER,
        },
      });

      if (verbose) {
        console.error(`[i] Claude OAuth usage status: ${response.status} (attempt ${attempt})`);
      }

      if (response.status === 401) {
        const errorMessage = await readResponseErrorMessage(response);
        clearTimeout(timeoutId);
        return buildEmptyResult(
          errorMessage || 'Authentication required for Claude OAuth usage',
          accountId,
          true
        );
      }

      if (response.status === 404) {
        clearTimeout(timeoutId);
        return buildEmptyResult('Claude OAuth usage endpoint not found', accountId);
      }

      if (response.status === 403) {
        clearTimeout(timeoutId);
        return buildEmptyResult('Not authorized for Claude OAuth usage', accountId);
      }

      if (!response.ok) {
        lastError =
          (await readResponseErrorMessage(response)) ||
          `Claude OAuth usage API error: ${response.status}`;
        if (
          attempt < CLAUDE_QUOTA_MAX_ATTEMPTS &&
          (response.status === 429 || response.status >= 500)
        ) {
          clearTimeout(timeoutId);
          continue;
        }
        clearTimeout(timeoutId);
        return buildEmptyResult(lastError, accountId);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        clearTimeout(timeoutId);
        return buildEmptyResult('Invalid Claude OAuth usage format', accountId);
      }

      if (!toObject(payload)) {
        clearTimeout(timeoutId);
        return buildEmptyResult('Invalid Claude OAuth usage format', accountId);
      }

      const windows = buildClaudeQuotaWindows(payload as Record<string, unknown>);
      const coreUsage = buildClaudeCoreUsageSummary(windows);

      clearTimeout(timeoutId);

      return {
        success: true,
        windows,
        coreUsage,
        lastUpdated: Date.now(),
        accountId,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      lastError =
        error instanceof Error && error.name === 'AbortError'
          ? 'Claude OAuth usage request timeout'
          : error instanceof Error
            ? error.message
            : 'Unknown error';

      if (verbose) {
        const errorDetails =
          error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error);
        console.error(
          `[!] Claude OAuth usage failed (attempt ${attempt}): ${lastError}${errorDetails ? `\n${errorDetails}` : ''}`
        );
      }

      if (attempt >= CLAUDE_QUOTA_MAX_ATTEMPTS) {
        clearTimeout(timeoutId);
        return buildEmptyResult(lastError, accountId);
      }
    }
  }

  return buildEmptyResult(lastError, accountId);
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
