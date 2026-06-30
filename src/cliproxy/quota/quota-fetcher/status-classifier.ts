/**
 * Status classifier for Antigravity quota fetch failures.
 *
 * Maps an upstream HTTP status code (plus optional response body) into a stable
 * QuotaResult failure fragment: error code, action hint, retryability, and
 * provider entitlement evidence. Also merges tier evidence from a successful
 * project lookup with entitlement evidence derived from a failed models fetch.
 */

import type { AccountTier } from '../../accounts/account-manager';
import { buildProviderEntitlementEvidence } from '../../auth/provider-entitlement-evidence';
import type { ProviderEntitlementEvidence } from '../../auth/provider-entitlement-types';
import type { QuotaResult } from './types';

/** Trim and cap upstream error bodies to keep payloads small. */
export function normalizeErrorDetail(bodyText: string): string | undefined {
  const normalized = bodyText.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= 400) {
    return normalized;
  }
  return `${normalized.slice(0, 397)}...`;
}

/**
 * Build the failure fragment for an Antigravity quota request. The returned
 * object is spread into a QuotaResult by callers. Status 401/403/429/408/5xx
 * each have their own stable error code and capacity/access state signal.
 */
export function buildAntigravityFailure(
  status: number | undefined,
  bodyText?: string
): Pick<
  QuotaResult,
  | 'error'
  | 'errorCode'
  | 'errorDetail'
  | 'actionHint'
  | 'retryable'
  | 'httpStatus'
  | 'needsReauth'
  | 'entitlement'
> & { isForbidden?: boolean } {
  const detail = normalizeErrorDetail(bodyText || '');

  if (status === 401) {
    return {
      httpStatus: 401,
      error: 'Token expired or invalid',
      errorCode: 'reauth_required',
      actionHint:
        'Re-authenticate this account. If CLIProxy is running, retry after the proxy finishes refreshing the token.',
      needsReauth: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'medium',
        accessState: 'unknown',
        capacityState: 'unknown',
      }),
    };
  }

  if (status === 403) {
    return {
      httpStatus: 403,
      error: 'Access forbidden',
      errorCode: 'quota_api_forbidden',
      actionHint: 'This account does not have Gemini Code Assist quota access.',
      isForbidden: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'medium',
        accessState: 'not_entitled',
        capacityState: 'unknown',
      }),
    };
  }

  if (status === 429) {
    return {
      httpStatus: 429,
      error: 'Rate limited - try again later',
      errorCode: 'rate_limited',
      actionHint: 'Retry later. This looks temporary.',
      retryable: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'rate_limited',
      }),
    };
  }

  if (status === 408) {
    return {
      httpStatus: 408,
      error: 'Request timeout',
      errorCode: 'network_timeout',
      actionHint: 'Retry later. This looks temporary.',
      retryable: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'temporarily_unavailable',
      }),
    };
  }

  if (typeof status === 'number' && status >= 500) {
    return {
      httpStatus: status,
      error: `API error: ${status}`,
      errorCode: 'provider_unavailable',
      actionHint: 'Retry later. The provider appears unavailable.',
      retryable: true,
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'temporarily_unavailable',
      }),
    };
  }

  if (typeof status === 'number' && status >= 400) {
    return {
      httpStatus: status,
      error: `API error: ${status}`,
      errorCode: 'quota_request_failed',
      errorDetail: detail,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'unknown',
      }),
    };
  }

  return {
    error: 'Quota request failed',
    errorCode: 'quota_request_failed',
    errorDetail: detail,
    entitlement: buildProviderEntitlementEvidence({
      normalizedTier: 'unknown',
      source: 'runtime_inference',
      confidence: 'low',
      accessState: 'unknown',
      capacityState: 'unknown',
    }),
  };
}

/**
 * Merge entitlement evidence from a successful project lookup with evidence
 * from a failed models fetch. A known tier id from the project lookup always
 * wins (runtime_api source, high confidence); otherwise we fall back to the
 * pre-existing evidence or build a fresh runtime_inference record.
 */
export function mergeAntigravityTierEvidence(
  entitlement: ProviderEntitlementEvidence | undefined,
  tier: AccountTier,
  rawTierId: string | null,
  rawTierLabel: string | null
): ProviderEntitlementEvidence | undefined {
  if (tier === 'unknown' && !entitlement) {
    return undefined;
  }

  return buildProviderEntitlementEvidence({
    normalizedTier: tier,
    rawTierId,
    rawTierLabel,
    source: rawTierId ? 'runtime_api' : (entitlement?.source ?? 'runtime_inference'),
    confidence: rawTierId ? 'high' : (entitlement?.confidence ?? 'medium'),
    accessState: entitlement?.accessState ?? 'unknown',
    capacityState: entitlement?.capacityState ?? 'unknown',
    notes: entitlement?.notes ?? null,
  });
}
