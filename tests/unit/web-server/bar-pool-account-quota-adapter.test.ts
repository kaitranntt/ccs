import { describe, expect, it } from 'bun:test';
import type { QuotaResult } from '../../../src/cliproxy/quota/quota-fetcher';
import type { ClaudeQuotaResult, CodexQuotaResult } from '../../../src/cliproxy/quota/quota-types';
import {
  createBarPoolAccountQuotaFetcher,
  type BarPoolAccountQuotaFetcherDeps,
} from '../../../src/web-server/routes/bar-pool-account-quota-adapter';

function agyResult(overrides: Partial<QuotaResult> = {}): QuotaResult {
  return {
    success: true,
    models: [{ name: 'gemini-pro', percentage: 81, resetTime: null }],
    lastUpdated: 1,
    ...overrides,
  };
}

function claudeResult(overrides: Partial<ClaudeQuotaResult> = {}): ClaudeQuotaResult {
  return {
    success: true,
    windows: [
      {
        rateLimitType: 'five_hour',
        label: '5h usage limit',
        status: 'allowed',
        utilization: 0.28,
        usedPercent: 28,
        remainingPercent: 72,
        resetAt: '2026-07-18T16:00:00.000Z',
      },
      {
        rateLimitType: 'seven_day',
        label: 'Weekly usage limit',
        status: 'allowed_warning',
        utilization: 0.55,
        usedPercent: 55,
        remainingPercent: 45,
        resetAt: '2026-07-21T12:00:00.000Z',
      },
    ],
    coreUsage: {
      fiveHour: {
        rateLimitType: 'five_hour',
        label: '5h usage limit',
        remainingPercent: 72,
        resetAt: '2026-07-18T16:00:00.000Z',
        status: 'allowed',
      },
      weekly: {
        rateLimitType: 'seven_day',
        label: 'Weekly usage limit',
        remainingPercent: 45,
        resetAt: '2026-07-21T12:00:00.000Z',
        status: 'allowed_warning',
      },
    },
    lastUpdated: 2,
    accountId: 'claude@example.com',
    ...overrides,
  };
}

function codexResult(overrides: Partial<CodexQuotaResult> = {}): CodexQuotaResult {
  return {
    success: true,
    windows: [],
    coreUsage: {
      fiveHour: {
        label: 'Primary',
        remainingPercent: 36,
        resetAfterSeconds: 3600,
        resetAt: '2026-07-18T14:00:00.000Z',
      },
      weekly: {
        label: 'Secondary',
        remainingPercent: 24,
        resetAfterSeconds: 259200,
        resetAt: '2026-07-21T13:00:00.000Z',
      },
    },
    planType: 'pro',
    lastUpdated: 3,
    accountId: 'codex@example.com',
    ...overrides,
  };
}

function createDeps(
  overrides: Partial<BarPoolAccountQuotaFetcherDeps> = {}
): BarPoolAccountQuotaFetcherDeps {
  return {
    fetchLegacyAccountQuota: async () => agyResult(),
    fetchClaudeQuota: async () => claudeResult(),
    fetchCodexQuota: async () => codexResult(),
    ...overrides,
  };
}

describe('Bar pool account quota adapter', () => {
  it('maps Claude percentage from the most restrictive window and reset from the earliest', async () => {
    const fetchQuota = createBarPoolAccountQuotaFetcher(createDeps());

    const result = await fetchQuota('claude', 'claude@example.com');

    expect(result.success).toBe(true);
    expect(result.models).toEqual([
      {
        name: 'seven_day',
        displayName: 'Weekly usage limit',
        percentage: 45,
        resetTime: '2026-07-18T16:00:00.000Z',
      },
    ]);
    expect(result.accountId).toBe('claude@example.com');
  });

  it('maps Codex percentage from the most restrictive window and reset from the earliest', async () => {
    const fetchQuota = createBarPoolAccountQuotaFetcher(createDeps());

    const result = await fetchQuota('codex', 'codex@example.com');

    expect(result.success).toBe(true);
    expect(result.models).toEqual([
      {
        name: 'Secondary',
        displayName: 'Secondary',
        percentage: 24,
        resetTime: '2026-07-18T14:00:00.000Z',
      },
    ]);
    expect(result.accountId).toBe('codex@example.com');
  });

  it('preserves Claude transient failure metadata', async () => {
    const fetchQuota = createBarPoolAccountQuotaFetcher(
      createDeps({
        fetchClaudeQuota: async () =>
          claudeResult({
            success: false,
            windows: [],
            coreUsage: { fiveHour: null, weekly: null },
            error: 'Claude OAuth usage request timeout',
            errorCode: 'network_timeout',
            retryable: true,
          }),
      })
    );

    const result = await fetchQuota('claude', 'claude@example.com');

    expect(result).toMatchObject({
      success: false,
      models: [],
      error: 'Claude OAuth usage request timeout',
      errorCode: 'network_timeout',
      retryable: true,
    });
  });

  it('preserves Codex reauthentication state', async () => {
    const fetchQuota = createBarPoolAccountQuotaFetcher(
      createDeps({
        fetchCodexQuota: async () =>
          codexResult({
            success: false,
            windows: [],
            coreUsage: { fiveHour: null, weekly: null },
            error: 'Token expired or invalid',
            errorCode: 'reauth_required',
            httpStatus: 401,
            needsReauth: true,
            retryable: false,
          }),
      })
    );

    const result = await fetchQuota('codex', 'codex@example.com');

    expect(result).toMatchObject({
      success: false,
      models: [],
      errorCode: 'reauth_required',
      httpStatus: 401,
      needsReauth: true,
      retryable: false,
    });
  });

  it('delegates Antigravity unchanged to the legacy fetcher', async () => {
    const expected = agyResult();
    const calls: Array<[string, string]> = [];
    const fetchQuota = createBarPoolAccountQuotaFetcher(
      createDeps({
        fetchLegacyAccountQuota: async (provider, accountId) => {
          calls.push([provider, accountId]);
          return expected;
        },
      })
    );

    const result = await fetchQuota('agy', 'agy@example.com');

    expect(result).toBe(expected);
    expect(calls).toEqual([['agy', 'agy@example.com']]);
  });

  it('preserves legacy unsupported-provider semantics', async () => {
    const fetchQuota = createBarPoolAccountQuotaFetcher(
      createDeps({
        fetchLegacyAccountQuota: async (provider) =>
          agyResult({
            success: false,
            models: [],
            error: `Quota not supported for provider: ${provider}`,
            errorCode: 'quota_not_supported',
          }),
      })
    );

    const result = await fetchQuota('kiro', 'kiro-account');

    expect(result).toMatchObject({
      success: false,
      models: [],
      errorCode: 'quota_not_supported',
    });
  });
});
