import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { runWithScopedConfigDir } from '../../../utils/config-manager';
import { __testExports, fetchCliproxyStats, fetchCliproxyUsageRaw } from '../stats-fetcher';

const originalFetch = globalThis.fetch;

let ccsDir = '';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

function createCodexQueueRecord() {
  return {
    timestamp: '2026-05-05T18:45:00.000Z',
    provider: 'codex',
    model: 'gpt-5.5',
    alias: 'gpt-5.5',
    source: 'provider=codex auth_file=codex-user@example.com-pro.json',
    auth_index: 'codex-auth',
    tokens: {
      input_tokens: 12,
      output_tokens: 8,
      reasoning_tokens: 0,
      cached_tokens: 3,
      total_tokens: 23,
    },
    failed: false,
  };
}

beforeEach(() => {
  ccsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-stats-fetcher-'));
  __testExports.clearCachedUsageQueueResponse();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  __testExports.clearCachedUsageQueueResponse();
  fs.rmSync(ccsDir, { recursive: true, force: true });
});

describe('fetchCliproxyUsageRaw', () => {
  it('falls back to CLIProxy usage-queue when the legacy aggregate endpoint is unavailable', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requestedUrls.push(url);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        return jsonResponse([createCodexQueueRecord()]);
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const raw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19201));

    expect(requestedUrls.some((url) => url.endsWith('/v0/management/usage'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('/v0/management/usage-queue'))).toBe(true);
    expect(raw?.usage?.total_requests).toBe(1);
    expect(raw?.usage?.success_count).toBe(1);
    expect(raw?.usage?.total_tokens).toBe(23);
    expect(raw?.usage?.apis?.codex.models?.['gpt-5.5'].details?.[0]).toMatchObject({
      source: 'provider=codex auth_file=codex-user@example.com-pro.json',
      auth_index: 'codex-auth',
      failed: false,
    });
  });

  it('keeps queue stats available after the same CLIProxy usage queue has been drained', async () => {
    let queueCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        queueCalls++;
        return jsonResponse(queueCalls === 1 ? [createCodexQueueRecord()] : []);
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const firstRaw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19204));
    const secondRaw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19204));

    expect(firstRaw?.usage?.total_requests).toBe(1);
    expect(secondRaw?.usage?.total_requests).toBe(1);
    expect(secondRaw?.usage?.apis?.codex.models?.['gpt-5.5'].details).toHaveLength(1);
  });

  it('does not reuse drained usage-queue stats for a different CLIProxy management URL', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        return jsonResponse(url.includes(':19205') ? [createCodexQueueRecord()] : []);
      }
      if (url.endsWith('/v0/management/api-key-usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const firstRaw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19205));
    const secondRaw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19206));

    expect(firstRaw?.usage?.total_requests).toBe(1);
    expect(secondRaw?.usage?.total_requests).toBe(0);
    expect(secondRaw?.usage?.apis).toEqual({});
  });

  it('uses API-key usage totals when neither aggregate nor queue usage is available', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.endsWith('/v0/management/api-key-usage')) {
        return jsonResponse({
          openai: {
            'https://api.example.test|sk-redacted': {
              success: 2,
              failed: 1,
            },
          },
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const raw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19202));

    expect(raw?.usage?.total_requests).toBe(3);
    expect(raw?.usage?.success_count).toBe(2);
    expect(raw?.usage?.failure_count).toBe(1);
    expect(raw?.usage?.apis?.openai.total_requests).toBe(3);
    expect(raw?.usage?.apis?.openai.models).toEqual({});
  });
});

describe('fetchCliproxyStats', () => {
  it('builds account stats from queue records and normalizes OAuth auth filenames', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        return jsonResponse([createCodexQueueRecord()]);
      }
      if (url.endsWith('/v0/management/auth-files')) {
        return jsonResponse({ files: [] });
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const stats = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyStats(19203));

    expect(stats?.totalRequests).toBe(1);
    expect(stats?.requestsByProvider).toEqual({ codex: 1 });
    expect(stats?.requestsByModel).toEqual({ 'gpt-5.5': 1 });
    expect(stats?.accountStats['codex:user@example.com']).toMatchObject({
      accountKey: 'codex:user@example.com',
      provider: 'codex',
      source: 'user@example.com',
      successCount: 1,
      failureCount: 0,
      totalTokens: 23,
    });
  });
});
