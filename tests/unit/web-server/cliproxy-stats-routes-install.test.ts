import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';

let cliproxyStatsRoutes: typeof import('../../../src/web-server/routes/cliproxy-stats-routes').default;
let createEmptyUnifiedConfig: typeof import('../../../src/config/unified-config-types').createEmptyUnifiedConfig;
let saveUnifiedConfig: typeof import('../../../src/config/unified-config-loader').saveUnifiedConfig;
let setGlobalConfigDir: typeof import('../../../src/utils/config-manager').setGlobalConfigDir;
let writeInstalledVersion: typeof import('../../../src/cliproxy/binary/version-cache').writeInstalledVersion;
let writeVersionCache: typeof import('../../../src/cliproxy/binary/version-cache').writeVersionCache;
let writeVersionListCache: typeof import('../../../src/cliproxy/binary/version-cache').writeVersionListCache;

let server: Server;
let baseUrl = '';
let tempHome = '';
let originalCcsHome: string | undefined;

beforeAll(async () => {
  originalCcsHome = process.env.CCS_HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-install-route-'));
  process.env.CCS_HOME = tempHome;

  ({ setGlobalConfigDir } = await import('../../../src/utils/config-manager'));
  ({ createEmptyUnifiedConfig } = await import('../../../src/config/unified-config-types'));
  ({ saveUnifiedConfig } = await import('../../../src/config/unified-config-loader'));
  ({ writeInstalledVersion, writeVersionCache, writeVersionListCache } = await import(
    '../../../src/cliproxy/binary/version-cache'
  ));

  const ccsDir = path.join(tempHome, '.ccs');
  const plusBinDir = path.join(ccsDir, 'cliproxy', 'bin', 'plus');
  fs.mkdirSync(plusBinDir, { recursive: true });
  setGlobalConfigDir(ccsDir);

  const config = createEmptyUnifiedConfig();
  config.cliproxy = { backend: 'plus' } as unknown as typeof config.cliproxy;
  saveUnifiedConfig(config);

  writeInstalledVersion(plusBinDir, '6.6.80');
  writeVersionCache('6.6.89', 'plus');
  writeVersionListCache(
    {
      versions: ['6.6.89', '6.6.88', '6.6.81', '6.6.80'],
      latestStable: '6.6.89',
      latest: '6.6.89',
      checkedAt: Date.now(),
    },
    'plus'
  );

  ({ default: cliproxyStatsRoutes } = await import(
    '../../../src/web-server/routes/cliproxy-stats-routes'
  ));

  const app = express();
  app.use(express.json());
  app.use('/api/cliproxy', cliproxyStatsRoutes);

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
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  setGlobalConfigDir(undefined);

  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }

  if (tempHome && fs.existsSync(tempHome)) {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

describe('cliproxy-stats-routes install contract', () => {
  it('keeps saved plus configs on the plus backend for update checks', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/update-check`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      backend: string;
      backendLabel: string;
      currentVersion: string;
      latestVersion: string;
    };

    expect(body.backend).toBe('plus');
    expect(body.backendLabel).toBe('CLIProxy Plus');
    expect(body.currentVersion).toBe('6.6.80');
    expect(body.latestVersion).toBe('6.6.89');
  });

  it('returns faultyRange in the versions response', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/versions`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      faultyRange: { min: string; max: string };
      currentVersion: string;
    };
    expect(body.currentVersion).toBe('6.6.80');
    expect(body.faultyRange).toEqual({ min: '6.6.81-0', max: '6.6.88-0' });
  });

  it('returns faulty confirmation metadata without attempting the install', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '6.6.81' }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      success: boolean;
      requiresConfirmation: boolean;
      isFaulty: boolean;
      isExperimental: boolean;
      message: string;
    };
    expect(body.success).toBe(false);
    expect(body.requiresConfirmation).toBe(true);
    expect(body.isFaulty).toBe(true);
    expect(body.isExperimental).toBe(false);
    expect(body.message).toContain('known bugs');
  });

  it('returns experimental confirmation metadata without attempting the install', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '10.0.0' }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      success: boolean;
      requiresConfirmation: boolean;
      isFaulty: boolean;
      isExperimental: boolean;
      message: string;
    };
    expect(body.success).toBe(false);
    expect(body.requiresConfirmation).toBe(true);
    expect(body.isFaulty).toBe(false);
    expect(body.isExperimental).toBe(true);
    expect(body.message).toContain('experimental');
  });
});
