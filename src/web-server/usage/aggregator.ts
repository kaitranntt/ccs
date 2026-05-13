/**
 * Usage Aggregator Service
 *
 * Handles multi-instance usage data aggregation and caching.
 * Combines data from default Claude config and all CCS instances.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  aggregateDailyUsage,
  aggregateHourlyUsage,
  aggregateMonthlyUsage,
  aggregateSessionUsage,
  loadAllUsageData,
} from './data-aggregator';
import type { DailyUsage, HourlyUsage, MonthlyUsage, SessionUsage } from './types';
import {
  readDiskCache,
  writeDiskCache,
  isDiskCacheFresh,
  isDiskCacheStale,
  clearDiskCache,
  getCacheAge,
} from './disk-cache';
import { ok, info, fail } from '../../utils/ui';

import { getClaudeConfigDir, getDefaultClaudeConfigDir } from '../../utils/claude-config-path';
import {
  loadCachedCliproxyData,
  startCliproxySync,
  stopCliproxySync,
  syncCliproxyUsage,
} from './cliproxy-usage-syncer';
import { scanCodexNativeUsageEntries } from './codex-native-usage-collector';
import { scanDroidNativeUsageEntries } from './droid-native-usage-collector';
import { startModelsDevRegistryRefresh } from '../models-dev/registry-cache';
import {
  coalesceLegacyProviderlessBreakdowns,
  getModelsUsed,
  getProviderModelKey,
} from './model-identity';
import { getCcsDir } from '../../config/config-loader-facade';
import { listAccountInstancePaths } from '../../management/instance-directory';

// ============================================================================
// Multi-Instance Support - Aggregate usage from CCS profiles
// ============================================================================

/** Path to CCS instances directory */
function getCcsInstancesDir() {
  return path.join(getCcsDir(), 'instances');
}

function isPathWithinDir(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getDefaultProjectsDirForAnalytics(): string {
  const activeClaudeConfigDir = getClaudeConfigDir();
  const instancesDir = getCcsInstancesDir();
  const claudeConfigDir = isPathWithinDir(activeClaudeConfigDir, instancesDir)
    ? getDefaultClaudeConfigDir()
    : activeClaudeConfigDir;

  return path.join(claudeConfigDir, 'projects');
}

/**
 * Get list of CCS instance paths that have usage data
 * Only returns instances with existing projects/ directory
 */
function getInstancePaths(): string[] {
  const instancesDir = getCcsInstancesDir();
  if (!fs.existsSync(instancesDir)) {
    return [];
  }

  try {
    return listAccountInstancePaths(instancesDir).filter((instancePath) => {
      // Only include instances that have a projects directory
      const projectsPath = path.join(instancePath, 'projects');
      return fs.existsSync(projectsPath);
    });
  } catch {
    console.error(fail('Failed to read CCS instances directory'));
    return [];
  }
}

/**
 * Load usage data from a specific instance
 * Uses custom JSONL parser with instance's projects directory
 */
async function loadInstanceData(instancePath: string): Promise<{
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
  session: SessionUsage[];
}> {
  try {
    const projectsDir = path.join(instancePath, 'projects');
    const result = await loadAllUsageData({ projectsDir });
    return result;
  } catch (_err) {
    // Instance may have no usage data - that's OK
    const instanceName = path.basename(instancePath);
    console.log(info(`No usage data in instance: ${instanceName}`));
    return { daily: [], hourly: [], monthly: [], session: [] };
  }
}

function getHourlyRequestCount(hour: HourlyUsage): number {
  return hour.requestCount ?? hour.modelBreakdowns.length;
}

function finalizeDailyUsage(day: DailyUsage): DailyUsage {
  const modelBreakdowns = coalesceLegacyProviderlessBreakdowns(day.modelBreakdowns);
  return {
    ...day,
    modelsUsed: getModelsUsed(modelBreakdowns),
    modelBreakdowns,
  };
}

function finalizeMonthlyUsage(month: MonthlyUsage): MonthlyUsage {
  const modelBreakdowns = coalesceLegacyProviderlessBreakdowns(month.modelBreakdowns);
  return {
    ...month,
    modelsUsed: getModelsUsed(modelBreakdowns),
    modelBreakdowns,
  };
}

function finalizeHourlyUsage(hour: HourlyUsage): HourlyUsage {
  const modelBreakdowns = coalesceLegacyProviderlessBreakdowns(hour.modelBreakdowns);
  return {
    ...hour,
    modelsUsed: getModelsUsed(modelBreakdowns),
    modelBreakdowns,
  };
}

/**
 * Merge daily usage data from multiple sources
 * Combines entries with same date by aggregating tokens
 */
export function mergeDailyData(sources: DailyUsage[][]): DailyUsage[] {
  const dateMap = new Map<string, DailyUsage>();

  for (const source of sources) {
    for (const day of source) {
      const existing = dateMap.get(day.date);
      if (existing) {
        // Aggregate tokens for same date
        existing.inputTokens += day.inputTokens;
        existing.outputTokens += day.outputTokens;
        existing.cacheCreationTokens += day.cacheCreationTokens;
        existing.cacheReadTokens += day.cacheReadTokens;
        existing.totalCost += day.totalCost;
        // Merge model breakdowns by aggregating same modelName
        for (const breakdown of day.modelBreakdowns) {
          const breakdownKey = getProviderModelKey(breakdown);
          const existingBreakdown = existing.modelBreakdowns.find(
            (b) => getProviderModelKey(b) === breakdownKey
          );
          if (existingBreakdown) {
            existingBreakdown.inputTokens += breakdown.inputTokens;
            existingBreakdown.outputTokens += breakdown.outputTokens;
            existingBreakdown.cacheCreationTokens += breakdown.cacheCreationTokens;
            existingBreakdown.cacheReadTokens += breakdown.cacheReadTokens;
            existingBreakdown.cost += breakdown.cost;
          } else {
            existing.modelBreakdowns.push({ ...breakdown });
          }
        }
      } else {
        // Clone to avoid mutating original
        const modelBreakdowns = day.modelBreakdowns.map((b) => ({ ...b }));
        dateMap.set(day.date, {
          ...day,
          modelsUsed: getModelsUsed(modelBreakdowns),
          modelBreakdowns,
        });
      }
    }
  }

  return Array.from(dateMap.values())
    .map(finalizeDailyUsage)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Merge monthly usage data from multiple sources
 */
export function mergeMonthlyData(sources: MonthlyUsage[][]): MonthlyUsage[] {
  const monthMap = new Map<string, MonthlyUsage>();

  for (const source of sources) {
    for (const month of source) {
      const existing = monthMap.get(month.month);
      if (existing) {
        existing.inputTokens += month.inputTokens;
        existing.outputTokens += month.outputTokens;
        existing.cacheCreationTokens += month.cacheCreationTokens;
        existing.cacheReadTokens += month.cacheReadTokens;
        existing.totalCost += month.totalCost;
        for (const breakdown of month.modelBreakdowns) {
          const breakdownKey = getProviderModelKey(breakdown);
          const existingBreakdown = existing.modelBreakdowns.find(
            (item) => getProviderModelKey(item) === breakdownKey
          );
          if (existingBreakdown) {
            existingBreakdown.inputTokens += breakdown.inputTokens;
            existingBreakdown.outputTokens += breakdown.outputTokens;
            existingBreakdown.cacheCreationTokens += breakdown.cacheCreationTokens;
            existingBreakdown.cacheReadTokens += breakdown.cacheReadTokens;
            existingBreakdown.cost += breakdown.cost;
          } else {
            existing.modelBreakdowns.push({ ...breakdown });
          }
        }
      } else {
        const modelBreakdowns = month.modelBreakdowns.map((breakdown) => ({ ...breakdown }));
        monthMap.set(month.month, {
          ...month,
          modelsUsed: getModelsUsed(modelBreakdowns),
          modelBreakdowns,
        });
      }
    }
  }

  return Array.from(monthMap.values())
    .map(finalizeMonthlyUsage)
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Merge hourly usage data from multiple sources
 * Combines entries with same hour by aggregating tokens
 */
export function mergeHourlyData(sources: HourlyUsage[][]): HourlyUsage[] {
  const hourMap = new Map<string, HourlyUsage>();

  for (const source of sources) {
    for (const hour of source) {
      const existing = hourMap.get(hour.hour);
      if (existing) {
        existing.inputTokens += hour.inputTokens;
        existing.outputTokens += hour.outputTokens;
        existing.cacheCreationTokens += hour.cacheCreationTokens;
        existing.cacheReadTokens += hour.cacheReadTokens;
        existing.totalCost += hour.totalCost;
        existing.requestCount = getHourlyRequestCount(existing) + getHourlyRequestCount(hour);
        // Merge model breakdowns
        for (const breakdown of hour.modelBreakdowns) {
          const breakdownKey = getProviderModelKey(breakdown);
          const existingBreakdown = existing.modelBreakdowns.find(
            (b) => getProviderModelKey(b) === breakdownKey
          );
          if (existingBreakdown) {
            existingBreakdown.inputTokens += breakdown.inputTokens;
            existingBreakdown.outputTokens += breakdown.outputTokens;
            existingBreakdown.cacheCreationTokens += breakdown.cacheCreationTokens;
            existingBreakdown.cacheReadTokens += breakdown.cacheReadTokens;
            existingBreakdown.cost += breakdown.cost;
          } else {
            existing.modelBreakdowns.push({ ...breakdown });
          }
        }
      } else {
        const modelBreakdowns = hour.modelBreakdowns.map((b) => ({ ...b }));
        hourMap.set(hour.hour, {
          ...hour,
          modelsUsed: getModelsUsed(modelBreakdowns),
          modelBreakdowns,
          requestCount: getHourlyRequestCount(hour),
        });
      }
    }
  }

  return Array.from(hourMap.values())
    .map(finalizeHourlyUsage)
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

/**
 * Merge session data from multiple sources
 * Deduplicates by sessionId (same session shouldn't appear in multiple instances)
 */
export function mergeSessionData(sources: SessionUsage[][]): SessionUsage[] {
  const sessionMap = new Map<string, SessionUsage>();

  for (const source of sources) {
    for (const session of source) {
      // Use sessionId as unique key - later entries overwrite earlier ones
      sessionMap.set(session.sessionId, session);
    }
  }

  return Array.from(sessionMap.values()).sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );
}

// ============================================================================
// Caching Layer - Reduces better-ccusage library calls
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Cache TTLs (milliseconds)
const CACHE_TTL = {
  daily: 60 * 1000, // 1 minute - changes frequently
  monthly: 5 * 60 * 1000, // 5 minutes - aggregated data
  session: 60 * 1000, // 1 minute - user may refresh
};

/// Stale-while-revalidate: max age for stale data (7 days)
// We always show cached data to avoid blocking UI, refresh happens in background
const STALE_TTL = 7 * 24 * 60 * 60 * 1000;

// Track when data was last fetched (for UI indicator)
let lastFetchTimestamp: number | null = null;

/** Get timestamp of last successful data fetch */
export function getLastFetchTimestamp(): number | null {
  return lastFetchTimestamp;
}

export function getUsageCacheSize(): number {
  return cache.size;
}

// In-memory cache
const cache = new Map<string, CacheEntry<unknown>>();

// Pending requests for coalescing (prevents duplicate concurrent calls)
const pendingRequests = new Map<string, Promise<unknown>>();

// Track if disk cache has been loaded into memory
let diskCacheInitialized = false;

// Track if background refresh is in progress
let isRefreshing = false;

// Coalesced full refresh promise shared across all usage loaders
let pendingFullRefresh: Promise<{
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
  session: SessionUsage[];
}> | null = null;

/**
 * Persist cache to disk when we have enough data to be useful.
 */
function persistCacheIfComplete(): void {
  const daily = cache.get('daily') as CacheEntry<DailyUsage[]> | undefined;
  const hourly = cache.get('hourly') as CacheEntry<HourlyUsage[]> | undefined;
  const monthly = cache.get('monthly') as CacheEntry<MonthlyUsage[]> | undefined;
  const session = cache.get('session') as CacheEntry<SessionUsage[]> | undefined;

  // Write if we have at least daily data (the most essential)
  if (daily) {
    writeDiskCache(daily.data, hourly?.data ?? [], monthly?.data ?? [], session?.data ?? []);
  }
}

/**
 * Load fresh data and update both memory and disk caches
 * Aggregates data from default ~/.claude/ AND all CCS instances
 */
async function refreshFromSource(): Promise<{
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
  session: SessionUsage[];
}> {
  // Keep model metadata warming off the analytics request path. Current
  // refreshes use cached/static pricing; the background result helps future runs.
  void startModelsDevRegistryRefresh();

  // Try to sync CLIProxy snapshot before reading it.
  // Non-fatal: syncer handles unavailability and stale fallback.
  await syncCliproxyUsage();

  // Load canonical default data and avoid counting the active instance twice
  const defaultData = await loadAllUsageData({ projectsDir: getDefaultProjectsDirForAnalytics() });

  // Load data from all CCS instances sequentially
  const instancePaths = getInstancePaths();
  const instanceDataResults: Array<{
    daily: DailyUsage[];
    hourly: HourlyUsage[];
    monthly: MonthlyUsage[];
    session: SessionUsage[];
  }> = [];

  for (const instancePath of instancePaths) {
    try {
      const data = await loadInstanceData(instancePath);
      instanceDataResults.push(data);
    } catch (err) {
      const instanceName = path.basename(instancePath);
      console.error(fail(`Failed to load instance ${instanceName}: ${err}`));
    }
  }

  // Collect successful instance data
  const allDailySources: DailyUsage[][] = [defaultData.daily];
  const allHourlySources: HourlyUsage[][] = [defaultData.hourly];
  const allMonthlySources: MonthlyUsage[][] = [defaultData.monthly];
  const allSessionSources: SessionUsage[][] = [defaultData.session];

  for (const result of instanceDataResults) {
    allDailySources.push(result.daily);
    allHourlySources.push(result.hourly);
    allMonthlySources.push(result.monthly);
    allSessionSources.push(result.session);
  }

  if (instanceDataResults.length > 0) {
    console.log(info(`Aggregated usage data from ${instanceDataResults.length} CCS instance(s)`));
  }

  try {
    const codexEntries = await scanCodexNativeUsageEntries();
    if (codexEntries.length > 0) {
      allDailySources.push(aggregateDailyUsage(codexEntries, 'codex-native'));
      allHourlySources.push(aggregateHourlyUsage(codexEntries, 'codex-native'));
      allMonthlySources.push(aggregateMonthlyUsage(codexEntries, 'codex-native'));
      allSessionSources.push(aggregateSessionUsage(codexEntries, 'codex-native'));
      console.log(info(`Included native Codex usage data (${codexEntries.length} event(s))`));
    }
  } catch (err) {
    console.error(fail(`Failed to load native Codex usage data: ${err}`));
  }

  try {
    const droidEntries = await scanDroidNativeUsageEntries();
    if (droidEntries.length > 0) {
      allDailySources.push(aggregateDailyUsage(droidEntries, 'droid-native'));
      allHourlySources.push(aggregateHourlyUsage(droidEntries, 'droid-native'));
      allMonthlySources.push(aggregateMonthlyUsage(droidEntries, 'droid-native'));
      allSessionSources.push(aggregateSessionUsage(droidEntries, 'droid-native'));
      console.log(info(`Included native Droid usage data (${droidEntries.length} event(s))`));
    }
  } catch (err) {
    console.error(fail(`Failed to load native Droid usage data: ${err}`));
  }

  // Load CLIProxy usage data (from local snapshot cache)
  try {
    const cliproxyData = await loadCachedCliproxyData();
    if (cliproxyData.daily.length > 0) {
      allDailySources.push(cliproxyData.daily);
      allHourlySources.push(cliproxyData.hourly);
      allMonthlySources.push(cliproxyData.monthly);
      console.log(info('Included CLIProxy usage data'));
    }
  } catch (err) {
    console.error(fail(`Failed to load CLIProxy usage data: ${err}`));
  }

  // Merge all data sources
  const daily = mergeDailyData(allDailySources);
  const hourly = mergeHourlyData(allHourlySources);
  const monthly = mergeMonthlyData(allMonthlySources);
  const session = mergeSessionData(allSessionSources);

  // Update in-memory cache
  const now = Date.now();
  cache.set('daily', { data: daily, timestamp: now });
  cache.set('hourly', { data: hourly, timestamp: now });
  cache.set('monthly', { data: monthly, timestamp: now });
  cache.set('session', { data: session, timestamp: now });
  lastFetchTimestamp = now;

  // Persist to disk
  writeDiskCache(daily, hourly, monthly, session);

  return { daily, hourly, monthly, session };
}

async function refreshFromSourceCoalesced(force = false): Promise<{
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
  session: SessionUsage[];
}> {
  // Wait for any in-flight refresh to finish before starting a forced one
  // to prevent concurrent refreshes competing for the same resources
  if (force && pendingFullRefresh) {
    await pendingFullRefresh.catch(() => {});
  }

  if (force) {
    pendingFullRefresh = refreshFromSource().finally(() => {
      pendingFullRefresh = null;
    });
    return pendingFullRefresh;
  }

  if (pendingFullRefresh) {
    return pendingFullRefresh;
  }

  pendingFullRefresh = refreshFromSource().finally(() => {
    pendingFullRefresh = null;
  });

  return pendingFullRefresh;
}

/**
 * Initialize in-memory cache from disk cache (lazy - called on first API request).
 */
function ensureDiskCacheLoaded(): void {
  // Start sync when usage APIs are actually accessed.
  // startCliproxySync() is idempotent.
  startCliproxySync();

  if (diskCacheInitialized) return;
  diskCacheInitialized = true;

  const diskCache = readDiskCache();
  if (!diskCache) return;

  // Load disk cache into memory (regardless of freshness)
  cache.set('daily', { data: diskCache.daily, timestamp: diskCache.timestamp });
  cache.set('hourly', { data: diskCache.hourly || [], timestamp: diskCache.timestamp });
  cache.set('monthly', { data: diskCache.monthly, timestamp: diskCache.timestamp });
  cache.set('session', { data: diskCache.session, timestamp: diskCache.timestamp });
  lastFetchTimestamp = diskCache.timestamp;
}

/**
 * Get cached data or fetch from loader with TTL
 * Implements stale-while-revalidate pattern for instant responses
 */
async function getCachedData<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
  // Ensure disk cache is loaded on first request
  ensureDiskCacheLoaded();

  const cached = cache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  // Fresh cache - return immediately
  if (cached && now - cached.timestamp < ttl) {
    return cached.data;
  }

  // Stale cache - return immediately, refresh in background (SWR pattern)
  if (cached && now - cached.timestamp < STALE_TTL) {
    // Fire and forget background refresh if not already pending
    if (!pendingRequests.has(key)) {
      const promise = loader()
        .then((data) => {
          cache.set(key, { data, timestamp: Date.now() });
          lastFetchTimestamp = Date.now();
          persistCacheIfComplete();
        })
        .catch((err) => {
          console.error(fail(`Background refresh failed for ${key}: ${err}`));
        })
        .finally(() => {
          pendingRequests.delete(key);
        });
      pendingRequests.set(key, promise);
    }
    return cached.data;
  }

  // No usable cache - check if request is already pending (coalesce)
  const pending = pendingRequests.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  // Create new request
  const promise = loader()
    .then((data) => {
      cache.set(key, { data, timestamp: Date.now() });
      lastFetchTimestamp = Date.now();
      persistCacheIfComplete();
      return data;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, promise);
  return promise;
}

/** Cached loader for daily usage data */
export async function getCachedDailyData(): Promise<DailyUsage[]> {
  return getCachedData('daily', CACHE_TTL.daily, async () => {
    return (await refreshFromSourceCoalesced()).daily;
  });
}

/** Cached loader for monthly usage data */
export async function getCachedMonthlyData(): Promise<MonthlyUsage[]> {
  return getCachedData('monthly', CACHE_TTL.monthly, async () => {
    return (await refreshFromSourceCoalesced()).monthly;
  });
}

/** Cached loader for session data */
export async function getCachedSessionData(): Promise<SessionUsage[]> {
  return getCachedData('session', CACHE_TTL.session, async () => {
    return (await refreshFromSourceCoalesced()).session;
  });
}

/** Cached loader for hourly usage data */
export async function getCachedHourlyData(): Promise<HourlyUsage[]> {
  return getCachedData('hourly', CACHE_TTL.daily, async () => {
    return (await refreshFromSourceCoalesced()).hourly;
  });
}

/**
 * Clear all cached data (useful for manual refresh)
 */
export function clearUsageCache(): void {
  cache.clear();
  pendingRequests.clear();
  pendingFullRefresh = null;
  clearDiskCache();
  // Reset so next API call will try to reload from disk/source
  diskCacheInitialized = false;
  lastFetchTimestamp = null;
}

/**
 * Pre-warm usage caches on server startup
 *
 * Strategy:
 * 1. Check disk cache - if fresh, use it (instant startup)
 * 2. If stale, use it immediately but trigger background refresh
 * 3. If no cache, return immediately and let first request trigger load
 */
export async function prewarmUsageCache(): Promise<{
  timestamp: number;
  elapsed: number;
  source: string;
}> {
  const start = Date.now();
  console.log(info('Pre-warming usage cache...'));

  try {
    // Start CLIProxy usage syncer early (runs in background every 5 min)
    startCliproxySync();

    const diskCache = readDiskCache();

    // Fresh disk cache - use it directly
    if (diskCache && isDiskCacheFresh(diskCache)) {
      const now = Date.now();
      cache.set('daily', { data: diskCache.daily, timestamp: diskCache.timestamp });
      cache.set('hourly', { data: diskCache.hourly || [], timestamp: diskCache.timestamp });
      cache.set('monthly', { data: diskCache.monthly, timestamp: diskCache.timestamp });
      cache.set('session', { data: diskCache.session, timestamp: diskCache.timestamp });
      lastFetchTimestamp = diskCache.timestamp;

      const elapsed = Date.now() - start;
      console.log(
        ok(`Usage cache ready from disk (${elapsed}ms, cached ${getCacheAge(diskCache)})`)
      );
      return { timestamp: now, elapsed, source: 'disk-fresh' };
    }

    // Stale disk cache - use it immediately, refresh in background
    if (diskCache && isDiskCacheStale(diskCache)) {
      const now = Date.now();
      cache.set('daily', { data: diskCache.daily, timestamp: diskCache.timestamp });
      cache.set('hourly', { data: diskCache.hourly || [], timestamp: diskCache.timestamp });
      cache.set('monthly', { data: diskCache.monthly, timestamp: diskCache.timestamp });
      cache.set('session', { data: diskCache.session, timestamp: diskCache.timestamp });
      lastFetchTimestamp = diskCache.timestamp;

      const elapsed = Date.now() - start;
      console.log(
        ok(
          `Usage cache ready from disk (${elapsed}ms, stale ${getCacheAge(diskCache)}, refreshing...)`
        )
      );

      // Background refresh
      if (!isRefreshing) {
        isRefreshing = true;
        refreshFromSourceCoalesced()
          .then(() => console.log(ok('Background refresh complete')))
          .catch((err) => console.error(fail(`Background refresh failed: ${err}`)))
          .finally(() => {
            isRefreshing = false;
          });
      }

      return { timestamp: now, elapsed, source: 'disk-stale' };
    }

    // No usable disk cache - refresh from source (blocking for first startup only)
    console.log(info('No disk cache, loading from source...'));
    await refreshFromSourceCoalesced();

    const elapsed = Date.now() - start;
    console.log(ok(`Usage cache ready (${elapsed}ms)`));
    return { timestamp: Date.now(), elapsed, source: 'fresh' };
  } catch (err) {
    console.error(fail(`Failed to prewarm usage cache: ${err}`));
    throw err;
  }
}

/**
 * Shutdown usage aggregator cleanly (stops background syncer)
 */
export function shutdownUsageAggregator(): void {
  stopCliproxySync();
}

/**
 * Force refresh usage cache from all sources.
 * Used by manual refresh endpoint.
 */
export async function refreshUsageCache(): Promise<void> {
  // Ensure periodic sync is running for subsequent updates.
  startCliproxySync();
  await refreshFromSourceCoalesced(true);
}
