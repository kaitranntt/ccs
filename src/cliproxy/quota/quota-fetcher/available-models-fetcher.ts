/**
 * fetchAvailableModels call for Antigravity quota.
 *
 * Fetches the model -> remaining-fraction map from the Cloud Code internal
 * API and projects it into ModelQuota[] percentages (0-100). The projectId
 * is intentionally NOT sent in the body (CLIProxyAPI sends an empty {} body
 * for this endpoint); it is accepted only for symmetry with the project
 * lookup flow.
 */

import { buildProviderEntitlementEvidence } from '../../auth/provider-entitlement-evidence';
import { ANTIGRAVITY_API_BASE, ANTIGRAVITY_API_VERSION, FETCHMODELS_HEADERS } from './constants';
import { performAntigravityRequest } from './http-client';
import { buildAntigravityFailure } from './status-classifier';
import type { FetchAvailableModelsResponse, ModelQuota, QuotaResult } from './types';

/**
 * Fetch available models with quota info.
 * Note: projectId is kept for potential future use but not sent in body
 * (CLIProxyAPI sends empty {} body for this endpoint).
 */
export async function fetchAvailableModels(
  accountId: string,
  accessToken: string,
  _projectId: string
): Promise<QuotaResult> {
  const url = `${ANTIGRAVITY_API_BASE}/${ANTIGRAVITY_API_VERSION}:fetchAvailableModels`;
  const response = await performAntigravityRequest(
    accountId,
    accessToken,
    url,
    FETCHMODELS_HEADERS,
    JSON.stringify({})
  );

  if (response.status < 200 || response.status >= 300) {
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      ...buildAntigravityFailure(response.status, response.bodyText),
    };
  }

  const data = response.json as FetchAvailableModelsResponse | null;
  if (!data) {
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error: 'Invalid quota response from provider',
      errorCode: 'provider_unavailable',
      retryable: true,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'temporarily_unavailable',
        notes: 'Provider returned a 2xx response with an empty or invalid quota payload.',
      }),
    };
  }

  const models: ModelQuota[] = [];

  if (data.models && typeof data.models === 'object') {
    for (const [modelId, modelData] of Object.entries(data.models)) {
      const quotaInfo = modelData.quotaInfo || modelData.quota_info;
      if (!quotaInfo) continue;

      const remaining =
        quotaInfo.remainingFraction ?? quotaInfo.remaining_fraction ?? quotaInfo.remaining;
      const resetTime = quotaInfo.resetTime || quotaInfo.reset_time || null;

      let percentage: number;
      if (typeof remaining === 'number' && isFinite(remaining)) {
        percentage = Math.max(0, Math.min(100, Math.round(remaining * 100)));
      } else if (resetTime) {
        percentage = 0;
      } else {
        continue;
      }

      models.push({
        name: modelId,
        displayName: modelData.displayName,
        percentage,
        resetTime,
      });
    }
  }

  return {
    success: true,
    models,
    lastUpdated: Date.now(),
  };
}
