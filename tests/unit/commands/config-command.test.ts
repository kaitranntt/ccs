import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as os from 'os';
import { handleConfigCommand } from '../../../src/commands/config-command';
import { resolveNamedCommand } from '../../../src/commands/named-command-router';

const startServerCalls: Array<Record<string, unknown>> = [];
const configAuthCalls: string[][] = [];
const configChannelsCalls: string[][] = [];
let logLines: string[] = [];
let errorLines: string[] = [];
let dashboardAuthEnabled = false;
let startServerError: Error | null = null;
let mockServerBindHost = '::1';
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;
let originalProcessExit: typeof process.exit;

type ConfigCommandDeps = NonNullable<Parameters<typeof handleConfigCommand>[1]>;

function createTestDeps(): ConfigCommandDeps {
  return {
    getPort: async () => 3000,
    openBrowser: async () => undefined,
    startServer: async (options) => {
      startServerCalls.push({ ...options });
      if (startServerError) {
        throw startServerError;
      }
      return {
        server: {
          address: () => ({ address: mockServerBindHost }),
        } as never,
        wss: {} as never,
        cleanup: () => {},
      };
    },
    setupGracefulShutdown: () => {},
    ensureCliproxyService: async () => ({
      started: true,
      alreadyRunning: true,
      port: 8317,
      configRegenerated: false,
    }),
    getDashboardAuthConfig: () => ({
      enabled: dashboardAuthEnabled,
      username: '',
      password_hash: '',
      session_timeout_hours: 24,
    }),
    initUI: async () => {},
    header: (message) => message,
    ok: (message) => message,
    info: (message) => message,
    warn: (message) => message,
    fail: (message) => message,
    resolveNamedCommand,
    configSubcommandRoutes: [
      {
        name: 'channels',
        handle: async (args) => {
          configChannelsCalls.push([...args]);
        },
      },
      {
        name: 'auth',
        handle: async (args) => {
          configAuthCalls.push([...args]);
        },
      },
    ],
  };
}

beforeEach(() => {
  startServerCalls.length = 0;
  configAuthCalls.length = 0;
  configChannelsCalls.length = 0;
  logLines = [];
  errorLines = [];
  dashboardAuthEnabled = false;
  startServerError = null;
  mockServerBindHost = '::1';

  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  originalProcessExit = process.exit;

  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errorLines.push(args.map(String).join(' '));
  };
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  process.exit = originalProcessExit;
});

describe('config command dashboard startup', () => {
  it('shows help for literal help token instead of starting the dashboard', async () => {
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;

    await expect(handleConfigCommand(['help'], createTestDeps())).rejects.toThrow(
      'process.exit(0)'
    );

    expect(startServerCalls).toHaveLength(0);
    expect(logLines.join('\n')).toContain('Usage: ccs config [command] [options]');
  });

  it('routes auth subcommands before dashboard startup', async () => {
    await handleConfigCommand(['auth', 'setup'], createTestDeps());

    expect(configAuthCalls).toEqual([['setup']]);
    expect(startServerCalls).toHaveLength(0);
  });

  it('routes channels subcommands before dashboard startup', async () => {
    await handleConfigCommand(['channels', '--enable'], createTestDeps());

    expect(configChannelsCalls).toEqual([['--enable']]);
    expect(startServerCalls).toHaveLength(0);
  });

  it('rejects unknown config subcommands before dashboard startup', async () => {
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;

    await expect(handleConfigCommand(['bogus'], createTestDeps())).rejects.toThrow(
      'process.exit(1)'
    );

    expect(startServerCalls).toHaveLength(0);
    expect(errorLines.join('\n')).toContain('Unexpected arguments: bogus');
  });

  it('binds the default startup path to localhost only', async () => {
    await handleConfigCommand([], createTestDeps());

    expect(startServerCalls).toHaveLength(1);
    expect(startServerCalls[0]).toEqual({ port: 3000, dev: false, host: 'localhost' });

    const rendered = logLines.join('\n');
    expect(rendered).toContain('Dashboard: http://[::1]:3000');
    expect(rendered).not.toContain('Dashboard may be reachable from other devices');
    expect(rendered).not.toContain('Protect it before sharing: ccs config auth setup');
    expect(errorLines).toHaveLength(0);
  });

  it('passes explicit wildcard hosts through and prints exposure guidance', async () => {
    mockServerBindHost = '0.0.0.0';

    await handleConfigCommand(['--host', '0.0.0.0', '--port', '4100'], createTestDeps());

    expect(startServerCalls).toHaveLength(1);
    expect(startServerCalls[0]).toEqual({ port: 4100, dev: false, host: '0.0.0.0' });

    const rendered = logLines.join('\n');
    expect(rendered).toContain('Dashboard: http://localhost:4100');
    expect(rendered).toContain('Bind host: 0.0.0.0');
    expect(rendered).toContain(
      'Dashboard may be reachable from other devices that can connect to this machine.'
    );
    expect(rendered).toContain('Protect it before sharing: ccs config auth setup');
    expect(errorLines).toHaveLength(0);
  });

  it('still opens the dashboard when CLIProxy is unavailable', async () => {
    await handleConfigCommand([], {
      ...createTestDeps(),
      ensureCliproxyService: async () => ({
        started: false,
        alreadyRunning: false,
        port: 8317,
        error:
          'Failed to prepare binary: CLIProxy Plus binary is not installed locally. Run "ccs cliproxy install" when you have network access.',
      }),
    });

    expect(startServerCalls).toHaveLength(1);
    const rendered = logLines.join('\n');
    expect(rendered).toContain(
      'CLIProxy not available: Failed to prepare binary: CLIProxy Plus binary is not installed locally. Run "ccs cliproxy install" when you have network access.'
    );
    expect(rendered).toContain('Dashboard will work but Control Panel/Stats may be limited');
  });

  it('still opens the dashboard when wildcard network detection is unavailable', async () => {
    const networkInterfacesSpy = spyOn(os, 'networkInterfaces').mockImplementation(() => {
      throw new Error('uv_interface_addresses returned Unknown system error 13');
    });

    try {
      await handleConfigCommand([], createTestDeps());

      expect(startServerCalls).toHaveLength(1);

      const rendered = logLines.join('\n');
      expect(rendered).toContain('Dashboard: http://[::1]:3000');
      expect(rendered).not.toContain('Bind host:');
      expect(errorLines).toHaveLength(0);
    } finally {
      networkInterfacesSpy.mockRestore();
    }
  });

  it('fails cleanly when the server cannot bind the requested host', async () => {
    startServerError = new Error(
      'Unable to bind 192.0.2.123:4100; the address may be unavailable or the port may already be in use'
    );
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;

    await expect(
      handleConfigCommand(['--host', '192.0.2.123', '--port', '4100'], createTestDeps())
    ).rejects.toThrow('process.exit(1)');

    expect(errorLines.join('\n')).toContain(
      'Failed to start server: Unable to bind 192.0.2.123:4100; the address may be unavailable or the port may already be in use'
    );
  });
});
