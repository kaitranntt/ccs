/**
 * Thinking configuration and suffix handling
 * Manages thinking budget suffixes for CLIProxyAPIPlus
 */

import type { CLIProxyProvider } from '../types';
import { DEFAULT_THINKING_TIER_DEFAULTS } from '../../config/unified-config-types';
import type { ThinkingConfig } from '../../config/unified-config-types';

import { getModelThinkingSupport, supportsThinking } from '../model-catalog';
import { isThinkingOffValue, validateThinking } from '../thinking-validator';
import { normalizeModelIdForProvider } from '../ai-providers/model-id-normalizer';
import { warn } from '../../utils/ui';
import { getThinkingConfig } from '../../config/config-loader-facade';

/** Model tier types for thinking budget defaults */
export type ModelTier = 'opus' | 'sonnet' | 'haiku';

const CODEX_EFFORT_REGEX = /^(medium|high|xhigh)$/i;
const CODEX_FAST_TUNING_VALUE_REGEX =
  /^(?:(medium|high|xhigh)-fast|fast-(medium|high|xhigh)|fast)$/i;
const CODEX_TUNING_SUFFIX_REGEX =
  /(?:-(?:xhigh|high|medium)(?:-fast)?|-fast(?:-(?:xhigh|high|medium))?)$/i;

/**
 * Normalize model ID for provider capability lookup.
 * Codex may carry effort/service-tier suffixes in legacy "(high)" or current "-high-fast" forms.
 */
function normalizeModelForThinkingLookup(model: string, provider: CLIProxyProvider): string {
  const withoutExtendedContext = model.replace(/\[1m\]$/i, '').trim();
  const providerNormalized = normalizeModelIdForProvider(withoutExtendedContext, provider);

  if (provider !== 'codex') return providerNormalized;

  // New codex suffix forms: gpt-5.4-high-fast, gpt-5.4-fast-high -> gpt-5.4
  const codexSuffixMatch = providerNormalized.match(
    /^(.*?)(?:-(?:xhigh|high|medium)(?:-fast)?|-fast(?:-(?:xhigh|high|medium))?)$/i
  );
  if (codexSuffixMatch?.[1]) {
    return codexSuffixMatch[1].trim();
  }

  // Legacy codex suffix form: gpt-5.3-codex(high) -> gpt-5.3-codex
  const codexLegacyMatch = providerNormalized.match(/^(.*)\((xhigh|high|medium)\)$/i);
  if (codexLegacyMatch?.[1]) {
    return codexLegacyMatch[1].trim();
  }

  return providerNormalized;
}

/**
 * Check if warnings should be shown based on thinking config.
 * Defaults to true if show_warnings is not explicitly false.
 */
function shouldShowWarnings(thinkingConfig: ThinkingConfig): boolean {
  return thinkingConfig.show_warnings !== false;
}

/**
 * Detect tier from model name.
 * Returns 'sonnet' as default if unclear.
 */
export function detectTierFromModel(modelName: string): ModelTier {
  const lower = modelName.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('haiku')) return 'haiku';
  return 'sonnet'; // Default to sonnet (most common)
}

/**
 * Apply thinking suffix to model name.
 * CLIProxyAPIPlus parses suffixes like model(level) or model(budget).
 *
 * @param model - Base model name
 * @param thinkingValue - Level name (e.g., 'high') or numeric budget
 * @returns Model name with thinking suffix, e.g., "gemini-3.1-pro-preview(high)"
 */
export function applyThinkingSuffix(model: string, thinkingValue: string | number): string {
  return applyThinkingSuffixForProvider(model, thinkingValue);
}

/**
 * Apply provider-aware thinking suffix to model name.
 * - Most providers: model(level|budget) e.g. "gemini-2.5-pro(high)"
 * - Codex: model-effort e.g. "gpt-5.3-codex-xhigh"
 */
function applyThinkingSuffixForProvider(
  model: string,
  thinkingValue: string | number,
  provider?: CLIProxyProvider
): string {
  const parenthesizedSuffixMatch = model.match(/\(([^)]+)\)$/);

  // Existing parenthesized suffix:
  // - keep as-is for non-codex providers unless the target model now expects
  //   named levels and we need to rewrite an old numeric suffix
  // - for codex effort levels, normalize to codex model suffix style
  if (parenthesizedSuffixMatch) {
    if (provider === 'codex') {
      const normalizedParensValue = parenthesizedSuffixMatch[1]?.trim().toLowerCase() || '';
      if (CODEX_EFFORT_REGEX.test(normalizedParensValue)) {
        return model.replace(/\([^)]+\)$/, `-${normalizedParensValue}`);
      }
    }

    if (provider) {
      const normalizedBaseModel = normalizeModelForThinkingLookup(model, provider);
      const thinking = getModelThinkingSupport(provider, normalizedBaseModel);
      if (thinking?.type === 'levels') {
        return model.replace(/\([^)]+\)$/, `(${thinkingValue})`);
      }
    }

    return model;
  }

  if (provider === 'codex') {
    if (CODEX_TUNING_SUFFIX_REGEX.test(model)) {
      return model;
    }
    const normalized = String(thinkingValue).trim().toLowerCase();
    if (CODEX_EFFORT_REGEX.test(normalized) || CODEX_FAST_TUNING_VALUE_REGEX.test(normalized)) {
      return `${model}-${normalized}`;
    }
  }

  return `${model}(${thinkingValue})`;
}

/**
 * Get thinking value for tier based on config.
 * Respects provider-specific overrides if configured.
 */
export function getThinkingValueForTier(
  tier: ModelTier,
  provider: CLIProxyProvider,
  thinkingConfig: ThinkingConfig
): string {
  // Check provider-specific override first
  const providerOverride = thinkingConfig.provider_overrides?.[provider]?.[tier];
  if (providerOverride) {
    return providerOverride;
  }

  // Codex effort aliases historically defaulted to xhigh/high/medium per tier.
  // Preserve this behavior when settings are canonicalized (suffix-stripped).
  if (provider === 'codex') {
    if (tier === 'opus') return 'xhigh';
    if (tier === 'sonnet') return 'high';
    return 'medium';
  }

  // Fall back to global tier default (with null guard, uses centralized defaults)
  return thinkingConfig.tier_defaults?.[tier] ?? DEFAULT_THINKING_TIER_DEFAULTS[tier];
}

/**
 * Composite tier config for provider lookup (subset of full CompositeTierConfig)
 */
interface CompositeTierProvider {
  provider?: CLIProxyProvider;
}

/**
 * Apply thinking configuration to env vars.
 * Modifies ANTHROPIC_MODEL and tier models with thinking suffixes.
 *
 * @param envVars - Environment variables to modify
 * @param provider - CLIProxy provider (default provider for base model)
 * @param thinkingOverride - Optional CLI override (takes priority over config)
 * @param compositeTierThinking - Optional per-tier thinking overrides for composite variants
 * @param compositeTiers - Optional per-tier provider config for composite variants
 * @returns Modified env vars with thinking suffixes applied
 */
export function applyThinkingConfig(
  envVars: NodeJS.ProcessEnv,
  provider: CLIProxyProvider,
  thinkingOverride?: string | number,
  compositeTierThinking?: {
    opus?: string;
    sonnet?: string;
    haiku?: string;
  },
  compositeTiers?: {
    opus?: CompositeTierProvider;
    sonnet?: CompositeTierProvider;
    haiku?: CompositeTierProvider;
  }
): NodeJS.ProcessEnv {
  const thinkingConfig = getThinkingConfig();
  const result = { ...envVars };

  // Check if thinking is off
  if (thinkingConfig.mode === 'off' && thinkingOverride === undefined) {
    return result;
  }

  // Explicit "off" (CLI override or manual config override) must disable ALL tier thinking.
  const explicitOffOverride =
    isThinkingOffValue(thinkingOverride) ||
    (thinkingOverride === undefined &&
      thinkingConfig.mode === 'manual' &&
      isThinkingOffValue(thinkingConfig.override));
  if (explicitOffOverride) {
    return result;
  }

  // Get base model to check thinking support
  const baseModel = result.ANTHROPIC_MODEL || '';
  const normalizedBaseModel = normalizeModelForThinkingLookup(baseModel, provider);
  const baseModelSupportsThinking = supportsThinking(provider, normalizedBaseModel);
  if (
    !baseModelSupportsThinking &&
    thinkingOverride !== undefined &&
    shouldShowWarnings(thinkingConfig)
  ) {
    console.warn(
      warn(
        `Model ${baseModel || 'unknown'} (provider: ${provider}) does not support thinking budget. --thinking flag ignored for default model.`
      )
    );
  }

  // Determine thinking value to use
  let thinkingValue: string | number;

  if (thinkingOverride !== undefined) {
    // CLI override takes priority
    thinkingValue = thinkingOverride;
  } else if (thinkingConfig.mode === 'manual' && thinkingConfig.override !== undefined) {
    // Config manual mode with override
    thinkingValue = thinkingConfig.override;
  } else if (thinkingConfig.mode === 'auto') {
    // Auto mode: detect tier and apply default
    const tier = detectTierFromModel(normalizedBaseModel);
    // Check per-tier config first if composite
    const perTierValue = compositeTierThinking?.[tier];
    if (perTierValue !== undefined) {
      thinkingValue = perTierValue;
    } else {
      thinkingValue = getThinkingValueForTier(tier, provider, thinkingConfig);
    }
  } else {
    return result; // No thinking to apply
  }

  if (baseModelSupportsThinking) {
    // Validate thinking value against default model capabilities.
    const validation = validateThinking(provider, normalizedBaseModel, thinkingValue);
    if (validation.warning && shouldShowWarnings(thinkingConfig)) {
      console.warn(warn(validation.warning));
    }
    thinkingValue = validation.value;
  }

  // If auto-detection resolves default tier to "off", skip the main model but still allow
  // explicit per-tier thinking values for other tiers.
  if (isThinkingOffValue(thinkingValue)) {
    const hasPerTierThinking =
      compositeTierThinking &&
      Object.values(compositeTierThinking).some((v) => v !== undefined && !isThinkingOffValue(v));
    if (!hasPerTierThinking) {
      return result; // No thinking to apply anywhere
    }
    // Otherwise, continue to process tiers with their own config (skip main model)
  } else if (baseModelSupportsThinking && result.ANTHROPIC_MODEL) {
    // Apply thinking suffix to main model (only if not off)
    result.ANTHROPIC_MODEL = applyThinkingSuffixForProvider(
      result.ANTHROPIC_MODEL,
      thinkingValue,
      provider
    );
  }

  // Apply to tier models if they support thinking
  const tierModels = [
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  ] as const;

  for (const tierVar of tierModels) {
    const model = result[tierVar];
    if (model) {
      // Get tier-specific thinking value
      const tier = tierVar.includes('OPUS')
        ? 'opus'
        : tierVar.includes('SONNET')
          ? 'sonnet'
          : 'haiku';

      // P2 FIX: Use tier-specific provider from compositeTiers for mixed-provider composites
      // Falls back to the default provider if not a composite or tier not specified
      const tierProvider = compositeTiers?.[tier]?.provider ?? provider;
      const normalizedTierModel = normalizeModelForThinkingLookup(model, tierProvider);

      // Check if this tier's model supports thinking (using tier-specific provider)
      if (!supportsThinking(tierProvider, normalizedTierModel)) {
        continue;
      }

      // Priority chain: CLI --thinking > per-tier config > global config > defaults
      let tierThinkingValue: string | number;
      if (thinkingOverride !== undefined) {
        // CLI override takes priority
        tierThinkingValue = thinkingOverride;
      } else {
        const perTierValue = compositeTierThinking?.[tier];
        if (perTierValue !== undefined) {
          // Per-tier config from composite variant
          tierThinkingValue = perTierValue;
        } else {
          // Global config or defaults (use tier-specific provider for provider overrides)
          tierThinkingValue = getThinkingValueForTier(tier, tierProvider, thinkingConfig);
        }
      }

      // If per-tier thinking is 'off', skip this tier
      if (isThinkingOffValue(tierThinkingValue)) {
        continue;
      }

      // Validate/clamp tier thinking against this specific tier model capabilities.
      const tierValidation = validateThinking(tierProvider, normalizedTierModel, tierThinkingValue);
      if (tierValidation.warning && shouldShowWarnings(thinkingConfig)) {
        console.warn(warn(tierValidation.warning));
      }
      tierThinkingValue = tierValidation.value;
      if (isThinkingOffValue(tierThinkingValue)) {
        continue;
      }

      result[tierVar] = applyThinkingSuffixForProvider(model, tierThinkingValue, tierProvider);
    }
  }

  return result;
}
