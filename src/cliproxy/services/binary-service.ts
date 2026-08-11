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
  resolveLocalBackend,
  withCliproxyInstallLifecycleLock,
} from '../binary-manager';
import { BACKEND_CONFIG, DEFAULT_BACKEND } from '../binary/platform-detector';
import { CLIProxyBackend } from '../types';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';

/** Binary status result */
export interface BinaryStatusResult {
  installed: boolean;
  currentVersion: string | null;
  pinnedVersion: string | null;
  binaryPath: string;
  fallbackVersion: string;
  backend: CLIProxyBackend;
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
 * Get current binary status for a specific backend
 */
export function getBinaryStatus(backend?: CLIProxyBackend): BinaryStatusResult {
  const configuredBackend =
    backend ?? loadOrCreateUnifiedConfig().cliproxy?.backend ?? DEFAULT_BACKEND;
  const effectiveBackend = resolveLocalBackend(configuredBackend, { notifyOnPlus: true });
  const backendConfig = BACKEND_CONFIG[effectiveBackend];
  return {
    installed: isCLIProxyInstalled(effectiveBackend),
    currentVersion: getInstalledCliproxyVersion(effectiveBackend),
    pinnedVersion: getPinnedVersion(effectiveBackend),
    binaryPath: getCLIProxyPath(effectiveBackend),
    fallbackVersion: backendConfig.fallbackVersion,
    backend: effectiveBackend,
  };
}

/**
 * Check for latest version
 */
export async function checkLatestVersion(backend?: CLIProxyBackend): Promise<LatestVersionResult> {
  const configuredBackend =
    backend ?? loadOrCreateUnifiedConfig().cliproxy?.backend ?? DEFAULT_BACKEND;
  const effectiveBackend = resolveLocalBackend(configuredBackend, { notifyOnPlus: true });

  try {
    // Use checkCliproxyUpdate which is backend-aware (uses correct GitHub repo)
    const { checkCliproxyUpdate } = await import('../binary-manager');
    const updateResult = await checkCliproxyUpdate(effectiveBackend);
    const latestVersion = updateResult.latestVersion;
    const currentVersion = getInstalledCliproxyVersion(effectiveBackend);
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
export async function installVersion(
  version: string,
  verbose = false,
  backend?: CLIProxyBackend
): Promise<InstallResult> {
  if (!isValidVersionFormat(version)) {
    return {
      success: false,
      version,
      error: 'Invalid version format. Expected format: X.Y.Z (e.g., 6.5.53)',
    };
  }

  const configuredBackend =
    backend ?? loadOrCreateUnifiedConfig().cliproxy?.backend ?? DEFAULT_BACKEND;
  const effectiveBackend = resolveLocalBackend(configuredBackend, { notifyOnPlus: true });

  try {
    return await withCliproxyInstallLifecycleLock(effectiveBackend, async () => {
      await installCliproxyVersion(version, verbose, effectiveBackend);
      savePinnedVersion(version, effectiveBackend);

      return {
        success: true,
        version,
        wasPinned: true,
      };
    });
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
export async function installLatest(
  verbose = false,
  backend?: CLIProxyBackend
): Promise<InstallResult> {
  const configuredBackend =
    backend ?? loadOrCreateUnifiedConfig().cliproxy?.backend ?? DEFAULT_BACKEND;
  const effectiveBackend = resolveLocalBackend(configuredBackend, { notifyOnPlus: true });

  try {
    return await withCliproxyInstallLifecycleLock(effectiveBackend, async () => {
      const latestVersion = await fetchLatestCliproxyVersion(effectiveBackend);
      const currentVersion = getInstalledCliproxyVersion(effectiveBackend);
      const wasPinned = isVersionPinned(effectiveBackend);

      if (isCLIProxyInstalled(effectiveBackend) && latestVersion === currentVersion && !wasPinned) {
        return {
          success: true,
          version: latestVersion,
          error: `Already running latest version: v${latestVersion}`,
        };
      }

      await installCliproxyVersion(latestVersion, verbose, effectiveBackend);
      clearPinnedVersion(effectiveBackend);

      return {
        success: true,
        version: latestVersion,
        wasPinned,
      };
    });
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
export function isPinned(backend?: CLIProxyBackend): boolean {
  const configuredBackend =
    backend ?? loadOrCreateUnifiedConfig().cliproxy?.backend ?? DEFAULT_BACKEND;
  const effectiveBackend = resolveLocalBackend(configuredBackend, { notifyOnPlus: true });
  return isVersionPinned(effectiveBackend);
}

/**
 * Get pinned version if any
 */
export function getPinned(backend?: CLIProxyBackend): string | null {
  const configuredBackend =
    backend ?? loadOrCreateUnifiedConfig().cliproxy?.backend ?? DEFAULT_BACKEND;
  const effectiveBackend = resolveLocalBackend(configuredBackend, { notifyOnPlus: true });
  return getPinnedVersion(effectiveBackend);
}

/**
 * Clear version pin
 */
export function clearPin(backend?: CLIProxyBackend): void {
  const configuredBackend =
    backend ?? loadOrCreateUnifiedConfig().cliproxy?.backend ?? DEFAULT_BACKEND;
  const effectiveBackend = resolveLocalBackend(configuredBackend, { notifyOnPlus: true });
  clearPinnedVersion(effectiveBackend);
}
