import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

let calls: string[] = [];
let logLines: string[] = [];
let originalConsoleLog: typeof console.log;
let originalProcessExit: typeof process.exit;

beforeEach(() => {
  calls = [];
  logLines = [];
  originalConsoleLog = console.log;
  originalProcessExit = process.exit;

  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };

  mock.module('../../../src/commands/version-command', () => ({
    handleVersionCommand: async () => {
      calls.push('version');
    },
  }));

  mock.module('../../../src/commands/update-command', () => ({
    handleUpdateCommand: async (options: Record<string, unknown>) => {
      calls.push(`update:${JSON.stringify(options)}`);
    },
  }));

  mock.module('../../../src/commands/api-command', () => ({
    handleApiCommand: async (args: string[]) => {
      calls.push(`api:${args.join(' ')}`);
    },
  }));

  mock.module('../../../src/commands/docker-command', () => ({
    handleDockerCommand: async (args: string[]) => {
      calls.push(`docker:${args.join(' ')}`);
    },
  }));

  mock.module('../../../src/commands/tokens-command', () => ({
    handleTokensCommand: async () => 37,
  }));
});

afterEach(() => {
  console.log = originalConsoleLog;
  process.exit = originalProcessExit;
  mock.restore();
});

async function loadTryHandleRootCommand() {
  const mod = await import(
    `../../../src/commands/root-command-router?test=${Date.now()}-${Math.random()}`
  );
  return mod.tryHandleRootCommand;
}

describe('root-command-router', () => {
  it('routes command aliases to their handlers', async () => {
    const tryHandleRootCommand = await loadTryHandleRootCommand();

    await expect(tryHandleRootCommand(['--version'])).resolves.toBe(true);

    expect(calls).toEqual(['version']);
  });

  it('returns false for profile-like tokens that are not root commands', async () => {
    const tryHandleRootCommand = await loadTryHandleRootCommand();

    await expect(tryHandleRootCommand(['glm'])).resolves.toBe(false);

    expect(calls).toEqual([]);
  });

  it('does not capture cursor so bare cursor can fall through to profile routing', async () => {
    const tryHandleRootCommand = await loadTryHandleRootCommand();

    await expect(tryHandleRootCommand(['cursor'])).resolves.toBe(false);
    await expect(tryHandleRootCommand(['cursor', 'status'])).resolves.toBe(false);

    expect(calls).toEqual([]);
  });

  it('prints update help without invoking the updater', async () => {
    const tryHandleRootCommand = await loadTryHandleRootCommand();

    await expect(tryHandleRootCommand(['update', '--help'])).resolves.toBe(true);

    expect(calls).toEqual([]);
    expect(logLines.join('\n')).toContain('Usage: ccs update [options]');
    expect(logLines.join('\n')).toContain('ccs update --beta');
  });

  it('passes remaining args through to nested command handlers', async () => {
    const tryHandleRootCommand = await loadTryHandleRootCommand();

    await expect(tryHandleRootCommand(['api', 'discover', '--register'])).resolves.toBe(true);

    expect(calls).toEqual(['api:discover --register']);
  });

  it('routes docker commands through the root router', async () => {
    const tryHandleRootCommand = await loadTryHandleRootCommand();

    await expect(tryHandleRootCommand(['docker', 'status', '--host', 'my-box'])).resolves.toBe(
      true
    );

    expect(calls).toEqual(['docker:status --host my-box']);
  });

  it('exits with the nested command exit code when required', async () => {
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;

    const tryHandleRootCommand = await loadTryHandleRootCommand();

    await expect(tryHandleRootCommand(['tokens', 'list'])).rejects.toThrow('process.exit(37)');
  });
});
