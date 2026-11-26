import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import type { Server } from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import logsRoutes from '../../../src/web-server/routes/logs-routes';
import { createLogger, flushStructuredLogsSync } from '../../../src/services/logging';
import { clearRecentLogEntries } from '../../../src/services/logging/log-buffer';

describe('logs routes', () => {
  let server: Server;
  let baseUrl = '';
  let forcedRemoteAddress = '127.0.0.1';
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalDashboardAuthEnabled: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: forcedRemoteAddress,
        configurable: true,
      });
      next();
    });
    app.use('/api/logs', logsRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      server.once('error', reject);
      server.once('listening', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    originalDashboardAuthEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-logs-routes-'));
    process.env.CCS_HOME = tempHome;
    process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
    forcedRemoteAddress = '127.0.0.1';
    clearRecentLogEntries();

    const logger = createLogger('unit:test');
    logger.info('seed', 'Seed log entry', { feature: 'logs-routes' });

    const legacyDir = path.join(tempHome, '.ccs', 'cliproxy', 'logs');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'error-legacy.log'), 'legacy error\n', 'utf8');
  });

  afterEach(() => {
    flushStructuredLogsSync();
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (originalDashboardAuthEnabled !== undefined) {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = originalDashboardAuthEnabled;
    } else {
      delete process.env.CCS_DASHBOARD_AUTH_ENABLED;
    }

    clearRecentLogEntries();
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = '';
  });

  it('returns logging config, sources, and entries', async () => {
    const configResponse = await fetch(`${baseUrl}/api/logs/config`);
    expect(configResponse.status).toBe(200);
    const configPayload = (await configResponse.json()) as {
      logging: { level: string; retain_days: number };
    };
    expect(configPayload.logging.level).toBe('info');
    expect(configPayload.logging.retain_days).toBe(7);

    const sourcesResponse = await fetch(`${baseUrl}/api/logs/sources`);
    expect(sourcesResponse.status).toBe(200);
    const sourcesPayload = (await sourcesResponse.json()) as {
      sources: Array<{ source: string }>;
    };
    expect(sourcesPayload.sources.some((source) => source.source === 'unit:test')).toBe(true);

    const entriesResponse = await fetch(`${baseUrl}/api/logs/entries?source=unit:test`);
    expect(entriesResponse.status).toBe(200);
    const entriesPayload = (await entriesResponse.json()) as {
      entries: Array<{ source: string; message: string }>;
    };
    expect(entriesPayload.entries[0]?.source).toBe('unit:test');
    expect(entriesPayload.entries[0]?.message).toBe('Seed log entry');
  });

  it('updates logging config through the route', async () => {
    const response = await fetch(`${baseUrl}/api/logs/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'debug',
        retain_days: 3,
        live_buffer_size: 100,
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      logging: { level: string; retain_days: number; live_buffer_size: number };
    };
    expect(payload.success).toBe(true);
    expect(payload.logging.level).toBe('debug');
    expect(payload.logging.retain_days).toBe(3);
    expect(payload.logging.live_buffer_size).toBe(100);
  });

  it('blocks remote access when dashboard auth is disabled', async () => {
    forcedRemoteAddress = '10.10.0.42';

    const response = await fetch(`${baseUrl}/api/logs/sources`);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Logs endpoints require localhost access when dashboard auth is disabled.',
    });
  });
});
