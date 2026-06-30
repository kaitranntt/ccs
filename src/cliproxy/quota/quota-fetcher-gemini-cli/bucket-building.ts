/**
 * Bucket building for the Gemini CLI quota fetcher.
 *
 * Translates raw upstream quota buckets (snake_case and camelCase tolerant)
 * into the normalized {@link GeminiCliBucket} array grouped by model series
 * and token type. Delegates the grouping to the shared
 * `gemini-cli-quota-normalizer` so the grouping rules stay in one place.
 */

import {
  buildGeminiCliBucketsFromParsedBuckets,
  type GeminiCliParsedBucket,
} from '../gemini-cli-quota-normalizer';
import type { GeminiCliBucket } from '../quota-types';
import type { RawGeminiCliBucket } from './types';
import { normalizeNumberValue, normalizeStringValue } from './shared-utils';

/**
 * Build a {@link GeminiCliBucket} array from raw upstream quota buckets.
 *
 * Each raw bucket is normalized into a {@link GeminiCliParsedBucket}:
 *   - skips buckets with no resolvable model id
 *   - coalesces remaining_fraction / remaining_amount / reset_time across
 *     naming variants, with a fallback of `1` (full) when none are present
 *     but a reset time or non-positive amount implies exhaustion
 * Then delegates to {@link buildGeminiCliBucketsFromParsedBuckets} for the
 * model-series and token-type grouping.
 */
export function buildGeminiCliBuckets(rawBuckets: RawGeminiCliBucket[]): GeminiCliBucket[] {
  const parsedBuckets = rawBuckets
    .map((bucket): GeminiCliParsedBucket | null => {
      const modelId = normalizeStringValue(bucket.model_id ?? bucket.modelId);
      if (!modelId) return null;

      const tokenType = normalizeStringValue(bucket.token_type ?? bucket.tokenType);
      const remainingFractionRaw = normalizeNumberValue(
        bucket.remaining_fraction ?? bucket.remainingFraction
      );
      const remainingAmount = normalizeNumberValue(
        bucket.remaining_amount ?? bucket.remainingAmount
      );
      const resetTime = normalizeStringValue(bucket.reset_time ?? bucket.resetTime);

      let fallbackFraction: number | null = null;
      if (remainingAmount !== null) {
        fallbackFraction = remainingAmount <= 0 ? 0 : null;
      } else if (resetTime) {
        fallbackFraction = 0;
      }

      return {
        modelId,
        tokenType,
        remainingFraction: remainingFractionRaw ?? fallbackFraction ?? 1,
        remainingAmount,
        resetTime,
      };
    })
    .filter((bucket): bucket is GeminiCliParsedBucket => bucket !== null);

  return buildGeminiCliBucketsFromParsedBuckets(parsedBuckets);
}
