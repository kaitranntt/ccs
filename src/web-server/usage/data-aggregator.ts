/**
 * Data Aggregator for Claude Code Usage Analytics
 *
 * Aggregates raw JSONL entries into daily, monthly, and session summaries.
 * Uses model-pricing.ts for cost calculations.
 */

import { type RawUsageEntry } from '../jsonl-parser';
import { calculateCost } from '../model-pricing';
import {
  type ModelBreakdown,
  type DailyUsage,
  type HourlyUsage,
  type MonthlyUsage,
  type SessionUsage,
} from './types';
import { getModelsUsed, normalizeUsageProvider } from './model-identity';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Extract YYYY-MM-DD from ISO timestamp */
function extractDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** Extract YYYY-MM from ISO timestamp */
function extractMonth(timestamp: string): string {
  return timestamp.slice(0, 7);
}

/** Extract YYYY-MM-DD HH:00 from ISO timestamp */
function extractHour(timestamp: string): string {
  const date = timestamp.slice(0, 10);
  const hour = timestamp.slice(11, 13) || '00';
  return `${date} ${hour}:00`;
}

/** Create model breakdown from accumulated data */
function createModelBreakdown(
  modelName: string,
  provider: string | undefined,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number
): ModelBreakdown {
  const cost = calculateCost(
    { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens },
    modelName,
    { provider }
  );

  return {
    modelName,
    ...(provider && { provider }),
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    cost,
  };
}

/** Accumulator for per-model token counts */
interface ModelAccumulator {
  modelName: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

function getEntryProvider(entry: RawUsageEntry): string | undefined {
  return normalizeUsageProvider(entry.target);
}

function getEntryModelKey(entry: RawUsageEntry): string {
  return `${getEntryProvider(entry) ?? ''}\u0000${entry.model}`;
}

function createModelAccumulator(entry: RawUsageEntry): ModelAccumulator {
  return {
    modelName: entry.model,
    provider: getEntryProvider(entry),
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };
}

// ============================================================================
// DAILY AGGREGATION
// ============================================================================

/**
 * Aggregate raw entries into daily usage summaries
 * Groups by date (YYYY-MM-DD), calculates costs per model
 */
export function aggregateDailyUsage(
  entries: RawUsageEntry[],
  source = 'custom-parser'
): DailyUsage[] {
  // Group entries by date
  const byDate = new Map<string, RawUsageEntry[]>();

  for (const entry of entries) {
    const date = extractDate(entry.timestamp);
    const existing = byDate.get(date) || [];
    existing.push(entry);
    byDate.set(date, existing);
  }

  // Build daily summaries
  const dailyUsage: DailyUsage[] = [];

  for (const [date, dateEntries] of byDate) {
    // Aggregate by model
    const modelMap = new Map<string, ModelAccumulator>();
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;

    for (const entry of dateEntries) {
      const modelKey = getEntryModelKey(entry);
      const acc = modelMap.get(modelKey) || createModelAccumulator(entry);

      acc.inputTokens += entry.inputTokens;
      acc.outputTokens += entry.outputTokens;
      acc.cacheCreationTokens += entry.cacheCreationTokens;
      acc.cacheReadTokens += entry.cacheReadTokens;
      modelMap.set(modelKey, acc);

      totalInput += entry.inputTokens;
      totalOutput += entry.outputTokens;
      totalCacheCreation += entry.cacheCreationTokens;
      totalCacheRead += entry.cacheReadTokens;
    }

    // Build model breakdowns
    const modelBreakdowns: ModelBreakdown[] = [];
    let totalCost = 0;

    for (const acc of modelMap.values()) {
      const breakdown = createModelBreakdown(
        acc.modelName,
        acc.provider,
        acc.inputTokens,
        acc.outputTokens,
        acc.cacheCreationTokens,
        acc.cacheReadTokens
      );
      modelBreakdowns.push(breakdown);
      totalCost += breakdown.cost;
    }

    // Sort breakdowns by cost descending
    modelBreakdowns.sort((a, b) => b.cost - a.cost);

    dailyUsage.push({
      date,
      source,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheCreationTokens: totalCacheCreation,
      cacheReadTokens: totalCacheRead,
      cost: totalCost,
      totalCost,
      modelsUsed: getModelsUsed(modelBreakdowns),
      modelBreakdowns,
    });
  }

  // Sort by date descending (most recent first)
  dailyUsage.sort((a, b) => b.date.localeCompare(a.date));

  return dailyUsage;
}

// ============================================================================
// HOURLY AGGREGATION
// ============================================================================

/**
 * Aggregate raw entries into hourly usage summaries
 * Groups by hour (YYYY-MM-DD HH:00), calculates costs per model
 */
export function aggregateHourlyUsage(
  entries: RawUsageEntry[],
  source = 'custom-parser'
): HourlyUsage[] {
  // Group entries by hour
  const byHour = new Map<string, RawUsageEntry[]>();

  for (const entry of entries) {
    const hour = extractHour(entry.timestamp);
    const existing = byHour.get(hour) || [];
    existing.push(entry);
    byHour.set(hour, existing);
  }

  // Build hourly summaries
  const hourlyUsage: HourlyUsage[] = [];

  for (const [hour, hourEntries] of byHour) {
    // Aggregate by model
    const modelMap = new Map<string, ModelAccumulator>();
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;

    for (const entry of hourEntries) {
      const modelKey = getEntryModelKey(entry);
      const acc = modelMap.get(modelKey) || createModelAccumulator(entry);

      acc.inputTokens += entry.inputTokens;
      acc.outputTokens += entry.outputTokens;
      acc.cacheCreationTokens += entry.cacheCreationTokens;
      acc.cacheReadTokens += entry.cacheReadTokens;
      modelMap.set(modelKey, acc);

      totalInput += entry.inputTokens;
      totalOutput += entry.outputTokens;
      totalCacheCreation += entry.cacheCreationTokens;
      totalCacheRead += entry.cacheReadTokens;
    }

    // Build model breakdowns
    const modelBreakdowns: ModelBreakdown[] = [];
    let totalCost = 0;

    for (const acc of modelMap.values()) {
      const breakdown = createModelBreakdown(
        acc.modelName,
        acc.provider,
        acc.inputTokens,
        acc.outputTokens,
        acc.cacheCreationTokens,
        acc.cacheReadTokens
      );
      modelBreakdowns.push(breakdown);
      totalCost += breakdown.cost;
    }

    // Sort breakdowns by cost descending
    modelBreakdowns.sort((a, b) => b.cost - a.cost);

    hourlyUsage.push({
      hour,
      source,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheCreationTokens: totalCacheCreation,
      cacheReadTokens: totalCacheRead,
      cost: totalCost,
      totalCost,
      modelsUsed: getModelsUsed(modelBreakdowns),
      modelBreakdowns,
      requestCount: hourEntries.length,
    });
  }

  // Sort by hour descending (most recent first)
  hourlyUsage.sort((a, b) => b.hour.localeCompare(a.hour));

  return hourlyUsage;
}

// ============================================================================
// MONTHLY AGGREGATION
// ============================================================================

/**
 * Aggregate raw entries into monthly usage summaries
 * Groups by month (YYYY-MM), calculates costs per model
 */
export function aggregateMonthlyUsage(
  entries: RawUsageEntry[],
  source = 'custom-parser'
): MonthlyUsage[] {
  // Group entries by month
  const byMonth = new Map<string, RawUsageEntry[]>();

  for (const entry of entries) {
    const month = extractMonth(entry.timestamp);
    const existing = byMonth.get(month) || [];
    existing.push(entry);
    byMonth.set(month, existing);
  }

  // Build monthly summaries
  const monthlyUsage: MonthlyUsage[] = [];

  for (const [month, monthEntries] of byMonth) {
    // Aggregate by model
    const modelMap = new Map<string, ModelAccumulator>();
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;

    for (const entry of monthEntries) {
      const modelKey = getEntryModelKey(entry);
      const acc = modelMap.get(modelKey) || createModelAccumulator(entry);

      acc.inputTokens += entry.inputTokens;
      acc.outputTokens += entry.outputTokens;
      acc.cacheCreationTokens += entry.cacheCreationTokens;
      acc.cacheReadTokens += entry.cacheReadTokens;
      modelMap.set(modelKey, acc);

      totalInput += entry.inputTokens;
      totalOutput += entry.outputTokens;
      totalCacheCreation += entry.cacheCreationTokens;
      totalCacheRead += entry.cacheReadTokens;
    }

    // Build model breakdowns
    const modelBreakdowns: ModelBreakdown[] = [];
    let totalCost = 0;

    for (const acc of modelMap.values()) {
      const breakdown = createModelBreakdown(
        acc.modelName,
        acc.provider,
        acc.inputTokens,
        acc.outputTokens,
        acc.cacheCreationTokens,
        acc.cacheReadTokens
      );
      modelBreakdowns.push(breakdown);
      totalCost += breakdown.cost;
    }

    // Sort breakdowns by cost descending
    modelBreakdowns.sort((a, b) => b.cost - a.cost);

    monthlyUsage.push({
      month,
      source,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheCreationTokens: totalCacheCreation,
      cacheReadTokens: totalCacheRead,
      totalCost,
      modelsUsed: getModelsUsed(modelBreakdowns),
      modelBreakdowns,
    });
  }

  // Sort by month descending (most recent first)
  monthlyUsage.sort((a, b) => b.month.localeCompare(a.month));

  return monthlyUsage;
}

// ============================================================================
// SESSION AGGREGATION
// ============================================================================

/**
 * Aggregate raw entries into session usage summaries
 * Groups by sessionId, tracks last activity and versions
 */
export function aggregateSessionUsage(
  entries: RawUsageEntry[],
  source = 'custom-parser'
): SessionUsage[] {
  // Group entries by sessionId
  const bySession = new Map<string, RawUsageEntry[]>();

  for (const entry of entries) {
    if (!entry.sessionId) continue;
    const existing = bySession.get(entry.sessionId) || [];
    existing.push(entry);
    bySession.set(entry.sessionId, existing);
  }

  // Build session summaries
  const sessionUsage: SessionUsage[] = [];

  for (const [sessionId, sessionEntries] of bySession) {
    const orderedEntries = [...sessionEntries].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    // Aggregate by model
    const modelMap = new Map<string, ModelAccumulator>();
    const versions = new Set<string>();
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;
    let lastActivity = '';
    let projectPath = '';
    let target: string | undefined;

    for (const entry of orderedEntries) {
      const modelKey = getEntryModelKey(entry);
      const acc = modelMap.get(modelKey) || createModelAccumulator(entry);

      acc.inputTokens += entry.inputTokens;
      acc.outputTokens += entry.outputTokens;
      acc.cacheCreationTokens += entry.cacheCreationTokens;
      acc.cacheReadTokens += entry.cacheReadTokens;
      modelMap.set(modelKey, acc);

      totalInput += entry.inputTokens;
      totalOutput += entry.outputTokens;
      totalCacheCreation += entry.cacheCreationTokens;
      totalCacheRead += entry.cacheReadTokens;

      // Track latest timestamp
      if (entry.timestamp > lastActivity) {
        lastActivity = entry.timestamp;
      }

      // Track versions
      if (entry.version) {
        versions.add(entry.version);
      }

      // Use project path from entry
      if (entry.projectPath) {
        projectPath = entry.projectPath;
      }

      if (entry.target) {
        target = entry.target;
      }
    }

    // Build model breakdowns
    const modelBreakdowns: ModelBreakdown[] = [];
    let totalCost = 0;

    for (const acc of modelMap.values()) {
      const breakdown = createModelBreakdown(
        acc.modelName,
        acc.provider,
        acc.inputTokens,
        acc.outputTokens,
        acc.cacheCreationTokens,
        acc.cacheReadTokens
      );
      modelBreakdowns.push(breakdown);
      totalCost += breakdown.cost;
    }

    // Sort breakdowns by cost descending
    modelBreakdowns.sort((a, b) => b.cost - a.cost);

    sessionUsage.push({
      sessionId,
      projectPath,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheCreationTokens: totalCacheCreation,
      cacheReadTokens: totalCacheRead,
      cost: totalCost,
      totalCost,
      lastActivity,
      versions: Array.from(versions),
      modelsUsed: getModelsUsed(modelBreakdowns),
      modelBreakdowns,
      source,
      target,
    });
  }

  // Sort by last activity descending (most recent first)
  sessionUsage.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  return sessionUsage;
}

// ============================================================================
// CLIPROXY ACCOUNT-LEVEL COST (Phase 1A: CCS Bar)
// ============================================================================

import type { CliproxyUsageHistoryDetail } from './cliproxy-usage-transformer';
import { localDayKey } from './bar-analytics';

/**
 * Compute per-account cost totals for a given calendar day.
 *
 * @param details Flat history details produced by extractCliproxyUsageHistoryDetails.
 *   Details with `accountId` are grouped by that value; details without are grouped
 *   under the key `'unknown'`.
 * @param today YYYY-MM-DD date string (defaults to local date if omitted).
 * @returns Record mapping accountId (or 'unknown') → total cost in USD for that day.
 */
export function getTodayCostByAccount(
  details: CliproxyUsageHistoryDetail[],
  today?: string
): Record<string, number> {
  // Key on the LOCAL calendar day so a near-midnight record buckets into the
  // same day the analytics panel shows (bar-analytics also keys on localDayKey).
  const dateKey = today ?? localDayKey(new Date());
  const result: Record<string, number> = {};

  for (const detail of details) {
    // Filter to the requested day only
    if (!detail.timestamp.startsWith(dateKey)) continue;

    // Skip zero-cost records to avoid polluting result with no-op entries
    if (detail.cost <= 0) continue;

    const accountKey = detail.accountId ?? 'unknown';
    result[accountKey] = (result[accountKey] ?? 0) + detail.cost;
  }

  return result;
}

// ============================================================================
// MAIN DATA LOADER (drop-in replacement for better-ccusage)
// ============================================================================

import { scanProjectsDirectory, type ParserOptions } from '../jsonl-parser';

/**
 * Load daily usage data (replaces better-ccusage loadDailyUsageData)
 */
export async function loadDailyUsageData(options?: ParserOptions): Promise<DailyUsage[]> {
  const entries = await scanProjectsDirectory(options);
  return aggregateDailyUsage(entries);
}

/**
 * Load hourly usage data for today's chart
 */
export async function loadHourlyUsageData(options?: ParserOptions): Promise<HourlyUsage[]> {
  const entries = await scanProjectsDirectory(options);
  return aggregateHourlyUsage(entries);
}

/**
 * Load monthly usage data (replaces better-ccusage loadMonthlyUsageData)
 */
export async function loadMonthlyUsageData(options?: ParserOptions): Promise<MonthlyUsage[]> {
  const entries = await scanProjectsDirectory(options);
  return aggregateMonthlyUsage(entries);
}

/**
 * Load session data (replaces better-ccusage loadSessionData)
 */
export async function loadSessionData(options?: ParserOptions): Promise<SessionUsage[]> {
  const entries = await scanProjectsDirectory(options);
  return aggregateSessionUsage(entries);
}

/**
 * Load all usage data in a single pass (more efficient)
 */
export async function loadAllUsageData(options?: ParserOptions): Promise<{
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
  session: SessionUsage[];
}> {
  const entries = await scanProjectsDirectory(options);
  return {
    daily: aggregateDailyUsage(entries),
    hourly: aggregateHourlyUsage(entries),
    monthly: aggregateMonthlyUsage(entries),
    session: aggregateSessionUsage(entries),
  };
}
