/**
 * Antigravity loadCodeAssist project + tier lookup.
 *
 * Calls loadCodeAssist against the daily then prod Cloud Code hosts to resolve
 * the GCP project id and the account tier (paidTier.id takes priority over
 * currentTier.id). Returns a structured ProjectLookupResult that the top-level
 * fetchAccountQuota merges into a QuotaResult.
 */

import {
  buildProviderEntitlementEvidence,
  getProviderTierLabel,
  normalizeProviderTierId,
} from '../../auth/provider-entitlement-evidence';
import {
  ANTIGRAVITY_API_VERSION,
  ANTIGRAVITY_LOADCODEASSIST_BASE_URLS,
  LOADCODEASSIST_HEADERS,
} from './constants';
import { performAntigravityRequestWithBaseUrlFallback } from './http-client';
import { buildAntigravityFailure } from './status-classifier';
import type { LoadCodeAssistResponse, ProjectLookupResult } from './types';

/**
 * Get project ID and tier via loadCodeAssist endpoint.
 * Uses paidTier.id for accurate tier detection (g1-ultra-tier, g1-pro-tier).
 * Falls back across the daily then prod Cloud Code hosts.
 */
export async function getProjectId(
  accountId: string,
  accessToken: string
): Promise<ProjectLookupResult> {
  const body = JSON.stringify({
    metadata: {
      ide_name: 'antigravity',
      ide_type: 'ANTIGRAVITY',
      ide_version: '1.21.9',
    },
  });
  const response = await performAntigravityRequestWithBaseUrlFallback(
    accountId,
    accessToken,
    ANTIGRAVITY_LOADCODEASSIST_BASE_URLS,
    `${ANTIGRAVITY_API_VERSION}:loadCodeAssist`,
    LOADCODEASSIST_HEADERS,
    body
  );

  if (response.status < 200 || response.status >= 300) {
    return {
      projectId: null,
      ...buildAntigravityFailure(response.status, response.bodyText),
    };
  }

  const data = response.json as LoadCodeAssistResponse | null;
  if (!data) {
    return {
      projectId: null,
      error: 'Invalid quota response from provider',
      errorCode: 'provider_unavailable',
      retryable: true,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'temporarily_unavailable',
        notes: 'Provider returned a 2xx response with an empty or invalid project payload.',
      }),
    };
  }

  // Extract project ID from response
  let projectId: string | undefined;
  if (typeof data.cloudaicompanionProject === 'string') {
    projectId = data.cloudaicompanionProject;
  } else if (typeof data.cloudaicompanionProject === 'object') {
    projectId = data.cloudaicompanionProject?.id;
  }

  if (!projectId?.trim()) {
    return {
      projectId: null,
      error: 'Sign in to Antigravity app to activate quota.',
      errorCode: 'account_unprovisioned',
      actionHint: 'Complete sign-in in the Antigravity app, then retry quota refresh.',
      isUnprovisioned: true,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'medium',
        accessState: 'unknown',
        capacityState: 'unknown',
        notes: 'Project provisioning is incomplete for this account.',
      }),
    };
  }

  // Extract tier - paidTier reflects actual subscription status, takes priority
  const rawTierId = (data.paidTier?.id || data.currentTier?.id || '').trim() || null;
  const tier = normalizeProviderTierId(rawTierId);

  return {
    projectId: projectId.trim(),
    tier,
    rawTierId,
    rawTierLabel: getProviderTierLabel(rawTierId),
  };
}
