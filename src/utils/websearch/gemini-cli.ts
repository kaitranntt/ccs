/**
 * Gemini CLI Detection
 *
 * Detects and manages Gemini CLI installation status.
 *
 * @module utils/websearch/gemini-cli
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import type { GeminiCliStatus } from './types';

// Cache for Gemini CLI status (per process)
let geminiCliCache: GeminiCliStatus | null = null;

/**
 * Check if Gemini CLI is installed globally
 *
 * Requires global install: `npm install -g @google/gemini-cli`
 * No npx fallback - must be in PATH
 *
 * @returns Gemini CLI status with path and version
 */
export function getGeminiCliStatus(options?: { fetchVersion?: boolean }): GeminiCliStatus {
  const fetchVersion = options?.fetchVersion !== false;

  if (
    geminiCliCache &&
    (!fetchVersion || geminiCliCache.version !== undefined || !geminiCliCache.installed)
  ) {
    if (!fetchVersion) {
      return { ...geminiCliCache, version: undefined };
    }
    return geminiCliCache;
  }

  const result: GeminiCliStatus = geminiCliCache
    ? { ...geminiCliCache }
    : {
        installed: false,
        path: undefined,
        version: undefined,
      };

  try {
    if (!geminiCliCache) {
      const isWindows = process.platform === 'win32';
      const whichCmd = isWindows ? 'where gemini' : 'which gemini';

      const pathResult = execSync(whichCmd, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const geminiPath = pathResult.trim().split('\n')[0];

      if (geminiPath) {
        result.installed = true;
        result.path = geminiPath;
      }
    }

    if (result.installed && fetchVersion && result.version === undefined) {
      try {
        const versionResult = execSync('gemini --version', {
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        result.version = versionResult.trim();
      } catch {
        result.version = 'unknown';
      }
    } else if (!fetchVersion) {
      result.version = undefined;
    }
  } catch {
    // Command not found - Gemini CLI not installed
  }

  geminiCliCache = result;
  return fetchVersion ? result : { ...result, version: undefined };
}

/**
 * Check if Gemini CLI is available (quick boolean check)
 */
export function hasGeminiCli(): boolean {
  return getGeminiCliStatus().installed;
}

/**
 * Check if Gemini CLI is authenticated
 *
 * Gemini CLI stores OAuth credentials in ~/.gemini/oauth_creds.json
 * Authentication is done by running `gemini` which opens browser for OAuth.
 * Note: There is NO `gemini auth login` command - just run `gemini` to authenticate.
 *
 * @returns true if oauth_creds.json exists with access_token
 */
export function isGeminiAuthenticated(): boolean {
  const oauthPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');

  if (!fs.existsSync(oauthPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(oauthPath, 'utf8');
    const creds = JSON.parse(content);
    // Check if access_token exists (doesn't validate expiry - Gemini CLI handles refresh)
    return !!creds.access_token;
  } catch {
    return false;
  }
}

/**
 * Clear Gemini CLI cache (for testing or after installation)
 */
export function clearGeminiCliCache(): void {
  geminiCliCache = null;
}
