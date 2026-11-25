/**
 * Combined static pricing catalog, aliases, and fallback rates.
 *
 * User-editable pricing configuration for Claude Code usage analytics.
 * Update rates in the provider catalog tables when new models are released.
 *
 * All rates are in USD per MILLION tokens.
 */

import { CLAUDE_PRICING_REGISTRY } from './model-pricing-claude';
import { OPENAI_GOOGLE_GLM_PRICING_REGISTRY } from './model-pricing-openai-google';
import { OTHER_PROVIDERS_PRICING_REGISTRY } from './model-pricing-other';
import type { ModelPricing } from './model-pricing-types';

export const PRICING_REGISTRY: Record<string, ModelPricing> = {
  ...CLAUDE_PRICING_REGISTRY,
  ...OPENAI_GOOGLE_GLM_PRICING_REGISTRY,
  ...OTHER_PROVIDERS_PRICING_REGISTRY,
};

export const MODEL_PRICING_ALIASES: Record<string, string> = {
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
export const UNKNOWN_MODEL_PRICING: ModelPricing = {
  inputPerMillion: 3.0,
  outputPerMillion: 15.0,
  cacheCreationPerMillion: 3.75,
  cacheReadPerMillion: 0.3,
};
