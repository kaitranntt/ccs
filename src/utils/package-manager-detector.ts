/**
 * Package Manager Detector Utilities
 *
 * Detect the package manager and install root that own the CURRENT CCS binary.
 * This is intentionally different from "which package manager has CCS installed
 * somewhere on the machine" because self-update must target the current install.
 */

import * as fs from 'fs';
import * as path from 'path';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface CurrentInstall {
  manager: PackageManager;
  scriptPath: string;
  resolvedScriptPath: string;
  packageRoot: string | null;
  prefix: string | null;
  detectionSource: 'path' | 'package-root' | 'default';
}

export interface InstalledPackageState {
  version: string | null;
  packageJsonMtimeMs: number | null;
  scriptMtimeMs: number | null;
}

const CCS_PACKAGE_NAME = '@kaitranntt/ccs';

function resolveScriptPath(scriptPath: string): string {
  // Keep Windows-style absolute test fixtures stable on non-Windows hosts, but
  // still resolve real POSIX symlink paths such as ~/.bun/bin/ccs.
  if (path.win32.isAbsolute(scriptPath) && !path.isAbsolute(scriptPath)) {
    return scriptPath;
  }

  try {
    return fs.realpathSync(scriptPath);
  } catch {
    return path.resolve(scriptPath);
  }
}

function findPackageRoot(scriptPath: string): string | null {
  let currentDir = path.dirname(scriptPath);

  for (let i = 0; i < 8; i++) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
          name?: string;
        };
        if (packageJson.name === CCS_PACKAGE_NAME) {
          return currentDir;
        }
      } catch {
        // Ignore malformed package.json and keep walking upward.
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

function getPrefixBeforeMarker(packageRoot: string, marker: string): string | null {
  const index = packageRoot.lastIndexOf(marker);
  return index >= 0 ? packageRoot.slice(0, index) || path.parse(packageRoot).root : null;
}

function inferInstallFromPath(
  targetPath: string
): Pick<CurrentInstall, 'manager' | 'prefix'> | null {
  const normalizedPath = targetPath.split(path.sep).join('/');

  if (
    normalizedPath.includes(`/install/global/node_modules/@kaitranntt/ccs`) ||
    normalizedPath.includes(`/.bun/install/global/node_modules/@kaitranntt/ccs`)
  ) {
    return {
      manager: 'bun',
      prefix: getPrefixBeforeMarker(
        targetPath,
        `${path.sep}install${path.sep}global${path.sep}node_modules`
      ),
    };
  }

  if (normalizedPath.includes(`/global/node_modules/@kaitranntt/ccs`)) {
    return {
      manager: 'yarn',
      prefix: getPrefixBeforeMarker(targetPath, `${path.sep}global${path.sep}node_modules`),
    };
  }

  if (
    normalizedPath.includes('/global/') &&
    normalizedPath.includes('/.pnpm/') &&
    normalizedPath.includes('/node_modules/@kaitranntt/ccs')
  ) {
    const pnpmVirtualStoreMatch = targetPath.match(
      new RegExp(
        `${path.sep.replace(/\\/g, '\\\\')}global${path.sep.replace(/\\/g, '\\\\')}[^${path.sep.replace(
          /\\/g,
          '\\\\'
        )}]+${path.sep.replace(/\\/g, '\\\\')}\\.pnpm${path.sep.replace(/\\/g, '\\\\')}`
      )
    );
    if (pnpmVirtualStoreMatch) {
      return {
        manager: 'pnpm',
        prefix: getPrefixBeforeMarker(targetPath, `${path.sep}global${path.sep}`),
      };
    }
  }

  if (
    normalizedPath.includes('/global/') &&
    normalizedPath.includes('/node_modules/@kaitranntt/ccs')
  ) {
    // pnpm v9+ nests a version segment plus a store-hash segment under
    // global/ (e.g. global/v11/139e7-1a00df73ffb.../node_modules), while
    // older pnpm uses a single segment (global/5/node_modules). Accept one
    // or more segments but keep excluding yarn's global/lib/node_modules.
    const pnpmFlatMatch = normalizedPath.match(
      /\/global\/([^/]+(?:\/[^/]+)*)\/node_modules\/@kaitranntt\/ccs/
    );

    if (!pnpmFlatMatch || pnpmFlatMatch[1].split('/')[0] === 'lib') {
      return null;
    }

    return {
      manager: 'pnpm',
      prefix: getPrefixBeforeMarker(targetPath, `${path.sep}global${path.sep}`),
    };
  }

  if (
    normalizedPath.includes('/.pnpm/') &&
    normalizedPath.includes('/node_modules/@kaitranntt/ccs')
  ) {
    return {
      manager: 'pnpm',
      prefix: null,
    };
  }

  if (normalizedPath.includes('/lib/node_modules/@kaitranntt/ccs')) {
    return {
      manager: 'npm',
      prefix: getPrefixBeforeMarker(targetPath, `${path.sep}lib${path.sep}node_modules`),
    };
  }

  if (
    normalizedPath.includes('/node_modules/@kaitranntt/ccs') &&
    !normalizedPath.includes('/global/node_modules/@kaitranntt/ccs') &&
    !normalizedPath.includes('/install/global/node_modules/@kaitranntt/ccs') &&
    !normalizedPath.includes('/.pnpm/')
  ) {
    return {
      manager: 'npm',
      prefix: getPrefixBeforeMarker(targetPath, `${path.sep}node_modules`),
    };
  }

  return null;
}

/**
 * Detect the current install owner from the path of the running script.
 * Defaults to npm when the path is ambiguous because npm's global layout is
 * the safest fallback for the existing manual remediation commands.
 */
export function detectCurrentInstall(scriptPath: string = process.argv[1] || ''): CurrentInstall {
  const resolvedScriptPath = resolveScriptPath(scriptPath);
  const pathMatch = inferInstallFromPath(resolvedScriptPath) ?? inferInstallFromPath(scriptPath);
  const packageRoot = findPackageRoot(resolvedScriptPath);

  if (pathMatch) {
    return {
      manager: pathMatch.manager,
      scriptPath,
      resolvedScriptPath,
      packageRoot,
      prefix: pathMatch.prefix,
      detectionSource: 'path',
    };
  }

  if (packageRoot) {
    const packageRootMatch = inferInstallFromPath(packageRoot);
    if (packageRootMatch) {
      return {
        manager: packageRootMatch.manager,
        scriptPath,
        resolvedScriptPath,
        packageRoot,
        prefix: packageRootMatch.prefix,
        detectionSource: 'package-root',
      };
    }
  }

  return {
    manager: 'npm',
    scriptPath,
    resolvedScriptPath,
    packageRoot,
    prefix: null,
    detectionSource: 'default',
  };
}

/**
 * Backward-compatible helper for callers that only need the package manager.
 */
export function detectPackageManager(scriptPath: string = process.argv[1] || ''): PackageManager {
  return detectCurrentInstall(scriptPath).manager;
}

export function buildPackageManagerEnv(
  install: CurrentInstall,
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  if (!install.prefix) {
    return { ...baseEnv };
  }

  switch (install.manager) {
    case 'npm':
      return {
        ...baseEnv,
        npm_config_prefix: install.prefix,
        NPM_CONFIG_PREFIX: install.prefix,
      };
    case 'yarn':
      return {
        ...baseEnv,
        YARN_GLOBAL_FOLDER: install.prefix,
      };
    case 'pnpm':
      return {
        ...baseEnv,
        PNPM_HOME: install.prefix,
      };
    case 'bun':
      return {
        ...baseEnv,
        BUN_INSTALL: install.prefix,
      };
    default:
      return { ...baseEnv };
  }
}

export function readInstalledPackageVersion(install: CurrentInstall): string | null {
  return readInstalledPackageState(install).version;
}

function readFileMtimeMs(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

export function readInstalledPackageState(install: CurrentInstall): InstalledPackageState {
  if (!install.packageRoot) {
    return {
      version: null,
      packageJsonMtimeMs: null,
      scriptMtimeMs: readFileMtimeMs(install.resolvedScriptPath),
    };
  }

  const packageJsonPath = path.join(install.packageRoot, 'package.json');
  const packageJsonMtimeMs = readFileMtimeMs(packageJsonPath);
  const scriptMtimeMs = readFileMtimeMs(install.resolvedScriptPath);

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      version?: string;
    };

    return {
      version: typeof packageJson.version === 'string' ? packageJson.version : null,
      packageJsonMtimeMs,
      scriptMtimeMs,
    };
  } catch {
    return {
      version: null,
      packageJsonMtimeMs,
      scriptMtimeMs,
    };
  }
}

function quoteForShell(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quoteForCmd(value: string): string {
  return value.replace(/'/g, "''");
}

function formatWindowsEnvCommand(envVar: string, value: string, command: string): string {
  return `powershell -NoProfile -Command "$env:${envVar}='${quoteForCmd(value)}'; ${command}"`;
}

export function formatManualUpdateCommand(
  targetTag: string,
  install: CurrentInstall = detectCurrentInstall(),
  platform: NodeJS.Platform = process.platform
): string {
  const command = {
    npm: `npm install -g @kaitranntt/ccs@${targetTag}`,
    yarn: `yarn global add @kaitranntt/ccs@${targetTag}`,
    pnpm: `pnpm add -g @kaitranntt/ccs@${targetTag}`,
    bun: `bun add -g @kaitranntt/ccs@${targetTag}`,
  }[install.manager];

  if (!install.prefix) {
    return command;
  }

  const envVar = {
    npm: 'NPM_CONFIG_PREFIX',
    yarn: 'YARN_GLOBAL_FOLDER',
    pnpm: 'PNPM_HOME',
    bun: 'BUN_INSTALL',
  }[install.manager];

  if (platform === 'win32') {
    return formatWindowsEnvCommand(envVar, install.prefix, command);
  }

  return `${envVar}=${quoteForShell(install.prefix)} ${command}`;
}
