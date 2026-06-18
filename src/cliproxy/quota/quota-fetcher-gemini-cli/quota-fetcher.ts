/**
 * Top-level quota fetch orchestration for Gemini CLI accounts.
 *
 * Coordinates auth-file discovery, the managed/direct upstream quota request,
 * supplementary tier/credit metadata, and structured failure-result building.
 * Preserves the structured logging from the original god file (events:
 * gemini_cli.fetch_start, gemini_cli.auth_file_missing, gemini_cli.token_expired,
 * gemini_cli.missing_project_id, gemini_cli.api_status, gemini_cli.buckets_found,
 * gemini_cli.quota_fetch_error). Token values are never logged.
 */

import { getProviderAccounts, setAccountTier } from '../../accounts/account-manager';
import { getTokenExpiryTimestamp } from '../../auth/auth-utils';
import { buildProviderEntitlementEvidence } from '../../auth/provider-entitlement-evidence';
import type { GeminiCliQuotaResult } from '../quota-types';
import { readGeminiCliAuthData } from './auth-file-discovery';
import { buildGeminiCliBuckets } from './bucket-building';
import { buildGeminiCliFailureResult, buildGeminiCliHttpFailureResult } from './error-parsing';
import { GeminiManagedAuthUnavailableError, performGeminiCliRequest } from './managed-request';
import { fetchGeminiCliSupplementary } from './supplementary-metadata';
import { logger } from './shared-utils';
import { GEMINI_CLI_QUOTA_URL } from './constants';
import type { GeminiCliAuthData, GeminiCliQuotaResponse, ManagedGeminiAuthContext } from './types';

/**
 * Internal helper: fetch quota with already-validated auth data.
 *
 * Extracted to support the auto-refresh retry path: the caller resolves auth
 * data once (legacy file or managed), then this function performs the upstream
 * quota request and supplementary metadata fetch in parallel. On success it
 * persists the resolved tier back to the account via `setAccountTier`.
 */
export async function fetchWithAuthData(
  authData: GeminiCliAuthData,
  accountId: string,
  verbose: boolean
): Promise<GeminiCliQuotaResult> {
  if (!authData.projectId) {
    const error = 'Cannot resolve project ID from auth file';
    if (verbose) {
      logger.error('gemini_cli.missing_project_id', `Error: ${error}`, {
        provider: 'gemini',
        accountId,
      });
    }
    return buildGeminiCliFailureResult(accountId, null, {
      error,
      errorCode: 'missing_project_id',
      actionHint: 'Run ccs gemini --auth to reconnect this account and recover the project ID.',
      retryable: false,
    });
  }

  const authContext: ManagedGeminiAuthContext = {};
  const supplementaryPromise = fetchGeminiCliSupplementary(
    accountId,
    authData.accessToken,
    authData.projectId,
    verbose,
    authContext
  );
  const requestBody = JSON.stringify({ project: authData.projectId });

  try {
    const response = await performGeminiCliRequest(
      accountId,
      authData.accessToken,
      GEMINI_CLI_QUOTA_URL,
      requestBody,
      authData.isExpired,
      authContext
    );

    if (verbose) {
      const source = response.viaManagement ? 'managed' : 'direct';
      logger.info(
        'gemini_cli.api_status',
        `Gemini CLI API status via ${source}: ${response.status}`,
        { provider: 'gemini', accountId, httpStatus: response.status, source }
      );
    }

    if (response.status !== 200) {
      return buildGeminiCliHttpFailureResult(
        accountId,
        authData.projectId,
        response.status,
        response.bodyText
      );
    }

    const data = response.json as GeminiCliQuotaResponse | null;
    const rawBuckets = data?.buckets || [];
    const buckets = buildGeminiCliBuckets(rawBuckets);
    const supplementary = await supplementaryPromise;

    if (verbose) {
      logger.info('gemini_cli.buckets_found', `Gemini CLI buckets found: ${buckets.length}`, {
        provider: 'gemini',
        accountId,
        bucketCount: buckets.length,
      });
    }

    if (supplementary.normalizedTier !== 'unknown') {
      setAccountTier('gemini', accountId, supplementary.normalizedTier);
    }

    return {
      success: true,
      buckets,
      projectId: authData.projectId,
      tierLabel: supplementary.tierLabel,
      tierId: supplementary.tierId,
      creditBalance: supplementary.creditBalance,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: supplementary.normalizedTier,
        rawTierId: supplementary.tierId,
        rawTierLabel: supplementary.tierLabel,
        source: supplementary.tierId ? 'runtime_api' : 'runtime_inference',
        confidence: supplementary.tierId ? 'high' : 'medium',
        accessState: 'entitled',
        capacityState: 'available',
      }),
      lastUpdated: Date.now(),
      accountId,
    };
  } catch (err) {
    if (err instanceof GeminiManagedAuthUnavailableError) {
      return buildGeminiCliFailureResult(accountId, authData.projectId, {
        error: 'Gemini delegated auth refresh is temporarily unavailable',
        errorCode: 'managed_auth_unavailable',
        errorDetail: err.message,
        actionHint: 'Retry later. CLIProxy management could not refresh this Gemini account.',
        retryable: true,
      });
    }

    const errorMsg =
      err instanceof Error && err.name === 'AbortError'
        ? 'Request timeout'
        : err instanceof Error
          ? err.message
          : 'Unknown error';

    if (verbose) {
      logger.error('gemini_cli.quota_fetch_error', `Gemini CLI quota error: ${errorMsg}`, {
        provider: 'gemini',
        accountId,
        err: err instanceof Error ? { name: err.name, message: errorMsg } : { message: errorMsg },
      });
    }

    return buildGeminiCliFailureResult(accountId, authData.projectId, {
      error: errorMsg,
      errorCode:
        err instanceof Error && err.name === 'AbortError' ? 'network_timeout' : 'network_error',
      actionHint: 'Retry later. This looks temporary.',
      retryable: true,
      httpStatus: err instanceof Error && err.name === 'AbortError' ? 408 : undefined,
    });
  }
}

/**
 * Fetch quota for a single Gemini CLI account.
 *
 * Reads the on-disk auth file, emits the structured `gemini_cli.fetch_start`
 * and `gemini_cli.auth_file_missing` / `gemini_cli.token_expired` log events
 * (gated on `verbose`), and delegates to {@link fetchWithAuthData}. Token
 * values are never logged; only the expiry label is surfaced.
 *
 * @param accountId - Account identifier (email)
 * @param verbose   - Show detailed diagnostics
 * @returns Quota result with buckets, percentages, tier, and entitlement evidence
 */
export async function fetchGeminiCliQuota(
  accountId: string,
  verbose = false
): Promise<GeminiCliQuotaResult> {
  if (verbose) {
    logger.info('gemini_cli.fetch_start', `Fetching Gemini CLI quota for ${accountId}...`, {
      provider: 'gemini',
      accountId,
    });
  }

  const authData = readGeminiCliAuthData(accountId);
  if (!authData) {
    const error = 'Auth file not found for Gemini account';
    if (verbose) {
      logger.error('gemini_cli.auth_file_missing', `Error: ${error}`, {
        provider: 'gemini',
        accountId,
      });
    }
    return buildGeminiCliFailureResult(accountId, null, {
      error,
      errorCode: 'auth_file_missing',
      actionHint: 'Run ccs gemini --auth to reconnect this account.',
      retryable: false,
    });
  }

  if (authData.isExpired && verbose) {
    const expiresAt = getTokenExpiryTimestamp(authData.expiresAt);
    const expiryLabel = expiresAt ? new Date(expiresAt).toISOString() : 'unknown';
    logger.info(
      'gemini_cli.token_expired',
      `Gemini access token is expired (${expiryLabel}); quota requests will defer to managed auth when available.`,
      { provider: 'gemini', accountId, tokenExpired: true, expiresAt: expiryLabel }
    );
  }

  return await fetchWithAuthData(authData, accountId, verbose);
}

/**
 * Fetch quota for all configured Gemini CLI accounts in parallel.
 *
 * @param verbose - Show detailed diagnostics (forwarded to each per-account fetch)
 * @returns Array of `{ account, quota }` entries, one per active Gemini account.
 *          Returns an empty array when there are no Gemini accounts configured.
 */
export async function fetchAllGeminiCliQuotas(
  verbose = false
): Promise<{ account: string; quota: GeminiCliQuotaResult }[]> {
  const accounts = getProviderAccounts('gemini');

  if (accounts.length === 0) {
    return [];
  }

  const results = await Promise.all(
    accounts.map(async (account) => ({
      account: account.id,
      quota: await fetchGeminiCliQuota(account.id, verbose),
    }))
  );

  return results;
}
