/**
 * Bar Analytics Aggregator
 *
 * Pure functions that roll up the flat CliproxyUsageHistoryDetail array (the
 * same snapshot the bar already loads for per-account cost) into the small,
 * glanceable analytics the menu bar surfaces: today / 7-day / 30-day spend,
 * a 7-day cost sparkline, and the top models by spend.
 *
 * Kept dependency-free and deterministic (the reference "now" is injected) so
 * it is trivially unit-testable and cheap enough to run on every bar open.
 */

import type { CliproxyUsageHistoryDetail } from './cliproxy-usage-transformer';
import type { DailyUsage, HourlyUsage } from './types';

/** A single day's roll-up (local-day granularity). */
export interface BarAnalyticsDay {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  cost: number;
  requests: number;
}

/**
 * One hour's roll-up for today's spend chart.
 * `hour` is the user's LOCAL "YYYY-MM-DD HH:00" clock hour (the UTC keys from
 * HourlyUsage are converted to local before bucketing). Covers exactly 24
 * buckets (00:00..23:00) for today only; zero-filled when no activity was
 * recorded in that hour.
 */
export interface BarAnalyticsHour {
  /** Local "YYYY-MM-DD HH:00" clock-hour bucket key. */
  hour: string;
  cost: number;
  requests: number;
}

/**
 * One usage surface's contribution to spend over the active window.
 * A "surface" is the tool/origin a request came from (Claude Code, Codex, the
 * CLIProxy router, Droid, …) — the dimension the menu bar uses to answer
 * "where is my usage actually going".
 */
export interface BarAnalyticsSurface {
  /** Raw pipeline source key (custom-parser | codex-native | cliproxy | droid-native | …). */
  source: string;
  /** Human label shown in the bar (Claude Code, Codex, CLIProxy, Droid, …). */
  surface: string;
  cost: number;
  requests: number;
}

/** Aggregate spend over a rolling window. */
export interface BarAnalyticsWindow {
  cost: number;
  requests: number;
}

/** One model's contribution to spend over the trailing 7 days. */
export interface BarAnalyticsModel {
  model: string;
  cost: number;
  requests: number;
}

/** The full analytics payload returned by GET /api/bar/analytics. */
export interface BarAnalytics {
  today: BarAnalyticsWindow;
  last7d: BarAnalyticsWindow;
  last30d: BarAnalyticsWindow;
  /**
   * Honest calendar month-to-date (1st of the current local month → now), NOT a
   * rolling 30 days. A fresh month resets this toward ~0 even when `last30d`
   * stays populated, so a monthly-cap alert measures the real billing month.
   */
  monthToDate: BarAnalyticsWindow;
  /** Lifetime totals across every record in the snapshot. */
  allTime: BarAnalyticsWindow;
  /** Oldest → newest, exactly 30 entries (zero-filled), for the sparkline. */
  byDay: BarAnalyticsDay[];
  /**
   * Hourly spend + request counts for today only. Exactly 24 entries ordered
   * 00:00 → 23:00 (local), zero-filled for hours with no activity. Used by the
   * bar's intra-day spend chart. `hour` keys are "YYYY-MM-DD HH:00" local time
   * matching HourlyUsage.hour. Empty array from the snapshot-only path
   * (computeBarAnalytics) which carries no hourly dimension.
   */
  byHour: BarAnalyticsHour[];
  /** Highest-spend models (descending, capped) for the window in `topModelsWindow`. */
  topModels: BarAnalyticsModel[];
  /** Which window `topModels` covers — the most recent one that has data. */
  topModelsWindow: '30d' | 'all';
  /**
   * Spend/requests broken down by usage surface (tool/origin), for the same
   * window as `topModels`. Descending by cost. Empty when no source is known
   * (e.g. the legacy snapshot-only path that carries no surface dimension).
   */
  bySurface: BarAnalyticsSurface[];
  /** ISO timestamp of the most recent non-failed usage record, null if none. */
  lastActivityAt: string | null;
  /** Whole local-days since `lastActivityAt`, null if no usable records. */
  daysSinceLastActivity: number | null;
  /**
   * True when the trailing 30 days carry any spend or requests. The UI pivots
   * its empty/stale presentation on this without re-deriving it.
   */
  hasRecentData: boolean;
  /** ISO timestamp the payload was generated. */
  generatedAt: string;
}

// 30-day trailing window: gives a non-empty sparkline shape even when the last
// 7 days are zero, so a stale-but-real history doesn't read as a broken chart.
const SPARKLINE_DAYS = 30;
const TOP_MODELS_LIMIT = 5;

/** Local-time YYYY-MM-DD key for a Date (matches the user's calendar day). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Local-time YYYY-MM key for a Date. Local (not a UTC ISO slice) so it matches
 * the local-day semantics of `dayDelta`/`localDayKey` — a record near midnight
 * lands in the same month the user sees on their calendar.
 */
function localMonthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Whole-day difference (a - b) in local days, via midnight-anchored dates. */
function dayDelta(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da.getTime() - db.getTime()) / 86_400_000);
}

/**
 * Roll the raw details into the bar analytics payload, relative to `now`.
 * Failed requests are excluded from spend (they carry no real cost).
 */
export function computeBarAnalytics(
  details: CliproxyUsageHistoryDetail[],
  now: Date
): BarAnalytics {
  const today: BarAnalyticsWindow = { cost: 0, requests: 0 };
  const last7d: BarAnalyticsWindow = { cost: 0, requests: 0 };
  const last30d: BarAnalyticsWindow = { cost: 0, requests: 0 };
  const monthToDate: BarAnalyticsWindow = { cost: 0, requests: 0 };
  const allTime: BarAnalyticsWindow = { cost: 0, requests: 0 };

  // Current local calendar month — records keyed to it feed month-to-date.
  const currentMonth = localMonthKey(now);

  // Seed the sparkline with the trailing 7 local days (zero-filled, ordered).
  const dayBuckets = new Map<string, BarAnalyticsDay>();
  for (let i = SPARKLINE_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    dayBuckets.set(localDayKey(d), { date: localDayKey(d), cost: 0, requests: 0 });
  }

  // Track per-model spend over both the trailing 30 days and all-time so we can
  // show recent leaders when fresh, and lifetime leaders when the proxy has
  // simply been idle lately.
  const model30d = new Map<string, BarAnalyticsModel>();
  const modelAll = new Map<string, BarAnalyticsModel>();
  const bump = (
    map: Map<string, BarAnalyticsModel>,
    model: string,
    cost: number,
    requests: number
  ): void => {
    const existing = map.get(model);
    if (existing) {
      existing.cost += cost;
      existing.requests += requests;
    } else {
      map.set(model, { model, cost, requests });
    }
  };

  // Epoch ms of the most recent non-failed record, tracked inside the single
  // loop the function already runs (O(1) extra per iteration, no new I/O).
  let lastActivityMs = -Infinity;

  for (const detail of details) {
    if (detail.failed) continue;
    const ts = new Date(detail.timestamp);
    if (Number.isNaN(ts.getTime())) continue;

    const delta = dayDelta(now, ts); // 0 = today, 1 = yesterday, …
    if (delta < 0) continue; // ignore future-dated noise

    if (ts.getTime() > lastActivityMs) lastActivityMs = ts.getTime();

    const cost = Number.isFinite(detail.cost) ? detail.cost : 0;
    const requests = Number.isFinite(detail.requestCount) ? detail.requestCount : 0;

    allTime.cost += cost;
    allTime.requests += requests;
    bump(modelAll, detail.model, cost, requests);

    if (localMonthKey(ts) === currentMonth) {
      monthToDate.cost += cost;
      monthToDate.requests += requests;
    }

    if (delta === 0) {
      today.cost += cost;
      today.requests += requests;
    }
    // Window math stays 7-day; only the sparkline bucket fill widens to 30.
    if (delta < 7) {
      last7d.cost += cost;
      last7d.requests += requests;
    }
    if (delta < SPARKLINE_DAYS) {
      const bucket = dayBuckets.get(localDayKey(ts));
      if (bucket) {
        bucket.cost += cost;
        bucket.requests += requests;
      }
    }
    if (delta < 30) {
      last30d.cost += cost;
      last30d.requests += requests;
      bump(model30d, detail.model, cost, requests);
    }
  }

  const lastActivityAt =
    lastActivityMs === -Infinity ? null : new Date(lastActivityMs).toISOString();
  const daysSinceLastActivity =
    lastActivityAt === null ? null : dayDelta(now, new Date(lastActivityAt));

  // Prefer recent leaders; fall back to lifetime when the last 30 days are idle.
  const recentHasData = last30d.cost > 0 || last30d.requests > 0;
  const sourceMap = recentHasData ? model30d : modelAll;
  const topModels = Array.from(sourceMap.values())
    .filter((m) => m.cost > 0 || m.requests > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, TOP_MODELS_LIMIT);

  return {
    today,
    last7d,
    last30d,
    monthToDate,
    allTime,
    byDay: Array.from(dayBuckets.values()),
    // The snapshot-detail path has no hourly dimension; return empty so the wire
    // shape is stable and callers can always iterate byHour safely.
    byHour: [],
    topModels,
    topModelsWindow: recentHasData ? '30d' : 'all',
    // The snapshot-detail path has no surface attribution; the daily path does.
    bySurface: [],
    lastActivityAt,
    daysSinceLastActivity,
    hasRecentData: recentHasData,
    generatedAt: now.toISOString(),
  };
}

// Maps a raw usage-pipeline `source` to the label shown in the bar. Unknown
// sources fall through to their raw key so a new collector is never silently
// dropped — it just shows un-prettified until added here.
const SURFACE_LABELS: Record<string, string> = {
  'custom-parser': 'Claude Code',
  'codex-native': 'Codex',
  'droid-native': 'Droid',
  cliproxy: 'CLIProxy',
};

/** Human-friendly surface name for a raw usage `source` key. */
function surfaceLabel(source: string): string {
  if (SURFACE_LABELS[source]) return SURFACE_LABELS[source];
  return source || 'Other';
}

/** Local-midnight Date from a YYYY-MM-DD day key (calendar-day anchored). */
function dateFromDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);

  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }

  return date;
}

/**
 * Convert a "YYYY-MM-DD HH:00" hour key into the user's LOCAL Date.
 *
 * The usage pipeline builds hour keys by slicing the raw ISO timestamp, which is
 * UTC for the CLIProxy/Codex/Claude sources, so the key's HH is a UTC hour. The
 * dashboard's 24H chart treats these keys as UTC and renders them in local time;
 * we do the same here so the bar's intra-day chart shows the user's own clock
 * hours (not UTC) and so a late-local-evening record — which is the next day in
 * UTC — still lands in today's local chart. Returns null for unparseable keys.
 */
function localDateFromHourKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):/.exec(key);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), 0, 0)
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Roll the merged, multi-source usage aggregates into the bar analytics payload.
 *
 * Unlike `computeBarAnalytics` (which reads only the CLIProxy snapshot — frozen
 * whenever the proxy restarts), this consumes the same merged daily/hourly data
 * the dashboard uses, so recent activity from Claude Code, Codex, Droid, and the
 * CLIProxy router all show up. `daily` carries cost+models+source; `hourly`
 * carries the request counts (daily aggregates don't), so the two are combined:
 * cost/models/surface-cost from daily, request counts from hourly.
 */
export function computeBarAnalyticsFromDaily(
  daily: DailyUsage[],
  hourly: HourlyUsage[],
  now: Date
): BarAnalytics {
  const today: BarAnalyticsWindow = { cost: 0, requests: 0 };
  const last7d: BarAnalyticsWindow = { cost: 0, requests: 0 };
  const last30d: BarAnalyticsWindow = { cost: 0, requests: 0 };
  const monthToDate: BarAnalyticsWindow = { cost: 0, requests: 0 };
  const allTime: BarAnalyticsWindow = { cost: 0, requests: 0 };

  // Daily keys (YYYY-MM-DD) and hourly keys (YYYY-MM-DD HH:00) are already local,
  // so slice(0,7) yields the local YYYY-MM to compare against the current month.
  const currentMonth = localMonthKey(now);

  // Today's local day key — used to seed the 24 intra-day buckets for the
  // spend chart and to filter which hourly records belong to today (local).
  const todayKey = localDayKey(now);

  // Seed 24 zero-filled hour buckets for today, ordered 00 → 23, keyed by the
  // user's LOCAL clock hour ("YYYY-MM-DD HH:00" in local time). The UTC hour
  // keys from the usage pipeline are converted to local before being bucketed
  // here (see localDateFromHourKey), so the chart shows the user's own hours.
  const hourBuckets = new Map<string, BarAnalyticsHour>();
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, '0');
    const key = `${todayKey} ${hh}:00`;
    hourBuckets.set(key, { hour: key, cost: 0, requests: 0 });
  }

  const dayBuckets = new Map<string, BarAnalyticsDay>();
  for (let i = SPARKLINE_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    dayBuckets.set(localDayKey(d), { date: localDayKey(d), cost: 0, requests: 0 });
  }

  const model30d = new Map<string, BarAnalyticsModel>();
  const modelAll = new Map<string, BarAnalyticsModel>();
  const bumpModel = (map: Map<string, BarAnalyticsModel>, model: string, cost: number): void => {
    const existing = map.get(model);
    if (existing) existing.cost += cost;
    else map.set(model, { model, cost, requests: 0 });
  };

  const surface30d = new Map<string, BarAnalyticsSurface>();
  const surfaceAll = new Map<string, BarAnalyticsSurface>();
  const bumpSurface = (
    map: Map<string, BarAnalyticsSurface>,
    source: string,
    cost: number,
    requests: number
  ): void => {
    const existing = map.get(source);
    if (existing) {
      existing.cost += cost;
      existing.requests += requests;
    } else {
      map.set(source, { source, surface: surfaceLabel(source), cost, requests });
    }
  };

  // Latest local-day with real activity (cost or requests), across both passes.
  let lastActivityKey: string | null = null;
  const touchActivity = (dayKey: string): void => {
    if (lastActivityKey === null || dayKey > lastActivityKey) lastActivityKey = dayKey;
  };

  // Pass 1 — daily: cost, per-model spend, per-surface spend, sparkline cost.
  for (const d of daily) {
    if (!d || !d.date) continue;
    const activityDate = dateFromDayKey(d.date);
    if (!activityDate) continue;
    const delta = dayDelta(now, activityDate);
    if (delta < 0) continue; // ignore future-dated noise
    const cost = Number.isFinite(d.totalCost) ? d.totalCost : Number.isFinite(d.cost) ? d.cost : 0;
    const source = d.source || '';

    allTime.cost += cost;
    bumpSurface(surfaceAll, source, cost, 0);
    for (const mb of d.modelBreakdowns || []) {
      bumpModel(modelAll, mb.modelName, Number.isFinite(mb.cost) ? mb.cost : 0);
    }
    if (cost > 0) touchActivity(d.date);

    if (d.date.slice(0, 7) === currentMonth) monthToDate.cost += cost;

    if (delta === 0) today.cost += cost;
    if (delta < 7) last7d.cost += cost;
    if (delta < 30) {
      last30d.cost += cost;
      bumpSurface(surface30d, source, cost, 0);
      for (const mb of d.modelBreakdowns || []) {
        bumpModel(model30d, mb.modelName, Number.isFinite(mb.cost) ? mb.cost : 0);
      }
    }
    if (delta < SPARKLINE_DAYS) {
      const bucket = dayBuckets.get(d.date);
      if (bucket) bucket.cost += cost;
    }
  }

  // Pass 2 — hourly: request counts (daily aggregates don't carry them).
  // Also fills the 24-bucket intra-day spend chart for today (local time).
  for (const h of hourly) {
    if (!h || !h.hour) continue;

    // Intra-day hourly buckets (LOCAL): convert the UTC hour key to the user's
    // local time and bucket today's local hours. Done BEFORE the UTC `delta`
    // gate below so a late-local-evening record — next day in UTC — still lands
    // in today's chart. Cost precedence mirrors the daily pass (totalCost, then
    // cost). Independent of the UTC day-key math the rest of this loop uses.
    const localHourDate = localDateFromHourKey(h.hour);
    if (localHourDate && localDayKey(localHourDate) === todayKey) {
      const hCost = Number.isFinite(h.totalCost)
        ? h.totalCost
        : Number.isFinite(h.cost)
          ? h.cost
          : 0;
      const localHH = String(localHourDate.getHours()).padStart(2, '0');
      const hBucket = hourBuckets.get(`${todayKey} ${localHH}:00`);
      if (hBucket) {
        hBucket.cost += hCost;
        hBucket.requests += Number.isFinite(h.requestCount) ? (h.requestCount as number) : 0;
      }
    }

    const dayKey = h.hour.slice(0, 10);
    const activityDate = dateFromDayKey(dayKey);
    if (!activityDate) continue;
    const delta = dayDelta(now, activityDate);
    if (delta < 0) continue;
    const requests = Number.isFinite(h.requestCount) ? (h.requestCount as number) : 0;
    const source = h.source || '';

    if (requests <= 0) continue;

    allTime.requests += requests;
    bumpSurface(surfaceAll, source, 0, requests);
    touchActivity(dayKey);

    if (h.hour.slice(0, 7) === currentMonth) monthToDate.requests += requests;

    if (delta === 0) today.requests += requests;
    if (delta < 7) last7d.requests += requests;
    if (delta < 30) {
      last30d.requests += requests;
      bumpSurface(surface30d, source, 0, requests);
    }
    if (delta < SPARKLINE_DAYS) {
      const bucket = dayBuckets.get(dayKey);
      if (bucket) bucket.requests += requests;
    }
  }

  // Prefer recent leaders; fall back to lifetime when the last 30 days are idle.
  const recentHasData = last30d.cost > 0 || last30d.requests > 0;
  const topModels = Array.from((recentHasData ? model30d : modelAll).values())
    .filter((m) => m.cost > 0 || m.requests > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, TOP_MODELS_LIMIT);
  const bySurface = Array.from((recentHasData ? surface30d : surfaceAll).values())
    .filter((s) => s.cost > 0 || s.requests > 0)
    .sort((a, b) => b.cost - a.cost);

  const lastActivityDate = lastActivityKey ? dateFromDayKey(lastActivityKey) : null;
  const lastActivityAt = lastActivityDate ? lastActivityDate.toISOString() : null;
  const daysSinceLastActivity = lastActivityDate ? dayDelta(now, lastActivityDate) : null;

  return {
    today,
    last7d,
    last30d,
    monthToDate,
    allTime,
    byDay: Array.from(dayBuckets.values()),
    // 24 hour buckets for today (00:00 → 23:00 local), zero-filled.
    byHour: Array.from(hourBuckets.values()),
    topModels,
    topModelsWindow: recentHasData ? '30d' : 'all',
    bySurface,
    lastActivityAt,
    daysSinceLastActivity,
    hasRecentData: recentHasData,
    generatedAt: now.toISOString(),
  };
}
