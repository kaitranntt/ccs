/**
 * Binary Lifecycle Manager
 * Handles ensuring binary availability and auto-updates.
 */

import * as fs from 'fs';
import { BinaryManagerConfig } from '../types';
import {
  checkForUpdates,
  fetchLatestVersion,
  isNewerVersion,
  isVersionFaulty,
} from './version-checker';
import { downloadAndInstall, deleteBinary, getBinaryPath } from './installer';
import { info, warn } from '../../utils/ui';
import { isCliproxyRunning } from '../stats-fetcher';
import { CLIPROXY_DEFAULT_PORT } from '../config-generator';
import { CLIPROXY_MAX_STABLE_VERSION, CLIPROXY_FAULTY_RANGE } from '../platform-detector';

/** Log helper */
function log(message: string, verbose: boolean): void {
  if (verbose) console.error(`[cliproxy] ${message}`);
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
  const updateResult = await checkForUpdates(config.binPath, config.version, verbose);
  const currentVersion = updateResult.currentVersion;
  const latestVersion = updateResult.latestVersion;

  // Check if user is on known faulty version - recommend upgrade
  if (isVersionFaulty(currentVersion)) {
    console.log(
      warn(
        `CLIProxy Plus v${currentVersion} has known bugs (v${CLIPROXY_FAULTY_RANGE.min.replace(/-\d+$/, '')}-${CLIPROXY_FAULTY_RANGE.max.replace(/-\d+$/, '')}). ` +
          `Upgrade to v${CLIPROXY_MAX_STABLE_VERSION.replace(/-\d+$/, '')} recommended.`
      )
    );
    console.log(
      info(
        `Run "ccs cliproxy install ${CLIPROXY_MAX_STABLE_VERSION.replace(/-\d+$/, '')}" to upgrade`
      )
    );
  } else if (isAboveMaxStable(currentVersion)) {
    // Version newer than max stable (experimental)
    console.log(
      warn(
        `CLIProxy Plus v${currentVersion} is experimental (above stable v${CLIPROXY_MAX_STABLE_VERSION.replace(/-\d+$/, '')})`
      )
    );
  }

  if (!updateResult.hasUpdate) return;

  // Clamp to max stable version
  const targetVersion = clampToMaxStable(latestVersion, verbose);
  if (!isNewerVersion(targetVersion, currentVersion)) {
    log(`Already at max stable version ${currentVersion}`, verbose);
    return;
  }

  const proxyRunning = await isCliproxyRunning(CLIPROXY_DEFAULT_PORT);
  const latestNote = isAboveMaxStable(latestVersion) ? ` (latest v${latestVersion} unstable)` : '';
  const updateMsg = `CLIProxy Plus update: v${currentVersion} -> v${targetVersion}${latestNote}`;

  if (proxyRunning) {
    console.log(info(updateMsg));
    console.log(info('Run "ccs cliproxy stop" then restart to apply update'));
    log('Skipping update: CLIProxy Plus is currently running', verbose);
  } else {
    console.log(info(updateMsg));
    console.log(info('Updating CLIProxy Plus...'));
    deleteBinary(config.binPath, verbose);
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
  const binaryPath = getBinaryPath(config.binPath);

  // Binary exists - check for updates unless forceVersion
  if (fs.existsSync(binaryPath)) {
    log(`Binary exists: ${binaryPath}`, verbose);

    if (config.forceVersion) {
      log('Force version mode: skipping auto-update', verbose);
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

  // Binary missing - download
  log('Binary not found, downloading...', verbose);

  if (!config.forceVersion) {
    try {
      const latestVersion = await fetchLatestVersion(verbose);
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
