/**
 * `ccs bar status` — report whether the CCS Bar server is running.
 *
 * Checks server.pid for the PID, then verifies the process is alive and
 * the server is reachable at GET /api/bar/summary. ASCII output only.
 */

import * as fs from 'fs';
import { getCcsDir } from '../../config/config-loader-facade';
import { getBarJsonPath, getServerPidPath } from './bar-paths';

// ---------------------------------------------------------------------------
// Types — injectable deps
// ---------------------------------------------------------------------------

export interface StatusDeps {
  /** Returns ~/.ccs dir (respects CCS_HOME). */
  getCcsDir: () => string;
  /**
   * Read the server.pid file. Returns the raw string content, or null when
   * absent or unreadable.
   */
  readPidFile: (pidPath: string) => string | null;
  /**
   * Check whether a process is alive.
   * Uses kill(pid, 0) semantics: no error = alive, ESRCH = gone.
   * Returns true when alive, false otherwise.
   */
  isProcessAlive: (pid: number) => boolean;
  /**
   * Probe whether the server is reachable at GET {baseUrl}/api/bar/summary.
   * Returns true on HTTP 200, false otherwise. Never throws.
   */
  probeServer: (baseUrl: string) => Promise<boolean>;
  /**
   * Read bar.json and return the baseUrl field, or null when absent/malformed.
   */
  readBarJsonBaseUrl: (barJsonPath: string) => string | null;
}

// ---------------------------------------------------------------------------
// Default implementations
// ---------------------------------------------------------------------------

function defaultGetCcsDir(): string {
  return getCcsDir();
}

function defaultReadPidFile(pidPath: string): string | null {
  try {
    return fs.readFileSync(pidPath, 'utf8').trim();
  } catch {
    return null;
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    // kill(pid, 0) is a POSIX trick: sends no signal but checks if the
    // process exists and is accessible. Throws ESRCH when gone.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function defaultProbeServer(baseUrl: string): Promise<boolean> {
  try {
    const { request } = await import('undici');
    const { statusCode, body } = await request(`${baseUrl}/api/bar/summary`, {
      method: 'GET',
      headersTimeout: 2000,
      bodyTimeout: 2000,
    });
    // Drain body to release the socket.
    await body.text();
    return statusCode === 200;
  } catch {
    return false;
  }
}

function defaultReadBarJsonBaseUrl(barJsonPath: string): string | null {
  try {
    const raw = fs.readFileSync(barJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<{ baseUrl: string }>;
    return typeof parsed.baseUrl === 'string' ? parsed.baseUrl : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function handleBarStatus(
  _args: string[],
  deps: Partial<StatusDeps> = {}
): Promise<void> {
  const ccsDir = (deps.getCcsDir ?? defaultGetCcsDir)();
  const readPidFile = deps.readPidFile ?? defaultReadPidFile;
  const isProcessAlive = deps.isProcessAlive ?? defaultIsProcessAlive;
  const probeServer = deps.probeServer ?? defaultProbeServer;
  const readBarJsonBaseUrl = deps.readBarJsonBaseUrl ?? defaultReadBarJsonBaseUrl;

  const pidPath = getServerPidPath(ccsDir);
  const barJsonPath = getBarJsonPath(ccsDir);

  // 1. Check PID file.
  const pidRaw = readPidFile(pidPath);
  if (pidRaw === null) {
    console.log('[i] CCS Bar server: stopped (no server.pid)');
    return;
  }

  const pid = parseInt(pidRaw, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    console.log(`[!] CCS Bar server: server.pid is invalid ("${pidRaw}")`);
    return;
  }

  // 2. Check process liveness.
  const alive = isProcessAlive(pid);
  if (!alive) {
    console.log(`[!] CCS Bar server: PID ${pid} is no longer running (stale server.pid)`);
    console.log('[i] Run `ccs bar stop` to clean up, then `ccs bar` to restart.');
    return;
  }

  // 3. Probe HTTP reachability.
  const baseUrl = readBarJsonBaseUrl(barJsonPath) ?? 'http://127.0.0.1:3000';
  const reachable = await probeServer(baseUrl);

  if (reachable) {
    console.log(`[OK] CCS Bar server: running (PID ${pid}, ${baseUrl})`);
  } else {
    console.log(`[!] CCS Bar server: PID ${pid} alive but HTTP probe failed at ${baseUrl}`);
    console.log('[i] The server may still be starting up. Try again in a moment.');
  }
}
