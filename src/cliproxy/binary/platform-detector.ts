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
} from '../types';

/** Backend configuration */
export const BACKEND_CONFIG = {
  original: {
    repo: 'router-for-me/CLIProxyAPI',
    binaryPrefix: 'CLIProxyAPI',
    executable: 'cli-proxy-api',
    fallbackVersion: '6.9.45',
  },
  plus: {
    repo: 'kaitranntt/CLIProxyAPIPlus',
    binaryPrefix: 'CLIProxyAPIPlus',
    executable: 'cli-proxy-api-plus',
    fallbackVersion: '6.9.45-0',
  },
} as const;

/**
 * Default backend
 *
 * Keep 'original' as the stable default. The Plus backend is available as an
 * opt-in community-maintained fork for providers that are not available in the
 * original upstream binary.
 */
export const DEFAULT_BACKEND: CLIProxyBackend = 'original';

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

/** Platform mapping from Node.js values to CCS public architecture labels. */
const OS_MAP: Record<string, SupportedOS | undefined> = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const ARCH_MAP: Record<string, SupportedArch | undefined> = {
  x64: 'amd64',
  arm64: 'arm64',
};

/** CLIProxy release assets use aarch64 while Node.js reports arm64. */
const RELEASE_ARCH_MAP: Record<SupportedArch, SupportedArch> = {
  amd64: 'amd64',
  arm64: 'aarch64',
  aarch64: 'aarch64',
};

const PLUS_NO_PLUGIN_ASSET_MIN_VERSION = '7.1.68-0';
const PLUS_AARCH64_ASSET_MIN_VERSION = '7.1.45-1';

export function mapNodeArchToReleaseArch(nodeArch: string): SupportedArch | undefined {
  const arch = ARCH_MAP[nodeArch];
  return arch ? RELEASE_ARCH_MAP[arch] : undefined;
}

function parseVersionParts(version: string): [number, number, number, number] {
  const [coreVersion, forkRelease = '0'] = version.replace(/^v/, '').split('-', 2);
  const [major = 0, minor = 0, patch = 0] = coreVersion
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
  return [major, minor, patch, parseInt(forkRelease, 10) || 0];
}

function isAtLeastVersion(version: string, minimum: string): boolean {
  const left = parseVersionParts(version);
  const right = parseVersionParts(minimum);

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }

  return true;
}

function usesPlusNoPluginAsset(version: string, os: SupportedOS): boolean {
  return os !== 'windows' && isAtLeastVersion(version, PLUS_NO_PLUGIN_ASSET_MIN_VERSION);
}

function getReleaseArchForBackend(
  backend: CLIProxyBackend,
  version: string,
  publicArch: SupportedArch,
  releaseArch: SupportedArch
): SupportedArch {
  if (
    backend === 'plus' &&
    publicArch === 'arm64' &&
    !isAtLeastVersion(version, PLUS_AARCH64_ASSET_MIN_VERSION)
  ) {
    return 'arm64';
  }

  return releaseArch;
}

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
  const releaseArch = mapNodeArchToReleaseArch(nodeArch);

  if (!os) {
    throw new Error(
      `Unsupported operating system: ${nodePlatform}\n` +
        `Supported: macOS (darwin), Linux, Windows`
    );
  }

  if (!arch || !releaseArch) {
    throw new Error(
      `Unsupported CPU architecture: ${nodeArch}\n` + `Supported: x64 (amd64), arm64 (aarch64)`
    );
  }

  const config = BACKEND_CONFIG[backend];
  const ver = version || config.fallbackVersion;
  const extension: ArchiveExtension = os === 'windows' ? 'zip' : 'tar.gz';
  const assetArch = getReleaseArchForBackend(backend, ver, arch, releaseArch);
  const assetVariant = backend === 'plus' && usesPlusNoPluginAsset(ver, os) ? '_no-plugin' : '';
  const binaryName = `${config.binaryPrefix}_${ver}_${os}_${assetArch}${assetVariant}.${extension}`;

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
 * @returns Description string (e.g., "macOS ARM64")
 */
export function getPlatformDescription(): string {
  try {
    const platform = detectPlatform();
    const osName =
      platform.os === 'darwin' ? 'macOS' : platform.os === 'linux' ? 'Linux' : 'Windows';
    const archName =
      platform.arch === 'arm64' || platform.arch === 'aarch64' ? 'ARM64' : platform.arch;
    return `${osName} ${archName}`;
  } catch {
    return `${process.platform} ${process.arch} (unsupported)`;
  }
}
