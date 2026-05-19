import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmptyUnifiedConfig } from '../../../../src/config/unified-config-types';
import { saveUnifiedConfig } from '../../../../src/config/unified-config-loader';
import {
  clearRecentLogEntries,
  getRecentLogEntries,
} from '../../../../src/services/logging/log-buffer';
import { invalidateLoggingConfigCache } from '../../../../src/services/logging/log-config';

let originalArgv: string[] = [];
let originalCcsHome: string | undefined;
let tempHome = '';
let baselineSigintListeners: Array<(...args: unknown[]) => void> = [];
let baselineSigtermListeners: Array<(...args: unknown[]) => void> = [];
let baselineUncaughtExceptionListeners: Array<(...args: unknown[]) => void> = [];
let baselineUnhandledRejectionListeners: Array<(...args: unknown[]) => void> = [];

function removeNewListeners(
  event: 'SIGINT' | 'SIGTERM' | 'uncaughtException' | 'unhandledRejection',
  baseline: Array<(...args: unknown[]) => void>
): void {
  for (const listener of process.listeners(event)) {
    if (!baseline.includes(listener as (...args: unknown[]) => void)) {
      process.removeListener(event, listener as (...args: unknown[]) => void);
    }
  }
}

beforeEach(() => {
  originalArgv = process.argv.slice();
  originalCcsHome = process.env.CCS_HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cli-entry-log-'));
  process.env.CCS_HOME = tempHome;
  process.argv = [
    'bun',
    'src/ccs.ts',
    'launch',
    '--api-key',
    'secret-key',
    '--mode',
    'prod',
    '--secret',
    'top-secret',
  ];

  clearRecentLogEntries();
  invalidateLoggingConfigCache();
  const config = createEmptyUnifiedConfig();
  config.logging = {
    ...config.logging,
    enabled: true,
    level: 'debug',
    redact: false,
  };
  saveUnifiedConfig(config);
  invalidateLoggingConfigCache();

  baselineSigintListeners = process.listeners('SIGINT');
  baselineSigtermListeners = process.listeners('SIGTERM');
  baselineUncaughtExceptionListeners = process.listeners('uncaughtException');
  baselineUnhandledRejectionListeners = process.listeners('unhandledRejection');

  mock.module('../../../../src/utils/fetch-proxy-setup', () => ({}));
  mock.module('../../../../src/utils/error-manager', () => ({
    ErrorManager: class ErrorManager {
      static async showProfileNotFound(): Promise<void> {}
    },
  }));
  mock.module('../../../../src/utils/ui', () => ({
    fail: (message: string) => message,
  }));
  mock.module('../../../../src/errors', () => ({
    handleError: () => {},
    runCleanup: () => {},
  }));
  mock.module('../../../../src/targets', () => ({
    registerTarget: () => {},
    ClaudeAdapter: class ClaudeAdapter {},
    DroidAdapter: class DroidAdapter {},
    CodexAdapter: class CodexAdapter {},
  }));
  mock.module('../../../../src/dispatcher/cli-argument-parser', () => ({
    bootstrapAndParseEarlyCli: async () => ({
      exitNow: true,
      args: [],
      browserLaunchOverride: undefined,
    }),
  }));
  mock.module('../../../../src/dispatcher/pre-dispatch', () => ({
    runPreDispatchHandlers: async () => false,
  }));
  mock.module('../../../../src/dispatcher/profile-resolver', () => ({
    resolveProfileAndTarget: async () => {
      throw new Error('resolveProfileAndTarget should not be called in this test');
    },
  }));
  mock.module('../../../../src/dispatcher/target-executor', () => ({
    dispatchProfile: async () => {
      throw new Error('dispatchProfile should not be called in this test');
    },
  }));
});

afterEach(() => {
  mock.restore();
  process.argv = originalArgv;
  if (originalCcsHome === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = originalCcsHome;

  removeNewListeners('SIGINT', baselineSigintListeners);
  removeNewListeners('SIGTERM', baselineSigtermListeners);
  removeNewListeners('uncaughtException', baselineUncaughtExceptionListeners);
  removeNewListeners('unhandledRejection', baselineUnhandledRejectionListeners);

  fs.rmSync(tempHome, { recursive: true, force: true });
  clearRecentLogEntries();
  invalidateLoggingConfigCache();
});

async function loadCliEntryModule(): Promise<void> {
  await import(`../../../../src/ccs?test=${Date.now()}-${Math.random()}`);
  await Promise.resolve();
  await Promise.resolve();
}

describe('CLI entry log redaction', () => {
  it('redacts sensitive argv values before emitting the lifecycle start log', async () => {
    await loadCliEntryModule();

    const startEntry = getRecentLogEntries().find(
      (entry) => entry.source === 'cli:entry' && entry.event === 'cli.command.start'
    );
    const completeEntry = getRecentLogEntries().find(
      (entry) => entry.source === 'cli:entry' && entry.event === 'cli.command.complete'
    );

    expect(startEntry).toBeDefined();
    expect(startEntry?.context).toEqual({
      argv: ['launch', '--api-key', '[redacted]', '--mode', 'prod', '--secret', '[redacted]'],
    });
    expect(startEntry?.requestId).toBeTruthy();
    expect(completeEntry?.requestId).toBe(startEntry?.requestId);

    const serializedStartEntry = JSON.stringify(startEntry);
    expect(serializedStartEntry).not.toContain('secret-key');
    expect(serializedStartEntry).not.toContain('top-secret');
  });
});
