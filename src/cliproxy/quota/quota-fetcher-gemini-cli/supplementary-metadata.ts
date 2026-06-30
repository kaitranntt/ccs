/**
 * Supplementary tier/credit metadata fetcher for the Gemini CLI quota fetcher.
 *
 * Wraps the `loadCodeAssist` endpoint to resolve the account's tier label,
 * tier id, normalized tier (free/pro/ultra/unknown), and Google One AI credit
 * balance. Runs alongside the primary quota fetch and shares the same
 * managed-auth context so auth-index lookups are deduped.
 */

import {
  getProviderTierLabel,
  normalizeProviderTierId,
} from '../../auth/provider-entitlement-evidence';
import { performGeminiCliRequest } from './managed-request';
import { logger, normalizeNumberValue, normalizeStringValue } from './shared-utils';
import { GEMINI_CLI_CODE_ASSIST_URL, GEMINI_CLI_G1_CREDIT_TYPE } from './constants';
import type {
  GeminiCliCodeAssistResponse,
  GeminiCliSupplementaryInfo,
  ManagedGeminiAuthContext,
} from './types';

/**
 * Resolve the tier id from a loadCodeAssist response.
 * Prefers the paid tier id, then the current tier id. Lowercased.
 * Returns null if neither is present.
 */
export function resolveGeminiCliTierId(payload: GeminiCliCodeAssistResponse | null): string | null {
  if (!payload) return null;
  const currentTier = payload.currentTier ?? payload.current_tier;
  const paidTier = payload.paidTier ?? payload.paid_tier;
  const rawId = normalizeStringValue(paidTier?.id) ?? normalizeStringValue(currentTier?.id);
  return rawId ? rawId.toLowerCase() : null;
}

/**
 * Resolve a human-readable tier label from the loadCodeAssist tier id.
 * Returns null when the tier id cannot be mapped to a known label.
 */
export function resolveGeminiCliTierLabel(
  payload: GeminiCliCodeAssistResponse | null
): string | null {
  const tierId = resolveGeminiCliTierId(payload);
  return getProviderTierLabel(tierId);
}

/**
 * Resolve the Google One AI credit balance for the account from the
 * loadCodeAssist response. Sums all credits with type `GOOGLE_ONE_AI` on the
 * paid tier (preferred) or current tier. Returns null if no matching credits
 * are present.
 */
export function resolveGeminiCliCreditBalance(
  payload: GeminiCliCodeAssistResponse | null
): number | null {
  if (!payload) return null;

  const paidTier = payload.paidTier ?? payload.paid_tier;
  const currentTier = payload.currentTier ?? payload.current_tier;
  const tier = paidTier ?? currentTier;
  if (!tier) return null;

  const credits = tier.availableCredits ?? tier.available_credits ?? [];
  let total = 0;
  let found = false;
  for (const credit of credits) {
    const creditType = normalizeStringValue(credit.creditType ?? credit.credit_type);
    if (creditType !== GEMINI_CLI_G1_CREDIT_TYPE) continue;

    const amount = normalizeNumberValue(credit.creditAmount ?? credit.credit_amount);
    if (amount !== null) {
      total += amount;
      found = true;
    }
  }

  return found ? total : null;
}

/**
 * Fetch supplementary tier/credit metadata for a Gemini account via the
 * loadCodeAssist endpoint. Never throws: on any failure returns a
 * supplementary info with `normalizedTier: 'unknown'` so the primary quota
 * fetch can still complete. Diagnostic logging is gated on `verbose` and
 * records only accountId, HTTP status, and the source (managed/direct);
 * token values are never logged.
 */
export async function fetchGeminiCliSupplementary(
  accountId: string,
  accessToken: string,
  projectId: string,
  verbose: boolean,
  authContext?: ManagedGeminiAuthContext
): Promise<GeminiCliSupplementaryInfo> {
  const requestBody = JSON.stringify({
    cloudaicompanionProject: projectId,
    metadata: {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
      duetProject: projectId,
    },
  });

  try {
    const response = await performGeminiCliRequest(
      accountId,
      accessToken,
      GEMINI_CLI_CODE_ASSIST_URL,
      requestBody,
      false,
      authContext
    );

    if (response.status !== 200) {
      if (verbose) {
        const source = response.viaManagement ? 'managed' : 'direct';
        logger.info(
          'gemini_cli.supplementary_metadata_unavailable',
          `Gemini CLI supplementary metadata unavailable via ${source}: HTTP ${response.status}`,
          { provider: 'gemini', accountId, httpStatus: response.status, source }
        );
      }
      return { tierLabel: null, tierId: null, creditBalance: null, normalizedTier: 'unknown' };
    }

    const payload = response.json as GeminiCliCodeAssistResponse | null;
    return {
      tierLabel: resolveGeminiCliTierLabel(payload),
      tierId: resolveGeminiCliTierId(payload),
      creditBalance: resolveGeminiCliCreditBalance(payload),
      normalizedTier: normalizeProviderTierId(resolveGeminiCliTierId(payload)),
    };
  } catch (error) {
    if (verbose) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.info(
        'gemini_cli.supplementary_metadata_skipped',
        `Gemini CLI supplementary metadata skipped: ${message}`,
        {
          provider: 'gemini',
          accountId,
          err: error instanceof Error ? { name: error.name, message } : { message },
        }
      );
    }
    return { tierLabel: null, tierId: null, creditBalance: null, normalizedTier: 'unknown' };
  }
}
