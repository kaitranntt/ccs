/**
 * Tests for the native subscription quota collector.
 *
 * The Anthropic fetch is ALWAYS mocked — these tests NEVER hit the live usage
 * endpoint. A controllable clock drives TTL / backoff / breaker assertions.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import {
  getNativeAccountRows,
  resetNativeQuotaState,
  type NativeQuotaDeps,
} from '../../../src/web-server/usage/native-quota-collector';
import type { ClaudeQuotaResult } from '../../../src/cliproxy/quota/quota-types';
import type { ClaudeNativeCredentials } from '../../../src/web-server/usage/claude-native-credentials';

// A jump comfortably past any single-call backoff cooldown (<= 60s), used so a
// breaker-test fetch is not blocked by the prior 429's per-call cooldown.
const MAX_COOLDOWN_JUMP = 61_000;

function maxCreds(): ClaudeNativeCredentials {
  return { claudeAiOauth: { accessToken: 'native-tok', subscriptionType: 'max' } };
}

function successQuota(): ClaudeQuotaResult {
  return {
    success: true,
    windows: [],
    coreUsage: {
      fiveHour: {
        rateLimitType: 'five_hour',
        label: 'Session limit',
        remainingPercent: 42,
        resetAt: '2026-06-09T20:00:00.000Z',
        status: 'allowed',
      },
      weekly: {
        rateLimitType: 'seven_day',
        label: 'Weekly limit',
        remainingPercent: 70,
        resetAt: '2026-06-15T00:00:00.000Z',
        status: 'allowed',
      },
    },
    lastUpdated: Date.now(),
    accountId: 'claude-code',
  };
}

/** A Max-plan quota carrying the Opus/Sonnet weekly splits in windows[]. */
function maxQuotaWithSplits(): ClaudeQuotaResult {
  const base = successQuota();
  return {
    ...base,
    windows: [
      {
        rateLimitType: 'seven_day_opus',
        label: 'Opus weekly',
        status: 'allowed',
        utilization: 0.25,
        usedPercent: 25,
        remainingPercent: 75,
        resetAt: '2026-06-15T00:00:00.000Z',
      },
      {
        rateLimitType: 'seven_day_sonnet',
        label: 'Sonnet weekly',
        status: 'allowed',
        utilization: 0.6,
        usedPercent: 60,
        remainingPercent: 40,
        resetAt: '2026-06-15T00:00:00.000Z',
      },
    ],
  };
}

function reauthQuota(): ClaudeQuotaResult {
  return {
    success: false,
    windows: [],
    coreUsage: { fiveHour: null, weekly: null },
    lastUpdated: Date.now(),
    accountId: 'claude-code',
    needsReauth: true,
    error: 'Authentication required',
  };
}

function rateLimitedQuota(retryAfter?: string): ClaudeQuotaResult {
  return {
    success: false,
    windows: [],
    coreUsage: { fiveHour: null, weekly: null },
    lastUpdated: Date.now(),
    accountId: 'claude-code',
    httpStatus: 429,
    retryable: true,
    ...(retryAfter ? { errorDetail: `retry-after:${retryAfter}` } : {}),
    error: 'rate limited',
  };
}

/** Build a deps object with a controllable clock + counted fetch. */
function makeDeps(
  fetchImpl: (token: string) => Promise<ClaudeQuotaResult>,
  clock: { now: number },
  credsImpl: () => ClaudeNativeCredentials | null = maxCreds
): NativeQuotaDeps & { fetchCount: () => number } {
  let count = 0;
  return {
    readCredentials: credsImpl,
    fetchClaudeQuota: async (token: string) => {
      count += 1;
      return fetchImpl(token);
    },
    getCodexQuota: async () => null,
    now: () => clock.now,
    sleep: async () => {},
    fetchCount: () => count,
  };
}

beforeEach(() => {
  resetNativeQuotaState();
});

describe('Claude native row mapping', () => {
  it('maps a successful fetch into a claude-code ok row with min remaining', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeDeps(async () => successQuota(), clock);
    const rows = await getNativeAccountRows(deps);

    const row = rows.find((r) => r.provider === 'claude-code');
    expect(row).toBeDefined();
    expect(row?.quotaStatus).toBe('ok');
    // min(42, 70)
    expect(row?.quota_percentage).toBe(42);
    expect(row?.next_reset).toBe('2026-06-09T20:00:00.000Z');
    expect(row?.tier).toBe('max');
    expect(row?.displayName).toBe('Claude Code');
    expect(row?.account_id).toBe('claude-code');
    expect(row?.needsReauth).toBe(false);
  });

  it('emits quotaWindows with five_hour + seven_day from coreUsage (no opus/sonnet on non-Max)', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeDeps(async () => successQuota(), clock);
    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'claude-code');

    expect(row?.quotaWindows).toHaveLength(2);
    const five = row?.quotaWindows?.find((w) => w.key === 'five_hour');
    expect(five?.label).toBe('5h');
    expect(five?.remainingPercent).toBe(42);
    expect(five?.usedPercent).toBe(58); // 100 - 42
    expect(five?.windowMinutes).toBe(300);
    expect(five?.resetAt).toBe('2026-06-09T20:00:00.000Z');

    const week = row?.quotaWindows?.find((w) => w.key === 'seven_day');
    expect(week?.label).toBe('week');
    expect(week?.remainingPercent).toBe(70);
    expect(week?.usedPercent).toBe(30);
    expect(week?.windowMinutes).toBe(10080);

    // Max-only splits absent here.
    expect(row?.quotaWindows?.find((w) => w.key === 'seven_day_opus')).toBeUndefined();
    expect(row?.quotaWindows?.find((w) => w.key === 'seven_day_sonnet')).toBeUndefined();
  });

  it('adds seven_day_opus + seven_day_sonnet windows when present (Max plan)', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeDeps(async () => maxQuotaWithSplits(), clock);
    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'claude-code');

    // five_hour, seven_day, seven_day_opus, seven_day_sonnet
    expect(row?.quotaWindows).toHaveLength(4);
    const opus = row?.quotaWindows?.find((w) => w.key === 'seven_day_opus');
    expect(opus?.label).toBe('Opus · week');
    expect(opus?.usedPercent).toBe(25);
    expect(opus?.remainingPercent).toBe(75);
    expect(opus?.windowMinutes).toBe(10080);

    const sonnet = row?.quotaWindows?.find((w) => w.key === 'seven_day_sonnet');
    expect(sonnet?.label).toBe('Sonnet · week');
    expect(sonnet?.usedPercent).toBe(60);
    expect(sonnet?.remainingPercent).toBe(40);
  });

  it('emits a reauth error row on 401/needsReauth', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeDeps(async () => reauthQuota(), clock);
    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'claude-code');
    expect(row?.quotaStatus).toBe('error');
    expect(row?.health).toBe('error');
    expect(row?.needsReauth).toBe(true);
  });

  it('omits the claude row when there is no token', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeDeps(
      async () => successQuota(),
      clock,
      () => null
    );
    const rows = await getNativeAccountRows(deps);
    expect(rows.find((r) => r.provider === 'claude-code')).toBeUndefined();
  });

  it('omits the claude row for an unsupported (free) subscription without spending a call', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeDeps(
      async () => successQuota(),
      clock,
      () => ({
        claudeAiOauth: { accessToken: 'x', subscriptionType: 'free' },
      })
    );
    const rows = await getNativeAccountRows(deps);
    expect(rows.find((r) => r.provider === 'claude-code')).toBeUndefined();
    expect(deps.fetchCount()).toBe(0);
  });
});

describe('cache / TTL', () => {
  it('serves cache within TTL and does NOT re-fetch', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeDeps(async () => successQuota(), clock);

    await getNativeAccountRows(deps);
    expect(deps.fetchCount()).toBe(1);

    // Advance < 10 min: still cached.
    clock.now += 5 * 60 * 1000;
    const rows = await getNativeAccountRows(deps);
    expect(deps.fetchCount()).toBe(1);
    expect(rows.find((r) => r.provider === 'claude-code')?.cached).toBe(true);
  });

  it('re-fetches after the TTL expires', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeDeps(async () => successQuota(), clock);

    await getNativeAccountRows(deps);
    clock.now += 11 * 60 * 1000; // past 10-min TTL
    await getNativeAccountRows(deps);
    expect(deps.fetchCount()).toBe(2);
  });
});

describe('in-flight coalescing', () => {
  it('shares ONE fetch across concurrent callers past TTL', async () => {
    const clock = { now: 1_000_000 };
    let resolveFetch: (q: ClaudeQuotaResult) => void = () => {};
    const gate = new Promise<ClaudeQuotaResult>((resolve) => {
      resolveFetch = resolve;
    });
    const deps = makeDeps(async () => gate, clock);

    const p1 = getNativeAccountRows(deps);
    const p2 = getNativeAccountRows(deps);
    resolveFetch(successQuota());
    await Promise.all([p1, p2]);

    expect(deps.fetchCount()).toBe(1);
  });
});

describe('Retry-After + backoff + circuit breaker', () => {
  it('honors Retry-After: no fetch until the cooldown elapses', async () => {
    const t0 = 1_000_000;
    const clock = { now: t0 };
    const deps = makeDeps(async () => rateLimitedQuota('30'), clock);

    await getNativeAccountRows(deps); // fetch #1 -> 429, cooldown = t0 + 30s
    expect(deps.fetchCount()).toBe(1);

    // Within the 30s Retry-After cooldown -> zero network even though there is
    // no cached row yet.
    clock.now = t0 + 10_000;
    await getNativeAccountRows(deps);
    expect(deps.fetchCount()).toBe(1);

    // Past the 30s cooldown -> a fetch is allowed again.
    clock.now = t0 + 31_000;
    await getNativeAccountRows(deps);
    expect(deps.fetchCount()).toBe(2);
  });

  it('trips the breaker after 3 consecutive 429s, then a success closes it', async () => {
    const clock = { now: 1_000_000 };
    let mode: 'fail' | 'ok' = 'fail';
    const deps = makeDeps(
      async () => (mode === 'fail' ? rateLimitedQuota() : successQuota()),
      clock
    );

    // Three 429s; each separated past the per-call cooldown so they actually fetch.
    for (let i = 0; i < 3; i++) {
      await getNativeAccountRows(deps);
      // jump past TTL and any backoff cooldown
      clock.now += 11 * 60 * 1000 + MAX_COOLDOWN_JUMP;
    }
    expect(deps.fetchCount()).toBe(3);

    // Breaker is open now -> zero network even past TTL.
    await getNativeAccountRows(deps);
    expect(deps.fetchCount()).toBe(3);

    // Advance past the 15-min breaker cooldown; allow a success which closes it.
    clock.now += 16 * 60 * 1000;
    mode = 'ok';
    await getNativeAccountRows(deps);
    expect(deps.fetchCount()).toBe(4);

    // After success, breaker closed: another fetch past TTL proceeds.
    clock.now += 11 * 60 * 1000;
    await getNativeAccountRows(deps);
    expect(deps.fetchCount()).toBe(5);
  });
});

describe('stale-on-fail', () => {
  it('returns the last good row when a subsequent fetch rejects', async () => {
    const clock = { now: 1_000_000 };
    let mode: 'ok' | 'throw' = 'ok';
    const deps = makeDeps(async () => {
      if (mode === 'throw') throw new Error('network down');
      return successQuota();
    }, clock);

    await getNativeAccountRows(deps); // good row cached
    mode = 'throw';
    clock.now += 11 * 60 * 1000; // force re-fetch
    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'claude-code');
    expect(row).toBeDefined();
    expect(row?.quotaStatus).toBe('ok');
    expect(row?.cached).toBe(true);
  });

  it('omits the row when the first-ever fetch fails (no prior cache)', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeDeps(async () => {
      throw new Error('network down');
    }, clock);
    const rows = await getNativeAccountRows(deps);
    expect(rows.find((r) => r.provider === 'claude-code')).toBeUndefined();
  });
});

describe('Codex path', () => {
  it('maps a local Codex quota into a codex ok row', async () => {
    const clock = { now: 1_000_000 };
    const deps: NativeQuotaDeps = {
      readCredentials: () => null, // no claude row
      getCodexQuota: async () => ({
        quotaPercentage: 52,
        nextReset: '2026-06-09T19:00:00.000Z',
        tier: 'pro',
        stale: false,
        staleAsOf: null,
        windows: [
          {
            key: 'five_hour',
            label: '5h',
            usedPercent: 19,
            remainingPercent: 81,
            resetAt: '2026-06-09T19:00:00.000Z',
            windowMinutes: 300,
          },
          {
            key: 'seven_day',
            label: 'week',
            usedPercent: 48,
            remainingPercent: 52,
            resetAt: '2026-06-14T00:00:00.000Z',
            windowMinutes: 10080,
          },
        ],
      }),
      now: () => clock.now,
    };
    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'codex');
    expect(row?.quotaStatus).toBe('ok');
    expect(row?.quota_percentage).toBe(52);
    expect(row?.tier).toBe('pro');
    expect(row?.health).toBe('ok');
    expect(row?.quotaWindows).toHaveLength(2);
    expect(row?.quotaWindows?.[0].windowMinutes).toBe(300);
    expect(row?.staleAsOf).toBeUndefined();
  });

  it('flags health warning when the Codex source is stale', async () => {
    const clock = { now: 1_000_000 };
    const deps: NativeQuotaDeps = {
      readCredentials: () => null,
      getCodexQuota: async () => ({
        quotaPercentage: 10,
        nextReset: null,
        tier: null,
        stale: true,
        staleAsOf: '2026-06-09T13:30:00.000Z',
        windows: [],
      }),
      now: () => clock.now,
    };
    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'codex');
    expect(row?.health).toBe('warning');
    // staleAsOf flows through so the bar can render the freshness footnote.
    expect(row?.staleAsOf).toBe('2026-06-09T13:30:00.000Z');
  });

  it('omits the codex row when there is no rate_limits (exec-mode)', async () => {
    const clock = { now: 1_000_000 };
    const deps: NativeQuotaDeps = {
      readCredentials: () => null,
      getCodexQuota: async () => null,
      now: () => clock.now,
    };
    const rows = await getNativeAccountRows(deps);
    expect(rows.find((r) => r.provider === 'codex')).toBeUndefined();
  });
});
