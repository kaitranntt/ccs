/**
 * `ccs bar serve` — long-lived server host for CCS Bar.
 *
 * Reuse-or-start: probe candidate ports first. If a live server exists,
 * write bar.json pointing at it and exit 0 (no double-start). Otherwise
 * pick a free port, call startServer(), write bar.json + server.pid,
 * then stay alive until SIGINT/SIGTERM.
 *
 * This is the process that `ccs bar launch` spawns detached. The Swift
 * app also spawns it directly via launch.json.
 *
 * Accepts: --port N (honours a port the launcher pre-selected via getPort).
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from '../../config/config-loader-facade';
import { getBarJsonPath, getServerPidPath } from './bar-paths';
import { defaultFindRunningServer, resolveBarPort } from './bar-server-probe';
import { parsePortFlag, validatePortArgs } from './port-arg';
import type { DashboardInfo } from './bar-server-probe';
import type { BarDiscoveryJson } from './launch-subcommand';
import {
  getProcessBirthIdentity,
  removeBarServerProcessRecordIfOwned,
  serializeBarServerProcessRecord,
} from './bar-process-control';
import type { BarServerProcessRecord } from './bar-process-control';

// ---------------------------------------------------------------------------
// Types — injectable deps for testability
// ---------------------------------------------------------------------------

export interface ServeDeps {
  /** Probe candidate ports for a running CCS server. Never throws. */
  findRunningServer: () => Promise<DashboardInfo | null>;
  /**
   * Start the CCS web-server on the given port.
   * Returns { port, baseUrl } of the bound server.
   * The returned server keeps the process event loop alive while listening.
   */
  startServer: (opts: { port: number; host: string }) => Promise<DashboardInfo>;
  /**
   * Find a free port from the candidate list.
   * Returns one of the candidates or another free port.
   */
  getPort: (opts: { port: number[]; host: string }) => Promise<number>;
  /** Returns ~/.ccs dir (respects CCS_HOME). */
  getCcsDir: () => string;
  /** Write a file, creating parent dirs as needed. */
  writeFile: (filePath: string, content: string) => void;
  /** Remove a file if it exists (for cleanup on exit). */
  removeFile: (filePath: string) => void;
  /** Remove server.pid only if it still identifies this process. */
  removeProcessRecordIfOwned: (filePath: string, record: BarServerProcessRecord) => void;
  /** Register process signal handlers. */
  onSignal: (signal: 'SIGINT' | 'SIGTERM', handler: () => void) => void;
  /** Exit the process. */
  exit: (code: number) => never;
  /** Read a stable OS birth marker so later stop commands cannot signal a reused PID. */
  getProcessBirthIdentity: (pid: number) => string | null;
}

// ---------------------------------------------------------------------------
// Default implementations
// ---------------------------------------------------------------------------

async function defaultStartServer(opts: { port: number; host: string }): Promise<DashboardInfo> {
  const { startServer } = await import('../../web-server');
  const { server } = await startServer({ port: opts.port, host: opts.host });
  const addr = server.address();
  const resolvedPort = addr && typeof addr === 'object' ? addr.port : opts.port;
  const baseUrl = `http://127.0.0.1:${resolvedPort}`;
  return { port: resolvedPort, baseUrl };
}

async function defaultGetPort(opts: { port: number[]; host: string }): Promise<number> {
  const getPort = (await import('get-port')).default;
  return getPort(opts);
}

function defaultWriteFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function defaultOnSignal(signal: 'SIGINT' | 'SIGTERM', handler: () => void): void {
  process.on(signal, handler);
}

function defaultExit(code: number): never {
  process.exit(code);
}

function defaultGetCcsDir(): string {
  return getCcsDir();
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function handleBarServe(args: string[], deps: Partial<ServeDeps> = {}): Promise<void> {
  const argError = validatePortArgs(args);
  if (argError !== null) {
    console.error(`[X] ${argError}`);
    (deps.exit ?? defaultExit)(1);
    return;
  }
  const ccsDir = (deps.getCcsDir ?? defaultGetCcsDir)();
  const findRunningServer = deps.findRunningServer ?? (() => defaultFindRunningServer(ccsDir));
  const startServerFn = deps.startServer ?? defaultStartServer;
  const getPortFn = deps.getPort ?? defaultGetPort;
  const writeFile = deps.writeFile ?? defaultWriteFile;
  const removeProcessRecordIfOwned =
    deps.removeProcessRecordIfOwned ?? removeBarServerProcessRecordIfOwned;
  const onSignal = deps.onSignal ?? defaultOnSignal;
  const exit = deps.exit ?? defaultExit;
  const readProcessBirthIdentity = deps.getProcessBirthIdentity ?? getProcessBirthIdentity;

  const barJsonPath = getBarJsonPath(ccsDir);
  const serverPidPath = getServerPidPath(ccsDir);

  // 1. Reuse-or-start: probe candidate ports first.
  let running: DashboardInfo | null = null;
  try {
    running = await findRunningServer();
  } catch {
    /* probe errors count as null */
  }

  if (running !== null) {
    // A live server is already running — write bar.json and exit cleanly.
    const barJson: BarDiscoveryJson = {
      baseUrl: running.baseUrl,
      port: running.port,
      authMode: 'loopback',
    };
    try {
      writeFile(barJsonPath, JSON.stringify(barJson, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[X] Failed to write bar.json: ${msg}`);
      exit(1);
    }
    console.log(`[OK] CCS server already running at ${running.baseUrl} - reusing.`);
    exit(0);
  }

  // 2. No live server found — start one.
  // Honor --port N from the launcher (it pre-selected via getPort to avoid races).
  // Without it, prefer the port recorded in bar.json so the server keeps coming
  // back on the port the user last chose (sticky port).
  const portFlag = parsePortFlag(args);
  if (portFlag.present && portFlag.port === null) {
    console.error('[X] Invalid --port value. Use an integer between 1 and 65535.');
    exit(1);
    return;
  }
  const requestedPort = portFlag.port;
  let port: number;
  if (requestedPort !== null) {
    port = requestedPort;
  } else {
    const stickyPort = resolveBarPort(ccsDir);
    const base = [3000, 3001, 3002, 8000, 8080];
    const candidates =
      stickyPort !== null ? [stickyPort, ...base.filter((p) => p !== stickyPort)] : base;
    port = await getPortFn({ port: candidates, host: '127.0.0.1' });
  }

  // TypeScript cannot infer that exit(1) is `never` when it is injected as a dep,
  // so we use a definite-assignment assertion on dashboardInfo.

  let dashboardInfo!: DashboardInfo;
  try {
    dashboardInfo = await startServerFn({ port, host: '127.0.0.1' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Failed to start CCS server: ${msg}`);
    exit(1);
  }

  // 3. Publish the owned process record before discovery. Stop cleanup uses
  // server.pid as the ownership barrier, so discovery must never appear first.
  const barJson: BarDiscoveryJson = {
    baseUrl: dashboardInfo.baseUrl,
    port: dashboardInfo.port,
    authMode: 'loopback',
  };
  const birthIdentity = readProcessBirthIdentity(process.pid);
  if (birthIdentity === null) {
    console.error('[X] Failed to record CCS Bar process identity; stopping unmanaged server.');
    exit(1);
    return;
  }

  const processRecord = { pid: process.pid, birthIdentity };
  try {
    writeFile(serverPidPath, serializeBarServerProcessRecord(processRecord));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Failed to write server.pid: ${msg}`);
    exit(1);
    return;
  }

  try {
    writeFile(barJsonPath, JSON.stringify(barJson, null, 2));
  } catch (err) {
    try {
      removeProcessRecordIfOwned(serverPidPath, processRecord);
    } catch (cleanupErr) {
      const cleanupMessage = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      console.error(`[!] Failed to roll back server.pid: ${cleanupMessage}`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[X] Failed to write bar.json: ${msg}`);
    exit(1);
    return;
  }

  console.log(`[OK] CCS Bar server started at ${dashboardInfo.baseUrl}`);
  console.log(`[i]  PID ${process.pid} - stop with \`ccs bar stop\``);

  // 4. Clean shutdown on SIGINT / SIGTERM.
  const shutdown = (): void => {
    removeProcessRecordIfOwned(serverPidPath, processRecord);
    // bar.json is intentionally left in place on clean shutdown so
    // the Swift app self-heal poll can detect the server is gone via
    // the liveness check, not a stale discovery file.
    console.log('\n[OK] CCS Bar server stopped.');
    exit(0);
  };

  onSignal('SIGINT', shutdown);
  onSignal('SIGTERM', shutdown);

  // 5. Stay alive — the startServer() HTTP server keeps the Node/Bun event loop
  //    alive while listening. Nothing else needed here.
}
