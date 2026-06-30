/**
 * Native subscription quota collector — the ONLY server-side fetch surface for
 * the user's own Claude Code + Codex subscription quota.
 *
 * The macOS bar reads localhost /api/bar/summary and NEVER calls Anthropic or
 * ChatGPT. All upstream traffic originates here, under strict safety controls,
 * because these endpoints are undocumented and hostile to polling (persistent
 * 429s, no Retry-After, first-party-only policy). The controls below exist to
 * protect the user's accounts:
 *
 *   - long TTL (10 min) on-demand cache, never a tight timer loop
 *   - in-flight coalescing so concurrent /summary calls share one fetch
 *   - Retry-After honored; exponential backoff + jitter on 429/5xx
 *   - circuit breaker stops calling after repeated 429s for a cooldown
 *   - serve-stale-on-failure; only omit a row when there is genuinely no data
 *
 * Claude path: reads native credentials + polls api.anthropic.com/api/oauth/usage.
 * Codex path: PRIMARY = live network (chatgpt.com/backend-api/wham/usage, via
 * fetchCodexQuota), FALLBACK = local session logs (getCodexLocalQuota), mirroring
 * the same safety pattern as the Claude path.
 */

import {
  readClaudeCredentials,
  getAccessToken,
  getSubscriptionTier,
  hasSupportedSubscription,
  type ClaudeNativeCredentials,
} from './claude-native-credentials';
import { fetchClaudeQuotaWithToken } from '../../cliproxy/quota/quota-fetcher-claude';
import { fetchCodexQuota } from '../../cliproxy/quota/quota-fetcher-codex';
import { getActiveAccounts } from '../../cliproxy/accounts/query';
import { getCodexLocalQuota, type CodexLocalQuota } from './codex-local-quota-collector';
import type { ClaudeQuotaResult, CodexQuotaResult } from '../../cliproxy/quota/quota-types';
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
// Injectable dependencies (tests inject mocks; never live endpoints in CI)
// ============================================================================

export interface NativeQuotaDeps {
  /** Read the native Claude Code credentials. */
  readCredentials?: () => ClaudeNativeCredentials | null;
  /** Fetch Claude quota with a directly-supplied native token. */
  fetchClaudeQuota?: (accessToken: string, accountId?: string) => Promise<ClaudeQuotaResult>;
  /**
   * Resolve the default Codex account ID for network quota fetch.
   * Returns null when no Codex account is configured (bar omits the live path).
   */
  getDefaultCodexAccountId?: () => string | null;
  /**
   * Fetch Codex quota live from the network.
   * Injected so tests never hit chatgpt.com.
   */
  fetchCodexNetworkQuota?: (accountId: string) => Promise<CodexQuotaResult>;
  /** Read Codex quota from local session logs (zero network, fallback). */
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
const codexState = freshProviderState();

/** Reset all module state. Tests call this to avoid cross-test pollution. */
export function resetNativeQuotaState(): void {
  Object.assign(claudeState, freshProviderState());
  Object.assign(codexState, freshProviderState());
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

/**
 * Build the Codex row from a LIVE network quota result.
 *
 * Uses coreUsage (5h/weekly) to produce QuotaWindowDetail entries with the same
 * stable keys as the Claude path. quota_percentage = min remaining across present
 * core windows. next_reset = soonest core resetAt. No staleAsOf on a live result.
 */
function buildCodexNetworkRow(quota: CodexQuotaResult, now: number): BarSummaryRow {
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

  // quota_percentage = min remaining across the windows present (mirrors Claude derivation)
  const coreWindows = [fiveHour, weekly].filter((w): w is NonNullable<typeof w> => !!w);
  const quotaPercentage =
    coreWindows.length > 0 ? Math.min(...coreWindows.map((w) => w.remainingPercent)) : null;

  // next_reset = soonest resetAt across present core windows
  const resets = coreWindows
    .map((w) => w.resetAt)
    .filter((r): r is string => typeof r === 'string')
    .map((r) => ({ iso: r, ms: new Date(r).getTime() }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);
  const nextReset = resets.length > 0 ? resets[0].iso : null;

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
    // No staleAsOf — live data is always fresh.
    ...(windows.length > 0 ? { quotaWindows: windows } : {}),
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

async function collectClaudeRow(
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = claudeState;

  // Serve from cache while within TTL — force bypasses TTL short-circuit.
  if (!force && state.cachedRow && now - state.cachedAt < NATIVE_QUOTA_TTL_MS) {
    return serveCached(state);
  }

  // Breaker open or cooldown active -> zero network, serve stale (may be null).
  // Force does NOT bypass the breaker — it protects the account.
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
// Codex path with live network as PRIMARY, local logs as FALLBACK
// ============================================================================

async function collectCodexRow(
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = codexState;

  // Serve from cache while within TTL — force bypasses TTL short-circuit.
  if (!force && state.cachedRow && now - state.cachedAt < NATIVE_QUOTA_TTL_MS) {
    return serveCached(state);
  }

  // Breaker open or cooldown active -> skip network, go to LOCAL fallback.
  // Force does NOT bypass the breaker — it protects the account.
  const breakerOrCooldownActive = now < state.breakerOpenUntil || now < state.cooldownUntil;

  // Coalesce: concurrent callers past TTL share one in-flight resolution.
  if (state.pending) {
    return state.pending;
  }

  const getDefaultAccountId =
    deps.getDefaultCodexAccountId ??
    (() => {
      const activeAccounts = getActiveAccounts('codex');
      return (
        activeAccounts.find((account) => account.isDefault)?.id ?? activeAccounts[0]?.id ?? null
      );
    });
  const fetchNetwork =
    deps.fetchCodexNetworkQuota ?? ((accountId: string) => fetchCodexQuota(accountId));
  const getCodex = deps.getCodexQuota ?? getCodexLocalQuota;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      // ----------------------------------------------------------------
      // PRIMARY: live network fetch (skipped when breaker/cooldown active)
      // ----------------------------------------------------------------
      if (!breakerOrCooldownActive) {
        const accountId = getDefaultAccountId();
        if (accountId) {
          const quota = await fetchNetwork(accountId);

          if (quota.success) {
            // A healthy response closes the breaker and clears backoff,
            // regardless of content.
            state.consecutive429 = 0;
            state.breakerOpenUntil = 0;
            state.cooldownUntil = 0;
            state.backoffAttempt = 0;
            // Only usable when at least one core window (5h/weekly) resolved. A
            // success with empty coreUsage (only code-review/additional windows,
            // or a changed payload) carries no glanceable signal — do NOT cache
            // a contentless "ok" row or clobber a good cache; fall through to
            // the local fallback so the bar shows real data instead.
            if (quota.coreUsage?.fiveHour || quota.coreUsage?.weekly) {
              const row = buildCodexNetworkRow(quota, now);
              state.cachedRow = row;
              state.cachedAt = now;
              return { ...row, cached: false };
            }
            // else: fall through to LOCAL fallback below.
          } else if (quota.needsReauth) {
            // Token expired -> reauth row; do NOT cache as a good value.
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
            // 429: apply breaker + backoff, then fall through to local.
            state.consecutive429 += 1;
            if (state.consecutive429 >= CB_TRIP_THRESHOLD) {
              state.breakerOpenUntil = now + CB_COOLDOWN_MS;
            }
            const retryAfter = parseRetryAfterMs(quota.errorDetail, now);
            const backoff = retryAfter ?? computeBackoffMs(state.backoffAttempt);
            state.cooldownUntil = now + backoff;
            state.backoffAttempt += 1;
            void sleep; // retained as an injectable seam for future inline retry
          } else if (quota.retryable) {
            // Other transient failure: set cooldown, fall through to local.
            const backoff = computeBackoffMs(state.backoffAttempt);
            state.cooldownUntil = now + backoff;
            state.backoffAttempt += 1;
          } else {
            // Terminal non-retryable failure (e.g. 403/404): back off so we
            // don't re-hit a dead endpoint every poll when no local data caches
            // a row to engage the TTL short-circuit. Then fall through to local.
            const backoff = computeBackoffMs(state.backoffAttempt);
            state.cooldownUntil = now + backoff;
            state.backoffAttempt += 1;
          }
          // Fall through to LOCAL fallback below.
        }
        // No configured accountId -> fall through to local fallback.
      }

      // ----------------------------------------------------------------
      // LOCAL FALLBACK: session log read (zero network, always attempted
      // when network is unavailable / no accountId / breaker active)
      // ----------------------------------------------------------------
      const localQuota = await getCodex();
      if (localQuota) {
        const row = buildCodexRow(localQuota, now);
        state.cachedRow = row;
        state.cachedAt = now;
        return { ...row, cached: false };
      }

      // No local data either: serve stale (may be null).
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
// Public entry point
// ============================================================================

/**
 * Build the native subscription rows (Claude Code + Codex) for /summary.
 *
 * Each path is independently try/caught so one failing source never blocks the
 * other or the response. Returns only rows that represent real data.
 *
 * `opts.force` bypasses the TTL short-circuit on both paths so a debounce-
 * passing refresh re-pulls native rows live. The circuit breaker is always
 * respected regardless of force (account protection).
 */
export async function getNativeAccountRows(
  deps: NativeQuotaDeps = {},
  opts?: { force?: boolean }
): Promise<BarSummaryRow[]> {
  const force = opts?.force ?? false;
  const [claude, codex] = await Promise.all([
    collectClaudeRow(deps, force).catch(() => null),
    collectCodexRow(deps, force).catch(() => null),
  ]);

  const rows: BarSummaryRow[] = [];
  if (claude) rows.push(claude);
  if (codex) rows.push(codex);
  return rows;
}

/**
 * Last-known native rows from cache, WITHOUT any fetch (instant, no network).
 *
 * Used as a non-blocking fallback by /summary: when a forced live re-pull
 * overruns the native side-load budget, the response serves these cached rows
 * instead of dropping the Claude/Codex cards entirely. The in-flight fetch keeps
 * warming the cache, so the next poll shows the fresh values.
 */
export function getCachedNativeAccountRows(): BarSummaryRow[] {
  const rows: BarSummaryRow[] = [];
  if (claudeState.cachedRow) rows.push({ ...claudeState.cachedRow, cached: true });
  if (codexState.cachedRow) rows.push({ ...codexState.cachedRow, cached: true });
  return rows;
}
