/**
 * Shared extended context helpers used by CLI + UI.
 */

/** Extended context suffix recognized by Claude Code. */
export const EXTENDED_CONTEXT_SUFFIX = '[1m]';
export const ANTHROPIC_MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
] as const;

export type AnthropicModelEnvKey = (typeof ANTHROPIC_MODEL_ENV_KEYS)[number];

/**
 * Model env keys outside the Anthropic tier mappings that still carry a plain
 * model id, so the extended-context preference has to cover them too. Kept
 * separate from ANTHROPIC_MODEL_ENV_KEYS, which also drives routing, model-id
 * normalization and profile validation.
 */
export const EXTRA_EXTENDED_CONTEXT_MODEL_ENV_KEYS = ['CLAUDE_CODE_SUBAGENT_MODEL'] as const;

/** Every model env key the [1m] preference is applied to. */
export const EXTENDED_CONTEXT_MODEL_ENV_KEYS = [
  ...ANTHROPIC_MODEL_ENV_KEYS,
  ...EXTRA_EXTENDED_CONTEXT_MODEL_ENV_KEYS,
] as const;

export type ExtendedContextModelEnvKey = (typeof EXTENDED_CONTEXT_MODEL_ENV_KEYS)[number];

const ANTHROPIC_MODEL_ENV_KEY_SET = new Set<string>(ANTHROPIC_MODEL_ENV_KEYS);

const EXTENDED_CONTEXT_MODEL_ENV_KEY_SET = new Set<string>(EXTENDED_CONTEXT_MODEL_ENV_KEYS);

/**
 * Keys whose value Claude Code resolves through a resolver that removes [1m]
 * before use. ANTHROPIC_DEFAULT_FABLE_MODEL is the only one today: its resolver
 * strips the suffix (unlike the opus/sonnet resolvers, which pass the value
 * through), and the stripped env-supplied default is then held to the standard
 * 200k window instead of the model's native 1M. Writing [1m] here therefore
 * costs the long context window rather than granting it, and Fable models are
 * natively 1M, so the suffix is never needed on this key.
 */
const SUFFIX_STRIPPING_MODEL_ENV_KEYS = new Set<string>(['ANTHROPIC_DEFAULT_FABLE_MODEL']);

/** True when writing an explicit [1m] suffix into this env key is meaningful. */
export function envKeyAcceptsExtendedContextSuffix(key: string): boolean {
  return !SUFFIX_STRIPPING_MODEL_ENV_KEYS.has(key);
}

/** Check if model is a native Gemini model (auto-enabled behavior). */
export function isNativeGeminiModel(modelId: string): boolean {
  return modelId.toLowerCase().startsWith('gemini-');
}

/** Check if model already has [1m] suffix. */
export function hasExtendedContextSuffix(model: string): boolean {
  return model.toLowerCase().endsWith(EXTENDED_CONTEXT_SUFFIX.toLowerCase());
}

/** Apply [1m] suffix to model if not already present. */
export function applyExtendedContextSuffix(model: string): string {
  if (!model) return model;
  if (hasExtendedContextSuffix(model)) return model;
  return `${model}${EXTENDED_CONTEXT_SUFFIX}`;
}

/** Strip [1m] suffix from model string. */
export function stripExtendedContextSuffix(model: string): string {
  if (!model) return model;
  return hasExtendedContextSuffix(model) ? model.slice(0, -EXTENDED_CONTEXT_SUFFIX.length) : model;
}

/** True when key belongs to Anthropic model mapping state. */
export function isAnthropicModelEnvKey(key: string): key is AnthropicModelEnvKey {
  return ANTHROPIC_MODEL_ENV_KEY_SET.has(key);
}

/** True when key holds a model id the [1m] preference is applied to. */
export function isExtendedContextModelEnvKey(key: string): key is ExtendedContextModelEnvKey {
  return EXTENDED_CONTEXT_MODEL_ENV_KEY_SET.has(key);
}

/** Strip transient config suffixes so model IDs can be checked against catalogs. */
export function stripModelConfigurationSuffixes(modelId: string): string {
  return stripExtendedContextSuffix(modelId.trim()).replace(/\([^)]+\)$/, '');
}

/** Whether any saved Anthropic model mapping explicitly requests [1m]. */
export function hasAnthropicExtendedContextEnabled(
  env: Partial<Record<string, string | undefined>>
): boolean {
  return EXTENDED_CONTEXT_MODEL_ENV_KEYS.some((key) => {
    const value = env[key];
    return typeof value === 'string' && hasExtendedContextSuffix(value);
  });
}

/** Apply or strip [1m] across Anthropic model mappings while honoring compatibility. */
export function applyExtendedContextPreferenceToAnthropicModels<
  T extends Record<string, string | undefined>,
>(
  env: T,
  enabled: boolean,
  options: {
    supportsExtendedContext?: (modelId: string, key: ExtendedContextModelEnvKey) => boolean;
  } = {}
): T {
  const nextEnv: Record<string, string | undefined> = { ...env };

  for (const key of EXTENDED_CONTEXT_MODEL_ENV_KEYS) {
    const value = nextEnv[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }

    const modelId = stripModelConfigurationSuffixes(value);
    const supported =
      envKeyAcceptsExtendedContextSuffix(key) &&
      (options.supportsExtendedContext?.(modelId, key) ?? true);
    nextEnv[key] =
      enabled && supported ? applyExtendedContextSuffix(value) : stripExtendedContextSuffix(value);
  }

  return nextEnv as T;
}

/** Detect Claude model identifiers, regardless of transient [1m]/(thinking) suffixes. */
export function isClaudeModelId(modelId: string): boolean {
  return stripModelConfigurationSuffixes(modelId).toLowerCase().startsWith('claude-');
}

/**
 * Conservative Claude long-context support heuristic for generic API profile flows.
 * Haiku stays plain; Opus/Sonnet default to opt-in [1m].
 */
export function likelySupportsClaudeExtendedContext(modelId: string): boolean {
  const baseModel = stripModelConfigurationSuffixes(modelId).toLowerCase();
  return baseModel.startsWith('claude-') && !baseModel.startsWith('claude-haiku-');
}
