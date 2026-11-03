import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runWithScopedCcsHome } from '../../../utils/config-manager';
import { createClaudePoolManagementApi } from '../claude-pool-policy-api';

const originalFetch = globalThis.fetch;
const target = { host: '127.0.0.1', port: 8317, protocol: 'http' as const, isRemote: false };

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function isolated(operation: () => Promise<void>): Promise<void> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-pool-api-'));
  try {
    await runWithScopedCcsHome(home, operation);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

describe('Claude pool management adapter', () => {
  it('requires explicit selector, affinity and atomic-update capabilities', async () =>
    isolated(async () => {
      const api = createClaudePoolManagementApi(target);
      for (const value of [
        {},
        { provider_affinity_overrides: true, local_builtin_selector: true },
        {
          provider_affinity_overrides: true,
          local_builtin_selector: false,
          credential_priority_cas: true,
        },
      ]) {
        globalThis.fetch = (async () => Response.json(value)) as typeof fetch;
        await expect(api.checkCapabilities()).rejects.toThrow('requires');
      }
      globalThis.fetch = (async () =>
        Response.json({
          provider_affinity_overrides: true,
          local_builtin_selector: true,
          credential_priority_cas: true,
        })) as typeof fetch;
      await api.checkCapabilities();
    }));

  it('sends atomic exact expected/current values exclusively to the v8 priority endpoint', async () =>
    isolated(async () => {
      const requests: Array<{ url: string; method?: string; body: unknown }> = [];
      globalThis.fetch = (async (input, options) => {
        requests.push({
          url: String(input),
          method: options?.method,
          body: JSON.parse(String(options?.body)),
        });
        return Response.json({ status: 'ok' });
      }) as typeof fetch;
      const api = createClaudePoolManagementApi(target);
      await api.setPriority('synthetic.json', 4, null);
      await api.setPriority('synthetic.json', null, 4);
      await api.setPriority('synthetic.json', 0, -7);
      expect(requests.map((request) => request.url)).toEqual(
        Array(3).fill('http://127.0.0.1:8317/v8/management/credentials/priority')
      );
      expect(requests.map((request) => request.body)).toEqual([
        { name: 'synthetic.json', priority: 4, expected_priority: null },
        { name: 'synthetic.json', priority: null, expected_priority: 4 },
        { name: 'synthetic.json', priority: 0, expected_priority: -7 },
      ]);
      expect(requests.every((request) => request.method === 'PATCH')).toBe(true);
    }));

  it('retains only routing metadata and preserves absent, zero and negative runtime priority', async () =>
    isolated(async () => {
      globalThis.fetch = (async () =>
        Response.json({
          files: [
            { name: 'a.json', ignoredCredentialData: 'synthetic-only' },
            { name: 'b.json', priority: 0 },
            { name: 'c.json', priority: -7 },
          ],
        })) as typeof fetch;
      expect(await createClaudePoolManagementApi(target).listCredentials()).toEqual([
        { name: 'a.json', priority: null },
        { name: 'b.json', priority: 0 },
        { name: 'c.json', priority: -7 },
      ]);
    }));

  it('rejects malformed lists and does not guess a numeric string priority', async () =>
    isolated(async () => {
      const api = createClaudePoolManagementApi(target);
      globalThis.fetch = (async () => Response.json({ files: 'invalid' })) as typeof fetch;
      await expect(api.listCredentials()).rejects.toThrow('Invalid');
      globalThis.fetch = (async () =>
        Response.json({ files: [{ name: 'a.json', priority: '4' }] })) as typeof fetch;
      await expect(api.listCredentials()).rejects.toThrow('Invalid priority');
    }));

  it('reports conflicts without replaying an unconditional update', async () =>
    isolated(async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls++;
        return Response.json({ error: 'changed' }, { status: 409 });
      }) as typeof fetch;
      await expect(
        createClaudePoolManagementApi(target).setPriority('a.json', 4, null)
      ).rejects.toThrow('409');
      expect(calls).toBe(1);
    }));

  it('cancels an in-flight management request and refuses requests after controller stop', async () =>
    isolated(async () => {
      const controller = new AbortController();
      let started = () => {};
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      let calls = 0;
      globalThis.fetch = (async (_input, options) => {
        calls++;
        started();
        return new Promise<Response>((_resolve, reject) => {
          const abort = () => reject(new DOMException('Stopped', 'AbortError'));
          if (options?.signal?.aborted) abort();
          else options?.signal?.addEventListener('abort', abort, { once: true });
        });
      }) as typeof fetch;
      const api = createClaudePoolManagementApi(target, controller.signal);
      const request = api.listCredentials();
      await entered;
      controller.abort();
      await expect(request).rejects.toThrow('management request failed');
      await expect(api.setPriority('a.json', 4, null)).rejects.toThrow('stopping');
      expect(calls).toBe(1);
    }));
});
