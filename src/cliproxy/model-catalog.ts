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
import {
  AGY_GEMINI_PRO_COMPATIBILITY_IDS,
  AGY_GEMINI_PRO_HIGH_ID,
  AGY_GEMINI_PRO_LOW_ID,
} from '../shared/agy-gemini-pro-compatibility';
import { stripModelConfigurationSuffixes } from '../shared/extended-context-utils';
import { GEMINI_MINOR_VERSION_COMPATIBILITY_IDS } from '../shared/gemini-minor-version-compatibility';

/**
 * Thinking support configuration for a model.
 * Defines how thinking/reasoning budget can be controlled.
 */
export interface ThinkingSupport {
  /** Type of thinking control: 'budget' (token count), 'levels' (named levels), 'none' */
  type: 'budget' | 'levels' | 'none';
  /** Minimum budget tokens (for budget type) */
  min?: number;
  /** Maximum budget tokens (for budget type) */
  max?: number;
  /** Valid level names (for levels type) */
  levels?: string[];
  /** Maximum reasoning effort level (caps effort at this level for levels type) */
  maxLevel?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Whether zero/disabled thinking is allowed */
  zeroAllowed?: boolean;
  /** Whether dynamic/auto thinking is allowed */
  dynamicAllowed?: boolean;
}

/**
 * Model entry definition
 */
export interface ModelEntry {
  /** Literal model name to put in settings.json */
  id: string;
  /** Human-readable name for display */
  name: string;
  /** Access tier indicator - 'ultra' for Claude, 'pro' for premium Gemini, 'free' for basic */
  tier?: 'free' | 'pro' | 'ultra';
  /** Optional description for the model */
  description?: string;
  /** Total context window in tokens when authoritatively known */
  contextWindow?: number;
  /** Model has known issues - show warning when selected */
  broken?: boolean;
  /** Issue URL for broken models */
  issueUrl?: string;
  /** Model is deprecated - show warning when selected */
  deprecated?: boolean;
  /** Deprecation reason/message */
  deprecationReason?: string;
  /** Thinking/reasoning support configuration */
  thinking?: ThinkingSupport;
  /** Whether model supports 1M extended context window (appends [1m] suffix) */
  extendedContext?: boolean;
  /** Whether model can read image inputs natively without the Image transformer */
  nativeImageInput?: boolean;
  /** Additional Codex service-tier suffixes supported by this model. */
  codexServiceTiers?: Array<'fast'>;
}

/**
 * Provider catalog definition
 */
export interface ProviderCatalog {
  provider: CLIProxyProvider;
  displayName: string;
  models: ModelEntry[];
  defaultModel: string;
}

/**
 * Model catalog for providers that support interactive configuration
 *
 * Models listed in order of recommendation (top = best)
 */
export const MODEL_CATALOG: Partial<Record<CLIProxyProvider, ProviderCatalog>> = {
  agy: {
    provider: 'agy',
    displayName: 'Antigravity',
    defaultModel: 'claude-opus-4-6-thinking',
    models: [
      {
        id: 'claude-opus-4-6-thinking',
        name: 'Claude Opus 4.6 Thinking',
        description: 'Latest flagship, extended thinking',
        contextWindow: 200000,
        nativeImageInput: true,
        thinking: {
          type: 'budget',
          min: 1024,
          max: 128000,
          zeroAllowed: true,
          dynamicAllowed: true,
        },
        // TODO: Re-enable when Antigravity backend supports 1M context (currently 256k)
        // extendedContext: true,
        extendedContext: false,
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        description: 'Latest Sonnet with thinking budget support',
        contextWindow: 200000,
        nativeImageInput: true,
        thinking: {
          type: 'budget',
          min: 1024,
          max: 64000,
          zeroAllowed: true,
          dynamicAllowed: true,
        },
      },
      {
        id: AGY_GEMINI_PRO_HIGH_ID,
        name: 'Gemini 3.1 Pro High',
        description: 'Current Antigravity Gemini Pro route with higher reasoning budget',
        nativeImageInput: true,
        thinking: { type: 'none' },
        extendedContext: true,
      },
      {
        id: AGY_GEMINI_PRO_LOW_ID,
        name: 'Gemini 3.1 Pro Low',
        description: 'Current Antigravity Gemini Pro route with the lighter quota tier',
        nativeImageInput: true,
        thinking: { type: 'none' },
        extendedContext: true,
      },
      {
        id: 'gemini-3-1-flash-preview',
        name: 'Gemini Flash',
        description: 'Latest Gemini Flash model via Antigravity',
        nativeImageInput: true,
        thinking: { type: 'levels', levels: ['low', 'high'], dynamicAllowed: true },
        extendedContext: true,
      },
    ],
  },
  gemini: {
    provider: 'gemini',
    displayName: 'Gemini',
    defaultModel: 'gemini-2.5-pro',
    models: [
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro',
        tier: 'pro',
        description: 'Latest Gemini Pro model, requires paid Google account',
        nativeImageInput: true,
        thinking: { type: 'levels', levels: ['low', 'high'], dynamicAllowed: true },
        extendedContext: true,
      },
      {
        id: 'gemini-3-flash-preview',
        name: 'Gemini Flash',
        tier: 'pro',
        description: 'Latest Gemini Flash model, requires paid Google account',
        nativeImageInput: true,
        thinking: { type: 'levels', levels: ['low', 'high'], dynamicAllowed: true },
        extendedContext: true,
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Stable, works with free Google account',
        nativeImageInput: true,
        thinking: {
          type: 'budget',
          min: 128,
          max: 32768,
          zeroAllowed: false,
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
    ],
  },
  codex: {
    provider: 'codex',
    displayName: 'Copilot Codex',
    defaultModel: 'gpt-5.4',
    models: [
      {
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        description: 'Latest frontier agentic coding model.',
        contextWindow: 372000,
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh'],
          maxLevel: 'xhigh',
          dynamicAllowed: false,
        },
        codexServiceTiers: ['fast'],
      },
      {
        id: 'gpt-5.6-terra',
        name: 'GPT-5.6 Terra',
        description: 'Balanced agentic coding model for everyday work.',
        contextWindow: 372000,
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh'],
          maxLevel: 'xhigh',
          dynamicAllowed: false,
        },
        codexServiceTiers: ['fast'],
      },
      {
        id: 'gpt-5.6-luna',
        name: 'GPT-5.6 Luna',
        description: 'Fast and affordable agentic coding model.',
        contextWindow: 372000,
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh'],
          maxLevel: 'xhigh',
          dynamicAllowed: false,
        },
        codexServiceTiers: ['fast'],
      },
      {
        id: 'gpt-5.5',
        name: 'GPT-5.5',
        tier: 'pro',
        description:
          'Newest Codex-released GPT-5 family model; falls back to GPT-5.4 on free plans',
        contextWindow: 272000,
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh'],
          maxLevel: 'xhigh',
          dynamicAllowed: false,
        },
        codexServiceTiers: ['fast'],
      },
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        description: 'Recommended Codex default for most coding and agentic tasks',
        contextWindow: 1050000,
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh'],
          maxLevel: 'xhigh',
          dynamicAllowed: false,
        },
        codexServiceTiers: ['fast'],
      },
      {
        id: 'gpt-5.4-mini',
        name: 'GPT-5.4 Mini',
        description: 'Fast, lower-cost Codex option for lighter tasks and haiku-tier routing',
        contextWindow: 400000,
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high'],
          maxLevel: 'high',
          dynamicAllowed: false,
        },
      },
      {
        id: 'gpt-5.3-codex',
        name: 'GPT-5.3 Codex',
        tier: 'pro',
        description: 'Previous flagship coding model whose capabilities now power GPT-5.4',
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh'],
          maxLevel: 'xhigh',
          dynamicAllowed: false,
        },
      },
      {
        id: 'gpt-5.3-codex-spark',
        name: 'GPT-5.3 Codex Spark',
        tier: 'pro',
        description:
          'Research preview model for ChatGPT Pro subscribers, optimized for near-instant coding iteration',
        contextWindow: 128000,
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh'],
          maxLevel: 'xhigh',
          dynamicAllowed: false,
        },
      },
      {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        description: 'Previous general-purpose Codex model',
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh'],
          maxLevel: 'xhigh',
          dynamicAllowed: false,
        },
      },
    ],
  },
  xai: {
    provider: 'xai',
    displayName: 'xAI (Grok)',
    defaultModel: 'grok-build-0.1',
    models: [
      {
        id: 'grok-build-0.1',
        name: 'Grok Build 0.1',
        description: 'Fast coding model for agentic software engineering workflows',
        contextWindow: 256000,
      },
      {
        id: 'grok-4.6',
        name: 'Grok 4.6',
        description:
          "SpaceXAI's smartest model built for long-running agents, interactive and visual work.",
        contextWindow: 500000,
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh'],
          zeroAllowed: false,
        },
      },
      {
        id: 'grok-4.5',
        name: 'Grok 4.5',
        description: 'Frontier model for coding, engineering, and agentic workflows',
        contextWindow: 500000,
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high'],
          zeroAllowed: false,
        },
      },
      {
        id: 'grok-4.3',
        name: 'Grok 4.3',
        description: 'General-purpose Grok model with a one-million-token context window',
        contextWindow: 1000000,
        thinking: {
          type: 'levels',
          levels: ['none', 'low', 'medium', 'high'],
          zeroAllowed: true,
        },
      },
      {
        id: 'grok-4.20-0309-reasoning',
        name: 'Grok 4.20 0309 Reasoning',
        description: 'Reasoning model with a two-million-token context window',
        contextWindow: 2000000,
      },
      {
        id: 'grok-4.20-0309-non-reasoning',
        name: 'Grok 4.20 0309 Non Reasoning',
        description: 'Non-reasoning model with a two-million-token context window',
        contextWindow: 2000000,
      },
      {
        id: 'grok-4.20-multi-agent-0309',
        name: 'Grok 4.20 Multi Agent 0309',
        description: 'Multi-agent model with a two-million-token context window',
        contextWindow: 2000000,
        thinking: { type: 'levels', levels: ['low', 'medium', 'high'] },
      },
      {
        id: 'grok-3-mini',
        name: 'Grok 3 Mini',
        description: 'Compact reasoning model',
        contextWindow: 131072,
        thinking: { type: 'levels', levels: ['low', 'medium', 'high'] },
      },
      {
        id: 'grok-3-mini-fast',
        name: 'Grok 3 Mini Fast',
        description: 'Faster compact reasoning model',
        contextWindow: 131072,
        thinking: { type: 'levels', levels: ['low', 'medium', 'high'] },
      },
      {
        id: 'grok-composer-2.5-fast',
        name: 'Grok Composer 2.5 Fast',
        description: 'Fast Composer model for lightweight coding tasks',
        contextWindow: 200000,
      },
    ],
  },
  qoder: {
    provider: 'qoder',
    displayName: 'Qoder',
    defaultModel: 'qoder/auto',
    models: [
      {
        id: 'qoder/auto',
        name: 'Qoder Auto',
        description: 'Auto selects the best Qoder model for your prompt',
        contextWindow: 180000,
      },
      {
        id: 'qoder/ultimate',
        name: 'Qoder Ultimate',
        description: 'Highest quality Qoder tier',
        contextWindow: 180000,
      },
      {
        id: 'qoder/performance',
        name: 'Qoder Performance',
        description: 'Balanced quality and speed',
        contextWindow: 272000,
      },
      {
        id: 'qoder/efficient',
        name: 'Qoder Efficient',
        description: 'Cost-efficient Qoder tier',
        contextWindow: 180000,
      },
      {
        id: 'qoder/lite',
        name: 'Qoder Lite',
        description: 'Fastest and most affordable Qoder tier',
        contextWindow: 180000,
      },
      {
        id: 'qoder/qmodel',
        name: 'Qwen 3.6 Plus (via Qoder)',
        description: 'Qwen 3.6 Plus frontier model',
        contextWindow: 180000,
      },
      {
        id: 'qoder/dmodel',
        name: 'DeepSeek V4 Pro (via Qoder)',
        description: 'DeepSeek V4 Pro frontier model',
        contextWindow: 180000,
      },
      {
        id: 'qoder/dfmodel',
        name: 'DeepSeek V4 Flash (via Qoder)',
        description: 'DeepSeek V4 Flash frontier model',
        contextWindow: 180000,
      },
      {
        id: 'qoder/gm51model',
        name: 'GLM 5.1 (via Qoder)',
        description: 'GLM 5.1 frontier model',
        contextWindow: 180000,
      },
      {
        id: 'qoder/kmodel',
        name: 'Kimi K2.6 (via Qoder)',
        description: 'Kimi K2.6 frontier model',
        contextWindow: 256000,
      },
      {
        id: 'qoder/mmodel',
        name: 'MiniMax M2.7 (via Qoder)',
        description: 'MiniMax M2.7 frontier model',
        contextWindow: 180000,
      },
    ],
  },
  kimi: {
    provider: 'kimi',
    displayName: 'Kimi (Moonshot)',
    defaultModel: 'kimi-k2.5',
    models: [
      {
        id: 'kimi-k2.5',
        name: 'Kimi K2.5',
        description: 'Latest multimodal model (262K context)',
        contextWindow: 262144,
        nativeImageInput: true,
        thinking: {
          type: 'budget',
          min: 1024,
          max: 32000,
          zeroAllowed: true,
          dynamicAllowed: true,
        },
      },
      {
        id: 'kimi-k2-thinking',
        name: 'Kimi K2 Thinking',
        description: 'Extended reasoning model',
        contextWindow: 131072,
        thinking: {
          type: 'budget',
          min: 1024,
          max: 32000,
          zeroAllowed: true,
          dynamicAllowed: true,
        },
      },
      {
        id: 'kimi-k2',
        name: 'Kimi K2',
        description: 'Flagship coding model',
        contextWindow: 131072,
      },
    ],
  },
  claude: {
    provider: 'claude',
    displayName: 'Claude (Anthropic)',
    defaultModel: 'claude-sonnet-5',
    models: [
      {
        id: 'claude-sonnet-5',
        name: 'Claude Sonnet 5',
        description: 'Latest Sonnet model',
        contextWindow: 1000000,
        nativeImageInput: true,
        // Sonnet 5 uses adaptive thinking; manual budget_tokens is rejected with 400.
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          maxLevel: 'max',
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-fable-5-1',
        name: 'Claude Fable 5.1',
        description: 'Most powerful model (1M context, 128K output)',
        contextWindow: 1000000,
        nativeImageInput: true,
        // Thinking is always on and cannot be disabled: Anthropic rejects both
        // `thinking.type: "disabled"` and manual budget_tokens with 400. Depth is
        // steered only through effort levels (default `high`).
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          maxLevel: 'max',
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-fable-5',
        name: 'Claude Fable 5',
        description: 'Previous most powerful model',
        contextWindow: 1000000,
        nativeImageInput: true,
        // New tier above Opus. Same adaptive-thinking surface as Opus 4.8:
        // Anthropic accepts only effort levels; manual budget_tokens is rejected with 400.
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          maxLevel: 'max',
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-opus-5',
        name: 'Claude Opus 5',
        description: 'Latest premium model',
        nativeImageInput: true,
        // Opus 5 (released 2026-07-24) uses adaptive thinking, matching Sonnet 5
        // and Opus 4.8: Anthropic accepts only effort levels; manual budget_tokens
        // is rejected with 400. Proxy metadata reports zero + dynamic allowed.
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          maxLevel: 'max',
          zeroAllowed: true,
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-opus-4-8',
        name: 'Claude Opus 4.8',
        description: 'Latest flagship model',
        contextWindow: 1000000,
        nativeImageInput: true,
        // Mirrors 4.7: Anthropic accepts only adaptive thinking levels on the
        // current Opus generation; manual budget_tokens is rejected with 400.
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          maxLevel: 'max',
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-opus-4-7',
        name: 'Claude Opus 4.7',
        description: 'Previous flagship model',
        contextWindow: 1000000,
        nativeImageInput: true,
        // Opus 4.7 only supports adaptive thinking on the Anthropic API; manual
        // thinking.type: "enabled" with budget_tokens is rejected with 400.
        // Expose effort levels; the proxy translates these into adaptive effort.
        // `max` is a distinct adaptive effort above `xhigh` exposed by Anthropic.
        thinking: {
          type: 'levels',
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          maxLevel: 'max',
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        description: 'Older flagship model',
        contextWindow: 1000000,
        nativeImageInput: true,
        thinking: {
          type: 'budget',
          min: 1024,
          max: 128000,
          zeroAllowed: false,
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        description: 'Balanced performance and speed',
        contextWindow: 200000,
        nativeImageInput: true,
        thinking: {
          type: 'budget',
          min: 1024,
          max: 128000,
          zeroAllowed: false,
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        description: 'Most capable Claude model',
        contextWindow: 200000,
        nativeImageInput: true,
        thinking: {
          type: 'budget',
          min: 1024,
          max: 128000,
          zeroAllowed: false,
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        description: 'Balanced performance and speed',
        contextWindow: 200000,
        nativeImageInput: true,
        thinking: {
          type: 'budget',
          min: 1024,
          max: 128000,
          zeroAllowed: false,
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        description: 'Previous generation Sonnet',
        contextWindow: 200000,
        nativeImageInput: true,
        thinking: {
          type: 'budget',
          min: 1024,
          max: 128000,
          zeroAllowed: false,
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        description: 'Fast and efficient',
        contextWindow: 200000,
        nativeImageInput: true,
        thinking: { type: 'none' },
      },
    ],
  },
};

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
        /^(.*?)(?:-(?:minimal|low|medium|high|xhigh)(?:-fast)?|-fast(?:-(?:minimal|low|medium|high|xhigh))?)$/i
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
