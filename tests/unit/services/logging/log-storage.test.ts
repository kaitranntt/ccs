import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { createEmptyUnifiedConfig } from '../../../../src/config/unified-config-types';
import { saveUnifiedConfig } from '../../../../src/config/unified-config-loader';
import { clearRecentLogEntries } from '../../../../src/services/logging/log-buffer';
import { invalidateLoggingConfigCache } from '../../../../src/services/logging/log-config';
import { getCurrentLogPath, getLogArchiveDir } from '../../../../src/services/logging/log-paths';
import {
  appendStructuredLogEntry,
  flushStructuredLogs,
  flushStructuredLogsSync,
  pruneExpiredLogArchives,
} from '../../../../src/services/logging/log-storage';
import type { LogEntry } from '../../../../src/services/logging/log-types';

function createEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: overrides.id ?? 'entry-1',
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    level: overrides.level ?? 'info',
    source: overrides.source ?? 'unit:test',
    event: overrides.event ?? 'test.event',
    message: overrides.message ?? 'message',
    processId: overrides.processId ?? 1234,
    runId: overrides.runId ?? 'run-1',
    context: overrides.context ?? {},
  };
}

describe('log storage', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-log-storage-'));
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

  it('buffers writes asynchronously and flushes via flushStructuredLogs()', async () => {
    const config = createEmptyUnifiedConfig();
    config.logging.enabled = true;
    config.logging.level = 'info';
    saveUnifiedConfig(config);
    invalidateLoggingConfigCache();

    const currentLogPath = getCurrentLogPath();
    appendStructuredLogEntry(
      createEntry({
        id: 'async-1',
        message: 'first buffered entry',
      })
    );
    appendStructuredLogEntry(
      createEntry({
        id: 'async-2',
        message: 'second buffered entry',
      })
    );

    expect(fs.existsSync(currentLogPath)).toBe(false);

    await flushStructuredLogs();

    const content = fs.readFileSync(currentLogPath, 'utf8');
    expect(content).toContain('"id":"async-1"');
    expect(content).toContain('"id":"async-2"');
  });

  it('flushes buffered entries synchronously via flushStructuredLogsSync()', () => {
    const config = createEmptyUnifiedConfig();
    config.logging.enabled = true;
    config.logging.level = 'info';
    saveUnifiedConfig(config);
    invalidateLoggingConfigCache();

    const currentLogPath = getCurrentLogPath();
    appendStructuredLogEntry(
      createEntry({
        id: 'sync-flush-1',
        message: 'entry flushed before exit',
      })
    );

    flushStructuredLogsSync();

    const content = fs.readFileSync(currentLogPath, 'utf8');
    expect(content).toContain('"id":"sync-flush-1"');
  });

  it('flushes in-flight async batches synchronously without dropping or duplicating entries', async () => {
    const config = createEmptyUnifiedConfig();
    config.logging.enabled = true;
    config.logging.level = 'info';
    saveUnifiedConfig(config);
    invalidateLoggingConfigCache();

    let releaseMkdir!: () => void;
    const mkdirBlocked = new Promise<void>((resolve) => {
      releaseMkdir = resolve;
    });
    const originalMkdir = fs.promises.mkdir.bind(fs.promises);
    const mkdirSpy = spyOn(fs.promises, 'mkdir').mockImplementation(async (target, options) => {
      await mkdirBlocked;
      return await originalMkdir(target, options);
    });

    try {
      const currentLogPath = getCurrentLogPath();
      appendStructuredLogEntry(
        createEntry({
          id: 'inflight-sync-1',
          message: 'entry captured mid-async-flush',
        })
      );

      // Move batch into inFlightBatches and pause inside fs.promises.mkdir
      const asyncFlushPromise = flushStructuredLogs();
      await Promise.resolve();

      // Simulate process.exit path calling flushStructuredLogsSync() before async flush completes
      flushStructuredLogsSync();

      const linesAfterSync = fs
        .readFileSync(currentLogPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean);
      expect(linesAfterSync).toHaveLength(1);
      expect(linesAfterSync[0]).toContain('"id":"inflight-sync-1"');

      releaseMkdir();
      await asyncFlushPromise;

      const linesAfterAsync = fs
        .readFileSync(currentLogPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean);
      expect(linesAfterAsync).toHaveLength(1);
    } finally {
      mkdirSpy.mockRestore();
    }
  });

  it('rotates the current log into the archive when the file exceeds the age threshold', async () => {
    const config = createEmptyUnifiedConfig();
    config.logging.retain_days = 7;
    config.logging.rotate_mb = 10;
    saveUnifiedConfig(config);
    invalidateLoggingConfigCache();

    const currentLogPath = getCurrentLogPath();
    fs.mkdirSync(path.dirname(currentLogPath), { recursive: true });
    fs.writeFileSync(
      currentLogPath,
      `${JSON.stringify(createEntry({ id: 'old-entry' }))}\n`,
      'utf8'
    );
    const staleTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(currentLogPath, staleTimestamp, staleTimestamp);

    appendStructuredLogEntry(
      createEntry({
        id: 'new-entry',
        message: 'new log entry after rotation',
      })
    );
    await flushStructuredLogs();

    const archiveDir = getLogArchiveDir();
    const archives = fs.readdirSync(archiveDir);
    expect(archives).toHaveLength(1);

    const archivedContent = zlib
      .gunzipSync(fs.readFileSync(path.join(archiveDir, archives[0])))
      .toString('utf8');
    expect(archivedContent).toContain('"id":"old-entry"');

    const currentContent = fs.readFileSync(currentLogPath, 'utf8');
    expect(currentContent).toContain('"id":"new-entry"');
    expect(currentContent).not.toContain('"id":"old-entry"');
  });

  it('prunes expired archives according to retention settings', () => {
    const config = createEmptyUnifiedConfig();
    config.logging.retain_days = 1;
    saveUnifiedConfig(config);
    invalidateLoggingConfigCache();

    const archiveDir = getLogArchiveDir();
    fs.mkdirSync(archiveDir, { recursive: true });

    const oldArchive = path.join(archiveDir, 'ccs-old.jsonl.gz');
    const freshArchive = path.join(archiveDir, 'ccs-fresh.jsonl.gz');
    fs.writeFileSync(oldArchive, zlib.gzipSync('old archive'), { mode: 0o600 });
    fs.writeFileSync(freshArchive, zlib.gzipSync('fresh archive'), { mode: 0o600 });

    const oldTimestamp = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const freshTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(oldArchive, oldTimestamp, oldTimestamp);
    fs.utimesSync(freshArchive, freshTimestamp, freshTimestamp);

    pruneExpiredLogArchives();

    expect(fs.existsSync(oldArchive)).toBe(false);
    expect(fs.existsSync(freshArchive)).toBe(true);
  });
});
