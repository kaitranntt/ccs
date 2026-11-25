/**
 * Persistent Disk Cache for Usage Data
 *
 * Caches aggregated usage data to disk to avoid re-parsing 6000+ JSONL files
 * on every dashboard startup. Uses TTL-based invalidation with stale-while-revalidate.
 *
 * Cache location: ~/.ccs/cache/usage.json
 * Default TTL: 5 minutes (configurable)
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { DailyUsage, HourlyUsage, MonthlyUsage, SessionUsage } from './types';
import { createLogger } from '../../services/logging';
import { getCcsDir } from '../../config/config-loader-facade';
import { withSyncLockRetry } from '../../utils/sync-lock-retry';

const logger = createLogger('web-server:usage:disk-cache');

// Cache configuration
function getCacheDir() {
  return path.join(getCcsDir(), 'cache');
}
function getCacheFile() {
  return path.join(getCacheDir(), 'usage.json');
}
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (max age for stale data)

/** Structure of the disk cache file */
export interface UsageDiskCache {
  version: number;
  timestamp: number;
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
  session: SessionUsage[];
}

// Current cache version - increment to invalidate old caches
// v1: Initial cache format (daily, monthly, session)
// v2: Added multi-instance aggregation
// v3: Added hourly data to cache
// v4: Pricing fix for Claude 4.6 models (invalidate stale costs)
const CACHE_VERSION = 4;

/**
 * Ensure ~/.ccs/cache directory exists
 */
function ensureCacheDir(): void {
  const dir = getCacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read usage data from disk cache
 * Returns null if cache is missing, corrupted, or has incompatible version
 * NOTE: Does NOT reject based on age - caller handles staleness via SWR pattern
 */
export function readDiskCache(): UsageDiskCache | null {
  try {
    const cacheFile = getCacheFile();
    if (!fs.existsSync(cacheFile)) {
      return null;
    }

    const data = fs.readFileSync(cacheFile, 'utf-8');
    const cache: UsageDiskCache = JSON.parse(data);

    // Version check - invalidate if schema changed
    if (cache.version !== CACHE_VERSION) {
      logger.info('usage.disk-cache.version-mismatch', 'Cache version mismatch, will refresh', {
        version: cache.version,
        expectedVersion: CACHE_VERSION,
      });
      return null;
    }

    // Always return cache regardless of age - SWR pattern handles staleness
    return cache;
  } catch (err) {
    // Cache corrupted or unreadable - treat as miss
    logger.warn('usage.disk-cache.read-failed', 'Cache read failed, will refresh', {
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * Check if disk cache is fresh (within TTL)
 */
export function isDiskCacheFresh(cache: UsageDiskCache | null): boolean {
  if (!cache) return false;
  const age = Date.now() - cache.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * Check if disk cache is stale but usable (between TTL and STALE_TTL)
 */
export function isDiskCacheStale(cache: UsageDiskCache | null): boolean {
  if (!cache) return false;
  const age = Date.now() - cache.timestamp;
  return age >= CACHE_TTL_MS && age < STALE_TTL_MS;
}

/**
 * Write usage data to disk cache
 */
export function writeDiskCache(
  daily: DailyUsage[],
  hourly: HourlyUsage[],
  monthly: MonthlyUsage[],
  session: SessionUsage[]
): void {
  try {
    ensureCacheDir();

    const cache: UsageDiskCache = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      daily,
      hourly,
      monthly,
      session,
    };

    // Write atomically using lock + unique temp file + rename
    const cacheDir = getCacheDir();
    const cacheFile = getCacheFile();
    withSyncLockRetry(
      cacheDir,
      () => {
        const tempFile = `${cacheFile}.tmp.${process.pid}.${crypto.randomUUID()}`;
        try {
          fs.writeFileSync(tempFile, JSON.stringify(cache), { encoding: 'utf-8', flag: 'wx' });
          fs.renameSync(tempFile, cacheFile);
        } catch (err) {
          if (fs.existsSync(tempFile)) {
            try {
              fs.unlinkSync(tempFile);
            } catch {
              // Best-effort cleanup
            }
          }
          throw err;
        }
      },
      { description: 'usage disk cache lock' }
    );

    logger.info('usage.disk-cache.updated', 'Disk cache updated');
  } catch (err) {
    // Non-fatal - we can still serve from memory
    logger.warn('usage.disk-cache.write-failed', 'Failed to write disk cache', {
      error: (err as Error).message,
    });
  }
}

/**
 * Get cache age in human-readable format
 */
export function getCacheAge(cache: UsageDiskCache | null): string {
  if (!cache) return 'never';

  const age = Date.now() - cache.timestamp;
  const seconds = Math.floor(age / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s ago`;
  return `${seconds}s ago`;
}

/**
 * Delete disk cache (for manual refresh)
 */
export function clearDiskCache(): void {
  try {
    const cacheDir = getCacheDir();
    if (!fs.existsSync(cacheDir)) {
      return;
    }
    const cacheFile = getCacheFile();
    withSyncLockRetry(
      cacheDir,
      () => {
        if (fs.existsSync(cacheFile)) {
          fs.unlinkSync(cacheFile);
          logger.info('usage.disk-cache.cleared', 'Disk cache cleared');
        }
      },
      { description: 'usage disk cache lock' }
    );
  } catch (err) {
    logger.warn('usage.disk-cache.clear-failed', 'Failed to clear disk cache', {
      error: (err as Error).message,
    });
  }
}
