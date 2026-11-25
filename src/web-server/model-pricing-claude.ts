/**
 * Claude (Anthropic) model pricing entries (USD per million tokens).
 */

import { buildRates, type ModelPricing } from './model-pricing-types';

// Anthropic fast-mode premiums (per
// https://platform.claude.com/docs/en/about-claude/pricing#fast-mode-pricing).
// Opus 4.6 and 4.7 share the same 6x premium; 4.8 is 2x. Shared constants keep
// the registry entries in sync rather than repeating the literal rates.
const OPUS_46_47_FAST_RATES = buildRates(30.0, 150.0);
const OPUS_48_FAST_RATES = buildRates(10.0, 50.0);

export const CLAUDE_PRICING_REGISTRY: Record<string, ModelPricing> = {
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
  // Claude Haiku 5.5 - two rate cards chosen by prompt length: $0.10/$0.50 up to
  // 100K prompt tokens, $0.50/$2.50 above. Cost is calculated on aggregated usage,
  // so the per-request card can't be picked here; using the <=100K card as default
  // (same approach as Gemini 3) under-reports prompts longer than 100K tokens.
  'claude-haiku-5-5': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    cacheCreationPerMillion: 0.125,
    cacheReadPerMillion: 0.01,
  },
  'claude-haiku-5-5-thinking': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    cacheCreationPerMillion: 0.125,
    cacheReadPerMillion: 0.01,
  },
  'claude-haiku-5.5': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    cacheCreationPerMillion: 0.125,
    cacheReadPerMillion: 0.01,
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
  // Claude Sonnet 5 ($2/$10) — the launch introductory rate is now the standard
  // price; Anthropic cancelled the scheduled 2026-09-01 increase to $3/$15.
  // Registered explicitly so it is a known model rather than relying on the
  // unknown-model fallback.
  'claude-sonnet-5': {
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 2.5,
    cacheReadPerMillion: 0.2,
  },
  'claude-sonnet-5-thinking': {
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 2.5,
    cacheReadPerMillion: 0.2,
  },
  // Claude Sonnet 5.5 ($2/$10) — same rates as Sonnet 5 (released 2026-09-28).
  // Standard 0.1x cache-read multiplier, no fast mode. Without these entries the
  // id falls through to the $3/$15 unknown-model fallback and overstates cost 1.5x.
  'claude-sonnet-5-5': {
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 2.5,
    cacheReadPerMillion: 0.2,
  },
  'claude-sonnet-5-5-thinking': {
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 2.5,
    cacheReadPerMillion: 0.2,
  },
  'claude-sonnet-5.5': {
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 2.5,
    cacheReadPerMillion: 0.2,
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
  // Claude Opus 5 ($5/$25) — Claude 5 generation Opus (released 2026-07-24).
  // Rates mirror Opus 4.8 (same Opus tier); fast mode uses Anthropic's documented
  // $10/$50 rates. Registered explicitly so it resolves to
  // Opus-tier pricing instead of the unknown-model fallback.
  // Claude Opus 5.5 ($4/$20) — Claude 5.5 generation Opus (released 2026-09-22).
  // Rates: $4 input, $20 output, $5 cache write, $0.20 cache read (5% of input).
  // Fast mode: 2x ($8/$40, cache write $10, cache read $0.40).
  'claude-opus-5-5': {
    inputPerMillion: 4.0,
    outputPerMillion: 20.0,
    cacheCreationPerMillion: 5.0,
    cacheReadPerMillion: 0.2,
    serviceTiers: {
      fast: {
        inputPerMillion: 8.0,
        outputPerMillion: 40.0,
        cacheCreationPerMillion: 10.0,
        cacheReadPerMillion: 0.4,
      },
    },
  },
  'claude-opus-5.5': {
    inputPerMillion: 4.0,
    outputPerMillion: 20.0,
    cacheCreationPerMillion: 5.0,
    cacheReadPerMillion: 0.2,
  },

  'claude-opus-5': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheCreationPerMillion: 6.25,
    cacheReadPerMillion: 0.5,
    serviceTiers: {
      fast: OPUS_48_FAST_RATES,
    },
  },
  'claude-opus-5-thinking': {
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
  // Claude Fable 5.1 ($10/$50) — same tier and base rates as Fable 5, but cache
  // hits are billed at 0.025x base input ($0.25/MTok) instead of the usual 0.1x.
  // Anthropic applies that reduced multiplier only to Fable/Mythos 5.1 and 5.2,
  // so this entry cannot use CACHE_READ_MULTIPLIER-derived rates.
  'claude-fable-5-1': {
    inputPerMillion: 10.0,
    outputPerMillion: 50.0,
    cacheCreationPerMillion: 12.5,
    cacheReadPerMillion: 0.25,
  },
  // Claude Fable 5.2 ($8/$40) — successor to Fable 5.1 at a lower price. Cache
  // writes $10 (1.25x), cache hits $0.20 (0.025x, the same reduced multiplier
  // as Fable 5.1), so this entry cannot use CACHE_READ_MULTIPLIER-derived rates.
  // Fast mode: 2x ($16/$80, cache write $20, cache read $0.40).
  'claude-fable-5-2': {
    inputPerMillion: 8.0,
    outputPerMillion: 40.0,
    cacheCreationPerMillion: 10.0,
    cacheReadPerMillion: 0.2,
    serviceTiers: {
      fast: {
        inputPerMillion: 16.0,
        outputPerMillion: 80.0,
        cacheCreationPerMillion: 20.0,
        cacheReadPerMillion: 0.4,
      },
    },
  },
};
