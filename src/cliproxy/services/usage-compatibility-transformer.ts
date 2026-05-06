import type { CliproxyRequestDetail, CliproxyUsageApiResponse } from './stats-fetcher';

interface CliproxyUsageQueueRecord {
  timestamp?: string;
  provider?: string;
  model?: string;
  alias?: string;
  source?: string;
  auth_index?: string | number;
  tokens?: Partial<CliproxyRequestDetail['tokens']>;
  failed?: boolean;
}

interface ApiKeyUsageEntry {
  success?: number;
  failed?: number;
}

type ApiKeyUsageResponse = Record<string, Record<string, ApiKeyUsageEntry>>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeTokens(rawTokens: unknown): CliproxyRequestDetail['tokens'] {
  const tokens = asRecord(rawTokens) ?? {};
  const input = asNumber(tokens.input_tokens);
  const output = asNumber(tokens.output_tokens);
  const reasoning = asNumber(tokens.reasoning_tokens);
  const cached = asNumber(tokens.cached_tokens);
  const explicitTotal = asNumber(tokens.total_tokens);
  const total = explicitTotal || input + output + reasoning + cached;

  return {
    input_tokens: input,
    output_tokens: output,
    reasoning_tokens: reasoning,
    cached_tokens: cached,
    total_tokens: total,
  };
}

function normalizeQueueRecord(record: unknown): CliproxyUsageQueueRecord | null {
  const raw = asRecord(record);
  if (!raw) {
    return null;
  }

  const provider = asString(raw.provider, 'unknown');
  const model = asString(raw.model, asString(raw.alias, 'unknown'));
  const source = asString(raw.source, 'unknown');
  const authIndex =
    typeof raw.auth_index === 'string' || typeof raw.auth_index === 'number'
      ? raw.auth_index
      : source;

  return {
    timestamp: asString(raw.timestamp, new Date().toISOString()),
    provider,
    model,
    alias: asString(raw.alias, model),
    source,
    auth_index: authIndex,
    tokens: normalizeTokens(raw.tokens),
    failed: asBoolean(raw.failed),
  };
}

function ensureProviderBucket(
  response: CliproxyUsageApiResponse,
  provider: string
): NonNullable<NonNullable<CliproxyUsageApiResponse['usage']>['apis']>[string] {
  const usage = (response.usage ??= { apis: {} });
  const apis = (usage.apis ??= {});
  return (apis[provider] ??= { total_requests: 0, total_tokens: 0, models: {} });
}

function ensureModelBucket(
  providerBucket: NonNullable<NonNullable<CliproxyUsageApiResponse['usage']>['apis']>[string],
  model: string
): NonNullable<typeof providerBucket.models>[string] {
  const models = (providerBucket.models ??= {});
  return (models[model] ??= { total_requests: 0, total_tokens: 0, details: [] });
}

function addDetail(
  response: CliproxyUsageApiResponse,
  provider: string,
  model: string,
  detail: CliproxyRequestDetail
): void {
  const usage = (response.usage ??= { apis: {} });
  const providerBucket = ensureProviderBucket(response, provider);
  const modelBucket = ensureModelBucket(providerBucket, model);
  const totalTokens = detail.tokens?.total_tokens ?? 0;

  usage.total_requests = (usage.total_requests ?? 0) + 1;
  usage.total_tokens = (usage.total_tokens ?? 0) + totalTokens;
  if (detail.failed) {
    usage.failure_count = (usage.failure_count ?? 0) + 1;
    response.failed_requests = (response.failed_requests ?? 0) + 1;
  } else {
    usage.success_count = (usage.success_count ?? 0) + 1;
  }

  providerBucket.total_requests = (providerBucket.total_requests ?? 0) + 1;
  providerBucket.total_tokens = (providerBucket.total_tokens ?? 0) + totalTokens;
  modelBucket.total_requests = (modelBucket.total_requests ?? 0) + 1;
  modelBucket.total_tokens = (modelBucket.total_tokens ?? 0) + totalTokens;
  (modelBucket.details ??= []).push(detail);
}

function createDetailSignature(
  provider: string,
  model: string,
  detail: CliproxyRequestDetail
): string {
  return [
    provider,
    model,
    detail.timestamp,
    detail.source,
    String(detail.auth_index),
    detail.tokens?.input_tokens ?? 0,
    detail.tokens?.output_tokens ?? 0,
    detail.tokens?.reasoning_tokens ?? 0,
    detail.tokens?.cached_tokens ?? 0,
    detail.tokens?.total_tokens ?? 0,
    detail.failed ? '1' : '0',
  ].join('|');
}

function collectResponseDetails(
  response: CliproxyUsageApiResponse
): Array<{ provider: string; model: string; detail: CliproxyRequestDetail }> {
  const entries: Array<{ provider: string; model: string; detail: CliproxyRequestDetail }> = [];
  for (const [provider, providerData] of Object.entries(response.usage?.apis ?? {})) {
    for (const [model, modelData] of Object.entries(providerData.models ?? {})) {
      for (const detail of modelData.details ?? []) {
        entries.push({ provider, model, detail });
      }
    }
  }
  return entries;
}

export function buildUsageResponseFromQueueRecords(records: unknown[]): CliproxyUsageApiResponse {
  const response: CliproxyUsageApiResponse = {
    failed_requests: 0,
    usage: {
      total_requests: 0,
      success_count: 0,
      failure_count: 0,
      total_tokens: 0,
      apis: {},
    },
  };

  for (const rawRecord of records) {
    const record = normalizeQueueRecord(rawRecord);
    if (!record) {
      continue;
    }

    addDetail(response, record.provider ?? 'unknown', record.model ?? 'unknown', {
      timestamp: record.timestamp ?? new Date().toISOString(),
      source: record.source ?? 'unknown',
      auth_index: record.auth_index ?? record.source ?? 'unknown',
      tokens: normalizeTokens(record.tokens),
      failed: record.failed === true,
    });
  }

  return response;
}

export function mergeUsageResponses(
  base: CliproxyUsageApiResponse,
  incoming: CliproxyUsageApiResponse
): CliproxyUsageApiResponse {
  const merged = buildUsageResponseFromQueueRecords([]);
  const seen = new Set<string>();

  for (const entry of [...collectResponseDetails(base), ...collectResponseDetails(incoming)]) {
    const signature = createDetailSignature(entry.provider, entry.model, entry.detail);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    addDetail(merged, entry.provider, entry.model, entry.detail);
  }

  return merged;
}

export function buildUsageResponseFromApiKeyUsage(rawResponse: unknown): CliproxyUsageApiResponse {
  const response = buildUsageResponseFromQueueRecords([]);
  const usage = response.usage ?? {
    total_requests: 0,
    success_count: 0,
    failure_count: 0,
    total_tokens: 0,
    apis: {},
  };
  response.usage = usage;
  const byProvider = asRecord(rawResponse) as ApiKeyUsageResponse | null;
  if (!byProvider) {
    return response;
  }

  for (const [provider, sources] of Object.entries(byProvider)) {
    const sourceRecords = asRecord(sources);
    if (!sourceRecords) {
      continue;
    }

    let providerRequests = 0;
    for (const entry of Object.values(sourceRecords)) {
      const usageEntry = asRecord(entry);
      if (!usageEntry) {
        continue;
      }

      const success = asNumber(usageEntry.success);
      const failed = asNumber(usageEntry.failed);
      providerRequests += success + failed;
      usage.success_count = (usage.success_count ?? 0) + success;
      usage.failure_count = (usage.failure_count ?? 0) + failed;
      response.failed_requests = (response.failed_requests ?? 0) + failed;
    }

    if (providerRequests > 0) {
      const providerBucket = ensureProviderBucket(response, provider);
      providerBucket.total_requests = (providerBucket.total_requests ?? 0) + providerRequests;
      usage.total_requests = (usage.total_requests ?? 0) + providerRequests;
    }
  }

  return response;
}

export function hasUsageDetails(response: CliproxyUsageApiResponse): boolean {
  return collectResponseDetails(response).length > 0;
}

export function hasUsageTotals(response: CliproxyUsageApiResponse): boolean {
  return (response.usage?.total_requests ?? 0) > 0;
}
