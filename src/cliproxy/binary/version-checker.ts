/**
 * Version Checker
 * Handles checking GitHub API for latest version and comparing semver.
 */

import { fetchJson } from './downloader';
import {
  readVersionCache,
  readStaleVersionCache,
  writeVersionCache,
  readInstalledVersion,
  readVersionListCache,
  readStaleVersionListCache,
  writeVersionListCache,
} from './version-cache';
import { UpdateCheckResult, VersionListResult, getGitHubApiUrls } from './types';
import {
  CLIPROXY_MAX_STABLE_VERSION,
  CLIPROXY_FAULTY_RANGE,
  DEFAULT_BACKEND,
} from '../binary/platform-detector';
import type { CLIProxyBackend } from '../types';

interface FetchLatestVersionDeps {
  fetchJsonFn?: typeof fetchJson;
}

interface CheckForUpdatesDeps {
  fetchLatestVersionFn?: (verbose: boolean, backend: CLIProxyBackend) => Promise<string>;
}

interface FetchAllVersionsDeps {
  fetchJsonFn?: typeof fetchJson;
}

interface ParsedCliproxyVersion {
  major: number;
  minor: number;
  patch: number;
  forkRelease: number;
}

function parseCliproxyVersion(version: string): ParsedCliproxyVersion {
  const normalized = version.trim().replace(/^v/, '');
  const [coreVersion, forkReleaseValue = '0'] = normalized.split('-', 2);
  const [major = 0, minor = 0, patch = 0] = coreVersion
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
  const forkRelease = /^\d+$/.test(forkReleaseValue) ? parseInt(forkReleaseValue, 10) || 0 : 0;

  return { major, minor, patch, forkRelease };
}

function compareVersionPart(a: number, b: number): number {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

export function compareCliproxyVersions(a: string, b: string): number {
  const left = parseCliproxyVersion(a);
  const right = parseCliproxyVersion(b);

  return (
    compareVersionPart(left.major, right.major) ||
    compareVersionPart(left.minor, right.minor) ||
    compareVersionPart(left.patch, right.patch) ||
    compareVersionPart(left.forkRelease, right.forkRelease)
  );
}

/**
 * Compare CLIProxy release versions (true if latest > current).
 * Missing fork suffixes are treated as -0, while patched fork suffixes such as
 * 7.1.31-1 still sort newer than 7.1.31-0.
 */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareCliproxyVersions(latest, current) > 0;
}

/**
 * Check if version is within the faulty range (v81-85)
 * @returns true if version has known critical bugs
 */
export function isVersionFaulty(version: string): boolean {
  const { min, max } = CLIPROXY_FAULTY_RANGE;
  const atOrAboveMin = !isNewerVersion(min, version); // version >= min
  const atOrBelowMax = !isNewerVersion(version, max); // version <= max
  return atOrAboveMin && atOrBelowMax;
}

/**
 * Fetch latest version from GitHub API
 * @param verbose Enable verbose logging
 * @param backend Backend to fetch version for (uses correct GitHub repo)
 */
export async function fetchLatestVersion(
  verbose = false,
  backend: CLIProxyBackend = DEFAULT_BACKEND,
  deps: FetchLatestVersionDeps = {}
): Promise<string> {
  const urls = getGitHubApiUrls(backend);
  const response = await (deps.fetchJsonFn ?? fetchJson)(urls.latestRelease, verbose);

  // Extract version from tag_name (format: "v6.5.27" or "6.5.27")
  const tagName = response.tag_name as string;
  if (!tagName) {
    throw new Error('No tag_name in GitHub API response');
  }

  return tagName.replace(/^v/, '');
}

/**
 * Check for updates by comparing installed version with latest release
 * Uses cache to avoid hitting GitHub API on every run
 * Cache is backend-specific to handle different repos for original vs plus
 */
export async function checkForUpdates(
  binPath: string,
  configVersion: string,
  verbose = false,
  backend: CLIProxyBackend = DEFAULT_BACKEND,
  deps: CheckForUpdatesDeps = {}
): Promise<UpdateCheckResult> {
  const currentVersion = readInstalledVersion(binPath, configVersion);

  // Try cache first (backend-specific)
  const cache = readVersionCache(backend);
  if (cache) {
    if (verbose) {
      console.error(`[cliproxy] Using cached version: ${cache.latestVersion}`);
    }
    return {
      hasUpdate: isNewerVersion(cache.latestVersion, currentVersion),
      currentVersion,
      latestVersion: cache.latestVersion,
      fromCache: true,
      checkedAt: cache.checkedAt,
    };
  }

  try {
    // Fetch from GitHub API (backend-specific repo)
    const latestVersion = await (deps.fetchLatestVersionFn ?? fetchLatestVersion)(verbose, backend);
    const now = Date.now();
    writeVersionCache(latestVersion, backend);

    return {
      hasUpdate: isNewerVersion(latestVersion, currentVersion),
      currentVersion,
      latestVersion,
      fromCache: false,
      checkedAt: now,
    };
  } catch (error) {
    const staleCache = readStaleVersionCache(backend);
    if (staleCache) {
      if (verbose) {
        console.error(
          `[cliproxy] GitHub latest release lookup failed, using stale cache: ${(error as Error).message}`
        );
      }
      return {
        hasUpdate: isNewerVersion(staleCache.latestVersion, currentVersion),
        currentVersion,
        latestVersion: staleCache.latestVersion,
        fromCache: true,
        checkedAt: staleCache.checkedAt,
      };
    }

    throw error;
  }
}

/**
 * Fetch all available versions from GitHub releases
 * Caches result for 1 hour to avoid rate limiting
 * @param verbose Enable verbose logging
 * @param backend Backend to fetch versions for (uses correct GitHub repo)
 */
export async function fetchAllVersions(
  verbose = false,
  backend: CLIProxyBackend = DEFAULT_BACKEND,
  deps: FetchAllVersionsDeps = {}
): Promise<VersionListResult> {
  // Try cache first (backend-specific)
  const cache = readVersionListCache(backend);
  if (cache) {
    if (verbose) {
      console.error(`[cliproxy] Using cached version list (${cache.versions.length} versions)`);
    }
    return { ...cache, fromCache: true };
  }

  try {
    // Fetch from GitHub API (backend-specific repo)
    const urls = getGitHubApiUrls(backend);
    const response = await (deps.fetchJsonFn ?? fetchJson)(urls.allReleases, verbose);

    // Extract and normalize versions
    const releases = response as unknown as Array<{ tag_name: string }>;
    const versions = releases
      .map((r) => r.tag_name.replace(/^v/, ''))
      .filter((v) => /^\d+\.\d+\.\d+(-\d+)?$/.test(v)); // Valid semver only

    const latest = versions[0] || '';

    // Find latest stable (not newer than max stable AND not in faulty range)
    const latestStable =
      versions.find(
        (v) => !isNewerVersion(v, CLIPROXY_MAX_STABLE_VERSION) && !isVersionFaulty(v)
      ) || CLIPROXY_MAX_STABLE_VERSION;

    const result: VersionListResult = {
      versions,
      latestStable,
      latest,
      fromCache: false,
      checkedAt: Date.now(),
    };

    writeVersionListCache(result, backend);
    return result;
  } catch (error) {
    const staleCache = readStaleVersionListCache(backend);
    if (staleCache) {
      if (verbose) {
        console.error(
          `[cliproxy] GitHub release list lookup failed, using stale cache: ${(error as Error).message}`
        );
      }
      return { ...staleCache, fromCache: true };
    }

    throw error;
  }
}
