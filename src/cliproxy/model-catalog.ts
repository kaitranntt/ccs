/**
 * Model Catalog - Available models for CLI Proxy providers
 *
 * Ships with CCS to provide users with interactive model selection.
 * Models are mapped to their internal names used by the proxy backend.
 */

import type { CLIProxyProvider } from './types';
import {
  isAntigravityProvider,
  migrateDeniedAntigravityModelAliases,
  normalizeModelIdForProvider,
} from './ai-providers/model-id-normalizer';
import { AGY_GEMINI_PRO_COMPATIBILITY_IDS } from '../shared/agy-gemini-pro-compatibility';
import { stripModelConfigurationSuffixes } from '../shared/extended-context-utils';
import { GEMINI_MINOR_VERSION_COMPATIBILITY_IDS } from '../shared/gemini-minor-version-compatibility';
import type { ModelEntry, ProviderCatalog, ThinkingSupport } from './model-catalog-types';
import { MODEL_CATALOG } from './model-catalog-data';

export type { ThinkingSupport, ModelEntry, ProviderCatalog };
export { MODEL_CATALOG };

/**
 * Check if provider supports interactive model configuration
 */
export function supportsModelConfig(provider: CLIProxyProvider): boolean {
  return provider in MODEL_CATALOG;
}

/**
 * Get catalog for provider
 */
export function getProviderCatalog(provider: CLIProxyProvider): ProviderCatalog | undefined {
  return MODEL_CATALOG[provider];
}

/**
 * Suggest a supported replacement model from the provider catalog.
 * Prefers the provider default unless it matches the excluded model or is itself broken.
 */
export function getSuggestedReplacementModel(
  provider: CLIProxyProvider,
  excludedModelId?: string
): string | undefined {
  const catalog = MODEL_CATALOG[provider];
  if (!catalog) return undefined;

  const excludedId = excludedModelId ? findModel(provider, excludedModelId)?.id : undefined;
  const defaultModel = findModel(provider, catalog.defaultModel);
  if (defaultModel && !defaultModel.broken && defaultModel.id !== excludedId) {
    return defaultModel.id;
  }

  return catalog.models.find((model) => !model.broken && model.id !== excludedId)?.id;
}

/**
 * Find model entry by ID
 * Note: Model IDs are normalized to lowercase for case-insensitive comparison
 */
export function findModel(provider: CLIProxyProvider, modelId: string): ModelEntry | undefined {
  const catalog = MODEL_CATALOG[provider];
  if (!catalog || !modelId) return undefined;
  const normalizedId = stripModelConfigurationSuffixes(modelId).trim().toLowerCase();
  const providerNormalizedId = normalizeModelIdForProvider(normalizedId, provider)
    .trim()
    .toLowerCase();
  const lookupCandidates = new Set([normalizedId, providerNormalizedId]);
  if (provider === 'codex') {
    for (const candidate of [...lookupCandidates]) {
      const tuningMatch = candidate.match(
        /^(.*?)(?:-(?:none|minimal|low|medium|high|xhigh|max)(?:-fast)?|-fast(?:-(?:none|minimal|low|medium|high|xhigh|max))?)$/i
      );
      if (tuningMatch?.[1]) {
        lookupCandidates.add(tuningMatch[1].trim());
      }
    }
  }
  if (isAntigravityProvider(provider)) {
    const migratedRaw = migrateDeniedAntigravityModelAliases(normalizedId).trim().toLowerCase();
    const migratedProvider = migrateDeniedAntigravityModelAliases(providerNormalizedId)
      .trim()
      .toLowerCase();
    lookupCandidates.add(migratedRaw);
    lookupCandidates.add(migratedProvider);
  }

  for (const candidate of [...lookupCandidates]) {
    const compatibilityId =
      GEMINI_MINOR_VERSION_COMPATIBILITY_IDS[
        candidate as keyof typeof GEMINI_MINOR_VERSION_COMPATIBILITY_IDS
      ];
    if (compatibilityId) {
      lookupCandidates.add(compatibilityId);
    }

    if (isAntigravityProvider(provider)) {
      const agyCompatibilityId =
        AGY_GEMINI_PRO_COMPATIBILITY_IDS[
          candidate as keyof typeof AGY_GEMINI_PRO_COMPATIBILITY_IDS
        ];
      if (agyCompatibilityId) {
        lookupCandidates.add(agyCompatibilityId);
      }
    }
  }

  return catalog.models.find((m) => lookupCandidates.has(m.id.toLowerCase()));
}

/**
 * Check if model has known issues
 */
export function isModelBroken(provider: CLIProxyProvider, modelId: string): boolean {
  const model = findModel(provider, modelId);
  return model?.broken === true;
}

/**
 * Get issue URL for broken model
 */
export function getModelIssueUrl(provider: CLIProxyProvider, modelId: string): string | undefined {
  const model = findModel(provider, modelId);
  return model?.issueUrl;
}

/**
 * Check if model is deprecated
 */
export function isModelDeprecated(provider: CLIProxyProvider, modelId: string): boolean {
  const model = findModel(provider, modelId);
  return model?.deprecated === true;
}

/**
 * Get deprecation reason for deprecated model
 */
export function getModelDeprecationReason(
  provider: CLIProxyProvider,
  modelId: string
): string | undefined {
  const model = findModel(provider, modelId);
  return model?.deprecationReason;
}

/**
 * Get thinking support configuration for a model
 */
export function getModelThinkingSupport(
  provider: CLIProxyProvider,
  modelId: string
): ThinkingSupport | undefined {
  const model = findModel(provider, modelId);
  return model?.thinking;
}

/**
 * Get the maximum reasoning effort level for a model.
 * Returns undefined if model has no cap or is not in catalog.
 */
export function getModelMaxLevel(
  provider: CLIProxyProvider,
  modelId: string
): ThinkingSupport['maxLevel'] | undefined {
  const thinking = getModelThinkingSupport(provider, modelId);
  return thinking?.maxLevel;
}

/**
 * Check if model supports thinking/reasoning
 */
export function supportsThinking(provider: CLIProxyProvider, modelId: string): boolean {
  const thinking = getModelThinkingSupport(provider, modelId);
  return thinking !== undefined && thinking.type !== 'none';
}

/**
 * Check if model supports extended context (1M tokens).
 * Returns true if model has extendedContext: true in catalog.
 */
export function supportsExtendedContext(provider: CLIProxyProvider, modelId: string): boolean {
  if (provider === 'xai') return false;
  const model = findModel(provider, modelId);
  return model?.extendedContext === true;
}

/**
 * Catalog model that backs the Claude Code `fable` tier for a provider.
 * The catalog lists the newest Fable first, so the first match is the default.
 * Returns undefined for providers that serve no Fable model.
 */
export function getDefaultFableTierModel(provider: CLIProxyProvider): string | undefined {
  const catalog = MODEL_CATALOG[provider];
  if (!catalog) return undefined;
  return catalog.models.find((model) => model.id.toLowerCase().startsWith('claude-fable-'))?.id;
}

/**
 * Check if a model can read image inputs natively.
 */
export function supportsNativeImageInput(provider: CLIProxyProvider, modelId: string): boolean {
  const model = findModel(provider, modelId);
  return model?.nativeImageInput === true;
}

/**
 * Check if model is a native Gemini model (not Claude via Antigravity).
 * Native Gemini models get extended context auto-enabled.
 */
export function isNativeGeminiModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.startsWith('gemini-');
}
