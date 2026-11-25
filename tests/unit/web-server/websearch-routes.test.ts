import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import {
  loadOrCreateUnifiedConfig,
  mutateUnifiedConfig,
} from '../../../src/config/unified-config-loader';
import websearchRoutes from '../../../src/web-server/routes/websearch-routes';

const WEBSEARCH_ENV_KEYS = [
  'EXA_API_KEY',
  'TAVILY_API_KEY',
  'BRAVE_API_KEY',
  'CCS_WEBSEARCH_EXA_API_KEY',
  'CCS_WEBSEARCH_TAVILY_API_KEY',
  'CCS_WEBSEARCH_BRAVE_API_KEY',
] as const;

describe('websearch routes', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let originalDashboardAuthEnabled: string | undefined;
  let originalEnvValues: Record<(typeof WEBSEARCH_ENV_KEYS)[number], string | undefined>;
  let forcedRemoteAddress = '127.0.0.1';

  async function putWebsearch(
    body: string | Record<string, unknown>,
    headers: Record<string, string> = { 'Content-Type': 'application/json' }
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/websearch`, {
      method: 'PUT',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

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
    app.use('/api/websearch', websearchRoutes);

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
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-websearch-routes-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalDashboardAuthEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
    process.env.CCS_HOME = tempHome;
    process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
    forcedRemoteAddress = '127.0.0.1';

    originalEnvValues = WEBSEARCH_ENV_KEYS.reduce(
      (acc, key) => {
        acc[key] = process.env[key];
        delete process.env[key];
        return acc;
      },
      {} as Record<(typeof WEBSEARCH_ENV_KEYS)[number], string | undefined>
    );
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (originalDashboardAuthEnabled !== undefined) {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = originalDashboardAuthEnabled;
    } else {
      delete process.env.CCS_DASHBOARD_AUTH_ENABLED;
    }

    for (const key of WEBSEARCH_ENV_KEYS) {
      const value = originalEnvValues[key];
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('blocks remote access when dashboard auth is disabled', async () => {
    forcedRemoteAddress = '10.10.0.24';

    const getResponse = await fetch(`${baseUrl}/api/websearch`);
    expect(getResponse.status).toBe(403);
    expect(await getResponse.json()).toEqual({
      error: 'WebSearch endpoints require localhost access when dashboard auth is disabled.',
    });

    const putResponse = await fetch(`${baseUrl}/api/websearch`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKeys: {
          exa: 'exa-secret-abcdefgh',
        },
      }),
    });
    expect(putResponse.status).toBe(403);
    expect(await putResponse.json()).toEqual({
      error: 'WebSearch endpoints require localhost access when dashboard auth is disabled.',
    });

    const config = loadOrCreateUnifiedConfig();
    expect(config.global_env?.env.EXA_API_KEY).toBeUndefined();
  });

  it('allows remote access when dashboard auth is enabled', async () => {
    forcedRemoteAddress = '10.10.0.24';
    process.env.CCS_DASHBOARD_AUTH_ENABLED = 'true';

    const response = await fetch(`${baseUrl}/api/websearch`);
    expect(response.status).toBe(200);
  });

  it('returns masked API key state from dashboard-managed global env', async () => {
    mutateUnifiedConfig((config) => {
      config.websearch = {
        enabled: true,
        providers: {
          ...config.websearch?.providers,
          exa: { enabled: true, max_results: 7 },
          duckduckgo: { enabled: false, max_results: 5 },
        },
      };
      config.global_env = {
        enabled: true,
        env: {
          ...(config.global_env?.env ?? {}),
          EXA_API_KEY: 'exa-secret-12345678',
        },
      };
    });

    const response = await fetch(`${baseUrl}/api/websearch`);
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.providers.exa).toMatchObject({
      enabled: true,
      max_results: 7,
    });
    expect(payload.apiKeys.exa).toMatchObject({
      envVar: 'EXA_API_KEY',
      configured: true,
      available: true,
      source: 'global_env',
    });
    expect(payload.apiKeys.exa.maskedValue).toContain('*');

    const statusResponse = await fetch(`${baseUrl}/api/websearch/status`);
    expect(statusResponse.status).toBe(200);
    const statusPayload = await statusResponse.json();
    expect(statusPayload.readiness).toMatchObject({
      status: 'ready',
    });
    expect(
      statusPayload.providers.find((provider: { id: string }) => provider.id === 'exa')
    ).toMatchObject({
      available: true,
      detail: 'API key detected (7 results)',
    });
  });

  it('stores and removes WebSearch API keys via the dashboard route', async () => {
    const createResponse = await fetch(`${baseUrl}/api/websearch`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: {
          exa: { enabled: true, max_results: 6 },
        },
        apiKeys: {
          exa: 'exa-secret-abcdefgh',
        },
      }),
    });

    expect(createResponse.status).toBe(200);
    const createdPayload = await createResponse.json();
    expect(createdPayload.websearch.apiKeys.exa).toMatchObject({
      configured: true,
      source: 'global_env',
    });

    let config = loadOrCreateUnifiedConfig();
    expect(config.global_env?.env.EXA_API_KEY).toBe('exa-secret-abcdefgh');

    const removeResponse = await fetch(`${baseUrl}/api/websearch`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: {
          exa: { enabled: true, max_results: 6 },
        },
        apiKeys: {
          exa: '',
        },
      }),
    });

    expect(removeResponse.status).toBe(200);
    const removedPayload = await removeResponse.json();
    expect(removedPayload.websearch.apiKeys.exa).toMatchObject({
      configured: false,
      source: 'none',
    });

    config = loadOrCreateUnifiedConfig();
    expect(config.global_env?.env.EXA_API_KEY).toBeUndefined();
  });

  it('preserves stored API keys when only provider settings change', async () => {
    mutateUnifiedConfig((config) => {
      config.global_env = {
        enabled: true,
        env: {
          ...(config.global_env?.env ?? {}),
          EXA_API_KEY: 'exa-secret-12345678',
        },
      };
    });

    const response = await fetch(`${baseUrl}/api/websearch`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: {
          exa: { enabled: true, max_results: 9 },
          duckduckgo: { enabled: false, max_results: 5 },
        },
      }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.websearch.providers.exa).toMatchObject({
      enabled: true,
      max_results: 9,
    });
    expect(payload.websearch.apiKeys.exa).toMatchObject({
      configured: true,
      source: 'global_env',
    });

    const config = loadOrCreateUnifiedConfig();
    expect(config.global_env?.env.EXA_API_KEY).toBe('exa-secret-12345678');
  });

  it('persists searxng provider settings and clamps max_results', async () => {
    const response = await putWebsearch({
      providers: {
        searxng: {
          enabled: true,
          url: 'https://search.example.com',
          max_results: 99,
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.websearch.providers.searxng).toEqual({
      enabled: true,
      url: 'https://search.example.com',
      max_results: 10,
    });

    const config = loadOrCreateUnifiedConfig();
    expect(config.websearch?.providers?.searxng).toEqual({
      enabled: true,
      url: 'https://search.example.com',
      max_results: 10,
    });
  });

  it('persists native_profiles and keeps them when other settings change', async () => {
    const saved = await putWebsearch({ native_profiles: [' gateway ', 'gateway', 'codex'] });
    expect(saved.status).toBe(200);
    expect((await saved.json()).websearch.native_profiles).toEqual(['gateway', 'codex']);

    const updated = await putWebsearch({ enabled: false });
    expect(updated.status).toBe(200);
    expect((await updated.json()).websearch.native_profiles).toEqual(['gateway', 'codex']);
    expect(loadOrCreateUnifiedConfig().websearch?.native_profiles).toEqual(['gateway', 'codex']);
  });

  it('rejects non-array native_profiles values', async () => {
    for (const nativeProfiles of ['gateway', [1], null]) {
      const response = await putWebsearch({ native_profiles: nativeProfiles });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'Invalid value for native_profiles. Must be an array of profile names.',
      });
    }
  });

  it('normalizes searxng endpoint-style urls to the instance base URL', async () => {
    const response = await putWebsearch({
      providers: {
        searxng: {
          enabled: true,
          url: 'https://search.example.com/custom/search/',
          max_results: 5,
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.websearch.providers.searxng).toEqual({
      enabled: true,
      url: 'https://search.example.com/custom',
      max_results: 5,
    });
  });

  it('allows clearing a searxng url back to blank', async () => {
    mutateUnifiedConfig((config) => {
      config.websearch = {
        enabled: true,
        providers: {
          ...config.websearch?.providers,
          searxng: {
            enabled: false,
            url: 'https://search.example.com/custom',
            max_results: 5,
          },
        },
      };
    });

    const response = await putWebsearch({
      providers: {
        searxng: {
          enabled: false,
          url: '',
          max_results: 5,
        },
      },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.websearch.providers.searxng).toEqual({
      enabled: false,
      url: '',
      max_results: 5,
    });
  });

  it('sanitizes credential-bearing searxng urls out of the GET response', async () => {
    mutateUnifiedConfig((config) => {
      config.websearch = {
        enabled: true,
        providers: {
          ...config.websearch?.providers,
          searxng: {
            enabled: true,
            url: 'https://user:pass@search.example.com/search',
            max_results: 5,
          },
        },
      };
    });

    const response = await fetch(`${baseUrl}/api/websearch`);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.providers.searxng).toEqual({
      enabled: true,
      url: '',
      max_results: 5,
    });
  });

  it('rejects non-object request bodies', async () => {
    const response = await putWebsearch('[]');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid request body. Must be an object.',
    });
  });

  it('rejects primitive JSON null bodies at the JSON parser layer', async () => {
    const response = await putWebsearch('null');

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('SyntaxError');
  });

  it('rejects unsupported API key providers', async () => {
    const response = await putWebsearch({
      apiKeys: {
        invalid: 'secret',
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Unsupported WebSearch provider: invalid',
    });
  });

  it('rejects non-string API key values', async () => {
    const response = await putWebsearch({
      apiKeys: {
        exa: 123,
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid value for exa API key',
    });
  });

  it('rejects null and array values for providers and apiKeys', async () => {
    const invalidPayloads = [
      {
        body: { providers: null },
        error: 'Invalid value for providers. Must be an object.',
      },
      {
        body: { providers: [] },
        error: 'Invalid value for providers. Must be an object.',
      },
      {
        body: { apiKeys: null },
        error: 'Invalid value for apiKeys. Must be an object.',
      },
      {
        body: { apiKeys: [] },
        error: 'Invalid value for apiKeys. Must be an object.',
      },
    ] as const;

    for (const invalidPayload of invalidPayloads) {
      const response = await putWebsearch(invalidPayload.body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: invalidPayload.error });
    }
  });

  it('rejects non-string searxng url values', async () => {
    const response = await putWebsearch({
      providers: {
        searxng: {
          url: 123,
        },
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid value for providers.searxng.url. Must be a string.',
    });
  });

  it('rejects searxng urls with query parameters', async () => {
    const response = await putWebsearch({
      providers: {
        searxng: {
          url: 'https://search.example.com/search?format=json',
        },
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        'Invalid value for providers.searxng.url. Must be an http(s) base URL without credentials, query, or hash.',
    });
  });

  it('rejects credential-bearing searxng urls', async () => {
    const response = await putWebsearch({
      providers: {
        searxng: {
          url: 'https://user:pass@search.example.com',
        },
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        'Invalid value for providers.searxng.url. Must be an http(s) base URL without credentials, query, or hash.',
    });
  });

  it('rejects non-number searxng max_results values', async () => {
    const response = await putWebsearch({
      providers: {
        searxng: {
          max_results: '5',
        },
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid value for providers.searxng.max_results. Must be a number.',
    });
  });
});
