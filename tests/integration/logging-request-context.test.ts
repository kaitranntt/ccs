import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmptyUnifiedConfig } from '../../src/config/unified-config-types';
import { saveUnifiedConfig } from '../../src/config/unified-config-loader';
import {
  clearRecentLogEntries,
  createLogger,
  getRecentLogEntries,
  invalidateLoggingConfigCache,
  withRequestContext,
} from '../../src/services/logging';

describe('logging request context (integration)', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-log-context-int-'));
    process.env.CCS_HOME = tempHome;
    clearRecentLogEntries();
    invalidateLoggingConfigCache();
    const config = createEmptyUnifiedConfig();
    config.logging = {
      ...config.logging,
      enabled: true,
      level: 'debug',
      redact: false,
    } as typeof config.logging;
    saveUnifiedConfig(config);
    invalidateLoggingConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome === undefined) delete process.env.CCS_HOME;
    else process.env.CCS_HOME = originalCcsHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
    clearRecentLogEntries();
    invalidateLoggingConfigCache();
  });

  it('correlates >=3 stage entries by requestId across nested async calls', async () => {
    const logger = createLogger('test:integration');

    await withRequestContext({ requestId: 'test-req-1' }, async () => {
      logger.stage('intake', 'request.received', 'inbound');
      await new Promise((r) => setTimeout(r, 1));
      logger.stage('dispatch', 'upstream.dispatch', 'outbound');
      await Promise.resolve();
      logger.stage('respond', 'request.respond', 'sent', undefined, { latencyMs: 5 });
    });

    const entries = getRecentLogEntries().filter((e) => e.requestId === 'test-req-1');
    expect(entries.length).toBeGreaterThanOrEqual(3);
    const stages = entries.map((e) => e.stage);
    expect(stages).toContain('intake');
    expect(stages).toContain('dispatch');
    expect(stages).toContain('respond');
    // Emit-time ordering guarantee within a single requestId.
    const timestamps = entries.map((e) => Date.parse(e.timestamp));
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });

  it('isolates parallel request contexts (no cross-contamination)', async () => {
    const logger = createLogger('test:integration');

    await Promise.all([
      withRequestContext({ requestId: 'test-req-A' }, async () => {
        logger.stage('intake', 'a.start', 'a-in');
        await new Promise((r) => setTimeout(r, 5));
        logger.stage('respond', 'a.end', 'a-out');
      }),
      withRequestContext({ requestId: 'test-req-B' }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        logger.stage('intake', 'b.start', 'b-in');
        logger.stage('respond', 'b.end', 'b-out');
      }),
    ]);

    const entries = getRecentLogEntries();
    const a = entries.filter((e) => e.requestId === 'test-req-A');
    const b = entries.filter((e) => e.requestId === 'test-req-B');
    expect(a.length).toBe(2);
    expect(b.length).toBe(2);
    // No A entry leaks into B and vice-versa
    expect(a.every((e) => e.event.startsWith('a.'))).toBe(true);
    expect(b.every((e) => e.event.startsWith('b.'))).toBe(true);
  });

  it('emits no requestId outside any context', () => {
    const logger = createLogger('test:integration');
    logger.info('plain.event', 'no-context');
    const [entry] = getRecentLogEntries();
    expect(entry.requestId).toBeUndefined();
  });
});
