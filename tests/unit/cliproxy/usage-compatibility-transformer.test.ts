import { describe, expect, it } from 'bun:test';
import { buildUsageResponseFromQueueRecords } from '../../../src/cliproxy/services/usage-compatibility-transformer';

function queueRecord(provider: string, overrides: Record<string, unknown> = {}) {
  return {
    timestamp: '2026-10-08T06:38:01.000Z',
    provider,
    model: 'test-model',
    source: 'account-a',
    auth_index: '0',
    request_id: `req-${provider}`,
    tokens: {
      input_tokens: 56892,
      output_tokens: 120,
      reasoning_tokens: 0,
      cached_tokens: 56064,
      total_tokens: 57012,
    },
    failed: false,
    ...overrides,
  };
}

function firstDetailTokens(records: unknown[]) {
  const apis = buildUsageResponseFromQueueRecords(records).usage?.apis ?? {};
  const provider = Object.values(apis)[0];
  return Object.values(provider?.models ?? {})[0]?.details?.[0]?.tokens;
}

describe('buildUsageResponseFromQueueRecords', () => {
  it('uses the complete token_breakdown so cached tokens are not counted as input', () => {
    const tokens = firstDetailTokens([
      queueRecord('codex', {
        token_breakdown: {
          schema_version: 2,
          quality: 'complete',
          total_tokens: 57012,
          input: {
            total_tokens: 56892,
            uncached_tokens: 828,
            cache_read_tokens: 56064,
            cache_write_tokens: 0,
          },
        },
      }),
    ]);

    expect(tokens?.input_tokens).toBe(828);
    expect(tokens?.cached_tokens).toBe(56064);
  });

  it('keeps input_tokens when the upstream already reports uncached input', () => {
    const tokens = firstDetailTokens([
      queueRecord('claude', {
        tokens: {
          input_tokens: 828,
          output_tokens: 120,
          reasoning_tokens: 0,
          cached_tokens: 56064,
          total_tokens: 57012,
        },
        token_breakdown: {
          schema_version: 2,
          quality: 'complete',
          total_tokens: 57012,
          input: {
            total_tokens: 56892,
            uncached_tokens: 828,
            cache_read_tokens: 56064,
            cache_write_tokens: 0,
          },
        },
      }),
    ]);

    expect(tokens?.input_tokens).toBe(828);
  });

  it('falls back to input_tokens when the breakdown is missing or incomplete', () => {
    expect(firstDetailTokens([queueRecord('codex')])?.input_tokens).toBe(56892);
    expect(
      firstDetailTokens([
        queueRecord('codex', {
          token_breakdown: {
            schema_version: 2,
            quality: 'unclassified',
            total_tokens: 57012,
            input: { uncached_tokens: 0 },
          },
        }),
      ])?.input_tokens
    ).toBe(56892);
  });
});
