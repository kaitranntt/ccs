/**
 * Version Checker
 * Handles checking GitHub API for latest version and comparing semver.
 */

import { fetchJson } from './downloader';
import {
  readVersionCache,
  writeVersionCache,
  readInstalledVersion,
  readVersionListCache,
  writeVersionListCache,
} from './version-cache';
import {
  UpdateCheckResult,
  GITHUB_API_LATEST_RELEASE,
  GITHUB_API_ALL_RELEASES,
  VersionListResult,
} from './types';
import { CLIPROXY_MAX_STABLE_VERSION, CLIPROXY_FAULTY_RANGE } from '../platform-detector';

/**
 * Compare semver versions (true if latest > current)
 * Handles CLIProxyAPIPlus versioning: strips -0 suffix before comparison
 */
export function isNewerVersion(latest: string, current: string): boolean {
  // Strip -0 suffix from CLIProxyAPIPlus versions (e.g., "6.6.40-0" -> "6.6.40")
  const cleanLatest = latest.replace(/-\d+$/, '');
  const cleanCurrent = current.replace(/-\d+$/, '');

  const latestParts = cleanLatest.split('.').map((p) => parseInt(p, 10) || 0);
  const currentParts = cleanCurrent.split('.').map((p) => parseInt(p, 10) || 0);

  // Pad arrays to same length
  while (latestParts.length < 3) latestParts.push(0);
  while (currentParts.length < 3) currentParts.push(0);

  for (let i = 0; i < 3; i++) {
    if (latestParts[i] > currentParts[i]) return true;
    if (latestParts[i] < currentParts[i]) return false;
  }

  return false; // Equal versions
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
 */
export async function fetchLatestVersion(verbose = false): Promise<string> {
  const response = await fetchJson(GITHUB_API_LATEST_RELEASE, verbose);

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
 */
export async function checkForUpdates(
  binPath: string,
  configVersion: string,
  verbose = false
): Promise<UpdateCheckResult> {
  const currentVersion = readInstalledVersion(binPath, configVersion);

  // Try cache first
  const cache = readVersionCache();
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

  // Fetch from GitHub API
  const latestVersion = await fetchLatestVersion(verbose);
  const now = Date.now();
  writeVersionCache(latestVersion);

  return {
    hasUpdate: isNewerVersion(latestVersion, currentVersion),
    currentVersion,
    latestVersion,
    fromCache: false,
    checkedAt: now,
  };
}

/**
 * Fetch all available versions from GitHub releases
 * Caches result for 1 hour to avoid rate limiting
 */
export async function fetchAllVersions(verbose = false): Promise<VersionListResult> {
  // Try cache first
  const cache = readVersionListCache();
  if (cache) {
    if (verbose) {
      console.error(`[cliproxy] Using cached version list (${cache.versions.length} versions)`);
    }
    return { ...cache, fromCache: true };
  }

  // Fetch from GitHub API
  const response = await fetchJson(GITHUB_API_ALL_RELEASES, verbose);

  // Extract and normalize versions
  const releases = response as unknown as Array<{ tag_name: string }>;
  const versions = releases
    .map((r) => r.tag_name.replace(/^v/, ''))
    .filter((v) => /^\d+\.\d+\.\d+(-\d+)?$/.test(v)); // Valid semver only

  const latest = versions[0] || '';

  // Find latest stable (not newer than max stable AND not in faulty range)
  const latestStable =
    versions.find((v) => !isNewerVersion(v, CLIPROXY_MAX_STABLE_VERSION) && !isVersionFaulty(v)) ||
    CLIPROXY_MAX_STABLE_VERSION;

  const result: VersionListResult = {
    versions,
    latestStable,
    latest,
    fromCache: false,
    checkedAt: Date.now(),
  };

  writeVersionListCache(result);
  return result;
}
