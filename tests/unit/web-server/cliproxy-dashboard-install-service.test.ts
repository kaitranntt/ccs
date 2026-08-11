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
    withInstallLifecycleLock: async (
      _backend: CLIProxyBackend,
      operation: () => Promise<unknown>
    ) => operation(),
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

  it('serializes concurrent dashboard stop-install-restore transactions', async () => {
    let running = true;
    let queue = Promise.resolve();
    let activeTransactions = 0;
    let maxActiveTransactions = 0;
    let restores = 0;

    const deps = {
      getProxyStatus: () => ({ running }),
      isCliproxyRunning: async () => running,
      installCliproxyVersion: async () => {
        running = false;
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
      ensureCliproxyService: async () => {
        running = true;
        restores += 1;
        return { started: true, alreadyRunning: false, port: 8317 };
      },
      withInstallLifecycleLock: <T>(
        _backend: CLIProxyBackend,
        operation: () => Promise<T>
      ): Promise<T> => {
        const result = queue.then(async () => {
          activeTransactions += 1;
          maxActiveTransactions = Math.max(maxActiveTransactions, activeTransactions);
          try {
            return await operation();
          } finally {
            activeTransactions -= 1;
          }
        });
        queue = result.then(
          () => undefined,
          () => undefined
        );
        return result;
      },
    };

    const results = await Promise.all([
      installDashboardCliproxyVersion('6.7.1', 'plus', deps),
      installDashboardCliproxyVersion('6.7.2', 'plus', deps),
    ]);

    expect(maxActiveTransactions).toBe(1);
    expect(restores).toBe(2);
    expect(results.every((result) => result.restarted)).toBe(true);
    expect(running).toBe(true);
  });
});
