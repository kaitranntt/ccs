import { afterEach, beforeEach, mock } from 'bun:test';

export function useDockerSubcommandConsoleCapture(): {
  logLines: string[];
  errorLines: string[];
} {
  const state = {
    logLines: [] as string[],
    errorLines: [] as string[],
  };

  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    state.logLines = [];
    state.errorLines = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalExitCode = typeof process.exitCode === 'number' ? process.exitCode : undefined;
    process.exitCode = 0;

    console.log = (...args: unknown[]) => {
      state.logLines.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      state.errorLines.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exitCode = originalExitCode ?? 0;
    mock.restore();
  });

  return state;
}

export function renderCapturedLines(lines: string[]): string {
  return lines.join('\n');
}
