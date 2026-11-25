import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import type { Server } from 'http';
import profileRoutes from '../../../src/web-server/routes/profile-routes';

describe('profile-routes local runtime readiness', () => {
  let server: Server;
  let baseUrl = '';
  let forcedRemoteAddress = '127.0.0.1';
  let originalDashboardAuthEnabled: string | undefined;
  const originalFetch = globalThis.fetch;

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
    originalDashboardAuthEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
    process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
    forcedRemoteAddress = '127.0.0.1';

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.startsWith(baseUrl)) {
        return originalFetch(input);
      }

      if (url.includes('11434/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'gemma4:e4b' }, { name: 'qwen3-coder:latest' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.includes('8080/v1/models')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalDashboardAuthEnabled !== undefined) {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = originalDashboardAuthEnabled;
    } else {
      delete process.env.CCS_DASHBOARD_AUTH_ENABLED;
    }
  });

  it('reports local runtimes as ready when their endpoints respond with models', async () => {
    const response = await fetch(`${baseUrl}/api/profiles/local-runtime-readiness`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      runtimes: Array<{
        id: string;
        status: string;
        recommendedModelInstalled: boolean;
      }>;
    };

    expect(body.runtimes).toHaveLength(2);
    expect(body.runtimes).toContainEqual(
      expect.objectContaining({
        id: 'ollama',
        status: 'ready',
        recommendedModelInstalled: true,
      })
    );
    expect(body.runtimes).toContainEqual(
      expect.objectContaining({
        id: 'llamacpp',
        status: 'ready',
      })
    );
  });

  it('blocks remote readiness probes when dashboard auth is disabled', async () => {
    let probeCount = 0;
    forcedRemoteAddress = '10.10.0.24';
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) {
        return originalFetch(input);
      }
      probeCount += 1;
      return new Response(JSON.stringify({ models: [{ name: 'gemma4:e4b' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const response = await fetch(`${baseUrl}/api/profiles/local-runtime-readiness`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Local runtime readiness requires localhost access when dashboard auth is disabled.',
    });
    expect(probeCount).toBe(0);
  });

  it('reports setup guidance when local endpoints are unavailable', async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) {
        return originalFetch(input);
      }
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;

    const response = await fetch(`${baseUrl}/api/profiles/local-runtime-readiness`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      runtimes: Array<{
        id: string;
        status: string;
        commandHint: string;
      }>;
    };

    expect(body.runtimes).toContainEqual(
      expect.objectContaining({
        id: 'ollama',
        status: 'offline',
        commandHint: 'ollama serve',
      })
    );
    expect(body.runtimes).toContainEqual(
      expect.objectContaining({
        id: 'llamacpp',
        status: 'offline',
        commandHint: './server --host 0.0.0.0 --port 8080 -m model.gguf',
      })
    );
  });
});
