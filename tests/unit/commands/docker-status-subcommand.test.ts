import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

let logLines: string[] = [];
let errorLines: string[] = [];
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;
let originalExitCode: number | undefined;

beforeEach(() => {
  logLines = [];
  errorLines = [];
  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  originalExitCode = process.exitCode;
  process.exitCode = 0;

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
  process.exitCode = originalExitCode ?? 0;
  mock.restore();
});

async function loadHandleStatus() {
  const mod = await import(
    `../../../src/commands/docker/status-subcommand?test=${Date.now()}-${Math.random()}`
  );
  return mod.handleStatus;
}

describe('docker status subcommand', () => {
  it('prints supervisor failure details instead of masking them as a missing container', async () => {
    mock.module('../../../src/docker', () => ({
      DockerExecutor: class {
        async status() {
          return {
            compose: {
              command: '',
              exitCode: 0,
              stdout: 'NAME                STATUS',
              stderr: '',
              remote: false,
            },
            supervisor: {
              command: '',
              exitCode: 7,
              stdout: '',
              stderr: 'unix:///var/run/supervisor.sock no such file',
              remote: false,
            },
          };
        }
      },
    }));

    const handleStatus = await loadHandleStatus();
    await handleStatus([]);

    const rendered = logLines.join('\n');
    expect(rendered).toContain('Docker status');
    expect(rendered).toContain('Supervisor status check failed');
    expect(rendered).toContain('supervisor.sock no such file');
    expect(rendered).not.toContain('may not be running');
    expect(errorLines).toEqual([]);
    expect(process.exitCode).toBe(0);
  });
});
