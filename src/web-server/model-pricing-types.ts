/**
 * Shared types and rate-building helpers for the Model Pricing Registry.
 */

import type { ModelsDevPricingLookupOptions } from './models-dev/pricing-resolver';

export interface PricingRates {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheCreationPerMillion: number;
  cacheReadPerMillion: number;
}

export interface ModelPricing extends PricingRates {
  /**
   * Optional per-service-tier rate overrides keyed by Anthropic's
   * `service_tier` request parameter (e.g. `'fast'`). When the lookup is
   * called with a known tier, these rates replace the base ones; otherwise
   * the base rates apply.
   */
  serviceTiers?: Record<string, PricingRates>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface PricingLookupOptions extends ModelsDevPricingLookupOptions {
  /**
   * Anthropic `service_tier` (e.g. `'fast'`). When set and the resolved model
   * has matching `serviceTiers` rates, those are returned instead of the
   * base rates. Unknown tiers transparently fall through to base.
   */
  serviceTier?: string;
}

// Anthropic prompt-caching multipliers, expressed relative to the base input
// rate (see https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching).
// Keeping them as named constants avoids drift when deriving per-tier cache rates.
const CACHE_5M_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/**
 * Build a full rate set from input/output rates, deriving cache rates from the
 * documented Anthropic multipliers so fast-tier entries stay in sync with the
 * base-rate math instead of carrying hand-computed cache numbers.
 */
export function buildRates(inputPerMillion: number, outputPerMillion: number): PricingRates {
  return {
    inputPerMillion,
    outputPerMillion,
    cacheCreationPerMillion: inputPerMillion * CACHE_5M_WRITE_MULTIPLIER,
    cacheReadPerMillion: inputPerMillion * CACHE_READ_MULTIPLIER,
  };
}
