/**
 * Shared internals for cliproxy-stats-routes: logger and rate-limit helpers.
 *
 * These are NOT part of the public barrel surface; they exist so the sibling
 * submodules (quota helpers, version helpers, route handlers) can share the
 * same logger instance and rate-limit state without re-declaring them.
 */

import type { Request } from 'express';
import { createLogger } from '../../../services/logging';

/**
 * Shared logger for every cliproxy-stats submodule. Preserves the
 * `web-server:routes:cliproxy-stats` channel used by P3 error conversions
 * (`logger.error('stats.route.error', ...)`).
 */
export const logger = createLogger('web-server:routes:cliproxy-stats');

// ==================== Quota Rate Limiting ====================

export const QUOTA_RATE_LIMIT_WINDOW_MS = 60_000;
export const QUOTA_RATE_LIMIT_MAX_REQUESTS = 120;

export interface QuotaRateLimitEntry {
  windowStart: number;
  count: number;
}

/**
 * In-memory rate limit state. Shared across all quota route handlers so that
 * the same IP+provider key is throttled regardless of which handler runs.
 */
export const quotaRateLimits = new Map<string, QuotaRateLimitEntry>();

/**
 * Build the rate-limit key for a request + provider pair.
 */
export function buildQuotaRateLimitKey(req: Request, provider: string): string {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  return `${clientIp}:${provider}`;
}

/**
 * Returns true when the caller should be rejected with 429.
 * Evicts stale entries to prevent unbounded memory growth.
 */
export function isQuotaRouteRateLimited(req: Request, provider: string): boolean {
  const key = buildQuotaRateLimitKey(req, provider);
  const now = Date.now();

  // Evict stale entries to prevent unbounded memory growth
  if (quotaRateLimits.size > 1000) {
    for (const [k, v] of quotaRateLimits) {
      if (now - v.windowStart >= QUOTA_RATE_LIMIT_WINDOW_MS * 2) {
        quotaRateLimits.delete(k);
      }
    }
  }

  const current = quotaRateLimits.get(key);

  if (!current || now - current.windowStart >= QUOTA_RATE_LIMIT_WINDOW_MS) {
    quotaRateLimits.set(key, { windowStart: now, count: 1 });
    return false;
  }

  current.count += 1;
  quotaRateLimits.set(key, current);
  return current.count > QUOTA_RATE_LIMIT_MAX_REQUESTS;
}
