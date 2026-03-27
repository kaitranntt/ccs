import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

let calls: string[] = [];
let originalExitCode: number | undefined;

beforeEach(() => {
  calls = [];
  originalExitCode = process.exitCode;
  process.exitCode = 0;

  mock.module('../../../src/commands/docker/help-subcommand', () => ({
    showHelp: async () => {
      calls.push('help');
    },
  }));

  mock.module('../../../src/commands/docker/up-subcommand', () => ({
    handleUp: async (args: string[]) => {
      calls.push(`up:${args.join(' ')}`);
    },
  }));

  mock.module('../../../src/commands/docker/down-subcommand', () => ({
    handleDown: async (args: string[]) => {
      calls.push(`down:${args.join(' ')}`);
    },
  }));

  mock.module('../../../src/commands/docker/status-subcommand', () => ({
    handleStatus: async (args: string[]) => {
      calls.push(`status:${args.join(' ')}`);
    },
  }));

  mock.module('../../../src/commands/docker/update-subcommand', () => ({
    handleUpdate: async (args: string[]) => {
      calls.push(`update:${args.join(' ')}`);
    },
  }));

  mock.module('../../../src/commands/docker/logs-subcommand', () => ({
    handleLogs: async (args: string[]) => {
      calls.push(`logs:${args.join(' ')}`);
    },
  }));

  mock.module('../../../src/commands/docker/config-subcommand', () => ({
    handleConfig: async (args: string[]) => {
      calls.push(`config:${args.join(' ')}`);
    },
  }));
});

afterEach(() => {
  mock.restore();
  process.exitCode = originalExitCode ?? 0;
});

async function loadHandleDockerCommand() {
  const mod = await import(`../../../src/commands/docker/index?test=${Date.now()}-${Math.random()}`);
  return mod.handleDockerCommand;
}

describe('docker command', () => {
  it('shows help when invoked without a subcommand', async () => {
    const handleDockerCommand = await loadHandleDockerCommand();

    await handleDockerCommand([]);

    expect(calls).toEqual(['help']);
    expect(process.exitCode).toBe(0);
  });

  it('routes nested subcommands with remaining args intact', async () => {
    const handleDockerCommand = await loadHandleDockerCommand();

    await handleDockerCommand(['up', '--host', 'my-box', '--port', '4000']);

    expect(calls).toEqual(['up:--host my-box --port 4000']);
  });

  it('supports --host before the subcommand', async () => {
    const handleDockerCommand = await loadHandleDockerCommand();

    await handleDockerCommand(['--host', 'my-box', 'status']);

    expect(calls).toEqual(['status:--host my-box']);
  });

  it('treats help as a nested subcommand alias', async () => {
    const handleDockerCommand = await loadHandleDockerCommand();

    await handleDockerCommand(['help']);

    expect(calls).toEqual(['help']);
    expect(process.exitCode).toBe(0);
  });

  it('marks unknown subcommands as failures after printing help', async () => {
    const handleDockerCommand = await loadHandleDockerCommand();

    await handleDockerCommand(['unknown']);

    expect(calls).toEqual(['help']);
    expect(process.exitCode).toBe(1);
  });
});
