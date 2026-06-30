/**
 * CLIProxy Lifecycle Management
 *
 * Handles:
 * - ccs cliproxy start
 * - ccs cliproxy restart
 * - ccs cliproxy status
 * - ccs cliproxy stop
 */

import { initUI, header, color, dim, ok, warn, info } from '../../utils/ui';
import { getProxyStatus, startProxy, stopProxy } from '../../cliproxy/services';
import { detectRunningProxy } from '../../cliproxy/proxy/proxy-detector';
import { resolveLifecyclePort } from '../../cliproxy/config/port-manager';
import { getEffectiveManagementSecret } from '../../cliproxy/auth/auth-token-manager';

/**
 * Print how to reach the local CLIProxy Control Panel (a.k.a. API Management
 * Center) and the key needed to log in.
 *
 * The panel is served by CLIProxy at `/management.html` on the proxy port and
 * its login is gated by the management secret (default `ccs`). The login screen
 * only asks for a "Management Key" with no hint, so users frequently cannot get
 * in. Surfacing the URL + resolved key here removes that guesswork.
 */
export function printControlPanelAccess(port: number): void {
  const secret = getEffectiveManagementSecret();
  console.log('');
  console.log(`  Control Panel:    http://127.0.0.1:${port}/management.html`);
  console.log(`  Panel login key:  ${secret}`);
}

export async function handleStart(verbose = false): Promise<void> {
  await initUI();
  console.log(header('Start CLIProxy'));
  console.log('');

  const port = resolveLifecyclePort();
  const result = await startProxy(port, verbose);
  if (result.started) {
    if (result.alreadyRunning) {
      console.log(info(`CLIProxy already running on port ${result.port}`));
      if (result.configRegenerated) {
        console.log(warn('Config updated - restart CLIProxy to apply changes'));
      }
    } else {
      console.log(ok(`CLIProxy started on port ${result.port}`));
    }
    console.log(dim('To stop: ccs cliproxy stop'));
    if (result.port) {
      printControlPanelAccess(result.port);
    }
  } else {
    console.log(warn(result.error || 'Failed to start CLIProxy'));
  }
  console.log('');
}

export async function handleRestart(verbose = false): Promise<void> {
  await initUI();
  console.log(header('Restart CLIProxy'));
  console.log('');

  const port = resolveLifecyclePort();
  const stopResult = await stopProxy(port);
  if (stopResult.stopped) {
    console.log(ok(`CLIProxy stopped (PID ${stopResult.pid})`));
  } else if (stopResult.error === 'No active CLIProxy session found') {
    console.log(info('No active CLIProxy session found, starting a new instance'));
  } else {
    console.log(warn(stopResult.error || 'Failed to stop existing CLIProxy'));
    console.log(info('Attempting to start a fresh instance...'));
  }

  const startResult = await startProxy(port, verbose);
  if (startResult.started) {
    if (startResult.alreadyRunning) {
      console.log(info(`CLIProxy already running on port ${startResult.port}`));
    } else {
      console.log(ok(`CLIProxy started on port ${startResult.port}`));
    }
  } else {
    console.log(warn(startResult.error || 'Failed to restart CLIProxy'));
  }

  console.log('');
}

export async function handleProxyStatus(verbose = false): Promise<void> {
  await initUI();
  console.log(header('CLIProxy Status'));
  console.log('');

  const port = resolveLifecyclePort();
  const status = getProxyStatus(port);
  if (status.running) {
    console.log(`  Status:     ${color('Running', 'success')}`);
    console.log(`  PID:        ${status.pid}`);
    console.log(`  Port:       ${status.port}`);
    console.log(`  Sessions:   ${status.sessionCount || 0} active`);
    if (status.startedAt) {
      console.log(`  Started:    ${new Date(status.startedAt).toLocaleString()}`);
      if (verbose) {
        const uptimeMs = Date.now() - new Date(status.startedAt).getTime();
        const uptimeSec = Math.floor(uptimeMs / 1000);
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;
        const uptimeStr = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
        console.log(`  Uptime:     ${uptimeStr}`);
      }
    }

    console.log('');
    console.log(dim('To stop: ccs cliproxy stop'));
    printControlPanelAccess(status.port ?? port);
  } else {
    // Fallback: detect untracked/orphaned proxy process (e.g. detached session without lock file).
    const detected = await detectRunningProxy(port);
    if (detected.running && detected.verified) {
      console.log(`  Status:     ${color('Running', 'success')}`);
      console.log(`  PID:        ${detected.pid ?? 'unknown'}`);
      console.log(`  Port:       ${port}`);
      console.log(`  Sessions:   ${detected.sessionCount || 0} active`);
      if (!detected.sessionCount) {
        console.log(dim('  Note: Detected running proxy without local session lock'));
      }
      if (verbose) {
        console.log(dim('  Note: Process detected via port scan; no local lock file present'));
      }
      console.log('');
      console.log(dim('To stop: ccs cliproxy stop'));
      printControlPanelAccess(port);
    } else {
      console.log(`  Status:     ${color('Not running', 'warning')}`);
      console.log('');
      console.log(dim('CLIProxy starts automatically when you run ccs gemini, codex, etc.'));
    }
  }
  console.log('');
}

export async function handleStop(): Promise<void> {
  await initUI();
  console.log(header('Stop CLIProxy'));
  console.log('');

  const port = resolveLifecyclePort();
  const result = await stopProxy(port);
  if (result.stopped) {
    console.log(ok(`CLIProxy stopped (PID ${result.pid})`));
    if (result.sessionCount && result.sessionCount > 0) {
      console.log(info(`${result.sessionCount} active session(s) were disconnected`));
    }
  } else {
    console.log(warn(result.error || 'Failed to stop CLIProxy'));
  }
  console.log('');
}
