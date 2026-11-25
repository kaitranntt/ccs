/**
 * Token Manager for CLIProxyAPI
 *
 * Handles OAuth token storage, retrieval, and validation.
 * Tokens are stored in ~/.ccs/cliproxy/auth/ directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { CLIProxyProvider } from '../types';
import { CLIPROXY_PROFILES } from '../../auth/profile-detector';
import { getProviderAuthDir } from '../config/config-generator';
import {
  getProviderAccounts,
  getDefaultAccount,
  loadAccountsRegistry,
} from '../accounts/account-manager';
import { deleteTokenFile, extractAccountIdFromTokenFile } from '../accounts/token-file-ops';
import {
  buildEmailBackedAccountId,
  extractAccountVariantFromAccountId,
  extractCanonicalEmailFromAccountId,
  extractEmailAccountVariantKey,
  supportsDuplicateEmailAccounts,
} from '../accounts/email-account-identity';
import { getTokenRefreshOwnership } from '../provider-capabilities';
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

export type ProviderTokenSnapshot = {
  file: string;
  mtimeMs: number;
  accountId?: string;
  email?: string;
  variantAccountId?: string;
  lastRefresh?: string;
  fingerprint?: string;
};

type TokenCandidate = {
  file: string;
  filePath: string;
  email?: string;
  projectId?: string;
  accountId: string;
  variantAccountId?: string;
  lastRefresh?: string;
  mtimeMs: number;
  alreadyRegistered: boolean;
  fingerprint: string;
};

type RawTokenCandidate = Omit<TokenCandidate, 'accountId' | 'variantAccountId' | 'fingerprint'> & {
  content: string;
};

function buildTokenFingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function listTokenCandidates(provider: CLIProxyProvider, tokenDir: string): TokenCandidate[] {
  if (!fs.existsSync(tokenDir)) {
    return [];
  }

  const files = fs.readdirSync(tokenDir);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  const existingAccounts = getProviderAccounts(provider);
  const rawCandidates: RawTokenCandidate[] = jsonFiles.flatMap((file) => {
    const filePath = path.join(tokenDir, file);
    if (!isTokenFileForProvider(filePath, provider)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as {
      email?: string;
      project_id?: string;
      last_refresh?: string;
    };
    const email = data.email || undefined;
    const projectId = data.project_id || undefined;
    const lastRefresh =
      typeof data.last_refresh === 'string' && data.last_refresh.trim()
        ? data.last_refresh.trim()
        : undefined;
    const stats = fs.statSync(filePath);

    return [
      {
        file,
        filePath,
        content,
        email,
        projectId,
        lastRefresh,
        mtimeMs: stats.mtimeMs,
        alreadyRegistered: existingAccounts.some((account) => account.tokenFile === file),
      },
    ];
  });

  const duplicateEmailCounts = new Map<string, number>();
  const duplicateEmailTokenSets = new Map<string, Set<string>>();
  for (const account of existingAccounts) {
    if (!account.email) continue;
    const key = account.email.toLowerCase();
    const tokenSet = duplicateEmailTokenSets.get(key) ?? new Set<string>();
    tokenSet.add(account.tokenFile);
    duplicateEmailTokenSets.set(key, tokenSet);
  }
  for (const candidate of rawCandidates) {
    if (!candidate.email) continue;
    const key = candidate.email.toLowerCase();
    const tokenSet = duplicateEmailTokenSets.get(key) ?? new Set<string>();
    tokenSet.add(candidate.file);
    duplicateEmailTokenSets.set(key, tokenSet);
  }
  for (const [key, tokenSet] of duplicateEmailTokenSets) {
    duplicateEmailCounts.set(key, tokenSet.size);
  }

  return rawCandidates
    .map((rawCandidate) => {
      const duplicateEmailCount = rawCandidate.email
        ? (duplicateEmailCounts.get(rawCandidate.email.toLowerCase()) ?? 1)
        : 1;
      const accountId = rawCandidate.email
        ? buildEmailBackedAccountId(
            provider,
            rawCandidate.file,
            rawCandidate.email,
            duplicateEmailCount
          )
        : extractAccountIdFromTokenFile(rawCandidate.file, rawCandidate.email);
      const variantAccountId =
        rawCandidate.email && supportsDuplicateEmailAccounts(provider)
          ? buildEmailBackedAccountId(provider, rawCandidate.file, rawCandidate.email, 2)
          : undefined;

      return {
        ...rawCandidate,
        accountId,
        variantAccountId:
          variantAccountId && variantAccountId !== accountId ? variantAccountId : undefined,
        fingerprint: buildTokenFingerprint(rawCandidate.content),
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
}

export function listProviderTokenSnapshots(
  provider: CLIProxyProvider,
  tokenDir: string = getProviderTokenDir(provider)
): ProviderTokenSnapshot[] {
  return listTokenCandidates(provider, tokenDir).map((candidate) => ({
    file: candidate.file,
    mtimeMs: candidate.mtimeMs,
    accountId: candidate.accountId,
    ...(candidate.email ? { email: candidate.email } : {}),
    ...(candidate.variantAccountId ? { variantAccountId: candidate.variantAccountId } : {}),
    ...(candidate.lastRefresh ? { lastRefresh: candidate.lastRefresh } : {}),
    fingerprint: candidate.fingerprint,
  }));
}

function getSnapshotCanonicalEmail(snapshot: {
  email?: string;
  accountId?: string;
}): string | null {
  const directEmail = snapshot.email?.trim();
  if (directEmail && directEmail.includes('@')) {
    return directEmail;
  }
  return snapshot.accountId ? extractCanonicalEmailFromAccountId(snapshot.accountId) : null;
}

function isVariantCompatible(
  snapshot: { file: string; accountId?: string; variantAccountId?: string },
  expectedVariant: string | null,
  canonicalEmail: string
): boolean {
  if (!expectedVariant) {
    return true;
  }

  const normalizedExpected = expectedVariant.toLowerCase();
  if (snapshot.variantAccountId) {
    const snapshotVariant = extractAccountVariantFromAccountId(snapshot.variantAccountId);
    return !snapshotVariant || snapshotVariant.toLowerCase() === normalizedExpected;
  }

  if (snapshot.accountId) {
    const accountVariant = extractAccountVariantFromAccountId(snapshot.accountId);
    if (accountVariant) {
      return accountVariant.toLowerCase() === normalizedExpected;
    }
  }

  for (const provider of ['claude', 'codex'] as const) {
    if (snapshot.file.toLowerCase().startsWith(`${provider}-`)) {
      const fileVariant = extractEmailAccountVariantKey(provider, snapshot.file, canonicalEmail);
      if (fileVariant) {
        return fileVariant.toLowerCase() === normalizedExpected;
      }
    }
  }

  return true;
}

function matchesExpectedSnapshot<
  T extends {
    file: string;
    accountId?: string;
    email?: string;
    variantAccountId?: string;
  },
>(
  snapshot: T,
  allSnapshots: readonly T[],
  expectedAccountId?: string,
  expectedTokenFile?: string
): boolean {
  if (expectedTokenFile && snapshot.file === expectedTokenFile) {
    return true;
  }

  if (!expectedAccountId) {
    return false;
  }

  if (
    snapshot.file === expectedAccountId ||
    snapshot.accountId === expectedAccountId ||
    snapshot.variantAccountId === expectedAccountId
  ) {
    return true;
  }

  const expectedEmail = extractCanonicalEmailFromAccountId(expectedAccountId);
  if (!expectedEmail) {
    return false;
  }

  const normalizedExpectedEmail = expectedEmail.toLowerCase();
  const snapshotEmail = getSnapshotCanonicalEmail(snapshot);
  if (!snapshotEmail || snapshotEmail.toLowerCase() !== normalizedExpectedEmail) {
    return false;
  }

  const sameEmailSnapshots = allSnapshots.filter(
    (candidate) => getSnapshotCanonicalEmail(candidate)?.toLowerCase() === normalizedExpectedEmail
  );
  if (sameEmailSnapshots.length !== 1) {
    return false;
  }

  return isVariantCompatible(
    snapshot,
    extractAccountVariantFromAccountId(expectedAccountId),
    expectedEmail
  );
}

function hasSnapshotChanged(current: ProviderTokenSnapshot, known: ProviderTokenSnapshot): boolean {
  if (current.fingerprint !== known.fingerprint || current.mtimeMs !== known.mtimeMs) {
    return true;
  }
  return current.lastRefresh !== undefined && current.lastRefresh !== known.lastRefresh;
}

function resolveExpectedTokenFile(
  provider: CLIProxyProvider,
  expectedAccountId: string
): string | undefined {
  const existingAccounts = getProviderAccounts(provider);
  const directMatch = existingAccounts.find((account) => account.id === expectedAccountId);
  if (directMatch) {
    return directMatch.tokenFile;
  }

  const persistedAccount = loadAccountsRegistry().providers[provider]?.accounts[expectedAccountId];
  if (persistedAccount) {
    return persistedAccount.tokenFile;
  }

  const expectedEmail = extractCanonicalEmailFromAccountId(expectedAccountId);
  if (!expectedEmail) {
    return undefined;
  }

  const normalizedExpectedEmail = expectedEmail.toLowerCase();
  const emailMatches = existingAccounts.filter((account) => {
    const accountEmail =
      account.email?.trim() || extractCanonicalEmailFromAccountId(account.id) || '';
    return accountEmail.toLowerCase() === normalizedExpectedEmail;
  });
  if (emailMatches.length !== 1) {
    return undefined;
  }

  const candidate = emailMatches[0];
  const expectedVariant = extractAccountVariantFromAccountId(expectedAccountId);
  return isVariantCompatible(
    { file: candidate.tokenFile, accountId: candidate.id },
    expectedVariant,
    expectedEmail
  )
    ? candidate.tokenFile
    : undefined;
}

export function findNewTokenSnapshot(
  currentTokenFiles: ProviderTokenSnapshot[],
  knownTokenFiles: ProviderTokenSnapshot[],
  expectedAccountId?: string,
  expectedTokenFile?: string
): ProviderTokenSnapshot | null {
  const knownSnapshotsByFile = new Map(
    knownTokenFiles.map((snapshot) => [snapshot.file, snapshot])
  );

  if (!expectedAccountId && !expectedTokenFile) {
    const brandNewSnapshot = currentTokenFiles.find(
      (snapshot) => !knownSnapshotsByFile.has(snapshot.file)
    );
    if (brandNewSnapshot) {
      return brandNewSnapshot;
    }

    return (
      currentTokenFiles.find((snapshot) => {
        const knownSnapshot = knownSnapshotsByFile.get(snapshot.file);
        return Boolean(knownSnapshot && hasSnapshotChanged(snapshot, knownSnapshot));
      }) || null
    );
  }

  return (
    currentTokenFiles.find((snapshot) => {
      if (
        !matchesExpectedSnapshot(snapshot, currentTokenFiles, expectedAccountId, expectedTokenFile)
      ) {
        return false;
      }

      const knownSnapshot = knownSnapshotsByFile.get(snapshot.file);
      if (!knownSnapshot) {
        return true;
      }

      return hasSnapshotChanged(snapshot, knownSnapshot);
    }) || null
  );
}

export function findNewTokenSnapshotForAuthAttempt(
  provider: CLIProxyProvider,
  tokenDir: string,
  knownTokenFiles: ProviderTokenSnapshot[],
  expectedAccountId?: string,
  expectedTokenFile?: string
): ProviderTokenSnapshot | null {
  const resolvedTokenFile =
    expectedTokenFile ||
    (expectedAccountId ? resolveExpectedTokenFile(provider, expectedAccountId) : undefined);

  return findNewTokenSnapshot(
    listProviderTokenSnapshots(provider, tokenDir),
    knownTokenFiles,
    expectedAccountId,
    resolvedTokenFile
  );
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
  const providers: CLIProxyProvider[] = [...CLIPROXY_PROFILES];
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
  nickname?: string,
  verbose = false,
  expectedAccountId?: string
): import('../accounts/account-manager').AccountInfo | null {
  const { registerAccount } = require('../accounts/account-manager');
  let selectedCandidate: Omit<TokenCandidate, 'mtimeMs'> | null = null;
  try {
    const candidates = listTokenCandidates(provider, tokenDir);

    if (expectedAccountId) {
      const expectedTokenFile = resolveExpectedTokenFile(provider, expectedAccountId);
      selectedCandidate =
        candidates.find((candidate) => candidate.accountId === expectedAccountId) ||
        candidates.find((candidate) => candidate.file === expectedAccountId) ||
        candidates.find((candidate) =>
          matchesExpectedSnapshot(candidate, candidates, expectedAccountId, expectedTokenFile)
        ) ||
        null;
    } else {
      selectedCandidate = candidates[0] || null;
    }

    if (!selectedCandidate) {
      if (verbose && expectedAccountId) {
        console.error(
          `[auth] No token matched the expected account ${expectedAccountId}; refusing ambiguous registration`
        );
      }
      return null;
    }

    const account = registerAccount(
      provider,
      selectedCandidate.file,
      selectedCandidate.email,
      nickname,
      selectedCandidate.projectId
    );

    uploadTokenToRemoteAsync(selectedCandidate.filePath, verbose);
    return account;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (verbose) {
      console.error(`[auth] Failed to register token-backed account: ${message}`);
    }

    if (selectedCandidate && !selectedCandidate.alreadyRegistered && !expectedAccountId) {
      deleteTokenFile(selectedCandidate.file);
    }

    if (expectedAccountId && verbose) {
      console.error(
        `[auth] Reauthentication target ${expectedAccountId} did not resolve cleanly from the new token`
      );
    }

    return null;
  }
}

/**
 * Upload token to remote server asynchronously (fire and forget).
 * Only runs if remote mode is enabled. Logs success/failure via uploadTokenToRemote.
 * Does not block the OAuth flow - local token is always valid regardless of upload result.
 *
 * @param tokenPath - Path to the token file
 * @param verbose - Enable verbose logging for upload progress
 */
function uploadTokenToRemoteAsync(tokenPath: string, verbose: boolean): void {
  // Dynamic import to avoid circular dependencies
  import('../management/remote-token-uploader')
    .then(({ uploadTokenToRemote, isRemoteUploadEnabled }) => {
      if (isRemoteUploadEnabled()) {
        // uploadTokenToRemote handles its own success/failure logging
        // On failure, show additional warning so users know local token is still valid
        uploadTokenToRemote(tokenPath, verbose)
          .then((success) => {
            if (!success) {
              console.error(
                '\n[!] Remote upload failed - token saved locally only. Run "ccs tokens upload" to retry.'
              );
            }
          })
          .catch((err: unknown) => {
            // Unexpected error (not handled by uploadTokenToRemote)
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[token-manager] Unexpected upload error: ${message}`);
            console.error(
              '[!] Token saved locally. Run "ccs tokens upload" to sync to remote server.'
            );
          });
      }
    })
    .catch((err: unknown) => {
      // Module load failed - log for debugging
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[token-manager] Failed to load remote-token-uploader: ${message}`);
    });
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
 * Refresh responsibility:
 * - gemini: CCS refreshes directly via Google OAuth
 * - codex, agy, kiro, ghcp, iflow: CLIProxyAPIPlus handles refresh
 *   automatically in background (e.g. kiro refreshes every 1 min).
 *   CCS only checks if token file exists (authentication state).
 * - qwen: account linking is unsupported by the bundled CLIProxy runtime
 * - claude: not yet implemented
 *
 * @param provider The CLIProxy provider
 * @param verbose Log progress if true
 * @returns Object with valid status and whether refresh occurred
 */
export async function ensureTokenValid(
  provider: CLIProxyProvider,
  _verbose = false
): Promise<{ valid: boolean; refreshed: boolean; error?: string }> {
  if (getTokenRefreshOwnership(provider) === 'ccs') {
    return {
      valid: false,
      refreshed: false,
      error: `CCS-managed token validation is not available for ${provider}`,
    };
  }

  // Runtime-managed providers refresh upstream. CCS only verifies auth material exists locally.
  return { valid: isAuthenticated(provider), refreshed: false };
}
