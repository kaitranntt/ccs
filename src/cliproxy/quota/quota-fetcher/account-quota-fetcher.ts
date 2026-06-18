/**
 * fetchAccountQuota: top-level Antigravity account quota orchestrator.
 *
 * Reads the local auth file, calls loadCodeAssist (project + tier), then
 * fetchAvailableModels. Merges the results into a QuotaResult, attaching
 * entitlement evidence and persisting the resolved tier back to the account
 * manager. Preserves the structured createLogger('cliproxy:quota:fetcher')
 * logging from P3 (quota.fetch.start / auth_state / project_resolved / models).
 */

import type { CLIProxyProvider } from '../../types';
import type { AccountTier } from '../../accounts/account-manager';
import { setAccountTier } from '../../accounts/account-manager';
import { buildProviderEntitlementEvidence } from '../../auth/provider-entitlement-evidence';
import { createLogger } from '../../../services/logging';

import { readAuthData } from './auth-file-reader';
import { fetchAvailableModels } from './available-models-fetcher';
import { getProjectId } from './project-lookup';
import { mergeAntigravityTierEvidence } from './status-classifier';
import type { QuotaResult } from './types';

const logger = createLogger('cliproxy:quota:fetcher');

/**
 * Fetch quota for an Antigravity account.
 *
 * @param provider - Provider name (only 'agy' supported)
 * @param accountId - Account identifier (email)
 * @param verbose - Show detailed diagnostics
 * @returns Quota result with models and percentages
 */
export async function fetchAccountQuota(
  provider: CLIProxyProvider,
  accountId: string,
  verbose = false
): Promise<QuotaResult> {
  if (verbose)
    logger.info('quota.fetch.start', 'Fetching quota for account', { provider, accountId });

  // Only Antigravity supports quota fetching
  if (provider !== 'agy') {
    const error = `Quota not supported for provider: ${provider}`;
    if (verbose) logger.warn('quota.fetch.unsupported_provider', error, { provider });
    // Stable machine code so callers branch on a code, not the human string.
    // This is "no quota API for this provider", which is healthy — distinct
    // from a transient fetch failure or an expired token.
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error,
      errorCode: 'quota_not_supported',
    };
  }

  // Read auth data from auth file (checks both active and paused directories)
  const authData = readAuthData(provider, accountId);
  if (!authData) {
    const error = 'Auth file not found for account';
    if (verbose) logger.warn('quota.fetch.auth_missing', error, { provider, accountId });
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error,
      errorCode: 'auth_file_missing',
      actionHint: 'Reconnect this account so CCS can read a current auth token.',
    };
  }

  const accessToken = authData.accessToken;
  if (verbose) {
    const expiryState = authData.isExpired
      ? 'expired'
      : authData.expiresAt
        ? `expires ${authData.expiresAt}`
        : 'expiry unknown';
    logger.info('quota.fetch.auth_state', `Auth token state: ${expiryState}`, {
      provider,
      state: expiryState,
    });
  }

  // Get project ID and tier - prefer stored project ID, but always call API for tier
  let projectId = authData.projectId;
  let apiTier: AccountTier = 'unknown';
  let rawTierId: string | null = null;
  let rawTierLabel: string | null = null;

  // Always call loadCodeAssist to get accurate tier from API.
  // If the file token is stale, the helper retries through CLIProxy management auth.
  const lastProjectResult = await getProjectId(accountId, accessToken);

  if (!lastProjectResult.projectId && !projectId) {
    const error = lastProjectResult.error || 'Failed to retrieve project ID';
    if (verbose)
      logger.warn('quota.fetch.project_lookup_failed', error, {
        provider,
        errorCode: lastProjectResult.errorCode,
        httpStatus: lastProjectResult.httpStatus,
      });
    return {
      success: false,
      models: [],
      lastUpdated: Date.now(),
      error,
      errorCode: lastProjectResult.errorCode,
      errorDetail: lastProjectResult.errorDetail,
      actionHint: lastProjectResult.actionHint,
      retryable: lastProjectResult.retryable,
      httpStatus: lastProjectResult.httpStatus,
      needsReauth: lastProjectResult.needsReauth,
      isUnprovisioned: lastProjectResult.isUnprovisioned,
      entitlement: lastProjectResult.entitlement,
      isExpired: authData.isExpired,
      expiresAt: authData.expiresAt || undefined,
    };
  }

  // Use API project ID if available, else fallback to stored
  projectId = lastProjectResult.projectId || projectId;
  apiTier = lastProjectResult.tier || 'unknown';
  rawTierId = lastProjectResult.rawTierId || null;
  rawTierLabel = lastProjectResult.rawTierLabel || null;

  if (verbose)
    logger.info('quota.fetch.project_resolved', `Project ID: ${projectId || 'not found'}`, {
      provider,
    });

  // Fetch models with quota
  const result = await fetchAvailableModels(accountId, accessToken, projectId as string);

  if (verbose)
    logger.info('quota.fetch.models', `Models found: ${result.models.length}`, {
      provider,
      count: result.models.length,
    });
  result.accountId = accountId;
  result.projectId = projectId || undefined;

  // Determine tier from API response only
  if (result.success) {
    const finalTier = apiTier !== 'unknown' ? apiTier : 'unknown';
    result.tier = finalTier;
    result.entitlement = buildProviderEntitlementEvidence({
      normalizedTier: finalTier,
      rawTierId,
      rawTierLabel,
      source: rawTierId ? 'runtime_api' : 'runtime_inference',
      confidence: rawTierId ? 'high' : 'medium',
      accessState: 'entitled',
      capacityState: 'available',
    });
    if (finalTier !== 'unknown') {
      setAccountTier(provider, accountId, finalTier);
    }
  } else {
    result.isExpired = authData.isExpired;
    result.expiresAt = authData.expiresAt || undefined;
    result.entitlement = mergeAntigravityTierEvidence(
      result.entitlement,
      apiTier,
      rawTierId,
      rawTierLabel
    );
  }

  if (verbose && result.error) {
    console.log(`[!] Error: ${result.error}`);
  }

  return result;
}
