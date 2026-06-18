/**
 * Bar Routes — /api/bar/summary aggregator
 *
 * One GET returns the full glance array for CCS Bar (macOS MenuBarExtra).
 * Supports cached (instant) and ?refresh=true (live provider pull) modes.
 *
 * Design:
 * - Calls data sources DIRECTLY (not via HTTP routes) so rate-limiters are irrelevant.
 * - Force-fresh = invalidate quota-response-cache then call the fetcher server-side.
 * - Debounce: if a fresh pull happened < 15s ago, serve cache even when refresh=true.
 * - Per-account failure degrades THAT row (null fields + needsReauth/health:error);
 *   other rows are unaffected — the payload always returns HTTP 200.
 * - today_cost sourced from getTodayCostByAccount() (Phase 1A output).
 * - health derived from runHealthChecks() summary (overall, not per-account for v1).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { CLIProxyProvider } from '../../cliproxy/types';
import type { AccountInfo } from '../../cliproxy/accounts/types';
import type { QuotaResult } from '../../cliproxy/quota/quota-fetcher';
import type { HealthReport } from '../health-service';
import type { CliproxyUsageHistoryDetail } from '../usage/cliproxy-usage-transformer';
import { computeBarAnalyticsFromDaily } from '../usage/bar-analytics';
import type { DailyUsage, HourlyUsage } from '../usage/types';
import { createLogger } from '../../services/logging';

const logger = createLogger('web-server:routes:bar');

// ============================================================================
// Types
// ============================================================================

/**
 * Per-window quota detail for native subscription rows (Claude/Codex).
 *
 * Carries BOTH used and remaining percent so the macOS bar never re-derives
 * them. CLIProxy rows omit the parent `quotaWindows` field entirely, keeping
 * the payload backward compatible.
 *
 * JSON shape (decode test pins these exact keys): the inner object keys stay
 * camelCase (usedPercent/remainingPercent/resetAt/windowMinutes); only the
 * parent field name serializes to snake_case ("quota_windows").
 */
export interface QuotaWindowDetail {
  /** Stable key: "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet". */
  key: string;
  /** Display label: "5h" | "week" | "Opus · week" | "Sonnet · week". */
  label: string;
  /** Used percentage (0-100). */
  usedPercent: number;
  /** Remaining percentage (0-100). Carried explicitly, never derived in Swift. */
  remainingPercent: number;
  /** ISO timestamp when this window resets, null if unknown. */
  resetAt: string | null;
  /** Window length in minutes (300 | 10080), null if unknown. */
  windowMinutes: number | null;
}

/** Single account glance row returned by /api/bar/summary */
export interface BarSummaryRow {
  /** Account identifier (email or custom name) */
  account_id: string;
  /** CLIProxy provider: agy | codex | gemini | claude | ghcp | … */
  provider: string;
  /** Nickname or fallback to account_id */
  displayName: string | null;
  /** Account tier: free | pro | ultra | unknown | null on error */
  tier: string | null;
  /** Whether account is user-paused */
  paused: boolean;
  /** Best-guess quota remaining percentage (0-100), null on error */
  quota_percentage: number | null;
  /**
   * Tri-state quota availability for this account:
   *   'ok'          — provider has a quota API and the fetch succeeded
   *   'unsupported' — provider has no quota API at all (e.g. ghcp, kiro)
   *   'error'       — provider should report quota but the fetch failed/timed out/needs reauth
   * The UI uses this to render "no quota" (unsupported) vs "quota ?" (error)
   * instead of a bare "--" that conflates the two.
   */
  quotaStatus: 'ok' | 'unsupported' | 'error';
  /** ISO timestamp of next quota reset, null if unknown */
  next_reset: string | null;
  /** Whether this is the provider's default account (drives the active/default badge) */
  is_default: boolean;
  /** ISO timestamp this account was last used, null if never/unknown */
  last_activity_at: string | null;
  /** Today's attributed cost in USD, null if unavailable */
  today_cost: number | null;
  /** Health status derived from overall system health */
  health: 'ok' | 'warning' | 'error';
  /** True when value came from cache; false when freshly fetched */
  cached: boolean;
  /** ISO timestamp of when this data was fetched/cached */
  fetchedAt: string;
  /** True if account token is expired and needs re-authentication */
  needsReauth: boolean;
  /**
   * Native-only per-window quota breakdown (Claude: 5h/week/opus/sonnet,
   * Codex: 5h/week). CLIProxy rows OMIT this field so existing decode/encode
   * tests and the Swift legacy path stay unaffected. Serialized as
   * "quota_windows".
   */
  quotaWindows?: QuotaWindowDetail[];
  /**
   * Native-only ISO mtime of the source session that supplied a stale Codex
   * reading. Present only when stale; serialized as "stale_as_of".
   */
  staleAsOf?: string | null;
}

// ============================================================================
// Dependency injection interface
// ============================================================================

/** All external dependencies are injectable for testability */
export interface BarRouterDeps {
  /** Get all CLIProxy accounts across providers */
  getAllAccountsSummary: () => Record<string, AccountInfo[]>;
  /** Check the quota cache for a specific account */

  getCachedQuota: <T>(provider: CLIProxyProvider | string, accountId: string) => T | null;
  /** Store a value in the quota cache */

  setCachedQuota: <T>(provider: CLIProxyProvider | string, accountId: string, data: T) => void;
  /** Invalidate cache entry for a specific account */
  invalidateQuotaCache: (provider: CLIProxyProvider | string, accountId: string) => void;
  /** Fetch live quota from provider for one account */
  fetchAccountQuota: (provider: CLIProxyProvider, accountId: string) => Promise<QuotaResult>;
  /** Compute per-account today cost from history details */
  getTodayCostByAccount: (details: CliproxyUsageHistoryDetail[]) => Record<string, number>;
  /** Load persisted CLIProxy usage details (from snapshot cache) */
  loadCliproxyDetails: () => Promise<CliproxyUsageHistoryDetail[]>;
  /**
   * Load merged, multi-source daily usage (Claude Code, Codex, Droid, CLIProxy).
   * Fresh, stale-while-revalidate; carries cost + per-model + per-surface spend.
   */
  loadDailyUsage: () => Promise<DailyUsage[]>;
  /** Load merged hourly usage — the source of request counts (daily lacks them). */
  loadHourlyUsage: () => Promise<HourlyUsage[]>;
  /**
   * Optional, retained only for test back-compat. NOT used by the request path:
   * the bar derives per-account health from each quota result. The real system
   * audit shells out via a synchronous execSync that must never run here.
   */
  runHealthChecks?: () => Promise<HealthReport>;
  /**
   * Native subscription quota rows (Claude Code + Codex). Defaults to an empty
   * async so older tests that build deps without it keep passing. The native
   * collector owns its own long-TTL cache + safety controls, so this is cheap
   * to call per request.
   */
  getNativeAccountRows?: () => Promise<BarSummaryRow[]>;
}

// ============================================================================
// Timing budgets (module-level; the bar must NEVER block on a slow provider)
// ============================================================================

/** Debounce window: skip force-fresh if last fresh pull was < 15s ago */
const FORCE_FRESH_DEBOUNCE_MS = 15_000;

/** Hard ceiling for the whole /summary response. Past this we paint from cache. */
const REQUEST_DEADLINE_MS = 2_500;

/** Per-account synchronous wait before falling back to stale cache (bg fetch continues). */
const PER_ACCOUNT_TIMEOUT_MS = 5_000;

/** Bound for the cost side-load so a slow snapshot read can't dominate the response. */
const SIDELOAD_TIMEOUT_MS = 1_500;

/**
 * Bound for the native-subscription side-load. A slow or failed native fetch
 * resolves to [] so the response paints CLIProxy rows only — never errors, never
 * blocks. Native rows have their own 10-min cache, so the common path is instant.
 */
const NATIVE_SIDELOAD_TIMEOUT_MS = 1_500;

/** Timestamp of the last successful force-fresh pull (epoch ms, 0 = never) */
let lastForceFreshAt = 0;

/** Reset module state — called in tests to prevent cross-test pollution */
export function resetForceFreshDebounce(): void {
  lastForceFreshAt = 0;
}

/**
 * Resolve a promise to its value, or to null if it doesn't settle within `ms`.
 * The underlying promise keeps running (used to let a slow fetch warm the cache
 * for the next open while the current response degrades gracefully).
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    p.then(
      (v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    );
  });
}

/**
 * Map a row to its wire shape. The native-only additions use snake_case parent
 * keys ("quota_windows" / "stale_as_of") to match the existing payload's mixed
 * casing; inner QuotaWindowDetail keys stay camelCase and pass through as-is.
 * Rows without the native fields serialize byte-identically to before, so
 * CLIProxy decode/encode tests are unaffected.
 */
function serializeBarRow(row: BarSummaryRow): Record<string, unknown> {
  const { quotaWindows, staleAsOf, ...rest } = row;
  const wire: Record<string, unknown> = { ...rest };
  if (quotaWindows !== undefined) wire.quota_windows = quotaWindows;
  if (staleAsOf !== undefined && staleAsOf !== null) wire.stale_as_of = staleAsOf;
  return wire;
}

// ============================================================================
// Per-account health derivation
// ============================================================================

/**
 * Tri-state quota availability derived from the QuotaResult.
 *
 * We branch ONLY on the result's stable errorCode, never on a provider
 * registry: ghcp is listed in MANAGED_QUOTA_PROVIDERS, yet fetchAccountQuota
 * returns unsupported for every provider !== 'agy'. The result's
 * 'quota_not_supported' code is the only honest signal that a provider has no
 * quota API, so we use it here.
 *
 *   success                         → 'ok'
 *   errorCode 'quota_not_supported' → 'unsupported' (no quota API; healthy)
 *   anything else (null/timeout/reauth/other failure) → 'error'
 */
function deriveQuotaStatus(quota: QuotaResult | null): 'ok' | 'unsupported' | 'error' {
  if (quota?.success === true) return 'ok';
  if (quota && quota.errorCode === 'quota_not_supported') return 'unsupported';
  return 'error';
}

/**
 * Health for a single account, derived from its own quota-fetch result.
 *
 * The menu bar is a per-account glance, so health is per-row — NOT the global
 * system audit. (The system audit is also unsafe here: it shells out via a
 * synchronous execSync that would block the event loop on the request path.)
 *
 * A provider with no quota API (quotaStatus 'unsupported', e.g. ghcp/kiro) is
 * healthy — it must not show a permanent warning dot. 'warning' is reserved for
 * genuine transient fetch failures, 'error' for accounts needing reauth.
 *
 *   needsReauth      → 'error'   (token expired; user action required)
 *   quota unsupported → 'ok'     (no quota API is not a fault)
 *   fetch failed      → 'warning' (transient/unknown; row degrades but isn't fatal)
 *   success           → 'ok'
 */
function deriveHealth(
  quota: QuotaResult | null,
  quotaStatus: 'ok' | 'unsupported' | 'error'
): 'ok' | 'warning' | 'error' {
  if (quota?.needsReauth) return 'error';
  if (quotaStatus === 'unsupported') return 'ok';
  if (!quota || !quota.success) return 'warning';
  return 'ok';
}

// ============================================================================
// Quota → bar row mapping
// ============================================================================

/**
 * Extract the primary quota percentage from a QuotaResult.
 * For Antigravity accounts: use the first model's percentage.
 * Returns null on failure or missing data.
 */
function extractQuotaPercentage(quota: QuotaResult): number | null {
  if (!quota.success || quota.models.length === 0) return null;
  // Use the first model (highest weight) as the representative percentage
  return quota.models[0].percentage ?? null;
}

/**
 * Extract the next reset timestamp from a QuotaResult.
 * Returns null if not available.
 */
function extractNextReset(quota: QuotaResult): string | null {
  if (!quota.success || quota.models.length === 0) return null;
  return quota.models[0].resetTime ?? null;
}

// ============================================================================
// Per-account fetch with error isolation
// ============================================================================

interface AccountFetchResult {
  quota: QuotaResult | null;
  cached: boolean;
  fetchedAt: string;
}

async function fetchAccountData(
  account: AccountInfo,
  forceRefresh: boolean,
  deps: BarRouterDeps
): Promise<AccountFetchResult> {
  const provider = account.provider;
  const accountId = account.id;
  const now = new Date().toISOString();

  // Read any prior cache up front so it survives as a stale fallback even when a
  // refresh fetch is slow or fails (stale-while-revalidate).
  const cached = deps.getCachedQuota<QuotaResult>(provider, accountId);

  // Paused accounts: serve cache if present, otherwise degrade.
  // Never trigger a live fetch for a user-paused account.
  if (account.paused === true) {
    return { quota: cached ?? null, cached: cached !== null, fetchedAt: now };
  }

  // Default mode serves a present cache instantly (no provider call).
  if (!forceRefresh && cached) {
    return { quota: cached, cached: true, fetchedAt: now };
  }

  // Force-fresh busts the route cache first (the stale value captured above
  // still backs the fallback below).
  if (forceRefresh) {
    deps.invalidateQuotaCache(provider, accountId);
  }

  // Live fetch (force-refresh, or default-mode cache miss). It overwrites the
  // cache on success and is bounded by PER_ACCOUNT_TIMEOUT_MS; if it overruns,
  // the fetch keeps running (warming the cache for the next open) while this row
  // degrades to the stale value so the payload never blocks.
  const live = deps.fetchAccountQuota(provider as CLIProxyProvider, accountId).then((quota) => {
    deps.setCachedQuota(provider, accountId, quota);
    return quota;
  });
  const fresh = await withTimeout(live, PER_ACCOUNT_TIMEOUT_MS);
  if (fresh) return { quota: fresh, cached: false, fetchedAt: now };
  return { quota: cached ?? null, cached: cached !== null, fetchedAt: now };
}

// ============================================================================
// Row builder
// ============================================================================

/**
 * Resolve the cost-lookup key for an account.
 *
 * The attribution pipeline (buildAuthIndexToAccountMap) stores email as the
 * map value, so costByAccount keys are emails. For providers where
 * account.id == email (agy, gemini, anthropic, etc.) this is a no-op.
 * For duplicate-email providers like codex, account.id may be "email#variant",
 * so we prefer account.email for the lookup to ensure the keys match.
 * Falls back to account.id when email is absent (e.g. kiro/ghcp).
 */
function resolveCostKey(account: AccountInfo): string {
  return account.email ?? account.id;
}

function buildRow(
  account: AccountInfo,
  fetchResult: AccountFetchResult,
  costByAccount: Record<string, number>,
  /** Set of cost-keys that are shared by more than one account. Cost is unknowable for these. */
  sharedCostKeys: ReadonlySet<string>
): BarSummaryRow {
  const { quota, cached, fetchedAt } = fetchResult;
  const costKey = resolveCostKey(account);
  const quotaStatus = deriveQuotaStatus(quota);
  const health = deriveHealth(quota, quotaStatus);
  const isDefault = account.isDefault ?? false;
  const lastActivityAt = account.lastUsedAt ?? null;

  // When multiple accounts share the same cost-key (e.g. two codex accounts with
  // the same email), we cannot attribute the combined cost to either individual
  // account, so it is null=unknowable. A missing key on a single-owner account is
  // ALSO null=unknown (no usage record on a possibly-stale snapshot), distinct from
  // a genuine 0 spend — the UI renders "no data" vs "$0.00" honestly.
  const todayCost = sharedCostKeys.has(costKey) ? null : (costByAccount[costKey] ?? null);

  if (!quota || !quota.success) {
    // Degraded row: preserve identity fields, null out quota data
    return {
      account_id: account.id,
      provider: account.provider,
      displayName: account.nickname ?? account.id,
      tier: account.tier ?? null,
      paused: account.paused ?? false,
      quota_percentage: null,
      quotaStatus,
      next_reset: null,
      is_default: isDefault,
      last_activity_at: lastActivityAt,
      today_cost: todayCost,
      health,
      cached,
      fetchedAt,
      needsReauth: quota?.needsReauth ?? false,
    };
  }

  return {
    account_id: account.id,
    provider: account.provider,
    displayName: account.nickname ?? account.id,
    tier: quota.tier ?? account.tier ?? null,
    paused: account.paused ?? false,
    quota_percentage: extractQuotaPercentage(quota),
    quotaStatus,
    next_reset: extractNextReset(quota),
    is_default: isDefault,
    last_activity_at: lastActivityAt,
    today_cost: todayCost,
    health,
    cached,
    fetchedAt,
    needsReauth: quota.needsReauth ?? false,
  };
}

// ============================================================================
// Router factory
// ============================================================================

/**
 * Create the bar router with injected dependencies.
 *
 * Production usage: call without arguments (defaults resolve from real modules).
 * Test usage: pass mock implementations for each dep.
 */
export function createBarRouter(deps: BarRouterDeps): Router {
  const router = Router();

  /**
   * GET /summary[?refresh=true]
   *
   * Returns the menu-bar glance array for all CLIProxy accounts.
   *
   * Query params:
   *   refresh=true  — force-fresh from provider (debounced to once per 15s)
   */
  router.get('/summary', async (req: Request, res: Response): Promise<void> => {
    try {
      const wantsRefresh = req.query['refresh'] === 'true';

      // Determine effective refresh mode after applying debounce.
      // IMPORTANT: set lastForceFreshAt at decision time (before awaiting any
      // fetches) to prevent a read-modify-write race where two concurrent
      // refresh=true requests both pass the debounce check before either
      // records the timestamp.
      let doForceRefresh = false;
      if (wantsRefresh) {
        const sinceLastFresh = Date.now() - lastForceFreshAt;
        if (sinceLastFresh >= FORCE_FRESH_DEBOUNCE_MS) {
          doForceRefresh = true;
          lastForceFreshAt = Date.now(); // claim the window before any async work
        }
        // else: debounce active — fall through to cache path
      }

      // Cost side-load is bounded so a slow usage-snapshot read can't stall the
      // glance. (Health is per-account, derived from each quota result below —
      // no blocking system audit on the request path.)
      const details = await withTimeout(deps.loadCliproxyDetails(), SIDELOAD_TIMEOUT_MS);
      const costByAccount: Record<string, number> = details
        ? deps.getTodayCostByAccount(details)
        : {};

      // Flatten all accounts across providers
      const summary = deps.getAllAccountsSummary();
      const allAccounts: AccountInfo[] = Object.values(summary).flat();

      // Fix #11: compute which cost-keys are shared by >1 account so buildRow can
      // report null (unknowable) rather than the combined total for those rows.
      const costKeyCount = new Map<string, number>();
      for (const account of allAccounts) {
        const key = resolveCostKey(account);
        costKeyCount.set(key, (costKeyCount.get(key) ?? 0) + 1);
      }
      const sharedCostKeys = new Set<string>(
        Array.from(costKeyCount.entries())
          .filter(([, count]) => count > 1)
          .map(([key]) => key)
      );

      // Build every row synchronously from whatever is in cache right now. This
      // is the instant-paint fallback and the source of truth when the deadline
      // fires before live fetches finish.
      const cacheRows = (): BarSummaryRow[] => {
        const at = new Date().toISOString();
        return allAccounts.map((account) => {
          const cached = deps.getCachedQuota<QuotaResult>(account.provider, account.id);
          return buildRow(
            account,
            { quota: cached ?? null, cached: cached !== null, fetchedAt: at },
            costByAccount,
            sharedCostKeys
          );
        });
      };

      // Fetch quota in parallel with per-account error isolation. Each row is
      // bounded inside fetchAccountData; the whole gather is additionally raced
      // against REQUEST_DEADLINE_MS so the response NEVER hangs on a slow
      // provider — past the deadline we paint from cache and let background
      // fetches warm the next open.
      const CONCURRENCY_CAP = 5;
      const gather = (async (): Promise<BarSummaryRow[]> => {
        const rows: BarSummaryRow[] = [];
        for (let i = 0; i < allAccounts.length; i += CONCURRENCY_CAP) {
          const batch = allAccounts.slice(i, i + CONCURRENCY_CAP);
          const batchRows = await Promise.all(
            batch.map(async (account): Promise<BarSummaryRow> => {
              const fetchResult = await fetchAccountData(account, doForceRefresh, deps);
              return buildRow(account, fetchResult, costByAccount, sharedCostKeys);
            })
          );
          rows.push(...batchRows);
        }
        return rows;
      })();

      const deadline = new Promise<BarSummaryRow[]>((resolve) => {
        setTimeout(() => resolve(cacheRows()), REQUEST_DEADLINE_MS);
      });

      const rows = await Promise.race([gather, deadline]);

      // Native subscription rows (Claude Code + Codex) are side-loaded AFTER the
      // CLIProxy rows resolve, bounded so a slow/failed native fetch degrades to
      // [] rather than blocking or erroring the response.
      const getNative = deps.getNativeAccountRows ?? (async () => [] as BarSummaryRow[]);
      const nativeRows = (await withTimeout(getNative(), NATIVE_SIDELOAD_TIMEOUT_MS)) ?? [];

      res.json([...rows, ...nativeRows].map(serializeBarRow));
    } catch (err) {
      const e = err as Error;
      logger.error('bar.summary_failed', 'Failed to build bar summary payload', {
        refresh: req.query['refresh'] === 'true',
        err: { name: e.name, message: e.message },
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /analytics
   *
   * Rolls up the merged, multi-source usage (Claude Code, Codex, Droid, CLIProxy)
   * into today / 7-day / 30-day spend, a 30-day sparkline, top models, and a
   * per-surface breakdown. Reads the dashboard's stale-while-revalidate caches so
   * recent activity shows even when the CLIProxy snapshot is frozen by a restart.
   * Both loads are bounded so a slow read can't stall the menu; on miss the
   * windows degrade to empty rather than failing the payload.
   */
  router.get('/analytics', async (_req: Request, res: Response): Promise<void> => {
    try {
      const [daily, hourly] = await Promise.all([
        withTimeout(deps.loadDailyUsage(), SIDELOAD_TIMEOUT_MS).catch(() => [] as DailyUsage[]),
        withTimeout(deps.loadHourlyUsage(), SIDELOAD_TIMEOUT_MS).catch(() => [] as HourlyUsage[]),
      ]);
      const analytics = computeBarAnalyticsFromDaily(daily ?? [], hourly ?? [], new Date());
      res.json(analytics);
    } catch (err) {
      const e = err as Error;
      logger.error('bar.analytics_failed', 'Failed to compute bar analytics payload', {
        err: { name: e.name, message: e.message },
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

// ============================================================================
// Default production router (sync imports — matches all other route modules)
// ============================================================================

import { getAllAccountsSummary } from '../../cliproxy/accounts/query';
import {
  getCachedQuota,
  setCachedQuota,
  invalidateQuotaCache,
} from '../../cliproxy/quota/quota-response-cache';
import { fetchAccountQuota } from '../../cliproxy/quota/quota-fetcher';
import { getTodayCostByAccount } from '../usage/data-aggregator';
import { loadCliproxySnapshotDetails } from '../usage/cliproxy-snapshot-reader';
import { getCachedDailyData, getCachedHourlyData } from '../usage/aggregator';
import { getNativeAccountRows } from '../usage/native-quota-collector';

/** Production bar router — wired to real dependencies */
const barRouter: Router = createBarRouter({
  getAllAccountsSummary,
  getCachedQuota,
  setCachedQuota,
  invalidateQuotaCache,
  fetchAccountQuota,
  getTodayCostByAccount,
  loadCliproxyDetails: loadCliproxySnapshotDetails,
  loadDailyUsage: () => getCachedDailyData(),
  loadHourlyUsage: () => getCachedHourlyData(),
  getNativeAccountRows: () => getNativeAccountRows(),
});

export default barRouter;
