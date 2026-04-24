import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import settingsRoutes from '../../../src/web-server/routes/settings-routes';

function writeSettings(filePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

describe('settings-routes model canonicalization', () => {
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
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-settings-routes-'));
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

  it('canonicalizes AGY env and preset model IDs on PUT /:profile', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, { env: {} });

    const response = await fetch(`${baseUrl}/api/settings/agy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'claude-sonnet-4-6-thinking(8192)',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4.6-thinking',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4.6-thinking',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4.5',
          },
          presets: [
            {
              name: 'legacy',
              default: 'claude-sonnet-4-6-thinking',
              opus: 'claude-opus-4.6-thinking',
              sonnet: 'claude-sonnet-4.6-thinking',
              haiku: 'claude-haiku-4.5',
            },
          ],
        },
      }),
    });
    expect(response.status).toBe(200);

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
      presets: Array<Record<string, string>>;
    };

    expect(persisted.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6(8192)');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5');

    expect(persisted.presets[0]?.default).toBe('claude-sonnet-4-6');
    expect(persisted.presets[0]?.opus).toBe('claude-opus-4-6-thinking');
    expect(persisted.presets[0]?.sonnet).toBe('claude-sonnet-4-6');
    expect(persisted.presets[0]?.haiku).toBe('claude-haiku-4-5');
  });

  it('canonicalizes legacy iflow model IDs on PUT /:profile', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'iflow.settings.json');
    writeSettings(settingsPath, { env: {} });

    const response = await fetch(`${baseUrl}/api/settings/iflow`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/iflow',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'kimi-k2.5',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'iflow-default',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v3.2-chat',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.7',
          },
          presets: [
            {
              name: 'legacy-iflow',
              default: 'kimi-k2.5',
              opus: 'iflow-default',
              sonnet: 'deepseek-v3.2-chat',
              haiku: 'minimax-m2.5',
            },
          ],
        },
      }),
    });
    expect(response.status).toBe(200);

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
      presets: Array<Record<string, string>>;
    };

    expect(persisted.env.ANTHROPIC_MODEL).toBe('kimi-k2');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen3-coder-plus');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('deepseek-v3.2');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.6');
    expect(persisted.presets[0]?.default).toBe('kimi-k2');
    expect(persisted.presets[0]?.opus).toBe('qwen3-coder-plus');
    expect(persisted.presets[0]?.sonnet).toBe('deepseek-v3.2');
    expect(persisted.presets[0]?.haiku).toBe('qwen3-coder-plus');
  });

  it('preserves codex effort suffixes on PUT /:profile while still normalizing legacy aliases', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'codex.settings.json');
    writeSettings(settingsPath, { env: {} });

    const response = await fetch(`${baseUrl}/api/settings/codex`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'gpt-5.3-codex-xhigh',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5-codex-high',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5-mini-medium',
          },
          presets: [
            {
              name: 'legacy-codex',
              default: 'gpt-5.3-codex-xhigh',
              opus: 'gpt-5-codex-high',
              sonnet: 'gpt-5.3-codex-high',
              haiku: 'gpt-5-mini-medium',
            },
          ],
        },
      }),
    });
    expect(response.status).toBe(200);

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
      presets: Array<Record<string, string>>;
    };

    expect(persisted.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.5-high');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex-high');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini-medium');
    expect(persisted.presets[0]?.default).toBe('gpt-5.3-codex-xhigh');
    expect(persisted.presets[0]?.opus).toBe('gpt-5.5-high');
    expect(persisted.presets[0]?.sonnet).toBe('gpt-5.3-codex-high');
    expect(persisted.presets[0]?.haiku).toBe('gpt-5.4-mini-medium');
  });

  it('preserves codex effort suffixes on GET /:profile/raw canonicalization', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'codex.settings.json');
    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'gpt-5-codex-high',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5-mini-medium',
      },
    });

    const response = await fetch(`${baseUrl}/api/settings/codex/raw`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { settings: { env: Record<string, string> } };
    expect(body.settings.env.ANTHROPIC_MODEL).toBe('gpt-5.5-high');
    expect(body.settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(body.settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex-high');
    expect(body.settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini-medium');

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('gpt-5.5-high');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex-high');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini-medium');
  });

  it('canonicalizes AGY preset values on POST /:profile/presets', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      },
      presets: [
        {
          name: 'legacy-existing',
          default: 'claude-sonnet-4-6-thinking',
          opus: 'claude-opus-4.6-thinking',
          sonnet: 'claude-sonnet-4.6-thinking',
          haiku: 'claude-haiku-4.5',
        },
      ],
    });

    const response = await fetch(`${baseUrl}/api/settings/agy/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'new-legacy',
        default: 'claude-sonnet-4-6-thinking',
        opus: 'claude-opus-4.6-thinking',
        sonnet: 'claude-sonnet-4.6-thinking',
        haiku: 'claude-haiku-4.5',
      }),
    });
    expect(response.status).toBe(201);

    const body = (await response.json()) as { preset: Record<string, string> };
    expect(body.preset.default).toBe('claude-sonnet-4-6');
    expect(body.preset.opus).toBe('claude-opus-4-6-thinking');
    expect(body.preset.sonnet).toBe('claude-sonnet-4-6');
    expect(body.preset.haiku).toBe('claude-haiku-4-5');

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      presets: Array<Record<string, string>>;
    };
    expect(persisted.presets[0]?.default).toBe('claude-sonnet-4-6');
    expect(persisted.presets[0]?.opus).toBe('claude-opus-4-6-thinking');
    expect(persisted.presets[0]?.sonnet).toBe('claude-sonnet-4-6');
    expect(persisted.presets[0]?.haiku).toBe('claude-haiku-4-5');
    expect(persisted.presets[1]?.default).toBe('claude-sonnet-4-6');
    expect(persisted.presets[1]?.opus).toBe('claude-opus-4-6-thinking');
    expect(persisted.presets[1]?.sonnet).toBe('claude-sonnet-4-6');
    expect(persisted.presets[1]?.haiku).toBe('claude-haiku-4-5');
  });

  it('canonicalizes and persists AGY preset aliases on GET /:profile/presets', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking',
      },
      presets: [
        {
          name: 'legacy',
          default: 'claude-sonnet-4-6-thinking',
          opus: 'claude-opus-4.6-thinking',
          sonnet: 'claude-sonnet-4.6-thinking',
          haiku: 'claude-haiku-4.5',
        },
      ],
    });

    const response = await fetch(`${baseUrl}/api/settings/agy/presets`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { presets: Array<Record<string, string>> };
    expect(body.presets[0]?.default).toBe('claude-sonnet-4-6');
    expect(body.presets[0]?.opus).toBe('claude-opus-4-6-thinking');
    expect(body.presets[0]?.sonnet).toBe('claude-sonnet-4-6');
    expect(body.presets[0]?.haiku).toBe('claude-haiku-4-5');

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
      presets: Array<Record<string, string>>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(persisted.presets[0]?.default).toBe('claude-sonnet-4-6');
    expect(persisted.presets[0]?.opus).toBe('claude-opus-4-6-thinking');
    expect(persisted.presets[0]?.sonnet).toBe('claude-sonnet-4-6');
    expect(persisted.presets[0]?.haiku).toBe('claude-haiku-4-5');
  });

  it('canonicalizes existing settings on DELETE /:profile/presets/:name writes', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking',
      },
      presets: [
        {
          name: 'remove-me',
          default: 'claude-sonnet-4-6-thinking',
          opus: 'claude-opus-4.6-thinking',
          sonnet: 'claude-sonnet-4.6-thinking',
          haiku: 'claude-haiku-4.5',
        },
      ],
    });

    const response = await fetch(`${baseUrl}/api/settings/agy/presets/remove-me`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
      presets: Array<Record<string, string>>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(persisted.presets.length).toBe(0);
  });

  it('does not mutate settings on duplicate preset POST failure', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking',
      },
      presets: [
        {
          name: 'existing',
          default: 'claude-sonnet-4-6-thinking',
          opus: 'claude-opus-4.6-thinking',
          sonnet: 'claude-sonnet-4.6-thinking',
          haiku: 'claude-haiku-4.5',
        },
      ],
    });
    const before = fs.readFileSync(settingsPath, 'utf8');

    const response = await fetch(`${baseUrl}/api/settings/agy/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'existing',
        default: 'claude-sonnet-4-6-thinking',
      }),
    });
    expect(response.status).toBe(409);

    const after = fs.readFileSync(settingsPath, 'utf8');
    expect(after).toBe(before);
  });

  it('does not mutate settings on missing preset DELETE failure', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking',
      },
      presets: [
        {
          name: 'keep-me',
          default: 'claude-sonnet-4-6-thinking',
          opus: 'claude-opus-4.6-thinking',
          sonnet: 'claude-sonnet-4.6-thinking',
          haiku: 'claude-haiku-4.5',
        },
      ],
    });
    const before = fs.readFileSync(settingsPath, 'utf8');

    const response = await fetch(`${baseUrl}/api/settings/agy/presets/does-not-exist`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(404);

    const after = fs.readFileSync(settingsPath, 'utf8');
    expect(after).toBe(before);
  });

  it('canonicalizes AGY aliases via provider alias profile names', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'antigravity.settings.json');
    writeSettings(settingsPath, { env: {} });

    const response = await fetch(`${baseUrl}/api/settings/antigravity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4.6-thinking',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6-thinking',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4.5',
          },
          presets: [],
        },
      }),
    });
    expect(response.status).toBe(200);

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5');
  });

  it('rejects denylisted AGY models on PUT /:profile', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, { env: {} });

    const response = await fetch(`${baseUrl}/api/settings/agy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'claude-sonnet-4.5',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4.5',
          },
          presets: [],
        },
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain('denylist');
  });

  it('rejects denylisted AGY models on POST /:profile/presets', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      },
      presets: [],
    });

    const response = await fetch(`${baseUrl}/api/settings/agy/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'legacy',
        default: 'claude-opus-4.5-thinking',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain('denylist');
  });

  it('drops denylisted AGY presets on read canonicalization', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      },
      presets: [
        {
          name: 'denylisted',
          default: 'claude-sonnet-4.5',
          opus: 'claude-opus-4-6-thinking',
          sonnet: 'claude-sonnet-4-6',
          haiku: 'claude-haiku-4.5',
        },
      ],
    });

    const response = await fetch(`${baseUrl}/api/settings/agy/presets`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { presets: Array<Record<string, string>> };
    expect(body.presets.length).toBe(0);

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      presets: Array<Record<string, string>>;
    };
    expect(persisted.presets.length).toBe(0);
  });

  it('does not crash on malformed non-string preset model values', async () => {
    const settingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    writeSettings(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      },
      presets: [
        {
          name: 'malformed',
          default: 123,
          opus: null,
          sonnet: 'claude-sonnet-4.6-thinking',
          haiku: 'claude-haiku-4.5',
        },
      ],
    });

    const response = await fetch(`${baseUrl}/api/settings/agy/raw`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      settings: { presets: Array<Record<string, unknown>> };
    };
    expect(body.settings.presets[0]?.default).toBe(123);
    expect(body.settings.presets[0]?.sonnet).toBe('claude-sonnet-4-6');
  });
});
