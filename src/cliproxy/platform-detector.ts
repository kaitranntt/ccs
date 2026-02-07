/**
 * Platform Detector for CLIProxyAPI Binary Downloads
 *
 * Detects OS and architecture to determine correct binary asset.
 * Supports 6 platforms: darwin/linux/windows x amd64/arm64
 */

import {
  PlatformInfo,
  SupportedOS,
  SupportedArch,
  ArchiveExtension,
  CLIProxyBackend,
} from './types';

/** Backend configuration */
export const BACKEND_CONFIG = {
  original: {
    repo: 'router-for-me/CLIProxyAPI',
    binaryPrefix: 'CLIProxyAPI',
    executable: 'cli-proxy-api',
    fallbackVersion: '6.8.2',
  },
  plus: {
    repo: 'router-for-me/CLIProxyAPIPlus',
    binaryPrefix: 'CLIProxyAPIPlus',
    executable: 'cli-proxy-api-plus',
    fallbackVersion: '6.8.2-0',
  },
} as const;

/** Default backend */
export const DEFAULT_BACKEND: CLIProxyBackend = 'plus';

/**
 * CLIProxyAPIPlus fallback version (used when GitHub API unavailable)
 * Auto-update fetches latest from GitHub; this is only a safety net
 * Note: CLIProxyAPIPlus uses v6.6.X-0 suffix pattern
 * @deprecated Use getFallbackVersion() or BACKEND_CONFIG instead
 */
export const CLIPROXY_FALLBACK_VERSION = BACKEND_CONFIG[DEFAULT_BACKEND].fallbackVersion;

/**
 * Maximum stable version cap - prevents auto-update to known unstable releases
 * Currently set high since v89+ are all stable.
 * Only v81-88 have known bugs (see CLIPROXY_FAULTY_RANGE).
 * See: https://github.com/kaitranntt/ccs/issues/269
 */
export const CLIPROXY_MAX_STABLE_VERSION = '9.9.999-0';

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
 * @param version Optional version for binaryName (defaults to backend fallback)
 * @param backend Backend variant to use (defaults to DEFAULT_BACKEND)
 * @throws Error if platform is unsupported
 */
export function detectPlatform(
  version?: string,
  backend: CLIProxyBackend = DEFAULT_BACKEND
): PlatformInfo {
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

  const config = BACKEND_CONFIG[backend];
  const ver = version || config.fallbackVersion;
  const extension: ArchiveExtension = os === 'windows' ? 'zip' : 'tar.gz';
  const binaryName = `${config.binaryPrefix}_${ver}_${os}_${arch}.${extension}`;

  return {
    os,
    arch,
    binaryName,
    extension,
  };
}

/**
 * Get executable name based on platform
 * @param backend Backend variant to use (defaults to DEFAULT_BACKEND)
 * @returns Binary executable name (with .exe on Windows)
 */
export function getExecutableName(backend: CLIProxyBackend = DEFAULT_BACKEND): string {
  const config = BACKEND_CONFIG[backend];
  const platform = detectPlatform(undefined, backend);
  return platform.os === 'windows' ? `${config.executable}.exe` : config.executable;
}

/**
 * Get the name of the binary inside the archive
 * @param backend Backend variant to use (defaults to DEFAULT_BACKEND)
 * @returns Binary name as it appears in the tar.gz/zip
 */
export function getArchiveBinaryName(backend: CLIProxyBackend = DEFAULT_BACKEND): string {
  return getExecutableName(backend);
}

/**
 * Get download URL for current platform
 * @param version Version to download (defaults to backend fallback version)
 * @param backend Backend variant to use (defaults to DEFAULT_BACKEND)
 * @returns Full GitHub release download URL
 */
export function getDownloadUrl(
  version?: string,
  backend: CLIProxyBackend = DEFAULT_BACKEND
): string {
  const config = BACKEND_CONFIG[backend];
  const ver = version || config.fallbackVersion;
  const platform = detectPlatform(ver, backend);
  return `https://github.com/${config.repo}/releases/download/v${ver}/${platform.binaryName}`;
}

/**
 * Get checksums.txt URL for version
 * @param version Version to get checksums for (defaults to backend fallback version)
 * @param backend Backend variant to use (defaults to DEFAULT_BACKEND)
 * @returns Full URL to checksums.txt
 */
export function getChecksumsUrl(
  version?: string,
  backend: CLIProxyBackend = DEFAULT_BACKEND
): string {
  const config = BACKEND_CONFIG[backend];
  const ver = version || config.fallbackVersion;
  return `https://github.com/${config.repo}/releases/download/v${ver}/checksums.txt`;
}

/**
 * Get fallback version for backend
 * @param backend Backend variant to use (defaults to DEFAULT_BACKEND)
 * @returns Fallback version string
 */
export function getFallbackVersion(backend: CLIProxyBackend = DEFAULT_BACKEND): string {
  return BACKEND_CONFIG[backend].fallbackVersion;
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
