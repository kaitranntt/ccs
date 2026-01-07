/**
 * CLIProxy Service Manager
 *
 * Manages CLIProxyAPI as a background service for the CCS dashboard.
 * Ensures the proxy is running when needed for:
 * - Control Panel integration (management.html)
 * - Stats fetching
 * - OAuth flows
 *
 * Unlike cliproxy-executor.ts which runs proxy per-session,
 * this module manages a persistent background instance.
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import { ensureCLIProxyBinary } from './binary-manager';
import {
  generateConfig,
  regenerateConfig,
  configNeedsRegeneration,
  CLIPROXY_DEFAULT_PORT,
  getCliproxyWritablePath,
} from './config-generator';
import { registerSession } from './session-tracker';
import { detectRunningProxy, waitForProxyHealthy } from './proxy-detector';
import { withStartupLock } from './startup-lock';
import { isCliproxyRunning } from './stats-fetcher';
import { TokenRefreshWorker, type RefreshResult } from './auth/token-refresh-worker';
import { getTokenRefreshConfig } from './auth/token-refresh-config';

/** Background proxy process reference */
let proxyProcess: ChildProcess | null = null;

/** Token refresh worker instance */
let tokenRefreshWorker: TokenRefreshWorker | null = null;

/** Cleanup registered flag */
let cleanupRegistered = false;

/**
 * Wait for TCP port to become available
 */
async function waitForPort(
  port: number,
  timeout: number = 5000,
  pollInterval: number = 100
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
          socket.destroy();
          resolve();
        });

        socket.on('error', (err) => {
          socket.destroy();
          reject(err);
        });

        socket.setTimeout(500, () => {
          socket.destroy();
          reject(new Error('Connection timeout'));
        });
      });

      return true; // Connection successful
    } catch {
      await new Promise((r) => setTimeout(r, pollInterval));
    }
  }

  return false;
}

/**
 * Register cleanup handlers to stop proxy on process exit
 */
function registerCleanup(): void {
  if (cleanupRegistered) return;

  const cleanup = () => {
    // Stop token refresh worker first
    if (tokenRefreshWorker && tokenRefreshWorker.isActive()) {
      tokenRefreshWorker.stop();
      tokenRefreshWorker = null;
    }
    // Then stop proxy process
    if (proxyProcess && !proxyProcess.killed) {
      proxyProcess.kill('SIGTERM');
      proxyProcess = null;
    }
  };

  process.once('exit', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);

  cleanupRegistered = true;
}

/**
 * Start token refresh worker if configured
 * @param verbose Enable verbose logging
 */
function startTokenRefreshWorker(verbose: boolean): void {
  // Skip if already running
  if (tokenRefreshWorker && tokenRefreshWorker.isActive()) {
    return;
  }

  // Load config
  const config = getTokenRefreshConfig();
  if (!config) {
    // Not configured or disabled
    return;
  }

  // Create and start worker
  tokenRefreshWorker = new TokenRefreshWorker({
    refreshInterval: config.interval_minutes ?? 30,
    preemptiveTime: config.preemptive_minutes ?? 45,
    maxRetries: config.max_retries ?? 3,
    verbose: config.verbose || verbose,
  });

  tokenRefreshWorker.start();

  if (verbose) {
    console.error('[i] Token refresh worker started');
  }
}

export interface ServiceStartResult {
  started: boolean;
  alreadyRunning: boolean;
  port: number;
  configRegenerated?: boolean;
  error?: string;
}

/**
 * Ensure CLIProxy service is running
 *
 * If proxy is already running, returns immediately.
 * If not, spawns a new background instance.
 *
 * @param port CLIProxy port (default: 8317)
 * @param verbose Show debug output
 * @returns Result indicating success and whether it was already running
 */
export async function ensureCliproxyService(
  port: number = CLIPROXY_DEFAULT_PORT,
  verbose: boolean = false
): Promise<ServiceStartResult> {
  const log = (msg: string) => {
    if (verbose) {
      console.error(`[cliproxy-service] ${msg}`);
    }
  };

  // Check if config needs update (even if running)
  let configRegenerated = false;
  if (configNeedsRegeneration()) {
    log('Config outdated, regenerating...');
    regenerateConfig(port);
    configRegenerated = true;
  }

  // Use startup lock to coordinate with other CCS processes (ccs agy, ccs config, etc.)
  return await withStartupLock(async () => {
    // Use unified detection (HTTP check + session-lock + port-process)
    log(`Checking if CLIProxy is running on port ${port}...`);
    const proxyStatus = await detectRunningProxy(port);
    log(`Proxy detection: ${JSON.stringify(proxyStatus)}`);

    if (proxyStatus.running && proxyStatus.verified) {
      // Already running and healthy
      log('CLIProxy already running');
      if (configRegenerated) {
        log('Config was updated - running instance will use new config on next restart');
      }
      return { started: true, alreadyRunning: true, port, configRegenerated };
    }

    if (proxyStatus.running && !proxyStatus.verified) {
      // Proxy detected but not ready yet (another process is starting it)
      log(`Proxy starting up (detected via ${proxyStatus.method}), waiting...`);
      const becameHealthy = await waitForProxyHealthy(port, 5000);
      if (becameHealthy) {
        log('Proxy became healthy');
        return { started: true, alreadyRunning: true, port, configRegenerated };
      }
      // Proxy didn't become healthy - will try to start fresh below
      log('Proxy detected but not responding, will start fresh');
    }

    if (proxyStatus.blocked) {
      // Port blocked by non-CLIProxy process - try HTTP as last resort
      const isActuallyOurs = await waitForProxyHealthy(port, 1000);
      if (isActuallyOurs) {
        log('Reclaimed CLIProxy with unrecognized process name');
        return { started: true, alreadyRunning: true, port, configRegenerated };
      }
      // Truly blocked
      return {
        started: false,
        alreadyRunning: false,
        port,
        error: `Port ${port} is blocked by ${proxyStatus.blocker?.processName}`,
      };
    }

    // Need to start new instance
    log('CLIProxy not running, starting background instance...');

    // 1. Ensure binary exists
    let binaryPath: string;
    try {
      binaryPath = await ensureCLIProxyBinary(verbose);
      log(`Binary ready: ${binaryPath}`);
    } catch (error) {
      const err = error as Error;
      return {
        started: false,
        alreadyRunning: false,
        port,
        error: `Failed to prepare binary: ${err.message}`,
      };
    }

    // 2. Ensure/regenerate config if needed
    let configPath: string;
    if (configNeedsRegeneration()) {
      log('Config needs regeneration, updating...');
      configPath = regenerateConfig(port);
    } else {
      configPath = generateConfig('gemini', port);
    }
    log(`Config ready: ${configPath}`);

    // 3. Spawn background process
    const proxyArgs = ['--config', configPath];
    log(`Spawning: ${binaryPath} ${proxyArgs.join(' ')}`);

    proxyProcess = spawn(binaryPath, proxyArgs, {
      stdio: ['ignore', verbose ? 'pipe' : 'ignore', verbose ? 'pipe' : 'ignore'],
      detached: true,
      env: {
        ...process.env,
        WRITABLE_PATH: getCliproxyWritablePath(),
      },
    });

    if (verbose) {
      proxyProcess.stdout?.on('data', (data: Buffer) => {
        process.stderr.write(`[cliproxy] ${data.toString()}`);
      });
      proxyProcess.stderr?.on('data', (data: Buffer) => {
        process.stderr.write(`[cliproxy-err] ${data.toString()}`);
      });
    }

    proxyProcess.unref();

    proxyProcess.on('error', (error) => {
      log(`Spawn error: ${error.message}`);
    });

    registerCleanup();

    // 4. Wait for proxy to be ready
    log(`Waiting for CLIProxy on port ${port}...`);
    const ready = await waitForPort(port, 5000);

    if (!ready) {
      if (proxyProcess && !proxyProcess.killed) {
        proxyProcess.kill('SIGTERM');
        proxyProcess = null;
      }

      return {
        started: false,
        alreadyRunning: false,
        port,
        error: `CLIProxy Plus failed to start within 5s on port ${port}`,
      };
    }

    log(`CLIProxy service started on port ${port}`);

    // 5. Register session
    if (proxyProcess.pid) {
      registerSession(port, proxyProcess.pid);
      log(`Session registered for PID ${proxyProcess.pid}`);
    }

    // 6. Start token refresh worker if configured
    startTokenRefreshWorker(verbose);

    return { started: true, alreadyRunning: false, port };
  });
}

/**
 * Stop the managed CLIProxy service
 */
export function stopCliproxyService(): boolean {
  // Stop token refresh worker first
  if (tokenRefreshWorker && tokenRefreshWorker.isActive()) {
    tokenRefreshWorker.stop();
    tokenRefreshWorker = null;
  }

  // Then stop proxy process
  if (proxyProcess && !proxyProcess.killed) {
    proxyProcess.kill('SIGTERM');
    proxyProcess = null;
    return true;
  }
  return false;
}

/**
 * Get service status
 */
export async function getServiceStatus(port: number = CLIPROXY_DEFAULT_PORT): Promise<{
  running: boolean;
  managedByUs: boolean;
  port: number;
}> {
  const running = await isCliproxyRunning(port);
  const managedByUs = proxyProcess !== null && !proxyProcess.killed;

  return { running, managedByUs, port };
}

/**
 * Check if token refresh worker is running
 */
export function isTokenRefreshWorkerRunning(): boolean {
  return tokenRefreshWorker !== null && tokenRefreshWorker.isActive();
}

/**
 * Get token refresh worker status
 */
export function getTokenRefreshStatus(): {
  running: boolean;
  lastResults: RefreshResult[] | null;
} {
  if (!tokenRefreshWorker) {
    return { running: false, lastResults: null };
  }

  return {
    running: tokenRefreshWorker.isActive(),
    lastResults: tokenRefreshWorker.getLastRefreshResults(),
  };
}
