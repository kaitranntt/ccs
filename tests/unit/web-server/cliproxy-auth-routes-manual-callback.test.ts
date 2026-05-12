import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import type { Server } from 'http';
import cliproxyAuthRoutes from '../../../src/web-server/routes/cliproxy-auth-routes';
import {
  clearQuotaCache,
  getCachedQuota,
  setCachedQuota,
} from '../../../src/cliproxy/quota/quota-response-cache';
import { restoreFetch, mockFetch, getCapturedFetchRequests } from '../../mocks';

describe('cliproxy-auth-routes manual callback nickname persistence', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/cliproxy/auth', cliproxyAuthRoutes);

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
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-manual-callback-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    restoreFetch();
    clearQuotaCache();

    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }

    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  async function postJson(route: string, body: Record<string, unknown>) {
    return await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const payload = JSON.stringify(body);
      const url = new URL(`${baseUrl}${route}`);
      const request = http.request(
        {
          method: 'POST',
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (response) => {
          let responseBody = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            responseBody += chunk;
          });
          response.on('end', () => {
            resolve({
              status: response.statusCode || 0,
              body: responseBody ? JSON.parse(responseBody) : null,
            });
          });
        }
      );

      request.on('error', reject);
      request.write(payload);
      request.end();
    });
  }

  async function getJson(route: string) {
    return await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const url = new URL(`${baseUrl}${route}`);
      const request = http.request(
        {
          method: 'GET',
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}`,
        },
        (response) => {
          let responseBody = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            responseBody += chunk;
          });
          response.on('end', () => {
            resolve({
              status: response.statusCode || 0,
              body: responseBody ? JSON.parse(responseBody) : null,
            });
          });
        }
      );

      request.on('error', reject);
      request.end();
    });
  }

  it('persists the supplied nickname for Kiro social start-url flows after callback submission', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/kiro-auth-url\?is_webui=true&method=google$/,
        response: {
          auth_url: 'https://auth.example.com/authorize?state=state-123',
          state: 'state-123',
        },
      },
      {
        url: /\/v0\/management\/oauth-callback$/,
        method: 'POST',
        response: { status: 'ok' },
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/kiro/start-url', {
      nickname: 'work',
      kiroMethod: 'google',
    });
    expect(startResponse.status).toBe(200);

    const tokenDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(tokenDir, 'kiro-github-ABC123.json'),
      JSON.stringify({ type: 'kiro' }),
      'utf8'
    );

    const callbackResponse = await postJson('/api/cliproxy/auth/kiro/submit-callback', {
      redirectUrl: 'http://localhost/callback?code=abc123&state=state-123',
    });

    expect(callbackResponse.status).toBe(200);

    const registryPath = path.join(tempHome, '.ccs', 'cliproxy', 'accounts.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      providers: {
        kiro: {
          accounts: Record<string, { nickname?: string }>;
        };
      };
    };

    expect(registry.providers.kiro.accounts['github-ABC123']?.nickname).toBe('work');
  });

  it('starts Cursor auth through the browser URL management endpoint', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/cursor-auth-url\?is_webui=true$/,
        response: {
          url: 'https://cursor.com/loginDeepControl?state=cursor-state',
          state: 'cursor-state',
        },
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/cursor/start-url', {
      nickname: 'work',
    });

    expect(startResponse.status).toBe(200);
    expect(startResponse.body).toEqual({
      success: true,
      authUrl: 'https://cursor.com/loginDeepControl?state=cursor-state',
      state: 'cursor-state',
      method: null,
    });

    const requests = getCapturedFetchRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain('/v0/management/cursor-auth-url?is_webui=true');
  });

  it('returns actionable Codex guidance when manual OAuth start cannot reach CLIProxy', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/codex-auth-url\?is_webui=true$/,
        status: 503,
        response: 'connect ECONNREFUSED 127.0.0.1:8317',
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/codex/start-url', {});

    expect(startResponse.status).toBe(503);
    expect(startResponse.body).toMatchObject({
      error: 'cliproxy_oauth_start_failed',
      provider: 'codex',
      message: expect.stringContaining('OpenAI Codex OAuth could not start'),
      endpoint: 'http://127.0.0.1:8317/v0/management/codex-auth-url?is_webui=true',
      retryCommand: 'ccs codex --auth --paste-callback',
      portForwardCommand: 'ssh -L 1455:localhost:1455 <USER>@<HOST>',
    });
    expect(
      (startResponse.body as { hints?: string[] }).hints?.some((hint) =>
        hint.includes('ccs codex --auth --port-forward')
      )
    ).toBe(true);
  });

  it('does not label malformed OAuth start responses as proxy recovery guidance', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/codex-auth-url\?is_webui=true$/,
        response: 'not-json',
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/codex/start-url', {});

    expect(startResponse.status).toBe(502);
    expect(startResponse.body).toMatchObject({
      error: 'cliproxy_oauth_start_invalid_response',
      provider: 'codex',
      message: 'CLIProxyAPI returned an invalid OAuth start response.',
    });
    expect((startResponse.body as { hints?: string[] }).hints).toBeUndefined();
  });

  it('returns wait after callback submission when the local token is not yet available', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/codex-auth-url\?is_webui=true$/,
        response: {
          auth_url: 'https://auth.example.com/authorize?state=state-callback-wait',
          state: 'state-callback-wait',
        },
      },
      {
        url: /\/v0\/management\/oauth-callback$/,
        method: 'POST',
        response: { status: 'ok' },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-callback-wait$/,
        response: { status: 'ok' },
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/codex/start-url', {});
    expect(startResponse.status).toBe(200);

    const realDateNow = Date.now;
    let now = realDateNow();
    Date.now = () => now;
    try {
      const callbackResponse = await postJson('/api/cliproxy/auth/codex/submit-callback', {
        redirectUrl: 'http://localhost/callback?code=abc123&state=state-callback-wait',
      });

      expect(callbackResponse.status).toBe(200);
      expect(callbackResponse.body).toEqual({ status: 'wait' });

      now += 16_000;

      const statusResponse = await getJson(
        '/api/cliproxy/auth/codex/status?state=state-callback-wait'
      );

      expect(statusResponse.status).toBe(409);
      expect(statusResponse.body).toEqual({
        status: 'error',
        error:
          'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.',
      });
    } finally {
      Date.now = realDateNow;
    }
  });

  it('keeps polling briefly after upstream completion before surfacing the missing-token error', async () => {
    const tokenDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(tokenDir, 'codex-existing@example.com.json'),
      JSON.stringify({ type: 'codex', email: 'existing@example.com' }),
      'utf8'
    );

    mockFetch([
      {
        url: /\/v0\/management\/codex-auth-url\?is_webui=true$/,
        response: {
          auth_url: 'https://auth.example.com/authorize?state=state-status-missing',
          state: 'state-status-missing',
        },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-status-missing$/,
        response: { status: 'ok' },
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/codex/start-url', {});
    expect(startResponse.status).toBe(200);

    const realDateNow = Date.now;
    let now = realDateNow();
    Date.now = () => now;
    try {
      const firstStatusResponse = await getJson(
        '/api/cliproxy/auth/codex/status?state=state-status-missing'
      );

      expect(firstStatusResponse.status).toBe(200);
      expect(firstStatusResponse.body).toEqual({ status: 'wait' });

      now += 16_000;

      const secondStatusResponse = await getJson(
        '/api/cliproxy/auth/codex/status?state=state-status-missing'
      );

      expect(secondStatusResponse.status).toBe(409);
      expect(secondStatusResponse.body).toEqual({
        status: 'error',
        error:
          'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.',
      });
    } finally {
      Date.now = realDateNow;
    }
  });

  it('continues polling until the local token appears after upstream completion', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/codex-auth-url\?is_webui=true$/,
        response: {
          auth_url: 'https://auth.example.com/authorize?state=state-status-delayed',
          state: 'state-status-delayed',
        },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-status-delayed$/,
        response: { status: 'ok' },
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/codex/start-url', {});
    expect(startResponse.status).toBe(200);

    const firstStatusResponse = await getJson(
      '/api/cliproxy/auth/codex/status?state=state-status-delayed'
    );

    expect(firstStatusResponse.status).toBe(200);
    expect(firstStatusResponse.body).toEqual({ status: 'wait' });

    const tokenDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(tokenDir, 'codex-delayed@example.com.json'),
      JSON.stringify({ type: 'codex', email: 'delayed@example.com' }),
      'utf8'
    );

    const secondStatusResponse = await getJson(
      '/api/cliproxy/auth/codex/status?state=state-status-delayed'
    );

    expect(secondStatusResponse.status).toBe(200);
    expect(secondStatusResponse.body).toEqual({
      status: 'ok',
      account: {
        id: 'delayed@example.com',
        email: 'delayed@example.com',
        nickname: 'delayed',
        provider: 'codex',
        isDefault: true,
      },
    });
  });

  it('lets polling finish successfully after callback submission once the token appears', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/codex-auth-url\?is_webui=true$/,
        response: {
          auth_url: 'https://auth.example.com/authorize?state=state-callback-delayed',
          state: 'state-callback-delayed',
        },
      },
      {
        url: /\/v0\/management\/oauth-callback$/,
        method: 'POST',
        response: { status: 'ok' },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-callback-delayed$/,
        response: { status: 'ok' },
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/codex/start-url', {});
    expect(startResponse.status).toBe(200);

    const callbackResponse = await postJson('/api/cliproxy/auth/codex/submit-callback', {
      redirectUrl: 'http://localhost/callback?code=abc123&state=state-callback-delayed',
    });

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.body).toEqual({ status: 'wait' });

    const tokenDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(tokenDir, 'codex-callback@example.com.json'),
      JSON.stringify({ type: 'codex', email: 'callback@example.com' }),
      'utf8'
    );

    const statusResponse = await getJson(
      '/api/cliproxy/auth/codex/status?state=state-callback-delayed'
    );

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toEqual({
      status: 'ok',
      account: {
        id: 'callback@example.com',
        email: 'callback@example.com',
        nickname: 'callback',
        provider: 'codex',
        isDefault: true,
      },
    });
  });

  it('keeps the pending auth state alive through the local-token grace window even near TTL expiry', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/codex-auth-url\?is_webui=true$/,
        response: {
          auth_url: 'https://auth.example.com/authorize?state=state-ttl-grace',
          state: 'state-ttl-grace',
        },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-ttl-grace$/,
        response: { status: 'ok' },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-ttl-grace$/,
        response: { status: 'ok' },
      },
    ]);

    const realDateNow = Date.now;
    let now = realDateNow();
    Date.now = () => now;
    try {
      const startResponse = await postJson('/api/cliproxy/auth/codex/start-url', {});
      expect(startResponse.status).toBe(200);

      now += 10 * 60 * 1000 - 1_000;

      const firstStatusResponse = await getJson(
        '/api/cliproxy/auth/codex/status?state=state-ttl-grace'
      );

      expect(firstStatusResponse.status).toBe(200);
      expect(firstStatusResponse.body).toEqual({ status: 'wait' });

      const tokenDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
      fs.mkdirSync(tokenDir, { recursive: true });
      fs.writeFileSync(
        path.join(tokenDir, 'codex-ttl@example.com.json'),
        JSON.stringify({ type: 'codex', email: 'ttl@example.com' }),
        'utf8'
      );

      now += 2_000;

      const secondStatusResponse = await getJson(
        '/api/cliproxy/auth/codex/status?state=state-ttl-grace'
      );

      expect(secondStatusResponse.status).toBe(200);
      expect(secondStatusResponse.body).toEqual({
        status: 'ok',
        account: {
          id: 'ttl@example.com',
          email: 'ttl@example.com',
          nickname: 'ttl',
          provider: 'codex',
          isDefault: true,
        },
      });
    } finally {
      Date.now = realDateNow;
    }
  });

  it('does not treat rewrites of pre-existing token files as a newly added account', async () => {
    const tokenDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(tokenDir, { recursive: true });
    const tokenPath = path.join(tokenDir, 'codex-existing@example.com.json');
    fs.writeFileSync(
      tokenPath,
      JSON.stringify({ type: 'codex', email: 'existing@example.com', version: 1 }),
      'utf8'
    );

    mockFetch([
      {
        url: /\/v0\/management\/codex-auth-url\?is_webui=true$/,
        response: {
          auth_url: 'https://auth.example.com/authorize?state=state-existing-rewrite',
          state: 'state-existing-rewrite',
        },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-existing-rewrite$/,
        response: { status: 'ok' },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-existing-rewrite$/,
        response: { status: 'ok' },
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/codex/start-url', {});
    expect(startResponse.status).toBe(200);

    fs.writeFileSync(
      tokenPath,
      JSON.stringify({ type: 'codex', email: 'existing@example.com', version: 2 }),
      'utf8'
    );

    const realDateNow = Date.now;
    let now = realDateNow();
    Date.now = () => now;
    try {
      const firstStatusResponse = await getJson(
        '/api/cliproxy/auth/codex/status?state=state-existing-rewrite'
      );

      expect(firstStatusResponse.status).toBe(200);
      expect(firstStatusResponse.body).toEqual({ status: 'wait' });

      now += 16_000;

      const secondStatusResponse = await getJson(
        '/api/cliproxy/auth/codex/status?state=state-existing-rewrite'
      );

      expect(secondStatusResponse.status).toBe(409);
      expect(secondStatusResponse.body).toEqual({
        status: 'error',
        error:
          'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.',
      });
    } finally {
      Date.now = realDateNow;
    }
  });

  it('registers the new account before reporting polled auth success', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/codex-auth-url\?is_webui=true$/,
        response: {
          auth_url: 'https://auth.example.com/authorize?state=state-status-ok',
          state: 'state-status-ok',
        },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-status-ok$/,
        response: { status: 'ok' },
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/codex/start-url', {});
    expect(startResponse.status).toBe(200);

    const tokenDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(tokenDir, 'codex-new@example.com.json'),
      JSON.stringify({ type: 'codex', email: 'new@example.com' }),
      'utf8'
    );

    const statusResponse = await getJson('/api/cliproxy/auth/codex/status?state=state-status-ok');

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toEqual({
      status: 'ok',
      account: {
        id: 'new@example.com',
        email: 'new@example.com',
        nickname: 'new',
        provider: 'codex',
        isDefault: true,
      },
    });

    const registryPath = path.join(tempHome, '.ccs', 'cliproxy', 'accounts.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      providers: {
        codex: {
          accounts: Record<string, { email?: string }>;
        };
      };
    };

    expect(registry.providers.codex.accounts['new@example.com']?.email).toBe('new@example.com');
  });

  it('clears stale Claude quota cache after polling auth success', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/anthropic-auth-url\?is_webui=true$/,
        response: {
          auth_url: 'https://auth.example.com/authorize?state=state-claude-cache-clear',
          state: 'state-claude-cache-clear',
        },
      },
      {
        url: /\/v0\/management\/get-auth-status\?state=state-claude-cache-clear$/,
        response: { status: 'ok' },
      },
    ]);

    const startResponse = await postJson('/api/cliproxy/auth/claude/start-url', {});
    expect(startResponse.status).toBe(200);

    const accountId = 'claude-team@example.com';
    setCachedQuota('claude', accountId, {
      success: false,
      error: 'Authentication required for policy limits',
      needsReauth: true,
    });
    expect(getCachedQuota('claude', accountId)).not.toBeNull();

    const tokenDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(tokenDir, 'claude-claude-team@example.com.json'),
      JSON.stringify({
        type: 'claude',
        email: accountId,
        access_token: 'fresh-token',
        refresh_token: 'refresh-token',
        expired: '2099-01-01T00:00:00.000Z',
      }),
      'utf8'
    );

    const statusResponse = await getJson(
      '/api/cliproxy/auth/claude/status?state=state-claude-cache-clear'
    );

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toEqual({
      status: 'ok',
      account: {
        id: accountId,
        email: accountId,
        nickname: 'claude-team',
        provider: 'claude',
        isDefault: true,
      },
    });
    expect(getCachedQuota('claude', accountId)).toBeNull();
  });
});
