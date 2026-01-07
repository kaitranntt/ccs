/**
 * CLIProxy Binary Service
 *
 * Handles CLIProxyAPI binary version management:
 * - Get current version status
 * - Install specific versions
 * - Install latest version
 * - Version pinning
 */

import {
  getInstalledCliproxyVersion,
  installCliproxyVersion,
  fetchLatestCliproxyVersion,
  isCLIProxyInstalled,
  getCLIProxyPath,
  getPinnedVersion,
  savePinnedVersion,
  clearPinnedVersion,
  isVersionPinned,
} from '../binary-manager';
import { CLIPROXY_FALLBACK_VERSION } from '../platform-detector';

/** Binary status result */
export interface BinaryStatusResult {
  installed: boolean;
  currentVersion: string | null;
  pinnedVersion: string | null;
  binaryPath: string;
  fallbackVersion: string;
}

/** Install result */
export interface InstallResult {
  success: boolean;
  version: string;
  error?: string;
  wasPinned?: boolean;
}

/** Latest version check result */
export interface LatestVersionResult {
  success: boolean;
  latestVersion?: string;
  currentVersion?: string;
  updateAvailable?: boolean;
  error?: string;
}

/**
 * Get current binary status
 */
export function getBinaryStatus(): BinaryStatusResult {
  return {
    installed: isCLIProxyInstalled(),
    currentVersion: getInstalledCliproxyVersion(),
    pinnedVersion: getPinnedVersion(),
    binaryPath: getCLIProxyPath(),
    fallbackVersion: CLIPROXY_FALLBACK_VERSION,
  };
}

/**
 * Check for latest version
 */
export async function checkLatestVersion(): Promise<LatestVersionResult> {
  try {
    const latestVersion = await fetchLatestCliproxyVersion();
    const currentVersion = getInstalledCliproxyVersion();
    const updateAvailable = latestVersion !== currentVersion;

    return {
      success: true,
      latestVersion,
      currentVersion: currentVersion || undefined,
      updateAvailable,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Validate version format (supports X.Y.Z or X.Y.Z-N suffix)
 */
export function isValidVersionFormat(version: string): boolean {
  return /^\d+\.\d+\.\d+(-\d+)?$/.test(version);
}

/**
 * Install a specific version and pin it
 */
export async function installVersion(version: string, verbose = false): Promise<InstallResult> {
  if (!isValidVersionFormat(version)) {
    return {
      success: false,
      version,
      error: 'Invalid version format. Expected format: X.Y.Z (e.g., 6.5.53)',
    };
  }

  try {
    await installCliproxyVersion(version, verbose);
    savePinnedVersion(version);

    return {
      success: true,
      version,
      wasPinned: true,
    };
  } catch (error) {
    return {
      success: false,
      version,
      error: (error as Error).message,
    };
  }
}

/**
 * Install latest version and clear any pin
 */
export async function installLatest(verbose = false): Promise<InstallResult> {
  try {
    const latestVersion = await fetchLatestCliproxyVersion();
    const currentVersion = getInstalledCliproxyVersion();
    const wasPinned = isVersionPinned();

    if (isCLIProxyInstalled() && latestVersion === currentVersion && !wasPinned) {
      return {
        success: true,
        version: latestVersion,
        error: `Already running latest version: v${latestVersion}`,
      };
    }

    await installCliproxyVersion(latestVersion, verbose);
    clearPinnedVersion();

    return {
      success: true,
      version: latestVersion,
      wasPinned,
    };
  } catch (error) {
    return {
      success: false,
      version: '',
      error: (error as Error).message,
    };
  }
}

/**
 * Check if a version is pinned
 */
export function isPinned(): boolean {
  return isVersionPinned();
}

/**
 * Get pinned version if any
 */
export function getPinned(): string | null {
  return getPinnedVersion();
}

/**
 * Clear version pin
 */
export function clearPin(): void {
  clearPinnedVersion();
}
