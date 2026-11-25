import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as http from 'node:http';
import {
  Agent,
  Dispatcher,
  ProxyAgent,
  fetch as undiciFetch,
  getGlobalDispatcher,
  setGlobalDispatcher,
} from 'undici';
import {
  applyGlobalFetchProxy,
  createGlobalFetchProxyDispatcher,
} from '../../../src/utils/fetch-proxy-setup';

const PROXY_ENV_KEYS = [
  'http_proxy',
  'HTTP_PROXY',
  'https_proxy',
  'HTTPS_PROXY',
  'all_proxy',
  'ALL_PROXY',
  'no_proxy',
  'NO_PROXY',
] as const;

describe('global fetch proxy setup', () => {
  const originalEnv = new Map<string, string | undefined>();
  const originalFetch = globalThis.fetch;
  const originalDispatcher = getGlobalDispatcher();
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    setGlobalDispatcher(originalDispatcher);
    for (const key of PROXY_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(async () => {
    const activeDispatcher = getGlobalDispatcher();
    globalThis.fetch = originalFetch;
    setGlobalDispatcher(originalDispatcher);
    if (activeDispatcher !== originalDispatcher) {
      await activeDispatcher.close();
    }
    for (const key of PROXY_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function captureDispatchRouting(
    origin: string
  ): Promise<{ directCalls: number; proxyCalls: number }> {
    const dispatcher = createGlobalFetchProxyDispatcher();
    if (!dispatcher) {
      throw new Error('Expected proxy dispatcher to be configured');
    }

    let directCalls = 0;
    let proxyCalls = 0;
    const originalAgentDispatch = Agent.prototype.dispatch;
    const originalProxyDispatch = ProxyAgent.prototype.dispatch;

    Agent.prototype.dispatch = function mockAgentDispatch(
      _options: Dispatcher.DispatchOptions,
      _handler: Dispatcher.DispatchHandlers
    ): boolean {
      directCalls += 1;
      return true;
    };

    ProxyAgent.prototype.dispatch = function mockProxyDispatch(
      _options: Dispatcher.DispatchOptions,
      _handler: Dispatcher.DispatchHandlers
    ): boolean {
      proxyCalls += 1;
      return true;
    };

    try {
      dispatcher.dispatch(
        {
          origin,
          method: 'GET',
          path: '/',
        } as Dispatcher.DispatchOptions,
        {} as Dispatcher.DispatchHandlers
      );
    } finally {
      Agent.prototype.dispatch = originalAgentDispatch;
      ProxyAgent.prototype.dispatch = originalProxyDispatch;
    }

    return { directCalls, proxyCalls };
  }

  it('does not fail when proxy configuration is invalid', () => {
    process.env.HTTP_PROXY = 'not-a-valid-url';

    expect(applyGlobalFetchProxy()).toEqual({
      enabled: false,
      error: 'Invalid URL',
    });
  });

  it('rejects unsupported proxy protocols for global fetch setup', () => {
    process.env.ALL_PROXY = 'socks5://proxy:1080';

    expect(applyGlobalFetchProxy()).toEqual({
      enabled: false,
      error: 'Unsupported proxy protocol: socks5:',
    });
  });

  it('bypasses loopback fetches even when HTTP_PROXY is set', async () => {
    process.env.HTTP_PROXY = 'http://127.0.0.1:9';

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }

    try {
      const dispatcher = createGlobalFetchProxyDispatcher();
      expect(dispatcher).not.toBeNull();
      const response = await undiciFetch(`http://127.0.0.1:${address.port}/health`, {
        dispatcher: dispatcher!,
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('ok');
      await dispatcher?.close();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('routes non-loopback HTTP requests through HTTP_PROXY', async () => {
    process.env.HTTP_PROXY = 'http://proxy.example:8080';

    const result = await captureDispatchRouting('http://example.com/quota');
    expect(result).toEqual({ directCalls: 0, proxyCalls: 1 });
  });

  it('applies the proxy transport only when explicitly invoked', () => {
    process.env.HTTP_PROXY = 'http://proxy.example:8080';

    expect(globalThis.fetch).toBe(originalFetch);
    expect(applyGlobalFetchProxy()).toEqual({ enabled: true });
    expect<unknown>(globalThis.fetch).toBe(undiciFetch);
    expect(getGlobalDispatcher()).not.toBe(originalDispatcher);
  });

  it('routes HTTPS requests through HTTPS_PROXY', async () => {
    process.env.HTTPS_PROXY = 'http://proxy.example:8443';

    const result = await captureDispatchRouting('https://example.com/secure');
    expect(result).toEqual({ directCalls: 0, proxyCalls: 1 });
  });

  it('supports ALL_PROXY as a fetch proxy fallback', async () => {
    process.env.ALL_PROXY = 'http://proxy.example:8080';

    const result = await captureDispatchRouting('http://example.com/all-proxy');
    expect(result).toEqual({ directCalls: 0, proxyCalls: 1 });
  });

  it('falls back to ALL_PROXY when HTTP_PROXY is invalid', async () => {
    process.env.HTTP_PROXY = 'not-a-valid-url';
    process.env.ALL_PROXY = 'http://proxy.example:8080';

    const result = await captureDispatchRouting('http://example.com/fallback');
    expect(result).toEqual({ directCalls: 0, proxyCalls: 1 });
  });

  it('falls back from invalid HTTPS_PROXY to HTTP_PROXY for HTTPS requests', async () => {
    process.env.HTTPS_PROXY = 'not-a-valid-url';
    process.env.HTTP_PROXY = 'http://proxy.example:8080';

    const result = await captureDispatchRouting('https://example.com/fallback-secure');
    expect(result).toEqual({ directCalls: 0, proxyCalls: 1 });
  });

  it('honors NO_PROXY on the fetch routing path', async () => {
    process.env.HTTP_PROXY = 'http://proxy.example:8080';
    process.env.NO_PROXY = 'example.com';

    const result = await captureDispatchRouting('http://example.com/direct');
    expect(result).toEqual({ directCalls: 1, proxyCalls: 0 });
  });
});
