import { describe, expect, it } from 'bun:test';
import type {
  CliproxyManagementAuthFile,
  CliproxyRequestDetail,
  CliproxyUsageApiResponse,
} from '../../../src/cliproxy/stats-fetcher';
import { buildCliproxyStatsFromUsageResponse } from '../../../src/cliproxy/stats-transformer';

function createDetail(overrides: Partial<CliproxyRequestDetail> = {}): CliproxyRequestDetail {
  return {
    timestamp: '2025-03-26T10:00:00.000Z',
    source: 'shared@example.com',
    auth_index: 'shared-auth-index',
    tokens: {
      input_tokens: 10,
      output_tokens: 5,
      reasoning_tokens: 0,
      cached_tokens: 0,
      total_tokens: 15,
    },
    failed: false,
    ...overrides,
  };
}

function createInternallyBucketedUsage(
  details: CliproxyRequestDetail[]
): CliproxyUsageApiResponse {
  return {
    usage: {
      total_requests: details.length,
      success_count: details.filter((detail) => !detail.failed).length,
      failure_count: details.filter((detail) => detail.failed).length,
      apis: {
        'ccs-internal-managed': {
          total_requests: details.length,
          models: {
            'gpt-5': {
              total_requests: details.length,
              details,
            },
          },
        },
      },
    },
  };
}

describe('buildCliproxyStatsFromUsageResponse', () => {
  it('keeps duplicate emails isolated by provider', () => {
    const usage: CliproxyUsageApiResponse = {
      usage: {
        total_requests: 5,
        apis: {
          codex: {
            total_requests: 3,
            models: {
              'gpt-5': {
                total_requests: 3,
                details: [
                  {
                    timestamp: '2026-03-26T10:00:00.000Z',
                    source: 'shared@example.com',
                    auth_index: 0,
                    tokens: {
                      input_tokens: 10,
                      output_tokens: 5,
                      reasoning_tokens: 0,
                      cached_tokens: 0,
                      total_tokens: 15,
                    },
                    failed: false,
                  },
                  {
                    timestamp: '2026-03-26T10:01:00.000Z',
                    source: 'shared@example.com',
                    auth_index: 0,
                    tokens: {
                      input_tokens: 12,
                      output_tokens: 7,
                      reasoning_tokens: 0,
                      cached_tokens: 0,
                      total_tokens: 19,
                    },
                    failed: false,
                  },
                  {
                    timestamp: '2026-03-26T10:02:00.000Z',
                    source: 'shared@example.com',
                    auth_index: 0,
                    tokens: {
                      input_tokens: 8,
                      output_tokens: 2,
                      reasoning_tokens: 0,
                      cached_tokens: 0,
                      total_tokens: 10,
                    },
                    failed: true,
                  },
                ],
              },
            },
          },
          gemini: {
            total_requests: 2,
            models: {
              'gemini-2.5-pro': {
                total_requests: 2,
                details: [
                  {
                    timestamp: '2026-03-26T11:00:00.000Z',
                    source: 'shared@example.com',
                    auth_index: 0,
                    tokens: {
                      input_tokens: 20,
                      output_tokens: 10,
                      reasoning_tokens: 0,
                      cached_tokens: 0,
                      total_tokens: 30,
                    },
                    failed: false,
                  },
                  {
                    timestamp: '2026-03-26T11:01:00.000Z',
                    source: 'shared@example.com',
                    auth_index: 0,
                    tokens: {
                      input_tokens: 14,
                      output_tokens: 6,
                      reasoning_tokens: 0,
                      cached_tokens: 0,
                      total_tokens: 20,
                    },
                    failed: true,
                  },
                ],
              },
            },
          },
        },
      },
    };

    const stats = buildCliproxyStatsFromUsageResponse(usage);

    expect(stats.accountStats['codex:shared@example.com']).toMatchObject({
      accountKey: 'codex:shared@example.com',
      provider: 'codex',
      source: 'shared@example.com',
      successCount: 2,
      failureCount: 1,
      totalTokens: 44,
      lastUsedAt: '2026-03-26T10:02:00.000Z',
    });
    expect(stats.accountStats['gemini:shared@example.com']).toMatchObject({
      accountKey: 'gemini:shared@example.com',
      provider: 'gemini',
      source: 'shared@example.com',
      successCount: 1,
      failureCount: 1,
      totalTokens: 50,
      lastUsedAt: '2026-03-26T11:01:00.000Z',
    });
    expect(stats.successCount).toBe(3);
    expect(stats.failureCount).toBe(2);
    expect(stats.requestsByProvider).toEqual({ codex: 3, gemini: 2 });
  });

  it('resolves canonical providers from auth_index when usage is internally bucketed', () => {
    const usage = createInternallyBucketedUsage([
      createDetail({ auth_index: 'codex-1' }),
      createDetail({
        timestamp: '2025-03-26T10:01:00.000Z',
        auth_index: 'gemini-1',
        tokens: {
          input_tokens: 12,
          output_tokens: 7,
          reasoning_tokens: 0,
          cached_tokens: 0,
          total_tokens: 19,
        },
      }),
      createDetail({
        timestamp: '2025-03-26T10:02:00.000Z',
        auth_index: 'agy-1',
        tokens: {
          input_tokens: 8,
          output_tokens: 2,
          reasoning_tokens: 0,
          cached_tokens: 0,
          total_tokens: 10,
        },
        failed: true,
      }),
    ]);
    const authFiles: CliproxyManagementAuthFile[] = [
      { auth_index: 'codex-1', provider: 'codex', email: 'shared@example.com' },
      { auth_index: 'gemini-1', provider: 'gemini-cli', email: 'shared@example.com' },
      { auth_index: 'agy-1', provider: 'antigravity', email: 'shared@example.com' },
    ];

    const stats = buildCliproxyStatsFromUsageResponse(usage, { authFiles });

    expect(stats.accountStats['codex:shared@example.com']).toMatchObject({
      provider: 'codex',
      successCount: 1,
      failureCount: 0,
    });
    expect(stats.accountStats['gemini:shared@example.com']).toMatchObject({
      provider: 'gemini',
      successCount: 1,
      failureCount: 0,
    });
    expect(stats.accountStats['agy:shared@example.com']).toMatchObject({
      provider: 'agy',
      successCount: 0,
      failureCount: 1,
    });
    expect(stats.requestsByProvider).toEqual({ codex: 1, gemini: 1, agy: 1 });
  });

  it('falls back to the usage provider when auth_index lookup cannot resolve a provider', () => {
    const usage = createInternallyBucketedUsage([createDetail({ auth_index: 'codex-1' })]);
    const scenarios: Array<{ label: string; authFiles: CliproxyManagementAuthFile[] }> = [
      { label: 'empty authFiles', authFiles: [] },
      {
        label: 'missing auth_index match',
        authFiles: [{ auth_index: 'other-auth-index', provider: 'codex', email: 'shared@example.com' }],
      },
      {
        label: 'matching auth_index without provider metadata',
        authFiles: [{ auth_index: 'codex-1', email: 'shared@example.com' }],
      },
    ];

    for (const scenario of scenarios) {
      const stats = buildCliproxyStatsFromUsageResponse(usage, { authFiles: scenario.authFiles });

      expect(stats.accountStats['ccs-internal-managed:shared@example.com'], scenario.label).toMatchObject({
        provider: 'ccs-internal-managed',
        source: 'shared@example.com',
        successCount: 1,
        failureCount: 0,
      });
      expect(stats.requestsByProvider, scenario.label).toEqual({ 'ccs-internal-managed': 1 });
    }
  });

  it('falls back to auth-file source metadata when detail source is blank and supports mixed auth_index outcomes', () => {
    const usage = createInternallyBucketedUsage([
      createDetail({ source: '   ', auth_index: 'codex-1' }),
      createDetail({
        timestamp: '2025-03-26T10:01:00.000Z',
        source: 'unmatched@example.com',
        auth_index: 'missing-auth-index',
      }),
      createDetail({
        timestamp: '2025-03-26T10:02:00.000Z',
        source: '   ',
        auth_index: 'providerless-auth-index',
        failed: true,
      }),
    ]);
    const authFiles: CliproxyManagementAuthFile[] = [
      { auth_index: 'codex-1', provider: 'codex', email: 'fallback@example.com' },
      { auth_index: 'providerless-auth-index', email: 'providerless-fallback@example.com' },
    ];

    const stats = buildCliproxyStatsFromUsageResponse(usage, { authFiles });

    expect(stats.accountStats['codex:fallback@example.com']).toMatchObject({
      provider: 'codex',
      source: 'fallback@example.com',
      successCount: 1,
      failureCount: 0,
    });
    expect(stats.accountStats['ccs-internal-managed:unmatched@example.com']).toMatchObject({
      provider: 'ccs-internal-managed',
      source: 'unmatched@example.com',
      successCount: 1,
      failureCount: 0,
    });
    expect(stats.accountStats['ccs-internal-managed:providerless-fallback@example.com']).toMatchObject({
      provider: 'ccs-internal-managed',
      source: 'providerless-fallback@example.com',
      successCount: 0,
      failureCount: 1,
    });
    expect(stats.requestsByProvider).toEqual({ codex: 1, 'ccs-internal-managed': 2 });
  });

  it('derives duplicate-email Codex account ids from auth file metadata', () => {
    const usage = createInternallyBucketedUsage([
      createDetail({ auth_index: 'codex-team', source: 'kaidu.kd@gmail.com' }),
      createDetail({
        auth_index: 'codex-free',
        source: 'kaidu.kd@gmail.com',
        timestamp: '2025-03-26T10:01:00.000Z',
        failed: true,
      }),
    ]);
    const authFiles: CliproxyManagementAuthFile[] = [
      {
        auth_index: 'codex-team',
        provider: 'codex',
        email: 'kaidu.kd@gmail.com',
        name: 'codex-04a0f049-kaidu.kd@gmail.com-team.json',
      },
      {
        auth_index: 'codex-free',
        provider: 'codex',
        email: 'kaidu.kd@gmail.com',
        name: 'codex-kaidu.kd@gmail.com-free.json',
      },
    ];

    const stats = buildCliproxyStatsFromUsageResponse(usage, { authFiles });

    expect(stats.accountStats['codex:kaidu.kd@gmail.com#04a0f049-team']).toMatchObject({
      provider: 'codex',
      source: 'kaidu.kd@gmail.com#04a0f049-team',
      successCount: 1,
      failureCount: 0,
    });
    expect(stats.accountStats['codex:kaidu.kd@gmail.com#free']).toMatchObject({
      provider: 'codex',
      source: 'kaidu.kd@gmail.com#free',
      successCount: 0,
      failureCount: 1,
    });
  });
});
