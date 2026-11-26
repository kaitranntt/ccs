import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmptyUnifiedConfig } from '../../../../src/config/unified-config-types';
import { saveUnifiedConfig } from '../../../../src/config/unified-config-loader';
import { clearRecentLogEntries } from '../../../../src/services/logging/log-buffer';
import { invalidateLoggingConfigCache } from '../../../../src/services/logging/log-config';
import { getCurrentLogPath } from '../../../../src/services/logging/log-paths';
import {
  appendStructuredLogEntry,
  flushStructuredLogs,
  flushStructuredLogsSync,
} from '../../../../src/services/logging/log-storage';
import type { LogEntry } from '../../../../src/services/logging/log-types';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function createEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: overrides.id ?? 'lifecycle-entry-1',
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    level: overrides.level ?? 'info',
    source: overrides.source ?? 'unit:lifecycle',
    event: overrides.event ?? 'lifecycle.test',
    message: overrides.message ?? 'lifecycle message',
    processId: overrides.processId ?? process.pid,
    runId: overrides.runId ?? 'lifecycle-run',
    context: overrides.context ?? {},
  };
}

function enableLoggingInCurrentHome(): void {
  const config = createEmptyUnifiedConfig();
  config.logging!.enabled = true;
  config.logging!.level = 'info';
  config.logging!.redact = false;
  saveUnifiedConfig(config);
  invalidateLoggingConfigCache();
}

describe('log storage lifecycle', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-log-lifecycle-'));
    process.env.CCS_HOME = tempHome;
    clearRecentLogEntries();
    invalidateLoggingConfigCache();
  });

  afterEach(() => {
    flushStructuredLogsSync();
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    clearRecentLogEntries();
    invalidateLoggingConfigCache();
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = '';
  });

  it('flushes buffered logs synchronously when a subprocess calls process.exit(0)', () => {
    enableLoggingInCurrentHome();

    const childScript = [
      "import { createLogger } from './src/services/logging';",
      "const logger = createLogger('lifecycle:exit-subprocess');",
      "logger.info('lifecycle.exit.flush', 'flushed on immediate process.exit');",
      'process.exit(0);',
    ].join('\n');

    const result = spawnSync(process.execPath, ['-e', childScript], {
      cwd: REPO_ROOT,
      env: { ...process.env, CCS_HOME: tempHome },
      encoding: 'utf8',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);

    const currentLogPath = getCurrentLogPath();
    expect(fs.existsSync(currentLogPath)).toBe(true);
    const content = fs.readFileSync(currentLogPath, 'utf8');
    expect(content).toContain('"event":"lifecycle.exit.flush"');
    expect(content).toContain('flushed on immediate process.exit');
  });

  it('does not resurrect a deleted tempHome when async flush runs after rmSync', async () => {
    enableLoggingInCurrentHome();
    const deletedHome = tempHome;

    appendStructuredLogEntry(
      createEntry({
        id: 'deleted-home-async',
        message: 'should not recreate deleted temp home',
      })
    );

    fs.rmSync(deletedHome, { recursive: true, force: true });
    expect(fs.existsSync(deletedHome)).toBe(false);

    // Wait beyond the 10ms debounce timer and await any queued async flush.
    await new Promise((resolve) => setTimeout(resolve, 40));
    await flushStructuredLogs();

    expect(fs.existsSync(deletedHome)).toBe(false);
  });

  it('does not resurrect a deleted tempHome when flushStructuredLogsSync runs after rmSync', () => {
    enableLoggingInCurrentHome();
    const deletedHome = tempHome;

    appendStructuredLogEntry(
      createEntry({
        id: 'deleted-home-sync',
        message: 'should not recreate deleted temp home synchronously',
      })
    );

    fs.rmSync(deletedHome, { recursive: true, force: true });
    expect(fs.existsSync(deletedHome)).toBe(false);

    flushStructuredLogsSync();

    expect(fs.existsSync(deletedHome)).toBe(false);
  });
});
