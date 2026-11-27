/**
 * Shared Routes — Path safety helpers
 *
 * Prevents directory traversal by resolving real paths and checking
 * containment within allowed roots before any file I/O.
 */

import * as fs from 'fs';
import * as path from 'path';

import { getClaudeConfigDir } from '../utils/claude-config-path';
import { getCcsDir } from '../config/config-loader-facade';
import type { SharedCollectionType } from './shared-routes-types';

export function safeRealPath(targetPath: string): string | null {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

export function normalizeForPathComparison(targetPath: string): string {
  const normalized = path.resolve(targetPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function isPathWithin(candidatePath: string, basePath: string): boolean {
  const normalizedCandidate = normalizeForPathComparison(candidatePath);
  const normalizedBase = normalizeForPathComparison(basePath);
  const relative = path.relative(normalizedBase, normalizedCandidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isPathWithinAny(candidatePath: string, basePaths: Set<string>): boolean {
  for (const basePath of basePaths) {
    if (isPathWithin(candidatePath, basePath)) {
      return true;
    }
  }
  return false;
}

export function resolveAllowedRoots(
  type: SharedCollectionType,
  ccsDir: string,
  sharedDirRoot?: string | null
): Set<string> {
  if (type === 'commands' || type === 'plugins') {
    return new Set<string>(sharedDirRoot ? [sharedDirRoot] : []);
  }

  return new Set<string>(
    [
      sharedDirRoot,
      ...[
        path.join(getClaudeConfigDir(), type),
        path.join(ccsDir, '.claude', type),
        path.join(ccsDir, 'shared', type),
      ].map((dirPath) => safeRealPath(dirPath)),
    ].filter((dirPath): dirPath is string => typeof dirPath === 'string' && dirPath.length > 0)
  );
}

export function resolveSettingsAllowedRoots(ccsDir: string, sharedDirRoot: string): Set<string> {
  const claudeConfigDir = getClaudeConfigDir();
  return new Set<string>(
    [
      sharedDirRoot,
      safeRealPath(path.join(claudeConfigDir, 'settings.json')),
      safeRealPath(path.join(ccsDir, '.claude', 'settings.json')),
    ].filter((dirPath): dirPath is string => typeof dirPath === 'string')
  );
}

// Re-export getCcsDir so callers that need both path guards and ccsDir can import from one place
export { getCcsDir };
