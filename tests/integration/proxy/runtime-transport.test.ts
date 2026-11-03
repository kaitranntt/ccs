import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { getGlobalDispatcher } from 'undici';
import {
  closeOpenAICompatProxyServer,
  startOpenAICompatProxyServer,
} from '../../../src/proxy/server/proxy-server';
import type { OpenAICompatProfileConfig } from '../../../src/proxy/profile-router';

const PROXY_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'] as const;

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve listening port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function requestMessages(port: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'sentinel-local-token',
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.once('error', reject);
    req.end(
      JSON.stringify({
        model: 'sentinel-model',
        messages: [{ role: 'user', content: 'hi' }],
      })
    );
  });
}

describe('runtime-aware upstream transport', () => {
  const originalEnv = new Map<string, string | undefined>();
  let ccsHome = '';
  let corporateProxy: http.Server | undefined;
  const fixtureSockets = new Set<import('node:net').Socket>();
  let corporateProxyHits = 0;
  let sawProxyAuthorization = false;
  let proxyServer: http.Server | undefined;

  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    originalEnv.set(
      'CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS',
      process.env.CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS
    );
    process.env.CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS = '500';
    originalEnv.set('CCS_HOME', process.env.CCS_HOME);
    ccsHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-runtime-transport-'));
    process.env.CCS_HOME = ccsHome;
    corporateProxy = undefined;
    fixtureSockets.clear();
    proxyServer = undefined;
    corporateProxyHits = 0;
    sawProxyAuthorization = false;
  });

  afterEach(async () => {
    // Release only sockets owned by these mock servers before awaiting shutdown.
    for (const socket of fixtureSockets) socket.destroy();
    if (proxyServer) {
      await closeOpenAICompatProxyServer(proxyServer, 50);
    }
    if (corporateProxy) {
      const closed = new Promise<void>((resolve) => corporateProxy.close(() => resolve()));
      await closed;
    }
    for (const key of [
      ...PROXY_ENV_KEYS,
      'CCS_HOME',
      'CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS',
    ] as const) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(ccsHome, { recursive: true, force: true });
  });

  it('uses a credentialed proxy and honors NO_PROXY without global fetch mutation', async () => {
    const originalFetch = globalThis.fetch;
    const upstreamPayload = JSON.stringify({
      id: 'chatcmpl_proxy',
      model: 'sentinel-model',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'proxied-ok' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    corporateProxy = http.createServer((req, res) => {
      corporateProxyHits += 1;
      sawProxyAuthorization = String(req.headers['proxy-authorization'] || '').startsWith('Basic ');
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(upstreamPayload),
      });
      res.end(upstreamPayload);
    });
    corporateProxy.on('connection', (socket) => {
      fixtureSockets.add(socket);
      socket.once('close', () => fixtureSockets.delete(socket));
    });
    const corporateProxyPort = await listen(corporateProxy);
    process.env.HTTP_PROXY = `http://sentinel-user:sentinel-password@127.0.0.1:${corporateProxyPort}`;

    const profile: OpenAICompatProfileConfig = {
      profileName: 'sentinel',
      settingsPath: '/tmp/sentinel.settings.json',
      baseUrl: 'http://upstream.invalid/v1',
      apiKey: 'sentinel-api-key-not-real',
      provider: 'generic-chat-completion-api',
      model: 'sentinel-model',
    };
    proxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'sentinel-local-token',
    });
    proxyServer.on('connection', (socket) => {
      fixtureSockets.add(socket);
      socket.once('close', () => fixtureSockets.delete(socket));
    });
    const proxyPort = await new Promise<number>((resolve, reject) => {
      proxyServer.once('error', reject);
      proxyServer.once('listening', () => {
        const address = proxyServer.address();
        if (!address || typeof address === 'string') reject(new Error('Missing proxy port'));
        else resolve(address.port);
      });
    });

    const proxied = await requestMessages(proxyPort);
    expect(proxied.status).toBe(200);
    expect(JSON.parse(proxied.body)).toMatchObject({
      content: [{ type: 'text', text: 'proxied-ok' }],
    });
    expect(corporateProxyHits).toBe(1);
    expect(sawProxyAuthorization).toBe(true);

    process.env.NO_PROXY = 'upstream.invalid';
    const hitsBeforeBypass = corporateProxyHits;
    const bypassed = await requestMessages(proxyPort);
    // NO_PROXY must bypass the fake proxy even when the host's DNS failure is slow.
    // Both DNS rejection and the bounded request timeout are upstream failures.
    expect([502, 504]).toContain(bypassed.status);
    expect(JSON.parse(bypassed.body).type).toBe('error');
    expect(corporateProxyHits).toBe(hitsBeforeBypass);
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('keeps global transport ownership unchanged across overlapping server lifecycles', async () => {
    const originalFetch = globalThis.fetch;
    const originalDispatcher = getGlobalDispatcher();
    const profile: OpenAICompatProfileConfig = {
      profileName: 'sentinel',
      settingsPath: '/tmp/sentinel.settings.json',
      baseUrl: 'http://127.0.0.1:1/v1',
      apiKey: 'sentinel-api-key-not-real',
      provider: 'generic-chat-completion-api',
      model: 'sentinel-model',
    };
    const serverA = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'sentinel-local-token-a',
    });
    const serverB = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'sentinel-local-token-b',
    });

    await Promise.all([
      new Promise<void>((resolve) => serverA.once('listening', resolve)),
      new Promise<void>((resolve) => serverB.once('listening', resolve)),
    ]);
    await closeOpenAICompatProxyServer(serverA, 50);
    expect(serverB.listening).toBe(true);
    expect(globalThis.fetch).toBe(originalFetch);
    expect(getGlobalDispatcher()).toBe(originalDispatcher);

    await closeOpenAICompatProxyServer(serverB, 50);
    expect(globalThis.fetch).toBe(originalFetch);
    expect(getGlobalDispatcher()).toBe(originalDispatcher);
  });
});
