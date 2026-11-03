/**
 * Token file operations and path management
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCliproxyDir, getAuthDir } from '../config/config-generator';
import type { CLIProxyProvider } from '../types';
import { AccountInfo } from './types';
export { getAccountsRegistryPath } from './registry-config';

/**
 * Get path to accounts registry file
 */
export interface RecoverableTokenFile {
  tokenFile: string;
  filePath: string;
  paused: boolean;
}

interface ListRecoverableTokenFilesOptions {
  includePaused?: boolean;
}

/**
 * Get path to paused tokens directory
 * Paused tokens are moved here so CLIProxyAPI won't discover them
 *
 * Uses sibling directory (auth-paused/) instead of subdirectory (auth/paused/)
 * because CLIProxyAPI's watcher uses filepath.Walk() which recursively scans
 * all subdirectories of auth/. A sibling directory is completely outside
 * CLIProxyAPI's scan path, preventing token refresh loops.
 */
export function getPausedDir(): string {
  return path.join(getCliproxyDir(), 'auth-paused');
}

/**
 * List token files that can be used to rebuild the accounts registry.
 * Active auth tokens win over paused duplicates with the same filename.
 */
export function listRecoverableTokenFiles(
  options: ListRecoverableTokenFilesOptions = {}
): RecoverableTokenFile[] {
  const tokenFiles: RecoverableTokenFile[] = [];
  const seen = new Set<string>();
  const sources = [{ dir: getAuthDir(), paused: false }];

  if (options.includePaused) {
    sources.push({ dir: getPausedDir(), paused: true });
  }

  for (const source of sources) {
    if (!fs.existsSync(source.dir)) {
      continue;
    }

    for (const tokenFile of fs.readdirSync(source.dir)) {
      if (!tokenFile.endsWith('.json') || seen.has(tokenFile)) {
        continue;
      }

      tokenFiles.push({
        tokenFile,
        filePath: path.join(source.dir, tokenFile),
        paused: source.paused,
      });
      seen.add(tokenFile);
    }
  }

  return tokenFiles;
}

/**
 * Get token file path for an account
 * Returns path in paused/ dir if account is paused, otherwise auth/
 */
export function getAccountTokenPath(account: AccountInfo): string {
  const baseDir = account.paused ? getPausedDir() : getAuthDir();
  return path.join(baseDir, account.tokenFile);
}

/**
 * Move token file to paused directory
 * Creates paused directory if needed, idempotent
 */
export function moveTokenToPaused(tokenFile: string): boolean {
  const authDir = getAuthDir();
  const pausedDir = getPausedDir();
  const tokenPath = path.join(authDir, tokenFile);
  const pausedPath = path.join(pausedDir, tokenFile);

  // Skip if already in paused directory
  if (!fs.existsSync(tokenPath)) {
    return true;
  }

  try {
    // Create paused directory if it doesn't exist
    if (!fs.existsSync(pausedDir)) {
      fs.mkdirSync(pausedDir, { recursive: true, mode: 0o700 });
    }
    fs.renameSync(tokenPath, pausedPath);
    return true;
  } catch {
    // File operation failed, caller handles recovery
    return false;
  }
}

/**
 * Move token file from paused directory back to auth
 * Idempotent
 */
export function moveTokenFromPaused(tokenFile: string): boolean {
  const authDir = getAuthDir();
  const pausedDir = getPausedDir();
  const tokenPath = path.join(authDir, tokenFile);
  const pausedPath = path.join(pausedDir, tokenFile);

  // Skip if already in auth directory
  if (!fs.existsSync(pausedPath)) {
    return true;
  }

  try {
    fs.renameSync(pausedPath, tokenPath);
    return true;
  } catch {
    // File operation failed, caller handles recovery
    return false;
  }
}

/**
 * Delete token file from both auth and paused directories
 * Idempotent
 */
export function deleteTokenFile(tokenFile: string): boolean {
  const tokenPath = path.join(getAuthDir(), tokenFile);
  const pausedPath = path.join(getPausedDir(), tokenFile);
  let success = true;

  // Delete from auth directory
  if (fs.existsSync(tokenPath)) {
    try {
      fs.unlinkSync(tokenPath);
    } catch {
      success = false;
    }
  }

  // Also delete from paused directory if it exists there
  if (fs.existsSync(pausedPath)) {
    try {
      fs.unlinkSync(pausedPath);
    } catch {
      success = false;
    }
  }

  return success;
}

/**
 * Check if token file exists in either auth or paused directory
 */
export function tokenFileExists(tokenFile: string): boolean {
  const tokenPath = path.join(getAuthDir(), tokenFile);
  const pausedPath = path.join(getPausedDir(), tokenFile);
  return fs.existsSync(tokenPath) || fs.existsSync(pausedPath);
}

/**
 * Extract unique account ID from token filename when email is unavailable
 * For Kiro/GHCP OAuth, filenames are: <provider>-<oauth>-<profile_id>.json
 * Extracts: <oauth>-<profile_id> as unique identifier
 * @example kiro-github-ABC123.json → github-ABC123
 * @example ghcp-amazon-XYZ789.json → amazon-XYZ789
 * @example kiro-nomail.json → default (no OAuth structure)
 */
export function extractAccountIdFromTokenFile(filename: string, email?: string): string {
  if (email) return email;

  // Pattern: <provider>-<oauth>-<profile_id>.json → extract <oauth>-<profile_id>
  // Requires at least 2 hyphens to distinguish from simple filenames like "kiro-nomail.json"
  const match = filename.match(/^[^-]+-([^-]+-[^.]+)\.json$/);
  if (match) return match[1];

  return 'default';
}

/**
 * Derive a collision-safe internal account ID for providers that may not expose email.
 * Reuses the existing entry when the token file is already known, otherwise prefers the
 * filename-derived ID before falling back to provider-scoped sequential IDs.
 */
export function deriveNoEmailProviderAccountId(
  provider: CLIProxyProvider,
  tokenFile: string,
  existingAccounts: Record<string, Pick<AccountInfo, 'tokenFile' | 'nickname'>>
): string {
  const existingEntries = Object.entries(existingAccounts);
  const existingEntry = existingEntries.find(([, account]) => account.tokenFile === tokenFile);
  if (existingEntry) {
    return existingEntry[0];
  }

  const extractedId = extractAccountIdFromTokenFile(tokenFile);
  const lowerExtractedId = extractedId.toLowerCase();

  if (
    extractedId !== 'default' &&
    !existingEntries.some(
      ([existingId, account]) =>
        existingId.toLowerCase() === lowerExtractedId ||
        account.nickname?.toLowerCase() === lowerExtractedId
    )
  ) {
    return extractedId;
  }

  let index = 1;
  while (
    existingEntries.some(
      ([existingId, account]) =>
        existingId.toLowerCase() === `${provider}-${index}` ||
        account.nickname?.toLowerCase() === `${provider}-${index}`
    )
  ) {
    index++;
  }

  return `${provider}-${index}`;
}

/**
 * Generate nickname from email
 * Takes prefix before @ symbol, sanitizes whitespace
 * Validation: 1-50 chars, any non-whitespace (permissive per user preference)
 */
export function generateNickname(email?: string): string {
  if (!email) return 'default';
  const prefix = email.split('@')[0];
  // Sanitize: remove whitespace, limit to 50 chars
  return prefix.replace(/\s+/g, '').slice(0, 50) || 'default';
}

/**
 * Validate nickname
 * Rules: 1-50 chars, no whitespace, URL-safe, no reserved patterns
 * @returns null if valid, error message if invalid
 */
export function validateNickname(nickname: string): string | null {
  if (!nickname || nickname.length === 0) {
    return 'Nickname is required';
  }
  if (nickname.length > 50) {
    return 'Nickname must be 50 characters or less';
  }
  if (/\s/.test(nickname)) {
    return 'Nickname cannot contain whitespace';
  }
  // Block URL-unsafe chars that break routing
  if (/[%\/&?#]/.test(nickname)) {
    return 'Nickname cannot contain special URL characters (%, /, &, ?, #)';
  }
  // Block reserved patterns used by auto-discovery (kiro-1, ghcp-2, etc.)
  if (/^(kiro|ghcp)-\d+$/i.test(nickname)) {
    return 'Nickname cannot match reserved pattern (kiro-N, ghcp-N)';
  }
  return null;
}

/**
 * Check whether a nickname would collide with any existing account ID or nickname.
 */
export function hasAccountNameConflict(
  accounts: Array<Pick<AccountInfo, 'id' | 'nickname'>>,
  candidateName: string,
  excludeAccountId?: string
): boolean {
  const normalizedCandidate = candidateName.toLowerCase();
  const normalizedExcludedId = excludeAccountId?.toLowerCase();

  return accounts.some((account) => {
    if (normalizedExcludedId && account.id.toLowerCase() === normalizedExcludedId) {
      return false;
    }

    return (
      account.id.toLowerCase() === normalizedCandidate ||
      account.nickname?.toLowerCase() === normalizedCandidate
    );
  });
}

/**
 * Find the existing account that already owns the supplied id/nickname.
 */
export function findAccountNameMatch(
  accounts: Array<Pick<AccountInfo, 'id' | 'nickname'>>,
  candidateName: string
): Pick<AccountInfo, 'id' | 'nickname'> | null {
  const normalizedCandidate = candidateName.toLowerCase();

  return (
    accounts.find(
      (account) =>
        account.id.toLowerCase() === normalizedCandidate ||
        account.nickname?.toLowerCase() === normalizedCandidate
    ) || null
  );
}
