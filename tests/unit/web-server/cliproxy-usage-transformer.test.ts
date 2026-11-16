import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { CliproxyUsageApiResponse } from '../../../src/cliproxy/services/stats-fetcher';
import {
  clearModelsDevRegistryCache,
  setCachedModelsDevRegistry,
} from '../../../src/web-server/models-dev/registry-cache';
import {
  buildCliproxyUsageHistoryAggregates,
  extractCliproxyUsageHistoryDetails,
  mergeCliproxyUsageHistoryDetails,
  normalizeCliproxyUsageHistoryDetail,
  transformCliproxyToDailyUsage,
  transformCliproxyToHourlyUsage,
  transformCliproxyToMonthlyUsage,
} from '../../../src/web-server/usage/cliproxy-usage-transformer';

const sampleResponse: CliproxyUsageApiResponse = {
  usage: {
    apis: {
      gemini: {
        models: {
          'gemini-2.5-pro': {
            details: [
              {
                timestamp: '2026-03-01T10:15:00.000Z',
                source: 'account-a',
                auth_index: 0,
                tokens: {
                  input_tokens: 100,
                  output_tokens: 50,
                  reasoning_tokens: 0,
                  cached_tokens: 20,
                  total_tokens: 170,
                },
                failed: false,
              },
              {
                timestamp: '2026-03-01T11:30:00.000Z',
                source: 'account-a',
                auth_index: 0,
                tokens: {
                  input_tokens: 40,
                  output_tokens: 10,
                  reasoning_tokens: 0,
                  cached_tokens: 5,
                  total_tokens: 55,
                },
                failed: true,
              },
              {
                timestamp: '2026-03-01T12:15:00.000Z',
                source: 'account-a',
                auth_index: 0,
                tokens: {
                  input_tokens: 0,
                  output_tokens: 0,
                  reasoning_tokens: 0,
                  cached_tokens: 0,
                  total_tokens: 0,
                },
                failed: true,
              },
              {
                timestamp: '2026-03-01T10:45:00.000Z',
                source: 'account-a',
                auth_index: 0,
                tokens: {
                  input_tokens: 30,
                  output_tokens: 20,
                  reasoning_tokens: 0,
                  cached_tokens: 10,
                  total_tokens: 60,
                },
                failed: false,
              },
            ],
          },
        },
      },
      codex: {
        models: {
          'gpt-4.1': {
            details: [
              {
                timestamp: '2026-03-02T01:00:00.000Z',
                source: 'account-b',
                auth_index: 1,
                tokens: {
                  input_tokens: 70,
                  output_tokens: 30,
                  reasoning_tokens: 0,
                  cached_tokens: 0,
                  total_tokens: 100,
                },
                failed: false,
              },
            ],
          },
        },
      },
    },
  },
};

describe('cliproxy usage transformer', () => {
  it('retains failed requests when they carry usage and skips zero-usage failures', () => {
    const flat = extractCliproxyUsageHistoryDetails(sampleResponse);
    expect(flat).toHaveLength(4);
    expect(flat[0].provider).toBe('google');
    expect(flat[0]).not.toHaveProperty('source');
    expect(flat[0]).not.toHaveProperty('authIndex');
    expect(
      flat.some(
        (entry) => entry.failed === true && entry.inputTokens === 40 && entry.outputTokens === 10
      )
    ).toBe(true);
    expect(
      flat.some(
        (entry) => entry.failed === true && entry.inputTokens === 0 && entry.outputTokens === 0
      )
    ).toBe(false);
  });

  it('deduplicates repeated snapshot details when merging history', () => {
    const details = extractCliproxyUsageHistoryDetails(sampleResponse);
    const merged = mergeCliproxyUsageHistoryDetails(details, details);

    expect(merged).toHaveLength(details.length);
  });

  it('normalizes old v3 history details before merging with provider-aware entries', () => {
    const [incoming] = extractCliproxyUsageHistoryDetails({
      usage: {
        apis: {
          gemini: {
            models: {
              'gemini-2.5-pro': {
                details: [
                  {
                    timestamp: '2026-03-01T10:15:00.000Z',
                    source: 'account-a',
                    auth_index: 0,
                    tokens: {
                      input_tokens: 100,
                      output_tokens: 50,
                      reasoning_tokens: 0,
                      cached_tokens: 20,
                      total_tokens: 170,
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
    const legacyDetail = normalizeCliproxyUsageHistoryDetail({
      model: incoming.model,
      timestamp: incoming.timestamp,
      source: 'account-a',
      authIndex: '0',
      inputTokens: incoming.inputTokens,
      outputTokens: incoming.outputTokens,
      cacheReadTokens: incoming.cacheReadTokens,
      failed: incoming.failed,
    });

    expect(legacyDetail?.requestCount).toBe(1);
    expect(Number.isFinite(legacyDetail?.cost)).toBe(true);
    expect(legacyDetail).not.toHaveProperty('source');
    expect(legacyDetail).not.toHaveProperty('authIndex');

    const merged = mergeCliproxyUsageHistoryDetails([legacyDetail!], [incoming]);
    expect(merged).toHaveLength(1);
    expect(merged[0].provider).toBe(incoming.provider);
    expect(merged[0].cost).toBe(incoming.cost);
  });

  it('strips legacy account identifiers when merging persisted history', () => {
    const details = extractCliproxyUsageHistoryDetails(sampleResponse);
    const legacyDetail = {
      ...details[0],
      source: 'user@example.com',
      authIndex: 'auth-file-7',
    };
    const merged = mergeCliproxyUsageHistoryDetails([legacyDetail], []);

    expect(merged[0]).not.toHaveProperty('source');
    expect(merged[0]).not.toHaveProperty('authIndex');
  });

  it('preserves legitimate duplicate requests when the incoming batch has more occurrences', () => {
    const details = extractCliproxyUsageHistoryDetails(sampleResponse);
    const repeated = [details[0], { ...details[0] }];
    const merged = mergeCliproxyUsageHistoryDetails([details[0]], repeated);

    expect(merged).toHaveLength(2);
  });

  it('uses persisted cost from history instead of recomputing from current pricing', () => {
    const details = extractCliproxyUsageHistoryDetails(sampleResponse);
    const seeded = details.map((detail) => ({ ...detail, cost: 999 }));
    const { daily } = buildCliproxyUsageHistoryAggregates(seeded);

    expect(daily[0].modelBreakdowns[0]?.cost).toBe(999);
  });

  it('rebuilds daily history aggregates from merged detail history', () => {
    const details = extractCliproxyUsageHistoryDetails(sampleResponse);
    const { daily } = buildCliproxyUsageHistoryAggregates(details);

    expect(daily).toHaveLength(2);
    expect(daily[0].date).toBe('2026-03-02');
    expect(daily[1].date).toBe('2026-03-01');
  });

  it('transforms daily usage with aggregated model totals', () => {
    const daily = transformCliproxyToDailyUsage(sampleResponse);

    expect(daily).toHaveLength(2);
    expect(daily[0].date).toBe('2026-03-02');
    expect(daily[0].source).toBe('cliproxy');
    expect(daily[1].date).toBe('2026-03-01');

    const marchFirst = daily.find((d) => d.date === '2026-03-01');
    expect(marchFirst?.inputTokens).toBe(170);
    expect(marchFirst?.outputTokens).toBe(80);
    expect(marchFirst?.cacheReadTokens).toBe(35);
    expect(marchFirst?.modelsUsed).toContain('gemini-2.5-pro');
  });

  it('transforms hourly usage with hour buckets', () => {
    const hourly = transformCliproxyToHourlyUsage(sampleResponse);

    expect(hourly).toHaveLength(3);
    expect(hourly[0].hour).toBe('2026-03-02 01:00');

    const tenAm = hourly.find((h) => h.hour === '2026-03-01 10:00');
    expect(tenAm?.inputTokens).toBe(130);
    expect(tenAm?.outputTokens).toBe(70);

    const elevenAm = hourly.find((h) => h.hour === '2026-03-01 11:00');
    expect(elevenAm?.inputTokens).toBe(40);
    expect(elevenAm?.outputTokens).toBe(10);
  });

  it('transforms monthly usage with cliproxy source', () => {
    const monthly = transformCliproxyToMonthlyUsage(sampleResponse);

    expect(monthly).toHaveLength(1);
    expect(monthly[0].month).toBe('2026-03');
    expect(monthly[0].source).toBe('cliproxy');
    expect(monthly[0].inputTokens).toBe(240);
    expect(monthly[0].outputTokens).toBe(110);
    expect(monthly[0].cacheReadTokens).toBe(35);
  });

  describe('provider-aware pricing', () => {
    let tempRoot = '';
    let originalCcsHome: string | undefined;
    let originalCcsDir: string | undefined;

    beforeEach(() => {
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-models-dev-'));
      originalCcsHome = process.env.CCS_HOME;
      originalCcsDir = process.env.CCS_DIR;
      process.env.CCS_HOME = tempRoot;
      delete process.env.CCS_DIR;
      setCachedModelsDevRegistry({
        openai: {
          id: 'openai',
          models: {
            'gpt-5.5': { id: 'gpt-5.5', cost: { input: 5, output: 30, cache_read: 0.5 } },
          },
        },
        'github-copilot': {
          id: 'github-copilot',
          models: {
            'gpt-5.5': { id: 'gpt-5.5', cost: { input: 0, output: 0 } },
          },
        },
      });
    });

    afterEach(() => {
      clearModelsDevRegistryCache();
      if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
      else delete process.env.CCS_HOME;
      if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
      else delete process.env.CCS_DIR;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it.each([
      ['', 7],
      ['   ', 7],
      ['bbb', 3],
    ])('preserves prefix precedence for provider key %j', (provider, expectedCost) => {
      setCachedModelsDevRegistry({
        aaa: { id: 'aaa', models: { zzmodel: { id: 'zzmodel', cost: { input: 7, output: 0 } } } },
        bbb: { id: 'bbb', models: { zzmodel: { id: 'zzmodel', cost: { input: 3, output: 0 } } } },
      });
      const response: CliproxyUsageApiResponse = {
        usage: {
          apis: {
            [provider]: {
              models: {
                'aaa/zzmodel': {
                  details: [
                    {
                      timestamp: '2026-03-03T10:00:00.000Z',
                      source: 'synthetic',
                      auth_index: 0,
                      tokens: {
                        input_tokens: 1_000_000,
                        output_tokens: 0,
                        total_tokens: 1_000_000,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      };
      expect(extractCliproxyUsageHistoryDetails(response)[0].cost).toBe(expectedCost);
    });

    it('keeps same model IDs separated by provider in CLIProxy usage', () => {
      const response: CliproxyUsageApiResponse = {
        usage: {
          apis: {
            openai: {
              models: {
                'gpt-5.5': {
                  details: [
                    {
                      timestamp: '2026-03-03T10:00:00.000Z',
                      source: 'api-account',
                      auth_index: 0,
                      tokens: {
                        input_tokens: 1_000_000,
                        output_tokens: 1_000_000,
                        reasoning_tokens: 0,
                        cached_tokens: 1_000_000,
                        total_tokens: 3_000_000,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
            'github-copilot': {
              models: {
                'gpt-5.5': {
                  details: [
                    {
                      timestamp: '2026-03-03T11:00:00.000Z',
                      source: 'copilot-account',
                      auth_index: 1,
                      tokens: {
                        input_tokens: 1_000_000,
                        output_tokens: 1_000_000,
                        reasoning_tokens: 0,
                        cached_tokens: 1_000_000,
                        total_tokens: 3_000_000,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      };

      const [daily] = transformCliproxyToDailyUsage(response);
      const paid = daily.modelBreakdowns.find((breakdown) => breakdown.provider === 'openai');
      const subscription = daily.modelBreakdowns.find(
        (breakdown) => breakdown.provider === 'github-copilot'
      );

      expect(daily.totalCost).toBe(35.5);
      expect(paid?.cost).toBe(35.5);
      expect(subscription?.cost).toBe(0);
    });

    it('canonicalizes CLIProxy provider aliases before grouping history details', () => {
      const response: CliproxyUsageApiResponse = {
        usage: {
          apis: {
            ghcp: {
              models: {
                'gpt-5.5': {
                  details: [
                    {
                      timestamp: '2026-03-03T10:00:00.000Z',
                      source: 'copilot-alias',
                      auth_index: 0,
                      tokens: {
                        input_tokens: 1_000_000,
                        output_tokens: 0,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 1_000_000,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
            'github-copilot': {
              models: {
                'gpt-5.5': {
                  details: [
                    {
                      timestamp: '2026-03-03T11:00:00.000Z',
                      source: 'copilot-canonical',
                      auth_index: 1,
                      tokens: {
                        input_tokens: 2_000_000,
                        output_tokens: 0,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 2_000_000,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      };

      const details = extractCliproxyUsageHistoryDetails(response);
      expect(details.map((detail) => detail.provider)).toEqual([
        'github-copilot',
        'github-copilot',
      ]);

      const [daily] = transformCliproxyToDailyUsage(response);
      expect(daily.modelBreakdowns).toHaveLength(1);
      expect(daily.modelBreakdowns[0]).toMatchObject({
        modelName: 'gpt-5.5',
        provider: 'github-copilot',
        inputTokens: 3_000_000,
      });
      expect(daily.modelsUsed).toEqual(['gpt-5.5']);
    });
  });
});
