/**
 * CLIProxy Usage Transformer
 *
 * Transforms CLIProxy's usage API response into DailyUsage/HourlyUsage/MonthlyUsage
 * types compatible with the CCS analytics dashboard.
 */

import type {
  CliproxyUsageApiResponse,
  CliproxyRequestDetail,
} from '../../cliproxy/services/stats-fetcher';
import { calculateCost } from '../model-pricing';
import type { ModelBreakdown, DailyUsage, HourlyUsage, MonthlyUsage } from './types';
import { getModelsUsed, normalizeUsageProvider } from './model-identity';

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Persisted request detail used to rebuild historical CLIProxy analytics buckets */
export interface CliproxyUsageHistoryDetail {
  model: string;
  provider?: string;
  /** CLIProxy account email/id derived from auth_index lookup. Populated when an accountMap is supplied. */
  accountId?: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  requestCount: number;
  cost: number;
  failed: boolean;
}

/** Accumulator for token counts per model per time bucket */
interface ModelAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
}

/** Build ModelBreakdown from accumulated token counts */
function buildModelBreakdown(
  modelName: string,
  provider: string | undefined,
  acc: ModelAccumulator
): ModelBreakdown {
  const { inputTokens, outputTokens, cacheReadTokens, cost } = acc;
  return {
    modelName,
    ...(provider && { provider }),
    inputTokens,
    outputTokens,
    cacheCreationTokens: 0,
    cacheReadTokens,
    cost,
  };
}

function createHistoryDetail(
  provider: string,
  model: string,
  detail: CliproxyRequestDetail,
  accountMap?: Map<string, string>
): CliproxyUsageHistoryDetail {
  const pricingProvider = normalizeUsageProvider(provider) ?? provider.trim().toLowerCase();
  const inputTokens = detail.tokens?.input_tokens ?? 0;
  const outputTokens = detail.tokens?.output_tokens ?? 0;
  const cacheReadTokens = detail.tokens?.cached_tokens ?? 0;

  // Resolve accountId from auth_index → account map.
  // buildAuthIndexToAccountMap stores only String(auth_index) keys, so the numeric-key
  // lookup is dead code and the detail.source fallback mis-attributes cost to a CLIProxy
  // source label rather than an email. Leave accountId undefined when the index is absent
  // so getTodayCostByAccount buckets it under 'unknown' and the bar excludes it.
  let accountId: string | undefined;
  if (accountMap !== undefined) {
    const key = String(detail.auth_index);
    accountId = accountMap.get(key);
  }

  return {
    model,
    provider: pricingProvider,
    ...(accountId !== undefined && { accountId }),
    timestamp: detail.timestamp,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    requestCount: 1,
    cost: calculateHistoryDetailCost(
      model,
      pricingProvider,
      inputTokens,
      outputTokens,
      cacheReadTokens
    ),
    failed: detail.failed,
  };
}

function calculateHistoryDetailCost(
  model: string,
  provider: string | undefined,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number
): number {
  return calculateCost(
    {
      inputTokens,
      outputTokens,
      cacheCreationTokens: 0,
      cacheReadTokens,
    },
    model,
    provider ? { provider } : undefined
  );
}

function normalizePersistedNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePersistedProvider(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  return normalizeUsageProvider(trimmed) ?? trimmed.toLowerCase();
}

export function normalizeCliproxyUsageHistoryDetail(
  detail: unknown
): CliproxyUsageHistoryDetail | null {
  if (!detail || typeof detail !== 'object') return null;

  const candidate = detail as Record<string, unknown>;
  if (
    typeof candidate.model !== 'string' ||
    typeof candidate.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(candidate.timestamp))
  ) {
    return null;
  }

  const provider = normalizePersistedProvider(candidate.provider);
  const inputTokens = normalizePersistedNumber(candidate.inputTokens);
  const outputTokens = normalizePersistedNumber(candidate.outputTokens);
  const cacheReadTokens = normalizePersistedNumber(candidate.cacheReadTokens);
  const requestCount = Math.max(1, normalizePersistedNumber(candidate.requestCount, 1));
  // Compute the cost fallback lazily. calculateHistoryDetailCost is ~6ms/call
  // (model-pricing lookup); passing it as an eager default argument ran it for
  // every record even when a persisted cost was already present, turning a few
  // thousand records into a multi-second event-loop stall.
  const cost =
    typeof candidate.cost === 'number' && Number.isFinite(candidate.cost)
      ? candidate.cost
      : calculateHistoryDetailCost(
          candidate.model,
          provider,
          inputTokens,
          outputTokens,
          cacheReadTokens
        );

  const accountId =
    typeof candidate.accountId === 'string' && candidate.accountId.length > 0
      ? candidate.accountId
      : undefined;

  return {
    model: candidate.model,
    ...(provider && { provider }),
    ...(accountId !== undefined && { accountId }),
    timestamp: candidate.timestamp,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    requestCount,
    cost,
    failed: candidate.failed === true,
  };
}

// ============================================================================
// FLATTEN
// ============================================================================

function hasTrackedUsage(detail: CliproxyRequestDetail): boolean {
  const tokens = detail.tokens;
  return (
    (tokens?.input_tokens ?? 0) > 0 ||
    (tokens?.output_tokens ?? 0) > 0 ||
    (tokens?.cached_tokens ?? 0) > 0
  );
}

/**
 * Flatten the nested response.usage.apis[provider].models[model].details[]
 * structure into normalized history details. Failed requests are retained only
 * when they still report tracked token usage that analytics can account for.
 *
 * @param accountMap Optional auth_index → account email/id map. When provided,
 *   each detail's `accountId` is resolved from String(auth_index). When the index
 *   is absent from the map, `accountId` is left undefined so getTodayCostByAccount
 *   buckets the cost under 'unknown' rather than mis-attributing it.
 */
export function extractCliproxyUsageHistoryDetails(
  response: CliproxyUsageApiResponse,
  accountMap?: Map<string, string>
): CliproxyUsageHistoryDetail[] {
  const apis = response?.usage?.apis;
  if (!apis) return [];

  const results: CliproxyUsageHistoryDetail[] = [];
  for (const [provider, providerData] of Object.entries(apis)) {
    const models = providerData?.models;
    if (!models) continue;
    for (const [model, modelData] of Object.entries(models)) {
      const details = modelData?.details;
      if (!details) continue;
      for (const detail of details) {
        if (detail.failed && !hasTrackedUsage(detail)) continue;
        results.push(createHistoryDetail(provider, model, detail, accountMap));
      }
    }
  }
  return results;
}

function sanitizeHistoryDetail(detail: CliproxyUsageHistoryDetail): CliproxyUsageHistoryDetail {
  return {
    model: detail.model,
    ...(detail.provider && { provider: detail.provider }),
    ...(detail.accountId !== undefined && { accountId: detail.accountId }),
    timestamp: detail.timestamp,
    inputTokens: detail.inputTokens,
    outputTokens: detail.outputTokens,
    cacheReadTokens: detail.cacheReadTokens,
    requestCount: detail.requestCount,
    cost: detail.cost,
    failed: detail.failed,
  };
}

function createHistorySignature(detail: CliproxyUsageHistoryDetail): string {
  return [
    detail.model,
    detail.provider ?? '',
    detail.timestamp,
    detail.inputTokens,
    detail.outputTokens,
    detail.cacheReadTokens,
    detail.requestCount,
    detail.failed ? '1' : '0',
  ].join('|');
}

function createProviderlessHistorySignature(detail: CliproxyUsageHistoryDetail): string {
  return [
    detail.model,
    detail.timestamp,
    detail.inputTokens,
    detail.outputTokens,
    detail.cacheReadTokens,
    detail.requestCount,
    detail.failed ? '1' : '0',
  ].join('|');
}

function hydrateProviderlessHistoryDetails(
  existing: CliproxyUsageHistoryDetail[],
  incoming: CliproxyUsageHistoryDetail[]
): CliproxyUsageHistoryDetail[] {
  if (!existing.some((detail) => !detail.provider)) return existing;

  const incomingByProviderlessSignature = new Map<string, CliproxyUsageHistoryDetail[]>();
  for (const detail of incoming) {
    if (!detail.provider) continue;

    const signature = createProviderlessHistorySignature(detail);
    const matches = incomingByProviderlessSignature.get(signature);
    if (matches) {
      matches.push(detail);
    } else {
      incomingByProviderlessSignature.set(signature, [detail]);
    }
  }

  return existing.map((detail) => {
    if (detail.provider) return detail;

    const matches = incomingByProviderlessSignature.get(createProviderlessHistorySignature(detail));
    const providers = new Set(matches?.map((match) => match.provider).filter(Boolean));
    if (!matches || providers.size !== 1) return detail;

    return { ...detail, provider: matches[0].provider, cost: matches[0].cost };
  });
}

export function mergeCliproxyUsageHistoryDetails(
  existing: CliproxyUsageHistoryDetail[],
  incoming: CliproxyUsageHistoryDetail[]
): CliproxyUsageHistoryDetail[] {
  const hydratedExisting = hydrateProviderlessHistoryDetails(existing, incoming);
  const existingCounts = new Map<string, { detail: CliproxyUsageHistoryDetail; count: number }>();
  for (const detail of hydratedExisting) {
    const signature = createHistorySignature(detail);
    const entry = existingCounts.get(signature);
    if (entry) {
      entry.count += 1;
    } else {
      existingCounts.set(signature, { detail, count: 1 });
    }
  }

  const incomingCounts = new Map<string, { detail: CliproxyUsageHistoryDetail; count: number }>();
  for (const detail of incoming) {
    const signature = createHistorySignature(detail);
    const entry = incomingCounts.get(signature);
    if (entry) {
      entry.count += 1;
    } else {
      incomingCounts.set(signature, { detail, count: 1 });
    }
  }

  for (const [signature, incomingEntry] of incomingCounts) {
    const existingEntry = existingCounts.get(signature);
    if (!existingEntry || incomingEntry.count > existingEntry.count) {
      existingCounts.set(signature, {
        detail: incomingEntry.detail,
        count: incomingEntry.count,
      });
    }
  }

  const merged: CliproxyUsageHistoryDetail[] = [];
  for (const { detail, count } of existingCounts.values()) {
    for (let index = 0; index < count; index++) {
      merged.push(sanitizeHistoryDetail(detail));
    }
  }

  return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function pruneCliproxyUsageHistoryDetails(
  details: CliproxyUsageHistoryDetail[],
  oldestTimestamp: number
): CliproxyUsageHistoryDetail[] {
  return details.filter((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    return Number.isFinite(timestamp) && timestamp >= oldestTimestamp;
  });
}

// ============================================================================
// GENERIC AGGREGATOR
// ============================================================================

/** Group flat details by a time key extractor, return sorted DailyUsage-like records */
function aggregateByKey<T>(
  flat: CliproxyUsageHistoryDetail[],
  keyFn: (timestamp: string) => string,
  buildRecord: (key: string, breakdowns: ModelBreakdown[], requestCount: number) => T,
  sortFn: (a: T, b: T) => number
): T[] {
  // bucket: timeKey -> provider/model key -> accumulator
  const buckets = new Map<
    string,
    Map<string, { modelName: string; provider?: string; acc: ModelAccumulator }>
  >();
  const requestCounts = new Map<string, number>();

  for (const detail of flat) {
    const key = keyFn(detail.timestamp);
    if (!buckets.has(key)) buckets.set(key, new Map());
    requestCounts.set(key, (requestCounts.get(key) ?? 0) + detail.requestCount);
    const modelMap = buckets.get(key) as Map<
      string,
      { modelName: string; provider?: string; acc: ModelAccumulator }
    >;
    const modelKey = `${detail.provider ?? ''}\u0000${detail.model}`;
    if (!modelMap.has(modelKey)) {
      modelMap.set(modelKey, {
        modelName: detail.model,
        provider: detail.provider,
        acc: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cost: 0,
        },
      });
    }
    const acc = (modelMap.get(modelKey) as { acc: ModelAccumulator }).acc;
    acc.inputTokens += detail.inputTokens;
    acc.outputTokens += detail.outputTokens;
    acc.cacheReadTokens += detail.cacheReadTokens;
    acc.cost += detail.cost;
  }

  const records: T[] = [];
  Array.from(buckets.entries()).forEach(([key, modelMap]) => {
    const breakdowns = Array.from(modelMap.values()).map((entry) =>
      buildModelBreakdown(entry.modelName, entry.provider, entry.acc)
    );
    records.push(buildRecord(key, breakdowns, requestCounts.get(key) ?? 0));
  });

  return records.sort(sortFn);
}

/** Sum token field across all breakdowns */
function sumField(breakdowns: ModelBreakdown[], field: keyof ModelBreakdown): number {
  return breakdowns.reduce((acc, b) => acc + (b[field] as number), 0);
}

// ============================================================================
// TRANSFORMS
// ============================================================================

/** Transform CLIProxy usage response into DailyUsage array (sorted descending by date) */
export function transformCliproxyToDailyUsage(response: CliproxyUsageApiResponse): DailyUsage[] {
  const flat = extractCliproxyUsageHistoryDetails(response);
  return aggregateByKey(
    flat,
    (ts) => ts.slice(0, 10),
    (date, breakdowns) => {
      const totalCost = sumField(breakdowns, 'cost');
      return {
        date,
        source: 'cliproxy',
        inputTokens: sumField(breakdowns, 'inputTokens'),
        outputTokens: sumField(breakdowns, 'outputTokens'),
        cacheCreationTokens: 0,
        cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
        cost: totalCost,
        totalCost,
        modelsUsed: getModelsUsed(breakdowns),
        modelBreakdowns: breakdowns,
      };
    },
    (a, b) => b.date.localeCompare(a.date)
  );
}

/** Transform CLIProxy usage response into HourlyUsage array (sorted descending by hour) */
export function transformCliproxyToHourlyUsage(response: CliproxyUsageApiResponse): HourlyUsage[] {
  const flat = extractCliproxyUsageHistoryDetails(response);
  return aggregateByKey(
    flat,
    (ts) => {
      const date = ts.slice(0, 10);
      const hour = ts.slice(11, 13) || '00';
      return `${date} ${hour}:00`;
    },
    (hour, breakdowns, requestCount) => {
      const totalCost = sumField(breakdowns, 'cost');
      return {
        hour,
        source: 'cliproxy',
        inputTokens: sumField(breakdowns, 'inputTokens'),
        outputTokens: sumField(breakdowns, 'outputTokens'),
        cacheCreationTokens: 0,
        cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
        cost: totalCost,
        totalCost,
        modelsUsed: getModelsUsed(breakdowns),
        modelBreakdowns: breakdowns,
        requestCount,
      };
    },
    (a, b) => b.hour.localeCompare(a.hour)
  );
}

/** Transform CLIProxy usage response into MonthlyUsage array (sorted descending by month) */
export function transformCliproxyToMonthlyUsage(
  response: CliproxyUsageApiResponse
): MonthlyUsage[] {
  const flat = extractCliproxyUsageHistoryDetails(response);
  return aggregateByKey(
    flat,
    (ts) => ts.slice(0, 7),
    (month, breakdowns) => ({
      month,
      source: 'cliproxy',
      inputTokens: sumField(breakdowns, 'inputTokens'),
      outputTokens: sumField(breakdowns, 'outputTokens'),
      cacheCreationTokens: 0,
      cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
      totalCost: sumField(breakdowns, 'cost'),
      modelsUsed: getModelsUsed(breakdowns),
      modelBreakdowns: breakdowns,
    }),
    (a, b) => b.month.localeCompare(a.month)
  );
}

export function buildCliproxyUsageHistoryAggregates(details: CliproxyUsageHistoryDetail[]): {
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
} {
  return {
    daily: aggregateByKey(
      details,
      (timestamp) => timestamp.slice(0, 10),
      (date, breakdowns) => {
        const totalCost = sumField(breakdowns, 'cost');
        return {
          date,
          source: 'cliproxy',
          inputTokens: sumField(breakdowns, 'inputTokens'),
          outputTokens: sumField(breakdowns, 'outputTokens'),
          cacheCreationTokens: 0,
          cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
          cost: totalCost,
          totalCost,
          modelsUsed: getModelsUsed(breakdowns),
          modelBreakdowns: breakdowns,
        };
      },
      (a, b) => b.date.localeCompare(a.date)
    ),
    hourly: aggregateByKey(
      details,
      (timestamp) => {
        const date = timestamp.slice(0, 10);
        const hour = timestamp.slice(11, 13) || '00';
        return `${date} ${hour}:00`;
      },
      (hour, breakdowns, requestCount) => {
        const totalCost = sumField(breakdowns, 'cost');
        return {
          hour,
          source: 'cliproxy',
          inputTokens: sumField(breakdowns, 'inputTokens'),
          outputTokens: sumField(breakdowns, 'outputTokens'),
          cacheCreationTokens: 0,
          cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
          cost: totalCost,
          totalCost,
          modelsUsed: getModelsUsed(breakdowns),
          modelBreakdowns: breakdowns,
          requestCount,
        };
      },
      (a, b) => b.hour.localeCompare(a.hour)
    ),
    monthly: aggregateByKey(
      details,
      (timestamp) => timestamp.slice(0, 7),
      (month, breakdowns) => ({
        month,
        source: 'cliproxy',
        inputTokens: sumField(breakdowns, 'inputTokens'),
        outputTokens: sumField(breakdowns, 'outputTokens'),
        cacheCreationTokens: 0,
        cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
        totalCost: sumField(breakdowns, 'cost'),
        modelsUsed: getModelsUsed(breakdowns),
        modelBreakdowns: breakdowns,
      }),
      (a, b) => b.month.localeCompare(a.month)
    ),
  };
}
