import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { runWithScopedConfigDir } from '../../../utils/config-manager';
import { __testExports, fetchCliproxyStats, fetchCliproxyUsageRaw } from '../stats-fetcher';
import { mergeUsageResponseWithMissingDetails } from '../usage-compatibility-transformer';

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

  it('drains CLIProxy usage-queue batches until the queue is exhausted', async () => {
    let queueCalls = 0;
    const firstBatch = Array.from({ length: 1000 }, (_, index) => ({
      ...createCodexQueueRecord(),
      timestamp: `2026-05-05T18:${String(index % 60).padStart(2, '0')}:00.000Z`,
      source: `oauth|codex-user-${index}@example.com-pro.json`,
      auth_index: `codex-auth-${index}`,
    }));
    const finalBatch = [
      {
        ...createCodexQueueRecord(),
        timestamp: '2026-05-05T19:45:00.000Z',
        source: 'oauth|codex-final@example.com-pro.json',
        auth_index: 'codex-auth-final',
      },
    ];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        queueCalls++;
        return jsonResponse(queueCalls === 1 ? firstBatch : finalBatch);
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const raw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19212));

    expect(queueCalls).toBe(2);
    expect(raw?.usage?.total_requests).toBe(1001);
    expect(raw?.usage?.total_tokens).toBe(23 * 1001);
    expect(raw?.usage?.apis?.codex.models?.['gpt-5.5'].details).toHaveLength(1001);
  });

  it('stops draining when CLIProxy returns the same full queue batch again', async () => {
    let queueCalls = 0;
    const fullBatch = Array.from({ length: 1000 }, (_, index) => ({
      ...createCodexQueueRecord(),
      timestamp: `2026-05-05T18:${String(index % 60).padStart(2, '0')}:00.000Z`,
      source: `oauth|codex-user-${index}@example.com-pro.json`,
      auth_index: `codex-auth-${index}`,
    }));
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith('/v0/management/usage')) {
        return jsonResponse({ error: 'not found' }, 404);
      }
      if (url.includes('/v0/management/usage-queue?count=1000')) {
        queueCalls++;
        return jsonResponse(fullBatch);
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const raw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19213));

    expect(queueCalls).toBe(2);
    expect(raw?.usage?.total_requests).toBe(1000);
    expect(raw?.usage?.total_tokens).toBe(23 * 1000);
    expect(raw?.usage?.apis?.codex.models?.['gpt-5.5'].details).toHaveLength(1000);
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
        return jsonResponse([
          {
            ...createCodexQueueRecord(),
            source: 'oauth|codex-user@example.com-pro.json',
            auth_index: 'codex-auth',
          },
        ]);
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const raw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19208));

    expect(raw?.usage?.total_requests).toBe(1);
    expect(raw?.usage?.total_tokens).toBe(23);
    expect(raw?.usage?.apis?.codex.total_requests).toBe(1);
    const details = raw?.usage?.apis?.codex.models?.['gpt-5.5'].details;
    expect(details).toHaveLength(1);
    expect(details?.[0]?.tokens.total_tokens).toBe(23);
  });

  it('scans the full CLIProxy main log when OAuth selection and completion are far apart', async () => {
    writeCliproxyMainLog([
      '2026-05-05T18:45:00.000Z INFO request_id=req-1 Use OAuth provider=codex auth_file=codex-user@example.com-pro.json for model gpt-5.5',
      'x'.repeat(1024 * 1024 + 64),
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
        return jsonResponse({ error: 'not found' }, 404);
      }
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;

    const raw = await runWithScopedConfigDir(ccsDir, () => fetchCliproxyUsageRaw(19211));

    expect(raw?.usage?.total_requests).toBe(1);
    expect(raw?.usage?.apis?.codex.models?.['gpt-5.5'].details?.[0]).toMatchObject({
      auth_index: 'codex-user@example.com-pro.json',
      failed: false,
    });
  });

  it('does not inflate token totals when enriching already-counted aggregate requests', () => {
    const merged = mergeUsageResponseWithMissingDetails(
      {
        failed_requests: 0,
        usage: {
          total_requests: 1,
          success_count: 1,
          failure_count: 0,
          total_tokens: 11,
          apis: {
            codex: {
              total_requests: 1,
              total_tokens: 11,
              models: {},
            },
          },
        },
      },
      {
        failed_requests: 0,
        usage: {
          total_requests: 1,
          success_count: 1,
          failure_count: 0,
          total_tokens: 11,
          apis: {
            codex: {
              total_requests: 1,
              total_tokens: 11,
              models: {
                'gpt-5.5': {
                  total_requests: 1,
                  total_tokens: 11,
                  details: [
                    {
                      timestamp: '2026-05-05T18:45:01.000Z',
                      source: 'provider=codex auth_file=codex-user@example.com-pro.json',
                      auth_index: 'codex-user@example.com-pro.json',
                      tokens: {
                        input_tokens: 6,
                        output_tokens: 5,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 11,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      }
    );

    expect(merged.usage?.total_requests).toBe(1);
    expect(merged.usage?.total_tokens).toBe(11);
    expect(merged.usage?.apis?.codex.total_requests).toBe(1);
    expect(merged.usage?.apis?.codex.total_tokens).toBe(11);
    expect(merged.usage?.apis?.codex.models?.['gpt-5.5'].total_requests).toBe(1);
    expect(merged.usage?.apis?.codex.models?.['gpt-5.5'].total_tokens).toBe(0);
    expect(merged.usage?.apis?.codex.models?.['gpt-5.5'].details).toHaveLength(1);
  });

  it('does not inflate model requests when enriching incomplete aggregate model details', () => {
    const merged = mergeUsageResponseWithMissingDetails(
      {
        failed_requests: 0,
        usage: {
          total_requests: 2,
          success_count: 2,
          failure_count: 0,
          total_tokens: 22,
          apis: {
            codex: {
              total_requests: 2,
              total_tokens: 22,
              models: {
                'gpt-5.5': {
                  total_requests: 2,
                  total_tokens: 22,
                  details: [
                    {
                      timestamp: '2026-05-05T18:45:01.000Z',
                      source: 'provider=codex auth_file=codex-user@example.com-pro.json',
                      auth_index: 'codex-user@example.com-pro.json',
                      tokens: {
                        input_tokens: 6,
                        output_tokens: 5,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 11,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      },
      {
        failed_requests: 0,
        usage: {
          total_requests: 1,
          success_count: 1,
          failure_count: 0,
          total_tokens: 11,
          apis: {
            codex: {
              total_requests: 1,
              total_tokens: 11,
              models: {
                'gpt-5.5': {
                  total_requests: 1,
                  total_tokens: 11,
                  details: [
                    {
                      timestamp: '2026-05-05T18:46:01.000Z',
                      source: 'provider=codex auth_file=codex-user@example.com-plus.json',
                      auth_index: 'codex-user@example.com-plus.json',
                      tokens: {
                        input_tokens: 7,
                        output_tokens: 4,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 11,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      }
    );

    const modelBucket = merged.usage?.apis?.codex.models?.['gpt-5.5'];
    expect(merged.usage?.total_requests).toBe(2);
    expect(merged.usage?.total_tokens).toBe(22);
    expect(merged.usage?.apis?.codex.total_requests).toBe(2);
    expect(merged.usage?.apis?.codex.total_tokens).toBe(22);
    expect(modelBucket?.total_requests).toBe(2);
    expect(modelBucket?.total_tokens).toBe(22);
    expect(modelBucket?.details).toHaveLength(2);
  });

  it('fills aggregate detail gaps for repeated requests from the same account', () => {
    const merged = mergeUsageResponseWithMissingDetails(
      {
        failed_requests: 0,
        usage: {
          total_requests: 2,
          success_count: 2,
          failure_count: 0,
          total_tokens: 24,
          apis: {
            codex: {
              total_requests: 2,
              total_tokens: 24,
              models: {
                'gpt-5.5': {
                  total_requests: 2,
                  total_tokens: 24,
                  details: [
                    {
                      timestamp: '2026-05-05T18:45:01.000Z',
                      source: 'provider=codex auth_file=codex-user@example.com-pro.json',
                      auth_index: 'codex-user@example.com-pro.json',
                      tokens: {
                        input_tokens: 6,
                        output_tokens: 5,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 11,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      },
      {
        failed_requests: 0,
        usage: {
          total_requests: 1,
          success_count: 1,
          failure_count: 0,
          total_tokens: 13,
          apis: {
            codex: {
              total_requests: 1,
              total_tokens: 13,
              models: {
                'gpt-5.5': {
                  total_requests: 1,
                  total_tokens: 13,
                  details: [
                    {
                      timestamp: '2026-05-05T18:46:01.000Z',
                      source: 'provider=codex auth_file=codex-user@example.com-pro.json',
                      auth_index: 'codex-user@example.com-pro.json',
                      tokens: {
                        input_tokens: 8,
                        output_tokens: 5,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 13,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      }
    );

    const modelBucket = merged.usage?.apis?.codex.models?.['gpt-5.5'];
    expect(merged.usage?.total_requests).toBe(2);
    expect(merged.usage?.total_tokens).toBe(24);
    expect(modelBucket?.total_requests).toBe(2);
    expect(modelBucket?.total_tokens).toBe(24);
    expect(modelBucket?.details?.map((detail) => detail.timestamp)).toEqual([
      '2026-05-05T18:45:01.000Z',
      '2026-05-05T18:46:01.000Z',
    ]);
  });

  it('keeps distinct complete requests from the same account and model', () => {
    const merged = mergeUsageResponseWithMissingDetails(
      {
        failed_requests: 0,
        usage: {
          total_requests: 1,
          success_count: 1,
          failure_count: 0,
          total_tokens: 11,
          apis: {
            codex: {
              total_requests: 1,
              total_tokens: 11,
              models: {
                'gpt-5.5': {
                  total_requests: 1,
                  total_tokens: 11,
                  details: [
                    {
                      timestamp: '2026-05-05T18:45:01.000Z',
                      source: 'oauth|codex-user@example.com-pro.json',
                      auth_index: 'codex-auth',
                      tokens: {
                        input_tokens: 6,
                        output_tokens: 5,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 11,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      },
      {
        failed_requests: 0,
        usage: {
          total_requests: 1,
          success_count: 1,
          failure_count: 0,
          total_tokens: 13,
          apis: {
            codex: {
              total_requests: 1,
              total_tokens: 13,
              models: {
                'gpt-5.5': {
                  total_requests: 1,
                  total_tokens: 13,
                  details: [
                    {
                      timestamp: '2026-05-05T18:46:01.000Z',
                      source: 'provider=codex auth_file=codex-user@example.com-pro.json',
                      auth_index: 'codex-user@example.com-pro.json',
                      tokens: {
                        input_tokens: 8,
                        output_tokens: 5,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 13,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      }
    );

    const modelBucket = merged.usage?.apis?.codex.models?.['gpt-5.5'];
    expect(merged.usage?.total_requests).toBe(2);
    expect(merged.usage?.total_tokens).toBe(24);
    expect(modelBucket?.total_requests).toBe(2);
    expect(modelBucket?.total_tokens).toBe(24);
    expect(modelBucket?.details).toHaveLength(2);
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
