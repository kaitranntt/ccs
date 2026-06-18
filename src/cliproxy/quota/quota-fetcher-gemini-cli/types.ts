/**
 * Shared types for the Gemini CLI quota fetcher submodule.
 *
 * Extracted from the original quota-fetcher-gemini-cli.ts god file. These
 * interfaces describe raw API response shapes, internal parsed structures,
 * and managed-auth context used across the submodules.
 */

import type { GeminiCliBucket, GeminiCliQuotaResult } from '../quota-types';
import type { ProviderEntitlementEvidence } from '../../auth/provider-entitlement-types';

/** Auth data extracted from a Gemini CLI auth file. */
export interface GeminiCliAuthData {
  accessToken: string;
  projectId: string | null;
  isExpired: boolean;
  expiresAt: string | number | null;
}

/** Raw bucket shape returned by the Gemini CLI quota API. */
export interface RawGeminiCliBucket {
  model_id?: string;
  modelId?: string;
  token_type?: string | null;
  tokenType?: string | null;
  remaining_fraction?: number;
  remainingFraction?: number;
  remaining_amount?: number;
  remainingAmount?: number;
  reset_time?: string | null;
  resetTime?: string | null;
}

/** Raw quota API response wrapper. */
export interface GeminiCliQuotaResponse {
  buckets?: RawGeminiCliBucket[];
}

/** Credit entry inside a tier (supports snake_case and camelCase variants). */
export interface GeminiCliCredits {
  creditType?: string;
  credit_type?: string;
  creditAmount?: string | number;
  credit_amount?: string | number;
}

/** User tier inside a loadCodeAssist response. */
export interface GeminiCliUserTier {
  id?: string;
  availableCredits?: GeminiCliCredits[];
  available_credits?: GeminiCliCredits[];
}

/** loadCodeAssist response shape (currentTier + paidTier). */
export interface GeminiCliCodeAssistResponse {
  currentTier?: GeminiCliUserTier | null;
  current_tier?: GeminiCliUserTier | null;
  paidTier?: GeminiCliUserTier | null;
  paid_tier?: GeminiCliUserTier | null;
}

/** Parsed error body extracted from an upstream non-200 response. */
export interface ParsedGeminiCliErrorBody {
  errorCode?: string;
  errorDetail?: string;
  message?: string;
}

/** Supplementary tier/credit info resolved alongside the quota buckets. */
export interface GeminiCliSupplementaryInfo {
  tierLabel: string | null;
  tierId: string | null;
  creditBalance: number | null;
  normalizedTier: 'free' | 'pro' | 'ultra' | 'unknown';
}

/** Auth-file entry as returned by the CLIProxy management API. */
export interface ManagementAuthFile {
  auth_index?: string | number;
  provider?: string;
  type?: string;
  email?: string;
  name?: string;
}

/** api-call response envelope from the CLIProxy management endpoint. */
export interface ManagementApiCallResponse {
  status_code?: number;
  body?: string;
}

/** Normalized HTTP response used by both direct and managed code paths. */
export interface ManagedResponse {
  status: number;
  bodyText: string;
  json: unknown;
  viaManagement: boolean;
}

/** Per-account managed-auth context used to dedupe auth-index lookups. */
export interface ManagedGeminiAuthContext {
  authIndexLookupPromise?: Promise<ManagedGeminiAuthLookupResult>;
}

/** Result of looking up a Gemini auth file index via management API. */
export interface ManagedGeminiAuthLookupResult {
  authIndex: string | number | null;
  unavailable: boolean;
}

/** Result of performing a managed Gemini upstream request. */
export interface ManagedGeminiRequestResult {
  response: ManagedResponse | null;
  unavailable: boolean;
}

/** Options bag for {@link buildGeminiCliFailureResult}. */
export interface GeminiCliFailureResultOptions {
  error: string;
  httpStatus?: number;
  errorCode?: string;
  errorDetail?: string;
  actionHint?: string;
  retryable?: boolean;
  needsReauth?: boolean;
  isForbidden?: boolean;
  entitlement?: ProviderEntitlementEvidence;
}

// Re-export the public result shapes so callers can import everything from
// the barrel without reaching into quota-types directly.
export type { GeminiCliBucket, GeminiCliQuotaResult, ProviderEntitlementEvidence };
