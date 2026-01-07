/**
 * Binary Manager for CLIProxyAPI
 *
 * Facade pattern wrapper for modular binary management.
 * Pattern: Mirrors npm install behavior (fast check, download only when needed)
 */

import { info, warn } from '../utils/ui';
import { getBinDir, CLIPROXY_DEFAULT_PORT } from './config-generator';
import { BinaryInfo, BinaryManagerConfig } from './types';
import { CLIPROXY_FALLBACK_VERSION, CLIPROXY_MAX_STABLE_VERSION } from './platform-detector';
import { isProxyRunning, stopProxy } from './services/proxy-lifecycle-service';
import { waitForPortFree } from '../utils/port-utils';
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
} from './binary';

/** Default configuration (uses CLIProxyAPIPlus fork with Kiro + Copilot support) */
const DEFAULT_CONFIG: BinaryManagerConfig = {
  version: CLIPROXY_FALLBACK_VERSION,
  releaseUrl: 'https://github.com/router-for-me/CLIProxyAPIPlus/releases/download',
  binPath: getBinDir(),
  maxRetries: 3,
  verbose: false,
  forceVersion: false,
};

/**
 * Binary Manager class for CLIProxyAPI binary lifecycle
 */
export class BinaryManager {
  private config: BinaryManagerConfig;

  constructor(config: Partial<BinaryManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Ensure binary is available (download if missing, update if outdated) */
  async ensureBinary(): Promise<string> {
    return ensureBinary(this.config);
  }

  /** Check for updates by comparing installed version with latest release */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    return checkForUpdates(this.config.binPath, this.config.version, this.config.verbose);
  }

  /** Get full path to binary executable */
  getBinaryPath(): string {
    return getBinaryPath(this.config.binPath);
  }

  /** Check if binary exists */
  isBinaryInstalled(): boolean {
    return isBinaryInstalled(this.config.binPath);
  }

  /** Get binary info if installed */
  async getBinaryInfo(): Promise<BinaryInfo | null> {
    return getBinaryInfo(this.config.binPath, this.config.version);
  }

  /** Delete binary (for cleanup or reinstall) */
  deleteBinary(): void {
    deleteBinary(this.config.binPath, this.config.verbose);
  }
}

/** Convenience function respecting version pin */
export async function ensureCLIProxyBinary(verbose = false): Promise<string> {
  const pinnedVersion = getPinnedVersion();
  if (pinnedVersion) {
    if (verbose) console.error(`[cliproxy] Using pinned version: ${pinnedVersion}`);
    return new BinaryManager({
      version: pinnedVersion,
      verbose,
      forceVersion: true,
    }).ensureBinary();
  }
  return new BinaryManager({ verbose }).ensureBinary();
}

/** Check if CLIProxyAPI binary is installed */
export function isCLIProxyInstalled(): boolean {
  return new BinaryManager().isBinaryInstalled();
}

/** Get CLIProxyAPI binary path (may not exist) */
export function getCLIProxyPath(): string {
  return new BinaryManager().getBinaryPath();
}

/** Get installed CLIProxyAPI version from .version file */
export function getInstalledCliproxyVersion(): string {
  return readInstalledVersion(getBinDir(), CLIPROXY_FALLBACK_VERSION);
}

/** Install a specific version of CLIProxyAPI */
export async function installCliproxyVersion(version: string, verbose = false): Promise<void> {
  const manager = new BinaryManager({ version, verbose, forceVersion: true });

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
    if (verbose)
      console.log(info(`Removing existing CLIProxy Plus v${getInstalledCliproxyVersion()}`));
    manager.deleteBinary();
  }
  await manager.ensureBinary();

  if (verbose) {
    console.log(info('New version will be active on next CLIProxy command'));
  }
}

/** Fetch the latest CLIProxyAPI version from GitHub API */
export async function fetchLatestCliproxyVersion(): Promise<string> {
  const result = await new BinaryManager().checkForUpdates();
  return result.latestVersion;
}

/** Update check result for API response */
export interface CliproxyUpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  fromCache: boolean;
  checkedAt: number;
  // Stability fields
  isStable: boolean;
  maxStableVersion: string;
  stabilityMessage?: string;
}

/** Check for CLIProxyAPI binary updates */
export async function checkCliproxyUpdate(): Promise<CliproxyUpdateCheckResult> {
  const result = await new BinaryManager().checkForUpdates();

  // Import isNewerVersion for stability check
  const { isNewerVersion } = await import('./binary/version-checker');
  const isStable = !isNewerVersion(result.currentVersion, CLIPROXY_MAX_STABLE_VERSION);
  const stabilityMessage = isStable
    ? undefined
    : `v${result.currentVersion} has known stability issues. Max stable: v${CLIPROXY_MAX_STABLE_VERSION}`;

  return {
    ...result,
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
};

export default BinaryManager;
