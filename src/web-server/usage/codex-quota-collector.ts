/**
 * Codex native quota collector (multi-profile and legacy single-profile paths).
 */

import { fetchCodexQuota } from '../../cliproxy/quota/quota-fetcher-codex';
import { getDefaultAccount } from '../../cliproxy/accounts/query';
import type { CodexQuotaResult } from '../../cliproxy/quota/quota-types';
import type { BarSummaryRow, QuotaWindowDetail } from '../routes/bar-routes';
import { getCodexLocalQuota, type CodexLocalQuota } from './codex-local-quota-collector';
import {
  CODEX_NATIVE_PROVIDER,
  CODEX_PROVIDER,
  DEFAULT_PROFILE,
  FIVE_HOUR_MINUTES,
  NATIVE_QUOTA_TTL_MS,
  REAUTH_COOLDOWN_MS,
  SEVEN_DAY_MINUTES,
  SURFACE_CODEX,
  type NativeQuotaDeps,
} from './native-quota-types';
import {
  codexProfileStates,
  defaultSleep,
  getState,
  isCachedRowFresh,
  record429Failure,
  recordTransientFailure,
  resetStateOnSuccess,
  serveCached,
} from './quota-circuit-breaker';
import { readCodexNativeAuthFromDisk } from './quota-credential-resolver';

function buildCodexQuotaWindows(quota: CodexLocalQuota): QuotaWindowDetail[] {
  return quota.windows.map((w) => ({
    key: w.key,
    label: w.label,
    usedPercent: w.usedPercent,
    remainingPercent: w.remainingPercent,
    resetAt: w.resetAt,
    windowMinutes: w.windowMinutes,
  }));
}

function deriveCodexNetworkWindows(quota: CodexQuotaResult): {
  windows: QuotaWindowDetail[];
  quotaPercentage: number | null;
  nextReset: string | null;
} {
  const windows: QuotaWindowDetail[] = [];

  const fiveHour = quota.coreUsage?.fiveHour;
  if (fiveHour) {
    windows.push({
      key: 'five_hour',
      label: '5h',
      usedPercent: 100 - fiveHour.remainingPercent,
      remainingPercent: fiveHour.remainingPercent,
      resetAt: fiveHour.resetAt,
      windowMinutes: FIVE_HOUR_MINUTES,
    });
  }

  const weekly = quota.coreUsage?.weekly;
  if (weekly) {
    windows.push({
      key: 'seven_day',
      label: 'week',
      usedPercent: 100 - weekly.remainingPercent,
      remainingPercent: weekly.remainingPercent,
      resetAt: weekly.resetAt,
      windowMinutes: SEVEN_DAY_MINUTES,
    });
  }

  const coreWindows = [fiveHour, weekly].filter((w): w is NonNullable<typeof w> => !!w);
  const quotaPercentage =
    coreWindows.length > 0 ? Math.min(...coreWindows.map((w) => w.remainingPercent)) : null;

  const resets = coreWindows
    .map((w) => w.resetAt)
    .filter((r): r is string => typeof r === 'string')
    .map((r) => ({ iso: r, ms: new Date(r).getTime() }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);
  const nextReset = resets.length > 0 ? resets[0].iso : null;

  return { windows, quotaPercentage, nextReset };
}

function buildCodexRow(
  quota: CodexLocalQuota,
  now: number,
  surface: string,
  profile: string
): BarSummaryRow {
  const quotaWindows = buildCodexQuotaWindows(quota);
  return {
    account_id: `${surface}:${profile}`,
    provider: CODEX_NATIVE_PROVIDER,
    surface,
    profile,
    is_subscription: true,
    displayName: profile,
    tier: quota.tier,
    paused: false,
    quota_percentage: quota.quotaPercentage,
    quotaStatus: 'ok',
    next_reset: quota.nextReset,
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: quota.stale ? 'warning' : 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
    ...(quota.staleAsOf ? { staleAsOf: quota.staleAsOf } : {}),
  };
}

function buildCodexNetworkRow(
  quota: CodexQuotaResult,
  now: number,
  surface: string,
  profile: string
): BarSummaryRow {
  const { windows, quotaPercentage, nextReset } = deriveCodexNetworkWindows(quota);
  return {
    account_id: `${surface}:${profile}`,
    provider: CODEX_NATIVE_PROVIDER,
    surface,
    profile,
    is_subscription: true,
    displayName: profile,
    tier: quota.planType ?? null,
    paused: false,
    quota_percentage: quotaPercentage,
    quotaStatus: 'ok',
    next_reset: nextReset,
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(windows.length > 0 ? { quotaWindows: windows } : {}),
  };
}

function buildCodexRowLegacy(quota: CodexLocalQuota, now: number): BarSummaryRow {
  const quotaWindows = buildCodexQuotaWindows(quota);
  return {
    account_id: CODEX_PROVIDER,
    provider: CODEX_PROVIDER,
    displayName: 'Codex',
    tier: quota.tier,
    paused: false,
    quota_percentage: quota.quotaPercentage,
    quotaStatus: 'ok',
    next_reset: quota.nextReset,
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: quota.stale ? 'warning' : 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
    ...(quota.staleAsOf ? { staleAsOf: quota.staleAsOf } : {}),
  };
}

function buildCodexNetworkRowLegacy(quota: CodexQuotaResult, now: number): BarSummaryRow {
  const { windows, quotaPercentage, nextReset } = deriveCodexNetworkWindows(quota);
  return {
    account_id: CODEX_PROVIDER,
    provider: CODEX_PROVIDER,
    displayName: 'Codex',
    tier: quota.planType ?? null,
    paused: false,
    quota_percentage: quotaPercentage,
    quotaStatus: 'ok',
    next_reset: nextReset,
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(windows.length > 0 ? { quotaWindows: windows } : {}),
  };
}

export function buildParkedCodexProfileRow(profile: string, now: number): BarSummaryRow {
  return {
    account_id: `${SURFACE_CODEX}:${profile}`,
    provider: CODEX_NATIVE_PROVIDER,
    surface: SURFACE_CODEX,
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

export async function collectCodexRowForProfile(
  profile: string,
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = getState(codexProfileStates, profile);

  if (!force && isCachedRowFresh(state, now)) {
    return serveCached(state);
  }

  const breakerOrCooldownActive = now < state.breakerOpenUntil || now < state.cooldownUntil;

  if (state.pending) {
    return state.pending;
  }

  const readNativeAuth =
    deps.readCodexNativeAuth ?? ((p: string) => readCodexNativeAuthFromDisk(p));
  const fetchNetwork =
    deps.fetchCodexNetworkQuota ?? ((accountId: string) => fetchCodexQuota(accountId));
  const getCodex = deps.getCodexQuota ?? getCodexLocalQuota;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      await Promise.resolve();
      if (!breakerOrCooldownActive) {
        const nativeAuth = readNativeAuth(profile);
        if (nativeAuth) {
          const quota = await fetchNetwork(nativeAuth.accountId || profile);

          if (quota.success) {
            resetStateOnSuccess(state);
            if (quota.coreUsage?.fiveHour || quota.coreUsage?.weekly) {
              const row = buildCodexNetworkRow(quota, now, SURFACE_CODEX, profile);
              state.cachedRow = row;
              state.cachedAt = now;
              return { ...row, cached: false };
            }
            if (profile !== DEFAULT_PROFILE) {
              const row = buildCodexNetworkRow(quota, now, SURFACE_CODEX, profile);
              state.cachedRow = row;
              state.cachedAt = now;
              return { ...row, cached: false };
            }
          } else if (quota.needsReauth) {
            const reauthRow: BarSummaryRow = {
              account_id: `${SURFACE_CODEX}:${profile}`,
              provider: CODEX_NATIVE_PROVIDER,
              surface: SURFACE_CODEX,
              profile,
              is_subscription: true,
              displayName: profile,
              tier: null,
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
            state.cachedRow = reauthRow;
            state.cachedAt = now;
            state.cooldownUntil = now + REAUTH_COOLDOWN_MS;
            return { ...reauthRow, cached: false };
          } else if (quota.httpStatus === 429) {
            record429Failure(state, quota.errorDetail, now);
            void sleep;
          } else {
            recordTransientFailure(state, now);
          }
        }
      }

      if (profile === DEFAULT_PROFILE) {
        const localQuota = await getCodex();
        if (localQuota) {
          const row = buildCodexRow(localQuota, now, SURFACE_CODEX, profile);
          state.cachedRow = row;
          state.cachedAt = now;
          return { ...row, cached: false };
        }
      }

      const stale = serveCached(state);
      if (stale) return stale;
      const parkedRow = buildParkedCodexProfileRow(profile, now);
      state.cachedRow = parkedRow;
      state.cachedAt = now;
      return parkedRow;
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
 * Legacy Codex collector — uses the old getDefaultCodexAccountId dep.
 * Kept for backward compatibility with existing tests.
 */
export async function collectCodexRow(
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = getState(codexProfileStates, '__legacy__');

  if (!force && state.cachedRow && now - state.cachedAt < NATIVE_QUOTA_TTL_MS) {
    return serveCached(state);
  }

  const breakerOrCooldownActive = now < state.breakerOpenUntil || now < state.cooldownUntil;

  if (state.pending) {
    return state.pending;
  }

  const getDefaultAccountId =
    deps.getDefaultCodexAccountId ?? (() => getDefaultAccount('codex')?.id ?? null);
  const fetchNetwork =
    deps.fetchCodexNetworkQuota ?? ((accountId: string) => fetchCodexQuota(accountId));
  const getCodex = deps.getCodexQuota ?? getCodexLocalQuota;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      await Promise.resolve();
      if (!breakerOrCooldownActive) {
        const accountId = getDefaultAccountId();
        if (accountId) {
          const quota = await fetchNetwork(accountId);

          if (quota.success) {
            resetStateOnSuccess(state);
            if (quota.coreUsage?.fiveHour || quota.coreUsage?.weekly) {
              const row = buildCodexNetworkRowLegacy(quota, now);
              state.cachedRow = row;
              state.cachedAt = now;
              return { ...row, cached: false };
            }
          } else if (quota.needsReauth) {
            return {
              account_id: CODEX_PROVIDER,
              provider: CODEX_PROVIDER,
              displayName: 'Codex',
              tier: null,
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
          } else if (quota.httpStatus === 429) {
            record429Failure(state, quota.errorDetail, now);
            void sleep;
          } else {
            recordTransientFailure(state, now);
          }
        }
      }

      const localQuota = await getCodex();
      if (localQuota) {
        const row = buildCodexRowLegacy(localQuota, now);
        state.cachedRow = row;
        state.cachedAt = now;
        return { ...row, cached: false };
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
