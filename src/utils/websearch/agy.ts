/**
 * Antigravity CLI (agy) Detection
 *
 * Detects and manages Antigravity CLI installation status. `agy` is Google's
 * successor to the retired `gemini` CLI (Google retired the gemini CLI on
 * 2026-06-18) and is the recommended LLM CLI WebSearch fallback.
 *
 * @module utils/websearch/agy
 */

import { execSync } from 'child_process';
import type { AgyCliStatus } from './types';

// Cache for Antigravity CLI status (per process)
let agyCliCache: AgyCliStatus | null = null;

/**
 * Check if Antigravity CLI (agy) is installed globally.
 *
 * Install: `curl -fsSL https://antigravity.google/cli/install.sh | bash`
 * (Unix installs to ~/.local/bin/agy). Must be in PATH.
 *
 * @returns Antigravity CLI status with path and version
 */
export function getAgyCliStatus(): AgyCliStatus {
  // Return cached result if available
  if (agyCliCache) {
    return agyCliCache;
  }

  const result: AgyCliStatus = {
    installed: false,
    path: undefined,
    version: undefined,
  };

  try {
    const isWindows = process.platform === 'win32';
    const whichCmd = isWindows ? 'where agy' : 'which agy';

    const pathResult = execSync(whichCmd, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const agyPath = pathResult.trim().split('\n')[0]; // First result on Windows

    if (agyPath) {
      result.installed = true;
      result.path = agyPath;

      // Try to get version
      try {
        const versionResult = execSync('agy --version', {
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        result.version = versionResult.trim();
      } catch {
        // Version check failed, but CLI is installed
        result.version = 'unknown';
      }
    }
  } catch {
    // Command not found - Antigravity CLI not installed
  }

  // Cache result
  agyCliCache = result;
  return result;
}

/**
 * Check if Antigravity CLI is available (quick boolean check)
 */
export function hasAgyCli(): boolean {
  return getAgyCliStatus().installed;
}

/**
 * Clear Antigravity CLI cache (for testing or after installation)
 */
export function clearAgyCliCache(): void {
  agyCliCache = null;
}
