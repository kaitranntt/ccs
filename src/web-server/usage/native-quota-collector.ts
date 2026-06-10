/**
 * Native subscription quota collector — the ONLY server-side fetch surface for
 * the user's own Claude Code + Codex subscription quota.
 *
 * The macOS bar reads localhost /api/bar/summary and NEVER calls Anthropic. All
 * Anthropic traffic originates here, under strict safety controls, because the
 * OAuth usage endpoint is undocumented and hostile to polling (persistent 429s,
 * no Retry-After, first-party-only policy). The controls below exist to protect
 * the user's account:
 *
 *   - long TTL (10 min) on-demand cache, never a tight timer loop
 *   - in-flight coalescing so concurrent /summary calls share one fetch
 *   - Retry-After honored; exponential backoff + jitter on 429/5xx
 *   - circuit breaker stops calling after repeated 429s for a cooldown
 *   - serve-stale-on-failure; only omit a row when there is genuinely no data
 *
 * Codex is a pure local file read (no network), so it skips the network guards.
 */

import {
  readClaudeCredentials,
  getAccessToken,
  getSubscriptionTier,
  hasSupportedSubscription,
  type ClaudeNativeCredentials,
} from './claude-native-credentials';
import { fetchClaudeQuotaWithToken } from '../../cliproxy/quota/quota-fetcher-claude';
import { getCodexLocalQuota, type CodexLocalQuota } from './codex-local-quota-collector';
import type { ClaudeQuotaResult } from '../../cliproxy/quota/quota-types';
import type { BarSummaryRow, QuotaWindowDetail } from '../routes/bar-routes';

// ============================================================================
// Safety constants (concrete, named, module-level)
// ============================================================================

/** On-demand cache TTL. Floor is 5 min; we use 10 min because the bar polls
 *  /summary far more often than a hook fires. */
const NATIVE_QUOTA_TTL_MS = 600_000; // 10 minutes

/** Exponential backoff base; delay = min(base * 2^n, MAX) + jitter. */
const RETRY_BASE_MS = 1_000;

/** Ceiling for any single backoff / Retry-After cooldown derived from one call. */
const MAX_BACKOFF_MS = 60_000; // 1 minute

/** Jitter added to backoff to avoid synchronized retries. */
const JITTER_MAX_MS = 500;

/** Consecutive 429s that trip the breaker open. */
const CB_TRIP_THRESHOLD = 3;

/** How long the breaker stays open (zero network) once tripped. */
const CB_COOLDOWN_MS = 900_000; // 15 minutes

const CLAUDE_PROVIDER = 'claude-code';
const CODEX_PROVIDER = 'codex';

// ============================================================================
// Injectable dependencies (tests inject mocks; never live Anthropic in CI)
// ============================================================================

export interface NativeQuotaDeps {
  /** Read the native Claude Code credentials. */
  readCredentials?: () => ClaudeNativeCredentials | null;
  /** Fetch Claude quota with a directly-supplied native token. */
  fetchClaudeQuota?: (accessToken: string, accountId?: string) => Promise<ClaudeQuotaResult>;
  /** Read Codex quota from local session logs (zero network). */
  getCodexQuota?: () => Promise<CodexLocalQuota | null>;
  /** Clock seam for deterministic backoff/TTL/breaker tests. */
  now?: () => number;
  /** Sleep seam (no real delay in tests). */
  sleep?: (ms: number) => Promise<void>;
}

// ============================================================================
// Per-provider mutable state (module-scoped; reset() for tests)
// ============================================================================

interface ProviderState {
  /** Last successfully-built row, kept for stale-on-fail and TTL serving. */
  cachedRow: BarSummaryRow | null;
  /** Epoch ms when cachedRow was produced. */
  cachedAt: number;
  /** Shared in-flight promise; concurrent callers await this, not a new fetch. */
  pending: Promise<BarSummaryRow | null> | null;
  /** Consecutive 429 count toward the breaker threshold. */
  consecutive429: number;
  /** Epoch ms until which the breaker is open (no network). */
  breakerOpenUntil: number;
  /** Epoch ms until which a Retry-After / backoff cooldown holds. */
  cooldownUntil: number;
  /** Attempt counter feeding exponential backoff. */
  backoffAttempt: number;
}

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

const claudeState = freshProviderState();

/** Reset all module state. Tests call this to avoid cross-test pollution. */
export function resetNativeQuotaState(): void {
  Object.assign(claudeState, freshProviderState());
}

// ============================================================================
// Helpers
// ============================================================================

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse Retry-After (seconds or HTTP-date) into ms, capped at MAX_BACKOFF_MS. */
function parseRetryAfterMs(detail: string | undefined, now: number): number | null {
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

function computeBackoffMs(attempt: number): number {
  const exp = Math.min(RETRY_BASE_MS * 2 ** attempt, MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
  return exp + jitter;
}

/**
 * Best-guess remaining percentage across the 5h + weekly core windows, mirroring
 * the CLIProxy quota-manager derivation: min of remaining across non-overage
 * windows, falling back to all windows if core summary is absent.
 */
function deriveClaudeQuotaPercentage(quota: ClaudeQuotaResult): number | null {
  const coreWindows = [quota.coreUsage?.fiveHour, quota.coreUsage?.weekly].filter(
    (w): w is NonNullable<typeof w> => !!w
  );
  if (coreWindows.length > 0) {
    return Math.min(...coreWindows.map((w) => w.remainingPercent));
  }
  const usageWindows = quota.windows.filter((w) => w.rateLimitType !== 'overage');
  if (usageWindows.length > 0) {
    return Math.min(...usageWindows.map((w) => w.remainingPercent));
  }
  return null;
}

/** Soonest non-null reset ISO across the two core windows. */
function deriveClaudeNextReset(quota: ClaudeQuotaResult): string | null {
  const resets = [quota.coreUsage?.fiveHour?.resetAt, quota.coreUsage?.weekly?.resetAt]
    .filter((r): r is string => typeof r === 'string')
    .map((r) => ({ iso: r, ms: new Date(r).getTime() }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);
  return resets.length > 0 ? resets[0].iso : null;
}

/** Window length in minutes by Claude rate-limit family. */
const FIVE_HOUR_MINUTES = 300;
const SEVEN_DAY_MINUTES = 10080;

/**
 * Build the per-window detail for a Claude subscription row.
 *
 * 5h + weekly come from coreUsage (the canonical core summary). Opus/Sonnet
 * weekly splits come from quota.windows[] and only exist on Max plans, so they
 * are omitted entirely when absent. Each window carries BOTH used and remaining
 * percent so the bar never re-derives them.
 */
function buildClaudeQuotaWindows(quota: ClaudeQuotaResult): QuotaWindowDetail[] {
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

  // Opus/Sonnet weekly splits are Max-only; surface them when the API carries
  // them, otherwise omit so non-Max plans get exactly the two core windows.
  const splitLabels: Record<string, string> = {
    seven_day_opus: 'Opus · week',
    seven_day_sonnet: 'Sonnet · week',
  };
  for (const w of quota.windows) {
    const label = splitLabels[w.rateLimitType];
    if (!label) continue;
    windows.push({
      key: w.rateLimitType,
      label,
      usedPercent: w.usedPercent,
      remainingPercent: w.remainingPercent,
      resetAt: w.resetAt,
      windowMinutes: SEVEN_DAY_MINUTES,
    });
  }

  return windows;
}

function buildClaudeRow(quota: ClaudeQuotaResult, tier: string | null, now: number): BarSummaryRow {
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
    // Omit the field entirely (rather than an empty array) when no windows
    // resolved, so the wire shape stays minimal.
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
  };
}

/** Map the Codex local windows into the row's per-window detail shape. */
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

function buildCodexRow(quota: CodexLocalQuota, now: number): BarSummaryRow {
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
    // Codex is a local read; a stale source still reflects real usage so we keep
    // quotaStatus 'ok' but flag health 'warning' to hint freshness.
    health: quota.stale ? 'warning' : 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
    // staleAsOf is only present (and serialized) when the source session is old.
    ...(quota.staleAsOf ? { staleAsOf: quota.staleAsOf } : {}),
  };
}

/** Return the cached row marked cached=true (used for TTL + stale serving). */
function serveCached(state: ProviderState): BarSummaryRow | null {
  if (!state.cachedRow) return null;
  return { ...state.cachedRow, cached: true };
}

// ============================================================================
// Claude path with full safety controls
// ============================================================================

async function collectClaudeRow(deps: NativeQuotaDeps): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = claudeState;

  // Serve from cache while within TTL — on-demand only, NO network.
  if (state.cachedRow && now - state.cachedAt < NATIVE_QUOTA_TTL_MS) {
    return serveCached(state);
  }

  // Breaker open or cooldown active -> zero network, serve stale (may be null).
  if (now < state.breakerOpenUntil || now < state.cooldownUntil) {
    return serveCached(state);
  }

  // Coalesce: concurrent callers past TTL share one in-flight fetch.
  if (state.pending) {
    return state.pending;
  }

  const readCredentials = deps.readCredentials ?? readClaudeCredentials;
  const fetchQuota = deps.fetchClaudeQuota ?? fetchClaudeQuotaWithToken;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      const creds = readCredentials();
      // No token / unsupported subscription -> never spend a call, omit the row.
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
        // Success closes the breaker and clears backoff.
        state.consecutive429 = 0;
        state.breakerOpenUntil = 0;
        state.cooldownUntil = 0;
        state.backoffAttempt = 0;
        const row = buildClaudeRow(quota, tier, now);
        state.cachedRow = row;
        state.cachedAt = now;
        return { ...row, cached: false };
      }

      // 401 -> token expired. Emit a reauth row so the bar can prompt; this is
      // a real, actionable state distinct from a transient failure.
      if (quota.needsReauth) {
        const row: BarSummaryRow = {
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
        // Do not cache the reauth row as a good value; it should re-evaluate
        // once the user re-auths. But return it now.
        return row;
      }

      // 429 / 5xx / transient. Apply backoff + breaker, then serve stale.
      const is429 = quota.httpStatus === 429;
      if (is429) {
        state.consecutive429 += 1;
        if (state.consecutive429 >= CB_TRIP_THRESHOLD) {
          state.breakerOpenUntil = now + CB_COOLDOWN_MS;
        }
        const retryAfter = parseRetryAfterMs(quota.errorDetail, now);
        const backoff = retryAfter ?? computeBackoffMs(state.backoffAttempt);
        state.cooldownUntil = now + backoff;
        state.backoffAttempt += 1;
        // We do NOT sleep-then-retry inside the request path (that would burn
        // the request budget). The cooldown gates the NEXT call instead.
        void sleep; // retained as an injectable seam for future inline retry
      } else if (quota.retryable) {
        const backoff = computeBackoffMs(state.backoffAttempt);
        state.cooldownUntil = now + backoff;
        state.backoffAttempt += 1;
      }

      // Serve last good row on failure; omit if we never succeeded.
      return serveCached(state);
    } catch {
      // Network/parse rejection -> treat as transient, serve stale.
      const backoff = computeBackoffMs(state.backoffAttempt);
      state.cooldownUntil = now + backoff;
      state.backoffAttempt += 1;
      return serveCached(state);
    } finally {
      state.pending = null;
    }
  })();

  return state.pending;
}

// ============================================================================
// Codex path (local read, no network guards needed)
// ============================================================================

async function collectCodexRow(deps: NativeQuotaDeps): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const getCodex = deps.getCodexQuota ?? getCodexLocalQuota;
  try {
    const quota = await getCodex();
    if (!quota) return null; // exec-mode / no rate_limits -> omit the row
    return buildCodexRow(quota, now);
  } catch {
    return null;
  }
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * Build the native subscription rows (Claude Code + Codex) for /summary.
 *
 * Each path is independently try/caught so one failing source never blocks the
 * other or the response. Returns only rows that represent real data.
 */
export async function getNativeAccountRows(deps: NativeQuotaDeps = {}): Promise<BarSummaryRow[]> {
  const [claude, codex] = await Promise.all([
    collectClaudeRow(deps).catch(() => null),
    collectCodexRow(deps).catch(() => null),
  ]);

  const rows: BarSummaryRow[] = [];
  if (claude) rows.push(claude);
  if (codex) rows.push(codex);
  return rows;
}
