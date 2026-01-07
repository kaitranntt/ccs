/**
 * Token Manager for CLIProxyAPI
 *
 * Handles OAuth token storage, retrieval, and validation.
 * Tokens are stored in ~/.ccs/cliproxy/auth/ directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CLIProxyProvider } from '../types';
import { getProviderAuthDir } from '../config-generator';
import { getProviderAccounts, getDefaultAccount } from '../account-manager';
import {
  AuthStatus,
  PROVIDER_AUTH_PREFIXES,
  PROVIDER_TYPE_VALUES,
  getOAuthConfig,
} from './auth-types';

/**
 * Get token directory for provider
 */
export function getProviderTokenDir(provider: CLIProxyProvider): string {
  return getProviderAuthDir(provider);
}

/**
 * Check if a JSON file contains a token for the given provider
 * Reads the file and checks the "type" field
 */
export function isTokenFileForProvider(filePath: string, provider: CLIProxyProvider): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const typeValue = (data.type || '').toLowerCase();
    const validTypes = PROVIDER_TYPE_VALUES[provider] || [];
    return validTypes.includes(typeValue);
  } catch {
    return false;
  }
}

/**
 * Check if provider has valid authentication
 * CLIProxyAPI stores OAuth tokens as JSON files in the auth directory.
 * Detection strategy:
 * 1. First check by filename prefix (fast path)
 * 2. If no match, check JSON content for "type" field (Gemini uses {email}-{projectID}.json without prefix)
 */
export function isAuthenticated(provider: CLIProxyProvider): boolean {
  const tokenDir = getProviderTokenDir(provider);

  if (!fs.existsSync(tokenDir)) {
    return false;
  }

  const validPrefixes = PROVIDER_AUTH_PREFIXES[provider] || [];

  try {
    const files = fs.readdirSync(tokenDir);
    const jsonFiles = files.filter(
      (f) => f.endsWith('.json') || f.endsWith('.token') || f === 'credentials'
    );

    // Strategy 1: Check by filename prefix (fast path for antigravity, codex)
    const prefixMatch = jsonFiles.some((f) => {
      const lowerFile = f.toLowerCase();
      return validPrefixes.some((prefix) => lowerFile.startsWith(prefix));
    });
    if (prefixMatch) return true;

    // Strategy 2: Check JSON content for "type" field (needed for Gemini)
    for (const f of jsonFiles) {
      const filePath = path.join(tokenDir, f);
      if (isTokenFileForProvider(filePath, provider)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get detailed auth status for provider
 * Uses same detection strategy as isAuthenticated: prefix first, then content
 */
export function getAuthStatus(provider: CLIProxyProvider): AuthStatus {
  const tokenDir = getProviderTokenDir(provider);
  let tokenFiles: string[] = [];
  let lastAuth: Date | undefined;

  const validPrefixes = PROVIDER_AUTH_PREFIXES[provider] || [];

  if (fs.existsSync(tokenDir)) {
    const files = fs.readdirSync(tokenDir);
    const jsonFiles = files.filter(
      (f) => f.endsWith('.json') || f.endsWith('.token') || f === 'credentials'
    );

    // Check each file: by prefix OR by content
    tokenFiles = jsonFiles.filter((f) => {
      const lowerFile = f.toLowerCase();
      // Strategy 1: prefix match
      if (validPrefixes.some((prefix) => lowerFile.startsWith(prefix))) {
        return true;
      }
      // Strategy 2: content match (for Gemini tokens without prefix)
      const filePath = path.join(tokenDir, f);
      return isTokenFileForProvider(filePath, provider);
    });

    // Get most recent modification time
    for (const file of tokenFiles) {
      const filePath = path.join(tokenDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (!lastAuth || stats.mtime > lastAuth) {
          lastAuth = stats.mtime;
        }
      } catch {
        // Skip if can't stat file
      }
    }
  }

  // Get registered accounts for multi-account support
  const accounts = getProviderAccounts(provider);
  const defaultAccount = getDefaultAccount(provider);

  return {
    provider,
    authenticated: tokenFiles.length > 0,
    tokenDir,
    tokenFiles,
    lastAuth,
    accounts,
    defaultAccount: defaultAccount?.id,
  };
}

/**
 * Get auth status for all providers
 */
export function getAllAuthStatus(): AuthStatus[] {
  const providers: CLIProxyProvider[] = ['gemini', 'codex', 'agy', 'qwen', 'iflow', 'kiro', 'ghcp'];
  return providers.map(getAuthStatus);
}

/**
 * Clear authentication for provider
 * Only removes files belonging to the specified provider (by prefix or content)
 * Does NOT remove the shared auth directory or other providers' files
 */
export function clearAuth(provider: CLIProxyProvider): boolean {
  const tokenDir = getProviderTokenDir(provider);

  if (!fs.existsSync(tokenDir)) {
    return false;
  }

  const validPrefixes = PROVIDER_AUTH_PREFIXES[provider] || [];
  const files = fs.readdirSync(tokenDir);
  let removedCount = 0;

  // Only remove files that belong to this provider
  for (const file of files) {
    const filePath = path.join(tokenDir, file);
    const lowerFile = file.toLowerCase();

    // Check by prefix first (fast path)
    const matchesByPrefix = validPrefixes.some((prefix) => lowerFile.startsWith(prefix));

    // If no prefix match, check by content (for Gemini tokens without prefix)
    const matchesByContent = !matchesByPrefix && isTokenFileForProvider(filePath, provider);

    if (matchesByPrefix || matchesByContent) {
      try {
        fs.unlinkSync(filePath);
        removedCount++;
      } catch {
        // Failed to remove - skip
      }
    }
  }

  // DO NOT remove the shared auth directory - other providers may still have tokens
  return removedCount > 0;
}

/**
 * Register account from newly created token file
 * Scans auth directory for new token and extracts email
 * @param provider - The CLIProxy provider
 * @param tokenDir - Directory containing token files
 * @param nickname - Optional nickname (uses auto-generated from email if not provided)
 */
export function registerAccountFromToken(
  provider: CLIProxyProvider,
  tokenDir: string,
  nickname?: string
): import('../account-manager').AccountInfo | null {
  const { registerAccount, generateNickname } = require('../account-manager');
  try {
    const files = fs.readdirSync(tokenDir);
    const jsonFiles = files.filter((f: string) => f.endsWith('.json'));

    let newestFile: string | null = null;
    let newestMtime = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(tokenDir, file);
      if (!isTokenFileForProvider(filePath, provider)) continue;

      const stats = fs.statSync(filePath);
      if (stats.mtimeMs > newestMtime) {
        newestMtime = stats.mtimeMs;
        newestFile = file;
      }
    }

    if (!newestFile) {
      return null;
    }

    const tokenPath = path.join(tokenDir, newestFile);
    const content = fs.readFileSync(tokenPath, 'utf-8');
    const data = JSON.parse(content);
    const email = data.email || undefined;

    return registerAccount(provider, newestFile, email, nickname || generateNickname(email));
  } catch {
    return null;
  }
}

/**
 * Display auth status for all providers
 */
export function displayAuthStatus(): void {
  console.log('CLIProxy Authentication Status:');
  console.log('');

  const statuses = getAllAuthStatus();

  for (const status of statuses) {
    const oauthConfig = getOAuthConfig(status.provider);
    const icon = status.authenticated ? '[OK]' : '[!]';
    const authStatus = status.authenticated ? 'Authenticated' : 'Not authenticated';
    const lastAuthStr = status.lastAuth ? ` (last: ${status.lastAuth.toLocaleDateString()})` : '';

    console.log(`${icon} ${oauthConfig.displayName}: ${authStatus}${lastAuthStr}`);
  }

  console.log('');
  console.log('To authenticate: ccs <provider> --auth');
  console.log('To logout:       ccs <provider> --logout');
}

/**
 * Ensure OAuth token is valid for provider, refreshing if expired or expiring soon.
 * This prevents UND_ERR_SOCKET errors caused by expired tokens during API calls.
 *
 * @param provider The CLIProxy provider
 * @param verbose Log progress if true
 * @returns Object with valid status and whether refresh occurred
 */
export async function ensureTokenValid(
  provider: CLIProxyProvider,
  verbose = false
): Promise<{ valid: boolean; refreshed: boolean; error?: string }> {
  // Currently only Gemini uses oauth_creds.json with expiry_date
  // Other providers (agy, codex) use CLIProxyAPI's internal auth management
  if (provider === 'gemini') {
    const { ensureGeminiTokenValid } = await import('./gemini-token-refresh');
    return ensureGeminiTokenValid(verbose);
  }

  // For other providers, assume token is valid if authenticated
  // CLIProxyAPI handles token refresh internally for antigravity/codex
  return { valid: isAuthenticated(provider), refreshed: false };
}
