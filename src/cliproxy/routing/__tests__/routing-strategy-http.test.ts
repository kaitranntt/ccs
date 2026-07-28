import * as https from 'https';
import { describe, expect, it, mock, spyOn } from 'bun:test';
import type { ProxyTarget } from '../../proxy/proxy-target-resolver';

async function loadRoutingHttpModule() {
  return import(`../routing-strategy-http?test=${Date.now()}-${Math.random()}`) as Promise<
    typeof import('../routing-strategy-http')
  >;
}

describe('routing-strategy-http', () => {
  it('builds the local management URL for routing strategy reads', async () => {
    const { getCliproxyRoutingManagementUrl } = await loadRoutingHttpModule();
    const target: ProxyTarget = {
      host: '127.0.0.1',
      port: 8317,
      protocol: 'http',
      isRemote: false,
    };

    expect(getCliproxyRoutingManagementUrl(target)).toBe(
      'http://127.0.0.1:8317/v0/management/routing/strategy'
    );
  });

  it('rejects malformed self-signed HTTPS URLs before arming the request timeout', async () => {
    const { fetchCliproxyRoutingResponse } = await loadRoutingHttpModule();
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = mock(((handler: TimerHandler, timeout?: number) => {
      void handler;
      void timeout;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const target: ProxyTarget = {
      host: 'bad host',
      port: 443,
      protocol: 'https',
      allowSelfSigned: true,
      isRemote: true,
    };

    try {
      await expect(fetchCliproxyRoutingResponse(target, 'GET')).rejects.toThrow();
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('clears the request timeout when https.request throws synchronously', async () => {
    const { fetchCliproxyRoutingResponse } = await loadRoutingHttpModule();
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const activeTimers = new Set<number>();

    globalThis.setTimeout = mock(((handler: TimerHandler, timeout?: number) => {
      void handler;
      void timeout;
      const timerId = activeTimers.size + 1;
      activeTimers.add(timerId);
      return timerId as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    globalThis.clearTimeout = mock(((timerId?: ReturnType<typeof setTimeout>) => {
      activeTimers.delete(timerId as unknown as number);
    }) as typeof clearTimeout);
    const requestSpy = spyOn(https, 'request').mockImplementation(() => {
      throw new Error('sync request failure');
    });

    const target: ProxyTarget = {
      host: 'proxy.example.com',
      port: 443,
      protocol: 'https',
      allowSelfSigned: true,
      isRemote: true,
    };

    try {
      await expect(fetchCliproxyRoutingResponse(target, 'GET')).rejects.toThrow(
        'sync request failure'
      );
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.clearTimeout).toHaveBeenCalledTimes(1);
      expect(activeTimers.size).toBe(0);
    } finally {
      requestSpy.mockRestore();
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('builds the remote management URL for routing strategy writes', async () => {
    const { getCliproxyRoutingManagementUrl } = await loadRoutingHttpModule();
    const target: ProxyTarget = {
      host: 'proxy.example.com',
      port: 443,
      protocol: 'https',
      allowSelfSigned: true,
      isRemote: true,
    };

    expect(getCliproxyRoutingManagementUrl(target)).toBe(
      'https://proxy.example.com:443/v0/management/routing/strategy'
    );
  });

  it('builds target-aware retry management URLs', async () => {
    const { getCliproxyRetryManagementUrl } = await loadRoutingHttpModule();
    const target: ProxyTarget = {
      host: 'proxy.example.com',
      port: 443,
      protocol: 'https',
      isRemote: true,
    };

    expect(getCliproxyRetryManagementUrl(target, 'request-retry')).toBe(
      'https://proxy.example.com:443/v0/management/request-retry'
    );
    expect(getCliproxyRetryManagementUrl(target, 'max-retry-interval')).toBe(
      'https://proxy.example.com:443/v0/management/max-retry-interval'
    );
  });

  it('sends retry updates as an integer value payload', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () => new Response('{}'));
    globalThis.fetch = fetchMock as typeof fetch;
    const target: ProxyTarget = {
      host: '127.0.0.1',
      port: 8317,
      protocol: 'http',
      isRemote: false,
    };

    try {
      const { fetchCliproxyRetryResponse } = await loadRoutingHttpModule();
      await fetchCliproxyRetryResponse(target, 'request-retry', 'PUT', 4);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8317/v0/management/request-retry',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ value: 4 }) })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
