/**
 * Binary Module Type Definitions
 * Types specific to binary management operations.
 */

/** Version cache file structure */
export interface VersionCache {
  latestVersion: string;
  checkedAt: number;
}

/** Update check result */
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  fromCache: boolean;
  checkedAt: number; // Unix timestamp of last check
}

/** Cache duration for version check (1 hour in milliseconds) */
export const VERSION_CACHE_DURATION_MS = 60 * 60 * 1000;

/** Version pin file name - stores user's explicit version choice */
export const VERSION_PIN_FILE = '.version-pin';

/** GitHub API URL for latest release (CLIProxyAPIPlus fork with Kiro + Copilot support) */
export const GITHUB_API_LATEST_RELEASE =
  'https://api.github.com/repos/router-for-me/CLIProxyAPIPlus/releases/latest';

/** GitHub API URL for all releases */
export const GITHUB_API_ALL_RELEASES =
  'https://api.github.com/repos/router-for-me/CLIProxyAPIPlus/releases';

/** Version list cache structure */
export interface VersionListCache {
  versions: string[];
  latestStable: string;
  latest: string;
  checkedAt: number;
}

/** Version list result from API */
export interface VersionListResult extends VersionListCache {
  fromCache: boolean;
}
