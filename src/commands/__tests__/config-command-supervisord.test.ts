import { describe, expect, it } from 'bun:test';

import { handleConfigCommand } from '../config-command';

describe('handleConfigCommand Docker supervisord lifecycle', () => {
  it('does not spawn CLIProxy directly when supervisord owns the runtime', async () => {
    let ensureCalled = false;
    const logs: string[] = [];
    const originalLog = console.log;

    console.log = (message?: unknown) => {
      logs.push(String(message ?? ''));
    };

    try {
      await handleConfigCommand([], {
        getPort: (async () => 3000) as any,
        openBrowser: (async () => ({})) as never,
        startServer: async () =>
          ({
            server: { address: () => ({ address: '0.0.0.0' }) },
            wss: {},
            cleanup: () => {},
          }) as never,
        setupGracefulShutdown: () => {},
        ensureCliproxyService: async () => {
          ensureCalled = true;
          return { started: false, alreadyRunning: false, port: 8317 };
        },
        isRunningUnderSupervisord: () => true,
        getDashboardAuthConfig: () => ({ enabled: true }) as never,
        initUI: async () => {},
        header: (text: string) => text,
        ok: (text: string) => text,
        info: (text: string) => text,
        warn: (text: string) => text,
        fail: (text: string) => text,
        resolveNamedCommand: () => undefined,
        configSubcommandRoutes: [],
      });
    } finally {
      console.log = originalLog;
    }

    expect(ensureCalled).toBe(false);
    expect(logs).toContain('CLIProxy is managed by supervisord on port 8317');
  });
});
