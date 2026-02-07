/**
 * Token Expiry Checker
 *
 * Inspects token files to determine expiry times and refresh requirements.
 * Supports expiry_date field with fallback to file modification time.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CLIProxyProvider } from '../types';
import { CLIPROXY_PROFILES } from '../../auth/profile-detector';
import { getProviderAccounts, getAccountTokenPath } from '../account-manager';
import { isRefreshDelegated } from './provider-refreshers';

/** Preemptive refresh time: refresh tokens 45 minutes before expiry */
export const PREEMPTIVE_REFRESH_MINUTES = 45;

/** Fallback expiry: assume 50 minutes if no expiry_date field */
export const FALLBACK_EXPIRY_MINUTES = 50;

/** Maximum token file size in bytes (1MB) - prevent DoS from huge files */
const MAX_TOKEN_FILE_SIZE = 1024 * 1024;

/** Token expiry information for a single account */
export interface TokenExpiryInfo {
  /** Provider name */
  provider: CLIProxyProvider;
  /** Account ID */
  accountId: string;
  /** Path to token file */
  tokenFile: string;
  /** Expiry timestamp (Unix ms) */
  expiresAt: number;
  /** Whether token needs refresh (within preemptive window) */
  needsRefresh: boolean;
  /** Token file last modified time */
  lastModified: Date;
}

/**
 * Token file structure
 */
interface TokenData {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number; // Unix timestamp ms
  type?: string;
}

/**
 * Get token expiry info for a specific account
 * @returns null if token file doesn't exist or is invalid
 */
export function getTokenExpiryInfo(
  provider: CLIProxyProvider,
  accountId: string
): TokenExpiryInfo | null {
  const account = getProviderAccounts(provider).find((a) => a.id === accountId);
  if (!account) {
    return null;
  }
  const tokenPath = getAccountTokenPath(account);
  if (!tokenPath || !fs.existsSync(tokenPath)) {
    return null;
  }

  try {
    const stats = fs.statSync(tokenPath);

    // Prevent DoS from huge token files
    if (stats.size > MAX_TOKEN_FILE_SIZE) {
      return null;
    }

    const content = fs.readFileSync(tokenPath, 'utf-8');
    const data: TokenData = JSON.parse(content);

    // Validate refresh_token exists (required for CCS-managed refresh).
    // CLIProxy-delegated providers may not expose refresh_token in token files —
    // CLIProxyAPIPlus manages refresh internally, so skip this check for them.
    if (!isRefreshDelegated(provider)) {
      if (!data.refresh_token || typeof data.refresh_token !== 'string') {
        return null;
      }
    }

    // Calculate expiry time with validation
    let expiresAt: number;
    if (
      data.expiry_date &&
      typeof data.expiry_date === 'number' &&
      Number.isFinite(data.expiry_date) &&
      data.expiry_date > 0
    ) {
      // Use expiry_date field if valid
      expiresAt = data.expiry_date;
    } else {
      // Fallback: use file mtime + 50 minutes
      expiresAt = stats.mtime.getTime() + FALLBACK_EXPIRY_MINUTES * 60 * 1000;
    }

    // Check if needs refresh (within preemptive window)
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    const preemptiveMs = PREEMPTIVE_REFRESH_MINUTES * 60 * 1000;
    const needsRefresh = timeUntilExpiry < preemptiveMs;

    return {
      provider,
      accountId,
      tokenFile: path.basename(tokenPath),
      expiresAt,
      needsRefresh,
      lastModified: stats.mtime,
    };
  } catch {
    return null;
  }
}

/**
 * Get token expiry info for all accounts across all providers
 * @returns Array of token expiry info, excluding invalid tokens
 */
export function getAllTokenExpiryInfo(): TokenExpiryInfo[] {
  const providers: CLIProxyProvider[] = [...CLIPROXY_PROFILES];
  const results: TokenExpiryInfo[] = [];

  for (const provider of providers) {
    const accounts = getProviderAccounts(provider);

    for (const account of accounts) {
      const info = getTokenExpiryInfo(provider, account.id);
      if (info) {
        results.push(info);
      }
    }
  }

  return results;
}
