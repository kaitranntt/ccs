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

import { CLIProxyProvider } from '../types';
import { QuotaResult, fetchAccountQuota } from './quota-fetcher';
import { fetchClaudeQuota } from './quota-fetcher-claude';
import { fetchCodexQuota } from './quota-fetcher-codex';
import { fetchGeminiCliQuota } from './quota-fetcher-gemini-cli';
import { fetchGhcpQuota } from './quota-fetcher-ghcp';
import type {
  ClaudeQuotaResult,
  CodexQuotaResult,
  GeminiCliQuotaResult,
  GhcpQuotaResult,
} from './quota-types';
import {
  getDefaultAccount,
  getProviderAccounts,
  isAccountPaused,
  setDefaultAccount,
  touchAccount,
  type AccountInfo,
} from '../accounts/account-manager';

import type { RuntimeMonitorConfig } from '../../config/unified-config-types';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';

export type ManagedQuotaProvider = 'agy' | 'claude' | 'codex' | 'gemini' | 'ghcp';
type ManagedQuotaResult =
  | QuotaResult
  | ClaudeQuotaResult
  | CodexQuotaResult
  | GeminiCliQuotaResult
  | GhcpQuotaResult;

export const MANAGED_QUOTA_PROVIDERS: readonly ManagedQuotaProvider[] = [
  'agy',
  'claude',
  'codex',
  'gemini',
  'ghcp',
];

export function isManagedQuotaProvider(
  provider: CLIProxyProvider
): provider is ManagedQuotaProvider {
  return MANAGED_QUOTA_PROVIDERS.includes(provider as ManagedQuotaProvider);
}

// ============================================================================
// QUOTA CACHE (30-second TTL)
// ============================================================================

interface CacheEntry {
  result: ManagedQuotaResult;
  timestamp: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
const quotaCache = new Map<string, CacheEntry>();

// Request deduplication: track in-flight fetch promises to avoid parallel duplicate requests
const pendingFetches = new Map<string, Promise<ManagedQuotaResult>>();

function getCacheKey(provider: CLIProxyProvider, accountId: string): string {
  return `${provider}:${accountId}`;
}

/**
 * Get cached quota result if still valid
 */
export function getCachedQuota(
  provider: CLIProxyProvider,
  accountId: string
): ManagedQuotaResult | null {
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
  result: ManagedQuotaResult
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
  provider: ManagedQuotaProvider,
  accountId: string,
  verbose = false
): Promise<ManagedQuotaResult> {
  const key = getCacheKey(provider, accountId);

  // Check if fetch already in progress
  const pending = pendingFetches.get(key);
  if (pending) {
    return pending;
  }

  // Start new fetch and track it
  const fetchPromise = fetchManagedQuota(provider, accountId, verbose)
    .then((result) => {
      setCachedQuota(provider, accountId, result);
      return result;
    })
    .catch((): ManagedQuotaResult => buildFailedQuotaResult(provider, accountId))
    .finally(() => {
      pendingFetches.delete(key);
    });

  pendingFetches.set(key, fetchPromise);
  return fetchPromise;
}

async function fetchManagedQuota(
  provider: ManagedQuotaProvider,
  accountId: string,
  verbose: boolean
): Promise<ManagedQuotaResult> {
  switch (provider) {
    case 'agy':
      return fetchAccountQuota(provider, accountId, verbose);
    case 'claude':
      return fetchClaudeQuota(accountId, verbose);
    case 'codex':
      return fetchCodexQuota(accountId, verbose);
    case 'gemini':
      return fetchGeminiCliQuota(accountId, verbose);
    case 'ghcp':
      return fetchGhcpQuota(accountId, verbose);
  }
}

function buildFailedGhcpSnapshot(): GhcpQuotaResult['snapshots']['chat'] {
  return {
    reported: false,
    entitlement: 0,
    remaining: 0,
    used: 0,
    percentRemaining: 0,
    percentUsed: 0,
    unlimited: false,
    overageCount: 0,
    overagePermitted: false,
    quotaId: null,
  };
}

function buildFailedQuotaResult(
  provider: ManagedQuotaProvider,
  accountId: string
): ManagedQuotaResult {
  switch (provider) {
    case 'agy':
      return { success: false, models: [], lastUpdated: Date.now(), accountId };
    case 'claude':
      return {
        success: false,
        windows: [],
        coreUsage: { fiveHour: null, weekly: null },
        lastUpdated: Date.now(),
        error: 'Failed to fetch Claude quota',
        accountId,
      };
    case 'codex':
      return {
        success: false,
        windows: [],
        coreUsage: { fiveHour: null, weekly: null },
        planType: null,
        lastUpdated: Date.now(),
        error: 'Failed to fetch Codex quota',
        accountId,
      };
    case 'gemini':
      return {
        success: false,
        buckets: [],
        projectId: null,
        lastUpdated: Date.now(),
        error: 'Failed to fetch Gemini quota',
        accountId,
      };
    case 'ghcp':
      return {
        success: false,
        planType: null,
        quotaResetDate: null,
        snapshots: {
          premiumInteractions: buildFailedGhcpSnapshot(),
          chat: buildFailedGhcpSnapshot(),
          completions: buildFailedGhcpSnapshot(),
        },
        lastUpdated: Date.now(),
        error: 'Failed to fetch GitHub Copilot quota',
        accountId,
      };
  }
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
  concurrency = 10,
  delayMs = 100
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    if (i > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
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

function calculateAgyQuotaPercent(quota: QuotaResult): number | null {
  if (!quota.success || quota.models.length === 0) return null;
  const total = quota.models.reduce((sum, model) => sum + model.percentage, 0);
  return total / quota.models.length;
}

function calculateClaudeQuotaPercent(quota: ClaudeQuotaResult): number | null {
  if (!quota.success) return null;

  const coreWindows = [quota.coreUsage?.fiveHour, quota.coreUsage?.weekly].filter(
    (window): window is NonNullable<typeof window> => !!window
  );
  if (coreWindows.length > 0) {
    return Math.min(...coreWindows.map((window) => window.remainingPercent));
  }

  const usageWindows = quota.windows.filter((window) => window.rateLimitType !== 'overage');
  if (usageWindows.length > 0) {
    return Math.min(...usageWindows.map((window) => window.remainingPercent));
  }

  return null;
}

function calculateCodexQuotaPercent(quota: CodexQuotaResult): number | null {
  if (!quota.success) return null;

  const coreWindows = [quota.coreUsage?.fiveHour, quota.coreUsage?.weekly].filter(
    (window): window is NonNullable<typeof window> => !!window
  );
  if (coreWindows.length > 0) {
    return Math.min(...coreWindows.map((window) => window.remainingPercent));
  }

  const usageWindows = quota.windows.filter((window) => window.category !== 'code-review');
  if (usageWindows.length > 0) {
    return Math.min(...usageWindows.map((window) => window.remainingPercent));
  }

  return null;
}

function calculateGeminiQuotaPercent(quota: GeminiCliQuotaResult): number | null {
  if (!quota.success || quota.buckets.length === 0) return null;
  return Math.min(...quota.buckets.map((bucket) => bucket.remainingPercent));
}

function calculateGhcpQuotaPercent(quota: GhcpQuotaResult): number | null {
  if (!quota.success) return null;
  const percentages = [
    quota.snapshots.premiumInteractions,
    quota.snapshots.chat,
    quota.snapshots.completions,
  ]
    .filter((snapshot) => snapshot.reported !== false)
    .map((snapshot) => (snapshot.unlimited ? 100 : snapshot.percentRemaining))
    .filter((percentage) => Number.isFinite(percentage));

  return percentages.length > 0 ? Math.min(...percentages) : null;
}

/**
 * Calculate normalized quota percentage for managed providers.
 */
function calculateQuotaPercent(
  provider: ManagedQuotaProvider,
  quota: ManagedQuotaResult
): number | null {
  switch (provider) {
    case 'agy':
      return calculateAgyQuotaPercent(quota as QuotaResult);
    case 'claude':
      return calculateClaudeQuotaPercent(quota as ClaudeQuotaResult);
    case 'codex':
      return calculateCodexQuotaPercent(quota as CodexQuotaResult);
    case 'gemini':
      return calculateGeminiQuotaPercent(quota as GeminiCliQuotaResult);
    case 'ghcp':
      return calculateGhcpQuotaPercent(quota as GhcpQuotaResult);
  }
}

/**
 * Find healthy account with remaining quota
 * Respects tier priority and skips paused/cooldown accounts
 */
export async function findHealthyAccount(
  provider: CLIProxyProvider,
  exclude: string[]
): Promise<{ id: string; tier: string; lastQuota: number | null } | null> {
  if (!isManagedQuotaProvider(provider)) {
    return null;
  }

  const { restoreExpiredQuotaPauses } = await import('../accounts/account-safety');
  restoreExpiredQuotaPauses();

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

      const avgQuota = calculateQuotaPercent(provider, quota);

      return {
        id: account.id,
        tier: account.tier || 'unknown',
        lastQuota: avgQuota,
      };
    },
    10
  );

  // Prefer accounts with known healthy quota. If all remaining accounts have unavailable
  // quota data, fall back to those unknown-but-usable accounts instead of treating them as 0%.
  const healthy = withQuotas.filter((a) => a.lastQuota !== null && a.lastQuota >= threshold);
  const selectable = healthy.length > 0 ? healthy : withQuotas.filter((a) => a.lastQuota === null);
  if (selectable.length === 0) return null;

  // Sort by tier priority then quota descending
  selectable.sort((a, b) => {
    const tierA = tierPriority.indexOf(a.tier);
    const tierB = tierPriority.indexOf(b.tier);
    const tierOrderA = tierA === -1 ? 999 : tierA;
    const tierOrderB = tierB === -1 ? 999 : tierB;

    if (tierOrderA !== tierOrderB) return tierOrderA - tierOrderB;
    return (b.lastQuota ?? -1) - (a.lastQuota ?? -1);
  });

  return selectable[0];
}

/**
 * Find and switch to a healthy account
 */
async function findAndSwitch(
  provider: ManagedQuotaProvider,
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
 * @param provider - CLIProxy provider
 * @returns PreflightResult with account to use and any switch info
 */
export async function preflightCheck(provider: CLIProxyProvider): Promise<PreflightResult> {
  // Only providers with quota-based account rotation need preflight checks.
  if (!isManagedQuotaProvider(provider)) {
    const defaultAccount = getDefaultAccount(provider);
    return { proceed: true, accountId: defaultAccount?.id || '' };
  }

  const { pauseAccountForQuotaCooldown, restoreExpiredQuotaPauses } = await import(
    '../accounts/account-safety'
  );
  restoreExpiredQuotaPauses();

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

  // Calculate normalized quota percentage.
  // Null means quota data is unavailable (e.g. provider does not expose limits for this account).
  const quotaPercent = calculateQuotaPercent(provider, quota);
  if (quotaPercent === null) {
    return {
      proceed: true,
      accountId: defaultAccount.id,
      reason: 'Quota unavailable, using default account',
    };
  }

  const avgQuota = quotaPercent;
  const threshold = quotaConfig.auto?.exhaustion_threshold ?? 5;

  if (avgQuota < threshold) {
    applyCooldown(provider, defaultAccount.id, quotaConfig.auto?.cooldown_minutes ?? 5);

    const alternative = await findHealthyAccount(provider, [defaultAccount.id]);
    if (!alternative) {
      return {
        proceed: true,
        accountId: defaultAccount.id,
        reason: `Quota exhausted (${avgQuota.toFixed(1)}%), no alternatives available`,
        quotaPercent,
      };
    }

    if (alternative.lastQuota !== null && alternative.lastQuota >= threshold) {
      pauseAccountForQuotaCooldown(
        provider,
        defaultAccount.id,
        quotaConfig.auto?.cooldown_minutes ?? 5
      );
    }
    setDefaultAccount(provider, alternative.id);
    touchAccount(provider, alternative.id);
    return {
      proceed: true,
      accountId: alternative.id,
      switchedFrom: defaultAccount.id,
      reason: `Quota exhausted (${avgQuota.toFixed(1)}%)`,
      quotaPercent: alternative.lastQuota,
    };
  }

  return {
    proceed: true,
    accountId: defaultAccount.id,
    quotaPercent,
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
  const { restoreExpiredQuotaPauses } = await import('../accounts/account-safety');
  restoreExpiredQuotaPauses();

  const accounts = getProviderAccounts(provider);
  const defaultAccount = getDefaultAccount(provider);

  const results = await Promise.all(
    accounts.map(async (account) => {
      const managedProvider = isManagedQuotaProvider(provider) ? provider : null;
      let quota = getCachedQuota(provider, account.id);
      if (!quota && managedProvider) {
        quota = await fetchQuotaWithDedup(managedProvider, account.id);
      }

      const avgQuota =
        quota && managedProvider ? calculateQuotaPercent(managedProvider, quota) : null;

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

interface RuntimeMonitorState {
  timer: ReturnType<typeof setTimeout> | null;
  hasWarnedThisSession: boolean;
  stopped: boolean;
}

/** Active monitor timers keyed by provider/account. */
const activeRuntimeMonitors = new Map<string, RuntimeMonitorState>();

/**
 * Schedule next quota poll with adaptive interval.
 * Uses setTimeout chain (not setInterval) for dynamic interval switching.
 */
function scheduleNextPoll(
  provider: ManagedQuotaProvider,
  accountId: string,
  monitorConfig: RuntimeMonitorConfig,
  intervalMs: number,
  state: RuntimeMonitorState
): void {
  const monitorKey = getCacheKey(provider, accountId);
  state.timer = setTimeout(async () => {
    // Guard: skip if monitor was stopped while this callback was queued
    if (state.stopped || activeRuntimeMonitors.get(monitorKey) !== state) return;

    try {
      const quota = await fetchQuotaWithDedup(provider, accountId);
      if (state.stopped || activeRuntimeMonitors.get(monitorKey) !== state) return;
      const avgQuota = calculateQuotaPercent(provider, quota);

      if (avgQuota === null) {
        // Quota data unavailable: keep polling, but do not treat unknown as healthy/exhausted.
        scheduleNextPoll(
          provider,
          accountId,
          monitorConfig,
          monitorConfig.normal_interval_seconds * 1000,
          state
        );
        return;
      }

      if (avgQuota <= monitorConfig.exhaustion_threshold) {
        // EXHAUSTED: cooldown + switch default + stop monitoring.
        // NOTE: Monitor stops here intentionally. The current session continues
        // on the exhausted account (can't hot-swap mid-session). The switched
        // default only takes effect on next session start via preflightCheck().
        const { handleQuotaExhaustion } = await import('../accounts/account-safety');
        await handleQuotaExhaustion(provider, accountId, monitorConfig.cooldown_minutes);
        state.stopped = true;
        state.timer = null;
        activeRuntimeMonitors.delete(monitorKey);
        return; // Stop polling
      }

      if (avgQuota <= monitorConfig.warn_threshold) {
        // WARNING: switch to critical interval, warn once
        if (!state.hasWarnedThisSession) {
          const { writeQuotaWarning } = await import('../accounts/account-safety');
          writeQuotaWarning(accountId, avgQuota);
          state.hasWarnedThisSession = true;
        }
        scheduleNextPoll(
          provider,
          accountId,
          monitorConfig,
          monitorConfig.critical_interval_seconds * 1000,
          state
        );
        return;
      }

      // HEALTHY: keep normal interval
      scheduleNextPoll(
        provider,
        accountId,
        monitorConfig,
        monitorConfig.normal_interval_seconds * 1000,
        state
      );
    } catch {
      // API failure: silently reschedule at same interval
      if (!state.stopped && activeRuntimeMonitors.get(monitorKey) === state) {
        scheduleNextPoll(provider, accountId, monitorConfig, intervalMs, state);
      }
    }
  }, intervalMs);

  // Prevent monitor from keeping Node.js process alive
  if (state.timer && typeof state.timer === 'object' && 'unref' in state.timer) {
    state.timer.unref();
  }
}

/**
 * Start adaptive quota monitor for an active session.
 * Polls at normal_interval (300s) when healthy, switches to
 * critical_interval (60s) when quota hits warn_threshold (20%).
 * Auto-stops on exhaustion or when stopQuotaMonitor() is called.
 *
 * Only monitors providers with quota-based account rotation.
 * No-op for other providers, manual mode, or if disabled in config.
 */
export function startQuotaMonitor(provider: CLIProxyProvider, accountId: string): void {
  // Only managed providers support runtime quota monitoring.
  if (!isManagedQuotaProvider(provider)) return;

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

  const monitorKey = getCacheKey(provider, accountId);
  if (activeRuntimeMonitors.has(monitorKey)) return;

  const state: RuntimeMonitorState = {
    timer: null,
    hasWarnedThisSession: false,
    stopped: false,
  };
  activeRuntimeMonitors.set(monitorKey, state);

  // Start first poll at normal interval
  scheduleNextPoll(
    provider,
    accountId,
    quotaConfig.runtime_monitor,
    quotaConfig.runtime_monitor.normal_interval_seconds * 1000,
    state
  );
}

/**
 * Stop the runtime quota monitor. Safe to call multiple times.
 */
export function stopQuotaMonitor(): void {
  for (const state of activeRuntimeMonitors.values()) {
    state.stopped = true;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }
  activeRuntimeMonitors.clear();
}
