/**
 * Model ID normalization helpers.
 *
 * Handles provider-aware compatibility between dotted and hyphenated Claude
 * model version formats (e.g., 4.6 vs 4-6).
 */

import type { CLIProxyProvider } from '../types';
import { ANTHROPIC_MODEL_ENV_KEYS } from '../../shared/extended-context-utils';

/** Env vars that carry model identifiers. */
export const MODEL_ENV_VAR_KEYS = ANTHROPIC_MODEL_ENV_KEYS;

type ProviderLike = CLIProxyProvider | string | null | undefined;

const CLAUDE_DOTTED_VERSION_REGEX = /claude-(sonnet|opus|haiku)-(\d+)\.(\d+)(?=(?:$|-|\[|\(|\/))/gi;
const CLAUDE_DOTTED_THINKING_REGEX =
  /claude-(sonnet|opus|haiku)-(\d+)\.(\d+)-thinking(?=(?:$|-|\[|\(|\/))/gi;
const DEPRECATED_ANTIGRAVITY_SONNET_46_THINKING_REGEX =
  /claude-sonnet-4(?:[.-])6-thinking(?=(?:$|-|\[|\(|\/))/gi;
const CANONICAL_ANTIGRAVITY_SONNET_46_MODEL = 'claude-sonnet-4-6';
const DENIED_ANTIGRAVITY_MODEL_REGEX =
  /claude-(?:opus|sonnet)-4(?:[.-])5(?:-thinking)?(?=(?:$|[^a-z0-9]))/i;
const DENIED_ANTIGRAVITY_OPUS_45_REGEX =
  /claude-opus-4(?:[.-])5(?:-thinking)?(?=(?:$|[^a-z0-9]))/gi;
const DENIED_ANTIGRAVITY_SONNET_45_REGEX =
  /claude-sonnet-4(?:[.-])5(?:-thinking)?(?=(?:$|[^a-z0-9]))/gi;
const CANONICAL_ANTIGRAVITY_OPUS_46_MODEL = 'claude-opus-4-6-thinking';
const CODEX_TUNING_SUFFIX_TOKEN_REGEX = /-(xhigh|high|medium|fast)$/i;
const CODEX_LEGACY_MODEL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'gpt-5-codex': 'gpt-5.4',
  'gpt-5-codex-mini': 'gpt-5.4-mini',
  'gpt-5-mini': 'gpt-5.4-mini',
  'gpt-5.1-codex': 'gpt-5.2',
  'gpt-5.1-codex-mini': 'gpt-5.4-mini',
  'gpt-5.1-codex-max': 'gpt-5.4',
  'gpt-5.2-codex': 'gpt-5.2',
  'gpt-5.2-codex-mini': 'gpt-5.4-mini',
});
const IFLOW_LEGACY_MODEL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'iflow-default': 'qwen3-coder-plus',
  'kimi-k2.5': 'kimi-k2',
  'deepseek-v3.2-chat': 'deepseek-v3.2',
  'glm-4.7': 'glm-4.6',
  'minimax-m2.5': 'qwen3-coder-plus',
});

function trimModelId(model: string): string {
  return model.trim();
}

function splitBaseModelAndSuffix(model: string): { baseModel: string; suffix: string } {
  const openParenIndex = model.indexOf('(');
  const openBracketIndex = model.indexOf('[');
  const suffixIndexCandidates = [openParenIndex, openBracketIndex].filter((index) => index >= 0);

  if (suffixIndexCandidates.length === 0) {
    return { baseModel: model, suffix: '' };
  }

  const suffixStart = Math.min(...suffixIndexCandidates);
  return {
    baseModel: model.slice(0, suffixStart),
    suffix: model.slice(suffixStart),
  };
}

function splitCodexTuningSuffix(model: string): { baseModel: string; suffix: string } {
  let baseModel = model;
  let effort: string | null = null;
  let serviceTier: 'fast' | null = null;

  for (let consumed = 0; consumed < 2; consumed += 1) {
    const match = baseModel.match(CODEX_TUNING_SUFFIX_TOKEN_REGEX);
    if (!match?.[1]) break;

    const token = match[1].toLowerCase();
    if (token === 'fast') {
      if (serviceTier) break;
      serviceTier = 'fast';
    } else {
      if (effort) break;
      effort = token;
    }

    baseModel = baseModel.slice(0, -match[0].length);
  }

  const suffix = [effort, serviceTier].filter(Boolean).join('-');
  return {
    baseModel,
    suffix: suffix ? `-${suffix}` : '',
  };
}

/**
 * Extract provider segment from `/api/provider/{provider}` request paths.
 *
 * @example
 * extractProviderFromPathname('/api/provider/agy/v1/messages')
 * // => 'agy'
 */
export function extractProviderFromPathname(pathname: string): string | null {
  const match = pathname.match(/\/api\/provider\/([^/]+)/i);
  if (!match?.[1]) return null;
  return match[1].toLowerCase();
}

/** Whether the provider uses Antigravity model routing conventions. */
export function isAntigravityProvider(provider: ProviderLike): boolean {
  if (typeof provider !== 'string') return false;
  const normalized = provider.trim().toLowerCase();
  return normalized === 'agy' || normalized === 'antigravity';
}

/** Whether provider maps to Codex model canonicalization rules. */
export function isCodexProvider(provider: ProviderLike): boolean {
  if (typeof provider !== 'string') return false;
  return provider.trim().toLowerCase() === 'codex';
}

/** Whether provider maps to iFlow model alias canonicalization rules. */
export function isIFlowProvider(provider: ProviderLike): boolean {
  if (typeof provider !== 'string') return false;
  return provider.trim().toLowerCase() === 'iflow';
}

/** Strip Codex effort/service-tier suffixes while preserving trailing config suffixes. */
export function stripCodexEffortSuffix(model: string): string {
  const trimmed = trimModelId(model);
  const { baseModel, suffix } = splitBaseModelAndSuffix(trimmed);
  const { baseModel: withoutEffort } = splitCodexTuningSuffix(baseModel);
  return `${withoutEffort}${suffix}`;
}

/** Normalize legacy Codex aliases to the current public Codex model IDs. */
export function normalizeCodexLegacyModelAliases(model: string): string {
  const trimmed = trimModelId(model);
  const { baseModel, suffix } = splitBaseModelAndSuffix(trimmed);
  const { baseModel: baseWithoutEffort, suffix: tuningSuffix } = splitCodexTuningSuffix(baseModel);
  const replacement = CODEX_LEGACY_MODEL_ALIASES[baseWithoutEffort.trim().toLowerCase()];
  if (!replacement) {
    return trimmed;
  }
  return `${replacement}${tuningSuffix}${suffix}`;
}

/**
 * Normalize known legacy iFlow model aliases to current upstream model IDs.
 * Preserves suffixes such as (budget) and [1m].
 */
export function normalizeIFlowLegacyModelAliases(model: string): string {
  const trimmed = trimModelId(model);
  const { baseModel, suffix } = splitBaseModelAndSuffix(trimmed);
  const replacement = IFLOW_LEGACY_MODEL_ALIASES[baseModel.trim().toLowerCase()];
  if (!replacement) {
    return trimmed;
  }
  return `${replacement}${suffix}`;
}

/** Normalize Claude dotted major.minor IDs to hyphenated format. */
export function normalizeClaudeDottedMajorMinor(model: string): string {
  return model.replace(
    CLAUDE_DOTTED_VERSION_REGEX,
    (_match: string, family: string, major: string, minor: string) =>
      `claude-${family.toLowerCase()}-${major}-${minor}`
  );
}

/**
 * Normalize only dotted Claude thinking IDs to hyphenated format.
 * Keeps non-thinking dotted IDs unchanged.
 */
export function normalizeClaudeDottedThinkingMajorMinor(model: string): string {
  return model.replace(
    CLAUDE_DOTTED_THINKING_REGEX,
    (_match: string, family: string, major: string, minor: string) =>
      `claude-${family.toLowerCase()}-${major}-${minor}-thinking`
  );
}

/**
 * Antigravity no longer exposes `claude-sonnet-4-6-thinking`.
 * Canonicalize legacy aliases to `claude-sonnet-4-6` while preserving suffixes.
 */
export function normalizeDeprecatedAntigravityModelAliases(model: string): string {
  return model.replace(
    DEPRECATED_ANTIGRAVITY_SONNET_46_THINKING_REGEX,
    CANONICAL_ANTIGRAVITY_SONNET_46_MODEL
  );
}

/**
 * Migrate denylisted Antigravity Claude 4.5 aliases to supported Claude 4.6 IDs.
 * This is intended for repairing stale local settings at runtime.
 */
export function migrateDeniedAntigravityModelAliases(model: string): string {
  const normalized = normalizeClaudeDottedMajorMinor(trimModelId(model));
  return normalized
    .replace(DENIED_ANTIGRAVITY_OPUS_45_REGEX, CANONICAL_ANTIGRAVITY_OPUS_46_MODEL)
    .replace(DENIED_ANTIGRAVITY_SONNET_45_REGEX, CANONICAL_ANTIGRAVITY_SONNET_46_MODEL);
}

/**
 * Deprecated Antigravity models that are denylisted and should not be used.
 */
export function isDeniedAntigravityModelId(model: string): boolean {
  return DENIED_ANTIGRAVITY_MODEL_REGEX.test(trimModelId(model));
}

/**
 * Returns deny reason when model ID is blocked for the given provider.
 */
export function getDeniedModelIdReasonForProvider(
  model: string,
  provider: ProviderLike
): string | null {
  if (!isAntigravityProvider(provider)) return null;
  const normalized = normalizeClaudeDottedMajorMinor(trimModelId(model));
  if (!isDeniedAntigravityModelId(normalized)) return null;
  return 'Antigravity denylist: Claude Opus 4.5 and Claude Sonnet 4.5 are deprecated.';
}

/**
 * Normalize model ID for a specific provider.
 * Antigravity requires hyphenated Claude major.minor model IDs.
 *
 * @example
 * normalizeModelIdForProvider('claude-opus-4.6-thinking', 'agy')
 * // => 'claude-opus-4-6-thinking'
 *
 * @example
 * normalizeModelIdForProvider('claude-opus-4.6-thinking', 'gemini')
 * // => 'claude-opus-4.6-thinking'
 */
export function normalizeModelIdForProvider(model: string, provider: ProviderLike): string {
  const trimmedModel = trimModelId(model);
  if (isIFlowProvider(provider)) {
    return normalizeIFlowLegacyModelAliases(trimmedModel);
  }
  if (isCodexProvider(provider)) {
    return normalizeCodexLegacyModelAliases(trimmedModel);
  }
  if (!isAntigravityProvider(provider)) return trimmedModel;
  const normalizedDottedVersion = normalizeClaudeDottedMajorMinor(trimmedModel);
  return normalizeDeprecatedAntigravityModelAliases(normalizedDottedVersion);
}

/**
 * Canonicalize model ID for provider-specific compatibility.
 * - Codex: preserve valid effort suffixes while normalizing legacy aliases.
 * - Antigravity: normalize dotted/historical aliases.
 */
export function canonicalizeModelIdForProvider(model: string, provider: ProviderLike): string {
  const trimmedModel = trimModelId(model);
  return normalizeModelIdForProvider(trimmedModel, provider);
}

/**
 * Normalize model ID for request routing.
 * - Antigravity routes: normalize all dotted Claude major.minor forms.
 * - Root/composite routes: normalize only thinking forms to avoid mutating
 *   valid non-thinking dotted IDs used by other providers.
 *
 * @example
 * normalizeModelIdForRouting('claude-sonnet-4.6-thinking', null)
 * // => 'claude-sonnet-4-6'
 *
 * @example
 * normalizeModelIdForRouting('claude-sonnet-4.6', null)
 * // => 'claude-sonnet-4.6'
 */
export function normalizeModelIdForRouting(model: string, provider: ProviderLike): string {
  const trimmedModel = trimModelId(model);
  if (isAntigravityProvider(provider)) {
    return normalizeModelIdForProvider(trimmedModel, provider);
  }
  // Explicit provider routes still apply provider-specific canonicalization.
  if (typeof provider === 'string' && provider.trim().length > 0) {
    return normalizeModelIdForProvider(trimmedModel, provider);
  }
  const normalizedThinking = normalizeClaudeDottedThinkingMajorMinor(trimmedModel);
  return normalizeDeprecatedAntigravityModelAliases(normalizedThinking);
}

/**
 * Normalize model-related env vars for a provider.
 * Returns original object when no changes are required.
 *
 * @example
 * normalizeModelEnvVarsForProvider(
 *   { ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking' },
 *   'agy'
 * )
 * // => { ANTHROPIC_MODEL: 'claude-sonnet-4-6' }
 */
export function normalizeModelEnvVarsForProvider(
  envVars: NodeJS.ProcessEnv,
  provider: ProviderLike,
  keys: readonly string[] = MODEL_ENV_VAR_KEYS
): NodeJS.ProcessEnv {
  let nextEnv: NodeJS.ProcessEnv | null = null;

  for (const key of keys) {
    const value = envVars[key];
    if (typeof value !== 'string' || value.trim().length === 0) continue;

    const normalizedValue = normalizeModelIdForProvider(value, provider);
    if (normalizedValue === value) continue;

    if (!nextEnv) nextEnv = { ...envVars };
    nextEnv[key] = normalizedValue;
  }

  return nextEnv ?? envVars;
}
