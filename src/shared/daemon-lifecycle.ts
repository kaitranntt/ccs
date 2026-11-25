/**
 * Shared Daemon Lifecycle Helpers
 *
 * Consolidates PID file operations, 127.0.0.1 HTTP health probing,
 * cross-platform process ownership verification, and exit polling across
 * daemon managers (Cursor, Copilot, OpenAI-compat proxy).
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

export type DaemonOwnershipStatus = 'owned' | 'not-owned' | 'not-running' | 'unknown';

export const MIN_DAEMON_PORT = 1;
export const MAX_DAEMON_PORT = 65535;

export function isValidDaemonPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_DAEMON_PORT && port <= MAX_DAEMON_PORT;
}

export function getDaemonPidFromFile(pidFilePath: string): number | null {
  try {
    if (fs.existsSync(pidFilePath)) {
      const content = fs.readFileSync(pidFilePath, 'utf8').trim();
      const pid = parseInt(content, 10);
      return isNaN(pid) ? null : pid;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export function writeDaemonPidToFile(pidFilePath: string, pid: number): void {
  try {
    const dir = path.dirname(pidFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(pidFilePath, pid.toString(), { mode: 0o600 });
  } catch {
    // Ignore errors
  }
}

export function removeDaemonPidFile(pidFilePath: string): void {
  try {
    if (fs.existsSync(pidFilePath)) {
      fs.unlinkSync(pidFilePath);
    }
  } catch {
    // Ignore errors
  }
}

export interface LocalDaemonHealthProbeOptions {
  port: number;
  path: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  validateBody: (body: string) => boolean;
}

/**
 * Probe local daemon HTTP health endpoint on 127.0.0.1.
 * Uses 127.0.0.1 instead of localhost for reliable local connections.
 */
export async function probeLocalDaemonHealth(
  options: LocalDaemonHealthProbeOptions
): Promise<boolean> {
  if (!isValidDaemonPort(options.port)) {
    return false;
  }

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: options.port,
        path: options.path,
        method: 'GET',
        timeout: options.timeoutMs ?? 3000,
        headers: options.headers,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }

          try {
            resolve(options.validateBody(body));
          } catch {
            resolve(false);
          }
        });
      }
    );

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function getProcessCommandLine(pid: number): string | null {
  if (process.platform === 'linux') {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // /proc cmdline uses null separators between arguments.
        const commandLine = fs
          .readFileSync(`/proc/${pid}/cmdline`, 'utf8')
          .replace(/\0/g, ' ')
          .trim();
        if (commandLine) {
          return commandLine;
        }
      } catch {
        return null;
      }

      sleepSync(25);
    }

    return null;
  }

  if (process.platform === 'darwin') {
    try {
      const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf8',
      });
      if (result.error || result.status !== 0) {
        return null;
      }
      return result.stdout.trim();
    } catch {
      return null;
    }
  }

  if (process.platform === 'win32') {
    const command = `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object -ExpandProperty CommandLine)`;
    const shells = ['powershell.exe', 'powershell', 'pwsh.exe', 'pwsh'];
    for (const shell of shells) {
      try {
        const result = spawnSync(shell, ['-NoProfile', '-Command', command], {
          encoding: 'utf8',
        });
        if (result.error) {
          continue;
        }
        if (result.status !== 0) {
          return null;
        }
        return result.stdout.trim();
      } catch {
        // Try next shell candidate
      }
    }
    return null;
  }

  return null;
}

export function verifyProcessOwnership(
  pid: number,
  ownershipMatcher: (commandLine: string) => boolean
): DaemonOwnershipStatus {
  try {
    process.kill(pid, 0);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ESRCH') {
      return 'not-running';
    }
    return 'unknown';
  }

  const commandLine = getProcessCommandLine(pid);
  if (!commandLine) {
    return 'unknown';
  }

  return ownershipMatcher(commandLine) ? 'owned' : 'not-owned';
}

export async function waitForProcessExit(
  pid: number,
  maxAttempts = 10,
  intervalMs = 500
): Promise<boolean> {
  let attempts = 0;
  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      // Check if process still exists (kill(pid, 0) throws if not)
      process.kill(pid, 0);
      attempts++;
    } catch {
      return true;
    }
  }
  return false;
}
