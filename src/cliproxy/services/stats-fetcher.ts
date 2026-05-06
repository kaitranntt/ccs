/**
 * CLIProxyAPI Stats Fetcher
 *
 * Fetches usage statistics from CLIProxyAPI's management API.
 * Requires usage-statistics-enabled: true in config.yaml.
 */

import { getEffectiveApiKey, getEffectiveManagementSecret } from '../auth/auth-token-manager';
import {
  getProxyTarget,
  buildProxyUrl,
  buildProxyHeaders,
  buildManagementHeaders,
} from '../proxy/proxy-target-resolver';
import { buildCliproxyStatsFromUsageResponse } from './stats-transformer';
import { buildUsageResponseFromCliproxyMainLog } from './oauth-usage-log-transformer';
import {
  buildUsageResponseFromApiKeyUsage,
  buildUsageResponseFromQueueRecords,
  hasUsageDetails,
  hasUsageTotals,
  mergeUsageResponseWithMissingDetails,
  mergeUsageResponses,
} from './usage-compatibility-transformer';

interface ManagementJsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  cacheKey: string;
}

/** Per-account usage statistics */
export interface AccountUsageStats {
  /** Provider-qualified lookup key (for example: "codex:user@example.com") */
  accountKey: string;
  /** Canonical provider name reported by CLIProxyAPI */
  provider: string;
  /** Raw account email or identifier */
  source: string;
  /** Number of successful requests */
  successCount: number;
  /** Number of failed requests */
  failureCount: number;
  /** Total tokens used */
  totalTokens: number;
  /** Last request timestamp */
  lastUsedAt?: string;
}

/** Usage statistics from CLIProxyAPI */
export interface CliproxyStats {
  /** Total number of requests processed */
  totalRequests: number;
  /** Total successful requests */
  successCount: number;
  /** Total failed requests */
  failureCount: number;
  /** Token counts */
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  /** Requests grouped by model */
  requestsByModel: Record<string, number>;
  /** Requests grouped by provider */
  requestsByProvider: Record<string, number>;
  /** Per-account usage breakdown */
  accountStats: Record<string, AccountUsageStats>;
  /** Number of quota exceeded (429) events */
  quotaExceededCount: number;
  /** Number of request retries */
  retryCount: number;
  /** Timestamp of stats collection */
  collectedAt: string;
}

/** Request detail from CLIProxyAPI */
export interface CliproxyRequestDetail {
  timestamp: string;
  source: string;
  auth_index: string | number;
  request_id?: string;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    total_tokens: number;
  };
  failed: boolean;
}

/** @deprecated Use CliproxyRequestDetail instead */
type RequestDetail = CliproxyRequestDetail;

/** Usage API response from CLIProxyAPI /v0/management/usage endpoint */
export interface CliproxyUsageApiResponse {
  failed_requests?: number;
  usage?: {
    total_requests?: number;
    success_count?: number;
    failure_count?: number;
    total_tokens?: number;
    apis?: Record<
      string,
      {
        total_requests?: number;
        total_tokens?: number;
        models?: Record<
          string,
          {
            total_requests?: number;
            total_tokens?: number;
            details?: RequestDetail[];
          }
        >;
      }
    >;
  };
}

/** Auth file metadata from CLIProxyAPI /v0/management/auth-files */
export interface CliproxyManagementAuthFile {
  auth_index?: string | number;
  provider?: string;
  email?: string;
  name?: string;
}

const cachedUsageQueueResponses = new Map<string, CliproxyUsageApiResponse>();
const USAGE_QUEUE_BATCH_SIZE = 1000;
const USAGE_QUEUE_MAX_BATCHES = 100;
const USAGE_QUEUE_DRAIN_TIMEOUT_MS = 30_000;

/**
 * Fetch usage statistics from CLIProxyAPI management API
 * @param port CLIProxyAPI port (default: 8317)
 * @returns Stats object or null if unavailable
 */
export async function fetchCliproxyStats(port?: number): Promise<CliproxyStats | null> {
  try {
    const [data, authFiles] = await Promise.all([
      fetchCliproxyUsageRaw(port),
      fetchCliproxyAuthFiles(port),
    ]);

    if (!data) {
      return null;
    }

    return buildCliproxyStatsFromUsageResponse(data, { authFiles: authFiles ?? [] });
  } catch {
    // CLIProxyAPI not running or stats endpoint not available
    return null;
  }
}

/**
 * Fetch raw usage response from CLIProxyAPI management API
 * Returns the unprocessed API response for transformation by cliproxy-usage-transformer
 */
export async function fetchCliproxyUsageRaw(
  port?: number
): Promise<CliproxyUsageApiResponse | null> {
  let localLogUsage: CliproxyUsageApiResponse | null | undefined;
  const getLocalLogUsage = (): CliproxyUsageApiResponse | null => {
    if (localLogUsage !== undefined) {
      return localLogUsage;
    }

    localLogUsage = getProxyTarget().isRemote ? null : buildUsageResponseFromCliproxyMainLog();
    return localLogUsage;
  };

  const mergeLocalLogUsage = (response: CliproxyUsageApiResponse): CliproxyUsageApiResponse =>
    mergeUsageResponseWithMissingDetails(response, getLocalLogUsage());
  const mergeAggregateWithDetails = (
    aggregate: CliproxyUsageApiResponse,
    details: CliproxyUsageApiResponse
  ): CliproxyUsageApiResponse =>
    mergeUsageResponseWithMissingDetails(aggregate, details, { appendExtraDetails: false });

  let legacyAggregateUsage: CliproxyUsageApiResponse | null = null;
  const legacyUsage = await fetchManagementJson<CliproxyUsageApiResponse>(
    '/v0/management/usage',
    port
  );
  if (legacyUsage?.ok && legacyUsage.data) {
    if (hasUsageDetails(legacyUsage.data)) {
      return mergeLocalLogUsage(legacyUsage.data);
    }
    legacyAggregateUsage = legacyUsage.data;
  }

  let cachedUsageQueueResponse: CliproxyUsageApiResponse | undefined;
  const usageQueue = await fetchUsageQueueRecords(port);
  if (usageQueue?.cacheKey) {
    cachedUsageQueueResponse = cachedUsageQueueResponses.get(usageQueue.cacheKey);
  }

  if (usageQueue && Array.isArray(usageQueue.data)) {
    const queueResponse = buildUsageResponseFromQueueRecords(usageQueue.data);
    if (hasUsageDetails(queueResponse)) {
      const mergedUsageQueueResponse = cachedUsageQueueResponse
        ? mergeUsageResponses(cachedUsageQueueResponse, queueResponse)
        : queueResponse;
      cachedUsageQueueResponses.set(usageQueue.cacheKey, mergedUsageQueueResponse);
      cachedUsageQueueResponse = mergedUsageQueueResponse;
      if (usageQueue.ok) {
        const response = legacyAggregateUsage
          ? mergeAggregateWithDetails(legacyAggregateUsage, mergedUsageQueueResponse)
          : mergedUsageQueueResponse;
        return mergeLocalLogUsage(response);
      }
    }
  }

  if (legacyAggregateUsage) {
    const response = cachedUsageQueueResponse
      ? mergeAggregateWithDetails(legacyAggregateUsage, cachedUsageQueueResponse)
      : legacyAggregateUsage;
    return mergeLocalLogUsage(response);
  }

  const apiKeyUsage = await fetchManagementJson<unknown>('/v0/management/api-key-usage', port);
  if (apiKeyUsage?.ok && apiKeyUsage.data) {
    const apiKeyResponseWithCachedDetails = cachedUsageQueueResponse
      ? mergeAggregateWithDetails(
          buildUsageResponseFromApiKeyUsage(apiKeyUsage.data),
          cachedUsageQueueResponse
        )
      : buildUsageResponseFromApiKeyUsage(apiKeyUsage.data);
    const apiKeyResponse = mergeLocalLogUsage(apiKeyResponseWithCachedDetails);
    if (hasUsageTotals(apiKeyResponse)) {
      return apiKeyResponse;
    }
  }

  if (cachedUsageQueueResponse) {
    return mergeLocalLogUsage(cachedUsageQueueResponse);
  }

  const logUsage = getLocalLogUsage();
  if (logUsage && hasUsageDetails(logUsage)) {
    return logUsage;
  }

  if (usageQueue?.ok) {
    return buildUsageResponseFromQueueRecords([]);
  }

  return null;
}

async function fetchUsageQueueRecords(
  port?: number
): Promise<ManagementJsonResult<unknown[]> | null> {
  const records: unknown[] = [];
  const seenFullBatchSignatures = new Set<string>();
  let cacheKey = '';
  let status = 0;
  const drainStartedAt = Date.now();

  for (let batchCount = 0; batchCount < USAGE_QUEUE_MAX_BATCHES; batchCount++) {
    const result = await fetchManagementJson<unknown[]>(
      `/v0/management/usage-queue?count=${USAGE_QUEUE_BATCH_SIZE}`,
      port
    );
    if (!result) {
      return records.length > 0 ? { ok: false, status, data: records, cacheKey } : null;
    }

    cacheKey ||= result.cacheKey;
    status = result.status;
    if (!result.ok || !Array.isArray(result.data)) {
      return records.length > 0 ? { ok: false, status, data: records, cacheKey } : result;
    }

    if (result.data.length === USAGE_QUEUE_BATCH_SIZE) {
      const batchSignature = createUsageQueueBatchSignature(result.data);
      if (seenFullBatchSignatures.has(batchSignature)) {
        return { ok: false, status, data: records, cacheKey };
      }
      seenFullBatchSignatures.add(batchSignature);
    }

    records.push(...result.data);
    if (result.data.length < USAGE_QUEUE_BATCH_SIZE) {
      return { ok: true, status, data: records, cacheKey };
    }

    if (Date.now() - drainStartedAt >= USAGE_QUEUE_DRAIN_TIMEOUT_MS) {
      return { ok: false, status, data: records, cacheKey };
    }
  }

  return { ok: false, status, data: records, cacheKey };
}

function createUsageQueueBatchSignature(records: unknown[]): string {
  return JSON.stringify(records);
}

async function fetchManagementJson<T>(
  endpointPath: string,
  port?: number,
  timeoutMs = 5000
): Promise<ManagementJsonResult<T> | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const target = getProxyTarget();
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(target, endpointPath);

    const headers = target.isRemote
      ? buildManagementHeaders(target)
      : { Accept: 'application/json', Authorization: `Bearer ${getEffectiveManagementSecret()}` };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      return { ok: false, status: response.status, data: null, cacheKey: url };
    }

    return {
      ok: true,
      status: response.status,
      data: (await response.json()) as T,
      cacheKey: url,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchCliproxyAuthFiles(port?: number): Promise<CliproxyManagementAuthFile[] | null> {
  try {
    const result = await fetchManagementJson<{ files?: CliproxyManagementAuthFile[] }>(
      '/v0/management/auth-files',
      port
    );
    if (!result?.ok || !result.data) {
      return null;
    }

    const data = result.data;
    return Array.isArray(data.files) ? data.files : null;
  } catch {
    return null;
  }
}

export const __testExports = {
  clearCachedUsageQueueResponse(): void {
    cachedUsageQueueResponses.clear();
  },
};

/** OpenAI-compatible model object from /v1/models endpoint */
export interface CliproxyModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/** Response from /v1/models endpoint */
interface ModelsApiResponse {
  data: CliproxyModel[];
  object: string;
}

/** Categorized models response for UI */
export interface CliproxyModelsResponse {
  models: CliproxyModel[];
  byCategory: Record<string, CliproxyModel[]>;
  totalCount: number;
}

/**
 * Fetch available models from CLIProxyAPI /v1/models endpoint
 * @param port CLIProxyAPI port (default: 8317)
 * @returns Categorized models or null if unavailable
 */
export async function fetchCliproxyModels(port?: number): Promise<CliproxyModelsResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    // Dynamic target resolution
    const target = getProxyTarget();
    // Allow port override for local testing only
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(target, '/v1/models');

    // For /v1 endpoints: use remote auth token for remote, effective API key for local
    const headers = target.isRemote
      ? buildProxyHeaders(target)
      : { Accept: 'application/json', Authorization: `Bearer ${getEffectiveApiKey()}` };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ModelsApiResponse;

    // Group models by owned_by field
    const byCategory: Record<string, CliproxyModel[]> = {};
    for (const model of data.data) {
      const category = model.owned_by || 'other';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(model);
    }

    // Sort models within each category alphabetically
    for (const category of Object.keys(byCategory)) {
      byCategory[category].sort((a, b) => a.id.localeCompare(b.id));
    }

    return {
      models: data.data,
      byCategory,
      totalCount: data.data.length,
    };
  } catch {
    return null;
  }
}

/** Error log file metadata from CLIProxyAPI */
export interface CliproxyErrorLog {
  /** Filename (e.g., "error-v1-chat-completions-2025-01-15T10-30-00.log") */
  name: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp (Unix seconds) */
  modified: number;
  /** Absolute path to the log file (injected by backend) */
  absolutePath?: string;
  /** HTTP status code extracted from log (injected by backend) */
  statusCode?: number;
  /** Model name extracted from request body (injected by backend) */
  model?: string;
}

/** Response from /v0/management/request-error-logs endpoint */
interface ErrorLogsApiResponse {
  files: CliproxyErrorLog[];
}

/**
 * Fetch error log file list from CLIProxyAPI management API
 * @param port CLIProxyAPI port (default: 8317)
 * @returns Array of error log metadata or null if unavailable
 */
export async function fetchCliproxyErrorLogs(port?: number): Promise<CliproxyErrorLog[] | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    // Dynamic target resolution
    const target = getProxyTarget();
    // Allow port override for local testing only
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(target, '/v0/management/request-error-logs');

    // For management endpoints, use management key for remote, local management secret for local
    const headers = target.isRemote
      ? buildManagementHeaders(target)
      : { Accept: 'application/json', Authorization: `Bearer ${getEffectiveManagementSecret()}` };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ErrorLogsApiResponse;
    return data.files ?? [];
  } catch {
    return null;
  }
}

/**
 * Fetch error log file content from CLIProxyAPI management API
 * @param name Error log filename
 * @param port CLIProxyAPI port (default: 8317)
 * @returns Log file content as string or null if unavailable
 */
export async function fetchCliproxyErrorLogContent(
  name: string,
  port?: number
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // Dynamic target resolution
    const target = getProxyTarget();
    // Allow port override for local testing only
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(
      target,
      `/v0/management/request-error-logs/${encodeURIComponent(name)}`
    );

    // For management endpoints, use management key for remote, local management secret for local
    const headers = target.isRemote
      ? buildManagementHeaders(target)
      : { Authorization: `Bearer ${getEffectiveManagementSecret()}` };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Check if CLIProxyAPI is running and responsive
 * @param port CLIProxyAPI port (default: 8317)
 * @returns true if proxy is running
 */
export async function isCliproxyRunning(port?: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout

    // Dynamic target resolution
    const target = getProxyTarget();
    // Allow port override for local testing only
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(target, '/');

    // Health check - no auth needed for root endpoint
    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
