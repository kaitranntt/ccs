import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as http from 'http';
import { startCursorDaemonServer } from '../../../src/cursor/cursor-daemon-entry';
import { REQUEST_ID_HEADER } from '../../../src/services/logging';

function listenAddress(server: http.Server): { port: number } {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve test server address');
  }
  return { port: address.port };
}

async function requestHealth(port: number, requestId?: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET',
        headers: {
          'x-ccs-cursor-token': 'test-token',
          ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('cursor daemon request context', () => {
  let originalToken: string | undefined;
  let server: http.Server | undefined;

  beforeEach(() => {
    originalToken = process.env.CCS_CURSOR_DAEMON_TOKEN;
    process.env.CCS_CURSOR_DAEMON_TOKEN = 'test-token';
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
    if (originalToken === undefined) delete process.env.CCS_CURSOR_DAEMON_TOKEN;
    else process.env.CCS_CURSOR_DAEMON_TOKEN = originalToken;
  });

  test('echoes a valid inbound requestId header', async () => {
    server = startCursorDaemonServer({ port: 0, ghostMode: true });
    const { port } = listenAddress(server);
    const res = await requestHealth(port, 'req-cursor-123');

    expect(res.statusCode).toBe(200);
    expect(res.headers[REQUEST_ID_HEADER]).toBe('req-cursor-123');
  });

  test('mints a requestId when no valid inbound header exists', async () => {
    server = startCursorDaemonServer({ port: 0, ghostMode: true });
    const { port } = listenAddress(server);
    const res = await requestHealth(port, 'bad id with spaces');

    expect(res.statusCode).toBe(200);
    expect(res.headers[REQUEST_ID_HEADER]).toMatch(/^[A-Za-z0-9._-]{8,128}$/);
    expect(res.headers[REQUEST_ID_HEADER]).not.toBe('bad id with spaces');
  });
});
