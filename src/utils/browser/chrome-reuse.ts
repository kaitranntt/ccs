import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { BrowserEvalMode } from '../../config/unified-config-types';
import { expandPath } from '../helpers';

export interface BrowserReuseOptions {
  profileDir?: string;
  devtoolsPort?: string;
  evalMode?: BrowserEvalMode;
}

export interface BrowserRuntimeEnv {
  [key: string]: string | undefined;
  CCS_BROWSER_USER_DATA_DIR: string;
  CCS_BROWSER_DEVTOOLS_HOST: string;
  CCS_BROWSER_DEVTOOLS_PORT: string;
  CCS_BROWSER_DEVTOOLS_HTTP_URL: string;
  CCS_BROWSER_DEVTOOLS_WS_URL: string;
  CCS_BROWSER_EVAL_MODE?: string;
}

const DEVTOOLS_HOST = '127.0.0.1';
const DEVTOOLS_ACTIVE_PORT_FILE = 'DevToolsActivePort';

export function resolveDefaultChromeUserDataDir(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string {
  switch (platform) {
    case 'darwin':
      return path.join(
        env.HOME || env.USERPROFILE || '',
        'Library',
        'Application Support',
        'Google',
        'Chrome'
      );
    case 'linux':
      return path.join(env.HOME || env.USERPROFILE || '', '.config', 'google-chrome');
    case 'win32': {
      const localAppData = env.LOCALAPPDATA;
      if (!localAppData) {
        throw new Error(
          'LOCALAPPDATA is required to resolve the default Chrome user-data-dir on Windows'
        );
      }
      return path.join(localAppData, 'Google', 'Chrome', 'User Data');
    }
    default:
      return path.join(env.HOME || env.USERPROFILE || '', '.config', 'google-chrome');
  }
}

export function resolveConfiguredBrowserProfileDir(profileDir?: string): string | undefined {
  return profileDir?.trim() ? expandPath(profileDir) : undefined;
}

export async function resolveBrowserRuntimeEnv(
  options: BrowserReuseOptions
): Promise<BrowserRuntimeEnv> {
  const requestedProfileDir = options.profileDir || resolveDefaultChromeUserDataDir();
  const userDataDir = expandPath(requestedProfileDir);

  const directoryStat = await safeStat(userDataDir);
  if (!directoryStat?.isDirectory()) {
    throw new Error(`Chrome profile directory is invalid: ${userDataDir}`);
  }

  const metadataPath = path.join(userDataDir, DEVTOOLS_ACTIVE_PORT_FILE);
  const port = await resolveDevToolsPort({
    userDataDir,
    metadataPath,
    explicitPort: options.devtoolsPort || process.env.CCS_BROWSER_DEVTOOLS_PORT,
  });
  const httpUrl = `http://${DEVTOOLS_HOST}:${port}`;
  const versionUrl = `${httpUrl}/json/version`;

  let versionPayload: unknown;
  try {
    const response = await fetch(versionUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    versionPayload = await response.json();
  } catch {
    throw new Error(`Chrome DevTools endpoint is unreachable: ${httpUrl}`);
  }

  const websocketUrl =
    typeof versionPayload === 'object' &&
    versionPayload !== null &&
    typeof (versionPayload as Record<string, unknown>).webSocketDebuggerUrl === 'string'
      ? (versionPayload as Record<string, string>).webSocketDebuggerUrl
      : '';

  if (!websocketUrl) {
    throw new Error(`Chrome DevTools endpoint did not provide a websocket target: ${versionUrl}`);
  }

  return {
    CCS_BROWSER_USER_DATA_DIR: userDataDir,
    CCS_BROWSER_DEVTOOLS_HOST: DEVTOOLS_HOST,
    CCS_BROWSER_DEVTOOLS_PORT: port,
    CCS_BROWSER_DEVTOOLS_HTTP_URL: httpUrl,
    CCS_BROWSER_DEVTOOLS_WS_URL: websocketUrl,
    ...(options.evalMode ? { CCS_BROWSER_EVAL_MODE: options.evalMode } : {}),
  };
}

function parseDevToolsPort(metadataPath: string, metadata: string): string {
  const [rawPort] = metadata
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!rawPort || !/^\d+$/.test(rawPort)) {
    throw new Error(`Chrome reuse metadata is invalid: ${metadataPath}`);
  }

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Chrome reuse metadata is invalid: ${metadataPath}`);
  }

  return String(port);
}

interface ResolveDevToolsPortOptions {
  userDataDir: string;
  metadataPath: string;
  explicitPort?: string;
}

async function resolveDevToolsPort(options: ResolveDevToolsPortOptions): Promise<string> {
  if (options.explicitPort?.trim()) {
    return parsePortValue(options.explicitPort.trim(), 'CCS_BROWSER_DEVTOOLS_PORT');
  }

  let metadata: string | undefined;
  try {
    metadata = await fs.promises.readFile(options.metadataPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== 'ENOENT') {
      throw new Error(`Chrome reuse metadata is unreadable: ${options.metadataPath}`);
    }
  }

  if (metadata !== undefined) {
    return parseDevToolsPort(options.metadataPath, metadata);
  }

  const discoveredPort = discoverDevToolsPortFromChromeProcess(options.userDataDir);
  if (discoveredPort) {
    return discoveredPort;
  }

  throw new Error(`Chrome reuse metadata not found: ${options.metadataPath}`);
}

function parsePortValue(rawPort: string, sourceLabel: string): string {
  if (!/^\d+$/.test(rawPort)) {
    throw new Error(`Chrome reuse metadata is invalid: ${sourceLabel}`);
  }

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Chrome reuse metadata is invalid: ${sourceLabel}`);
  }

  return String(port);
}

function discoverDevToolsPortFromChromeProcess(userDataDir: string): string | undefined {
  try {
    const processList = execFileSync('ps', ['-axww', '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = processList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const normalizedDir = normalizePathForComparison(userDataDir);

    for (const line of lines) {
      if (!line.includes('Chrome') && !line.includes('chromium')) {
        continue;
      }
      if (!matchesUserDataDir(line, normalizedDir)) {
        continue;
      }

      const match = line.match(/--remote-debugging-port=(\d+)/);
      if (match?.[1]) {
        return parsePortValue(match[1], 'process-list');
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function matchesUserDataDir(commandLine: string, normalizedDir: string): boolean {
  const candidates = [
    `--user-data-dir=${normalizedDir}`,
    `--user-data-dir="${normalizedDir}"`,
    `--user-data-dir='${normalizedDir}'`,
  ];
  const normalizedCommand = normalizePathForComparison(commandLine);
  return candidates.some((candidate) => normalizedCommand.includes(candidate));
}

function normalizePathForComparison(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

async function safeStat(targetPath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(targetPath);
  } catch {
    return null;
  }
}
