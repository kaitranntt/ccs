import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';

let server: Server;
let baseUrl = '';
let tempDir = '';
let codexHome = '';
let originalCodexHome: string | undefined;

beforeAll(async () => {
  originalCodexHome = process.env.CODEX_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-routes-test-'));
  codexHome = path.join(tempDir, '.codex-home');
  process.env.CODEX_HOME = codexHome;

  const codexRoutesModule = await import('../../../src/web-server/routes/codex-routes');

  const app = express();
  app.use(express.json());
  app.use('/api/codex', codexRoutesModule.default);

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve test server port');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(codexHome, { recursive: true });
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (originalCodexHome !== undefined) {
    process.env.CODEX_HOME = originalCodexHome;
  } else {
    delete process.env.CODEX_HOME;
  }

  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('codex routes', () => {
  it('returns the current raw config snapshot from PATCH /config/patch', async () => {
    const res = await fetch(`${baseUrl}/api/codex/config/patch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'top-level',
        values: {
          model: 'gpt-5.4',
          sandboxMode: 'workspace-write',
        },
      }),
    });

    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      success: boolean;
      exists: boolean;
      mtime: number;
      rawText: string;
      config: Record<string, unknown> | null;
      parseError: string | null;
    };

    expect(json.success).toBe(true);
    expect(json.exists).toBe(true);
    expect(json.mtime).toBeGreaterThan(0);
    expect(json.parseError).toBeNull();
    expect(json.rawText).toContain('model = "gpt-5.4"');
    expect(json.rawText).toContain('sandbox_mode = "workspace-write"');
    expect(json.config?.model).toBe('gpt-5.4');

    const written = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    expect(written).toBe(json.rawText);
  });

  it('returns 409 when PATCH /config/patch receives a stale expectedMtime', async () => {
    const configPath = path.join(codexHome, 'config.toml');
    fs.writeFileSync(configPath, 'model = "gpt-5.3-codex"\n');

    const res = await fetch(`${baseUrl}/api/codex/config/patch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'feature',
        feature: 'multi_agent',
        enabled: true,
        expectedMtime: 1,
      }),
    });

    expect(res.status).toBe(409);

    const json = (await res.json()) as { error: string; mtime: number };
    expect(json.error).toContain('File modified externally.');
    expect(json.mtime).toBeGreaterThan(0);
  });

  it('returns 400 when PATCH /config/patch omits kind', async () => {
    const res = await fetch(`${baseUrl}/api/codex/config/patch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('kind is required.');
  });

  it('returns 400 when PATCH /config/patch receives an invalid trust path', async () => {
    const res = await fetch(`${baseUrl}/api/codex/config/patch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'project-trust',
        path: './relative-workspace',
        trustLevel: 'trusted',
      }),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Project path must be absolute');
  });
});
