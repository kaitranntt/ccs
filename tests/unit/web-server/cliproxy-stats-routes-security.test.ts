import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';

describe('cliproxy-stats-routes security & atomic writes', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let setGlobalConfigDir: (dir: string | undefined) => void;
  let cliproxyStatsRoutes: ReturnType<typeof express.Router>;

  beforeAll(async () => {
    originalCcsHome = process.env.CCS_HOME;
    ({ setGlobalConfigDir } = await import('../../../src/utils/config-manager'));
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    setGlobalConfigDir(undefined);
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
  });

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-config-sec-'));
    process.env.CCS_HOME = tempHome;
    setGlobalConfigDir(path.join(tempHome, '.ccs'));
  });

  afterEach(() => {
    setGlobalConfigDir(undefined);
    delete process.env.CCS_HOME;
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('rejects Content-Disposition header injection characters in auth-files/download', async () => {
    const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'valid.json'), '{"ok":true}');

    for (const badName of ['a"b.json', 'a;b.json', 'a\r\nb.json', 'a\nb.json', '../secret.json']) {
      const res = await fetch(
        `${baseUrl}/api/cliproxy/auth-files/download?name=${encodeURIComponent(badName)}`
      );
      expect(res.status).toBe(400);
    }
  });

  it('blocks symlink escapes in auth-files/download using realpath containment', async () => {
    if (process.platform === 'win32') return;

    const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    const outsideFile = path.join(tempHome, 'outside-secret.json');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(outsideFile, '{"secret":"nope"}');
    fs.symlinkSync(outsideFile, path.join(authDir, 'escaped.json'));

    const res = await fetch(`${baseUrl}/api/cliproxy/auth-files/download?name=escaped.json`);
    expect(res.status).toBe(400);
  });

  it('downloads regular auth files within authDir with safe Content-Disposition', async () => {
    const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'account-1.json'), '{"token":"ok"}');

    const res = await fetch(`${baseUrl}/api/cliproxy/auth-files/download?name=account-1.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="account-1.json"');
    expect(await res.text()).toBe('{"token":"ok"}');
  });

  it('writes cliproxy config.yaml atomically under lock across concurrent PUT requests', async () => {
    const cliproxyDir = path.join(tempHome, '.ccs', 'cliproxy');
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, idx) =>
        fetch(`${baseUrl}/api/cliproxy/config.yaml`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `port: ${8317 + idx}\n` }),
        })
      )
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const content = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf8');
    expect(content).toMatch(/^port: 83(17|18|19|20|21|22)\n$/);
    expect(fs.readdirSync(cliproxyDir).filter((n) => n.includes('.tmp.'))).toEqual([]);
  });

  it('serializes concurrent PUT /models/:provider updates atomically without temp leftovers', async () => {
    const cliproxyDir = path.join(tempHome, '.ccs', 'cliproxy');
    const settingsPath = path.join(cliproxyDir, 'agy.settings.json');
    fs.mkdirSync(cliproxyDir, { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'claude-sonnet-4-6',
          },
        },
        null,
        2
      ) + '\n'
    );

    const responses = await Promise.all(
      ['claude-opus-4-6-thinking', 'claude-sonnet-4-6', 'claude-haiku-4-5'].map((model) =>
        fetch(`${baseUrl}/api/cliproxy/models/agy`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model }),
        })
      )
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: { ANTHROPIC_MODEL: string };
    };
    expect(['claude-opus-4-6-thinking', 'claude-sonnet-4-6', 'claude-haiku-4-5']).toContain(
      persisted.env.ANTHROPIC_MODEL
    );
    expect(fs.readdirSync(cliproxyDir).filter((n) => n.includes('.tmp.'))).toEqual([]);
  });
});
