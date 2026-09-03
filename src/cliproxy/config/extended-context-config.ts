/**
 * Extended Context Configuration
 *
 * Handles the [1m] suffix for models supporting 1M token context window.
 * Claude Code recognizes this suffix to enable extended context.
 *
 * Behavior:
 * - Gemini family (gemini-*): Auto-enabled by default
 * - Claude (Anthropic): Opt-in via --1m flag
 */

import type { CLIProxyProvider } from '../types';
import { getDefaultFableTierModel, supportsExtendedContext } from '../model-catalog';
import { warn } from '../../utils/ui';
import {
  ANTHROPIC_MODEL_ENV_KEYS,
  EXTENDED_CONTEXT_MODEL_ENV_KEYS,
  applyExtendedContextPreferenceToAnthropicModels,
  applyExtendedContextSuffix as applyExtendedContextSuffixShared,
  hasExtendedContextSuffix,
  isNativeGeminiModel,
  stripExtendedContextSuffix,
  stripModelConfigurationSuffixes,
} from '../../shared/extended-context-utils';

// Backward-compatible export retained for tests/importers that reference this module.
export function applyExtendedContextSuffix(modelId: string): string {
  return applyExtendedContextSuffixShared(modelId);
}

/**
 * Determine if extended context should be applied to a model.
 *
 * @param provider - CLIProxy provider
 * @param modelId - Base model ID (without suffixes)
 * @param extendedContextOverride - CLI override (true = force on, false = force off, undefined = auto)
 * @returns Whether to apply extended context suffix
 */
export function shouldApplyExtendedContext(
  provider: CLIProxyProvider,
  modelId: string,
  extendedContextOverride?: boolean
): boolean {
  // Explicit override takes priority
  if (extendedContextOverride === true) {
    // User explicitly requested --1m
    const supported = supportsExtendedContext(provider, modelId);
    if (!supported) {
      console.error(warn(`Model "${modelId}" does not support 1M extended context. Flag ignored.`));
    }
    return supported;
  }
  if (extendedContextOverride === false) {
    // User explicitly disabled with --no-1m
    return false;
  }

  // Auto behavior: enable for native Gemini models only
  if (isNativeGeminiModel(modelId)) {
    return supportsExtendedContext(provider, modelId);
  }

  // For other models (Claude, etc.), default to off - require explicit --1m
  return false;
}

/**
 * Whether a saved Anthropic tier mapping still carries a [1m] suffix after the
 * per-key pass, i.e. the launch is a long-context launch.
 */
function hasSavedLongContextTier(envVars: NodeJS.ProcessEnv): boolean {
  return ANTHROPIC_MODEL_ENV_KEYS.some((key) => {
    const value = envVars[key];
    return typeof value === 'string' && hasExtendedContextSuffix(value);
  });
}

/**
 * Give a long-context launch a fable tier when the profile does not map one.
 *
 * Claude Code falls back to its own bare Fable id for `--model fable` / the
 * fable tier, and behind a proxy base URL a bare natively-1M id is clamped to
 * the standard 200k window. Only the [1m] suffix lifts that clamp, so a
 * model-neutral claude profile that asked for 1M elsewhere would otherwise get
 * a 200k Fable. An explicit mapping (dashboard "fable tier" field or settings
 * file) always wins; providers without a catalog Fable model are untouched.
 */
function fillFableTierForLongContext(envVars: NodeJS.ProcessEnv, provider: CLIProxyProvider): void {
  const existing = envVars.ANTHROPIC_DEFAULT_FABLE_MODEL;
  if (typeof existing === 'string' && existing.trim().length > 0) {
    return;
  }
  const fableModel = getDefaultFableTierModel(provider);
  if (!fableModel || !supportsExtendedContext(provider, fableModel)) {
    return;
  }
  envVars.ANTHROPIC_DEFAULT_FABLE_MODEL = applyExtendedContextSuffixShared(fableModel);
}

/**
 * Apply extended context configuration to env vars.
 * Modifies ANTHROPIC_MODEL and tier models with [1m] suffix.
 *
 * @param envVars - Environment variables to modify (mutated in place)
 * @param provider - CLIProxy provider
 * @param extendedContextOverride - CLI override (true = force on, false = force off, undefined = auto)
 */
export function applyExtendedContextConfig(
  envVars: NodeJS.ProcessEnv,
  provider: CLIProxyProvider,
  extendedContextOverride?: boolean
): void {
  if (extendedContextOverride === true || extendedContextOverride === false) {
    Object.assign(
      envVars,
      applyExtendedContextPreferenceToAnthropicModels(envVars, extendedContextOverride, {
        supportsExtendedContext: (modelId) =>
          shouldApplyExtendedContext(
            provider,
            stripModelConfigurationSuffixes(modelId),
            extendedContextOverride
          ),
      })
    );
    if (extendedContextOverride) {
      fillFableTierForLongContext(envVars, provider);
    }
    return;
  }

  // Auto mode (no explicit --1m/--no-1m this launch): don't force-strip a
  // previously saved [1m] preference just because the model is Claude — only
  // strip when the model no longer supports extended context. Native Gemini
  // models still get auto-toggled based on catalog support.
  for (const key of EXTENDED_CONTEXT_MODEL_ENV_KEYS) {
    const value = envVars[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }
    const modelId = stripModelConfigurationSuffixes(value);

    if (isNativeGeminiModel(modelId)) {
      envVars[key] = supportsExtendedContext(provider, modelId)
        ? applyExtendedContextSuffixShared(value)
        : stripExtendedContextSuffix(value);
      continue;
    }

    if (hasExtendedContextSuffix(value) && !supportsExtendedContext(provider, modelId)) {
      envVars[key] = stripExtendedContextSuffix(value);
    }
  }

  if (hasSavedLongContextTier(envVars)) {
    fillFableTierForLongContext(envVars, provider);
  }
}
