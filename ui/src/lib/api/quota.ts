import type { ProviderEntitlementEvidence } from '../../../../src/cliproxy/auth/provider-entitlement-types';
import { request } from './core';

/** Individual model quota info from Google Cloud Code API */
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
  /** True if token is expired and needs re-authentication */
  needsReauth?: boolean;
  /** Richer provider entitlement evidence derived from live/runtime signals */
  entitlement?: ProviderEntitlementEvidence;
}

/** Codex rate limit window */
export interface CodexQuotaWindow {
  /**
   * Window label, e.g.: "Primary", "Secondary",
   * "Code Review (Primary)", "Code Review (Secondary)",
   * or "GPT-5.3-Codex-Spark (Primary)" for additional rate limits.
   */
  label: string;
  /** Percentage used (0-100) */
  usedPercent: number;
  /** Percentage remaining (100 - usedPercent) */
  remainingPercent: number;
  /** Seconds until quota resets, null if unknown */
  resetAfterSeconds: number | null;
  /** ISO timestamp when quota resets, null if unknown */
  resetAt: string | null;
  /**
   * Window category indicating the bucket this window belongs to.
   * Optional for back-compat with cached data emitted before this field existed.
   * - 'usage'        -> standard rate_limit usage windows
   * - 'code-review'  -> code_review_rate_limit windows
   * - 'additional'   -> additional_rate_limits[] windows (e.g. GPT-5.3 Codex Spark)
   */
  category?: 'usage' | 'code-review' | 'additional';
  /** Cadence of the window: '5h' = primary, 'weekly' = secondary. Optional for legacy data. */
  cadence?: '5h' | 'weekly';
  /** Raw upstream feature label (e.g. 'GPT-5.3-Codex-Spark', 'Code Review'); absent for plain usage windows. */
  featureLabel?: string;
}

/** Core Codex usage window (5h/weekly) extracted from raw windows */
export interface CodexCoreUsageWindow {
  /** Source window label */
  label: string;
  /** Percentage remaining (0-100) */
  remainingPercent: number;
  /** Seconds until quota resets, null if unknown */
  resetAfterSeconds: number | null;
  /** ISO timestamp when quota resets, null if unknown */
  resetAt: string | null;
}

/** Core Codex usage summary with explicit 5h and weekly windows */
export interface CodexCoreUsageSummary {
  /** Short-cycle usage limit window (typically 5h) */
  fiveHour: CodexCoreUsageWindow | null;
  /** Long-cycle usage limit window (typically weekly) */
  weekly: CodexCoreUsageWindow | null;
}

/** Codex quota result */
export interface CodexQuotaResult {
  /** Whether fetch succeeded */
  success: boolean;
  /** Quota windows (primary, secondary, code review) */
  windows: CodexQuotaWindow[];
  /** Explicit core usage windows (5h + weekly) for easier reset display */
  coreUsage?: CodexCoreUsageSummary;
  /** Plan type: free, plus, pro, team, or null if unknown */
  planType: 'free' | 'plus' | 'pro' | 'team' | null;
  /** Timestamp of fetch */
  lastUpdated: number;
  /** Upstream HTTP status when available */
  httpStatus?: number;
  /** Stable machine-readable error code */
  errorCode?: string;
  /** Additional provider-specific detail/code from upstream */
  errorDetail?: string;
  /** Error message if fetch failed */
  error?: string;
  /** Account ID (email) this quota belongs to */
  accountId?: string;
  /** Provider-specific remediation guidance */
  actionHint?: string;
  /** True if token is expired and needs re-authentication */
  needsReauth?: boolean;
  /** True when the failure is temporary and retrying later may help */
  retryable?: boolean;
  /** True if result was served from cache */
  cached?: boolean;
  /** True if account lacks quota access (403) - displayed as 0% instead of error */
  isForbidden?: boolean;
}

/** Claude policy limit window */
export interface ClaudeQuotaWindow {
  /** Account-wide, model-specific, or unclassified limit. Optional for older clients. */
  scope?: 'account' | 'model' | 'unknown';
  cadence?: '5h' | 'weekly';
  modelLabel?: string;
  /** Source identifier: five_hour, seven_day, seven_day_opus, seven_day_sonnet, overage, ... */
  rateLimitType: string;
  /** Human-friendly label for UI display */
  label: string;
  /** Upstream status: allowed, allowed_warning, rejected */
  status: string;
  /** Utilization ratio (0-1) when available */
  utilization: number | null;
  /** Utilization as percentage (0-100) */
  usedPercent: number;
  /** Remaining percentage (100 - usedPercent) */
  remainingPercent: number;
  /** Reset timestamp for this window, null if unknown */
  resetAt: string | null;
  surpassedThreshold?: boolean;
  severity?: string;
  overageStatus?: string;
  overageResetsAt?: string | null;
  overageDisabledReason?: string | null;
  isUsingOverage?: boolean;
  hasExtraUsageEnabled?: boolean;
}

/** Core Claude usage window (5h/weekly) */
export interface ClaudeCoreUsageWindow {
  rateLimitType: string;
  label: string;
  remainingPercent: number;
  resetAt: string | null;
  status: string;
}

/** Core Claude usage summary (5h + weekly) */
export interface ClaudeCoreUsageSummary {
  fiveHour: ClaudeCoreUsageWindow | null;
  weekly: ClaudeCoreUsageWindow | null;
}

/** Claude quota result */
export interface ClaudeQuotaResult {
  success: boolean;
  windows: ClaudeQuotaWindow[];
  coreUsage?: ClaudeCoreUsageSummary;
  lastUpdated: number;
  httpStatus?: number;
  errorCode?: string;
  errorDetail?: string;
  isForbidden?: boolean;
  error?: string;
  accountId?: string;
  actionHint?: string;
  needsReauth?: boolean;
  retryable?: boolean;
  /** True if result was served from cache */
  cached?: boolean;
  /** True when the live usage probe failed and this is the last good result (as of lastUpdated) */
  stale?: boolean;
}

/** Gemini CLI bucket (grouped by model series) */
export interface GeminiCliBucket {
  /** Unique bucket identifier (e.g., "gemini-flash-series::input") */
  id: string;
  /** Display label (e.g., "Gemini Flash Series") */
  label: string;
  /** Token type: "input", "output", or null if combined */
  tokenType: string | null;
  /** Remaining quota as fraction (0-1) */
  remainingFraction: number;
  /** Remaining quota as percentage (0-100) */
  remainingPercent: number;
  /** Remaining quota count when the upstream API provides it */
  remainingAmount?: number | null;
  /** ISO timestamp when quota resets, null if unknown */
  resetTime: string | null;
  /** Model IDs in this bucket */
  modelIds: string[];
}

/** Gemini CLI quota result */
export interface GeminiCliQuotaResult {
  /** Whether fetch succeeded */
  success: boolean;
  /** Quota buckets grouped by model series */
  buckets: GeminiCliBucket[];
  /** GCP project ID for this account */
  projectId: string | null;
  /** Human-readable Gemini tier label when available */
  tierLabel?: string | null;
  /** Stable Gemini tier identifier when available */
  tierId?: string | null;
  /** Available Google One AI credits when reported by the API */
  creditBalance?: number | null;
  /** Richer provider entitlement evidence derived from live/runtime signals */
  entitlement?: ProviderEntitlementEvidence;
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
  /** Account ID (email) this quota belongs to */
  accountId?: string;
  /** Provider-specific remediation guidance */
  actionHint?: string;
  /** True if token is expired and needs re-authentication */
  needsReauth?: boolean;
  /** True when the failure is temporary and retrying later may help */
  retryable?: boolean;
  /** True if result was served from cache */
  cached?: boolean;
}

/** GitHub Copilot quota snapshot */
export interface GhcpQuotaSnapshot {
  /** False when upstream omitted this quota category */
  reported?: boolean;
  /** Total quota allocation for this category */
  entitlement: number;
  /** Remaining quota count */
  remaining: number;
  /** Used quota count */
  used: number;
  /** Remaining quota percentage (0-100) */
  percentRemaining: number;
  /** Used quota percentage (0-100) */
  percentUsed: number;
  /** Whether this quota category is unlimited */
  unlimited: boolean;
  /** Overage usage count */
  overageCount: number;
  /** Whether overage is permitted */
  overagePermitted: boolean;
  /** Upstream quota identifier if available */
  quotaId: string | null;
}

/** GitHub Copilot (ghcp) quota result */
export interface GhcpQuotaResult {
  /** Whether fetch succeeded */
  success: boolean;
  /** Copilot plan type */
  planType: string | null;
  /** Quota reset date/time */
  quotaResetDate: string | null;
  snapshots: {
    premiumInteractions: GhcpQuotaSnapshot;
    chat: GhcpQuotaSnapshot;
    completions: GhcpQuotaSnapshot;
  };
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
  /** Account ID this quota belongs to */
  accountId?: string;
  /** Provider-specific remediation guidance */
  actionHint?: string;
  /** True if token is expired and needs re-authentication */
  needsReauth?: boolean;
  /** True when the failure is temporary and retrying later may help */
  retryable?: boolean;
  /** True if result was served from cache */
  cached?: boolean;
}

/** Account quota API */
export const quotaApi = {
  /** Fetch quota for a specific account */
  get: (provider: string, accountId: string) =>
    request<QuotaResult>(`/cliproxy/quota/${provider}/${encodeURIComponent(accountId)}`),
  /** Fetch Codex quota for a specific account */
  getCodex: (accountId: string) =>
    request<CodexQuotaResult>(`/cliproxy/quota/codex/${encodeURIComponent(accountId)}`),
  /** Fetch Claude quota for a specific account */
  getClaude: (accountId: string) =>
    request<ClaudeQuotaResult>(`/cliproxy/quota/claude/${encodeURIComponent(accountId)}`),
  /** Fetch Gemini CLI quota for a specific account */
  getGemini: (accountId: string) =>
    request<GeminiCliQuotaResult>(`/cliproxy/quota/gemini/${encodeURIComponent(accountId)}`),
};
