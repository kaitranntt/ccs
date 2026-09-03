/**
 * UI facade for shared extended-context helpers.
 */

export {
  ANTHROPIC_MODEL_ENV_KEYS,
  EXTENDED_CONTEXT_MODEL_ENV_KEYS,
  EXTENDED_CONTEXT_SUFFIX,
  EXTRA_EXTENDED_CONTEXT_MODEL_ENV_KEYS,
  applyExtendedContextPreferenceToAnthropicModels,
  envKeyAcceptsExtendedContextSuffix,
  isNativeGeminiModel,
  isAnthropicModelEnvKey,
  isExtendedContextModelEnvKey,
  hasAnthropicExtendedContextEnabled,
  hasExtendedContextSuffix,
  applyExtendedContextSuffix,
  isClaudeModelId,
  likelySupportsClaudeExtendedContext,
  stripModelConfigurationSuffixes,
  stripExtendedContextSuffix,
} from '../../../src/shared/extended-context-utils';
