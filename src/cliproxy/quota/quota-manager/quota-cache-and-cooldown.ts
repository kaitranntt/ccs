/**
 * Quota Cache, Request Deduplication, Cooldown Tracking & Percentage Calculation
 */

import { CLIProxyProvider } from '../../types';
import { QuotaResult, fetchAccountQuota } from '../quota-fetcher';
import { fetchClaudeQuota, buildClaudeCoreUsageSummary } from '../quota-fetcher-claude';
import { fetchCodexQuota } from '../quota-fetcher-codex';
import { fetchGeminiCliQuota } from '../quota-fetcher-gemini-cli';
import { fetchGhcpQuota } from '../quota-fetcher-ghcp';
import type {
  ClaudeQuotaResult,
  CodexQuotaResult,
  GeminiCliQuotaResult,
  GhcpQuotaResult,
} from '../quota-types';

export type ManagedQuotaProvider = 'agy' | 'claude' | 'codex' | 'gemini' | 'ghcp';
export type ManagedQuotaResult =
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

export interface CacheEntry {
  result: ManagedQuotaResult;
  timestamp: number;
}

export interface CooldownEntry {
  until: number;
}

export interface RuntimeMonitorState {
  timer: ReturnType<typeof setTimeout> | null;
  hasWarnedThisSession: boolean;
  stopped: boolean;
}

export interface QuotaManagerState {
  quotaCache: Map<string, CacheEntry>;
  pendingFetches: Map<string, Promise<ManagedQuotaResult>>;
  cooldownMap: Map<string, CooldownEntry>;
  activeRuntimeMonitors: Map<string, RuntimeMonitorState>;
}

export function createQuotaManagerState(): QuotaManagerState {
  return {
    quotaCache: new Map<string, CacheEntry>(),
    pendingFetches: new Map<string, Promise<ManagedQuotaResult>>(),
    cooldownMap: new Map<string, CooldownEntry>(),
    activeRuntimeMonitors: new Map<string, RuntimeMonitorState>(),
  };
}

const CACHE_TTL_MS = 30_000;

export function getCacheKey(provider: CLIProxyProvider, accountId: string): string {
  return `${provider}:${accountId}`;
}

export function getCachedQuotaFromState(
  state: QuotaManagerState,
  provider: CLIProxyProvider,
  accountId: string
): ManagedQuotaResult | null {
  const key = getCacheKey(provider, accountId);
  const entry = state.quotaCache.get(key);

  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    state.quotaCache.delete(key);
    return null;
  }

  return entry.result;
}

export function setCachedQuotaInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider,
  accountId: string,
  result: ManagedQuotaResult
): void {
  const key = getCacheKey(provider, accountId);
  state.quotaCache.set(key, { result, timestamp: Date.now() });
}

export function clearQuotaCacheInState(state: QuotaManagerState): void {
  state.quotaCache.clear();
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

export async function fetchQuotaWithDedupInState(
  state: QuotaManagerState,
  provider: ManagedQuotaProvider,
  accountId: string,
  verbose = false
): Promise<ManagedQuotaResult> {
  const key = getCacheKey(provider, accountId);
  const pending = state.pendingFetches.get(key);
  if (pending) {
    return pending;
  }

  const fetchPromise = fetchManagedQuota(provider, accountId, verbose)
    .then((result) => {
      setCachedQuotaInState(state, provider, accountId, result);
      return result;
    })
    .catch((): ManagedQuotaResult => buildFailedQuotaResult(provider, accountId))
    .finally(() => {
      state.pendingFetches.delete(key);
    });

  state.pendingFetches.set(key, fetchPromise);
  return fetchPromise;
}

export function isOnCooldownInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider,
  accountId: string
): boolean {
  const key = getCacheKey(provider, accountId);
  const entry = state.cooldownMap.get(key);

  if (!entry) return false;

  if (Date.now() > entry.until) {
    state.cooldownMap.delete(key);
    return false;
  }

  return true;
}

export function getCooldownUntilInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider,
  accountId: string
): number | undefined {
  const key = getCacheKey(provider, accountId);
  const entry = state.cooldownMap.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.until) {
    state.cooldownMap.delete(key);
    return undefined;
  }
  return entry.until;
}

export function applyCooldownInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider,
  accountId: string,
  minutes: number
): void {
  const key = getCacheKey(provider, accountId);
  state.cooldownMap.set(key, { until: Date.now() + minutes * 60 * 1000 });
}

export function clearCooldownInState(
  state: QuotaManagerState,
  provider: CLIProxyProvider,
  accountId: string
): void {
  const key = getCacheKey(provider, accountId);
  state.cooldownMap.delete(key);
}

export async function batchedMap<T, R>(
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

function calculateAgyQuotaPercent(quota: QuotaResult): number | null {
  if (!quota.success || quota.models.length === 0) return null;
  const total = quota.models.reduce((sum, model) => sum + model.percentage, 0);
  return total / quota.models.length;
}

function calculateClaudeQuotaPercent(quota: ClaudeQuotaResult): number | null {
  if (!quota.success) return null;

  const core = buildClaudeCoreUsageSummary(quota.windows);
  const windows = [core.fiveHour, core.weekly].filter(
    (window): window is NonNullable<typeof window> => !!window
  );
  return windows.length ? Math.min(...windows.map((window) => window.remainingPercent)) : null;
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

export function calculateQuotaPercent(
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
