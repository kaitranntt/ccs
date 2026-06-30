/**
 * Auth file discovery for the Gemini CLI quota fetcher (direct-path credentials).
 *
 * Locates and parses the on-disk Gemini CLI auth file for a given account,
 * supporting both the legacy `gemini-<sanitized>.json` filename and the newer
 * `<email>-gen-lang-client-<projectId>.json` pattern. Scans both the active
 * auth directory and the paused-account directory.
 *
 * Returns the access token, project ID, expiry, and expired flag. The live
 * token is returned only so the caller can place it in an Authorization header;
 * it is never logged by this module or its callers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAuthDir } from '../../config/config-generator';
import { getPausedDir } from '../../accounts/account-manager';
import { isTokenExpired } from '../../auth/auth-utils';
import { sanitizeEmail } from '../../auth/auth-utils';
import { isGeminiAuthFile } from './managed-request';
import { extractAccessToken, extractExpiry, resolveGeminiCliProjectId } from './token-parsing';
import type { GeminiCliAuthData } from './types';

/**
 * Read auth data from a Gemini CLI auth file on disk.
 *
 * Resolution order per auth directory:
 *   1. Exact legacy match: `gemini-<sanitized-account>.json`
 *   2. Directory scan for files matching {@link isGeminiAuthFile}, filtered
 *      by account email/filename and Gemini type.
 *
 * Scans both the active auth dir and the paused-account dir. Returns null if
 * no usable auth file (with an access token) is found.
 */
export function readGeminiCliAuthData(accountId: string): GeminiCliAuthData | null {
  const authDirs = [getAuthDir(), getPausedDir()];
  const sanitizedId = sanitizeEmail(accountId);
  const expectedFiles = [
    `gemini-${sanitizedId}.json`, // Legacy format
    `${accountId}-gen-lang-client-`, // New format prefix (partial match)
  ];

  for (const authDir of authDirs) {
    if (!fs.existsSync(authDir)) continue;

    // Try exact legacy match first
    const legacyPath = path.join(authDir, expectedFiles[0]);
    if (fs.existsSync(legacyPath)) {
      try {
        const content = fs.readFileSync(legacyPath, 'utf-8');
        const data = JSON.parse(content) as Record<string, unknown>;
        const accessToken = extractAccessToken(data);
        if (accessToken) {
          const projectId =
            typeof data.project_id === 'string'
              ? data.project_id
              : resolveGeminiCliProjectId(String(data.account || ''));
          const expiry = extractExpiry(data);

          return {
            accessToken,
            projectId,
            isExpired: isTokenExpired(expiry ?? undefined),
            expiresAt: expiry,
          };
        }
      } catch {
        // Continue to fallback
      }
    }

    // Scan directory for matching files
    const files = fs.readdirSync(authDir);
    for (const file of files) {
      if (!isGeminiAuthFile(file)) continue;

      const candidatePath = path.join(authDir, file);
      try {
        const content = fs.readFileSync(candidatePath, 'utf-8');
        const data = JSON.parse(content) as Record<string, unknown>;

        // Check if this file matches our account
        const fileEmail = typeof data.email === 'string' ? data.email : null;
        const fileType = typeof data.type === 'string' ? data.type : null;
        const matchesEmail = fileEmail === accountId;
        const matchesFilename = file.startsWith(`${accountId}-`) || file.includes(sanitizedId);
        const isGeminiType = fileType === 'gemini' || fileType === 'gemini-cli';

        // Must match account AND be gemini type (or legacy gemini- prefix)
        if ((matchesEmail || matchesFilename) && (isGeminiType || file.startsWith('gemini-'))) {
          const accessToken = extractAccessToken(data);
          if (accessToken) {
            const projectId =
              typeof data.project_id === 'string'
                ? data.project_id
                : resolveGeminiCliProjectId(String(data.account || ''));
            const expiry = extractExpiry(data);

            return {
              accessToken,
              projectId,
              isExpired: isTokenExpired(expiry ?? undefined),
              expiresAt: expiry,
            };
          }
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}
