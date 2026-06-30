/**
 * `ccs bar stop` — stop the detached CCS Bar server.
 *
 * Reads ~/.ccs/bar/server.pid, sends SIGTERM, then removes pid + bar.json.
 * ASCII output only. Non-fatal if the server is already gone.
 */

import * as fs from 'fs';
import { getCcsDir } from '../../config/config-loader-facade';
import { getBarJsonPath, getServerPidPath } from './bar-paths';

// ---------------------------------------------------------------------------
// Types — injectable deps
// ---------------------------------------------------------------------------

export interface StopDeps {
  /** Returns ~/.ccs dir (respects CCS_HOME). */
  getCcsDir: () => string;
  /**
   * Read the server.pid file. Returns the raw string content, or null when
   * the file is absent or unreadable.
   */
  readPidFile: (pidPath: string) => string | null;
  /**
   * Send SIGTERM to the given PID.
   * Throws if the signal cannot be delivered (e.g. ESRCH — no such process).
   */
  killProcess: (pid: number, signal: 'SIGTERM') => void;
  /** Remove a file, ignoring errors if absent. */
  removeFile: (filePath: string) => void;
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

function defaultKillProcess(pid: number, signal: 'SIGTERM'): void {
  process.kill(pid, signal);
}

function defaultRemoveFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore — file may already be gone */
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function handleBarStop(_args: string[], deps: Partial<StopDeps> = {}): Promise<void> {
  const ccsDir = (deps.getCcsDir ?? defaultGetCcsDir)();
  const readPidFile = deps.readPidFile ?? defaultReadPidFile;
  const killProcess = deps.killProcess ?? defaultKillProcess;
  const removeFile = deps.removeFile ?? defaultRemoveFile;

  const pidPath = getServerPidPath(ccsDir);
  const barJsonPath = getBarJsonPath(ccsDir);

  // 1. Read the PID file.
  const pidRaw = readPidFile(pidPath);
  if (pidRaw === null) {
    console.log('[i] CCS Bar server is not running (no server.pid found).');
    return;
  }

  const pid = parseInt(pidRaw, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    console.error(`[X] server.pid contains an invalid PID: "${pidRaw}"`);
    // Clean up the corrupted file so subsequent runs start fresh.
    removeFile(pidPath);
    return;
  }

  // 2. Send SIGTERM.
  try {
    killProcess(pid, 'SIGTERM');
    console.log(`[OK] Sent SIGTERM to CCS Bar server (PID ${pid}).`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      // Process no longer exists — stale PID file, clean up silently.
      console.log(`[i] Server PID ${pid} is no longer running. Cleaning up stale files.`);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[X] Failed to stop server (PID ${pid}): ${msg}`);
      // Still remove the pid file so the user is not blocked.
    }
  }

  // 3. Remove pid + bar.json regardless of kill result.
  removeFile(pidPath);
  removeFile(barJsonPath);
  console.log('[i] Removed server.pid and bar.json.');
}
