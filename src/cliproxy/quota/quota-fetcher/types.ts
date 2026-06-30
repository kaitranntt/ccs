/**
 * Shared types for the Antigravity quota fetcher.
 *
 * Public types (ModelQuota, QuotaResult, AllAccountsQuotaResult) are re-exported
 * from the barrel at ../quota-fetcher.ts so existing import paths keep working.
 */

import type { CLIProxyProvider } from '../../types';
import type { AccountInfo, AccountTier } from '../../accounts/account-manager';
import type { ProviderEntitlementEvidence } from '../../auth/provider-entitlement-types';

/** Individual model quota info */
export interface ModelQuota {
  /** Model name, e.g., "gemini-3-pro-high" */
  name: string;
  /** Display name from API, e.g., "Gemini 3 Pro" */
  displayName?: string;
  /** Remaining quota as percentage (0-100) */
  percentage: number;
  /** ISO timestamp when quota resets, null if unknown */
  resetTime: string | null;
}

/** Quota fetch result */
export interface QuotaResult {
  /** Whether fetch succeeded */
  success: boolean;
  /** Quota for each available model */
  models: ModelQuota[];
  /** Timestamp of fetch */
  lastUpdated: number;
  /** Upstream HTTP status when available */
  httpStatus?: number;
  /** Stable machine-readable error code */
  errorCode?: string;
  /** Additional provider-specific detail/code from upstream */
  errorDetail?: string;
  /** True if account lacks quota access (403) */
  isForbidden?: boolean;
  /** Error message if fetch failed */
  error?: string;
  /** Provider-specific remediation guidance */
  actionHint?: string;
  /** True when the failure is temporary and retrying later may help */
  retryable?: boolean;
  /** True if token is expired and needs re-auth */
  isExpired?: boolean;
  /** True if token refresh cannot proceed and the account should be re-authenticated */
  needsReauth?: boolean;
  /** ISO timestamp when token expires/expired */
  expiresAt?: string;
  /** True if account hasn't been activated in official Antigravity app */
  isUnprovisioned?: boolean;
  /** Account ID (email) this quota belongs to */
  accountId?: string;
  /** GCP project ID for this account */
  projectId?: string;
  /** Detected account tier based on model access */
  tier?: AccountTier;
  /** Richer provider entitlement evidence derived from live/runtime signals */
  entitlement?: ProviderEntitlementEvidence;
}

/** Result for all accounts of a provider */
export interface AllAccountsQuotaResult {
  /** Provider name */
  provider: CLIProxyProvider;
  /** Results per account */
  accounts: Array<{
    account: AccountInfo;
    quota: QuotaResult;
  }>;
  /** Accounts grouped by project ID (for detecting shared projects) */
  projectGroups: Record<string, string[]>;
  /** Timestamp of fetch */
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// Internal types (not part of the public surface)
// ---------------------------------------------------------------------------

/** Auth file structure on disk for Antigravity accounts */
export interface AntigravityAuthFile {
  access_token: string;
  refresh_token?: string;
  email?: string;
  expired?: string;
  expires_in?: number;
  timestamp?: number;
  type?: string;
  project_id?: string;
}

/** Auth data returned from file */
export interface AuthData {
  accessToken: string;
  refreshToken: string | null;
  projectId: string | null;
  isExpired: boolean;
  expiresAt: string | null;
}

/** Tier info from loadCodeAssist */
export interface TierInfo {
  id?: string;
  isDefault?: boolean;
}

/** loadCodeAssist response */
export interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id?: string };
  /** Current tier (may be trial/temporary) */
  currentTier?: TierInfo;
  /** Paid tier (reflects actual subscription - takes priority) */
  paidTier?: TierInfo;
  /** Array of allowed tiers - use isDefault=true to find active tier (CLIProxyAPIPlus approach) */
  allowedTiers?: TierInfo[];
}

/** fetchAvailableModels response model */
export interface AvailableModel {
  name?: string;
  displayName?: string;
  quotaInfo?: {
    remainingFraction?: number;
    remaining_fraction?: number;
    remaining?: number;
    resetTime?: string;
    reset_time?: string;
  };
  quota_info?: {
    remainingFraction?: number;
    remaining_fraction?: number;
    remaining?: number;
    resetTime?: string;
    reset_time?: string;
  };
}

/** fetchAvailableModels response */
export interface FetchAvailableModelsResponse {
  models?: Record<string, AvailableModel>;
}

export interface ManagementAuthFile {
  auth_index?: string | number;
  provider?: string;
  type?: string;
  email?: string;
  name?: string;
}

export interface ManagementApiCallResponse {
  status_code?: number;
  body?: string;
}

export interface ManagedResponse {
  status: number;
  bodyText: string;
  json: unknown;
  viaManagement: boolean;
}

export interface ProjectLookupResult {
  projectId: string | null;
  tier?: AccountTier;
  rawTierId?: string | null;
  rawTierLabel?: string | null;
  entitlement?: ProviderEntitlementEvidence;
  error?: string;
  errorCode?: string;
  errorDetail?: string;
  actionHint?: string;
  retryable?: boolean;
  httpStatus?: number;
  needsReauth?: boolean;
  isUnprovisioned?: boolean;
}
