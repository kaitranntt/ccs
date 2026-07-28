import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ProxyTarget } from '../../proxy/proxy-target-resolver';

const localTarget: ProxyTarget = {
  host: '127.0.0.1',
  port: 8317,
  protocol: 'http',
  isRemote: false,
};
const remoteTarget: ProxyTarget = {
  host: 'proxy.example.com',
  port: 443,
  protocol: 'https',
  isRemote: true,
};

describe('CLIProxy retry settings service', () => {
  let target: ProxyTarget;
  let config: { cliproxy?: { retry?: { request_retry?: number; max_retry_interval?: number } } };
  let regenerateMock: ReturnType<typeof mock>;
  let fetchRetryMock: ReturnType<typeof mock>;

  beforeEach(() => {
    target = localTarget;
    config = { cliproxy: { retry: { request_retry: 1, max_retry_interval: 10 } } };
    regenerateMock = mock(() => '/tmp/config.yaml');
    fetchRetryMock = mock();

    mock.module('../../config/generator', () => ({ regenerateConfig: regenerateMock }));
    mock.module('../../config/path-resolver', () => ({
      getAuthDir: () => '/tmp/auth',
      getConfigPathForPort: () => '/tmp/config.yaml',
    }));
    mock.module('../../../config/config-loader-facade', () => ({
      loadOrCreateUnifiedConfig: () => structuredClone(config),
      mutateConfig: (mutator: (value: typeof config) => void) => {
        mutator(config);
        return structuredClone(config);
      },
    }));
    mock.module('../routing-strategy-http', () => ({
      getCliproxyRoutingTarget: () => target,
      fetchCliproxyRetryResponse: fetchRetryMock,
      getRoutingErrorMessage: async (response: Response, fallback: string) => {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        return body?.error ?? fallback;
      },
    }));
  });

  afterEach(() => mock.restore());

  async function loadService() {
    return import(`../retry-settings?test=${Date.now()}-${Math.random()}`) as Promise<
      typeof import('../retry-settings')
    >;
  }

  it('reads both official management endpoints as one live state', async () => {
    fetchRetryMock.mockImplementation(
      async (_target: ProxyTarget, setting: string) =>
        new Response(JSON.stringify({ [setting]: setting === 'request-retry' ? 3 : 30 }))
    );
    const { readCliproxyRetryState } = await loadService();

    await expect(readCliproxyRetryState()).resolves.toEqual({
      request_retry: 3,
      max_retry_interval: 30,
      source: 'live',
      target: 'local',
      reachable: true,
      manageable: true,
    });
    expect(fetchRetryMock.mock.calls.map((call) => call[1])).toEqual([
      'request-retry',
      'max-retry-interval',
    ]);
  });

  it('keeps remote updates live-only', async () => {
    target = remoteTarget;
    fetchRetryMock.mockImplementation(
      async (_target: ProxyTarget, setting: string, method: string) =>
        method === 'GET'
          ? new Response(JSON.stringify({ [setting]: setting === 'request-retry' ? 1 : 10 }))
          : new Response('{}')
    );
    const { applyCliproxyRetrySettings } = await loadService();

    const result = await applyCliproxyRetrySettings({
      request_retry: 4,
      max_retry_interval: 40,
    });

    expect(result.applied).toBe('live');
    expect(config.cliproxy?.retry).toEqual({ request_retry: 1, max_retry_interval: 10 });
    expect(regenerateMock).not.toHaveBeenCalled();
  });

  it('rolls back the first upstream value when the second PUT fails', async () => {
    target = remoteTarget;
    const puts: Array<[string, number]> = [];
    fetchRetryMock.mockImplementation(
      async (_target: ProxyTarget, setting: string, method: string, value?: number) => {
        if (method === 'GET') {
          return new Response(JSON.stringify({ [setting]: setting === 'request-retry' ? 2 : 20 }));
        }
        puts.push([setting, value as number]);
        if (setting === 'max-retry-interval') {
          return new Response(JSON.stringify({ error: 'second write failed' }), { status: 500 });
        }
        return new Response('{}');
      }
    );
    const { applyCliproxyRetrySettings } = await loadService();

    await expect(
      applyCliproxyRetrySettings({ request_retry: 5, max_retry_interval: 50 })
    ).rejects.toThrow('second write failed');
    expect(puts).toEqual([
      ['request-retry', 5],
      ['max-retry-interval', 50],
      ['request-retry', 2],
    ]);
  });

  it('restores local persisted settings when regeneration fails', async () => {
    fetchRetryMock.mockRejectedValue(new Error('offline'));
    regenerateMock
      .mockImplementationOnce(() => {
        throw new Error('write failed');
      })
      .mockImplementationOnce(() => '/tmp/config.yaml');
    const { applyCliproxyRetrySettings } = await loadService();

    await expect(
      applyCliproxyRetrySettings({ request_retry: 9, max_retry_interval: 90 })
    ).rejects.toThrow('Saved retry settings were rolled back');
    expect(config.cliproxy?.retry).toEqual({ request_retry: 1, max_retry_interval: 10 });
    expect(regenerateMock).toHaveBeenCalledTimes(2);
  });

  it('serializes complete pair operations', async () => {
    target = remoteTarget;
    const events: string[] = [];
    let releaseFirstRead: (() => void) | undefined;
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    let requestReadCount = 0;
    fetchRetryMock.mockImplementation(
      async (_target: ProxyTarget, setting: string, method: string, value?: number) => {
        events.push(`${method}:${setting}:${value ?? ''}`);
        if (method === 'GET' && setting === 'request-retry' && requestReadCount++ === 0) {
          await firstReadGate;
        }
        return method === 'GET'
          ? new Response(JSON.stringify({ [setting]: setting === 'request-retry' ? 1 : 10 }))
          : new Response('{}');
      }
    );
    const { applyCliproxyRetrySettings } = await loadService();

    const first = applyCliproxyRetrySettings({ request_retry: 2, max_retry_interval: 20 });
    const second = applyCliproxyRetrySettings({ request_retry: 3, max_retry_interval: 30 });
    await Promise.resolve();
    expect(events).toEqual(['GET:request-retry:']);
    releaseFirstRead?.();
    await Promise.all([first, second]);

    expect(events).toEqual([
      'GET:request-retry:',
      'GET:max-retry-interval:',
      'PUT:request-retry:2',
      'PUT:max-retry-interval:20',
      'GET:request-retry:',
      'GET:max-retry-interval:',
      'PUT:request-retry:3',
      'PUT:max-retry-interval:30',
    ]);
  });
});
