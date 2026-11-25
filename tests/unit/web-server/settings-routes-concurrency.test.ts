import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import settingsRoutes from '../../../src/web-server/routes/settings-routes';

describe('settings-routes concurrency', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRoutes);

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
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-settings-concurrency-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('handles concurrent GET canonicalization without EEXIST or settings corruption', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const settingsPath = path.join(ccsDir, 'agy.settings.json');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking',
          },
        },
        null,
        2
      ) + '\n'
    );

    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, idx) =>
        fetch(`${baseUrl}/api/settings/agy${idx % 2 === 0 ? '' : '/raw'}`)
      )
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      const body = (await res.json()) as { settings: { env: Record<string, string> } };
      expect(body.settings.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    }

    const leftoverTmp = fs.readdirSync(ccsDir).filter((name) => name.includes('.tmp.'));
    expect(leftoverTmp).toEqual([]);

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
  });

  it('handles concurrent PUT updates without colliding temp files', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const settingsPath = path.join(ccsDir, 'custom.settings.json');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { ANTHROPIC_API_KEY: 'init' } }, null, 2));

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, idx) =>
        fetch(`${baseUrl}/api/settings/custom`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: {
              env: {
                ANTHROPIC_API_KEY: `key-${idx}`,
              },
            },
          }),
        })
      )
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const leftoverTmp = fs.readdirSync(ccsDir).filter((name) => name.includes('.tmp.'));
    expect(leftoverTmp).toEqual([]);

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: { ANTHROPIC_API_KEY: string };
    };
    expect(persisted.env.ANTHROPIC_API_KEY).toMatch(/^key-\d$/);
  });
});
