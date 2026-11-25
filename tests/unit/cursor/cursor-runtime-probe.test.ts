import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import type { CursorConfig } from '../../../src/config/unified-config-types';

let tempDir = '';
let originalCcsHome: string | undefined;
let originalFetch: typeof globalThis.fetch;

let setGlobalConfigDir: (dir: string | undefined) => void;
let saveCredentials: (credentials: {
  accessToken: string;
  machineId: string;
  authMethod: 'manual' | 'auto-detect';
  importedAt: string;
}) => void;
let deleteCredentials: () => boolean;
let probeCursorRuntime: (config: CursorConfig) => Promise<{
  ok: boolean;
  stage: 'config' | 'auth' | 'daemon' | 'runtime';
  status: number;
  duration_ms: number;
  error_type?: string | null;
  message: string;
}>;

beforeEach(async () => {
  originalCcsHome = process.env.CCS_HOME;
  originalFetch = globalThis.fetch;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cursor-runtime-probe-test-'));
  process.env.CCS_HOME = tempDir;

  const configManager = await import('../../../src/utils/config-manager');
  setGlobalConfigDir = configManager.setGlobalConfigDir;
  setGlobalConfigDir(undefined);

  const cursorAuth = await import('../../../src/cursor/cursor-auth');
  saveCredentials = cursorAuth.saveCredentials;
  deleteCredentials = cursorAuth.deleteCredentials;

  const runtimeProbe = await import(
    `../../../src/cursor/cursor-runtime-probe?cursor-runtime-probe-test=${Date.now()}`
  );
  probeCursorRuntime = runtimeProbe.probeCursorRuntime;

  deleteCredentials();
});

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }

  setGlobalConfigDir(undefined);

  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('probeCursorRuntime', () => {
  it('classifies daemon connection races as daemon-stage failures', async () => {
    const port = 23000 + Math.floor(Math.random() * 2000);

    saveCredentials({
      accessToken: 'a'.repeat(60),
      machineId: '1234567890abcdef1234567890abcdef',
      authMethod: 'manual',
      importedAt: new Date().toISOString(),
    });

    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ service: 'cursor-daemon' }));
        setImmediate(() => {
          server.close();
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.startsWith('https://api2.cursor.sh')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'gpt-5.3-codex' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.startsWith(`http://127.0.0.1:${port}/v1/chat/completions`)) {
        const error = new Error('fetch failed') as Error & { cause?: { code: string } };
        error.cause = { code: 'ECONNREFUSED' };
        throw error;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof globalThis.fetch;

    const result = await probeCursorRuntime({
      enabled: true,
      port,
      auto_start: false,
      ghost_mode: true,
      model: 'gpt-5.3-codex',
    } as CursorConfig);

    expect(result.ok).toBe(false);
    expect(result.stage).toBe('daemon');
    expect(result.status).toBe(503);
    expect(result.error_type).toBe('daemon_unreachable');
    expect(result.message).toContain('unreachable');
  });
});
