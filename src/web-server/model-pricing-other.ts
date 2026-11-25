/**
 * Kimi, MiniMax, Qwen, DeepSeek, and Mistral model pricing entries (USD per million tokens).
 */

import type { ModelPricing } from './model-pricing-types';

export const OTHER_PROVIDERS_PRICING_REGISTRY: Record<string, ModelPricing> = {
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
