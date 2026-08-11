/**
 * Binary Installer
 * Handles downloading, verifying, and extracting binary.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { BinaryManagerConfig } from '../types';
import {
  detectPlatform,
  getDownloadUrl,
  getChecksumsUrl,
  getExecutableName,
  DEFAULT_BACKEND,
} from '../binary/platform-detector';
import { downloadWithRetry } from './downloader';
import { verifyChecksum, computeChecksum } from './verifier';
import { extractArchive } from './extractor';
import { ProgressIndicator } from '../../utils/progress-indicator';
import { ok } from '../../utils/ui';
import { BinaryError, NetworkError } from '../../errors/error-types';

interface DownloadAndInstallDeps {
  downloadWithRetryFn?: typeof downloadWithRetry;
  verifyChecksumFn?: typeof verifyChecksum;
  extractArchiveFn?: typeof extractArchive;
  renameSyncFn?: typeof fs.renameSync;
}

/**
 * Download and install the binary
 */
export async function downloadAndInstall(
  config: BinaryManagerConfig,
  verbose = false,
  deps: DownloadAndInstallDeps = {}
): Promise<void> {
  const backend = config.backend ?? DEFAULT_BACKEND;
  const platform = detectPlatform(config.version, backend);
  const downloadUrl = getDownloadUrl(config.version, backend);
  const checksumsUrl = getChecksumsUrl(config.version, backend);
  const backendLabel = backend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';
  const downloadWithRetryFn = deps.downloadWithRetryFn ?? downloadWithRetry;
  const verifyChecksumFn = deps.verifyChecksumFn ?? verifyChecksum;
  const extractArchiveFn = deps.extractArchiveFn ?? extractArchive;
  const renameSyncFn = deps.renameSyncFn ?? fs.renameSync;

  fs.mkdirSync(config.binPath, { recursive: true });
  const releaseLock = await lockfile.lock(config.binPath, {
    stale: 10 * 60 * 1000,
    retries: { retries: 60, factor: 1, minTimeout: 250, maxTimeout: 250 },
  });
  let stagingPath: string | undefined;
  const spinner = new ProgressIndicator(`Downloading ${backendLabel} v${config.version}`);
  let installError: unknown;

  try {
    for (const entry of fs.readdirSync(config.binPath)) {
      if (entry.startsWith('.cliproxy-install-')) {
        fs.rmSync(path.join(config.binPath, entry), { recursive: true, force: true });
      }
    }
    stagingPath = fs.mkdtempSync(path.join(config.binPath, '.cliproxy-install-'));
    const archivePath = path.join(stagingPath, `cliproxy-archive.${platform.extension}`);
    const stagedBinary = path.join(stagingPath, getExecutableName(backend));
    const stagedVersion = path.join(stagingPath, '.version');
    const installedBinary = path.join(config.binPath, getExecutableName(backend));
    const installedVersion = path.join(config.binPath, '.version');
    const backupBinary = path.join(stagingPath, '.previous-binary');
    const hadInstalledBinary = fs.existsSync(installedBinary);
    spinner.start();

    const result = await downloadWithRetryFn(downloadUrl, archivePath, {
      maxRetries: config.maxRetries,
      verbose,
    });
    if (!result.success) {
      spinner.fail('Download failed');
      throw new NetworkError(result.error || 'Download failed after retries', downloadUrl);
    }

    spinner.update('Verifying checksum');
    const checksumResult = await verifyChecksumFn(
      archivePath,
      platform.binaryName,
      checksumsUrl,
      verbose
    );

    if (!checksumResult.valid) {
      spinner.fail('Checksum mismatch');
      throw new BinaryError(
        `Checksum mismatch for ${platform.binaryName}\nExpected: ${checksumResult.expected}\n` +
          `Actual:   ${checksumResult.actual}\n\nManual download: ${downloadUrl}`,
        stagedBinary
      );
    }

    spinner.update('Extracting binary');
    await extractArchiveFn(archivePath, stagingPath, platform.extension, verbose, backend);
    if (!fs.existsSync(stagedBinary) || !fs.statSync(stagedBinary).isFile()) {
      throw new BinaryError(
        `Extracted archive did not contain ${getExecutableName(backend)}`,
        stagedBinary
      );
    }

    if (platform.os !== 'windows') {
      fs.chmodSync(stagedBinary, 0o755);
      if (verbose) console.error(`[cliproxy] Set executable permissions: ${stagedBinary}`);
    }

    fs.writeFileSync(stagedVersion, config.version, 'utf8');
    if (hadInstalledBinary) {
      fs.copyFileSync(installedBinary, backupBinary);
      if (platform.os !== 'windows') fs.chmodSync(backupBinary, 0o755);
    }

    renameSyncFn(stagedBinary, installedBinary);
    try {
      renameSyncFn(stagedVersion, installedVersion);
    } catch (error) {
      if (hadInstalledBinary) {
        renameSyncFn(backupBinary, installedBinary);
      } else {
        fs.unlinkSync(installedBinary);
      }
      throw error;
    }
    spinner.succeed(`${backendLabel} ready`);
    console.log(ok(`${backendLabel} v${config.version} installed successfully`));
  } catch (error) {
    installError = error;
    spinner.fail('Installation failed');
    throw error;
  } finally {
    let cleanupError: unknown;
    try {
      if (stagingPath) fs.rmSync(stagingPath, { recursive: true, force: true });
    } catch (error) {
      cleanupError = error;
    } finally {
      try {
        await releaseLock();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (!installError && cleanupError) throw cleanupError;
  }
}

import type { CLIProxyBackend } from '../types';

/** Delete binary (for cleanup or reinstall) */
export function deleteBinary(binPath: string, verbose = false, backend?: CLIProxyBackend): void {
  const effectiveBackend = backend ?? DEFAULT_BACKEND;
  const binaryPath = path.join(binPath, getExecutableName(effectiveBackend));
  if (fs.existsSync(binaryPath)) {
    try {
      fs.unlinkSync(binaryPath);
      if (verbose) console.error(`[cliproxy] Deleted: ${binaryPath}`);
    } catch (error: unknown) {
      const code =
        error instanceof Error && 'code' in error ? (error as { code: string }).code : '';
      if (code === 'ETXTBSY') {
        throw new BinaryError(
          'CLIProxy binary is currently running and cannot be deleted.',
          binaryPath
        );
      }
      throw error;
    }
  }
}

/** Get binary path */
export function getBinaryPath(binPath: string, backend?: CLIProxyBackend): string {
  const effectiveBackend = backend ?? DEFAULT_BACKEND;
  return path.join(binPath, getExecutableName(effectiveBackend));
}

/** Check if binary exists */
export function isBinaryInstalled(binPath: string, backend?: CLIProxyBackend): boolean {
  return fs.existsSync(getBinaryPath(binPath, backend));
}

/** Get binary info if installed */
export async function getBinaryInfo(
  binPath: string,
  version: string,
  backend?: CLIProxyBackend
): Promise<{
  path: string;
  version: string;
  platform: ReturnType<typeof detectPlatform>;
  checksum: string;
} | null> {
  const effectiveBackend = backend ?? DEFAULT_BACKEND;
  const binaryPath = getBinaryPath(binPath, effectiveBackend);
  if (!fs.existsSync(binaryPath)) return null;

  const platform = detectPlatform(undefined, effectiveBackend);
  const checksum = await computeChecksum(binaryPath);
  return { path: binaryPath, version, platform, checksum };
}
