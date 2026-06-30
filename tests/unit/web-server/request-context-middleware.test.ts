import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmptyUnifiedConfig } from '../../../src/config/unified-config-types';
import { saveUnifiedConfig } from '../../../src/config/unified-config-loader';
import {
  clearRecentLogEntries,
  createLogger,
  getRecentLogEntries,
  invalidateLoggingConfigCache,
} from '../../../src/services/logging';
import { requestLoggingMiddleware } from '../../../src/web-server/middleware/request-logging-middleware';

describe('request-logging-middleware requestId propagation', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-req-ctx-mw-'));
    process.env.CCS_HOME = tempHome;
    clearRecentLogEntries();
    invalidateLoggingConfigCache();
    const config = createEmptyUnifiedConfig();
    config.logging = { ...config.logging, enabled: true, level: 'debug', redact: false };
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

  test('downstream handler log requestId === response x-ccs-request-id header', () => {
    const handlerLogger = createLogger('test:downstream-handler');
    let headerRequestId = '';
    const res = {
      locals: {} as Record<string, unknown>,
      setHeader: (_name: string, value: string) => {
        headerRequestId = value;
      },
      on: () => {},
      statusCode: 200,
      socket: { remoteAddress: null },
    } as unknown as Parameters<typeof requestLoggingMiddleware>[1];
    const req = {
      originalUrl: '/api/anything',
      method: 'GET',
      headers: {},
      socket: { remoteAddress: null },
    } as unknown as Parameters<typeof requestLoggingMiddleware>[0];

    requestLoggingMiddleware(req, res, () => {
      // Simulate a downstream route handler emitting a structured log inside the chain.
      handlerLogger.info('test.handler.ran', 'downstream handler executed');
    });

    const entries = getRecentLogEntries();
    const handlerEntry = entries.find((e) => e.event === 'test.handler.ran');
    expect(handlerEntry).toBeDefined();
    expect(headerRequestId).toMatch(/^[A-Za-z0-9._-]{8,128}$/);
    expect(handlerEntry?.requestId).toBe(headerRequestId);
  });

  test('completion log carries top-level requestId for trace grouping', () => {
    let finishHandler: (() => void) | undefined;
    let headerRequestId = '';
    const res = {
      locals: {} as Record<string, unknown>,
      setHeader: (_name: string, value: string) => {
        headerRequestId = value;
      },
      on: (event: string, handler: () => void) => {
        if (event === 'finish') finishHandler = handler;
      },
      statusCode: 204,
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Parameters<typeof requestLoggingMiddleware>[1];
    const req = {
      originalUrl: '/api/anything',
      method: 'POST',
      headers: { 'user-agent': 'test-agent' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Parameters<typeof requestLoggingMiddleware>[0];

    requestLoggingMiddleware(req, res, () => {});
    finishHandler?.();

    const entry = getRecentLogEntries().find((e) => e.event === 'request.completed');
    expect(entry).toBeDefined();
    expect(entry?.requestId).toBe(headerRequestId);
    expect((entry?.context as Record<string, unknown>)?.requestId).toBe(headerRequestId);
  });

  test('control: a bare handler log (no middleware) carries no requestId', () => {
    const handlerLogger = createLogger('test:bare-handler');
    handlerLogger.info('test.bare.ran', 'no middleware wrap');
    const entry = getRecentLogEntries().find((e) => e.event === 'test.bare.ran');
    expect(entry?.requestId).toBeUndefined();
  });
});
