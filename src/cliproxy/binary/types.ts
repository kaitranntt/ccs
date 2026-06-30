/**
 * Binary Module Type Definitions
 * Types specific to binary management operations.
 */

/** Version cache file structure */
export interface VersionCache {
  latestVersion: string;
  checkedAt: number;
  repo: string;
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

/**
 * GitHub API URLs - backend-specific
 * @deprecated Use getGitHubApiUrls(backend) instead
 */
export const GITHUB_API_LATEST_RELEASE =
  'https://api.github.com/repos/kaitranntt/CLIProxyAPIPlus/releases/latest';
export const GITHUB_API_ALL_RELEASES =
  'https://api.github.com/repos/kaitranntt/CLIProxyAPIPlus/releases';

/** GitHub repos per backend */
export const GITHUB_REPOS = {
  original: 'router-for-me/CLIProxyAPI',
  plus: 'kaitranntt/CLIProxyAPIPlus',
} as const;

/** Get GitHub repository for specific backend */
export function getGitHubRepo(backend: 'original' | 'plus'): string {
  return GITHUB_REPOS[backend];
}

/** Get GitHub API URLs for specific backend */
export function getGitHubApiUrls(backend: 'original' | 'plus') {
  const repo = getGitHubRepo(backend);
  return {
    latestRelease: `https://api.github.com/repos/${repo}/releases/latest`,
    allReleases: `https://api.github.com/repos/${repo}/releases`,
  };
}

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
