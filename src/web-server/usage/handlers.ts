/**
 * Usage Route Handlers
 *
 * Contains all route handler logic for usage analytics endpoints.
 * Separated from routes for better testability and organization.
 */

import type { Request, Response } from 'express';
import type { DailyUsage, Anomaly, AnomalySummary, TokenBreakdown } from './types';
import { getModelPricing } from '../model-pricing';
import {
  getCachedDailyData,
  getCachedMonthlyData,
  getCachedSessionData,
  getCachedHourlyData,
  getUsageCacheSize,
  getLastFetchTimestamp,
  refreshUsageCache,
} from './aggregator';
import {
  coalesceLegacyProviderlessBreakdowns,
  getModelsUsed,
  getProviderModelKey,
} from './model-identity';
import { normalizeProfileQuery } from './profile-filter';

// ============================================================================
// Types
// ============================================================================

/** Query parameters for usage endpoints */
export interface UsageQuery {
  since?: string; // YYYYMMDD format
  until?: string; // YYYYMMDD format
  profile?: string;
  limit?: string;
  offset?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 50;
const DATE_REGEX = /^\d{8}$/; // YYYYMMDD format

const ANOMALY_THRESHOLDS = {
  HIGH_INPUT_TOKENS: 10_000_000,
  HIGH_IO_RATIO: 100,
  COST_SPIKE_MULTIPLIER: 2,
  HIGH_CACHE_READ_TOKENS: 1_000_000_000,
};

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate date string in YYYYMMDD format
 */
export function validateDate(dateString?: string): string | undefined {
  if (!dateString) return undefined;

  if (!DATE_REGEX.test(dateString)) {
    throw new Error('Invalid date format. Use YYYYMMDD');
  }

  const year = parseInt(dateString.substring(0, 4), 10);
  const month = parseInt(dateString.substring(4, 6), 10);
  const day = parseInt(dateString.substring(6, 8), 10);

  if (year < 2024 || year > 2100) throw new Error('Year out of valid range');
  if (month < 1 || month > 12) throw new Error('Month out of valid range');
  if (day < 1 || day > 31) throw new Error('Day out of valid range');

  return dateString;
}

export function validateLimit(limit?: string): number {
  if (!limit) return DEFAULT_LIMIT;
  const num = parseInt(limit, 10);
  if (isNaN(num) || num < 1 || num > MAX_LIMIT) {
    throw new Error(`Limit must be between 1 and ${MAX_LIMIT}`);
  }
  return num;
}

export function validateOffset(offset?: string): number {
  if (!offset) return 0;
  const num = parseInt(offset, 10);
  if (isNaN(num) || num < 0) {
    throw new Error('Offset must be a non-negative number');
  }
  return num;
}

export function validateDateRangeOrder(since?: string, until?: string): void {
  if (!since || !until) return;
  if (since > until) {
    throw new Error('The "since" date must be earlier than or equal to "until"');
  }
}

export function filterByDateRange<
  T extends { date?: string; month?: string; lastActivity?: string },
>(data: T[] | undefined, since?: string, until?: string): T[] {
  if (!data || !Array.isArray(data)) return [];
  if (!since && !until) return data;

  return data.filter((item) => {
    const itemDate =
      item.date || item.month?.replace('-', '') || item.lastActivity?.replace(/-/g, '');
    if (!itemDate) return true;

    const normalizedDate = itemDate.replace(/-/g, '').substring(0, 8);
    if (since && normalizedDate < since) return false;
    if (until && normalizedDate > until) return false;
    return true;
  });
}

export function errorResponse(res: Response, error: unknown, defaultMessage: string): void {
  process.stderr.write(
    String(`${defaultMessage}: ${error instanceof Error ? error.message : String(error)}`) + '\n'
  );
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const isValidationError =
    errorMessage.includes('Invalid') ||
    errorMessage.includes('format') ||
    errorMessage.includes('range') ||
    errorMessage.includes('must be');

  res.status(isValidationError ? 400 : 500).json({
    success: false,
    error: isValidationError ? errorMessage : defaultMessage,
  });
}

function roundToCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateUsageTotalTokens(
  input: number,
  output: number,
  cacheCreation: number,
  cacheRead: number
): number {
  return input + output + cacheCreation + cacheRead;
}

function parseDateKey(dateString: string): Date {
  return new Date(
    Date.UTC(
      Number(dateString.slice(0, 4)),
      Number(dateString.slice(4, 6)) - 1,
      Number(dateString.slice(6, 8))
    )
  );
}

function getInclusiveDayCount(start: Date, end: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;
}

function countCalendarDays(data: DailyUsage[], since?: string, until?: string): number {
  const sortedDates = [...data]
    .map((item) => item.date.replace(/-/g, ''))
    .sort((a, b) => a.localeCompare(b));
  const earliestDate = sortedDates[0];
  const latestDate = sortedDates[sortedDates.length - 1];

  if (since && until) {
    return getInclusiveDayCount(parseDateKey(since), parseDateKey(until));
  }

  if (since) {
    const end = until
      ? parseDateKey(until)
      : latestDate
        ? parseDateKey(latestDate)
        : parseDateKey(since);
    return getInclusiveDayCount(parseDateKey(since), end);
  }

  if (until) {
    const start = earliestDate ? parseDateKey(earliestDate) : parseDateKey(until);
    return getInclusiveDayCount(start, parseDateKey(until));
  }

  if (data.length === 0) {
    return 0;
  }

  return getInclusiveDayCount(parseDateKey(earliestDate), parseDateKey(latestDate));
}

// ============================================================================
// Cost Calculation Helpers
// ============================================================================

export function calculateTokenBreakdownCosts(dailyData: DailyUsage[]): TokenBreakdown {
  let inputTokens = 0,
    outputTokens = 0,
    cacheCreationTokens = 0,
    cacheReadTokens = 0;
  let inputCost = 0,
    outputCost = 0,
    cacheCreationCost = 0,
    cacheReadCost = 0;

  for (const day of dailyData) {
    for (const breakdown of day.modelBreakdowns) {
      const pricing = getModelPricing(breakdown.modelName, { provider: breakdown.provider });
      inputTokens += breakdown.inputTokens;
      outputTokens += breakdown.outputTokens;
      cacheCreationTokens += breakdown.cacheCreationTokens;
      cacheReadTokens += breakdown.cacheReadTokens;
      inputCost += (breakdown.inputTokens / 1_000_000) * pricing.inputPerMillion;
      outputCost += (breakdown.outputTokens / 1_000_000) * pricing.outputPerMillion;
      cacheCreationCost +=
        (breakdown.cacheCreationTokens / 1_000_000) * pricing.cacheCreationPerMillion;
      cacheReadCost += (breakdown.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;
    }
  }

  return {
    input: { tokens: inputTokens, cost: roundToCurrency(inputCost) },
    output: { tokens: outputTokens, cost: roundToCurrency(outputCost) },
    cacheCreation: { tokens: cacheCreationTokens, cost: roundToCurrency(cacheCreationCost) },
    cacheRead: { tokens: cacheReadTokens, cost: roundToCurrency(cacheReadCost) },
  };
}

// ============================================================================
// Hourly Gap Filling
// ============================================================================

export function fillHourlyGaps(
  data: Array<{
    hour: string;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    cost: number;
    modelsUsed: number;
    requests: number;
  }>,
  since?: string,
  until?: string
): typeof data {
  if (!since && !until) return data.sort((a, b) => a.hour.localeCompare(b.hour));

  const hourMap = new Map(data.map((d) => [d.hour, d]));
  const now = new Date();
  const startDate = since
    ? new Date(Date.UTC(+since.slice(0, 4), +since.slice(4, 6) - 1, +since.slice(6, 8), 0, 0, 0))
    : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const endDate = until
    ? new Date(Date.UTC(+until.slice(0, 4), +until.slice(4, 6) - 1, +until.slice(6, 8), 23, 59, 59))
    : now;
  const cappedEndDate = endDate > now ? now : endDate;

  const result: typeof data = [];
  const current = new Date(startDate);
  current.setMinutes(0, 0, 0);

  while (current <= cappedEndDate) {
    const year = current.getUTCFullYear();
    const month = String(current.getUTCMonth() + 1).padStart(2, '0');
    const day = String(current.getUTCDate()).padStart(2, '0');
    const hour = String(current.getUTCHours()).padStart(2, '0');
    const hourKey = `${year}-${month}-${day} ${hour}:00`;

    result.push(
      hourMap.get(hourKey) || {
        hour: hourKey,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        cost: 0,
        modelsUsed: 0,
        requests: 0,
      }
    );
    current.setTime(current.getTime() + 60 * 60 * 1000);
  }
  return result;
}

// ============================================================================
// Anomaly Detection
// ============================================================================

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export function detectAnomalies(dailyData: DailyUsage[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const totalCost = dailyData.reduce((sum, day) => sum + day.totalCost, 0);
  const avgDailyCost = dailyData.length > 0 ? totalCost / dailyData.length : 0;
  const costSpikeThreshold = avgDailyCost * ANOMALY_THRESHOLDS.COST_SPIKE_MULTIPLIER;

  for (const day of dailyData) {
    if (avgDailyCost > 0 && day.totalCost > costSpikeThreshold) {
      const multiplier = Math.round((day.totalCost / avgDailyCost) * 10) / 10;
      anomalies.push({
        date: day.date,
        type: 'cost_spike',
        value: day.totalCost,
        threshold: avgDailyCost,
        message: `Cost ${multiplier}x above daily average ($${Math.round(day.totalCost)} vs $${Math.round(avgDailyCost)})`,
      });
    }

    for (const breakdown of day.modelBreakdowns) {
      if (breakdown.inputTokens > ANOMALY_THRESHOLDS.HIGH_INPUT_TOKENS) {
        const multiplier =
          Math.round((breakdown.inputTokens / ANOMALY_THRESHOLDS.HIGH_INPUT_TOKENS) * 10) / 10;
        anomalies.push({
          date: day.date,
          type: 'high_input',
          model: breakdown.modelName,
          value: breakdown.inputTokens,
          threshold: ANOMALY_THRESHOLDS.HIGH_INPUT_TOKENS,
          message: `Input tokens ${multiplier}x above threshold (${formatTokenCount(breakdown.inputTokens)})`,
        });
      }

      if (breakdown.outputTokens > 0) {
        const ioRatio = breakdown.inputTokens / breakdown.outputTokens;
        if (ioRatio > ANOMALY_THRESHOLDS.HIGH_IO_RATIO) {
          const multiplier = Math.round((ioRatio / ANOMALY_THRESHOLDS.HIGH_IO_RATIO) * 10) / 10;
          anomalies.push({
            date: day.date,
            type: 'high_io_ratio',
            model: breakdown.modelName,
            value: ioRatio,
            threshold: ANOMALY_THRESHOLDS.HIGH_IO_RATIO,
            message: `I/O ratio ${multiplier}x above threshold (${Math.round(ioRatio)}:1)`,
          });
        }
      }

      if (breakdown.cacheReadTokens > ANOMALY_THRESHOLDS.HIGH_CACHE_READ_TOKENS) {
        const multiplier =
          Math.round((breakdown.cacheReadTokens / ANOMALY_THRESHOLDS.HIGH_CACHE_READ_TOKENS) * 10) /
          10;
        anomalies.push({
          date: day.date,
          type: 'high_cache_read',
          model: breakdown.modelName,
          value: breakdown.cacheReadTokens,
          threshold: ANOMALY_THRESHOLDS.HIGH_CACHE_READ_TOKENS,
          message: `Cache reads ${multiplier}x above threshold (${formatTokenCount(breakdown.cacheReadTokens)})`,
        });
      }
    }
  }
  return anomalies.sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeAnomalies(anomalies: Anomaly[]): AnomalySummary {
  const highInputDates = new Set<string>();
  const highIoRatioDates = new Set<string>();
  const costSpikeDates = new Set<string>();
  const highCacheReadDates = new Set<string>();

  for (const anomaly of anomalies) {
    switch (anomaly.type) {
      case 'high_input':
        highInputDates.add(anomaly.date);
        break;
      case 'high_io_ratio':
        highIoRatioDates.add(anomaly.date);
        break;
      case 'cost_spike':
        costSpikeDates.add(anomaly.date);
        break;
      case 'high_cache_read':
        highCacheReadDates.add(anomaly.date);
        break;
    }
  }

  return {
    totalAnomalies: anomalies.length,
    highInputDays: highInputDates.size,
    highIoRatioDays: highIoRatioDates.size,
    costSpikeDays: costSpikeDates.size,
    highCacheReadDays: highCacheReadDates.size,
  };
}

// ============================================================================
// Route Handlers
// ============================================================================

export async function handleSummary(
  req: Request<object, object, object, UsageQuery>,
  res: Response
): Promise<void> {
  try {
    const since = validateDate(req.query.since);
    const until = validateDate(req.query.until);
    const profile = normalizeProfileQuery(req.query.profile);
    validateDateRangeOrder(since, until);
    const dailyData = await getCachedDailyData(profile);
    const filtered = filterByDateRange(dailyData, since, until);

    let totalInputTokens = 0,
      totalOutputTokens = 0;
    let totalCacheCreationTokens = 0,
      totalCacheReadTokens = 0,
      totalCost = 0;

    for (const day of filtered) {
      totalInputTokens += day.inputTokens;
      totalOutputTokens += day.outputTokens;
      totalCacheCreationTokens += day.cacheCreationTokens;
      totalCacheReadTokens += day.cacheReadTokens;
      totalCost += day.totalCost;
    }

    const totalTokens = calculateUsageTotalTokens(
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreationTokens,
      totalCacheReadTokens
    );
    const tokenBreakdown = calculateTokenBreakdownCosts(filtered);
    const totalDays = countCalendarDays(filtered, since, until);
    const activeDays = filtered.length;

    res.json({
      success: true,
      data: {
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        totalCacheTokens: totalCacheCreationTokens + totalCacheReadTokens,
        totalCacheCreationTokens,
        totalCacheReadTokens,
        totalCost: roundToCurrency(totalCost),
        tokenBreakdown,
        totalDays,
        activeDays,
        averageTokensPerDay: totalDays > 0 ? Math.round(totalTokens / totalDays) : 0,
        averageTokensPerActiveDay: activeDays > 0 ? Math.round(totalTokens / activeDays) : 0,
        averageCostPerDay: totalDays > 0 ? roundToCurrency(totalCost / totalDays) : 0,
        averageCostPerActiveDay: activeDays > 0 ? roundToCurrency(totalCost / activeDays) : 0,
      },
    });
  } catch (error) {
    errorResponse(res, error, 'Failed to fetch usage summary');
  }
}

export async function handleDaily(
  req: Request<object, object, object, UsageQuery>,
  res: Response
): Promise<void> {
  try {
    const since = validateDate(req.query.since);
    const until = validateDate(req.query.until);
    const profile = normalizeProfileQuery(req.query.profile);
    validateDateRangeOrder(since, until);
    const dailyData = await getCachedDailyData(profile);
    const filtered = filterByDateRange(dailyData, since, until);

    const trends = filtered.map((day) => ({
      date: day.date,
      tokens: calculateUsageTotalTokens(
        day.inputTokens,
        day.outputTokens,
        day.cacheCreationTokens,
        day.cacheReadTokens
      ),
      inputTokens: day.inputTokens,
      outputTokens: day.outputTokens,
      cacheTokens: day.cacheCreationTokens + day.cacheReadTokens,
      cost: roundToCurrency(day.totalCost),
      modelsUsed: day.modelsUsed.length,
    }));

    res.json({ success: true, data: trends });
  } catch (error) {
    errorResponse(res, error, 'Failed to fetch daily usage');
  }
}

export async function handleHourly(
  req: Request<object, object, object, UsageQuery>,
  res: Response
): Promise<void> {
  try {
    const since = validateDate(req.query.since);
    const until = validateDate(req.query.until);
    const profile = normalizeProfileQuery(req.query.profile);
    validateDateRangeOrder(since, until);
    const hourlyData = await getCachedHourlyData(profile);

    const filtered = (hourlyData || []).filter((h) => {
      const hourDate = h.hour.slice(0, 10).replace(/-/g, '');
      if (since && hourDate < since) return false;
      if (until && hourDate > until) return false;
      return true;
    });

    const trends = filtered.map((hour) => ({
      hour: hour.hour,
      tokens: calculateUsageTotalTokens(
        hour.inputTokens,
        hour.outputTokens,
        hour.cacheCreationTokens,
        hour.cacheReadTokens
      ),
      inputTokens: hour.inputTokens,
      outputTokens: hour.outputTokens,
      cacheTokens: hour.cacheCreationTokens + hour.cacheReadTokens,
      cost: roundToCurrency(hour.totalCost),
      modelsUsed: hour.modelsUsed.length,
      requests: hour.requestCount ?? hour.modelBreakdowns.length,
    }));

    const filledTrends = fillHourlyGaps(trends, since, until);
    res.json({ success: true, data: filledTrends });
  } catch (error) {
    errorResponse(res, error, 'Failed to fetch hourly usage');
  }
}

export async function handleModels(
  req: Request<object, object, object, UsageQuery>,
  res: Response
): Promise<void> {
  try {
    const since = validateDate(req.query.since);
    const until = validateDate(req.query.until);
    const profile = normalizeProfileQuery(req.query.profile);
    validateDateRangeOrder(since, until);
    const dailyData = await getCachedDailyData(profile);
    const filtered = filterByDateRange(dailyData, since, until);

    const modelMap = new Map<
      string,
      {
        model: string;
        provider?: string;
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
        cost: number;
      }
    >();

    for (const day of filtered) {
      for (const breakdown of day.modelBreakdowns) {
        const modelKey = getProviderModelKey(breakdown);
        const existing = modelMap.get(modelKey) || {
          model: breakdown.modelName,
          provider: breakdown.provider,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          cost: 0,
        };
        existing.inputTokens += breakdown.inputTokens;
        existing.outputTokens += breakdown.outputTokens;
        existing.cacheCreationTokens += breakdown.cacheCreationTokens;
        existing.cacheReadTokens += breakdown.cacheReadTokens;
        existing.cost += breakdown.cost;
        modelMap.set(modelKey, existing);
      }
    }

    const models = Array.from(modelMap.values());
    const totalTokens = models.reduce(
      (sum, model) =>
        sum +
        calculateUsageTotalTokens(
          model.inputTokens,
          model.outputTokens,
          model.cacheCreationTokens,
          model.cacheReadTokens
        ),
      0
    );

    const result = models
      .map((m) => {
        const pricing = getModelPricing(m.model, { provider: m.provider });
        const inputCost = (m.inputTokens / 1_000_000) * pricing.inputPerMillion;
        const outputCost = (m.outputTokens / 1_000_000) * pricing.outputPerMillion;
        const cacheCreationCost =
          (m.cacheCreationTokens / 1_000_000) * pricing.cacheCreationPerMillion;
        const cacheReadCost = (m.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;
        const ioRatio = m.outputTokens > 0 ? m.inputTokens / m.outputTokens : 0;
        const totalModelTokens = calculateUsageTotalTokens(
          m.inputTokens,
          m.outputTokens,
          m.cacheCreationTokens,
          m.cacheReadTokens
        );

        return {
          model: m.model,
          provider: m.provider,
          tokens: totalModelTokens,
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
          cacheCreationTokens: m.cacheCreationTokens,
          cacheReadTokens: m.cacheReadTokens,
          cacheTokens: m.cacheCreationTokens + m.cacheReadTokens,
          cost: roundToCurrency(m.cost),
          percentage:
            totalTokens > 0 ? Math.round((totalModelTokens / totalTokens) * 1000) / 10 : 0,
          costBreakdown: {
            input: { tokens: m.inputTokens, cost: roundToCurrency(inputCost) },
            output: { tokens: m.outputTokens, cost: roundToCurrency(outputCost) },
            cacheCreation: {
              tokens: m.cacheCreationTokens,
              cost: roundToCurrency(cacheCreationCost),
            },
            cacheRead: { tokens: m.cacheReadTokens, cost: roundToCurrency(cacheReadCost) },
          },
          ioRatio: Math.round(ioRatio * 10) / 10,
        };
      })
      .sort((a, b) => b.tokens - a.tokens);

    res.json({ success: true, data: result });
  } catch (error) {
    errorResponse(res, error, 'Failed to fetch model usage');
  }
}

export async function handleSessions(
  req: Request<object, object, object, UsageQuery>,
  res: Response
): Promise<void> {
  try {
    const since = validateDate(req.query.since);
    const until = validateDate(req.query.until);
    const profile = normalizeProfileQuery(req.query.profile);
    validateDateRangeOrder(since, until);
    const limit = validateLimit(req.query.limit);
    const offset = validateOffset(req.query.offset);

    const sessionData = await getCachedSessionData(profile);
    const filtered = filterByDateRange(sessionData, since, until);
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
    const paginated = sorted.slice(offset, offset + limit);

    const sessions = paginated.map((s) => ({
      sessionId: s.sessionId,
      projectPath: s.projectPath,
      tokens: calculateUsageTotalTokens(
        s.inputTokens,
        s.outputTokens,
        s.cacheCreationTokens,
        s.cacheReadTokens
      ),
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cost: roundToCurrency(s.totalCost),
      lastActivity: s.lastActivity,
      modelsUsed: s.modelsUsed,
      target: s.target || 'claude',
    }));

    res.json({
      success: true,
      data: {
        sessions,
        total: filtered.length,
        limit,
        offset,
        hasMore: offset + limit < filtered.length,
      },
    });
  } catch (error) {
    errorResponse(res, error, 'Failed to fetch sessions');
  }
}

export async function handleMonthly(
  req: Request<object, object, object, UsageQuery>,
  res: Response
): Promise<void> {
  try {
    const since = validateDate(req.query.since);
    const until = validateDate(req.query.until);
    const profile = normalizeProfileQuery(req.query.profile);
    validateDateRangeOrder(since, until);
    let filtered: Array<{
      month: string;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      totalCost: number;
      modelsUsed: string[];
      modelBreakdowns: DailyUsage['modelBreakdowns'];
    }>;

    if (since || until) {
      const dailyData = filterByDateRange(await getCachedDailyData(profile), since, until);
      const monthMap = new Map<
        string,
        {
          month: string;
          inputTokens: number;
          outputTokens: number;
          cacheCreationTokens: number;
          cacheReadTokens: number;
          totalCost: number;
          modelBreakdowns: Map<
            string,
            {
              modelName: string;
              provider?: string;
              inputTokens: number;
              outputTokens: number;
              cacheCreationTokens: number;
              cacheReadTokens: number;
              cost: number;
            }
          >;
        }
      >();

      for (const day of dailyData) {
        const month = day.date.slice(0, 7);
        const existing = monthMap.get(month) ?? {
          month,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalCost: 0,
          modelBreakdowns: new Map(),
        };

        existing.inputTokens += day.inputTokens;
        existing.outputTokens += day.outputTokens;
        existing.cacheCreationTokens += day.cacheCreationTokens;
        existing.cacheReadTokens += day.cacheReadTokens;
        existing.totalCost += day.totalCost;
        for (const breakdown of day.modelBreakdowns) {
          const breakdownKey = getProviderModelKey(breakdown);
          const existingBreakdown = existing.modelBreakdowns.get(breakdownKey) ?? {
            modelName: breakdown.modelName,
            provider: breakdown.provider,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            cost: 0,
          };
          existingBreakdown.inputTokens += breakdown.inputTokens;
          existingBreakdown.outputTokens += breakdown.outputTokens;
          existingBreakdown.cacheCreationTokens += breakdown.cacheCreationTokens;
          existingBreakdown.cacheReadTokens += breakdown.cacheReadTokens;
          existingBreakdown.cost += breakdown.cost;
          existing.modelBreakdowns.set(breakdownKey, existingBreakdown);
        }

        monthMap.set(month, existing);
      }

      filtered = Array.from(monthMap.values())
        .map((month) => {
          const modelBreakdowns = coalesceLegacyProviderlessBreakdowns(
            Array.from(month.modelBreakdowns.values())
          );
          return {
            month: month.month,
            inputTokens: month.inputTokens,
            outputTokens: month.outputTokens,
            cacheCreationTokens: month.cacheCreationTokens,
            cacheReadTokens: month.cacheReadTokens,
            totalCost: month.totalCost,
            modelBreakdowns,
            modelsUsed: getModelsUsed(modelBreakdowns),
          };
        })
        .sort((a, b) => a.month.localeCompare(b.month));
    } else {
      filtered = await getCachedMonthlyData(profile);
    }

    const result = filtered.map((m) => ({
      month: m.month,
      tokens: calculateUsageTotalTokens(
        m.inputTokens,
        m.outputTokens,
        m.cacheCreationTokens,
        m.cacheReadTokens
      ),
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheTokens: m.cacheCreationTokens + m.cacheReadTokens,
      cost: roundToCurrency(m.totalCost),
      modelsUsed: m.modelsUsed.length,
    }));

    res.json({ success: true, data: result.sort((a, b) => a.month.localeCompare(b.month)) });
  } catch (error) {
    errorResponse(res, error, 'Failed to fetch monthly usage');
  }
}

export async function handleRefresh(_req: Request, res: Response): Promise<void> {
  try {
    await refreshUsageCache();
    res.json({ success: true, message: 'Usage cache refreshed' });
  } catch (error) {
    errorResponse(res, error, 'Failed to refresh usage cache');
  }
}

export function handleStatus(_req: Request, res: Response): void {
  res.json({
    success: true,
    data: { lastFetch: getLastFetchTimestamp(), cacheSize: getUsageCacheSize() },
  });
}

export async function handleInsights(
  req: Request<object, object, object, UsageQuery>,
  res: Response
): Promise<void> {
  try {
    const since = validateDate(req.query.since);
    const until = validateDate(req.query.until);
    const profile = normalizeProfileQuery(req.query.profile);
    validateDateRangeOrder(since, until);
    const dailyData = await getCachedDailyData(profile);
    const filtered = filterByDateRange(dailyData, since, until);
    const anomalies = detectAnomalies(filtered);
    const summary = summarizeAnomalies(anomalies);

    res.json({ success: true, data: { anomalies, summary } });
  } catch (error) {
    errorResponse(res, error, 'Failed to fetch usage insights');
  }
}
