/**
 * Binary Lifecycle Manager
 * Handles ensuring binary availability and auto-updates.
 */

import * as fs from 'fs';
import { BinaryManagerConfig, CLIProxyBackend } from '../types';
import {
  checkForUpdates,
  fetchLatestVersion,
  isNewerVersion,
  isVersionFaulty,
} from './version-checker';
import { downloadAndInstall, deleteBinary, getBinaryPath } from './installer';
import { info, warn } from '../../utils/ui';
import { isCliproxyRunning } from '../services/stats-fetcher';
import { resolveLifecyclePort } from '../config/port-manager';
import {
  CLIPROXY_MAX_STABLE_VERSION,
  CLIPROXY_FAULTY_RANGE,
  DEFAULT_BACKEND,
} from '../binary/platform-detector';

/** Log helper */
function log(message: string, verbose: boolean): void {
  if (verbose) console.error(`[cliproxy] ${message}`);
}

function getBackendLabel(backend: CLIProxyBackend): string {
  return backend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';
}

/**
 * Check if version is above max stable (known unstable)
 */
function isAboveMaxStable(version: string): boolean {
  return isNewerVersion(version, CLIPROXY_MAX_STABLE_VERSION);
}

/**
 * Clamp version to max stable if newer versions are unstable
 * Returns max stable version if input is empty/invalid
 */
function clampToMaxStable(version: string | undefined, verbose: boolean): string {
  if (!version) {
    log(`Empty version, using max stable ${CLIPROXY_MAX_STABLE_VERSION}`, verbose);
    return CLIPROXY_MAX_STABLE_VERSION;
  }
  if (isAboveMaxStable(version)) {
    log(`Clamping ${version} to max stable ${CLIPROXY_MAX_STABLE_VERSION}`, verbose);
    return CLIPROXY_MAX_STABLE_VERSION;
  }
  return version;
}

/** Handle auto-update when binary exists */
async function handleAutoUpdate(config: BinaryManagerConfig, verbose: boolean): Promise<void> {
  const backend: CLIProxyBackend = config.backend ?? DEFAULT_BACKEND;
  const backendLabel = getBackendLabel(backend);
  const checkFn = config.checkForUpdatesFn ?? checkForUpdates;
  const updateResult = await checkFn(config.binPath, config.version, verbose, backend);
  const currentVersion = updateResult.currentVersion;
  const latestVersion = updateResult.latestVersion;

  // Check if user is on known faulty version - recommend upgrade
  if (isVersionFaulty(currentVersion)) {
    console.log(
      warn(
        `${backendLabel} v${currentVersion} has known bugs (v${CLIPROXY_FAULTY_RANGE.min.replace(/-\d+$/, '')}-${CLIPROXY_FAULTY_RANGE.max.replace(/-\d+$/, '')}). ` +
          `Upgrade to latest stable recommended.`
      )
    );
    console.log(info(`Run "ccs cliproxy install" to upgrade to latest stable`));
  }

  if (!updateResult.hasUpdate) return;

  // Clamp to max stable version
  const targetVersion = clampToMaxStable(latestVersion, verbose);
  if (!isNewerVersion(targetVersion, currentVersion)) {
    log(`Already at max stable version ${currentVersion}`, verbose);
    return;
  }

  const proxyRunning = await isCliproxyRunning(resolveLifecyclePort());
  const latestNote = isAboveMaxStable(latestVersion) ? ` (latest v${latestVersion} unstable)` : '';
  const updateMsg = `${backendLabel} update: v${currentVersion} -> v${targetVersion}${latestNote}`;

  if (proxyRunning) {
    console.log(info(updateMsg));
    console.log(info('Run "ccs cliproxy stop" then restart to apply update'));
    log(`Skipping update: ${backendLabel} is currently running`, verbose);
  } else {
    console.log(info(updateMsg));
    console.log(info(`Updating ${backendLabel}...`));
    deleteBinary(config.binPath, verbose, backend);
    config.version = targetVersion;
    await downloadAndInstall(config, verbose);
  }
}

/**
 * Ensure binary is available (download if missing, update if outdated)
 * @returns Path to executable binary
 */
export async function ensureBinary(config: BinaryManagerConfig): Promise<string> {
  const verbose = config.verbose;
  const backend: CLIProxyBackend = config.backend ?? DEFAULT_BACKEND;
  const binaryPath = getBinaryPath(config.binPath, backend);

  // Binary exists - check for updates unless forceVersion
  if (fs.existsSync(binaryPath)) {
    log(`Binary exists: ${binaryPath}`, verbose);

    if (config.forceVersion) {
      log('Force version mode: skipping auto-update', verbose);
      return binaryPath;
    }

    if (config.skipAutoUpdate) {
      log('Runtime bootstrap mode: skipping auto-update check', verbose);
      return binaryPath;
    }

    try {
      await handleAutoUpdate(config, verbose);
    } catch (error) {
      const err = error as Error;
      log(`Update check failed (non-blocking): ${err.message}`, verbose);
    }

    return binaryPath;
  }

  // Binary missing
  if (!config.allowInstall) {
    throw new Error(
      `${getBackendLabel(backend)} binary is not installed locally. ` +
        'Run "ccs cliproxy install" when you have network access.'
    );
  }

  // Only log download intent when a download will actually happen
  log('Binary not found, downloading...', verbose);

  if (!config.forceVersion) {
    try {
      const latestVersion = await fetchLatestVersion(verbose, backend);
      const targetVersion = clampToMaxStable(latestVersion, verbose);
      if (targetVersion && isNewerVersion(targetVersion, config.version)) {
        log(`Using version: ${targetVersion} (instead of ${config.version})`, verbose);
        config.version = targetVersion;
      }
    } catch {
      // API failed - use fallback but still clamp to max stable
      const fallbackVersion = clampToMaxStable(config.version, verbose);
      config.version = fallbackVersion;
      log(`Using fallback version: ${fallbackVersion}`, verbose);
    }
  } else {
    log(`Force version mode: using specified version ${config.version}`, verbose);
  }

  await downloadAndInstall(config, verbose);
  return binaryPath;
}
