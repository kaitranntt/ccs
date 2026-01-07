/**
 * Model Pricing Registry
 *
 * User-editable pricing configuration for Claude Code usage analytics.
 * Update rates below when new models are released or pricing changes.
 *
 * All rates are in USD per MILLION tokens.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheCreationPerMillion: number;
  cacheReadPerMillion: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

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
  // GLM Models (Zhipu AI / Z.AI) - Source: better-ccusage
  // ---------------------------------------------------------------------------
  'glm-4.7': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.2,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.11,
  },
  'glm-4.6': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.2,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.11,
  },
  'glm-4.6-cc-max': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.2,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.11,
  },
  'glm-4.5': {
    inputPerMillion: 0.6,
    outputPerMillion: 2.2,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.11,
  },
  'glm-4.5-air': {
    inputPerMillion: 0.2,
    outputPerMillion: 1.1,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.03,
  },

  // ---------------------------------------------------------------------------
  // Kimi Models (Moonshot AI) - Source: better-ccusage
  // ---------------------------------------------------------------------------
  'kimi-for-coding': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'kimi-k2-0905-preview': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'kimi-k2-turbo-preview': {
    inputPerMillion: 0.15,
    outputPerMillion: 1.15,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'kimi-k2-thinking': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
  },
  'kimi-k2-thinking-turbo': {
    inputPerMillion: 0.15,
    outputPerMillion: 1.15,
    cacheCreationPerMillion: 0.0,
    cacheReadPerMillion: 0.0,
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
  // MiniMax Models - Source: https://platform.minimax.io/docs/pricing/pay-as-you-go
  // ---------------------------------------------------------------------------
  'MiniMax-M2.1': {
    inputPerMillion: 0.3,
    outputPerMillion: 1.2,
    cacheCreationPerMillion: 0.375,
    cacheReadPerMillion: 0.03,
  },
  'MiniMax-M2.1-lightning': {
    inputPerMillion: 0.3,
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
 * Normalize model name for matching
 * Handles variations like provider prefixes and case differences
 */
function normalizeModelName(model: string): string {
  // Remove provider prefixes (e.g., "anthropic/claude-..." -> "claude-...")
  const normalized = model.toLowerCase().replace(/^[^/]+\//, '');
  return normalized;
}

/**
 * Get pricing for a model with fuzzy matching fallback
 * @param model - Model name (exact or with provider prefix)
 * @returns ModelPricing for the model or fallback pricing
 */
export function getModelPricing(model: string): ModelPricing {
  // Try exact match first
  if (PRICING_REGISTRY[model]) {
    return PRICING_REGISTRY[model];
  }

  // Try normalized match
  const normalized = normalizeModelName(model);
  if (PRICING_REGISTRY[normalized]) {
    return PRICING_REGISTRY[normalized];
  }

  // Try suffix matching (e.g., "claude-sonnet-4-5" matches "*-claude-sonnet-4-5")
  for (const [key, pricing] of Object.entries(PRICING_REGISTRY)) {
    if (normalized.endsWith(key) || key.endsWith(normalized)) {
      return pricing;
    }
  }

  // Try partial matching for model families
  for (const [key, pricing] of Object.entries(PRICING_REGISTRY)) {
    // Match by model family prefix
    if (normalized.startsWith(key.split('-').slice(0, 2).join('-'))) {
      return pricing;
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
export function calculateCost(usage: TokenUsage, model: string): number {
  const pricing = getModelPricing(model);

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
  return Object.keys(PRICING_REGISTRY);
}

/**
 * Check if a model has custom pricing (not using fallback)
 */
export function hasCustomPricing(model: string): boolean {
  return (
    PRICING_REGISTRY[model] !== undefined ||
    PRICING_REGISTRY[normalizeModelName(model)] !== undefined
  );
}
