/**
 * Per-profile cache, backoff, circuit breaker, and rotating-slot scheduler state.
 */

import type { BarSummaryRow } from '../routes/bar-routes';
import {
  CB_COOLDOWN_MS,
  CB_TRIP_THRESHOLD,
  JITTER_MAX_MS,
  MAX_BACKOFF_MS,
  NATIVE_QUOTA_TTL_MS,
  PARKED_TTL_MS,
  RETRY_BASE_MS,
  type ProviderState,
} from './native-quota-types';

function freshProviderState(): ProviderState {
  return {
    cachedRow: null,
    cachedAt: 0,
    pending: null,
    consecutive429: 0,
    breakerOpenUntil: 0,
    cooldownUntil: 0,
    backoffAttempt: 0,
  };
}

export const claudeProfileStates = new Map<string, ProviderState>();
export const codexProfileStates = new Map<string, ProviderState>();

export function getState(map: Map<string, ProviderState>, key: string): ProviderState {
  let s = map.get(key);
  if (!s) {
    s = freshProviderState();
    map.set(key, s);
  }
  return s;
}

/** Reset all module state. Tests call this to avoid cross-test pollution. */
export function resetNativeQuotaState(): void {
  claudeProfileStates.clear();
  codexProfileStates.clear();
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse Retry-After (seconds or HTTP-date) into ms, capped at MAX_BACKOFF_MS. */
export function parseRetryAfterMs(detail: string | undefined, now: number): number | null {
  if (!detail) return null;
  const match = /retry-after:(.+)$/.exec(detail);
  if (!match) return null;
  const raw = match[1].trim();

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds)) {
    return Math.min(Math.max(0, asSeconds) * 1000, MAX_BACKOFF_MS);
  }

  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.min(Math.max(0, asDate - now), MAX_BACKOFF_MS);
  }
  return null;
}

export function computeBackoffMs(attempt: number): number {
  const exp = Math.min(RETRY_BASE_MS * 2 ** attempt, MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
  return exp + jitter;
}

/** Return the cached row marked cached=true (used for TTL + stale serving). */
export function serveCached(state: ProviderState): BarSummaryRow | null {
  if (!state.cachedRow) return null;
  return { ...state.cachedRow, cached: true };
}

export function resetStateOnSuccess(state: ProviderState): void {
  state.consecutive429 = 0;
  state.breakerOpenUntil = 0;
  state.cooldownUntil = 0;
  state.backoffAttempt = 0;
}

export function record429Failure(
  state: ProviderState,
  errorDetail: string | undefined,
  now: number
): void {
  state.consecutive429 += 1;
  if (state.consecutive429 >= CB_TRIP_THRESHOLD) {
    state.breakerOpenUntil = now + CB_COOLDOWN_MS;
  }
  const retryAfter = parseRetryAfterMs(errorDetail, now);
  const backoff = retryAfter ?? computeBackoffMs(state.backoffAttempt);
  state.cooldownUntil = now + backoff;
  state.backoffAttempt += 1;
}

export function recordTransientFailure(state: ProviderState, now: number): void {
  const backoff = computeBackoffMs(state.backoffAttempt);
  state.cooldownUntil = now + backoff;
  state.backoffAttempt += 1;
}

export function isCachedRowFresh(state: ProviderState, now: number): boolean {
  if (!state.cachedRow) return false;
  const ttl = state.cachedRow.quotaStatus === 'unsupported' ? PARKED_TTL_MS : NATIVE_QUOTA_TTL_MS;
  return now - state.cachedAt < ttl && !isCachedRowStaleByReset(state, now);
}

/**
 * True when the cached row was fetched BEFORE its own next_reset boundary and
 * that boundary has now passed.
 */
export function isCachedRowStaleByReset(state: ProviderState, now: number): boolean {
  const nextReset = state.cachedRow?.next_reset;
  if (!nextReset) return false;
  const resetMs = Date.parse(nextReset);
  if (!Number.isFinite(resetMs)) return false;
  return resetMs <= now && state.cachedAt < resetMs;
}

export function collectCachedOrParkedProfileRow(
  map: Map<string, ProviderState>,
  profile: string,
  now: number,
  buildParkedRow: (profile: string, now: number) => BarSummaryRow
): BarSummaryRow {
  const state = getState(map, profile);
  if (state.cachedRow) {
    return { ...state.cachedRow, cached: true, paused: true };
  }
  const parkedRow = buildParkedRow(profile, now);
  state.cachedRow = parkedRow;
  state.cachedAt = now;
  return parkedRow;
}

export function markDefaultAndSyncCache(
  map: Map<string, ProviderState>,
  profile: string,
  row: BarSummaryRow,
  isDefault: boolean
): BarSummaryRow {
  const state = map.get(profile);
  const marked = { ...row, is_default: isDefault };
  if (state?.cachedRow) {
    state.cachedRow = { ...state.cachedRow, is_default: isDefault };
  }
  return marked;
}

export function markPausedAndSyncCache(
  map: Map<string, ProviderState>,
  profile: string,
  row: BarSummaryRow
): BarSummaryRow {
  const state = map.get(profile);
  if (state?.cachedRow) {
    state.cachedRow = { ...state.cachedRow, paused: true };
  }
  return { ...row, paused: true };
}

/**
 * Pick the non-default profile the rotating live slot should refresh this pass.
 */
export function pickRotatingLiveProfile(
  map: Map<string, ProviderState>,
  profiles: string[],
  defaultProfile: string | null,
  now: number
): string | null {
  let picked: string | null = null;
  let pickedAt = Number.POSITIVE_INFINITY;
  for (const p of profiles) {
    if (p === defaultProfile) continue;
    const state = map.get(p);
    if (state && (now < state.breakerOpenUntil || now < state.cooldownUntil)) continue;
    const cachedRow = state?.cachedRow ?? null;
    const cachedAt = state?.cachedAt ?? 0;
    if (cachedRow && state) {
      const ttl = cachedRow.quotaStatus === 'unsupported' ? PARKED_TTL_MS : NATIVE_QUOTA_TTL_MS;
      if (now - cachedAt < ttl && !isCachedRowStaleByReset(state, now)) continue;
    }
    if (cachedAt < pickedAt) {
      pickedAt = cachedAt;
      picked = p;
    }
  }
  return picked;
}
