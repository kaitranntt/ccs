/**
 * Platform Detector for CLIProxyAPI Binary Downloads
 *
 * Detects OS and architecture to determine correct binary asset.
 * Supports 6 platforms: darwin/linux/windows x amd64/arm64
 */

import { PlatformInfo, SupportedOS, SupportedArch, ArchiveExtension } from './types';

/**
 * CLIProxyAPIPlus fallback version (used when GitHub API unavailable)
 * Auto-update fetches latest from GitHub; this is only a safety net
 * Note: CLIProxyAPIPlus uses v6.6.X-0 suffix pattern
 */
export const CLIPROXY_FALLBACK_VERSION = '6.6.40-0';

/**
 * Maximum stable version cap - prevents auto-update to known unstable releases
 * v86-89 resolved the context cancellation bugs from v81-85
 * See: https://github.com/kaitranntt/ccs/issues/269
 */
export const CLIPROXY_MAX_STABLE_VERSION = '6.6.89-0';

/**
 * Faulty version range - versions with known critical bugs
 * v81-88 have context cancellation bugs causing intermittent 500 errors
 * v89 confirmed stable
 */
export const CLIPROXY_FAULTY_RANGE = { min: '6.6.81-0', max: '6.6.88-0' };

/** @deprecated Use CLIPROXY_FALLBACK_VERSION instead */
export const CLIPROXY_VERSION = CLIPROXY_FALLBACK_VERSION;

/**
 * Platform mapping from Node.js values to CLIProxyAPI naming
 */
const OS_MAP: Record<string, SupportedOS | undefined> = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const ARCH_MAP: Record<string, SupportedArch | undefined> = {
  x64: 'amd64',
  arm64: 'arm64',
};

/**
 * Detect current platform and return binary info
 * @param version Optional version for binaryName (defaults to fallback)
 * @throws Error if platform is unsupported
 */
export function detectPlatform(version: string = CLIPROXY_FALLBACK_VERSION): PlatformInfo {
  const nodePlatform = process.platform;
  const nodeArch = process.arch;

  const os = OS_MAP[nodePlatform];
  const arch = ARCH_MAP[nodeArch];

  if (!os) {
    throw new Error(
      `Unsupported operating system: ${nodePlatform}\n` +
        `Supported: macOS (darwin), Linux, Windows`
    );
  }

  if (!arch) {
    throw new Error(
      `Unsupported CPU architecture: ${nodeArch}\n` + `Supported: x64 (amd64), arm64`
    );
  }

  const extension: ArchiveExtension = os === 'windows' ? 'zip' : 'tar.gz';
  const binaryName = `CLIProxyAPIPlus_${version}_${os}_${arch}.${extension}`;

  return {
    os,
    arch,
    binaryName,
    extension,
  };
}

/**
 * Get executable name based on platform
 * @returns Binary executable name (with .exe on Windows)
 * Note: The actual binary inside the archive is named 'cli-proxy-api-plus'
 */
export function getExecutableName(): string {
  const platform = detectPlatform();
  return platform.os === 'windows' ? 'cli-proxy-api-plus.exe' : 'cli-proxy-api-plus';
}

/**
 * Get the name of the binary inside the archive
 * @returns Binary name as it appears in the tar.gz/zip
 */
export function getArchiveBinaryName(): string {
  const platform = detectPlatform();
  return platform.os === 'windows' ? 'cli-proxy-api-plus.exe' : 'cli-proxy-api-plus';
}

/**
 * Get download URL for current platform
 * @param version Version to download (defaults to fallback version)
 * @returns Full GitHub release download URL
 */
export function getDownloadUrl(version: string = CLIPROXY_FALLBACK_VERSION): string {
  const platform = detectPlatform(version);
  const baseUrl = `https://github.com/router-for-me/CLIProxyAPIPlus/releases/download/v${version}`;
  return `${baseUrl}/${platform.binaryName}`;
}

/**
 * Get checksums.txt URL for version
 * @param version Version to get checksums for (defaults to fallback version)
 * @returns Full URL to checksums.txt
 */
export function getChecksumsUrl(version: string = CLIPROXY_FALLBACK_VERSION): string {
  return `https://github.com/router-for-me/CLIProxyAPIPlus/releases/download/v${version}/checksums.txt`;
}

/**
 * Check if platform is supported
 * @returns true if current platform is supported
 */
export function isPlatformSupported(): boolean {
  try {
    detectPlatform();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get human-readable platform description
 * @returns Description string (e.g., "macOS arm64")
 */
export function getPlatformDescription(): string {
  try {
    const platform = detectPlatform();
    const osName =
      platform.os === 'darwin' ? 'macOS' : platform.os === 'linux' ? 'Linux' : 'Windows';
    return `${osName} ${platform.arch}`;
  } catch {
    return `${process.platform} ${process.arch} (unsupported)`;
  }
}
