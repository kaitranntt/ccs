import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { fetchRemoteAuthStatus } from '../../services/remote-auth-fetcher';
import type { ProxyTarget } from '../../proxy/proxy-target-resolver';

describe('remote-auth-fetcher', () => {
  let originalFetch: typeof fetch;

  const remoteTarget: ProxyTarget = {
    host: 'remote.example.com',
    port: 8317,
    protocol: 'https',
    authToken: 'token',
    isRemote: true,
  };

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('includes provider on each remote account', async () => {
    global.fetch = mock((url: string) => {
      expect(url).toBe('https://remote.example.com:8317/v0/management/auth-files');
      return Promise.resolve(
        new Response(
          JSON.stringify({
            files: [
              {
                id: 'acc-codex',
                name: 'codex-main',
                type: 'oauth',
                provider: 'codex',
                email: 'codex@example.com',
                status: 'active',
                source: 'file',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );
    }) as unknown as typeof fetch;

    const result = await fetchRemoteAuthStatus(remoteTarget);

    expect(result).toHaveLength(1);
    expect(result[0]?.provider).toBe('codex');
    expect(result[0]?.accounts).toHaveLength(1);
    expect(result[0]?.accounts[0]?.provider).toBe('codex');
    expect(result[0]?.accounts[0]?.email).toBe('codex@example.com');
  });
});
