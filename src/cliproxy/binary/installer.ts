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
} from '../platform-detector';
import { downloadWithRetry } from './downloader';
import { verifyChecksum, computeChecksum } from './verifier';
import { extractArchive } from './extractor';
import { writeInstalledVersion } from './version-cache';
import { ProgressIndicator } from '../../utils/progress-indicator';
import { ok } from '../../utils/ui';

/**
 * Download and install the binary
 */
export async function downloadAndInstall(
  config: BinaryManagerConfig,
  verbose = false
): Promise<void> {
  const backend = config.backend ?? DEFAULT_BACKEND;
  const platform = detectPlatform(config.version, backend);
  const downloadUrl = getDownloadUrl(config.version, backend);
  const checksumsUrl = getChecksumsUrl(config.version, backend);
  const backendLabel = backend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';

  fs.mkdirSync(config.binPath, { recursive: true });

  // Delete existing binary before install to prevent mismatched binaries.
  // Abort if binary is currently running (ETXTBSY) — cannot replace in-use binary.
  // Happens in Docker when dashboard tries to update while bootstrap's instance is active.
  const existingBinary = path.join(config.binPath, getExecutableName(backend));
  if (fs.existsSync(existingBinary)) {
    try {
      fs.unlinkSync(existingBinary);
      if (verbose) console.error(`[cliproxy] Removed existing binary: ${existingBinary}`);
    } catch (error: unknown) {
      const code =
        error instanceof Error && 'code' in error ? (error as { code: string }).code : '';
      // ETXTBSY: Linux-specific error when unlinking a running executable.
      // EBUSY on Windows may mean something different (mount point, etc.),
      // so only treat ETXTBSY as "binary in use" to avoid misleading messages.
      if (code === 'ETXTBSY') {
        if (verbose)
          console.error(`[cliproxy] Binary is running, cannot replace: ${existingBinary}`);
        throw new Error(
          'CLIProxy binary is currently running and cannot be replaced. Restart the container to apply the update.'
        );
      }
      throw error;
    }
  }

  const archivePath = path.join(config.binPath, `cliproxy-archive.${platform.extension}`);
  const spinner = new ProgressIndicator(`Downloading ${backendLabel} v${config.version}`);
  spinner.start();

  try {
    const result = await downloadWithRetry(downloadUrl, archivePath, {
      maxRetries: config.maxRetries,
      verbose,
    });
    if (!result.success) {
      spinner.fail('Download failed');
      throw new Error(result.error || 'Download failed after retries');
    }

    spinner.update('Verifying checksum');
    const checksumResult = await verifyChecksum(
      archivePath,
      platform.binaryName,
      checksumsUrl,
      verbose
    );

    if (!checksumResult.valid) {
      spinner.fail('Checksum mismatch');
      fs.unlinkSync(archivePath);
      throw new Error(
        `Checksum mismatch for ${platform.binaryName}\nExpected: ${checksumResult.expected}\n` +
          `Actual:   ${checksumResult.actual}\n\nManual download: ${downloadUrl}`
      );
    }

    spinner.update('Extracting binary');
    await extractArchive(archivePath, config.binPath, platform.extension, verbose, backend);
    spinner.succeed(`${backendLabel} ready`);
    fs.unlinkSync(archivePath);

    const binaryPath = path.join(config.binPath, getExecutableName(backend));
    if (platform.os !== 'windows' && fs.existsSync(binaryPath)) {
      fs.chmodSync(binaryPath, 0o755);
      if (verbose) console.error(`[cliproxy] Set executable permissions: ${binaryPath}`);
    }

    writeInstalledVersion(config.binPath, config.version);
    console.log(ok(`${backendLabel} v${config.version} installed successfully`));
  } catch (error) {
    spinner.fail('Installation failed');
    throw error;
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
        throw new Error('CLIProxy binary is currently running and cannot be deleted.');
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
