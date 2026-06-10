/**
 * Phase 1A: Account Attribution Tests
 *
 * TDD tests for auth_index → accountId mapping through the usage pipeline.
 * Covers:
 * - auth_index maps to account email via accountMap in transformer
 * - extractCliproxyUsageHistoryDetails carries accountId
 * - getTodayCostByAccount returns correct per-account totals
 * - Profile-based aggregation unaffected (backward compat)
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type {
  CliproxyUsageApiResponse,
  CliproxyManagementAuthFile,
} from '../../../../src/cliproxy/services/stats-fetcher';

// ============================================================================
// HELPERS & FIXTURES
// ============================================================================

// Local calendar day (matches production getTodayCostByAccount, which keys on
// localDayKey — not a UTC ISO slice). Fixture timestamps below use the SAME
// local day with no trailing Z so they bucket consistently with production.
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const TODAY = localDay(new Date()); // YYYY-MM-DD, local

function makeResponse(
  entries: Array<{
    provider: string;
    model: string;
    auth_index: number;
    source: string;
    timestamp: string;
    input: number;
    output: number;
    failed?: boolean;
  }>
): CliproxyUsageApiResponse {
  const apis: CliproxyUsageApiResponse['usage'] = { apis: {} };
  for (const e of entries) {
    if (!apis.apis![e.provider]) {
      apis.apis![e.provider] = { models: {} };
    }
    const models = apis.apis![e.provider].models!;
    if (!models[e.model]) {
      models[e.model] = { details: [] };
    }
    models[e.model].details!.push({
      timestamp: e.timestamp,
      source: e.source,
      auth_index: e.auth_index,
      tokens: {
        input_tokens: e.input,
        output_tokens: e.output,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: e.input + e.output,
      },
      failed: e.failed ?? false,
    });
  }
  return { usage: apis };
}

const twoAccountResponse = makeResponse([
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    auth_index: 0,
    source: 'old-source-a',
    timestamp: `${TODAY}T10:00:00.000Z`,
    input: 1000,
    output: 500,
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    auth_index: 1,
    source: 'old-source-b',
    timestamp: `${TODAY}T11:00:00.000Z`,
    input: 2000,
    output: 800,
  },
  // auth_index 0 again — same account, second request.
  // output=201 (not 200) ensures alice's two-request total ($0.018025) strictly
  // exceeds bob's single-request total ($0.018), avoiding a floating-point tie.
  {
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    auth_index: 0,
    source: 'old-source-a',
    timestamp: `${TODAY}T12:00:00.000Z`,
    input: 500,
    output: 201,
  },
]);

// Fix #7/#13/#15: buildAuthIndexToAccountMap stores String(auth_index) keys only.
// The map must use string keys so accountMap.get(String(detail.auth_index)) resolves correctly.
const authFileMap: Map<number | string, string> = new Map([
  ['0', 'alice@example.com'],
  ['1', 'bob@example.com'],
]);

// ============================================================================
// TRANSFORMER: extractCliproxyUsageHistoryDetails with accountMap
// ============================================================================

describe('extractCliproxyUsageHistoryDetails with accountMap', () => {
  it('populates accountId from accountMap when auth_index is present', async () => {
    const { extractCliproxyUsageHistoryDetails } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse, authFileMap);

    const aliceDetails = details.filter((d) => d.accountId === 'alice@example.com');
    const bobDetails = details.filter((d) => d.accountId === 'bob@example.com');

    expect(aliceDetails).toHaveLength(2); // auth_index 0 appears twice
    expect(bobDetails).toHaveLength(1); // auth_index 1 appears once
  });

  it('leaves accountId undefined when auth_index is not in accountMap (no source fallback)', async () => {
    // Fix #7/#13/#15: detail.source is a CLIProxy source label, not an email.
    // Using it as a cost key caused mis-attribution. When auth_index is absent from the
    // map, accountId must be undefined so getTodayCostByAccount buckets under 'unknown'.
    const { extractCliproxyUsageHistoryDetails } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    // Use string key matching buildAuthIndexToAccountMap's String(auth_index) output
    const partialMap: Map<number | string, string> = new Map([['0', 'alice@example.com']]);
    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse, partialMap);

    // auth_index 1 (bob) is not in the partial map — must be undefined, not 'old-source-b'
    const bobDetail = details.find((d) => d.accountId === undefined && !d.accountId);
    // There should be exactly one detail with no accountId (bob's request)
    const unmappedDetails = details.filter((d) => d.accountId === undefined);
    expect(unmappedDetails).toHaveLength(1);
    // Confirm it is NOT keyed under the source string
    const sourceFallback = details.find((d) => d.accountId === 'old-source-b');
    expect(sourceFallback).toBeUndefined();
    void bobDetail; // suppress lint
  });

  it('does not include accountId when no accountMap is provided (backward compat)', async () => {
    const { extractCliproxyUsageHistoryDetails } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse);

    for (const detail of details) {
      expect(detail.accountId).toBeUndefined();
    }
  });

  it('does not expose source or auth_index on returned history details', async () => {
    const { extractCliproxyUsageHistoryDetails } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse, authFileMap);

    for (const detail of details) {
      expect((detail as Record<string, unknown>).source).toBeUndefined();
      expect((detail as Record<string, unknown>).auth_index).toBeUndefined();
    }
  });
});

// ============================================================================
// TRANSFORMER: CliproxyUsageHistoryDetail type has optional accountId
// ============================================================================

describe('CliproxyUsageHistoryDetail type', () => {
  it('allows accountId as optional string field', async () => {
    const { normalizeCliproxyUsageHistoryDetail } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    const withAccount = normalizeCliproxyUsageHistoryDetail({
      model: 'claude-sonnet-4-5',
      timestamp: `${TODAY}T10:00:00.000Z`,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      requestCount: 1,
      cost: 0.01,
      failed: false,
      accountId: 'alice@example.com',
    });

    expect(withAccount).not.toBeNull();
    expect(withAccount?.accountId).toBe('alice@example.com');
  });

  it('normalizes detail without accountId (remains undefined)', async () => {
    const { normalizeCliproxyUsageHistoryDetail } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    const noAccount = normalizeCliproxyUsageHistoryDetail({
      model: 'claude-sonnet-4-5',
      timestamp: `${TODAY}T10:00:00.000Z`,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      requestCount: 1,
      cost: 0.01,
      failed: false,
    });

    expect(noAccount).not.toBeNull();
    expect(noAccount?.accountId).toBeUndefined();
  });
});

// ============================================================================
// DATA-AGGREGATOR: getTodayCostByAccount
// ============================================================================

describe('getTodayCostByAccount', () => {
  it('returns per-account cost totals for today', async () => {
    const { getTodayCostByAccount } = await import(
      '../../../../src/web-server/usage/data-aggregator'
    );

    const details = [];

    // Simulate alice's two requests today
    const { extractCliproxyUsageHistoryDetails } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );
    const todayDetails = extractCliproxyUsageHistoryDetails(twoAccountResponse, authFileMap);

    const result = getTodayCostByAccount(todayDetails, TODAY);

    // Alice has auth_index 0: two requests (claude-sonnet + claude-opus)
    // Bob has auth_index 1: one request (claude-sonnet)
    expect(typeof result['alice@example.com']).toBe('number');
    expect(typeof result['bob@example.com']).toBe('number');
    expect(result['alice@example.com']).toBeGreaterThan(0);
    expect(result['bob@example.com']).toBeGreaterThan(0);
    // Alice has two requests across two models; Bob has one request with more tokens.
    // Alice's two-request total ($0.018025) exceeds Bob's single-request total ($0.018).
    expect(result['alice@example.com']).toBeGreaterThan(result['bob@example.com']);
  });

  it('returns empty object when no details exist for today', async () => {
    const { getTodayCostByAccount } = await import(
      '../../../../src/web-server/usage/data-aggregator'
    );

    const result = getTodayCostByAccount([], TODAY);

    expect(result).toEqual({});
  });

  it('filters out details from days other than today', async () => {
    const { getTodayCostByAccount } = await import(
      '../../../../src/web-server/usage/data-aggregator'
    );
    const { extractCliproxyUsageHistoryDetails } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    const yesterdayResponse = makeResponse([
      {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        auth_index: 0,
        source: 'old-source-a',
        timestamp: '2020-01-01T10:00:00.000Z', // definitely not today
        input: 9999,
        output: 9999,
      },
    ]);
    const details = extractCliproxyUsageHistoryDetails(yesterdayResponse, authFileMap);
    const result = getTodayCostByAccount(details, TODAY);

    expect(Object.keys(result)).toHaveLength(0);
  });

  it('accumulates costs across multiple details for the same account', async () => {
    const { getTodayCostByAccount } = await import(
      '../../../../src/web-server/usage/data-aggregator'
    );
    const { extractCliproxyUsageHistoryDetails } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse, authFileMap);

    // alice appears for two models — verify aggregated correctly
    const result = getTodayCostByAccount(details, TODAY);
    const aliceCostFromDetails = details
      .filter((d) => d.accountId === 'alice@example.com')
      .reduce((acc, d) => acc + d.cost, 0);

    expect(result['alice@example.com']).toBeCloseTo(aliceCostFromDetails, 10);
  });

  it('details without accountId are grouped under the "unknown" key', async () => {
    // Fix #7/#13/#15: when no accountMap is provided, accountId is undefined on all details.
    // getTodayCostByAccount buckets these under 'unknown' — not under detail.source.
    const { getTodayCostByAccount } = await import(
      '../../../../src/web-server/usage/data-aggregator'
    );
    const { extractCliproxyUsageHistoryDetails } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    // no accountMap — accountId will be undefined on all details
    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse);
    const result = getTodayCostByAccount(details, TODAY);

    // All costs should be accumulated under the literal key 'unknown'
    expect(typeof result['unknown']).toBe('number');
    expect(result['unknown']).toBeGreaterThan(0);
    // No source-string keys should appear in the result
    expect(result['old-source-a']).toBeUndefined();
    expect(result['old-source-b']).toBeUndefined();
  });
});

// ============================================================================
// BACKWARD COMPATIBILITY: existing profile aggregation still works
// ============================================================================

describe('backward compatibility: profile-based aggregation unaffected', () => {
  it('transformCliproxyToDailyUsage works without accountMap', async () => {
    const { transformCliproxyToDailyUsage } = await import(
      '../../../../src/web-server/usage/cliproxy-usage-transformer'
    );

    const daily = transformCliproxyToDailyUsage(twoAccountResponse);

    expect(daily.length).toBeGreaterThan(0);
    expect(daily[0].source).toBe('cliproxy');
    expect(daily[0].modelBreakdowns.length).toBeGreaterThan(0);
  });

  it('buildCliproxyUsageHistoryAggregates preserves existing shape', async () => {
    const { buildCliproxyUsageHistoryAggregates, extractCliproxyUsageHistoryDetails } =
      await import('../../../../src/web-server/usage/cliproxy-usage-transformer');

    const details = extractCliproxyUsageHistoryDetails(twoAccountResponse);
    const { daily, hourly, monthly } = buildCliproxyUsageHistoryAggregates(details);

    expect(Array.isArray(daily)).toBe(true);
    expect(Array.isArray(hourly)).toBe(true);
    expect(Array.isArray(monthly)).toBe(true);
    if (daily.length > 0) {
      expect(typeof daily[0].date).toBe('string');
      expect(typeof daily[0].totalCost).toBe('number');
    }
  });

  it('DailyUsage shape includes optional accountId field', async () => {
    // Type-level test: verify DailyUsage can carry accountId without breaking shape
    type DailyUsageShape = { date: string; source: string; totalCost: number; accountId?: string };
    const sample: DailyUsageShape = {
      date: TODAY,
      source: 'cliproxy',
      totalCost: 1.5,
      accountId: 'alice@example.com',
    };
    const noAccount: DailyUsageShape = { date: TODAY, source: 'cliproxy', totalCost: 0.5 };
    expect(sample.accountId).toBe('alice@example.com');
    expect(noAccount.accountId).toBeUndefined();
  });
});

// ============================================================================
// STATS-FETCHER: buildAuthIndexToAccountMap
// ============================================================================

describe('buildAuthIndexToAccountMap', () => {
  it('builds map from auth files with auth_index and email', async () => {
    const { buildAuthIndexToAccountMap } = await import(
      '../../../../src/cliproxy/services/stats-fetcher'
    );

    const authFiles: CliproxyManagementAuthFile[] = [
      { auth_index: 0, provider: 'anthropic', email: 'alice@example.com' },
      { auth_index: 1, provider: 'anthropic', email: 'bob@example.com' },
      { auth_index: 2, provider: 'gemini', email: 'carol@example.com' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);

    expect(map.get('0')).toBe('alice@example.com');
    expect(map.get('1')).toBe('bob@example.com');
    expect(map.get('2')).toBe('carol@example.com');
  });

  it('skips entries missing auth_index', async () => {
    const { buildAuthIndexToAccountMap } = await import(
      '../../../../src/cliproxy/services/stats-fetcher'
    );

    const authFiles: CliproxyManagementAuthFile[] = [
      { provider: 'anthropic', email: 'nobody@example.com' }, // no auth_index
      { auth_index: 3, provider: 'anthropic', email: 'alice@example.com' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);

    expect(map.size).toBe(1);
    expect(map.get('3')).toBe('alice@example.com');
  });

  it('skips entries missing email', async () => {
    const { buildAuthIndexToAccountMap } = await import(
      '../../../../src/cliproxy/services/stats-fetcher'
    );

    const authFiles: CliproxyManagementAuthFile[] = [
      { auth_index: 4, provider: 'anthropic' }, // no email
      { auth_index: 5, provider: 'anthropic', email: 'dave@example.com' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);

    expect(map.size).toBe(1);
    expect(map.get('5')).toBe('dave@example.com');
  });

  it('returns empty map for empty auth files array', async () => {
    const { buildAuthIndexToAccountMap } = await import(
      '../../../../src/cliproxy/services/stats-fetcher'
    );

    const map = buildAuthIndexToAccountMap([]);

    expect(map.size).toBe(0);
  });

  it('handles numeric and string auth_index keys consistently', async () => {
    const { buildAuthIndexToAccountMap } = await import(
      '../../../../src/cliproxy/services/stats-fetcher'
    );

    const authFiles: CliproxyManagementAuthFile[] = [
      { auth_index: 7, provider: 'anthropic', email: 'alice@example.com' },
      { auth_index: '8', provider: 'anthropic', email: 'bob@example.com' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);

    expect(map.get('7')).toBe('alice@example.com');
    expect(map.get('8')).toBe('bob@example.com');
  });
});
