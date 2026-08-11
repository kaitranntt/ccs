/**
 * Binary Installer
 * Handles downloading, verifying, and extracting binary.
 */

import * as fs from 'fs';
import * as path from 'path';
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
import { writeInstalledVersion } from './version-cache';
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
  const stagingPath = fs.mkdtempSync(path.join(config.binPath, '.cliproxy-install-'));
  const archivePath = path.join(stagingPath, `cliproxy-archive.${platform.extension}`);
  const stagedBinary = path.join(stagingPath, getExecutableName(backend));
  const installedBinary = path.join(config.binPath, getExecutableName(backend));
  const spinner = new ProgressIndicator(`Downloading ${backendLabel} v${config.version}`);
  spinner.start();

  try {
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

    renameSyncFn(stagedBinary, installedBinary);
    writeInstalledVersion(config.binPath, config.version);
    spinner.succeed(`${backendLabel} ready`);
    console.log(ok(`${backendLabel} v${config.version} installed successfully`));
  } catch (error) {
    spinner.fail('Installation failed');
    throw error;
  } finally {
    fs.rmSync(stagingPath, { recursive: true, force: true });
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
