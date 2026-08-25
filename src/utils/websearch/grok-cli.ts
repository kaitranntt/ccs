/**
 * Grok CLI Detection
 *
 * Detects and manages Grok CLI installation status.
 *
 * @module utils/websearch/grok-cli
 */

import { execSync } from 'child_process';
import type { GrokCliStatus } from './types';

// Cache for Grok CLI status (per process)
let grokCliCache: GrokCliStatus | null = null;

/**
 * Check if Grok CLI is installed globally
 *
 * Grok CLI (grok-4-cli by lalomorales22) provides web search + X search.
 * Requires: `npm install -g grok-cli` and XAI_API_KEY env var.
 *
 * @returns Grok CLI status with path and version
 */
export function getGrokCliStatus(options?: { fetchVersion?: boolean }): GrokCliStatus {
  const fetchVersion = options?.fetchVersion !== false;

  if (
    grokCliCache &&
    (!fetchVersion || grokCliCache.version !== undefined || !grokCliCache.installed)
  ) {
    if (!fetchVersion) {
      return { ...grokCliCache, version: undefined };
    }
    return grokCliCache;
  }

  const result: GrokCliStatus = grokCliCache
    ? { ...grokCliCache }
    : {
        installed: false,
        path: undefined,
        version: undefined,
      };

  try {
    if (!grokCliCache) {
      const isWindows = process.platform === 'win32';
      const whichCmd = isWindows ? 'where grok' : 'which grok';

      const pathResult = execSync(whichCmd, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const grokPath = pathResult.trim().split('\n')[0];

      if (grokPath) {
        result.installed = true;
        result.path = grokPath;
      }
    }

    if (result.installed && fetchVersion && result.version === undefined) {
      try {
        const versionResult = execSync('grok --version', {
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
    // Command not found - Grok CLI not installed
  }

  grokCliCache = result;
  return fetchVersion ? result : { ...result, version: undefined };
}

/**
 * Check if Grok CLI is available (quick boolean check)
 */
export function hasGrokCli(): boolean {
  return getGrokCliStatus().installed;
}

/**
 * Clear Grok CLI cache (for testing or after installation)
 */
export function clearGrokCliCache(): void {
  grokCliCache = null;
}
