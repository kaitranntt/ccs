/**
 * Model Pricing Registry & Cost Calculation Helpers
 *
 * All rates are in USD per MILLION tokens.
 */

import { getKnownModelsDevModels, resolveModelsDevPricing } from './models-dev/pricing-resolver';
import {
  MODEL_PRICING_ALIASES,
  PRICING_REGISTRY,
  UNKNOWN_MODEL_PRICING,
} from './model-pricing-catalog';
import type {
  ModelPricing,
  PricingLookupOptions,
  PricingRates,
  TokenUsage,
} from './model-pricing-types';

export type { ModelPricing, PricingLookupOptions, PricingRates, TokenUsage };

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

const CODEX_PRICING_TUNING_REGEX =
  /(?:-(?:none|minimal|low|medium|high|xhigh|max)(?:-fast)?|-fast(?:-(?:none|minimal|low|medium|high|xhigh|max))?|-fast)$/i;

function isCodexTunableGptModel(modelName: string): boolean {
  return /^gpt-[56]/i.test(modelName) || /^codex/i.test(modelName);
}

function stripCodexPricingTuning(modelName: string): string | null {
  if (modelName === 'gpt-5.1-codex-max' || !isCodexTunableGptModel(modelName)) {
    return null;
  }
  const stripped = modelName.replace(CODEX_PRICING_TUNING_REGEX, '');
  if (
    stripped !== modelName &&
    Object.prototype.hasOwnProperty.call(NORMALIZED_PRICING_REGISTRY, stripped)
  ) {
    return stripped;
  }
  return null;
}

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

  // Add codex tuning-stripped variants (e.g., "gpt-6-astra-max-fast" -> "gpt-6-astra")
  const codexStripped = stripCodexPricingTuning(normalized);
  if (codexStripped && !candidates.includes(codexStripped)) {
    candidates.push(codexStripped);
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
  const effectiveTier = options.serviceTier ?? (/-fast(?=-|$)/i.test(model) ? 'fast' : undefined);
  return applyServiceTier(resolveBasePricing(model, options), effectiveTier);
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
  return calculateCostWithPricing(usage, pricing);
}

/** Reuse one price lookup for a batch without changing the token arithmetic. */
export function createCostCalculator(
  model: string,
  options: PricingLookupOptions = {}
): (usage: TokenUsage) => number {
  const pricing = getModelPricing(model, options);
  return (usage) => calculateCostWithPricing(usage, pricing);
}

function calculateCostWithPricing(usage: TokenUsage, pricing: ModelPricing): number {
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
