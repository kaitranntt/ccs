/**
 * Model Pricing Registry
 *
 * User-editable pricing configuration for Claude Code usage analytics.
 * Update rates below when new models are released or pricing changes.
 *
 * All rates are in USD per MILLION tokens.
 */

import {
  getKnownModelsDevModels,
  resolveModelsDevPricing,
  type ModelsDevPricingLookupOptions,
} from './models-dev/pricing-resolver';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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
function buildRates(inputPerMillion: number, outputPerMillion: number): PricingRates {
  return {
    inputPerMillion,
    outputPerMillion,
    cacheCreationPerMillion: inputPerMillion * CACHE_5M_WRITE_MULTIPLIER,
    cacheReadPerMillion: inputPerMillion * CACHE_READ_MULTIPLIER,
  };
}

// Anthropic fast-mode premiums (per
// https://platform.claude.com/docs/en/about-claude/pricing#fast-mode-pricing).
// Opus 4.6 and 4.7 share the same 6x premium; 4.8 is 2x. Shared constants keep
// the registry entries in sync rather than repeating the literal rates.
const OPUS_46_47_FAST_RATES = buildRates(30.0, 150.0);
const OPUS_48_FAST_RATES = buildRates(10.0, 50.0);

// ============================================================================
// USER-EDITABLE PRICING TABLE
// Update rates below (per million tokens in USD)
// ============================================================================

const PRICING_REGISTRY: Record<string, ModelPricing> = {
  // ---------------------------------------------------------------------------
  // Claude Models (Anthropic) - Source: Official Anthropic pricing
  // cacheCreation = 5min cache writes, cacheRead = cache hits & refreshes
  // ---------------------------------------------------------------------------
  // Claude 3 Haiku ($0.25/$1.25)
  'claude-3-haiku-20240307': {
    inputPerMillion: 0.25,
    outputPerMillion: 1.25,
    cacheCreationPerMillion: 0.3,
    cacheReadPerMillion: 0.03,
  },
  // Claude 3.5 Haiku ($0.80/$4)
  'claude-3-5-haiku-20241022': {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    cacheCreationPerMillion: 1.0,
    cacheReadPerMillion: 0.08,
  },
  'claude-3-5-haiku-latest': {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    cacheCreationPerMillion: 1.0,
    cacheReadPerMillion: 0.08,
  },
  // Claude 4.5 Haiku ($1/$5)
  'claude-haiku-4-5-20251001': {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    cacheCreationPerMillion: 1.25,
    cacheReadPerMillion: 0.1,
  },
  'claude-haiku-4-5': {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    cacheCreationPerMillion: 1.25,
    cacheReadPerMillion: 0.1,
  },
  // Claude 3.5 Sonnet (deprecated, same as Sonnet 3.7: $3/$15)
  'claude-3-5-sonnet-20240620': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-3-5-sonnet-20241022': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-3-5-sonnet-latest': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  // Claude 3.7 Sonnet (deprecated: $3/$15)
  'claude-3-7-sonnet-20250219': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-3-7-sonnet-latest': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  // Claude 3 Opus (deprecated: $15/$75)
  'claude-3-opus-20240229': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  'claude-3-opus-latest': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  // Claude 4 Sonnet ($3/$15)
  'claude-4-sonnet-20250514': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-sonnet-4-20250514': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-sonnet-4': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  // Claude 4.5 Sonnet ($3/$15)
  'claude-sonnet-4-5-20250929': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-sonnet-4-5': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-sonnet-4-5-thinking': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  // Claude 4.6 Sonnet ($3/$15)
  'claude-sonnet-4-6': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  'claude-sonnet-4-6-thinking': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  // Claude 4 Opus ($15/$75)
  'claude-4-opus-20250514': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  'claude-opus-4-20250514': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  'claude-opus-4': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  // Claude 4.1 Opus ($15/$75)
  'claude-opus-4-1': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  'claude-opus-4-1-20250805': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  // Claude 4.5 Opus ($5/$25) - NEW PRICING!
  'claude-opus-4-5-20251101': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheCreationPerMillion: 6.25,
    cacheReadPerMillion: 0.5,
  },
  'claude-opus-4-5': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheCreationPerMillion: 6.25,
    cacheReadPerMillion: 0.5,
  },
  'claude-opus-4-5-thinking': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheCreationPerMillion: 6.25,
    cacheReadPerMillion: 0.5,
  },
  // Claude 4.6 Opus ($5/$25) — fast mode ($30/$150, 6x premium per Anthropic docs)
  'claude-opus-4-6': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheCreationPerMillion: 6.25,
    cacheReadPerMillion: 0.5,
    serviceTiers: {
      fast: OPUS_46_47_FAST_RATES,
    },
  },
  'claude-opus-4-6-thinking': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheCreationPerMillion: 6.25,
    cacheReadPerMillion: 0.5,
    serviceTiers: {
      fast: OPUS_46_47_FAST_RATES,
    },
  },
  // Claude 4.7 Opus ($5/$25) — fast mode ($30/$150, 6x premium per Anthropic docs)
  'claude-opus-4-7': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheCreationPerMillion: 6.25,
    cacheReadPerMillion: 0.5,
    serviceTiers: {
      fast: OPUS_46_47_FAST_RATES,
    },
  },
  // Legacy pricing-only entry for historical analytics data; this id has no
  // catalog model (Opus 4.7 moved to adaptive thinking levels in 84dc4e24, so
  // there is no separate -thinking variant). Kept so older usage records still
  // resolve to the correct rate. No fast tier: the id is never requested live.
  'claude-opus-4-7-thinking': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheCreationPerMillion: 6.25,
    cacheReadPerMillion: 0.5,
  },
  // Claude 4.8 Opus ($5/$25) — fast mode ($10/$50, 2x premium per Anthropic docs)
  'claude-opus-4-8': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheCreationPerMillion: 6.25,
    cacheReadPerMillion: 0.5,
    serviceTiers: {
      fast: OPUS_48_FAST_RATES,
    },
  },
  // Claude Fable 5 ($10/$50) — most powerful tier, above Opus
  'claude-fable-5': {
    inputPerMillion: 10.0,
    outputPerMillion: 50.0,
    cacheCreationPerMillion: 12.5,
    cacheReadPerMillion: 1.0,
  },

  // ---------------------------------------------------------------------------
  // OpenAI Models - Source: better-ccusage
  // ---------------------------------------------------------------------------
  // GPT-4o
  'gpt-4o': {
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 1.25,
  },
  'gpt-4o-2024-08-06': {
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 1.25,
  },
  'gpt-4o-2024-11-20': {
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 1.25,
  },
  'gpt-4o-mini': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.075,
  },
  // GPT-4.1
  'gpt-4.1': {
    inputPerMillion: 2.0,
    outputPerMillion: 8.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.5,
  },
  'gpt-4.1-mini': {
    inputPerMillion: 0.4,
    outputPerMillion: 1.6,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.1,
  },
  'gpt-4.1-nano': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.025,
  },
  // GPT-4.5
  'gpt-4.5-preview': {
    inputPerMillion: 75.0,
    outputPerMillion: 150.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 37.5,
  },
  // GPT-3.5 Turbo
  'gpt-3.5-turbo': {
    inputPerMillion: 1.5,
    outputPerMillion: 2.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'gpt-3.5-turbo-0125': {
    inputPerMillion: 0.5,
    outputPerMillion: 1.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  // o1 Reasoning Models
  o1: {
    inputPerMillion: 15.0,
    outputPerMillion: 60.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 7.5,
  },
  'o1-preview': {
    inputPerMillion: 15.0,
    outputPerMillion: 60.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 7.5,
  },
  'o1-mini': {
    inputPerMillion: 3.0,
    outputPerMillion: 12.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 1.5,
  },
  'o3-mini': {
    inputPerMillion: 1.1,
    outputPerMillion: 4.4,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.55,
  },
  // OpenAI GPT-5 / Codex - Source: better-ccusage
  'gpt-5': {
    inputPerMillion: 1.25,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.125,
  },
  'gpt-5-chat': {
    inputPerMillion: 1.25,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.125,
  },
  'gpt-5-codex': {
    inputPerMillion: 1.25,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.125,
  },
  'gpt-5-mini': {
    inputPerMillion: 0.25,
    outputPerMillion: 2.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.025,
  },
  'gpt-5-nano': {
    inputPerMillion: 0.05,
    outputPerMillion: 0.4,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.005,
  },
  'codex-mini-latest': {
    inputPerMillion: 1.5,
    outputPerMillion: 6.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.375,
  },

  // ---------------------------------------------------------------------------
  // Google Gemini Models - Source: better-ccusage
  // ---------------------------------------------------------------------------
  // Gemini 2.5
  'gemini-2.5-flash': {
    inputPerMillion: 0.3,
    outputPerMillion: 2.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.075,
  },
  'gemini-2.5-flash-lite': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.025,
  },
  'gemini-2.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.3125,
  },
  // Gemini 2.0
  'gemini-2.0-flash': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.025,
  },
  'gemini-2.0-flash-exp': {
    inputPerMillion: 0.0,
    outputPerMillion: 0.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  // Gemini 1.5
  'gemini-1.5-flash': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.3,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'gemini-1.5-flash-8b': {
    inputPerMillion: 0.0375,
    outputPerMillion: 0.15,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'gemini-1.5-pro': {
    inputPerMillion: 3.5,
    outputPerMillion: 10.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  // Gemini 3 - Official pricing (Nov 2025): ≤200k ctx: $2/$12, >200k ctx: $4/$18
  // Using standard ≤200k pricing as default
  'gemini-3-pro-preview': {
    inputPerMillion: 2.0,
    outputPerMillion: 12.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'gemini-3-pro': {
    inputPerMillion: 2.0,
    outputPerMillion: 12.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  // High context variant (>200k tokens)
  'gemini-3-pro-high': {
    inputPerMillion: 4.0,
    outputPerMillion: 18.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },

  // ---------------------------------------------------------------------------
  // GLM Models (Zhipu AI / Z.AI) - Source: Official Z.AI pricing
  // ---------------------------------------------------------------------------
  'glm-5.2': {
    inputPerMillion: 1.4,
    outputPerMillion: 4.4,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.26,
  },
  'glm-5': {
    inputPerMillion: 1.0,
    outputPerMillion: 3.2,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.2,
  },
  'glm-4.7': {
    inputPerMillion: 0.4,
    outputPerMillion: 1.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.2,
  },
  'glm-4.6': {
    inputPerMillion: 0.35,
    outputPerMillion: 1.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.175,
  },
  'glm-4.6-cc-max': {
    inputPerMillion: 0.35,
    outputPerMillion: 1.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.175,
  },
  'glm-4.5': {
    inputPerMillion: 0.35,
    outputPerMillion: 1.55,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.175,
  },
  'glm-4.5-air': {
    inputPerMillion: 0.13,
    outputPerMillion: 0.85,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.025,
  },

  // ---------------------------------------------------------------------------
  // Kimi Models (Moonshot AI) - Source: Official Kimi Platform pricing
  // inputPerMillion = cache miss price, cacheReadPerMillion = cache hit price
  // ---------------------------------------------------------------------------
  'kimi-k2.5': {
    inputPerMillion: 0.6,
    outputPerMillion: 3.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.1,
  },
  'kimi-for-coding': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-k2-0905-preview': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-k2-turbo-preview': {
    inputPerMillion: 1.15,
    outputPerMillion: 8.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-k2-thinking': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-k2-thinking-turbo': {
    inputPerMillion: 1.15,
    outputPerMillion: 8.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-k2': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.5,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-k2-instruct': {
    inputPerMillion: 1.0,
    outputPerMillion: 3.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'kimi-latest': {
    inputPerMillion: 2.0,
    outputPerMillion: 5.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-latest-128k': {
    inputPerMillion: 2.0,
    outputPerMillion: 5.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-latest-32k': {
    inputPerMillion: 1.0,
    outputPerMillion: 3.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-latest-8k': {
    inputPerMillion: 0.2,
    outputPerMillion: 2.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.15,
  },
  'kimi-thinking-preview': {
    inputPerMillion: 30.0,
    outputPerMillion: 30.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'moonshot-v1-8k': {
    inputPerMillion: 0.2,
    outputPerMillion: 2.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'moonshot-v1-32k': {
    inputPerMillion: 1.0,
    outputPerMillion: 3.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'moonshot-v1-128k': {
    inputPerMillion: 2.0,
    outputPerMillion: 5.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'moonshot-v1-auto': {
    inputPerMillion: 2.0,
    outputPerMillion: 5.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },

  // ---------------------------------------------------------------------------
  // MiniMax Models - Source: https://platform.minimax.io/docs/guides/pricing-paygo
  // ---------------------------------------------------------------------------
  'MiniMax-M3': {
    inputPerMillion: 0.3,
    outputPerMillion: 1.2,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.06,
    serviceTiers: {
      priority: {
        inputPerMillion: 0.45,
        outputPerMillion: 1.8,
        cacheCreationPerMillion: 0.0,
        cacheReadPerMillion: 0.09,
      },
    },
  },
  'MiniMax-M2.5': {
    inputPerMillion: 0.3,
    outputPerMillion: 1.2,
    cacheCreationPerMillion: 0.375,
    cacheReadPerMillion: 0.03,
  },
  'MiniMax-M2.5-lightning': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.4,
    cacheCreationPerMillion: 0.375,
    cacheReadPerMillion: 0.03,
  },
  'MiniMax-M2.1': {
    inputPerMillion: 0.3,
    outputPerMillion: 1.2,
    cacheCreationPerMillion: 0.375,
    cacheReadPerMillion: 0.03,
  },
  'MiniMax-M2.1-lightning': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.4,
    cacheCreationPerMillion: 0.375,
    cacheReadPerMillion: 0.03,
  },
  'MiniMax-M2': {
    inputPerMillion: 0.3,
    outputPerMillion: 1.2,
    cacheCreationPerMillion: 0.375,
    cacheReadPerMillion: 0.03,
  },
  // ---------------------------------------------------------------------------
  // Qwen Models - Source: https://www.alibabacloud.com/help/zh/model-studio/model-pricing
  // ---------------------------------------------------------------------------
  'qwen3-max': {
    inputPerMillion: 1.2,
    outputPerMillion: 6,
    cacheCreationPerMillion: 1.2,
    cacheReadPerMillion: 0.24,
  },
  'qwen3-max-2026-01-23': {
    inputPerMillion: 1.2,
    outputPerMillion: 6,
    cacheCreationPerMillion: 1.2,
    cacheReadPerMillion: 0.24,
  },
  'qwen3-max-preview': {
    inputPerMillion: 1.2,
    outputPerMillion: 6,
    cacheCreationPerMillion: 1.2,
    cacheReadPerMillion: 0.24,
  },
  'qwen3.5-plus': {
    inputPerMillion: 0.4,
    outputPerMillion: 2.4,
    cacheCreationPerMillion: 0.4,
    cacheReadPerMillion: 0.08,
  },
  'qwen3.5-flash': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    cacheCreationPerMillion: 0.1,
    cacheReadPerMillion: 0.02,
  },
  'qwen3-coder-plus': {
    inputPerMillion: 1,
    outputPerMillion: 5,
    cacheCreationPerMillion: 1,
    cacheReadPerMillion: 0.2,
  },
  'qwen3-coder-flash': {
    inputPerMillion: 0.3,
    outputPerMillion: 1.5,
    cacheCreationPerMillion: 0.3,
    cacheReadPerMillion: 0.06,
  },

  // ---------------------------------------------------------------------------
  // DeepSeek Models - Source: better-ccusage
  // ---------------------------------------------------------------------------
  'deepseek-chat': {
    inputPerMillion: 0.27,
    outputPerMillion: 1.1,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.07,
  },
  'deepseek-reasoner': {
    inputPerMillion: 0.55,
    outputPerMillion: 2.19,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.14,
  },
  'deepseek-coder': {
    inputPerMillion: 0.14,
    outputPerMillion: 0.28,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },

  // ---------------------------------------------------------------------------
  // Mistral Models - Source: better-ccusage
  // ---------------------------------------------------------------------------
  'mistral-large-latest': {
    inputPerMillion: 2.0,
    outputPerMillion: 6.0,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'mistral-medium-latest': {
    inputPerMillion: 2.7,
    outputPerMillion: 8.1,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'mistral-small-latest': {
    inputPerMillion: 0.2,
    outputPerMillion: 0.6,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'codestral-latest': {
    inputPerMillion: 0.3,
    outputPerMillion: 0.9,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
};

const MODEL_PRICING_ALIASES: Record<string, string> = {
  // Keep catalog-only IDs on explicit priced equivalents.
  'qwen3-coder': 'qwen3-coder-plus',
  'qwen3-235b': 'qwen3-max',
  'qwen3-vl-plus': 'qwen3.5-plus',
  'qwen3-32b': 'qwen3.5-plus',
  'gemini-3-flash-preview': 'gemini-2.5-flash',
  'gemini-3-flash-preview-customtools': 'gemini-2.5-flash',
  'gemini-3.1-pro-preview': 'gemini-3-pro-preview',
  'gemini-3.1-flash-preview': 'gemini-2.5-flash',
  'gemini-3.1-pro-preview-customtools': 'gemini-3-pro-preview',
  'gemini-3.1-flash-preview-customtools': 'gemini-2.5-flash',
  'gemini-3-1-pro-preview': 'gemini-3-pro-preview',
  'gemini-3-1-flash-preview': 'gemini-2.5-flash',
  'gemini-3-1-pro-preview-customtools': 'gemini-3-pro-preview',
  'gemini-3-1-flash-preview-customtools': 'gemini-2.5-flash',
};

// Default pricing for unknown models
const UNKNOWN_MODEL_PRICING: ModelPricing = {
  inputPerMillion: 3.0,
  outputPerMillion: 15.0,
  cacheCreationPerMillion: 3.75,
  cacheReadPerMillion: 0.3,
};

// ============================================================================
// PRICING FUNCTIONS
// ============================================================================

/**
 * Strip provider prefixes used by routing/catalog metadata.
 * The CCS static table remains model-keyed, so static fallback normalizes
 * provider-qualified model IDs before checking aliases.
 */
function stripProviderPrefix(model: string): string {
  const trimmed = model.trim();
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0) {
    return trimmed;
  }
  return trimmed.slice(slashIndex + 1);
}

/**
 * Normalize model name for matching.
 * Handles variations like provider prefixes and case differences.
 */
function normalizeModelName(model: string): string {
  return stripProviderPrefix(model).toLowerCase();
}

/**
 * Strip trailing date suffix from model name (e.g., "-20260101")
 * Claude session IDs can place dates either at the end or before "-thinking".
 */
function stripDateSuffix(model: string): string {
  if (!model.startsWith('claude-')) {
    return model;
  }

  return model.replace(/-\d{8}(?=-thinking(?:$|:))/g, '').replace(/-\d{8}(?=$|:)/g, '');
}

const NORMALIZED_PRICING_REGISTRY: Record<string, ModelPricing> = Object.entries(
  PRICING_REGISTRY
).reduce<Record<string, ModelPricing>>((acc, [key, pricing]) => {
  acc[normalizeModelName(key)] = pricing;
  return acc;
}, {});

function getLookupCandidates(model: string): string[] {
  const normalized = normalizeModelName(model);
  const baseModel = normalized.split(':')[0];

  const candidates: string[] = [normalized];
  if (baseModel !== normalized) {
    candidates.push(baseModel);
  }

  // Add date-stripped variants (e.g., "claude-opus-4-6-20260101" -> "claude-opus-4-6")
  const stripped = stripDateSuffix(normalized);
  if (stripped !== normalized && !candidates.includes(stripped)) {
    candidates.push(stripped);
  }
  const baseStripped = stripDateSuffix(baseModel);
  if (baseStripped !== baseModel && !candidates.includes(baseStripped)) {
    candidates.push(baseStripped);
  }

  return candidates;
}

function getDirectOrAliasPricing(model: string): ModelPricing | undefined {
  const directPricing = PRICING_REGISTRY[model];
  if (directPricing !== undefined) {
    return directPricing;
  }

  for (const candidate of getLookupCandidates(model)) {
    const normalizedPricing = NORMALIZED_PRICING_REGISTRY[candidate];
    if (normalizedPricing !== undefined) {
      return normalizedPricing;
    }

    const alias = MODEL_PRICING_ALIASES[candidate];
    if (alias !== undefined) {
      const aliasPricing = NORMALIZED_PRICING_REGISTRY[alias];
      if (aliasPricing !== undefined) {
        return aliasPricing;
      }
    }
  }

  return undefined;
}

function getCcsStaticPricing(model: string): ModelPricing | undefined {
  const staticPricing = getDirectOrAliasPricing(model);
  if (staticPricing !== undefined) {
    return staticPricing;
  }

  const providerlessModel = stripProviderPrefix(model);
  if (providerlessModel !== model.trim()) {
    return getDirectOrAliasPricing(providerlessModel);
  }

  return undefined;
}

function getCcsPolicyOverridePricing(model: string): ModelPricing | undefined {
  const providerlessModel = stripProviderPrefix(model);
  const normalized = normalizeModelName(providerlessModel);

  for (const candidate of getLookupCandidates(providerlessModel)) {
    const alias = MODEL_PRICING_ALIASES[candidate];
    if (alias !== undefined) {
      const aliasPricing = NORMALIZED_PRICING_REGISTRY[alias];
      if (aliasPricing !== undefined) {
        return aliasPricing;
      }
    }

    if (candidate !== normalized) {
      const variantPricing = NORMALIZED_PRICING_REGISTRY[candidate];
      if (variantPricing !== undefined) {
        return variantPricing;
      }
    }
  }

  return undefined;
}

function hasProviderContext(model: string, options: PricingLookupOptions): boolean {
  return Boolean(options.provider || /^[^/]+\//.test(model.trim()));
}

/**
 * Apply per-service-tier rates if the resolved model declares them and the
 * caller requested a matching tier. Unknown tiers transparently fall through
 * to the base rates so existing callers stay unaffected.
 *
 * TODO(opus-fast-mode): No production caller currently passes `serviceTier`.
 * Anthropic's `service_tier` is not yet captured on CliproxyRequestDetail, so
 * usage transformers (cliproxy-usage-transformer.ts, data-aggregator.ts) bill
 * fast-mode requests at the standard rate — i.e. fast Opus is under-reported by
 * the tier premium ($10/$50 vs $5/$25). Wire `serviceTier` through once the
 * usage pipeline records it. The schema below is ready for that integration.
 */
function applyServiceTier(pricing: ModelPricing, tier: string | undefined): ModelPricing {
  if (!tier) return pricing;
  const tierRates = pricing.serviceTiers?.[tier];
  if (!tierRates) return pricing;
  return { ...tierRates, serviceTiers: pricing.serviceTiers };
}

/**
 * Get pricing for a model with narrow fuzzy matching fallback.
 * Unknown future model families should fall back instead of inheriting the
 * first known family tier that happens to share a prefix.
 */
export function getModelPricing(model: string, options: PricingLookupOptions = {}): ModelPricing {
  return applyServiceTier(resolveBasePricing(model, options), options.serviceTier);
}

function resolveBasePricing(model: string, options: PricingLookupOptions): ModelPricing {
  if (hasProviderContext(model, options)) {
    const ccsOverridePricing = getCcsPolicyOverridePricing(model);
    if (ccsOverridePricing !== undefined) {
      return ccsOverridePricing;
    }

    const providerPricing = resolveModelsDevPricing(model, options);
    if (providerPricing !== undefined) {
      return providerPricing.pricing;
    }
  }

  const ccsStaticPricing = getCcsStaticPricing(model);
  if (ccsStaticPricing !== undefined) {
    return ccsStaticPricing;
  }

  const modelsDevPricing = resolveModelsDevPricing(model, options);
  if (modelsDevPricing !== undefined) {
    return modelsDevPricing.pricing;
  }

  for (const candidate of getLookupCandidates(model)) {
    // Allow provider/routing wrappers to suffix a canonical model ID.
    for (const [key, pricing] of Object.entries(NORMALIZED_PRICING_REGISTRY)) {
      if (candidate.endsWith(key)) {
        return pricing;
      }
    }
  }

  // Fallback to unknown model pricing
  return UNKNOWN_MODEL_PRICING;
}

/**
 * Calculate cost in USD from token usage and model
 * @param usage - Token counts (input, output, cache creation, cache read)
 * @param model - Model name for pricing lookup
 * @returns Cost in USD
 */
export function calculateCost(
  usage: TokenUsage,
  model: string,
  options: PricingLookupOptions = {}
): number {
  const pricing = getModelPricing(model, options);

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;
  const cacheCreationCost =
    (usage.cacheCreationTokens / 1_000_000) * pricing.cacheCreationPerMillion;
  const cacheReadCost = (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;

  return inputCost + outputCost + cacheCreationCost + cacheReadCost;
}

/**
 * Get list of all known models for UI display
 */
export function getKnownModels(): string[] {
  return [...new Set([...Object.keys(PRICING_REGISTRY), ...getKnownModelsDevModels()])];
}

/**
 * Check if a model has custom pricing (not using fallback)
 */
export function hasCustomPricing(model: string, options: PricingLookupOptions = {}): boolean {
  return (
    getCcsStaticPricing(model) !== undefined ||
    resolveModelsDevPricing(model, options) !== undefined
  );
}
