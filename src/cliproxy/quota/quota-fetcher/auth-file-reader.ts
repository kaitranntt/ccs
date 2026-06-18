/**
 * Auth file reader for Antigravity quota fetching.
 *
 * Reads the local Antigravity auth file (active or paused directory) and
 * extracts the access token, refresh token, project id, and expiry state.
 * Falls back to scanning the directory and matching by the embedded email
 * field when the canonical sanitized filename is not present.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getAuthDir } from '../../config/config-generator';
import type { CLIProxyProvider } from '../../types';
import { isTokenExpired, sanitizeEmail } from '../../auth/auth-utils';
import { getPausedDir } from '../../accounts/account-manager';
import type { AntigravityAuthFile, AuthData } from './types';

/**
 * Read auth data from the auth file (access token, project_id, expiry state).
 * Checks both active and paused auth directories (quota is needed for paused
 * accounts too).
 */
export function readAuthData(provider: CLIProxyProvider, accountId: string): AuthData | null {
  const authDirs = [getAuthDir(), getPausedDir()];

  // Sanitize accountId (email) to match auth file naming: @ and . → _
  const sanitizedId = sanitizeEmail(accountId);
  const prefix = provider === 'agy' ? 'antigravity-' : `${provider}-`;
  const expectedFile = `${prefix}${sanitizedId}.json`;

  for (const authDir of authDirs) {
    if (!fs.existsSync(authDir)) continue;

    const filePath = path.join(authDir, expectedFile);

    // Direct file access (most common case)
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as AntigravityAuthFile;
        if (!data.access_token) continue;
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || null,
          projectId: data.project_id || null,
          isExpired: isTokenExpired(data.expired),
          expiresAt: data.expired || null,
        };
      } catch {
        continue;
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
  }

  return null;
}

/**
 * Read project ID directly from auth file without making an API call.
 * Used for quick project ID comparison in the doctor command.
 */
export function readProjectIdFromAuthFile(
  provider: CLIProxyProvider,
  accountId: string
): string | null {
  const authData = readAuthData(provider, accountId);
  return authData?.projectId || null;
}
