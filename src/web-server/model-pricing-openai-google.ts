/**
 * OpenAI, Google Gemini, and GLM model pricing entries (USD per million tokens).
 */

import { buildRates, type ModelPricing } from './model-pricing-types';

export const OPENAI_GOOGLE_GLM_PRICING_REGISTRY: Record<string, ModelPricing> = {
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
  // GPT-6 Astra ($10/$50, fast 2x)
  'gpt-6-astra': {
    ...buildRates(10.0, 50.0),
    serviceTiers: {
      fast: buildRates(20.0, 100.0),
    },
  },
  // GPT-6.1 Sol — Official pricing: ≤272k: $2/$10, 50% cheaper cache read $0.10, fast 2x ($4/$20).
  // Using standard ≤272k pricing as default (per-request >272k long-context billed at 2x input / 1.5x output).
  'gpt-6.1-sol': {
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
    cacheCreationPerMillion: 2.5,
    cacheReadPerMillion: 0.1,
    serviceTiers: {
      fast: {
        inputPerMillion: 4.0,
        outputPerMillion: 20.0,
        cacheCreationPerMillion: 5.0,
        cacheReadPerMillion: 0.2,
      },
    },
  },
  // GPT-6 Sol — Official pricing: ≤272k: $2/$10, fast 2x ($4/$20).
  // Using standard ≤272k pricing as default.
  'gpt-6-sol': {
    ...buildRates(2.0, 10.0),
    serviceTiers: {
      fast: buildRates(4.0, 20.0),
    },
  },
  // GPT-6 Luna — Official pricing: ≤272k: $0.10/$0.50, fast 2x ($0.20/$1.00).
  // Using standard ≤272k pricing as default.
  'gpt-6-luna': {
    ...buildRates(0.1, 0.5),
    serviceTiers: {
      fast: buildRates(0.2, 1.0),
    },
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
};
