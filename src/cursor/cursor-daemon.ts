/**
 * Cursor Daemon Manager
 *
 * Manages the cursor daemon lifecycle (start/stop/status).
 * Uses CursorExecutor for OpenAI-compatible API proxy to Cursor backend.
 */

import { spawn, ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import type { CursorDaemonConfig, CursorDaemonStatus } from './types';
import { getPidFromFile, writePidToFile, removePidFile } from './cursor-daemon-pid';
import { verifyDaemonOwnership } from './daemon-process-ownership';
import { createLogger } from '../services/logging';
export { getPidFromFile, writePidToFile, removePidFile } from './cursor-daemon-pid';

const logger = createLogger('cursor:daemon');

/**
 * Resolve daemon entrypoint candidates for current runtime.
 * - Dist runtime always uses JS artifact.
 * - Bun source runtime prefers TS, then falls back to JS.
 */
function getDaemonEntrypointCandidates(): string[] {
  const jsEntry = path.join(__dirname, 'cursor-daemon-entry.js');
  const tsEntry = path.join(__dirname, 'cursor-daemon-entry.ts');
  const isBunRuntime = process.execPath.toLowerCase().includes('bun');
  const runningFromDist = __filename.endsWith('.js');

  if (runningFromDist) {
    return [jsEntry];
  }

  if (isBunRuntime) {
    return [tsEntry, jsEntry];
  }

  return [jsEntry];
}

async function resolveDaemonEntrypoint(): Promise<string | null> {
  for (const candidate of getDaemonEntrypointCandidates()) {
    try {
      await fs.promises.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // Try next candidate
    }
  }

  return null;
}

/**
 * Check if cursor daemon is running on the specified port.
 * Uses 127.0.0.1 instead of localhost for more reliable local connections.
 */
export async function isDaemonRunning(port: number, daemonToken?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET',
        timeout: 3000,
        headers: daemonToken ? { 'x-ccs-cursor-token': daemonToken } : undefined,
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
            const payload = JSON.parse(body) as { service?: string };
            resolve(payload.service === 'cursor-daemon');
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

/**
 * Get daemon status.
 */
export async function getDaemonStatus(port: number): Promise<CursorDaemonStatus> {
  const running = await isDaemonRunning(port);
  const pid = getPidFromFile();

  return {
    running,
    port,
    pid: running ? (pid ?? undefined) : undefined,
  };
}

/**
 * Start the cursor daemon.
 *
 * @param config Cursor configuration
 * @returns Promise that resolves when daemon is ready
 */
export async function startDaemon(
  config: CursorDaemonConfig
): Promise<{ success: boolean; pid?: number; error?: string; daemonToken?: string }> {
  // Auto-generate daemon token if not provided so /health and protected routes
  // can be probed by the caller during startup polling.
  const daemonToken =
    config.daemon_token && config.daemon_token.trim()
      ? config.daemon_token
      : randomBytes(32).toString('hex');
  const effectiveConfig: CursorDaemonConfig = { ...config, daemon_token: daemonToken };

  // Check if already running
  if (await isDaemonRunning(effectiveConfig.port, effectiveConfig.daemon_token)) {
    logger.stage('dispatch', 'cursor.daemon.already_running', 'Cursor daemon already running', {
      provider: 'cursor',
      port: config.port,
    });
    return {
      success: true,
      pid: getPidFromFile() ?? undefined,
      daemonToken: effectiveConfig.daemon_token,
    };
  }

  // Validate port before interpolation (prevents injection)
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    return { success: false, error: `Invalid port: ${config.port}` };
  }

  const daemonEntry = await resolveDaemonEntrypoint();
  if (!daemonEntry) {
    return {
      success: false,
      error: 'Cursor daemon entrypoint not found. Run `bun run build` and retry.',
    };
  }

  const startedAt = Date.now();
  logger.stage('dispatch', 'cursor.daemon.spawn', 'Spawning Cursor daemon', {
    provider: 'cursor',
    port: config.port,
    ghostMode: config.ghost_mode !== false,
  });

  return new Promise((resolve) => {
    let proc: ChildProcess;
    let resolved = false;

    const safeResolve = (result: {
      success: boolean;
      pid?: number;
      error?: string;
      daemonToken?: string;
    }) => {
      if (resolved) return;
      resolved = true;
      if (checkTimeout) clearTimeout(checkTimeout);
      if (!result.success) {
        removePidFile();
        logger.stage(
          'cleanup',
          'cursor.daemon.start_failed',
          'Cursor daemon failed to start',
          { provider: 'cursor', port: config.port },
          {
            level: 'error',
            latencyMs: Date.now() - startedAt,
            error: result.error
              ? { name: 'CursorDaemonStartError', message: result.error }
              : undefined,
          }
        );
      } else {
        logger.stage(
          'upstream',
          'cursor.daemon.ready',
          'Cursor daemon is ready',
          { provider: 'cursor', port: config.port, pid: result.pid },
          { latencyMs: Date.now() - startedAt }
        );
      }
      resolve(result);
    };

    let checkTimeout: NodeJS.Timeout | null = null;

    try {
      const args = [
        daemonEntry,
        '--port',
        String(config.port),
        '--ghost-mode',
        String(config.ghost_mode !== false),
        '--ccs-daemon',
      ];

      proc = spawn(process.execPath, args, {
        stdio: 'ignore',
        detached: true,
        env: {
          ...process.env,
          CCS_CURSOR_DAEMON_TOKEN: effectiveConfig.daemon_token || '',
        },
      });

      // Unref so parent can exit
      proc.unref();

      if (proc.pid) {
        writePidToFile(proc.pid);
      }

      // Wait for daemon to be ready (poll for up to 30 seconds)
      let attempts = 0;
      const maxAttempts = 30;
      const pollHealth = async () => {
        attempts++;

        if (await isDaemonRunning(effectiveConfig.port, effectiveConfig.daemon_token)) {
          safeResolve({ success: true, pid: proc.pid, daemonToken: effectiveConfig.daemon_token });
        } else if (attempts >= maxAttempts) {
          // Kill orphaned process
          if (proc.pid) {
            try {
              process.kill(proc.pid, 'SIGTERM');
            } catch {
              /* already dead */
            }
          }
          safeResolve({
            success: false,
            error: 'Daemon did not start within 30 seconds',
          });
        } else {
          checkTimeout = setTimeout(pollHealth, 1000);
        }
      };
      checkTimeout = setTimeout(pollHealth, 1000);

      proc.on('error', (err) => {
        safeResolve({
          success: false,
          error: `Failed to start daemon: ${err.message}`,
        });
      });

      proc.on('exit', (code, signal) => {
        if (code === null) {
          safeResolve({
            success: false,
            error: `Daemon process was killed by signal ${signal}`,
          });
        } else if (code === 0) {
          safeResolve({
            success: false,
            error: 'Daemon process exited unexpectedly with code 0',
          });
        } else {
          safeResolve({
            success: false,
            error: `Daemon process exited with code ${code}`,
          });
        }
      });
    } catch (err) {
      safeResolve({
        success: false,
        error: `Failed to spawn daemon: ${(err as Error).message}`,
      });
    }
  });
}

/**
 * Stop the cursor daemon.
 */
export async function stopDaemon(): Promise<{ success: boolean; error?: string }> {
  const pid = getPidFromFile();

  if (!pid) {
    // No PID file — daemon is not running or was already stopped
    return { success: true };
  }

  try {
    const ownership = verifyDaemonOwnership(pid);
    if (ownership === 'not-running') {
      removePidFile();
      return { success: true };
    }

    if (ownership === 'not-owned') {
      // PID was reused by an unrelated process.
      removePidFile();
      return { success: true };
    }

    if (ownership === 'unknown') {
      return {
        success: false,
        error: `Refusing to stop PID ${pid}: unable to verify daemon ownership`,
      };
    }

    // Send SIGTERM to the process
    logger.stage('cleanup', 'cursor.daemon.stop', 'Sending SIGTERM to Cursor daemon', {
      provider: 'cursor',
      pid,
    });
    process.kill(pid, 'SIGTERM');

    // Wait for process to exit (up to 5 seconds)
    let attempts = 0;
    while (attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        // Check if process still exists (kill(pid, 0) throws if not)
        process.kill(pid, 0);
        attempts++;
      } catch {
        // Process no longer exists
        break;
      }
    }

    // Escalate to SIGKILL only if SIGTERM wait loop exhausted
    if (attempts >= 10) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already dead — good
      }
    }

    removePidFile();
    return { success: true };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ESRCH') {
      // Process doesn't exist
      removePidFile();
      return { success: true };
    }
    return {
      success: false,
      error: `Failed to stop daemon: ${error.message}`,
    };
  }
}
