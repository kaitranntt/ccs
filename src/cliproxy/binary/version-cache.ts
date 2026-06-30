/**
 * Version Cache Manager
 * Handles reading/writing version cache to avoid excessive GitHub API calls.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getBinDir } from '../config/config-generator';
import {
  VersionCache,
  VERSION_CACHE_DURATION_MS,
  VERSION_PIN_FILE,
  VersionListCache,
  getGitHubRepo,
} from './types';
import { DEFAULT_BACKEND } from '../binary/platform-detector';
import type { CLIProxyBackend } from '../types';

/**
 * Get path to version cache file (backend-specific)
 */
export function getVersionCachePath(backend: CLIProxyBackend = DEFAULT_BACKEND): string {
  return path.join(getBinDir(), backend, '.version-cache.json');
}

/**
 * Get path to version pin file (backend-specific)
 */
export function getVersionPinPath(backend: CLIProxyBackend = DEFAULT_BACKEND): string {
  return path.join(getBinDir(), backend, VERSION_PIN_FILE);
}

/**
 * Read version cache if still valid (backend-specific)
 */
export function readVersionCache(backend: CLIProxyBackend = DEFAULT_BACKEND): VersionCache | null {
  return readVersionCacheInternal(backend, false);
}

/**
 * Read version cache even if expired.
 * Used as a resilience fallback when GitHub release lookups fail.
 */
export function readStaleVersionCache(
  backend: CLIProxyBackend = DEFAULT_BACKEND
): VersionCache | null {
  return readVersionCacheInternal(backend, true);
}

function readVersionCacheInternal(
  backend: CLIProxyBackend,
  allowExpired: boolean
): VersionCache | null {
  const cachePath = getVersionCachePath(backend);
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf8');
    const cache: VersionCache = JSON.parse(content);

    if (cache.repo !== getGitHubRepo(backend)) {
      return null;
    }

    // Check if cache is still valid, unless caller explicitly allows stale fallback.
    if (allowExpired || Date.now() - cache.checkedAt < VERSION_CACHE_DURATION_MS) {
      return cache;
    }

    // Cache expired
    return null;
  } catch {
    return null;
  }
}

/**
 * Write version to cache (backend-specific)
 */
export function writeVersionCache(
  version: string,
  backend: CLIProxyBackend = DEFAULT_BACKEND
): void {
  const cachePath = getVersionCachePath(backend);
  const cache: VersionCache = {
    latestVersion: version,
    checkedAt: Date.now(),
    repo: getGitHubRepo(backend),
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
 * Get pinned version if one exists (backend-specific)
 */
export function getPinnedVersion(backend: CLIProxyBackend = DEFAULT_BACKEND): string | null {
  const pinPath = getVersionPinPath(backend);
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
 * Save pinned version to persist user's explicit choice (backend-specific)
 */
export function savePinnedVersion(
  version: string,
  backend: CLIProxyBackend = DEFAULT_BACKEND
): void {
  const pinPath = getVersionPinPath(backend);
  try {
    fs.mkdirSync(path.dirname(pinPath), { recursive: true });
    fs.writeFileSync(pinPath, version, 'utf8');
  } catch {
    // Silent fail - not critical
  }
}

/**
 * Clear pinned version (unpin) - backend-specific
 */
export function clearPinnedVersion(backend: CLIProxyBackend = DEFAULT_BACKEND): void {
  const pinPath = getVersionPinPath(backend);
  if (fs.existsSync(pinPath)) {
    try {
      fs.unlinkSync(pinPath);
    } catch {
      // Silent fail
    }
  }
}

/**
 * Check if a version is currently pinned (backend-specific)
 */
export function isVersionPinned(backend: CLIProxyBackend = DEFAULT_BACKEND): boolean {
  return getPinnedVersion(backend) !== null;
}

/**
 * Migrate old shared version pin to backend-specific location.
 * Called once on first run after update.
 */
export function migrateVersionPin(backend: CLIProxyBackend): void {
  const oldPinPath = path.join(getBinDir(), VERSION_PIN_FILE);
  if (!fs.existsSync(oldPinPath)) return;

  try {
    const oldVersion = fs.readFileSync(oldPinPath, 'utf8').trim();
    if (!oldVersion) return;

    // Save to new backend-specific location
    savePinnedVersion(oldVersion, backend);

    // Delete old shared file
    fs.unlinkSync(oldPinPath);
  } catch {
    // Silent fail - not critical
  }
}

// ==================== Version List Cache ====================

const VERSION_LIST_CACHE_FILE = '.version-list-cache.json';

/**
 * Get path to version list cache file (backend-specific)
 */
export function getVersionListCachePath(backend: CLIProxyBackend = DEFAULT_BACKEND): string {
  return path.join(getBinDir(), backend, VERSION_LIST_CACHE_FILE);
}

/**
 * Read version list cache if still valid (backend-specific)
 */
export function readVersionListCache(
  backend: CLIProxyBackend = DEFAULT_BACKEND
): VersionListCache | null {
  return readVersionListCacheInternal(backend, false);
}

/**
 * Read version list cache even if expired.
 * Used as a resilience fallback when GitHub release lookups fail.
 */
export function readStaleVersionListCache(
  backend: CLIProxyBackend = DEFAULT_BACKEND
): VersionListCache | null {
  return readVersionListCacheInternal(backend, true);
}

function readVersionListCacheInternal(
  backend: CLIProxyBackend,
  allowExpired: boolean
): VersionListCache | null {
  const cachePath = getVersionListCachePath(backend);
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf8');
    const cache: VersionListCache = JSON.parse(content);

    // Check if cache is still valid, unless caller explicitly allows stale fallback.
    if (allowExpired || Date.now() - cache.checkedAt < VERSION_CACHE_DURATION_MS) {
      return cache;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Write version list to cache (backend-specific)
 */
export function writeVersionListCache(
  cache: VersionListCache,
  backend: CLIProxyBackend = DEFAULT_BACKEND
): void {
  const cachePath = getVersionListCachePath(backend);

  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
  } catch {
    // Silent fail - caching is optional
  }
}
