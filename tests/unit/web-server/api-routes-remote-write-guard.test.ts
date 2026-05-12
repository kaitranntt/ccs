import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import bcrypt from 'bcrypt';
import express from 'express';
import type { Server } from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { apiRoutes } from '../../../src/web-server/routes';
import { mutateConfig, loadOrCreateUnifiedConfig } from '../../../src/config/config-loader-facade';
import { registerSession, deleteSessionLockForPort } from '../../../src/cliproxy/session-tracker';
import {
  authMiddleware,
  createSessionMiddleware,
} from '../../../src/web-server/middleware/auth-middleware';

describe('api-routes remote write guard', () => {
  let server: Server;
  let baseUrl = '';
  let forcedRemoteAddress = '127.0.0.1';
  let tempHome = '';
  let originalDashboardAuthEnabled: string | undefined;
  let originalCcsHome: string | undefined;

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
    app.use('/api', apiRoutes);

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
    originalDashboardAuthEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-api-routes-remote-write-guard-'));
    process.env.CCS_HOME = tempHome;
    process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
    forcedRemoteAddress = '10.10.0.24';
  });

  afterEach(() => {
    if (originalDashboardAuthEnabled !== undefined) {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = originalDashboardAuthEnabled;
    } else {
      delete process.env.CCS_DASHBOARD_AUTH_ENABLED;
    }

    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
      tempHome = '';
    }
  });

  it('allows remote read-only GET requests when dashboard auth is disabled', async () => {
    const response = await fetch(`${baseUrl}/api/profiles`);

    expect(response.status).toBe(200);
  });

  it('blocks remote Codex raw config reads when dashboard auth is disabled', async () => {
    const response = await fetch(`${baseUrl}/api/codex/config/raw`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Codex configuration endpoints require localhost access when dashboard auth is disabled.',
    });
  });

  it('allows remote Codex diagnostics when dashboard auth is disabled', async () => {
    const response = await fetch(`${baseUrl}/api/codex/diagnostics`);

    expect(response.status).toBe(200);
  });

  it('blocks remote profile creation when dashboard auth is disabled', async () => {
    const response = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'demo',
        baseUrl: 'https://api.example.com',
        apiKey: 'token',
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Remote dashboard writes require localhost access when dashboard auth is disabled.',
    });
  });

  it('blocks remote backup restore when dashboard auth is disabled', async () => {
    const response = await fetch(`${baseUrl}/api/persist/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Remote dashboard writes require localhost access when dashboard auth is disabled.',
    });
  });

  it('blocks remote PUT requests when dashboard auth is disabled', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy-server`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Remote dashboard writes require localhost access when dashboard auth is disabled.',
    });
  });

  it('rejects invalid local ports at the cliproxy-server API boundary', async () => {
    forcedRemoteAddress = '127.0.0.1';

    const response = await fetch(`${baseUrl}/api/cliproxy-server`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local: { port: 70000 },
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid local port. Must be an integer between 1 and 65535.',
    });
  });

  it('rejects local port changes while the current local proxy session is still running', async () => {
    forcedRemoteAddress = '127.0.0.1';
    mutateConfig((config) => {
      if (!config.cliproxy_server) {
        throw new Error('cliproxy_server defaults were not initialized');
      }
      config.cliproxy_server.local.port = 8317;
    });
    registerSession(8317, process.pid);

    try {
      const response = await fetch(`${baseUrl}/api/cliproxy-server`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local: { port: 9000 },
        }),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: 'Proxy is running on the current local port. Stop CLIProxy before changing local.port.',
        proxyRunning: true,
        currentLocalPort: 8317,
      });
      expect(loadOrCreateUnifiedConfig().cliproxy_server?.local?.port).toBe(8317);
    } finally {
      deleteSessionLockForPort(8317);
    }
  });

  it('blocks remote PATCH requests when dashboard auth is disabled', async () => {
    const response = await fetch(`${baseUrl}/api/codex/config/patch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Remote dashboard writes require localhost access when dashboard auth is disabled.',
    });
  });

  it('blocks remote DELETE requests when dashboard auth is disabled', async () => {
    const response = await fetch(`${baseUrl}/api/profiles/demo`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Remote dashboard writes require localhost access when dashboard auth is disabled.',
    });
  });

  it(
    'allows remote writes again when dashboard auth is enabled',
    async () => {
      const password = 'testpassword123';
      process.env.CCS_DASHBOARD_AUTH_ENABLED = 'true';
      process.env.CCS_DASHBOARD_USERNAME = 'admin';
      process.env.CCS_DASHBOARD_PASSWORD_HASH = await bcrypt.hash(password, 4);

      const authApp = express();
      authApp.use(express.json());
      authApp.use((req, _res, next) => {
        Object.defineProperty(req.socket, 'remoteAddress', {
          value: forcedRemoteAddress,
          configurable: true,
        });
        next();
      });
      authApp.use(createSessionMiddleware());
      authApp.use(authMiddleware);
      authApp.use('/api', apiRoutes);

      const authServer = await new Promise<Server>((resolve, reject) => {
        const instance = authApp.listen(0, '127.0.0.1');
        instance.once('error', reject);
        instance.once('listening', () => resolve(instance));
      });

      const address = authServer.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unable to resolve auth-enabled test server port');
      }
      const authBaseUrl = `http://127.0.0.1:${address.port}`;

      const loginResponse = await fetch(`${authBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password,
        }),
      });
      const cookie = loginResponse.headers.get('set-cookie');

      expect(loginResponse.status).toBe(200);
      expect(cookie).toBeTruthy();

      const response = await fetch(`${authBaseUrl}/api/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie as string,
        },
        body: JSON.stringify({
          name: 'demo',
          baseUrl: 'https://api.example.com',
          apiKey: 'token',
        }),
      });

      expect(response.status).toBe(201);

      await new Promise<void>((resolve) => authServer.close(() => resolve()));

      delete process.env.CCS_DASHBOARD_USERNAME;
      delete process.env.CCS_DASHBOARD_PASSWORD_HASH;
    },
    15000
  );
});
