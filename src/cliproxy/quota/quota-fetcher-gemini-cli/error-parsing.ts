/**
 * Error parsing and failure-result builders for the Gemini CLI quota fetcher.
 *
 * Translates non-200 upstream responses into structured {@link GeminiCliQuotaResult}
 * failure payloads with sanitized error details, recovery hints, and provider
 * entitlement evidence. Token values in error bodies are always redacted before
 * being surfaced (see {@link sanitizeGeminiCliErrorDetail}).
 */

import {
  buildProviderEntitlementEvidence,
  isModelCapacityExhausted,
} from '../../auth/provider-entitlement-evidence';
import type {
  GeminiCliFailureResultOptions,
  GeminiCliQuotaResult,
  ParsedGeminiCliErrorBody,
} from './types';
import {
  GEMINI_CLI_ERROR_DETAIL_MAX_LENGTH,
  GEMINI_CLI_ERROR_DETAIL_TRUNCATION_SUFFIX,
} from './constants';

/**
 * Build a structured failure {@link GeminiCliQuotaResult} with empty buckets.
 * Centralizes the common failure shape so each HTTP-status branch only needs
 * to supply its specific error/hint/entitlement fields.
 */
export function buildGeminiCliFailureResult(
  accountId: string,
  projectId: string | null,
  options: GeminiCliFailureResultOptions
): GeminiCliQuotaResult {
  return {
    success: false,
    buckets: [],
    projectId,
    tierLabel: null,
    tierId: null,
    creditBalance: null,
    lastUpdated: Date.now(),
    accountId,
    error: options.error,
    httpStatus: options.httpStatus,
    errorCode: options.errorCode,
    errorDetail: options.errorDetail,
    actionHint: options.actionHint,
    retryable: options.retryable,
    needsReauth: options.needsReauth,
    isForbidden: options.isForbidden,
    entitlement: options.entitlement,
  };
}

/**
 * Sanitize an upstream error body for safe inclusion in a quota result.
 *
 * - Collapses HTML responses to a placeholder (never leaks provider HTML).
 * - Redacts common token/credential/secret field names and `Bearer <token>`.
 * - Collapses internal whitespace to single spaces.
 * - Truncates to {@link GEMINI_CLI_ERROR_DETAIL_MAX_LENGTH} with a sentinel suffix.
 *
 * Returns undefined for empty input. Token values are never preserved.
 */
export function sanitizeGeminiCliErrorDetail(bodyText: string): string | undefined {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed) || /^<[^>]+>/.test(trimmed)) {
    return '[HTML error response omitted]';
  }

  let sanitized = trimmed
    .replace(
      /"(access[_-]?token|refresh[_-]?token|authorization|cookie|set-cookie|api[_-]?key|session[_-]?token|token)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"'
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/\s+/g, ' ');

  if (sanitized.length > GEMINI_CLI_ERROR_DETAIL_MAX_LENGTH) {
    sanitized = `${sanitized.slice(
      0,
      GEMINI_CLI_ERROR_DETAIL_MAX_LENGTH - GEMINI_CLI_ERROR_DETAIL_TRUNCATION_SUFFIX.length
    )}${GEMINI_CLI_ERROR_DETAIL_TRUNCATION_SUFFIX}`;
  }

  return sanitized;
}

/**
 * Recursively extract the first non-empty message-like field from a nested
 * error `details` array/object. Looks for `message`, `localizedMessage`,
 * `description`, `reason`, and `error` keys at any level.
 */
export function extractGeminiCliNestedMessage(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractGeminiCliNestedMessage(entry);
      if (nested) return nested;
    }
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const directMessage = [
    record.message,
    record.localizedMessage,
    record.description,
    record.reason,
    record.error,
  ].find(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0
  );
  if (directMessage) {
    return directMessage;
  }

  return undefined;
}

/**
 * Parse an upstream error body into a structured {@link ParsedGeminiCliErrorBody}.
 *
 * Extracts a top-level code/status, a message (looking inside `error` objects
 * and nested `details`), and a sanitized error detail. Non-JSON bodies fall
 * back to the raw (sanitized) trimmed text as the message. HTML bodies surface
 * only as the sanitized detail placeholder, never as the message.
 */
export function parseGeminiCliErrorBody(bodyText: string): ParsedGeminiCliErrorBody {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return {};
  }

  const sanitizedDetail = sanitizeGeminiCliErrorDetail(trimmed);

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const topLevelMessage = [parsed.message, parsed.error].find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.trim().length > 0
    );
    const topLevelCode = [parsed.code, parsed.status].find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.trim().length > 0
    );

    if (parsed.error && typeof parsed.error === 'object') {
      const error = parsed.error as Record<string, unknown>;
      return {
        errorCode:
          [error.status, error.code, topLevelCode].find(
            (candidate): candidate is string =>
              typeof candidate === 'string' && candidate.trim().length > 0
          ) || undefined,
        errorDetail: sanitizedDetail,
        message:
          [
            error.message,
            error.error,
            extractGeminiCliNestedMessage(error.details),
            topLevelMessage,
          ].find(
            (candidate): candidate is string =>
              typeof candidate === 'string' && candidate.trim().length > 0
          ) || undefined,
      };
    }

    return {
      errorCode: topLevelCode,
      errorDetail: sanitizedDetail,
      message:
        [topLevelMessage, extractGeminiCliNestedMessage(parsed.details)].find(
          (candidate): candidate is string =>
            typeof candidate === 'string' && candidate.trim().length > 0
        ) || undefined,
    };
  } catch {
    return {
      errorDetail: sanitizedDetail,
      message: sanitizedDetail === '[HTML error response omitted]' ? undefined : trimmed,
    };
  }
}

/**
 * Build a user-facing recovery hint for a 403 (forbidden) upstream response.
 * Inspects the parsed message/detail for verification, project, or generic
 * access signals and returns the matching recovery instruction.
 */
export function buildGeminiCliForbiddenActionHint(parsed: ParsedGeminiCliErrorBody): string {
  const combined = `${parsed.message || ''} ${parsed.errorDetail || ''}`.toLowerCase();
  if (combined.includes('verify') || combined.includes('verification')) {
    return 'Complete the Google account verification mentioned above, then retry quota refresh.';
  }
  if (combined.includes('project')) {
    return 'Confirm this Google project still has Gemini CLI quota access, then retry.';
  }
  return 'Check the Google account or workspace access shown above, then retry quota refresh.';
}

/**
 * Build a structured failure result from an HTTP non-200 upstream response.
 *
 * Status-specific behavior:
 *   - 401: marks the result as needsReauth (user must re-run `ccs gemini --auth`)
 *   - 403: marks forbidden with runtime-inferred not_entitled evidence and a
 *          context-aware action hint
 *   - 429: distinguishes MODEL_CAPACITY_EXHAUSTED (entitled but capacity-stressed)
 *          from generic rate limiting
 *   - >=500: retryable provider-unavailable result
 *   - other: generic non-retryable quota_request_failed
 */
export function buildGeminiCliHttpFailureResult(
  accountId: string,
  projectId: string | null,
  status: number,
  bodyText: string
): GeminiCliQuotaResult {
  const parsed = parseGeminiCliErrorBody(bodyText);

  if (status === 401) {
    return buildGeminiCliFailureResult(accountId, projectId, {
      error: parsed.message || 'Token expired or invalid',
      httpStatus: 401,
      errorCode: parsed.errorCode || 'reauth_required',
      errorDetail: parsed.errorDetail,
      actionHint: 'Run ccs gemini --auth to reconnect this account.',
      needsReauth: true,
      retryable: false,
    });
  }

  if (status === 403) {
    return buildGeminiCliFailureResult(accountId, projectId, {
      error: parsed.message || 'Quota access forbidden for this account',
      httpStatus: 403,
      errorCode: parsed.errorCode || 'quota_api_forbidden',
      errorDetail: parsed.errorDetail,
      actionHint: buildGeminiCliForbiddenActionHint(parsed),
      isForbidden: true,
      retryable: false,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'medium',
        accessState: 'not_entitled',
        capacityState: 'unknown',
      }),
    });
  }

  if (status === 429) {
    if (isModelCapacityExhausted(parsed.message, parsed.errorDetail, parsed.errorCode)) {
      return buildGeminiCliFailureResult(accountId, projectId, {
        error: parsed.message || 'Model capacity exhausted for this account right now',
        httpStatus: 429,
        errorCode: 'capacity_exhausted',
        errorDetail: parsed.errorDetail,
        actionHint:
          'Retry later or switch to another Gemini model. This indicates temporary model capacity, not an authentication failure.',
        retryable: true,
        entitlement: buildProviderEntitlementEvidence({
          normalizedTier: 'unknown',
          source: 'runtime_inference',
          confidence: 'medium',
          accessState: 'entitled',
          capacityState: 'capacity_exhausted',
          notes: 'Upstream returned MODEL_CAPACITY_EXHAUSTED for this model.',
        }),
      });
    }

    return buildGeminiCliFailureResult(accountId, projectId, {
      error: parsed.message || 'Rate limited - try again later',
      httpStatus: 429,
      errorCode: parsed.errorCode || 'rate_limited',
      errorDetail: parsed.errorDetail,
      actionHint: 'Retry after a short delay.',
      retryable: true,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'rate_limited',
      }),
    });
  }

  if (status >= 500) {
    return buildGeminiCliFailureResult(accountId, projectId, {
      error: parsed.message || `Gemini quota service unavailable (HTTP ${status})`,
      httpStatus: status,
      errorCode: parsed.errorCode || 'provider_unavailable',
      errorDetail: parsed.errorDetail,
      actionHint: 'Retry later. This looks like a temporary Google upstream problem.',
      retryable: true,
    });
  }

  return buildGeminiCliFailureResult(accountId, projectId, {
    error: parsed.message || `Gemini quota request failed (HTTP ${status})`,
    httpStatus: status,
    errorCode: parsed.errorCode || 'quota_request_failed',
    errorDetail: parsed.errorDetail,
    actionHint: 'Inspect the upstream response details and retry if appropriate.',
    retryable: false,
  });
}
