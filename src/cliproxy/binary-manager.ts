/**
 * Binary Manager for CLIProxyAPI
 *
 * Facade pattern wrapper for modular binary management.
 * Pattern: Mirrors npm install behavior (fast check, download only when needed)
 */

import { info, warn } from '../utils/ui';
import { getBinDir, CLIPROXY_DEFAULT_PORT } from './config-generator';
import { BinaryInfo, BinaryManagerConfig } from './types';
import { BACKEND_CONFIG, DEFAULT_BACKEND, CLIPROXY_MAX_STABLE_VERSION } from './platform-detector';
import { isProxyRunning, stopProxy } from './services/proxy-lifecycle-service';
import { waitForPortFree } from '../utils/port-utils';
import { loadOrCreateUnifiedConfig } from '../config/unified-config-loader';
import {
  UpdateCheckResult,
  checkForUpdates,
  deleteBinary,
  getBinaryPath,
  isBinaryInstalled,
  getBinaryInfo,
  getPinnedVersion,
  savePinnedVersion,
  clearPinnedVersion,
  isVersionPinned,
  getVersionPinPath,
  readInstalledVersion,
  ensureBinary,
  migrateVersionPin,
} from './binary';

import type { CLIProxyBackend } from './types';

/**
 * Get backend from config or default to 'plus'
 */
function getConfiguredBackend(): CLIProxyBackend {
  try {
    const config = loadOrCreateUnifiedConfig();
    return config.cliproxy?.backend || DEFAULT_BACKEND;
  } catch {
    return DEFAULT_BACKEND;
  }
}

/**
 * Get backend-specific binary directory.
 * Stores binaries in separate dirs: bin/original/ and bin/plus/
 */
function getBackendBinDir(backend: CLIProxyBackend = DEFAULT_BACKEND): string {
  const baseDir = getBinDir();
  return `${baseDir}/${backend}`;
}

/** Default configuration (uses backend from config.yaml or defaults to 'plus') */
function createDefaultConfig(backend: CLIProxyBackend = DEFAULT_BACKEND): BinaryManagerConfig {
  const backendConfig = BACKEND_CONFIG[backend];
  return {
    version: backendConfig.fallbackVersion,
    releaseUrl: `https://github.com/${backendConfig.repo}/releases/download`,
    binPath: getBackendBinDir(backend),
    maxRetries: 3,
    verbose: false,
    forceVersion: false,
    backend, // Pass backend for installer to use correct download URL
  };
}

/**
 * Binary Manager class for CLIProxyAPI binary lifecycle
 */
export class BinaryManager {
  private config: BinaryManagerConfig;
  private backend: CLIProxyBackend;

  constructor(config: Partial<BinaryManagerConfig> = {}, backend?: CLIProxyBackend) {
    this.backend = backend ?? getConfiguredBackend();
    const defaultConfig = createDefaultConfig(this.backend);
    this.config = { ...defaultConfig, ...config };
  }

  /** Ensure binary is available (download if missing, update if outdated) */
  async ensureBinary(): Promise<string> {
    return ensureBinary(this.config);
  }

  /** Check for updates by comparing installed version with latest release */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    return checkForUpdates(
      this.config.binPath,
      this.config.version,
      this.config.verbose,
      this.backend
    );
  }

  /** Get full path to binary executable */
  getBinaryPath(): string {
    return getBinaryPath(this.config.binPath, this.backend);
  }

  /** Check if binary exists */
  isBinaryInstalled(): boolean {
    return isBinaryInstalled(this.config.binPath, this.backend);
  }

  /** Get binary info if installed */
  async getBinaryInfo(): Promise<BinaryInfo | null> {
    return getBinaryInfo(this.config.binPath, this.config.version, this.backend);
  }

  /** Delete binary (for cleanup or reinstall) */
  deleteBinary(): void {
    deleteBinary(this.config.binPath, this.config.verbose, this.backend);
  }
}

/** Convenience function respecting version pin */
export async function ensureCLIProxyBinary(verbose = false): Promise<string> {
  const backend = getConfiguredBackend();

  // Migrate old shared pin to backend-specific location (one-time migration)
  migrateVersionPin(backend);

  const pinnedVersion = getPinnedVersion(backend);
  if (pinnedVersion) {
    if (verbose) console.error(`[cliproxy] Using pinned version: ${pinnedVersion}`);
    return new BinaryManager(
      {
        version: pinnedVersion,
        verbose,
        forceVersion: true,
      },
      backend
    ).ensureBinary();
  }
  return new BinaryManager({ verbose }, backend).ensureBinary();
}

/** Check if CLIProxyAPI binary is installed */
export function isCLIProxyInstalled(backend?: CLIProxyBackend): boolean {
  const effectiveBackend = backend ?? getConfiguredBackend();
  return new BinaryManager({}, effectiveBackend).isBinaryInstalled();
}

/** Get CLIProxyAPI binary path (may not exist) */
export function getCLIProxyPath(backend?: CLIProxyBackend): string {
  const effectiveBackend = backend ?? getConfiguredBackend();
  return new BinaryManager({}, effectiveBackend).getBinaryPath();
}

/** Get installed CLIProxyAPI version from .version file */
export function getInstalledCliproxyVersion(backend?: CLIProxyBackend): string {
  const effectiveBackend = backend ?? getConfiguredBackend();
  return readInstalledVersion(
    getBackendBinDir(effectiveBackend),
    BACKEND_CONFIG[effectiveBackend].fallbackVersion
  );
}

/** Install a specific version of CLIProxyAPI */
export async function installCliproxyVersion(
  version: string,
  verbose = false,
  backend?: CLIProxyBackend
): Promise<void> {
  const effectiveBackend = backend ?? getConfiguredBackend();
  const manager = new BinaryManager({ version, verbose, forceVersion: true }, effectiveBackend);

  // Check if proxy is running and stop it first
  if (isProxyRunning()) {
    if (verbose) console.log(info('Stopping running CLIProxy before update...'));
    const result = await stopProxy();
    if (result.stopped) {
      // Wait for port to be fully released
      const portFree = await waitForPortFree(CLIPROXY_DEFAULT_PORT, 5000);
      if (!portFree && verbose) {
        console.log(warn('Port did not free up in time, proceeding anyway...'));
      }
    } else if (verbose && result.error) {
      console.log(warn(`Could not stop proxy: ${result.error}`));
    }
  }

  if (manager.isBinaryInstalled()) {
    const label = effectiveBackend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';
    if (verbose)
      console.log(
        info(`Removing existing ${label} v${getInstalledCliproxyVersion(effectiveBackend)}`)
      );
    manager.deleteBinary();
  }
  await manager.ensureBinary();

  if (verbose) {
    console.log(info('New version will be active on next CLIProxy command'));
  }
}

/** Fetch the latest CLIProxyAPI version from GitHub API */
export async function fetchLatestCliproxyVersion(backend?: CLIProxyBackend): Promise<string> {
  const effectiveBackend = backend ?? getConfiguredBackend();
  const result = await new BinaryManager({}, effectiveBackend).checkForUpdates();
  return result.latestVersion;
}

/** Update check result for API response */
export interface CliproxyUpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  fromCache: boolean;
  checkedAt: number;
  // Backend info
  backend: CLIProxyBackend;
  backendLabel: string;
  // Stability fields
  isStable: boolean;
  maxStableVersion: string;
  stabilityMessage?: string;
}

/** Check for CLIProxyAPI binary updates */
export async function checkCliproxyUpdate(
  backend?: CLIProxyBackend
): Promise<CliproxyUpdateCheckResult> {
  const effectiveBackend = backend ?? getConfiguredBackend();
  const result = await new BinaryManager({}, effectiveBackend).checkForUpdates();

  // Import isNewerVersion for stability check
  const { isNewerVersion } = await import('./binary/version-checker');
  const isStable = !isNewerVersion(result.currentVersion, CLIPROXY_MAX_STABLE_VERSION);
  const stabilityMessage = isStable
    ? undefined
    : `v${result.currentVersion} has known stability issues. Max stable: v${CLIPROXY_MAX_STABLE_VERSION}`;

  const backendLabel = effectiveBackend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';

  return {
    ...result,
    backend: effectiveBackend,
    backendLabel,
    isStable,
    maxStableVersion: CLIPROXY_MAX_STABLE_VERSION,
    stabilityMessage,
  };
}

// Re-export version pin functions
export {
  getVersionPinPath,
  getPinnedVersion,
  savePinnedVersion,
  clearPinnedVersion,
  isVersionPinned,
  migrateVersionPin,
};

export default BinaryManager;
