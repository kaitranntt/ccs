import type { CliproxyRequestDetail, CliproxyUsageApiResponse } from './stats-fetcher';

interface CliproxyUsageQueueRecord {
  timestamp?: string;
  provider?: string;
  model?: string;
  alias?: string;
  source?: string;
  auth_index?: string | number;
  request_id?: string;
  tokens?: Partial<CliproxyRequestDetail['tokens']>;
  failed?: boolean;
}

interface ApiKeyUsageEntry {
  success?: number;
  failed?: number;
}

type ApiKeyUsageResponse = Record<string, Record<string, ApiKeyUsageEntry>>;

interface MergeMissingDetailsOptions {
  appendExtraDetails?: boolean;
}

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
    request_id: asString(raw.request_id, ''),
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
    detail.request_id?.trim() ?? '',
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
      request_id: record.request_id || undefined,
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

function cloneUsageResponse(response: CliproxyUsageApiResponse): CliproxyUsageApiResponse {
  return {
    failed_requests: response.failed_requests ?? 0,
    usage: {
      total_requests: response.usage?.total_requests ?? 0,
      success_count: response.usage?.success_count ?? 0,
      failure_count: response.usage?.failure_count ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
      apis: Object.fromEntries(
        Object.entries(response.usage?.apis ?? {}).map(([provider, providerData]) => [
          provider,
          {
            total_requests: providerData.total_requests ?? 0,
            total_tokens: providerData.total_tokens ?? 0,
            models: Object.fromEntries(
              Object.entries(providerData.models ?? {}).map(([model, modelData]) => [
                model,
                {
                  total_requests: modelData.total_requests ?? 0,
                  total_tokens: modelData.total_tokens ?? 0,
                  details: (modelData.details ?? []).map((detail) => ({
                    ...detail,
                    tokens: { ...detail.tokens },
                  })),
                },
              ])
            ),
          },
        ])
      ),
    },
  };
}

function cloneDetail(detail: CliproxyRequestDetail): CliproxyRequestDetail {
  return {
    ...detail,
    tokens: { ...detail.tokens },
  };
}

function createMissingDetailMergeKey(
  provider: string,
  model: string,
  detail: CliproxyRequestDetail
): string {
  return [
    provider,
    model,
    detail.request_id?.trim() ?? '',
    detail.timestamp,
    detail.source?.trim() ?? '',
    String(detail.auth_index ?? '').trim(),
    detail.tokens?.input_tokens ?? 0,
    detail.tokens?.output_tokens ?? 0,
    detail.tokens?.reasoning_tokens ?? 0,
    detail.tokens?.cached_tokens ?? 0,
    detail.tokens?.total_tokens ?? 0,
    detail.failed ? '1' : '0',
  ].join('|');
}

function extractDuplicateIdentityValue(value: string): string {
  const authFileMatch = value.match(/(?:^|\s)auth_file=("[^"]+"|'[^']+'|[^\s]+)/i);
  const rawValue = authFileMatch?.[1] ?? value;
  const unquotedValue = rawValue.trim().replace(/^['"]|['"]$/g, '');
  const pipeCandidate = unquotedValue.split('|').pop() ?? unquotedValue;
  return pipeCandidate.split(/[\\/]/).pop() ?? pipeCandidate.trim();
}

function stripKnownAuthPlanSuffix(value: string): string {
  return value.replace(/-(?:free|plus|pro|team|business|enterprise)$/i, '');
}

function normalizeDuplicateIdentity(provider: string, value: string | number | undefined): string {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return '';
  }

  const normalizedProvider = provider.trim().toLowerCase();
  const identityValue = extractDuplicateIdentityValue(rawValue);
  const hadJsonExtension = /\.json$/i.test(identityValue);
  let candidate = identityValue.replace(/\.json$/i, '');
  const providerPrefix = `${normalizedProvider}-`;
  if (candidate.toLowerCase().startsWith(providerPrefix)) {
    candidate = candidate.slice(providerPrefix.length);
  }

  candidate = candidate.replace(/^[a-f0-9]{8}[-_]/i, '').trim();
  if (hadJsonExtension) {
    candidate = stripKnownAuthPlanSuffix(candidate);
  }

  return candidate ? candidate.toLowerCase() : rawValue.toLowerCase();
}

function resolveCompleteDetailDuplicateIdentity(
  provider: string,
  detail: CliproxyRequestDetail
): string {
  return (
    normalizeDuplicateIdentity(provider, detail.source) ||
    normalizeDuplicateIdentity(provider, detail.auth_index) ||
    'unknown'
  );
}

function createLikelyLogDuplicateKey(
  provider: string,
  model: string,
  detail: CliproxyRequestDetail
): string {
  return [
    provider,
    model,
    resolveCompleteDetailDuplicateIdentity(provider, detail),
    detail.failed ? '1' : '0',
  ].join('|');
}

function createRequestIdDuplicateKey(
  provider: string,
  model: string,
  detail: CliproxyRequestDetail
): string {
  const requestId = detail.request_id?.trim();
  return requestId ? [provider, model, requestId, detail.failed ? '1' : '0'].join('|') : '';
}

function parseDetailTimestamp(detail: CliproxyRequestDetail): number | null {
  const timestampMs = Date.parse(detail.timestamp);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

const TOKENLESS_LOG_DUPLICATE_WINDOW_MS = 5_000;

interface LikelyLogDuplicateCandidates {
  byRequestId: Map<string, number>;
  byIdentity: Map<string, number[]>;
}

function detailHasTokenUsage(detail: CliproxyRequestDetail): boolean {
  return (
    (detail.tokens?.input_tokens ?? 0) > 0 ||
    (detail.tokens?.output_tokens ?? 0) > 0 ||
    (detail.tokens?.reasoning_tokens ?? 0) > 0 ||
    (detail.tokens?.cached_tokens ?? 0) > 0 ||
    (detail.tokens?.total_tokens ?? 0) > 0
  );
}

function collectDetailMergeKeyCounts(response: CliproxyUsageApiResponse): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of collectResponseDetails(response)) {
    const key = createMissingDetailMergeKey(entry.provider, entry.model, entry.detail);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function collectLikelyLogDuplicateCandidates(
  response: CliproxyUsageApiResponse
): LikelyLogDuplicateCandidates {
  const candidates: LikelyLogDuplicateCandidates = {
    byRequestId: new Map<string, number>(),
    byIdentity: new Map<string, number[]>(),
  };
  for (const [provider, providerData] of Object.entries(response.usage?.apis ?? {})) {
    for (const [model, modelData] of Object.entries(providerData.models ?? {})) {
      const details = modelData.details ?? [];
      const canUseIdentityWindow = (modelData.total_requests ?? 0) <= details.length;
      for (const detail of details) {
        const requestIdKey = createRequestIdDuplicateKey(provider, model, detail);
        if (requestIdKey) {
          candidates.byRequestId.set(
            requestIdKey,
            (candidates.byRequestId.get(requestIdKey) ?? 0) + 1
          );
        }

        if (!canUseIdentityWindow) {
          continue;
        }

        const timestampMs = parseDetailTimestamp(detail);
        if (timestampMs === null) {
          continue;
        }

        const key = createLikelyLogDuplicateKey(provider, model, detail);
        const timestamps = candidates.byIdentity.get(key) ?? [];
        timestamps.push(timestampMs);
        candidates.byIdentity.set(key, timestamps);
      }
    }
  }
  return candidates;
}

function consumeDetailKey(counts: Map<string, number>, key: string): boolean {
  const count = counts.get(key) ?? 0;
  if (count <= 0) {
    return false;
  }

  if (count === 1) {
    counts.delete(key);
  } else {
    counts.set(key, count - 1);
  }
  return true;
}

function consumeCount(counts: Map<string, number>, key: string): boolean {
  const count = counts.get(key) ?? 0;
  if (count <= 0) {
    return false;
  }

  if (count === 1) {
    counts.delete(key);
  } else {
    counts.set(key, count - 1);
  }
  return true;
}

function consumeLikelyLogDuplicateCandidate(
  candidates: LikelyLogDuplicateCandidates,
  provider: string,
  model: string,
  detail: CliproxyRequestDetail
): boolean {
  if (detailHasTokenUsage(detail)) {
    return false;
  }

  const requestIdKey = createRequestIdDuplicateKey(provider, model, detail);
  if (requestIdKey && consumeCount(candidates.byRequestId, requestIdKey)) {
    return true;
  }

  const timestampMs = parseDetailTimestamp(detail);
  if (timestampMs === null) {
    return false;
  }

  const key = createLikelyLogDuplicateKey(provider, model, detail);
  const timestamps = candidates.byIdentity.get(key) ?? [];
  const index = timestamps.findIndex(
    (candidateTimestampMs) =>
      Math.abs(candidateTimestampMs - timestampMs) <= TOKENLESS_LOG_DUPLICATE_WINDOW_MS
  );
  if (index === -1) {
    return false;
  }

  timestamps.splice(index, 1);
  if (timestamps.length === 0) {
    candidates.byIdentity.delete(key);
  } else {
    candidates.byIdentity.set(key, timestamps);
  }
  return true;
}

function countProviderDetails(
  providerBucket: NonNullable<NonNullable<CliproxyUsageApiResponse['usage']>['apis']>[string]
): number {
  return Object.values(providerBucket.models ?? {}).reduce(
    (total, modelData) => total + (modelData.details ?? []).length,
    0
  );
}

function appendDetailToExistingProvider(
  merged: CliproxyUsageApiResponse,
  provider: string,
  model: string,
  detail: CliproxyRequestDetail,
  options: Required<MergeMissingDetailsOptions>
): void {
  const providerBucket = ensureProviderBucket(merged, provider);
  const shouldFillAggregateOnly =
    (providerBucket.total_requests ?? 0) > countProviderDetails(providerBucket);
  if (!shouldFillAggregateOnly) {
    if (!options.appendExtraDetails) {
      return;
    }
    addDetail(merged, provider, model, cloneDetail(detail));
    return;
  }

  const modelBucket = ensureModelBucket(providerBucket, model);
  const shouldFillModelAggregateOnly =
    (modelBucket.total_requests ?? 0) > (modelBucket.details ?? []).length;

  if (!shouldFillModelAggregateOnly) {
    modelBucket.total_requests = (modelBucket.total_requests ?? 0) + 1;
  }
  (modelBucket.details ??= []).push(cloneDetail(detail));
}

export function mergeUsageResponseWithMissingDetails(
  base: CliproxyUsageApiResponse,
  incoming: CliproxyUsageApiResponse | null | undefined,
  options: MergeMissingDetailsOptions = {}
): CliproxyUsageApiResponse {
  if (!incoming || !hasUsageDetails(incoming)) {
    return base;
  }

  const normalizedOptions: Required<MergeMissingDetailsOptions> = {
    appendExtraDetails: options.appendExtraDetails ?? true,
  };
  const merged = cloneUsageResponse(base);
  const existingDetailCounts = collectDetailMergeKeyCounts(base);
  const likelyLogDuplicateCandidates = collectLikelyLogDuplicateCandidates(base);
  for (const entry of collectResponseDetails(incoming)) {
    const mergeKey = createMissingDetailMergeKey(entry.provider, entry.model, entry.detail);
    if (consumeDetailKey(existingDetailCounts, mergeKey)) {
      continue;
    }

    if (
      consumeLikelyLogDuplicateCandidate(
        likelyLogDuplicateCandidates,
        entry.provider,
        entry.model,
        entry.detail
      )
    ) {
      continue;
    }

    if (base.usage?.apis?.[entry.provider]) {
      appendDetailToExistingProvider(
        merged,
        entry.provider,
        entry.model,
        entry.detail,
        normalizedOptions
      );
      continue;
    }

    addDetail(merged, entry.provider, entry.model, cloneDetail(entry.detail));
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
