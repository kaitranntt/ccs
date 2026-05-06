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

function writeCliproxyMainLog(lines: string[]): void {
  const logsDir = path.join(ccsDir, 'cliproxy', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, 'main.log'), `${lines.join('\n')}\n`, 'utf-8');
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

  it('merges local OAuth log usage when management endpoints have only aggregate API-key totals', async () => {
    writeCliproxyMainLog([
      '2026-05-05T18:45:00.000Z INFO request_id=req-1 Use OAuth provider=codex auth_file=codex-user@example.com-pro.json for model gpt-5.5',
      '2026-05-05T18:45:01.000Z INFO request_id=req-1 POST "/api/provider/codex/v1/messages?beta=true" status=200',
    ]);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        return jsonResponse([]);
      }
      if (url.endsWith('/v0/management/api-key-usage')) {
        return jsonResponse({
          openai: {
            'https://api.example.test|sk-redacted': {
              success: 2,
              failed: 0,
            },
          },
        });
      }
      if (url.endsWith('/v0/management/auth-files')) {
        return jsonResponse({ files: [] });
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const stats = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyStats(19207));

    expect(stats?.totalRequests).toBe(3);
    expect(stats?.successCount).toBe(3);
    expect(stats?.requestsByProvider).toEqual({ openai: 2, codex: 1 });
    expect(stats?.requestsByModel).toEqual({ 'gpt-5.5': 1 });
    expect(stats?.accountStats['codex:user@example.com']).toMatchObject({
      provider: 'codex',
      source: 'user@example.com',
      successCount: 1,
      failureCount: 0,
    });
  });

  it('adds missing OAuth details to matching API-key provider totals without double-counting', async () => {
    writeCliproxyMainLog([
      '2026-05-05T18:45:00.000Z INFO request_id=req-1 Use OAuth provider=codex auth_file=codex-user@example.com-pro.json for model gpt-5.5',
      '2026-05-05T18:45:01.000Z INFO request_id=req-1 POST "/api/provider/codex/v1/messages?beta=true" status=200',
    ]);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        return jsonResponse([]);
      }
      if (url.endsWith('/v0/management/api-key-usage')) {
        return jsonResponse({
          codex: {
            'oauth|codex-user@example.com-pro.json': {
              success: 1,
              failed: 0,
            },
          },
        });
      }
      if (url.endsWith('/v0/management/auth-files')) {
        return jsonResponse({ files: [] });
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const stats = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyStats(19209));

    expect(stats?.totalRequests).toBe(1);
    expect(stats?.successCount).toBe(1);
    expect(stats?.requestsByProvider).toEqual({ codex: 1 });
    expect(stats?.requestsByModel).toEqual({ 'gpt-5.5': 1 });
    expect(stats?.accountStats['codex:user@example.com']).toMatchObject({
      provider: 'codex',
      source: 'user@example.com',
      successCount: 1,
      failureCount: 0,
    });
  });

  it('keeps log-derived OAuth details when the same provider already has other details', async () => {
    writeCliproxyMainLog([
      '2026-05-05T18:45:00.000Z INFO request_id=req-1 Use OAuth provider=codex auth_file=codex-user@example.com-pro.json for model gpt-5.5',
      '2026-05-05T18:45:01.000Z INFO request_id=req-1 POST "/api/provider/codex/v1/messages?beta=true" status=200',
    ]);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({
          failed_requests: 0,
          usage: {
            total_requests: 1,
            success_count: 1,
            failure_count: 0,
            total_tokens: 7,
            apis: {
              codex: {
                total_requests: 1,
                total_tokens: 7,
                models: {
                  'gpt-4o': {
                    total_requests: 1,
                    total_tokens: 7,
                    details: [
                      {
                        timestamp: '2026-05-05T18:44:00.000Z',
                        source: 'api-key|sk-redacted',
                        auth_index: 'api-key|sk-redacted',
                        tokens: {
                          input_tokens: 4,
                          output_tokens: 3,
                          reasoning_tokens: 0,
                          cached_tokens: 0,
                          total_tokens: 7,
                        },
                        failed: false,
                      },
                    ],
                  },
                },
              },
            },
          },
        });
      }
      if (url.endsWith('/v0/management/auth-files')) {
        return jsonResponse({ files: [] });
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const stats = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyStats(19210));

    expect(stats?.totalRequests).toBe(2);
    expect(stats?.successCount).toBe(2);
    expect(stats?.requestsByProvider).toEqual({ codex: 2 });
    expect(stats?.requestsByModel).toEqual({ 'gpt-4o': 1, 'gpt-5.5': 1 });
    expect(stats?.accountStats['codex:user@example.com']).toMatchObject({
      provider: 'codex',
      source: 'user@example.com',
      successCount: 1,
      failureCount: 0,
    });
  });

  it('does not double-count local OAuth logs when usage queue already has provider details', async () => {
    writeCliproxyMainLog([
      '2026-05-05T18:45:00.000Z INFO request_id=req-1 Use OAuth provider=codex auth_file=codex-user@example.com-pro.json for model gpt-5.5',
      '2026-05-05T18:45:01.000Z INFO request_id=req-1 POST "/api/provider/codex/v1/messages?beta=true" status=200',
    ]);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        return jsonResponse([createCodexQueueRecord()]);
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const raw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19208));

    expect(raw?.usage?.total_requests).toBe(1);
    expect(raw?.usage?.apis?.codex.total_requests).toBe(1);
    expect(raw?.usage?.apis?.codex.models?.['gpt-5.5'].details).toHaveLength(1);
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
