/**
 * Quota caching helper. Determines whether a quota fetch result should be
 * written to the shared in-memory cache.
 *
 * Public surface: `shouldCacheQuotaResult` is re-exported by the barrel.
 */

/**
 * Cache only stable failures; skip transient network errors (timeouts, 429s, 5xx).
 * Generic across all quota result types.
 */
export function shouldCacheQuotaResult(result: {
  success: boolean;
  needsReauth?: boolean;
  isForbidden?: boolean;
  httpStatus?: number;
  retryable?: boolean;
  error?: string;
}): boolean {
  if (result.success) return true;
  if (result.needsReauth || result.isForbidden) return true;
  if (result.retryable === true) return false;
  if (result.retryable === false) return true;
  if (typeof result.httpStatus === 'number') {
    if (result.httpStatus === 429 || result.httpStatus === 408 || result.httpStatus >= 500) {
      return false;
    }
    if (result.httpStatus >= 400 && result.httpStatus < 500) {
      return true;
    }
  }
  const msg = (result.error || '').toLowerCase();
  if (!msg) return false;
  const transientPatterns = ['timeout', 'rate limited', 'api error: 5', 'fetch failed'];
  return !transientPatterns.some((p) => msg.includes(p));
}
