/**
 * `ccs bar launch` — start the CCS Bar server detached, write bar.json, open the app.
 *
 * bar.json shape (v1):
 *   { baseUrl: string, port: number, authMode: "loopback" }
 *
 * Detached model (replaces the old in-process model):
 *   1. Probe candidate ports (bar.json port first, then 3000/3001/3002/8000/8080).
 *   2. If a live server is found → reuse it, write bar.json, open app, return.
 *   3. Else → refresh launch.json, getPort to pick a free port, spawn
 *      `ccs bar serve --port N` detached with stdio → serve.log, poll
 *      /api/bar/summary until 200 (timeout ~10 s), write bar.json, open app,
 *      return. The CLI process exits; the server continues as a detached child.
 *
 * All side-effectful deps are injectable so tests can run without real
 * servers, ports, or file-system writes.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ChildProcess } from 'child_process';
import { getCcsDir } from '../../config/config-loader-facade';
import {
  BAR_AUTH_NONCE_HEADER,
  BAR_AUTH_TOKEN_HEADER,
  createBarAuthNonce,
  isMatchingBarAuthProof,
  getOrCreateBarAuthToken,
} from '../../utils/bar-auth-token';
import { getBarDir, getBarJsonPath, getLaunchJsonPath, getServeLogPath } from './bar-paths';
import type { LaunchJson } from './bar-paths';
import { createBarLaunchDescriptor } from './launch-descriptor';
import {
  defaultFindRunningServer as _defaultFindRunningServer,
  resolveBarPort as _resolveBarPort,
} from './bar-server-probe';
import type { DashboardInfo as _DashboardInfo } from './bar-server-probe';

const BAR_PROBE_TIMEOUT_MS = 1500;
const MAX_BAR_PROBE_RESPONSE_BYTES = 8192;

// ---------------------------------------------------------------------------
// Re-exports — backward compat for tests that import from this module.
// resolveBarPort + defaultFindRunningServer are canonical in bar-server-probe.ts;
// we re-export them so existing imports from launch-subcommand continue to work.
// ---------------------------------------------------------------------------

export { _defaultFindRunningServer as defaultFindRunningServer };
export { _resolveBarPort as resolveBarPort };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BarDiscoveryJson {
  baseUrl: string;
  port: number;
  authMode: 'loopback';
}

export type DashboardInfo = _DashboardInfo;

export interface LaunchDeps {
  /**
   * Probe candidate ports for a running CCS server.
   * Returns { port, baseUrl } of the first live server found, or null if none.
   * Never throws — any error is treated as "not found".
   */
  findRunningServer: () => Promise<DashboardInfo | null>;
  /**
   * Find a free port from the candidate list.
   * Used to pre-select a port before spawning the detached server.
   */
  getPort: (opts: { port: number[]; host: string }) => Promise<number>;
  /**
   * Spawn the `ccs bar serve --port N` process detached and return immediately.
   * The spawned process must be unref()ed so the launcher can exit.
   */
  spawnDetachedServer: (port: number, logPath: string) => ChildProcess | void;
  /**
   * Poll GET {baseUrl}/api/bar/summary until HTTP 200 or timeout.
   * Returns the live baseUrl on success, throws on timeout.
   */
  waitForServerLive: (baseUrl: string) => Promise<void>;
  /**
   * Write launch.json so the Swift app can spawn the server independently.
   */
  writeLaunchDescriptor: (jsonPath: string, descriptor: LaunchJson) => void;
  /** Open the installed .app bundle. Throws if the app is not found. */
  openApp: (appPath: string) => Promise<void>;
  /** Returns path to ~/.ccs (respects CCS_HOME for test isolation). */
  getCcsDir: () => string;
  /** Full path where the .app should be installed, e.g. ~/Applications/CCS Bar.app */
  appInstallPath: string;
}

// ---------------------------------------------------------------------------
// Default production dependencies
// ---------------------------------------------------------------------------

async function defaultGetPort(opts: { port: number[]; host: string }): Promise<number> {
  const getPort = (await import('get-port')).default;
  return getPort(opts);
}

/**
 * Spawn `ccs bar serve --port N` detached so it outlives this CLI process.
 *
 * stdio is redirected to serve.log so server output is preserved for
 * debugging without a terminal.  unref() lets the launcher exit immediately.
 */
function defaultSpawnDetachedServer(port: number, logPath: string): ChildProcess {
  const { spawn } = require('child_process') as typeof import('child_process');

  // Open (or create) the log file for appending.
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [process.argv[1], 'bar', 'serve', '--port', String(port)], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    cwd: os.homedir(),
    env: process.env,
  });
  child.unref();
  // Close our copy of the fd — the child has its own reference.
  fs.closeSync(logFd);
  return child;
}

/**
 * Poll GET {baseUrl}/api/bar/summary every 250 ms until HTTP 200 or ~10 s.
 * Resolves when the server is live. Rejects on timeout.
 */
export class BarServerAuthRequiredError extends Error {
  constructor(baseUrl: string, statusCode: number) {
    super(`CCS Bar server at ${baseUrl} requires dashboard authentication (HTTP ${statusCode})`);
    this.name = 'BarServerAuthRequiredError';
  }
}

export class BarServerTimeoutError extends Error {
  constructor(baseUrl: string, timeoutSeconds: number) {
    super(`CCS Bar server did not become live at ${baseUrl} within ${timeoutSeconds}s`);
    this.name = 'BarServerTimeoutError';
  }
}

function isAuthRequiredStatus(statusCode: number): boolean {
  return statusCode === 401 || statusCode === 403;
}

export async function defaultWaitForServerLive(baseUrl: string): Promise<void> {
  const net = await import('net');
  const token = getOrCreateBarAuthToken();
  const INTERVAL_MS = 250;
  const TIMEOUT_MS = 10_000;
  const deadline = Date.now() + TIMEOUT_MS;

  async function probe(): Promise<{ statusCode: number | null; tokenMatched: boolean }> {
    const url = new URL(`${baseUrl}/api/bar/summary`);
    const nonce = createBarAuthNonce();
    return new Promise((resolve) => {
      let rawResponse = '';
      let settled = false;
      const absoluteDeadline = setTimeout(() => finish(), BAR_PROBE_TIMEOUT_MS);
      absoluteDeadline.unref?.();
      const finish = (statusCode: number | null = null, headerSection = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(absoluteDeadline);
        socket.destroy();
        if (statusCode === 200) {
          const echoMatch = headerSection.match(
            new RegExp(`${BAR_AUTH_TOKEN_HEADER}:\\s*([^\\r\\n]+)`, 'i')
          );
          const proof = echoMatch ? echoMatch[1].trim() : '';
          resolve({ statusCode, tokenMatched: isMatchingBarAuthProof(token, nonce, proof) });
          return;
        }
        resolve({ statusCode, tokenMatched: false });
      };
      const socket = net.connect(
        { host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port) },
        () => {
          // Do NOT include the token in the request; only send a fresh nonce so
          // the server can prove it knows the token without disclosing it.
          socket.write(
            `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\n${BAR_AUTH_NONCE_HEADER}: ${nonce}\r\nConnection: close\r\n\r\n`
          );
        }
      );
      socket.setTimeout(BAR_PROBE_TIMEOUT_MS, () => finish());
      socket.on('data', (chunk) => {
        rawResponse += chunk.toString('utf8');
        if (rawResponse.length > MAX_BAR_PROBE_RESPONSE_BYTES) {
          finish();
          return;
        }
        const statusMatch = rawResponse.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);
        if (statusMatch) {
          const code = Number(statusMatch[1]);
          if (code !== 200) {
            finish(code, rawResponse);
            return;
          }
          if (rawResponse.includes('\r\n\r\n')) {
            finish(code, rawResponse.split('\r\n\r\n')[0]);
          }
        }
      });
      socket.on('error', () => finish());
      socket.on('end', () => {
        const statusMatch = rawResponse.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);
        if (statusMatch) finish(Number(statusMatch[1]), rawResponse);
        else finish();
      });
    });
  }

  while (Date.now() < deadline) {
    const { statusCode, tokenMatched } = await probe();

    if (statusCode === 200 && tokenMatched) return;
    if (statusCode !== null && isAuthRequiredStatus(statusCode)) {
      throw new BarServerAuthRequiredError(baseUrl, statusCode);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  throw new BarServerTimeoutError(baseUrl, TIMEOUT_MS / 1000);
}

function defaultWriteLaunchDescriptor(jsonPath: string, descriptor: LaunchJson): void {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(descriptor, null, 2));
}

async function defaultOpenApp(appPath: string): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  await execFileAsync('open', ['-a', appPath]);
}

function defaultGetCcsDir(): string {
  return getCcsDir();
}

// Fix #5: use os.homedir() to match install-subcommand.ts and uninstall-subcommand.ts.
const DEFAULT_APP_INSTALL_PATH = path.join(os.homedir(), 'Applications', 'CCS Bar.app');

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function handleBarLaunch(
  _args: string[],
  deps: Partial<LaunchDeps> = {}
): Promise<void> {
  const ccsDir = (deps.getCcsDir ?? defaultGetCcsDir)();
  const openApp = deps.openApp ?? defaultOpenApp;
  const appInstallPath = deps.appInstallPath ?? DEFAULT_APP_INSTALL_PATH;
  const getPortFn = deps.getPort ?? defaultGetPort;
  const spawnDetachedServer = deps.spawnDetachedServer ?? defaultSpawnDetachedServer;
  const waitForServerLive = deps.waitForServerLive ?? defaultWaitForServerLive;
  const writeLaunchDescriptor = deps.writeLaunchDescriptor ?? defaultWriteLaunchDescriptor;

  // Wire findRunningServer after ccsDir is resolved.
  const findRunningServer = deps.findRunningServer ?? (() => _defaultFindRunningServer(ccsDir));

  const barJsonPath = getBarJsonPath(ccsDir);
  const launchJsonPath = getLaunchJsonPath(ccsDir);

  // 1. Probe for an already-running server.
  let running: DashboardInfo | null = null;
  try {
    running = await findRunningServer();
  } catch {
    /* any probe error counts as null */
  }

  if (running !== null) {
    if (running.authRequired) {
      console.error(
        `[X] CCS Bar cannot launch while dashboard authentication protects ${running.baseUrl}.`
      );
      console.error(
        '[i] Disable dashboard authentication for CCS Bar or start the dashboard manually.'
      );
      return;
    }

    // Reuse the live server — write bar.json and open the app.
    const barJson: BarDiscoveryJson = {
      baseUrl: running.baseUrl,
      port: running.port,
      authMode: 'loopback',
    };
    try {
      fs.mkdirSync(ccsDir, { recursive: true });
      fs.writeFileSync(barJsonPath, JSON.stringify(barJson, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[X] Failed to write bar.json: ${msg}`);
      return;
    }
    console.log(`[OK] Reusing running CCS web-server at ${running.baseUrl}`);
    console.log(`[i]  Discovery file written: ${barJsonPath}`);
    await _openAppWithFallback(appInstallPath, openApp);
    return;
  }

  // 2. No live server — pick a port, write/refresh launch.json, spawn detached.

  // 2a. Pick a free port.
  let port: number;
  try {
    port = await getPortFn({ port: [3000, 3001, 3002, 8000, 8080], host: '127.0.0.1' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Could not find a free port: ${msg}`);
    return;
  }

  // 2b. Write/refresh launch.json so the Swift app can self-start next time.
  try {
    const launchDescriptor = createBarLaunchDescriptor();
    writeLaunchDescriptor(launchJsonPath, launchDescriptor);
  } catch (err) {
    // Non-fatal — the Swift app falls back to resolving `ccs` via PATH.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[!] Could not write launch.json: ${msg}`);
  }

  // 2c. Spawn the detached server.
  const serveLogPath = getServeLogPath(ccsDir);
  const baseUrl = `http://127.0.0.1:${port}`;
  let spawnedChild: ChildProcess | void;
  try {
    fs.mkdirSync(getBarDir(ccsDir), { recursive: true });
    spawnedChild = spawnDetachedServer(port, serveLogPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Could not start CCS web-server: ${msg}`);
    console.error('[i] Run `ccs config` to start the dashboard manually.');
    return;
  }

  console.log('[i] Starting CCS Bar server...');

  // 2d. Poll until live or timeout.
  try {
    await waitForServerLive(baseUrl);
  } catch (err) {
    if (err instanceof BarServerAuthRequiredError) {
      spawnedChild?.kill();
      console.error(
        `[X] CCS Bar cannot launch while dashboard authentication protects ${baseUrl}.`
      );
      console.error(
        '[i] Disable dashboard authentication for CCS Bar or start the dashboard manually.'
      );
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Could not connect to CCS web-server: ${msg}`);
    console.error(`[i] Check logs at ${serveLogPath}`);
    return;
  }

  // 2e. Write bar.json.
  const barJson: BarDiscoveryJson = {
    baseUrl,
    port,
    authMode: 'loopback',
  };
  try {
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(barJsonPath, JSON.stringify(barJson, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Failed to write bar.json: ${msg}`);
    return;
  }

  console.log(`[OK] CCS web-server running at ${baseUrl}`);
  console.log(`[i]  Discovery file written: ${barJsonPath}`);

  // 3. Open the app — then return (process exits; server continues detached).
  await _openAppWithFallback(appInstallPath, openApp);
}

// ---------------------------------------------------------------------------
// Internal helper — open app with graceful degraded path
// ---------------------------------------------------------------------------

async function _openAppWithFallback(
  appInstallPath: string,
  openApp: (p: string) => Promise<void>
): Promise<void> {
  try {
    await openApp(appInstallPath);
    console.log('[OK] CCS Bar launched.');
  } catch {
    if (!fs.existsSync(appInstallPath)) {
      console.log('[!] CCS Bar app is not installed.');
      console.log('[i] Run `ccs bar install` to install it.');
    } else {
      console.log('[!] Could not open CCS Bar. Try right-clicking and selecting Open.');
      console.log('[i] If Gatekeeper blocks the app, run:');
      console.log(`      xattr -dr com.apple.quarantine "${appInstallPath}"`);
    }
  }
}
