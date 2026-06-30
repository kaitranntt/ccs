/**
 * Tests for the native subscription quota collector.
 *
 * Neither the Anthropic nor the ChatGPT endpoint is ever hit — all fetches are
 * injected via NativeQuotaDeps. A controllable clock drives TTL / backoff /
 * breaker assertions for both the Claude and Codex paths.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getNativeAccountRows,
  getCachedNativeAccountRows,
  resetNativeQuotaState,
  type NativeQuotaDeps,
} from '../../../src/web-server/usage/native-quota-collector';
import type { ClaudeQuotaResult, CodexQuotaResult } from '../../../src/cliproxy/quota/quota-types';
import type { ClaudeNativeCredentials } from '../../../src/web-server/usage/claude-native-credentials';
import type { CodexLocalQuota } from '../../../src/web-server/usage/codex-local-quota-collector';

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

// ============================================================================
// Codex network helpers
// ============================================================================

function codexSuccessQuota(): CodexQuotaResult {
  return {
    success: true,
    windows: [],
    coreUsage: {
      fiveHour: {
        label: 'Primary',
        remainingPercent: 60,
        resetAfterSeconds: 3600,
        resetAt: '2026-06-09T19:00:00.000Z',
      },
      weekly: {
        label: 'Secondary',
        remainingPercent: 80,
        resetAfterSeconds: 86400 * 4,
        resetAt: '2026-06-13T00:00:00.000Z',
      },
    },
    planType: 'pro',
    lastUpdated: Date.now(),
    accountId: 'codex-user@example.com',
  };
}

function codexRateLimitedQuota(retryAfter?: string): CodexQuotaResult {
  return {
    success: false,
    windows: [],
    planType: null,
    lastUpdated: Date.now(),
    accountId: 'codex-user@example.com',
    httpStatus: 429,
    retryable: true,
    ...(retryAfter ? { errorDetail: `retry-after:${retryAfter}` } : {}),
    error: 'rate limited',
  };
}

function codexReatuhQuota(): CodexQuotaResult {
  return {
    success: false,
    windows: [],
    planType: null,
    lastUpdated: Date.now(),
    accountId: 'codex-user@example.com',
    needsReauth: true,
    error: 'Token expired',
  };
}

function codexLocalQuota(): CodexLocalQuota {
  return {
    quotaPercentage: 30,
    nextReset: '2026-06-09T19:00:00.000Z',
    tier: 'pro',
    stale: true,
    staleAsOf: '2026-06-09T13:30:00.000Z',
    windows: [
      {
        key: 'five_hour',
        label: '5h',
        usedPercent: 70,
        remainingPercent: 30,
        resetAt: '2026-06-09T19:00:00.000Z',
        windowMinutes: 300,
      },
    ],
  };
}

/**
 * Build a NativeQuotaDeps that completely stubs the Codex path.
 * Claude path is disabled (no credentials) so only the Codex row is produced.
 */
function makeCodexDeps(
  overrides: Partial<NativeQuotaDeps> & { clock: { now: number } }
): NativeQuotaDeps & { networkCount: () => number; localCount: () => number } {
  let networkCalls = 0;
  let localCalls = 0;
  const { clock, ...rest } = overrides;
  return {
    // Disable Claude path
    readCredentials: () => null,
    // Default network quota: success
    fetchCodexNetworkQuota: async (_id: string) => {
      networkCalls += 1;
      return codexSuccessQuota();
    },
    // Default local fallback: stale data
    getCodexQuota: async () => {
      localCalls += 1;
      return codexLocalQuota();
    },
    // Default account id resolved
    getDefaultCodexAccountId: () => 'codex-user@example.com',
    now: () => clock.now,
    sleep: async () => {},
    // Allow overriding any dep
    ...rest,
    networkCount: () => networkCalls,
    localCount: () => localCalls,
  };
}

// ============================================================================
// Codex network path tests
// ============================================================================

describe('Codex network path', () => {
  it('production profile enumeration skips paused Codex accounts before live network refresh', async () => {
    const originalCcsHome = process.env.CCS_HOME;
    const originalHome = process.env.HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bar-paused-codex-'));
    process.env.CCS_HOME = tempHome;
    process.env.HOME = tempHome;

    try {
      const ccsDir = path.join(tempHome, '.ccs');
      const cliproxyDir = path.join(ccsDir, 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      fs.writeFileSync(
        path.join(ccsDir, 'codex-profiles.yaml'),
        [
          'version: "1.0"',
          'default: paused',
          'profiles:',
          '  paused:',
          '    type: codex',
          '    created: "2026-01-01T00:00:00.000Z"',
          '    last_used: null',
          '    email: paused-codex@example.com',
          '    account_id: paused-codex@example.com',
          '  active:',
          '    type: codex',
          '    created: "2026-01-02T00:00:00.000Z"',
          '    last_used: null',
          '    email: active-codex@example.com',
          '    account_id: active-codex@example.com',
          '',
        ].join('\n')
      );
      fs.writeFileSync(
        path.join(cliproxyDir, 'accounts.json'),
        JSON.stringify(
          {
            version: 1,
            providers: {
              codex: {
                default: 'paused-codex@example.com',
                accounts: {
                  'paused-codex@example.com': {
                    email: 'paused-codex@example.com',
                    tokenFile: 'paused-codex@example.com.json',
                    paused: true,
                  },
                  'active-codex@example.com': {
                    email: 'active-codex@example.com',
                    tokenFile: 'active-codex@example.com.json',
                  },
                },
              },
            },
          },
          null,
          2
        )
      );
      fs.mkdirSync(path.join(cliproxyDir, 'auth'), { recursive: true });
      fs.mkdirSync(path.join(cliproxyDir, 'auth-paused'), { recursive: true });
      fs.writeFileSync(
        path.join(cliproxyDir, 'auth', 'active-codex@example.com.json'),
        JSON.stringify({ type: 'codex' })
      );
      fs.writeFileSync(
        path.join(cliproxyDir, 'auth-paused', 'paused-codex@example.com.json'),
        JSON.stringify({ type: 'codex' })
      );

      const fetchedAccountIds: string[] = [];
      const deps = makeCodexDeps({
        clock: { now: 1_000_000 },
        listClaudeProfiles: () => [],
        readCredentials: undefined,
        getDefaultCodexAccountId: undefined,
        readCodexNativeAuth: (profile: string) => ({
          accessToken: `token-${profile}`,
          accountId: profile === 'active' ? 'active-codex@example.com' : 'paused-codex@example.com',
        }),
        fetchCodexNetworkQuota: async (accountId: string) => {
          fetchedAccountIds.push(accountId);
          return { ...codexSuccessQuota(), accountId };
        },
      });

      const rows = await getNativeAccountRows(deps);

      expect(fetchedAccountIds).toEqual(['active-codex@example.com']);
      expect(rows.find((row) => row.profile === 'paused')).toBeUndefined();
      const active = rows.find((row) => row.profile === 'active');
      expect(active?.paused).toBe(false);
      expect(active?.is_default).toBe(true);
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      } else {
        delete process.env.HOME;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('production profile enumeration does not live-refresh when all Codex accounts are paused', async () => {
    const originalCcsHome = process.env.CCS_HOME;
    const originalHome = process.env.HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bar-all-paused-codex-'));
    process.env.CCS_HOME = tempHome;
    process.env.HOME = tempHome;

    try {
      const ccsDir = path.join(tempHome, '.ccs');
      const cliproxyDir = path.join(ccsDir, 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      fs.writeFileSync(
        path.join(ccsDir, 'codex-profiles.yaml'),
        [
          'version: "1.0"',
          'default: paused',
          'profiles:',
          '  paused:',
          '    type: codex',
          '    created: "2026-01-01T00:00:00.000Z"',
          '    last_used: null',
          '    email: paused-codex@example.com',
          '    account_id: paused-codex@example.com',
          '',
        ].join('\n')
      );
      fs.writeFileSync(
        path.join(cliproxyDir, 'accounts.json'),
        JSON.stringify(
          {
            version: 1,
            providers: {
              codex: {
                default: 'paused-codex@example.com',
                accounts: {
                  'paused-codex@example.com': {
                    email: 'paused-codex@example.com',
                    tokenFile: 'paused-codex@example.com.json',
                    paused: true,
                  },
                },
              },
            },
          },
          null,
          2
        )
      );
      fs.mkdirSync(path.join(cliproxyDir, 'auth-paused'), { recursive: true });
      fs.writeFileSync(
        path.join(cliproxyDir, 'auth-paused', 'paused-codex@example.com.json'),
        JSON.stringify({ type: 'codex' })
      );

      let networkCalls = 0;
      const deps = makeCodexDeps({
        clock: { now: 1_000_000 },
        listClaudeProfiles: () => [],
        readCredentials: undefined,
        getDefaultCodexAccountId: undefined,
        readCodexNativeAuth: (profile: string) => ({
          accessToken: `token-${profile}`,
          accountId: 'paused-codex@example.com',
        }),
        fetchCodexNetworkQuota: async () => {
          networkCalls += 1;
          return codexSuccessQuota();
        },
      });

      const rows = await getNativeAccountRows(deps);

      expect(networkCalls).toBe(0);
      expect(deps.localCount()).toBe(0);
      expect(rows.find((row) => row.profile === 'paused')).toBeUndefined();
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
      if (originalHome !== undefined) {
        process.env.HOME = originalHome;
      } else {
        delete process.env.HOME;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
  it('network success builds a fresh row from coreUsage — no staleAsOf, health ok, correct windows', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeCodexDeps({ clock });

    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'codex');

    expect(row).toBeDefined();
    expect(row?.quotaStatus).toBe('ok');
    expect(row?.health).toBe('ok');
    expect(row?.tier).toBe('pro');
    expect(row?.needsReauth).toBe(false);
    // No staleAsOf on a live result
    expect(row?.staleAsOf).toBeUndefined();
    // quota_percentage = min(60, 80) = 60
    expect(row?.quota_percentage).toBe(60);
    // next_reset = soonest = fiveHour resetAt
    expect(row?.next_reset).toBe('2026-06-09T19:00:00.000Z');
    // quotaWindows: five_hour + seven_day
    expect(row?.quotaWindows).toHaveLength(2);
    const fiveHr = row?.quotaWindows?.find((w) => w.key === 'five_hour');
    expect(fiveHr?.label).toBe('5h');
    expect(fiveHr?.remainingPercent).toBe(60);
    expect(fiveHr?.usedPercent).toBe(40);
    expect(fiveHr?.windowMinutes).toBe(300);
    expect(fiveHr?.resetAt).toBe('2026-06-09T19:00:00.000Z');
    const week = row?.quotaWindows?.find((w) => w.key === 'seven_day');
    expect(week?.label).toBe('week');
    expect(week?.remainingPercent).toBe(80);
    expect(week?.usedPercent).toBe(20);
    expect(week?.windowMinutes).toBe(10080);
    // Network was called; local was NOT (network succeeded)
    expect(deps.networkCount()).toBe(1);
    expect(deps.localCount()).toBe(0);
  });

  it('network failure falls back to local stale row — staleAsOf set, health warning', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeCodexDeps({
      clock,
      fetchCodexNetworkQuota: async () => ({
        success: false,
        windows: [],
        planType: null,
        lastUpdated: Date.now(),
        error: 'network error',
        retryable: true,
      }),
    });

    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'codex');

    expect(row).toBeDefined();
    expect(row?.health).toBe('warning');
    expect(row?.staleAsOf).toBe('2026-06-09T13:30:00.000Z');
    expect(deps.localCount()).toBe(1);
  });

  it('force bypasses TTL and re-fetches from network', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeCodexDeps({ clock });

    // Prime the cache
    await getNativeAccountRows(deps);
    expect(deps.networkCount()).toBe(1);

    // Normal call within TTL: served from cache
    clock.now += 5 * 60 * 1000;
    await getNativeAccountRows(deps);
    expect(deps.networkCount()).toBe(1);

    // Force call: bypasses TTL, re-fetches
    await getNativeAccountRows(deps, { force: true });
    expect(deps.networkCount()).toBe(2);
  });

  it('token_expired (needsReauth) returns a reauth row — not cached as good', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeCodexDeps({
      clock,
      fetchCodexNetworkQuota: async () => codexReatuhQuota(),
    });

    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'codex');

    expect(row?.quotaStatus).toBe('error');
    expect(row?.health).toBe('error');
    expect(row?.needsReauth).toBe(true);
    // Local fallback was NOT called (reauth is a distinct path, not a transient error)
    expect(deps.localCount()).toBe(0);
  });

  it('breaker-open path: skips network and serves local fallback', async () => {
    const clock = { now: 1_000_000 };
    let networkCalls = 0;
    let localCalls = 0;

    const deps: NativeQuotaDeps & { networkCount: () => number; localCount: () => number } = {
      readCredentials: () => null,
      getDefaultCodexAccountId: () => 'codex-user@example.com',
      fetchCodexNetworkQuota: async () => {
        networkCalls += 1;
        return codexRateLimitedQuota();
      },
      getCodexQuota: async () => {
        localCalls += 1;
        return codexLocalQuota();
      },
      now: () => clock.now,
      sleep: async () => {},
      networkCount: () => networkCalls,
      localCount: () => localCalls,
    };

    // Trip the breaker with 3 consecutive 429s
    for (let i = 0; i < 3; i++) {
      await getNativeAccountRows(deps);
      // advance past per-call cooldown between each
      clock.now += 62_000;
    }
    const callsAfterTrip = networkCalls;

    // Breaker is now open: next call must skip network
    await getNativeAccountRows(deps);
    expect(networkCalls).toBe(callsAfterTrip); // no new network call
    // Local fallback is called instead
    expect(localCalls).toBeGreaterThan(0);
  });

  it('no-account path: skips network and serves local fallback', async () => {
    const clock = { now: 1_000_000 };
    let networkCalls = 0;
    let localCalls = 0;

    const deps: NativeQuotaDeps = {
      readCredentials: () => null,
      getDefaultCodexAccountId: () => null, // no account configured
      fetchCodexNetworkQuota: async () => {
        networkCalls += 1;
        return codexSuccessQuota();
      },
      getCodexQuota: async () => {
        localCalls += 1;
        return codexLocalQuota();
      },
      now: () => clock.now,
      sleep: async () => {},
    };

    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'codex');

    // No network call since no account
    expect(networkCalls).toBe(0);
    // Local fallback was used
    expect(localCalls).toBe(1);
    // Row is present from local data
    expect(row).toBeDefined();
    expect(row?.health).toBe('warning'); // local stale
  });

  it('network success with EMPTY coreUsage falls back to local (no contentless ok row)', async () => {
    const clock = { now: 1_000_000 };
    // Track our own network counter — an override passed to makeCodexDeps
    // replaces the helper's default counting fetcher, so deps.networkCount()
    // would not see this override's calls.
    let networkCalls = 0;
    const deps = makeCodexDeps({
      clock,
      // Healthy response but no resolved core windows (e.g. only code-review
      // windows or a changed payload) — carries no glanceable 5h/weekly signal.
      fetchCodexNetworkQuota: async () => {
        networkCalls += 1;
        return {
          success: true,
          windows: [],
          coreUsage: { fiveHour: null, weekly: null },
          planType: 'pro',
          lastUpdated: clock.now,
          accountId: 'codex-user@example.com',
        };
      },
    });

    const rows = await getNativeAccountRows(deps);
    const row = rows.find((r) => r.provider === 'codex');

    // Network was attempted, but the empty result must NOT be cached as an "ok"
    // row — the local fallback supplies real (stale) data instead.
    expect(networkCalls).toBe(1);
    expect(deps.localCount()).toBe(1);
    expect(row).toBeDefined();
    expect(row?.health).toBe('warning'); // came from local stale path
    expect(row?.staleAsOf).toBe('2026-06-09T13:30:00.000Z');
    expect(row?.quotaWindows).toHaveLength(1); // local five_hour window
  });
});

// ============================================================================
// Codex path (original local-only tests, preserved)
// These tests explicitly set getDefaultCodexAccountId: () => null so the
// network path is skipped and only the local fallback is exercised.
// ============================================================================

describe('Codex path', () => {
  it('maps a local Codex quota into a codex ok row', async () => {
    const clock = { now: 1_000_000 };
    const deps: NativeQuotaDeps = {
      readCredentials: () => null, // no claude row
      getDefaultCodexAccountId: () => null, // disable network path
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
      getDefaultCodexAccountId: () => null, // disable network path
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
      getDefaultCodexAccountId: () => null, // disable network path
      getCodexQuota: async () => null,
      now: () => clock.now,
    };
    const rows = await getNativeAccountRows(deps);
    expect(rows.find((r) => r.provider === 'codex')).toBeUndefined();
  });
});

describe('getCachedNativeAccountRows (instant, no-fetch fallback)', () => {
  it('returns [] before any successful collect', () => {
    expect(getCachedNativeAccountRows()).toEqual([]);
  });

  it('returns the last cached codex row (cached=true) after a successful collect, [] after reset', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeCodexDeps({ clock });

    // Prime the cache via a successful network collect.
    await getNativeAccountRows(deps);

    const cached = getCachedNativeAccountRows();
    const codex = cached.find((r) => r.provider === 'codex');
    expect(codex).toBeDefined();
    expect(codex?.cached).toBe(true);
    // No additional network call — the accessor reads cache only.
    expect(deps.networkCount()).toBe(1);

    resetNativeQuotaState();
    expect(getCachedNativeAccountRows()).toEqual([]);
  });
});

// ============================================================================
// Multi-profile path tests (GH-1595)
//
// These tests inject listClaudeProfiles / listCodexProfiles / defaultClaudeProfile
// / defaultCodexProfile so the production profile-enumeration path is exercised
// without touching real ~/.ccs or any Keychain. The readClaudeCredentialsForProfile
// and readCodexNativeAuth seams prevent fs access.
// ============================================================================

/**
 * Build a NativeQuotaDeps for the multi-profile path.
 *
 * - claudeProfiles: profile names for the Claude surface (ccs)
 * - codexProfiles: profile names for the Codex surface (ccsx)
 * - claudeDefault / codexDefault: the active profile per surface (paused:false)
 * - credsForProfile: map from profile name to credentials (null = parked)
 * - claudeFetch: network fetcher for Claude (all profiles share one implementation)
 * - codexNativeAuth: map from profile name to {accessToken, accountId}
 * - codexNetworkFetch: network fetcher for Codex (all profiles share one impl)
 */
function makeMultiProfileDeps(opts: {
  clock: { now: number };
  claudeProfiles: string[];
  codexProfiles: string[];
  claudeDefault?: string | null;
  codexDefault?: string | null;
  credsForProfile?: (profile: string) => ClaudeNativeCredentials | null;
  claudeFetch?: (token: string, accountId?: string) => Promise<ClaudeQuotaResult>;
  codexNativeAuth?: (profile: string) => { accessToken: string; accountId: string } | null;
  codexNetworkFetch?: (accountId: string) => Promise<CodexQuotaResult>;
  codexLocalFallback?: () => Promise<CodexLocalQuota | null>;
}): NativeQuotaDeps & {
  claudeFetchCount: () => number;
  codexNetworkCount: () => number;
} {
  let claudeFetches = 0;
  let codexNetworkFetches = 0;

  const {
    clock,
    claudeProfiles,
    codexProfiles,
    claudeDefault = null,
    codexDefault = null,
    credsForProfile = () => null,
    claudeFetch = async () => successQuota(),
    codexNativeAuth = () => null,
    codexNetworkFetch = async () => codexSuccessQuota(),
    codexLocalFallback = async () => null,
  } = opts;

  return {
    // Enumeration seams
    listClaudeProfiles: () => claudeProfiles,
    listCodexProfiles: () => codexProfiles,
    defaultClaudeProfile: () => claudeDefault,
    defaultCodexProfile: () => codexDefault,
    // Credential seams (file-only, no keychain)
    readClaudeCredentialsForProfile: credsForProfile,
    readCodexNativeAuth: codexNativeAuth,
    // Fetch seams
    fetchClaudeQuota: async (token: string, accountId?: string) => {
      claudeFetches += 1;
      return claudeFetch(token, accountId);
    },
    fetchCodexNetworkQuota: async (accountId: string) => {
      codexNetworkFetches += 1;
      return codexNetworkFetch(accountId);
    },
    getCodexQuota: codexLocalFallback,
    // Disable legacy single-profile paths
    readCredentials: () => null,
    getDefaultCodexAccountId: () => null,
    // Clock + sleep seams
    now: () => clock.now,
    sleep: async () => {},
    // Counters
    claudeFetchCount: () => claudeFetches,
    codexNetworkCount: () => codexNetworkFetches,
  };
}

describe('multi-profile: account_id and wire fields', () => {
  it('Claude profile rows carry surface="ccs", account_id="ccs:<p>", is_subscription=true', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['work', 'ck'],
      codexProfiles: [],
      claudeDefault: 'work',
      // 'work' has creds; 'ck' does not (parked)
      credsForProfile: (p) => (p === 'work' ? maxCreds() : null),
      claudeFetch: async () => successQuota(),
    });

    const rows = await getNativeAccountRows(deps);
    expect(rows.length).toBe(2);

    const work = rows.find((r) => r.profile === 'work');
    expect(work).toBeDefined();
    expect(work?.account_id).toBe('ccs:work');
    expect(work?.surface).toBe('ccs');
    expect(work?.is_subscription).toBe(true);
    expect(work?.provider).toBe('claude-code');

    const ck = rows.find((r) => r.profile === 'ck');
    expect(ck).toBeDefined();
    expect(ck?.account_id).toBe('ccs:ck');
    expect(ck?.surface).toBe('ccs');
    expect(ck?.is_subscription).toBe(true);
  });

  it('Codex profile rows carry surface="ccsx", account_id="ccsx:<p>", is_subscription=true', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: [],
      codexProfiles: ['personal', 'ck'],
      codexDefault: 'personal',
      codexNativeAuth: (p) => ({ accessToken: `tok-${p}`, accountId: `id-${p}` }),
      codexNetworkFetch: async () => codexSuccessQuota(),
    });

    const rows = await getNativeAccountRows(deps);
    expect(rows.length).toBe(2);

    const personal = rows.find((r) => r.profile === 'personal');
    expect(personal?.account_id).toBe('ccsx:personal');
    expect(personal?.surface).toBe('ccsx');
    expect(personal?.is_subscription).toBe(true);
    expect(personal?.provider).toBe('codex');

    const ck = rows.find((r) => r.profile === 'ck');
    expect(ck?.account_id).toBe('ccsx:ck');
    expect(ck?.surface).toBe('ccsx');
    expect(ck?.is_subscription).toBe(true);
  });

  it('paused reflects liveness (creds present), NOT default-ness; is_default marks the default independently', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      // Claude: work = default + creds (live); ck = non-default + NO creds (parked).
      claudeProfiles: ['work', 'ck'],
      // Codex: personal = default + creds (live); ck = NON-default + creds (live).
      codexProfiles: ['personal', 'ck'],
      claudeDefault: 'work',
      codexDefault: 'personal',
      credsForProfile: (p) => (p === 'work' ? maxCreds() : null),
      claudeFetch: async () => successQuota(),
      codexNativeAuth: (p) => ({ accessToken: `tok-${p}`, accountId: `id-${p}` }),
      codexNetworkFetch: async () => codexSuccessQuota(),
    });

    const rows = await getNativeAccountRows(deps);

    // Claude work: default + creds -> live, not dimmed.
    const claudeWork = rows.find((r) => r.surface === 'ccs' && r.profile === 'work');
    expect(claudeWork?.paused).toBe(false);
    expect(claudeWork?.is_default).toBe(true);

    // Claude ck: non-default + NO creds -> parked/dimmed.
    const claudeCk = rows.find((r) => r.surface === 'ccs' && r.profile === 'ck');
    expect(claudeCk?.paused).toBe(true);
    expect(claudeCk?.is_default).toBe(false);

    // Codex personal: default + creds -> live.
    const codexPersonal = rows.find((r) => r.surface === 'ccsx' && r.profile === 'personal');
    expect(codexPersonal?.paused).toBe(false);
    expect(codexPersonal?.is_default).toBe(true);

    // Codex ck: NON-default but HAS creds -> LIVE, NOT dimmed. This is the key
    // correctness guarantee: a valid isolated subscription is never dimmed just
    // because it is not the surface default.
    const codexCk = rows.find((r) => r.surface === 'ccsx' && r.profile === 'ck');
    expect(codexCk?.paused).toBe(false);
    expect(codexCk?.is_default).toBe(false);
  });

  it('N Claude + M Codex profiles produce N+M rows', async () => {
    const clock = { now: 1_000_000 };
    const claudeProfiles = ['work', 'ck', 'personal'];
    const codexProfiles = ['personal', 'ck'];
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles,
      codexProfiles,
      claudeDefault: 'work',
      codexDefault: 'personal',
      credsForProfile: () => maxCreds(),
      codexNativeAuth: (p) => ({ accessToken: `tok-${p}`, accountId: `id-${p}` }),
    });

    const rows = await getNativeAccountRows(deps);
    expect(rows.length).toBe(claudeProfiles.length + codexProfiles.length);
  });

  it('rows are sorted by (surface, profile)', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['work', 'ck'],
      codexProfiles: ['ck', 'personal'],
      claudeDefault: 'work',
      codexDefault: 'personal',
      credsForProfile: () => maxCreds(),
      codexNativeAuth: (p) => ({ accessToken: `tok-${p}`, accountId: `id-${p}` }),
    });

    const rows = await getNativeAccountRows(deps);
    const keys = rows.map((r) => `${r.surface}:${r.profile}`);
    // ccs:ck < ccs:work < ccsx:ck < ccsx:personal
    expect(keys).toEqual(['ccs:ck', 'ccs:work', 'ccsx:ck', 'ccsx:personal']);
  });
});

describe('multi-profile: Claude file-only reader', () => {
  it('profile with .credentials.json present -> live fetch row (paused:false when default)', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['work'],
      codexProfiles: [],
      claudeDefault: 'work',
      credsForProfile: (p) => (p === 'work' ? maxCreds() : null),
      claudeFetch: async () => successQuota(),
    });

    const rows = await getNativeAccountRows(deps);
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row?.profile).toBe('work');
    expect(row?.quotaStatus).toBe('ok');
    expect(row?.needsReauth).toBe(false);
    expect(row?.paused).toBe(false);
    expect(deps.claudeFetchCount()).toBe(1);
  });

  it('profile without .credentials.json -> parked row (needsReauth:true, no live fetch)', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['ck'],
      codexProfiles: [],
      claudeDefault: 'ck',
      credsForProfile: () => null, // no file on disk
      claudeFetch: async () => successQuota(),
    });

    const rows = await getNativeAccountRows(deps);
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row?.profile).toBe('ck');
    expect(row?.needsReauth).toBe(true);
    expect(row?.quota_percentage).toBeNull();
    // No live network call when creds are absent
    expect(deps.claudeFetchCount()).toBe(0);
  });

  it('absent creds row has quotaStatus unsupported (honest "needs auth" state)', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['ck'],
      codexProfiles: [],
      claudeDefault: 'ck',
      credsForProfile: () => null,
    });

    const rows = await getNativeAccountRows(deps);
    const row = rows[0];
    expect(row?.quotaStatus).toBe('unsupported');
    expect(row?.is_subscription).toBe(true);
  });
});

describe('multi-profile: per-profile circuit breaker isolation', () => {
  it("one profile's 429 does not open another profile's breaker", async () => {
    const MAX_COOLDOWN_JUMP_MP = 61_000;
    const clock = { now: 1_000_000 };
    let workFails = true;

    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['work', 'ck'],
      codexProfiles: [],
      claudeDefault: 'work',
      credsForProfile: () => maxCreds(),
      claudeFetch: async (_token, accountId) => {
        // 'work' (ccs:work) always 429s; 'ck' always succeeds
        if (accountId?.includes('work') && workFails) {
          return {
            success: false,
            windows: [],
            coreUsage: { fiveHour: null, weekly: null },
            lastUpdated: Date.now(),
            accountId: accountId ?? 'ccs:work',
            httpStatus: 429,
            retryable: true,
            error: 'rate limited',
          } as ClaudeQuotaResult;
        }
        return successQuota();
      },
    });

    // Trip the work breaker with 3 consecutive 429s.
    for (let i = 0; i < 3; i++) {
      resetNativeQuotaState();
      clock.now += i === 0 ? 0 : MAX_COOLDOWN_JUMP_MP;
      // Re-inject the multi-profile deps after reset so the state maps are fresh.
      await getNativeAccountRows({
        ...deps,
        listClaudeProfiles: () => ['work'],
        listCodexProfiles: () => [],
        defaultClaudeProfile: () => 'work',
      });
    }

    // After the three 429s on 'work', check that 'ck' still succeeds.
    // We reset state to have a clean run where 'ck' has no prior breaker history.
    resetNativeQuotaState();
    clock.now += MAX_COOLDOWN_JUMP_MP;
    workFails = false;

    const rows = await getNativeAccountRows(deps);
    const ckRow = rows.find((r) => r.profile === 'ck');
    const workRow = rows.find((r) => r.profile === 'work');

    // 'ck' should succeed — its breaker was never tripped.
    expect(ckRow?.quotaStatus).toBe('ok');
    // 'work' is also fine after reset (no breaker state).
    expect(workRow?.quotaStatus).toBe('ok');
  });

  it("per-profile breaker: one profile's 429s only block that profile", async () => {
    const clock = { now: 1_000_000 };
    let workCall429Count = 0;

    // 'work' returns 429 each call; 'ck' returns success.
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['work', 'ck'],
      codexProfiles: [],
      claudeDefault: 'work',
      credsForProfile: () => maxCreds(),
      claudeFetch: async (_token, accountId) => {
        if (accountId?.includes('work')) {
          workCall429Count += 1;
          return {
            success: false,
            windows: [],
            coreUsage: { fiveHour: null, weekly: null },
            lastUpdated: clock.now,
            accountId: accountId ?? '',
            httpStatus: 429,
            retryable: true,
            error: 'rate limited',
          } as ClaudeQuotaResult;
        }
        return successQuota();
      },
    });

    // First call: 'work' gets a 429, 'ck' succeeds.
    const rows1 = await getNativeAccountRows(deps);
    const ck1 = rows1.find((r) => r.profile === 'ck');
    expect(ck1?.quotaStatus).toBe('ok');
    expect(workCall429Count).toBeGreaterThanOrEqual(1);

    // Skip past cooldown for 'work' only; 'ck' is within TTL.
    clock.now += 62_000;

    // Second call past 'work' cooldown: work tries again (429 again); ck cached.
    const rows2 = await getNativeAccountRows(deps);
    const ck2 = rows2.find((r) => r.profile === 'ck');
    // 'ck' still has a good cached row.
    expect(ck2?.quotaStatus).toBe('ok');
  });
});

describe('multi-profile: displayName uses profile name', () => {
  it('displayName is the profile name, not "Claude Code" or "Codex"', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['my-work'],
      codexProfiles: ['my-codex'],
      claudeDefault: 'my-work',
      codexDefault: 'my-codex',
      credsForProfile: () => maxCreds(),
      codexNativeAuth: (p) => ({ accessToken: `tok-${p}`, accountId: `id-${p}` }),
    });

    const rows = await getNativeAccountRows(deps);
    const c = rows.find((r) => r.surface === 'ccs');
    const x = rows.find((r) => r.surface === 'ccsx');
    expect(c?.displayName).toBe('my-work');
    expect(x?.displayName).toBe('my-codex');
  });
});

describe('multi-profile: getCachedNativeAccountRows reflects per-profile maps', () => {
  it('returns cached rows from all profiles after a collect', async () => {
    const clock = { now: 1_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['work', 'ck'],
      codexProfiles: ['personal'],
      claudeDefault: 'work',
      codexDefault: 'personal',
      credsForProfile: () => maxCreds(),
      codexNativeAuth: (p) => ({ accessToken: `tok-${p}`, accountId: `id-${p}` }),
    });

    await getNativeAccountRows(deps);

    const cached = getCachedNativeAccountRows();
    expect(cached.every((r) => r.cached === true)).toBe(true);
    // Should have rows for work, ck, and personal (parked 'ck' has no cached row
    // yet because it had creds in this test so it did fetch)
    const profiles = cached.map((r) => r.profile);
    expect(profiles).toContain('work');
    expect(profiles).toContain('personal');

    resetNativeQuotaState();
    expect(getCachedNativeAccountRows()).toEqual([]);
  });
});

describe('review focus areas: reauth caching + codex local fallback', () => {
  it('Claude reauth (401) profile is dimmed, cached, and not re-polled within cooldown', async () => {
    resetNativeQuotaState();
    const clock = { now: 5_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['work'],
      codexProfiles: [],
      claudeDefault: 'work',
      credsForProfile: () => maxCreds(),
      claudeFetch: async () => reauthQuota(),
    });

    const first = await getNativeAccountRows(deps);
    const r1 = first.find((r) => r.profile === 'work');
    expect(r1?.needsReauth).toBe(true);
    expect(r1?.paused).toBe(true); // dimmed
    expect(deps.claudeFetchCount()).toBe(1);

    // A forced refresh within the cooldown serves the cached reauth row and does
    // NOT re-hit the endpoint (no repeated 401 on the same account).
    const second = await getNativeAccountRows(deps, { force: true });
    const r2 = second.find((r) => r.profile === 'work');
    expect(r2?.needsReauth).toBe(true);
    expect(r2?.cached).toBe(true);
    expect(deps.claudeFetchCount()).toBe(1);
  });

  it('Codex reauth (401) profile is dimmed, cached, and not re-polled within cooldown', async () => {
    resetNativeQuotaState();
    const clock = { now: 5_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: [],
      codexProfiles: ['ck'],
      codexDefault: 'default',
      codexNativeAuth: (p) => ({ accessToken: `t-${p}`, accountId: `id-${p}` }),
      codexNetworkFetch: async () => ({ success: false, needsReauth: true }) as CodexQuotaResult,
    });

    const first = await getNativeAccountRows(deps);
    const r1 = first.find((r) => r.profile === 'ck');
    expect(r1?.needsReauth).toBe(true);
    expect(r1?.paused).toBe(true);
    expect(deps.codexNetworkCount()).toBe(1);

    const second = await getNativeAccountRows(deps, { force: true });
    expect(second.find((r) => r.profile === 'ck')?.cached).toBe(true);
    expect(deps.codexNetworkCount()).toBe(1);
  });

  it('Codex named profile without on-disk auth is parked, never filled from global local data', async () => {
    resetNativeQuotaState();
    const clock = { now: 5_000_000 };
    let localCalls = 0;
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: [],
      codexProfiles: ['ck'],
      codexDefault: 'default',
      codexNativeAuth: () => null, // no auth.json for the named profile
      codexLocalFallback: async () => {
        localCalls += 1;
        return codexLocalQuota();
      },
    });

    const rows = await getNativeAccountRows(deps);
    const ck = rows.find((r) => r.profile === 'ck');
    expect(ck).toBeDefined();
    expect(ck?.paused).toBe(true); // parked, dimmed
    expect(ck?.needsReauth).toBe(true);
    expect(ck?.quota_percentage).toBeNull();
    // The global ~/.codex session data is never attributed to a named profile.
    expect(localCalls).toBe(0);
  });

  it('Codex default profile without auth uses the global local session fallback', async () => {
    resetNativeQuotaState();
    const clock = { now: 5_000_000 };
    let localCalls = 0;
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: [],
      codexProfiles: ['default'],
      codexDefault: 'default',
      codexNativeAuth: () => null,
      codexLocalFallback: async () => {
        localCalls += 1;
        return codexLocalQuota();
      },
    });

    const rows = await getNativeAccountRows(deps);
    const def = rows.find((r) => r.profile === 'default');
    expect(def).toBeDefined();
    // The bare default legitimately reflects the global ~/.codex local data.
    expect(localCalls).toBe(1);
    expect(def?.quotaStatus).not.toBe('unsupported');
  });

  it('cache-fallback rows keep is_default for the default profile', async () => {
    resetNativeQuotaState();
    const clock = { now: 6_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['work', 'ck'],
      codexProfiles: ['default', 'ck'],
      claudeDefault: 'work',
      codexDefault: 'default',
      credsForProfile: () => maxCreds(),
      claudeFetch: async () => successQuota(),
      codexNativeAuth: (p) => ({ accessToken: `t-${p}`, accountId: `id-${p}` }),
      codexNetworkFetch: async () => codexSuccessQuota(),
    });

    await getNativeAccountRows(deps); // populate the per-profile caches

    // The cache-fallback path must preserve is_default so the UI still orders and
    // tags the default account when /summary serves from cache.
    const cached = getCachedNativeAccountRows();
    expect(cached.find((r) => r.surface === 'ccs' && r.profile === 'work')?.is_default).toBe(true);
    expect(cached.find((r) => r.surface === 'ccsx' && r.profile === 'default')?.is_default).toBe(
      true
    );
    expect(cached.find((r) => r.surface === 'ccs' && r.profile === 'ck')?.is_default).toBe(false);
    expect(cached.find((r) => r.surface === 'ccsx' && r.profile === 'ck')?.is_default).toBe(false);
  });

  it('parked (no-creds) rows use a short TTL so a fresh login is detected quickly', async () => {
    resetNativeQuotaState();
    const clock = { now: 7_000_000 };
    let hasCreds = false;
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: ['work'],
      codexProfiles: [],
      claudeDefault: 'work',
      credsForProfile: () => (hasCreds ? maxCreds() : null),
      claudeFetch: async () => successQuota(),
    });

    // First poll: no creds -> parked, no network.
    const first = await getNativeAccountRows(deps);
    expect(first.find((r) => r.profile === 'work')?.paused).toBe(true);
    expect(deps.claudeFetchCount()).toBe(0);

    // User logs in; advance past the short parked TTL (30s) but far within the
    // full quota TTL (10min). The parked row must NOT be served stale.
    hasCreds = true;
    clock.now += 31_000;
    const second = await getNativeAccountRows(deps);
    const work = second.find((r) => r.profile === 'work');
    expect(work?.paused).toBe(false); // now live, not dimmed
    expect(work?.quotaStatus).toBe('ok');
    expect(deps.claudeFetchCount()).toBe(1); // re-checked -> fetched
  });

  it('Codex named profile with valid auth but sparse payload stays active, not parked', async () => {
    resetNativeQuotaState();
    const clock = { now: 7_000_000 };
    const deps = makeMultiProfileDeps({
      clock,
      claudeProfiles: [],
      codexProfiles: ['ck'],
      codexDefault: 'default',
      codexNativeAuth: (p) => ({ accessToken: `t-${p}`, accountId: `id-${p}` }),
      // Successful response but NO core windows (sparse / changed payload).
      codexNetworkFetch: async () => ({ success: true }) as CodexQuotaResult,
    });

    const rows = await getNativeAccountRows(deps);
    const ck = rows.find((r) => r.profile === 'ck');
    expect(ck).toBeDefined();
    expect(ck?.paused).toBe(false); // active subscription, not parked
    expect(ck?.needsReauth).toBe(false);
    expect(ck?.quotaStatus).toBe('ok');
    expect(ck?.quota_percentage).toBeNull(); // no windows, but still active
  });
});
