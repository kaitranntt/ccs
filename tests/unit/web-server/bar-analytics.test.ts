import { describe, it, expect } from 'bun:test';
import {
  computeBarAnalytics,
  computeBarAnalyticsFromDaily,
  localDayKey,
} from '../../../src/web-server/usage/bar-analytics';
import type { CliproxyUsageHistoryDetail } from '../../../src/web-server/usage/cliproxy-usage-transformer';
import type { DailyUsage, HourlyUsage } from '../../../src/web-server/usage/types';

const NOW = new Date('2026-06-08T12:00:00-04:00');

function detail(over: Partial<CliproxyUsageHistoryDetail>): CliproxyUsageHistoryDetail {
  return {
    model: 'gpt-5.5',
    timestamp: NOW.toISOString(),
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    requestCount: 1,
    cost: 1,
    failed: false,
    ...over,
  };
}

/** Build an ISO timestamp `n` whole days before NOW (local). */
function daysAgo(n: number): string {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n, 10, 0, 0);
  return d.toISOString();
}

describe('computeBarAnalytics', () => {
  it('returns an empty/zeroed payload for no details', () => {
    const a = computeBarAnalytics([], NOW);
    expect(a.today.cost).toBe(0);
    expect(a.allTime.cost).toBe(0);
    expect(a.byDay).toHaveLength(30);
    expect(a.topModels).toHaveLength(0);
    expect(a.topModelsWindow).toBe('all');
    // No usable records → no last-activity signal, not stale-but-present.
    expect(a.lastActivityAt).toBeNull();
    expect(a.daysSinceLastActivity).toBeNull();
    expect(a.hasRecentData).toBe(false);
  });

  it('rolls today / 7d / 30d / allTime into the right windows', () => {
    const a = computeBarAnalytics(
      [
        detail({ timestamp: daysAgo(0), cost: 2, requestCount: 1 }), // today
        detail({ timestamp: daysAgo(3), cost: 3, requestCount: 2 }), // 7d + 30d
        detail({ timestamp: daysAgo(20), cost: 5, requestCount: 1 }), // 30d only
        detail({ timestamp: daysAgo(90), cost: 10, requestCount: 4 }), // allTime only
      ],
      NOW
    );
    expect(a.today.cost).toBe(2);
    expect(a.last7d.cost).toBe(5); // 2 + 3
    expect(a.last30d.cost).toBe(10); // 2 + 3 + 5
    expect(a.allTime.cost).toBe(20); // + 10
    expect(a.allTime.requests).toBe(8);
  });

  it('excludes failed requests from spend', () => {
    const a = computeBarAnalytics(
      [detail({ cost: 9, failed: true }), detail({ cost: 1, failed: false })],
      NOW
    );
    expect(a.today.cost).toBe(1);
    expect(a.allTime.cost).toBe(1);
  });

  it('zero-fills the 30-day sparkline in chronological order', () => {
    const a = computeBarAnalytics([detail({ timestamp: daysAgo(2), cost: 4 })], NOW);
    expect(a.byDay).toHaveLength(30);
    // oldest first, newest last
    expect(a.byDay[0].date < a.byDay[29].date).toBe(true);
    const hit = a.byDay.find((d) => d.cost > 0);
    expect(hit?.cost).toBe(4);
  });

  it('populates sparkline days 8..30 from records older than the 7-day window', () => {
    // A record 20 days ago is outside last7d but inside the 30-day sparkline:
    // the bucket must fill so the chart isn't flat when only old data exists.
    const a = computeBarAnalytics([detail({ timestamp: daysAgo(20), cost: 6 })], NOW);
    expect(a.last7d.cost).toBe(0); // 7-day window math unchanged
    const hit = a.byDay.find((d) => d.cost > 0);
    expect(hit?.cost).toBe(6);
  });

  it('reports last-activity and hasRecentData from the freshest non-failed record', () => {
    const recent = daysAgo(1);
    const a = computeBarAnalytics(
      [
        detail({ timestamp: daysAgo(5), cost: 1 }),
        detail({ timestamp: recent, cost: 2 }),
        // failed record must NOT count as activity even though it's newer
        detail({ timestamp: daysAgo(0), cost: 9, failed: true }),
      ],
      NOW
    );
    expect(a.lastActivityAt).toBe(recent);
    expect(a.daysSinceLastActivity).toBe(1);
    expect(a.hasRecentData).toBe(true);
  });

  it('reports hasRecentData false and last-activity from old data when the 30-day window is idle', () => {
    const old = daysAgo(45);
    const a = computeBarAnalytics([detail({ timestamp: old, cost: 5 })], NOW);
    expect(a.hasRecentData).toBe(false);
    expect(a.lastActivityAt).toBe(old);
    expect(a.daysSinceLastActivity).toBe(45);
  });

  it('ranks top models by spend and labels the window 30d when recent data exists', () => {
    const a = computeBarAnalytics(
      [
        detail({ model: 'gpt-5.4', timestamp: daysAgo(1), cost: 5 }),
        detail({ model: 'gpt-5.5', timestamp: daysAgo(1), cost: 8 }),
        detail({ model: 'gpt-5.4', timestamp: daysAgo(2), cost: 2 }),
      ],
      NOW
    );
    expect(a.topModelsWindow).toBe('30d');
    expect(a.topModels[0].model).toBe('gpt-5.5'); // 8
    expect(a.topModels[1].model).toBe('gpt-5.4'); // 7
  });

  it('falls back to all-time top models when the last 30 days are idle', () => {
    const a = computeBarAnalytics(
      [
        detail({ model: 'gpt-5.4', timestamp: daysAgo(60), cost: 100 }),
        detail({ model: 'gpt-5.5', timestamp: daysAgo(45), cost: 40 }),
      ],
      NOW
    );
    expect(a.last30d.cost).toBe(0);
    expect(a.topModelsWindow).toBe('all');
    expect(a.topModels[0].model).toBe('gpt-5.4');
  });

  it('sums monthToDate from only current-calendar-month records, even when prior-month data is inside the rolling 30d', () => {
    // NOW is 2026-06-08. A 2026-05-25 record is 14 days ago: inside last30d but
    // in the PRIOR calendar month, so it must NOT count toward June MTD.
    const a = computeBarAnalytics(
      [
        detail({ timestamp: '2026-06-02T10:00:00-04:00', cost: 3, requestCount: 2 }), // June
        detail({ timestamp: '2026-06-08T09:00:00-04:00', cost: 4, requestCount: 1 }), // June (today)
        detail({ timestamp: '2026-05-25T10:00:00-04:00', cost: 5, requestCount: 9 }), // May, within 30d
      ],
      NOW
    );
    expect(a.monthToDate.cost).toBe(7); // 3 + 4, May excluded
    expect(a.monthToDate.requests).toBe(3); // 2 + 1
    // last30d still includes the May record — proves MTD is a distinct window.
    expect(a.last30d.cost).toBe(12);
  });

  it('returns zeroed monthToDate for no details', () => {
    const a = computeBarAnalytics([], NOW);
    expect(a.monthToDate).toEqual({ cost: 0, requests: 0 });
  });
});

function daily(over: Partial<DailyUsage>): DailyUsage {
  return {
    date: '2026-06-08',
    source: 'cliproxy',
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
    totalCost: 0,
    modelsUsed: [],
    modelBreakdowns: [],
    ...over,
  };
}

function hourly(over: Partial<HourlyUsage>): HourlyUsage {
  return {
    hour: '2026-06-08 10:00',
    source: 'cliproxy',
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
    totalCost: 0,
    modelsUsed: [],
    modelBreakdowns: [],
    requestCount: 0,
    ...over,
  };
}

describe('computeBarAnalyticsFromDaily — monthToDate', () => {
  it('sums monthToDate cost (daily) and requests (hourly) for only the current calendar month', () => {
    const a = computeBarAnalyticsFromDaily(
      [
        daily({ date: '2026-06-02', totalCost: 10 }), // June
        daily({ date: '2026-06-08', totalCost: 4 }), // June (today)
        daily({ date: '2026-05-25', totalCost: 7 }), // May, still within 30d
      ],
      [
        hourly({ hour: '2026-06-02 10:00', requestCount: 5 }), // June
        hourly({ hour: '2026-06-08 09:00', requestCount: 3 }), // June
        hourly({ hour: '2026-05-25 10:00', requestCount: 99 }), // May
      ],
      NOW
    );
    expect(a.monthToDate.cost).toBe(14); // 10 + 4, May excluded
    expect(a.monthToDate.requests).toBe(8); // 5 + 3, May excluded
    // Distinct from last30d, which still carries the prior-month May record.
    expect(a.last30d.cost).toBe(21);
  });

  it('resets monthToDate toward 0 on a fresh-month boundary while last30d stays populated', () => {
    // Treat the 1st of the month as "now": all activity sits in the prior month,
    // so MTD must be ~0 even though those days remain inside the rolling 30d.
    const firstOfMonth = new Date('2026-06-01T08:00:00-04:00');
    const a = computeBarAnalyticsFromDaily(
      [daily({ date: '2026-05-20', totalCost: 12 }), daily({ date: '2026-05-31', totalCost: 8 })],
      [hourly({ hour: '2026-05-31 10:00', requestCount: 4 })],
      firstOfMonth
    );
    expect(a.monthToDate.cost).toBe(0);
    expect(a.monthToDate.requests).toBe(0);
    expect(a.last30d.cost).toBe(20); // rolling 30d still populated
  });

  it('ignores malformed aggregate date keys instead of throwing', () => {
    const a = computeBarAnalyticsFromDaily(
      [daily({ date: 'May 1 2026', totalCost: 10 }), daily({ date: '2026-06-08', totalCost: 4 })],
      [
        hourly({ hour: 'May 1 2026 00:00', requestCount: 5 }),
        hourly({ hour: '2026-06-08 09:00', requestCount: 3 }),
      ],
      NOW
    );

    expect(a.today.cost).toBe(4);
    expect(a.today.requests).toBe(3);
    expect(a.allTime.cost).toBe(4);
    expect(a.allTime.requests).toBe(3);
    expect(a.lastActivityAt).toBe(new Date(2026, 5, 8).toISOString());
    expect(a.daysSinceLastActivity).toBe(0);
  });

  it('returns zeroed monthToDate for empty daily and hourly input', () => {
    const a = computeBarAnalyticsFromDaily([], [], NOW);
    expect(a.monthToDate).toEqual({ cost: 0, requests: 0 });
  });
});

// ============================================================================
// byHour — 24-bucket intra-day spend chart for today
// ============================================================================

describe('byHour — intra-day spend chart', () => {
  // NOW = 2026-06-08T12:00:00-04:00. byHour buckets are the user's LOCAL clock
  // hours; the pipeline's hour keys are UTC and get converted to local. These
  // tests build UTC keys FROM the desired local time so they pass regardless of
  // the test runner's timezone (the round-trip is machine-TZ-independent).
  const todayKey = localDayKey(NOW);
  const pad = (n: number): string => String(n).padStart(2, '0');

  /** A machine-local Date at `hour` o'clock on NOW's local calendar day (+dayOffset). */
  function localDayAt(hour: number, dayOffset = 0): Date {
    return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + dayOffset, hour, 0, 0);
  }

  /** The UTC "YYYY-MM-DD HH:00" key that converts back to `local`'s clock hour. */
  function utcHourKeyForLocal(local: Date): string {
    return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(
      local.getUTCDate()
    )} ${pad(local.getUTCHours())}:00`;
  }

  it('computeBarAnalytics returns byHour as empty array (snapshot path has no hourly)', () => {
    const a = computeBarAnalytics([], NOW);
    expect(Array.isArray(a.byHour)).toBe(true);
    expect(a.byHour).toHaveLength(0);
  });

  it('computeBarAnalyticsFromDaily returns exactly 24 hour buckets', () => {
    const a = computeBarAnalyticsFromDaily([], [], NOW);
    expect(a.byHour).toHaveLength(24);
  });

  it('hour buckets are LOCAL, ordered 00:00 → 23:00', () => {
    const a = computeBarAnalyticsFromDaily([], [], NOW);
    expect(a.byHour[0].hour).toBe(`${todayKey} 00:00`);
    expect(a.byHour[23].hour).toBe(`${todayKey} 23:00`);
    for (let i = 1; i < 24; i++) {
      expect(a.byHour[i].hour > a.byHour[i - 1].hour).toBe(true);
    }
  });

  it('hours with no data are zero-filled', () => {
    const a = computeBarAnalyticsFromDaily([], [], NOW);
    for (const h of a.byHour) {
      expect(h.cost).toBe(0);
      expect(h.requests).toBe(0);
    }
  });

  it('a UTC hour key lands in the matching LOCAL hour bucket (not the raw UTC hour)', () => {
    // Activity at local 10:00 today, encoded as its UTC key.
    const a = computeBarAnalyticsFromDaily(
      [],
      [
        hourly({ hour: utcHourKeyForLocal(localDayAt(10)), totalCost: 3.5, requestCount: 2 }),
        hourly({ hour: utcHourKeyForLocal(localDayAt(14)), totalCost: 1.0, requestCount: 1 }),
      ],
      NOW
    );
    expect(a.byHour[10].hour).toBe(`${todayKey} 10:00`);
    expect(a.byHour[10].cost).toBeCloseTo(3.5);
    expect(a.byHour[10].requests).toBe(2);
    expect(a.byHour[14].cost).toBeCloseTo(1.0);
    expect(a.byHour[14].requests).toBe(1);
  });

  it('late local-evening activity (next day in UTC) still lands in TODAY', () => {
    // local 23:00 today is the next calendar day in any UTC-negative zone; it
    // must NOT be dropped from today's chart (regression guard for the TZ bug).
    const a = computeBarAnalyticsFromDaily(
      [],
      [hourly({ hour: utcHourKeyForLocal(localDayAt(23)), totalCost: 7, requestCount: 4 })],
      NOW
    );
    expect(a.byHour[23].cost).toBeCloseTo(7);
    expect(a.byHour[23].requests).toBe(4);
    // Every other hour stays zero.
    for (let i = 0; i < 23; i++) expect(a.byHour[i].cost).toBe(0);
  });

  it('yesterday-local activity does NOT land in today buckets', () => {
    const a = computeBarAnalyticsFromDaily(
      [],
      [hourly({ hour: utcHourKeyForLocal(localDayAt(10, -1)), totalCost: 99, requestCount: 10 })],
      NOW
    );
    for (const h of a.byHour) {
      expect(h.cost).toBe(0);
      expect(h.requests).toBe(0);
    }
  });

  it('accumulates multiple sources into the same local hour bucket', () => {
    const key = utcHourKeyForLocal(localDayAt(9));
    const a = computeBarAnalyticsFromDaily(
      [],
      [
        hourly({ hour: key, source: 'custom-parser', totalCost: 2.0, requestCount: 3 }),
        hourly({ hour: key, source: 'codex-native', totalCost: 1.5, requestCount: 1 }),
      ],
      NOW
    );
    expect(a.byHour[9].cost).toBeCloseTo(3.5);
    expect(a.byHour[9].requests).toBe(4);
  });

  it('prefers finite totalCost over cost (0 is a valid total)', () => {
    const a = computeBarAnalyticsFromDaily(
      [],
      [
        hourly({
          hour: utcHourKeyForLocal(localDayAt(11)),
          cost: 2.2,
          totalCost: 0,
          requestCount: 1,
        }),
      ],
      NOW
    );
    // totalCost = 0 is finite so it wins — the bucket stays 0.
    expect(a.byHour[11].cost).toBeCloseTo(0);
  });
});
