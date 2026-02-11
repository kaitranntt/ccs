/**
 * Quota Manager for Hybrid Auto+Manual Account Selection
 *
 * Provides pre-flight quota checking with caching, tier-based failover,
 * and cooldown tracking for exhausted accounts.
 *
 * Key features:
 * - 30-second in-memory cache for quota results
 * - Tier-priority failover (ultra > pro by default)
 * - Cooldown tracking for exhausted accounts
 * - Respects paused accounts from manual config
 * - Graceful degradation on API failures
 */

import { CLIProxyProvider } from './types';
import { QuotaResult, fetchAccountQuota } from './quota-fetcher';
import {
  getDefaultAccount,
  getProviderAccounts,
  isAccountPaused,
  setDefaultAccount,
  touchAccount,
  type AccountInfo,
} from './account-manager';
import { loadOrCreateUnifiedConfig } from '../config/unified-config-loader';
import type { RuntimeMonitorConfig } from '../config/unified-config-types';

// ============================================================================
// QUOTA CACHE (30-second TTL)
// ============================================================================

interface CacheEntry {
  result: QuotaResult;
  timestamp: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
const quotaCache = new Map<string, CacheEntry>();

// Request deduplication: track in-flight fetch promises to avoid parallel duplicate requests
const pendingFetches = new Map<string, Promise<QuotaResult>>();

function getCacheKey(provider: CLIProxyProvider, accountId: string): string {
  return `${provider}:${accountId}`;
}

/**
 * Get cached quota result if still valid
 */
export function getCachedQuota(provider: CLIProxyProvider, accountId: string): QuotaResult | null {
  const key = getCacheKey(provider, accountId);
  const entry = quotaCache.get(key);

  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    quotaCache.delete(key);
    return null;
  }

  return entry.result;
}

/**
 * Cache quota result
 */
export function setCachedQuota(
  provider: CLIProxyProvider,
  accountId: string,
  result: QuotaResult
): void {
  const key = getCacheKey(provider, accountId);
  quotaCache.set(key, { result, timestamp: Date.now() });
}

/**
 * Clear all cached quota results
 */
export function clearQuotaCache(): void {
  quotaCache.clear();
}

/**
 * Fetch quota with request deduplication
 * If a fetch for this account is already in progress, return the existing promise
 */
async function fetchQuotaWithDedup(
  provider: CLIProxyProvider,
  accountId: string,
  verbose = false
): Promise<QuotaResult> {
  const key = getCacheKey(provider, accountId);

  // Check if fetch already in progress
  const pending = pendingFetches.get(key);
  if (pending) {
    return pending;
  }

  // Start new fetch and track it
  const fetchPromise = fetchAccountQuota(provider, accountId, verbose)
    .then((result) => {
      setCachedQuota(provider, accountId, result);
      return result;
    })
    .catch((): QuotaResult => {
      return { success: false, models: [], lastUpdated: Date.now() };
    })
    .finally(() => {
      pendingFetches.delete(key);
    });

  pendingFetches.set(key, fetchPromise);
  return fetchPromise;
}

// ============================================================================
// COOLDOWN TRACKING
// ============================================================================

interface CooldownEntry {
  until: number; // timestamp when cooldown expires
}

const cooldownMap = new Map<string, CooldownEntry>();

/**
 * Check if account is on cooldown
 */
export function isOnCooldown(provider: CLIProxyProvider, accountId: string): boolean {
  const key = getCacheKey(provider, accountId);
  const entry = cooldownMap.get(key);

  if (!entry) return false;

  if (Date.now() > entry.until) {
    cooldownMap.delete(key);
    return false;
  }

  return true;
}

/**
 * Apply cooldown to an exhausted account
 */
export function applyCooldown(
  provider: CLIProxyProvider,
  accountId: string,
  minutes: number
): void {
  const key = getCacheKey(provider, accountId);
  cooldownMap.set(key, { until: Date.now() + minutes * 60 * 1000 });
}

/**
 * Clear cooldown for an account
 */
export function clearCooldown(provider: CLIProxyProvider, accountId: string): void {
  const key = getCacheKey(provider, accountId);
  cooldownMap.delete(key);
}

// ============================================================================
// PRE-FLIGHT CHECK
// ============================================================================

/**
 * Process items with limited concurrency to prevent connection burst
 * @param items - Items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Number of concurrent operations (default: 10)
 */
async function batchedMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 10
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Result of pre-flight quota check
 */
export interface PreflightResult {
  /** Whether to proceed with session */
  proceed: boolean;
  /** Account to use (may differ from original default) */
  accountId: string;
  /** If switched, the original account ID */
  switchedFrom?: string;
  /** Reason for switch or failure */
  reason?: string;
  /** Average quota percentage of selected account */
  quotaPercent?: number | null;
}

/**
 * Calculate average quota percentage from models
 */
function calculateAverageQuota(quota: QuotaResult): number | null {
  if (!quota.success || quota.models.length === 0) {
    return null; // No data available
  }
  const total = quota.models.reduce((sum, m) => sum + m.percentage, 0);
  return total / quota.models.length;
}

/**
 * Find healthy account with remaining quota
 * Respects tier priority and skips paused/cooldown accounts
 */
export async function findHealthyAccount(
  provider: CLIProxyProvider,
  exclude: string[]
): Promise<{ id: string; tier: string; lastQuota: number } | null> {
  const config = loadOrCreateUnifiedConfig();
  const tierPriority = config.quota_management?.auto?.tier_priority ?? ['ultra', 'pro', 'free'];
  const threshold = config.quota_management?.auto?.exhaustion_threshold ?? 5;

  const accounts = getProviderAccounts(provider);

  // Filter available accounts
  const available = accounts.filter(
    (a) =>
      !exclude.includes(a.id) && !isAccountPaused(provider, a.id) && !isOnCooldown(provider, a.id)
  );

  if (available.length === 0) return null;

  // Fetch quota for each available account (batched to prevent connection burst)
  const withQuotas = await batchedMap(
    available,
    async (account) => {
      let quota = getCachedQuota(provider, account.id);
      if (!quota) {
        quota = await fetchQuotaWithDedup(provider, account.id);
      }

      const avgQuota = calculateAverageQuota(quota) ?? 0;

      return {
        id: account.id,
        tier: account.tier || 'unknown',
        lastQuota: avgQuota,
      };
    },
    10
  );

  // Filter by threshold
  const healthy = withQuotas.filter((a) => a.lastQuota >= threshold);
  if (healthy.length === 0) return null;

  // Sort by tier priority then quota descending
  healthy.sort((a, b) => {
    const tierA = tierPriority.indexOf(a.tier);
    const tierB = tierPriority.indexOf(b.tier);
    const tierOrderA = tierA === -1 ? 999 : tierA;
    const tierOrderB = tierB === -1 ? 999 : tierB;

    if (tierOrderA !== tierOrderB) return tierOrderA - tierOrderB;
    return b.lastQuota - a.lastQuota;
  });

  return healthy[0];
}

/**
 * Find and switch to a healthy account
 */
async function findAndSwitch(
  provider: CLIProxyProvider,
  excludeAccountId: string,
  reason: string
): Promise<PreflightResult> {
  const alternative = await findHealthyAccount(provider, [excludeAccountId]);

  if (!alternative) {
    // No alternatives: use original anyway (graceful degradation)
    return {
      proceed: true,
      accountId: excludeAccountId,
      reason: `${reason}, no alternatives available`,
    };
  }

  // Switch default
  setDefaultAccount(provider, alternative.id);
  touchAccount(provider, alternative.id);

  return {
    proceed: true,
    accountId: alternative.id,
    switchedFrom: excludeAccountId,
    reason,
    quotaPercent: alternative.lastQuota,
  };
}

/**
 * Perform pre-flight quota check before session start
 *
 * Checks if default account has sufficient quota, auto-switches if needed.
 * Respects paused accounts, tier priority, and cooldown settings.
 *
 * @param provider - CLIProxy provider (only 'agy' supports quota)
 * @returns PreflightResult with account to use and any switch info
 */
export async function preflightCheck(provider: CLIProxyProvider): Promise<PreflightResult> {
  // Only Antigravity supports quota checking
  if (provider !== 'agy') {
    const defaultAccount = getDefaultAccount(provider);
    return { proceed: true, accountId: defaultAccount?.id || '' };
  }

  const config = loadOrCreateUnifiedConfig();
  const quotaConfig = config.quota_management;

  // Skip if preflight disabled or mode is manual
  if (!quotaConfig?.auto?.preflight_check || quotaConfig?.mode === 'manual') {
    const defaultAccount = getDefaultAccount(provider);
    return { proceed: true, accountId: defaultAccount?.id || '' };
  }

  const defaultAccount = getDefaultAccount(provider);
  if (!defaultAccount) {
    return { proceed: false, accountId: '', reason: 'No accounts configured' };
  }

  // Check forced_default override (manual mode)
  const forcedDefault = quotaConfig.manual?.forced_default;
  if (forcedDefault) {
    const forcedAccount = getProviderAccounts(provider).find((a) => a.id === forcedDefault);
    if (forcedAccount) {
      return { proceed: true, accountId: forcedAccount.id, reason: 'Forced default override' };
    }
  }

  // Check if default is paused
  if (isAccountPaused(provider, defaultAccount.id)) {
    return await findAndSwitch(provider, defaultAccount.id, 'Default account is paused');
  }

  // Check cooldown
  if (isOnCooldown(provider, defaultAccount.id)) {
    return await findAndSwitch(provider, defaultAccount.id, 'Default account on cooldown');
  }

  // Check quota (with cache and deduplication)
  let quota = getCachedQuota(provider, defaultAccount.id);
  if (!quota) {
    quota = await fetchQuotaWithDedup(provider, defaultAccount.id);
  }

  // Calculate average quota
  const avgQuota = calculateAverageQuota(quota) ?? 0;
  const threshold = quotaConfig.auto?.exhaustion_threshold ?? 5;

  if (avgQuota < threshold) {
    // Apply cooldown to exhausted account
    applyCooldown(provider, defaultAccount.id, quotaConfig.auto?.cooldown_minutes ?? 5);
    return await findAndSwitch(
      provider,
      defaultAccount.id,
      `Quota exhausted (${avgQuota.toFixed(1)}%)`
    );
  }

  return {
    proceed: true,
    accountId: defaultAccount.id,
    quotaPercent: calculateAverageQuota(quota),
  };
}

/**
 * Get quota status for all accounts of a provider
 * Used by CLI status command
 */
export async function getQuotaStatus(provider: CLIProxyProvider): Promise<{
  accounts: Array<{
    account: AccountInfo;
    quota: number | null;
    paused: boolean;
    onCooldown: boolean;
    isDefault: boolean;
  }>;
}> {
  const accounts = getProviderAccounts(provider);
  const defaultAccount = getDefaultAccount(provider);

  const results = await Promise.all(
    accounts.map(async (account) => {
      let quota = getCachedQuota(provider, account.id);
      if (!quota && provider === 'agy') {
        quota = await fetchQuotaWithDedup(provider, account.id);
      }

      const avgQuota = quota ? calculateAverageQuota(quota) : null;

      return {
        account,
        quota: avgQuota,
        paused: isAccountPaused(provider, account.id),
        onCooldown: isOnCooldown(provider, account.id),
        isDefault: defaultAccount?.id === account.id,
      };
    })
  );

  return { accounts: results };
}

// ============================================================================
// RUNTIME QUOTA MONITOR (adaptive polling during active sessions)
// ============================================================================

/** Active monitor timer (null = not running) */
let monitorTimer: ReturnType<typeof setTimeout> | null = null;

/** Tracks if warning was shown this session (avoid spam) */
let hasWarnedThisSession = false;

/** Guards against in-flight poll callbacks running after stop */
let monitorStopped = false;

/**
 * Schedule next quota poll with adaptive interval.
 * Uses setTimeout chain (not setInterval) for dynamic interval switching.
 */
function scheduleNextPoll(
  provider: CLIProxyProvider,
  accountId: string,
  monitorConfig: RuntimeMonitorConfig,
  intervalMs: number
): void {
  monitorTimer = setTimeout(async () => {
    // Guard: skip if monitor was stopped while this callback was queued
    if (monitorStopped) return;

    try {
      const quota = await fetchQuotaWithDedup(provider, accountId);
      if (monitorStopped) return; // Re-check after async fetch
      const avgQuota = calculateAverageQuota(quota) ?? 100;

      if (avgQuota <= monitorConfig.exhaustion_threshold) {
        // EXHAUSTED: cooldown + switch default + stop monitoring.
        // NOTE: Monitor stops here intentionally. The current session continues
        // on the exhausted account (can't hot-swap mid-session). The switched
        // default only takes effect on next session start via preflightCheck().
        const { handleQuotaExhaustion } = await import('./account-safety');
        await handleQuotaExhaustion(provider, accountId, monitorConfig.cooldown_minutes);
        monitorTimer = null;
        return; // Stop polling
      }

      if (avgQuota <= monitorConfig.warn_threshold) {
        // WARNING: switch to critical interval, warn once
        if (!hasWarnedThisSession) {
          const { writeQuotaWarning } = await import('./account-safety');
          writeQuotaWarning(accountId, avgQuota);
          hasWarnedThisSession = true;
        }
        scheduleNextPoll(
          provider,
          accountId,
          monitorConfig,
          monitorConfig.critical_interval_seconds * 1000
        );
        return;
      }

      // HEALTHY: keep normal interval
      scheduleNextPoll(
        provider,
        accountId,
        monitorConfig,
        monitorConfig.normal_interval_seconds * 1000
      );
    } catch {
      // API failure: silently reschedule at same interval
      scheduleNextPoll(provider, accountId, monitorConfig, intervalMs);
    }
  }, intervalMs);

  // Prevent monitor from keeping Node.js process alive
  if (monitorTimer && typeof monitorTimer === 'object' && 'unref' in monitorTimer) {
    monitorTimer.unref();
  }
}

/**
 * Start adaptive quota monitor for an active session.
 * Polls at normal_interval (300s) when healthy, switches to
 * critical_interval (60s) when quota hits warn_threshold (20%).
 * Auto-stops on exhaustion or when stopQuotaMonitor() is called.
 *
 * Only monitors 'agy' provider (only one with quota API).
 * No-op for other providers, manual mode, or if disabled in config.
 */
export function startQuotaMonitor(provider: CLIProxyProvider, accountId: string): void {
  // Only Antigravity supports quota
  if (provider !== 'agy') return;

  // Prevent duplicate monitors
  if (monitorTimer) return;

  const config = loadOrCreateUnifiedConfig();
  const quotaConfig = config.quota_management;

  // Skip if config missing (shouldn't happen with defaults)
  if (!quotaConfig) return;

  // Skip if manual mode or runtime monitor disabled
  if (quotaConfig.mode === 'manual') return;
  if (!quotaConfig.runtime_monitor?.enabled) return;

  // Validate thresholds: warn must be > exhaustion to avoid immediate exhaustion on warning
  const monitorConfig = quotaConfig.runtime_monitor;
  if (monitorConfig.warn_threshold <= monitorConfig.exhaustion_threshold) {
    return; // Invalid config — skip monitoring silently (logged at config level)
  }

  hasWarnedThisSession = false;
  monitorStopped = false;

  // Start first poll at normal interval
  scheduleNextPoll(
    provider,
    accountId,
    quotaConfig.runtime_monitor,
    quotaConfig.runtime_monitor.normal_interval_seconds * 1000
  );
}

/**
 * Stop the runtime quota monitor. Safe to call multiple times.
 */
export function stopQuotaMonitor(): void {
  monitorStopped = true;
  if (monitorTimer) {
    clearTimeout(monitorTimer);
    monitorTimer = null;
  }
  hasWarnedThisSession = false;
}
