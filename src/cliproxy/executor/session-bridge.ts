/**
 * Session Bridge - Integration with session tracking and proxy detection
 *
 * Handles:
 * - Session registration and unregistration
 * - Proxy detection and version checking
 * - Orphaned proxy reclamation
 * - Startup lock coordination
 */

import { ChildProcess } from 'child_process';
import { info, warn } from '../../utils/ui';
import { getInstalledCliproxyVersion } from '../binary-manager';
import { CLIProxyBackend } from '../types';
import {
  cleanupOrphanedSessions,
  registerSession,
  unregisterSession,
  stopProxy,
} from '../session-tracker';
import { detectRunningProxy, waitForProxyHealthy, reclaimOrphanedProxy } from '../proxy-detector';
import { withStartupLock } from '../startup-lock';
import { killProcessOnPort } from '../../utils/platform-commands';
import { stopQuotaMonitor } from '../quota-manager';

export interface ProxySessionResult {
  sessionId?: string;
  proxy?: ChildProcess;
  shouldSpawn: boolean;
}

/**
 * Check for existing proxy and handle version mismatch, or determine if new spawn needed
 */
export async function checkOrJoinProxy(
  port: number,
  timeout: number,
  verbose: boolean
): Promise<ProxySessionResult> {
  const log = (msg: string) => {
    if (verbose) {
      console.error(`[cliproxy] ${msg}`);
    }
  };

  // Cleanup orphaned sessions before detection
  cleanupOrphanedSessions(port);

  let sessionId: string | undefined;
  let shouldSpawn = false;

  // Use startup lock to coordinate with other CCS processes
  await withStartupLock(async () => {
    // Detect running proxy using multiple methods (HTTP, session-lock, port-process)
    let proxyStatus = await detectRunningProxy(port);
    log(`Proxy detection: ${JSON.stringify(proxyStatus)}`);

    // Check for version mismatch - restart proxy if installed version differs from running
    if (proxyStatus.running && proxyStatus.verified && proxyStatus.version) {
      const installedVersion = getInstalledCliproxyVersion();
      if (installedVersion !== proxyStatus.version) {
        console.log(
          warn(
            `Version mismatch: running v${proxyStatus.version}, installed v${installedVersion}. Restarting proxy...`
          )
        );
        log(`Stopping outdated proxy (PID: ${proxyStatus.pid ?? 'unknown'})...`);
        const stopResult = await stopProxy(port);
        if (stopResult.stopped) {
          log(`Stopped outdated proxy successfully`);
        } else {
          log(`Stop proxy result: ${stopResult.error ?? 'unknown error'}`);
        }
        // Wait for port to be released
        await new Promise((r) => setTimeout(r, 500));
        // Re-detect proxy status (should now be not running)
        proxyStatus = await detectRunningProxy(port);
        log(`Re-detection after version mismatch restart: ${JSON.stringify(proxyStatus)}`);
      }
    }

    if (proxyStatus.running && proxyStatus.verified) {
      // Healthy proxy found - join it
      if (proxyStatus.pid) {
        sessionId = reclaimOrphanedProxy(port, proxyStatus.pid, verbose) ?? undefined;
      }
      if (sessionId) {
        console.log(info(`Joined existing CLIProxy on port ${port} (${proxyStatus.method})`));
      } else {
        // Failed to register session - proxy is running but we can't track it
        console.log(info(`Using existing CLIProxy on port ${port} (session tracking unavailable)`));
        log(`PID=${proxyStatus.pid ?? 'unknown'}, session registration skipped`);
      }
      return; // Exit lock early, skip spawning
    }

    if (proxyStatus.running && !proxyStatus.verified) {
      // Proxy detected but not ready yet (another process is starting it)
      log(`Proxy starting up (detected via ${proxyStatus.method}), waiting...`);
      const becameHealthy = await waitForProxyHealthy(port, timeout);
      if (becameHealthy) {
        if (proxyStatus.pid) {
          sessionId = reclaimOrphanedProxy(port, proxyStatus.pid, verbose) ?? undefined;
        }
        console.log(info(`Joined CLIProxy after startup wait`));
        return; // Exit lock early
      }
      // Proxy didn't become healthy - kill and respawn
      if (proxyStatus.pid) {
        log(`Proxy PID ${proxyStatus.pid} not responding, killing...`);
        killProcessOnPort(port, verbose);
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (proxyStatus.blocked && proxyStatus.blocker) {
      // Port blocked by non-CLIProxy process
      // Last resort: try HTTP health check (handles Windows PID-XXXXX case)
      const isActuallyOurs = await waitForProxyHealthy(port, 1000);
      if (isActuallyOurs) {
        sessionId = reclaimOrphanedProxy(port, proxyStatus.blocker.pid, verbose) ?? undefined;
        console.log(info(`Reclaimed CLIProxy with unrecognized process name`));
        return;
      }

      // Truly blocked by another application
      const { getPortCheckCommand } = await import('../../utils/platform-commands');
      console.error('');
      console.error(
        warn(
          `Port ${port} is blocked by ${proxyStatus.blocker.processName} (PID ${proxyStatus.blocker.pid})`
        )
      );
      console.error('');
      console.error('To fix this, close the blocking application or run:');
      console.error(`  ${getPortCheckCommand(port)}`);
      console.error('');
      throw new Error(`Port ${port} is in use by another application`);
    }

    // No proxy found - need to spawn
    shouldSpawn = true;
  });

  return { sessionId, shouldSpawn };
}

/**
 * Register a new proxy session after spawning
 */
export function registerProxySession(
  port: number,
  pid: number,
  backend: CLIProxyBackend,
  verbose: boolean
): string {
  const installedVersion = getInstalledCliproxyVersion();
  const sessionId = registerSession(port, pid, installedVersion, backend);

  if (verbose) {
    console.error(
      `[cliproxy] Registered session ${sessionId} with new proxy (PID ${pid}, version ${installedVersion})`
    );
  }

  return sessionId;
}

/**
 * Setup cleanup handlers for session unregistration
 */
export function setupCleanupHandlers(
  claude: ChildProcess,
  sessionId: string | undefined,
  sessionPort: number,
  codexReasoningProxy: unknown,
  toolSanitizationProxy: unknown,
  httpsTunnel: unknown,
  verbose: boolean
): void {
  const log = (msg: string) => {
    if (verbose) {
      console.error(`[cliproxy] ${msg}`);
    }
  };

  const cleanup = () => {
    stopQuotaMonitor();
    log('Parent signal received, cleaning up');

    if (
      codexReasoningProxy &&
      typeof codexReasoningProxy === 'object' &&
      'stop' in codexReasoningProxy
    ) {
      (codexReasoningProxy as { stop: () => void }).stop();
    }

    if (
      toolSanitizationProxy &&
      typeof toolSanitizationProxy === 'object' &&
      'stop' in toolSanitizationProxy
    ) {
      (toolSanitizationProxy as { stop: () => void }).stop();
    }

    if (httpsTunnel && typeof httpsTunnel === 'object' && 'stop' in httpsTunnel) {
      (httpsTunnel as { stop: () => void }).stop();
    }

    // Unregister session, proxy keeps running (local mode only)
    if (sessionId) {
      unregisterSession(sessionId, sessionPort);
    }
    claude.kill('SIGTERM');
  };

  claude.on('exit', (code, signal) => {
    stopQuotaMonitor();
    log(`Claude exited: code=${code}, signal=${signal}`);

    if (
      codexReasoningProxy &&
      typeof codexReasoningProxy === 'object' &&
      'stop' in codexReasoningProxy
    ) {
      (codexReasoningProxy as { stop: () => void }).stop();
    }

    if (
      toolSanitizationProxy &&
      typeof toolSanitizationProxy === 'object' &&
      'stop' in toolSanitizationProxy
    ) {
      (toolSanitizationProxy as { stop: () => void }).stop();
    }

    if (httpsTunnel && typeof httpsTunnel === 'object' && 'stop' in httpsTunnel) {
      (httpsTunnel as { stop: () => void }).stop();
    }

    // Unregister this session (proxy keeps running for persistence) - only for local mode
    if (sessionId) {
      unregisterSession(sessionId, sessionPort);
      log(`Session ${sessionId} unregistered, proxy persists for other sessions or future use`);
    }

    if (signal) {
      process.kill(process.pid, signal as NodeJS.Signals);
    } else {
      process.exit(code || 0);
    }
  });

  claude.on('error', (error) => {
    stopQuotaMonitor();
    console.error(require('../../utils/ui').fail(`Claude CLI error: ${error}`));

    if (
      codexReasoningProxy &&
      typeof codexReasoningProxy === 'object' &&
      'stop' in codexReasoningProxy
    ) {
      (codexReasoningProxy as { stop: () => void }).stop();
    }

    if (
      toolSanitizationProxy &&
      typeof toolSanitizationProxy === 'object' &&
      'stop' in toolSanitizationProxy
    ) {
      (toolSanitizationProxy as { stop: () => void }).stop();
    }

    if (httpsTunnel && typeof httpsTunnel === 'object' && 'stop' in httpsTunnel) {
      (httpsTunnel as { stop: () => void }).stop();
    }

    // Unregister session, proxy keeps running (local mode only)
    if (sessionId) {
      unregisterSession(sessionId, sessionPort);
    }
    process.exit(1);
  });

  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);
}
