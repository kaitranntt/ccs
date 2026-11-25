import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
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
import { withRequestContext } from '../../../../src/services/logging/log-context';
import { createLogger } from '../../../../src/services/logging/logger';

describe('Logger.stage()', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-logger-stages-'));
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

  it('emits a stage-tagged entry with default info level', () => {
    const logger = createLogger('unit:stages');
    logger.stage('upstream', 'fetch.start', 'starting upstream fetch');
    const entries = getRecentLogEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].stage).toBe('upstream');
    expect(entries[0].level).toBe('info');
    expect(entries[0].event).toBe('fetch.start');
  });

  it('respects a level override and includes latencyMs + error', () => {
    const logger = createLogger('unit:stages');
    logger.stage('cleanup', 'request.failed', 'upstream failed', undefined, {
      level: 'error',
      latencyMs: 123,
      error: { name: 'Error', message: 'boom' },
    });
    const [entry] = getRecentLogEntries();
    expect(entry.level).toBe('error');
    expect(entry.latencyMs).toBe(123);
    expect(entry.error?.message).toBe('boom');
  });

  it('auto-merges requestId from active ALS context', () => {
    const logger = createLogger('unit:stages');
    withRequestContext({ requestId: 'req-9' }, () => {
      logger.stage('intake', 'http.request', 'in');
    });
    const [entry] = getRecentLogEntries();
    expect(entry.requestId).toBe('req-9');
    expect(entry.stage).toBe('intake');
  });

  it('emits no requestId when called outside ALS', () => {
    const logger = createLogger('unit:stages');
    logger.info('plain.event', 'msg');
    const [entry] = getRecentLogEntries();
    expect(entry.requestId).toBeUndefined();
    expect(entry.stage).toBeUndefined();
  });

  it('preserves existing logger.info/warn/error/debug methods', () => {
    const logger = createLogger('unit:stages');
    logger.info('e1', 'm1');
    logger.warn('e2', 'm2');
    logger.error('e3', 'm3');
    logger.debug('e4', 'm4');
    const entries = getRecentLogEntries();
    expect(entries.map((e) => e.level)).toEqual(['info', 'warn', 'error', 'debug']);
  });
});
