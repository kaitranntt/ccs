import { describe, expect, it } from 'bun:test';
import type { CLIProxyBackend } from '../../../src/cliproxy/types';
import {
  installDashboardCliproxyVersion,
  type DashboardCliproxyInstallResult,
} from '../../../src/web-server/services/cliproxy-dashboard-install-service';

function createDeps(
  overrides: {
    sessionRunning?: boolean;
    remoteRunning?: boolean;
    startResult?: { started: boolean; alreadyRunning: boolean; port: number; error?: string };
    installError?: Error;
  } = {}
) {
  const calls = {
    isCliproxyRunning: 0,
    installCliproxyVersion: 0,
    ensureCliproxyService: 0,
  };

  const deps = {
    getProxyStatus: () => ({ running: overrides.sessionRunning ?? false }),
    isCliproxyRunning: async () => {
      calls.isCliproxyRunning += 1;
      return overrides.remoteRunning ?? false;
    },
    installCliproxyVersion: async (
      _version: string,
      _verbose?: boolean,
      _backend?: CLIProxyBackend
    ) => {
      calls.installCliproxyVersion += 1;
      if (overrides.installError) throw overrides.installError;
    },
    ensureCliproxyService: async () => {
      calls.ensureCliproxyService += 1;
      return (
        overrides.startResult ?? {
          started: true,
          alreadyRunning: false,
          port: 8317,
        }
      );
    },
  };

  return { deps, calls };
}

describe('installDashboardCliproxyVersion', () => {
  it('restarts the plus proxy after install when it was already running', async () => {
    const { deps, calls } = createDeps({ sessionRunning: true });

    const result = await installDashboardCliproxyVersion('6.7.1', 'plus', deps);

    expect(result).toEqual<DashboardCliproxyInstallResult>({
      success: true,
      restarted: true,
      port: 8317,
      message: 'Successfully installed CLIProxy Plus v6.7.1 and restarted it on port 8317',
    });
    expect(calls.isCliproxyRunning).toBe(0);
    expect(calls.installCliproxyVersion).toBe(1);
    expect(calls.ensureCliproxyService).toBe(1);
  });

  it('keeps the plus proxy stopped after install when it was not running beforehand', async () => {
    const { deps, calls } = createDeps({ sessionRunning: false, remoteRunning: false });

    const result = await installDashboardCliproxyVersion('6.7.1', 'plus', deps);

    expect(result).toEqual<DashboardCliproxyInstallResult>({
      success: true,
      restarted: false,
      message: 'Successfully installed CLIProxy Plus v6.7.1',
    });
    expect(calls.isCliproxyRunning).toBe(1);
    expect(calls.installCliproxyVersion).toBe(1);
    expect(calls.ensureCliproxyService).toBe(0);
  });

  it('reports a restart failure after a successful install when the proxy had been running', async () => {
    const { deps, calls } = createDeps({
      sessionRunning: false,
      remoteRunning: true,
      startResult: {
        started: false,
        alreadyRunning: false,
        port: 8317,
        error: 'Port 8317 is blocked by another process',
      },
    });

    const result = await installDashboardCliproxyVersion('6.7.1', 'original', deps);

    expect(result).toEqual<DashboardCliproxyInstallResult>({
      success: false,
      restarted: false,
      error: 'Port 8317 is blocked by another process',
      message: 'Installed CLIProxy v6.7.1, but failed to restart it',
    });
    expect(calls.isCliproxyRunning).toBe(1);
    expect(calls.installCliproxyVersion).toBe(1);
    expect(calls.ensureCliproxyService).toBe(1);
  });

  it('uses a fallback restart error when the start result omits one', async () => {
    const { deps } = createDeps({
      remoteRunning: true,
      startResult: {
        started: false,
        alreadyRunning: false,
        port: 8317,
      },
    });

    const result = await installDashboardCliproxyVersion('6.7.1', 'plus', deps);

    expect(result).toEqual<DashboardCliproxyInstallResult>({
      success: false,
      restarted: false,
      error: 'Installed CLIProxy Plus v6.7.1, but restart failed',
      message: 'Installed CLIProxy Plus v6.7.1, but failed to restart it',
    });
  });

  it('restores a previously running proxy when installation fails', async () => {
    const { deps, calls } = createDeps({
      sessionRunning: true,
      installError: new Error('checksum mismatch'),
    });

    await expect(installDashboardCliproxyVersion('6.7.1', 'plus', deps)).rejects.toThrow(
      'checksum mismatch'
    );
    expect(calls.ensureCliproxyService).toBe(1);
  });
});
