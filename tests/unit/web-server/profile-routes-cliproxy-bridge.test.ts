import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import profileRoutes from '../../../src/web-server/routes/profile-routes';
import { invalidateConfigCache } from '../../../src/config/config-loader-facade';
import { clearConfigCache } from '../../../src/cliproxy/config/base-config-loader';

describe('profile-routes cliproxy bridge', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/profiles', profileRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const onError = (error: Error) => reject(error);
      server.once('error', onError);
      server.once('listening', () => {
        server.off('error', onError);
        resolve();
      });
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
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-profile-routes-cliproxy-bridge-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateConfigCache();
    clearConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    invalidateConfigCache();
    clearConfigCache();

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('creates a routed CLIProxy-backed API profile and returns bridge metadata', async () => {
    const response = await fetch(`${baseUrl}/api/profiles/cliproxy-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'gemini' }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      name: string;
      settingsPath: string;
      cliproxyBridge: { provider: string; usesCurrentTarget: boolean };
    };
    expect(body.name).toBe('gemini-api');
    expect(body.settingsPath).toBe('~/.ccs/gemini-api.settings.json');
    expect(body.cliproxyBridge.provider).toBe('gemini');
    expect(body.cliproxyBridge.usesCurrentTarget).toBe(true);

    const settingsPath = path.join(tempHome, '.ccs', 'gemini-api.settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it('auto-suggests the next routed profile name when the default bridge name is taken', async () => {
    const firstResponse = await fetch(`${baseUrl}/api/profiles/cliproxy-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'gemini' }),
    });
    expect(firstResponse.status).toBe(201);

    const secondResponse = await fetch(`${baseUrl}/api/profiles/cliproxy-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'gemini' }),
    });

    expect(secondResponse.status).toBe(201);
    const body = (await secondResponse.json()) as { name: string };
    expect(body.name).toBe('gemini-api-2');
  });
});
