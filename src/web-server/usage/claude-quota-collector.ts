/**
 * Claude native quota collector (multi-profile and legacy single-profile paths).
 */

import {
  buildClaudeCoreUsageSummary,
  getClaudeWindowMetadata,
} from '../../cliproxy/quota/quota-fetcher-claude-normalizer';
import { fetchClaudeQuotaWithToken } from '../../cliproxy/quota/quota-fetcher-claude';
import type { ClaudeQuotaResult } from '../../cliproxy/quota/quota-types';
import type { BarSummaryRow, QuotaWindowDetail } from '../routes/bar-routes';
import {
  getAccessToken,
  getSubscriptionTier,
  hasSupportedSubscription,
  readClaudeCredentials,
} from './claude-native-credentials';
import {
  CLAUDE_NATIVE_PROVIDER,
  CLAUDE_PROVIDER,
  FIVE_HOUR_MINUTES,
  NATIVE_QUOTA_TTL_MS,
  REAUTH_COOLDOWN_MS,
  SEVEN_DAY_MINUTES,
  SURFACE_CLAUDE,
  type NativeQuotaDeps,
} from './native-quota-types';
import {
  claudeProfileStates,
  defaultSleep,
  getState,
  isCachedRowFresh,
  record429Failure,
  recordTransientFailure,
  resetStateOnSuccess,
  serveCached,
} from './quota-circuit-breaker';
import { readClaudeCredentialsForProfileFromDisk } from './quota-credential-resolver';

function deriveClaudeQuotaPercentage(quota: ClaudeQuotaResult): number | null {
  const core = buildClaudeCoreUsageSummary(quota.windows);
  const windows = [core.fiveHour, core.weekly].filter((w): w is NonNullable<typeof w> => !!w);
  return windows.length ? Math.min(...windows.map((w) => w.remainingPercent)) : null;
}

function deriveClaudeNextReset(quota: ClaudeQuotaResult): string | null {
  const core = buildClaudeCoreUsageSummary(quota.windows);
  const resets = [core.fiveHour?.resetAt, core.weekly?.resetAt]
    .filter((r): r is string => typeof r === 'string')
    .filter((r) => Number.isFinite(Date.parse(r)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return resets[0] ?? null;
}

function buildClaudeQuotaWindows(quota: ClaudeQuotaResult): QuotaWindowDetail[] {
  return quota.windows.map((window) => {
    const metadata = getClaudeWindowMetadata(window);
    return {
      key: window.rateLimitType,
      label:
        metadata.scope === 'account'
          ? metadata.cadence === '5h'
            ? '5h'
            : 'week'
          : metadata.modelLabel
            ? metadata.modelLabel + ' · week'
            : window.label,
      usedPercent: window.usedPercent,
      remainingPercent: window.remainingPercent,
      resetAt: window.resetAt,
      windowMinutes: metadata.cadence
        ? metadata.cadence === '5h'
          ? FIVE_HOUR_MINUTES
          : SEVEN_DAY_MINUTES
        : null,
    };
  });
}

function buildClaudeRow(
  quota: ClaudeQuotaResult,
  tier: string | null,
  now: number,
  surface: string,
  profile: string
): BarSummaryRow {
  const quotaWindows = buildClaudeQuotaWindows(quota);
  return {
    account_id: `${surface}:${profile}`,
    provider: CLAUDE_NATIVE_PROVIDER,
    surface,
    profile,
    is_subscription: true,
    displayName: profile,
    tier,
    paused: false,
    quota_percentage: deriveClaudeQuotaPercentage(quota),
    quotaStatus: 'ok',
    next_reset: deriveClaudeNextReset(quota),
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
  };
}

function buildClaudeRowLegacy(
  quota: ClaudeQuotaResult,
  tier: string | null,
  now: number
): BarSummaryRow {
  const quotaWindows = buildClaudeQuotaWindows(quota);
  return {
    account_id: CLAUDE_PROVIDER,
    provider: CLAUDE_PROVIDER,
    displayName: 'Claude Code',
    tier,
    paused: false,
    quota_percentage: deriveClaudeQuotaPercentage(quota),
    quotaStatus: 'ok',
    next_reset: deriveClaudeNextReset(quota),
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
  };
}

export function buildParkedClaudeProfileRow(profile: string, now: number): BarSummaryRow {
  return {
    account_id: `${SURFACE_CLAUDE}:${profile}`,
    provider: CLAUDE_NATIVE_PROVIDER,
    surface: SURFACE_CLAUDE,
    profile,
    is_subscription: true,
    displayName: profile,
    tier: null,
    paused: true,
    quota_percentage: null,
    quotaStatus: 'unsupported',
    next_reset: null,
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: true,
  };
}

export async function collectClaudeRowForProfile(
  profile: string,
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = getState(claudeProfileStates, profile);

  if (!force && isCachedRowFresh(state, now)) {
    return serveCached(state);
  }

  if (now < state.breakerOpenUntil || now < state.cooldownUntil) {
    return serveCached(state);
  }

  if (state.pending) {
    return state.pending;
  }

  const readDefaultCredentials = deps.readCredentials ?? readClaudeCredentials;
  const readCreds =
    deps.readClaudeCredentialsForProfile ??
    ((p: string) => readClaudeCredentialsForProfileFromDisk(p, readDefaultCredentials));
  const fetchQuota = deps.fetchClaudeQuota ?? fetchClaudeQuotaWithToken;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      await Promise.resolve();
      const creds = await readCreds(profile);

      if (!creds) {
        const parkedRow = buildParkedClaudeProfileRow(profile, now);
        state.cachedRow = parkedRow;
        state.cachedAt = now;
        return parkedRow;
      }

      if (!hasSupportedSubscription(creds)) {
        return serveCached(state);
      }
      const token = getAccessToken(creds);
      if (!token) {
        return serveCached(state);
      }
      const tier = getSubscriptionTier(creds);

      const quota = await fetchQuota(token, `${SURFACE_CLAUDE}:${profile}`);

      if (quota.success) {
        resetStateOnSuccess(state);
        const row = buildClaudeRow(quota, tier, now, SURFACE_CLAUDE, profile);
        state.cachedRow = row;
        state.cachedAt = now;
        return { ...row, cached: false };
      }

      if (quota.needsReauth) {
        const row: BarSummaryRow = {
          account_id: `${SURFACE_CLAUDE}:${profile}`,
          provider: CLAUDE_NATIVE_PROVIDER,
          surface: SURFACE_CLAUDE,
          profile,
          is_subscription: true,
          displayName: profile,
          tier,
          paused: true,
          quota_percentage: null,
          quotaStatus: 'error',
          next_reset: null,
          is_default: false,
          last_activity_at: null,
          today_cost: null,
          health: 'error',
          cached: false,
          fetchedAt: new Date(now).toISOString(),
          needsReauth: true,
        };
        state.cachedRow = row;
        state.cachedAt = now;
        state.cooldownUntil = now + REAUTH_COOLDOWN_MS;
        return { ...row, cached: false };
      }

      if (quota.httpStatus === 429) {
        record429Failure(state, quota.errorDetail, now);
        void sleep;
      } else if (quota.retryable) {
        recordTransientFailure(state, now);
      }

      return serveCached(state);
    } catch {
      recordTransientFailure(state, now);
      return serveCached(state);
    } finally {
      state.pending = null;
    }
  })();

  return state.pending;
}

/**
 * @deprecated Use collectClaudeRowForProfile with the 'default' or appropriate
 * profile name. Kept for backward compatibility with existing tests.
 */
export async function collectClaudeRow(
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = getState(claudeProfileStates, '__legacy__');

  if (!force && state.cachedRow && now - state.cachedAt < NATIVE_QUOTA_TTL_MS) {
    return serveCached(state);
  }

  if (now < state.breakerOpenUntil || now < state.cooldownUntil) {
    return serveCached(state);
  }

  if (state.pending) {
    return state.pending;
  }

  const readCredentialsFn = deps.readCredentials ?? readClaudeCredentials;
  const fetchQuota = deps.fetchClaudeQuota ?? fetchClaudeQuotaWithToken;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      const creds = await readCredentialsFn();
      if (!creds || !hasSupportedSubscription(creds)) {
        return serveCached(state);
      }
      const token = getAccessToken(creds);
      if (!token) {
        return serveCached(state);
      }
      const tier = getSubscriptionTier(creds);

      const quota = await fetchQuota(token, CLAUDE_PROVIDER);

      if (quota.success) {
        resetStateOnSuccess(state);
        const row = buildClaudeRowLegacy(quota, tier, now);
        state.cachedRow = row;
        state.cachedAt = now;
        return { ...row, cached: false };
      }

      if (quota.needsReauth) {
        return {
          account_id: CLAUDE_PROVIDER,
          provider: CLAUDE_PROVIDER,
          displayName: 'Claude Code',
          tier,
          paused: false,
          quota_percentage: null,
          quotaStatus: 'error',
          next_reset: null,
          is_default: false,
          last_activity_at: null,
          today_cost: null,
          health: 'error',
          cached: false,
          fetchedAt: new Date(now).toISOString(),
          needsReauth: true,
        };
      }

      if (quota.httpStatus === 429) {
        record429Failure(state, quota.errorDetail, now);
        void sleep;
      } else if (quota.retryable) {
        recordTransientFailure(state, now);
      }

      return serveCached(state);
    } catch {
      recordTransientFailure(state, now);
      return serveCached(state);
    } finally {
      state.pending = null;
    }
  })();

  return state.pending;
}
