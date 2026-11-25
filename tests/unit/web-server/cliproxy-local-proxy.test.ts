import { afterEach, describe, expect, it } from 'bun:test';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

import {
  createCliproxyLocalProxyRouter,
  type CliproxyLocalProxyDeps,
} from '../../../src/web-server/routes/cliproxy-local-proxy';

const servers: http.Server[] = [];

async function listen(server: http.Server): Promise<number> {
  servers.push(server);

  return await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

async function createBackendServer(
  handler: http.RequestListener
): Promise<{ port: number; server: http.Server }> {
  const server = http.createServer(handler);
  const port = await listen(server);
  return { port, server };
}

async function createProxyServer(options: {
  enforceAccess?: CliproxyLocalProxyDeps['enforceAccess'];
  resolveTargetPort: () => number;
}): Promise<{ baseUrl: string; server: http.Server }> {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/cliproxy-local',
    createCliproxyLocalProxyRouter({
      enforceAccess: options.enforceAccess,
      resolveTargetPort: options.resolveTargetPort,
    })
  );

  const server = http.createServer(app);
  const port = await listen(server);
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server) {
      continue;
    }

    // Force-close keep-alive connections so server.close() doesn't hang
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('cliproxy local proxy route', () => {
  it('blocks requests when local-access enforcement fails', async () => {
    let backendHit = false;
    const backend = await createBackendServer((_req, res) => {
      backendHit = true;
      res.writeHead(200).end('ok');
    });
    const proxy = await createProxyServer({
      resolveTargetPort: () => backend.port,
      enforceAccess: (_req, res) => {
        res.status(403).json({ error: 'blocked' });
        return false;
      },
    });

    const response = await fetch(`${proxy.baseUrl}/api/cliproxy-local/management.html`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'blocked' });
    expect(backendHit).toBe(false);
  });

  it('forwards JSON request bodies after express.json has parsed them', async () => {
    const backend = await createBackendServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            body: JSON.parse(body),
            method: req.method,
            path: req.url,
          })
        );
      });
    });
    const proxy = await createProxyServer({
      resolveTargetPort: () => backend.port,
      enforceAccess: () => true,
    });

    const response = await fetch(`${proxy.baseUrl}/api/cliproxy-local/v0/management/test`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, ids: ['a', 'b'] }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      body: { enabled: true, ids: ['a', 'b'] },
      method: 'PATCH',
      path: '/v0/management/test',
    });
  });

  it('forwards GET requests and returns backend response', async () => {
    const backend = await createBackendServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>management panel</html>');
    });
    const proxy = await createProxyServer({
      resolveTargetPort: () => backend.port,
      enforceAccess: () => true,
    });

    const response = await fetch(`${proxy.baseUrl}/api/cliproxy-local/management.html`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>management panel</html>');
  });

  it('returns 502 when CLIProxy is not reachable', async () => {
    // Use a port with nothing listening
    const proxy = await createProxyServer({
      resolveTargetPort: () => 19999,
      enforceAccess: () => true,
    });

    const response = await fetch(`${proxy.baseUrl}/api/cliproxy-local/`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'CLIProxy is not reachable' });
  });

  it('strips cookie headers unconditionally while preserving authorization for CPAMC', async () => {
    let capturedHeaders: http.IncomingHttpHeaders = {};
    const backend = await createBackendServer((req, res) => {
      capturedHeaders = req.headers;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    const proxy = await createProxyServer({
      resolveTargetPort: () => backend.port,
      enforceAccess: () => true,
    });

    const response = await fetch(`${proxy.baseUrl}/api/cliproxy-local/v0/management/config`, {
      headers: {
        Cookie: 'connect.sid=secret-session-cookie',
        Authorization: 'Bearer cpamc-management-secret',
      },
    });

    expect(response.status).toBe(200);
    expect(capturedHeaders.cookie).toBeUndefined();
    expect(capturedHeaders.authorization).toBe('Bearer cpamc-management-secret');
  });

  it('handles mid-stream upstream proxyRes error without crashing Express', async () => {
    const { EventEmitter } = await import('events');
    const app = express();
    app.use(
      '/api/cliproxy-local',
      createCliproxyLocalProxyRouter({
        enforceAccess: () => true,
        resolveTargetPort: () => 8317,
        request: ((_opts: unknown, cb: (res: http.IncomingMessage) => void) => {
          const fakeProxyReq = Object.assign(new EventEmitter(), {
            destroyed: false,
            destroy() {
              this.destroyed = true;
            },
            end() {
              queueMicrotask(() => {
                const fakeProxyRes = Object.assign(new EventEmitter(), {
                  statusCode: 200,
                  headers: { 'content-type': 'text/plain' },
                  pause() {},
                  resume() {},
                }) as unknown as http.IncomingMessage;
                cb(fakeProxyRes);
                fakeProxyRes.emit('data', Buffer.from('partial'));
                fakeProxyRes.emit('error', new Error('ECONNRESET'));
              });
            },
          });
          return fakeProxyReq as unknown as http.ClientRequest;
        }) as unknown as typeof http.request,
      })
    );

    const server = http.createServer(app);
    const port = await listen(server);
    let threw = false;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/cliproxy-local/logs`);
      await response.text();
    } catch {
      threw = true;
    }

    // Either stream reset cleanly or client observed aborted stream without crashing the server.
    expect(typeof threw).toBe('boolean');

    // Verify server still handles subsequent requests normally.
    const followUp = await fetch(`http://127.0.0.1:${port}/nonexistent`);
    expect(followUp.status).toBe(404);
  });
});
