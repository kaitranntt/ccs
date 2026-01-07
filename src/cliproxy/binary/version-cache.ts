/**
 * Version Cache Manager
 * Handles reading/writing version cache to avoid excessive GitHub API calls.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCliproxyDir, getBinDir } from '../config-generator';
import {
  VersionCache,
  VERSION_CACHE_DURATION_MS,
  VERSION_PIN_FILE,
  VersionListCache,
} from './types';

/**
 * Get path to version cache file
 */
export function getVersionCachePath(): string {
  return path.join(getCliproxyDir(), '.version-cache.json');
}

/**
 * Get path to version pin file
 */
export function getVersionPinPath(): string {
  return path.join(getBinDir(), VERSION_PIN_FILE);
}

/**
 * Read version cache if still valid
 */
export function readVersionCache(): VersionCache | null {
  const cachePath = getVersionCachePath();
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf8');
    const cache: VersionCache = JSON.parse(content);

    // Check if cache is still valid
    if (Date.now() - cache.checkedAt < VERSION_CACHE_DURATION_MS) {
      return cache;
    }

    // Cache expired
    return null;
  } catch {
    return null;
  }
}

/**
 * Write version to cache
 */
export function writeVersionCache(version: string): void {
  const cachePath = getVersionCachePath();
  const cache: VersionCache = {
    latestVersion: version,
    checkedAt: Date.now(),
  };

  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
  } catch {
    // Silent fail - caching is optional
  }
}

/**
 * Read installed version from .version file
 */
export function readInstalledVersion(binPath: string, fallbackVersion: string): string {
  const versionFile = path.join(binPath, '.version');
  if (fs.existsSync(versionFile)) {
    try {
      return fs.readFileSync(versionFile, 'utf8').trim();
    } catch {
      return fallbackVersion;
    }
  }
  return fallbackVersion;
}

/**
 * Write installed version to .version file
 */
export function writeInstalledVersion(binPath: string, version: string): void {
  const versionFile = path.join(binPath, '.version');
  try {
    fs.writeFileSync(versionFile, version, 'utf8');
  } catch {
    // Silent fail - not critical
  }
}

/**
 * Get pinned version if one exists
 */
export function getPinnedVersion(): string | null {
  const pinPath = getVersionPinPath();
  if (!fs.existsSync(pinPath)) {
    return null;
  }
  try {
    return fs.readFileSync(pinPath, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Save pinned version to persist user's explicit choice
 */
export function savePinnedVersion(version: string): void {
  const pinPath = getVersionPinPath();
  try {
    fs.mkdirSync(path.dirname(pinPath), { recursive: true });
    fs.writeFileSync(pinPath, version, 'utf8');
  } catch {
    // Silent fail - not critical
  }
}

/**
 * Clear pinned version (unpin)
 */
export function clearPinnedVersion(): void {
  const pinPath = getVersionPinPath();
  if (fs.existsSync(pinPath)) {
    try {
      fs.unlinkSync(pinPath);
    } catch {
      // Silent fail
    }
  }
}

/**
 * Check if a version is currently pinned
 */
export function isVersionPinned(): boolean {
  return getPinnedVersion() !== null;
}

// ==================== Version List Cache ====================

const VERSION_LIST_CACHE_FILE = '.version-list-cache.json';

/**
 * Get path to version list cache file
 */
export function getVersionListCachePath(): string {
  return path.join(getCliproxyDir(), VERSION_LIST_CACHE_FILE);
}

/**
 * Read version list cache if still valid
 */
export function readVersionListCache(): VersionListCache | null {
  const cachePath = getVersionListCachePath();
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf8');
    const cache: VersionListCache = JSON.parse(content);

    // Check if cache is still valid (1 hour)
    if (Date.now() - cache.checkedAt < VERSION_CACHE_DURATION_MS) {
      return cache;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Write version list to cache
 */
export function writeVersionListCache(cache: VersionListCache): void {
  const cachePath = getVersionListCachePath();

  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
  } catch {
    // Silent fail - caching is optional
  }
}
