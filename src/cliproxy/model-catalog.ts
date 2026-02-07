/**
 * Model Catalog - Available models for CLI Proxy providers
 *
 * Ships with CCS to provide users with interactive model selection.
 * Models are mapped to their internal names used by the proxy backend.
 */

import { CLIProxyProvider } from './types';

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
  maxLevel?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
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
    defaultModel: 'gemini-claude-opus-4-6-thinking',
    models: [
      {
        id: 'gemini-claude-opus-4-6-thinking',
        name: 'Claude Opus 4.6 Thinking',
        description: 'Latest flagship, 1M context, extended thinking',
        thinking: {
          type: 'budget',
          min: 1024,
          max: 128000,
          zeroAllowed: true,
          dynamicAllowed: true,
        },
        extendedContext: true,
      },
      {
        id: 'gemini-claude-opus-4-5-thinking',
        name: 'Claude Opus 4.5 Thinking',
        description: 'Previous flagship, extended thinking',
        thinking: {
          type: 'budget',
          min: 1024,
          max: 100000,
          zeroAllowed: false,
          dynamicAllowed: true,
        },
      },
      {
        id: 'gemini-claude-sonnet-4-5-thinking',
        name: 'Claude Sonnet 4.5 Thinking',
        description: 'Balanced with extended thinking',
        thinking: {
          type: 'budget',
          min: 1024,
          max: 100000,
          zeroAllowed: false,
          dynamicAllowed: true,
        },
      },
      {
        id: 'gemini-claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        description: 'Fast and capable',
        thinking: { type: 'none' },
      },
      {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro',
        description: 'Google latest model via Antigravity',
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
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro',
        tier: 'pro',
        description: 'Latest model, requires paid Google account',
        thinking: { type: 'levels', levels: ['low', 'high'], dynamicAllowed: true },
        extendedContext: true,
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Stable, works with free Google account',
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
    defaultModel: 'gpt-5.2-codex',
    models: [
      {
        id: 'gpt-5.2-codex',
        name: 'GPT-5.2 Codex',
        description: 'Full reasoning support (xhigh)',
        thinking: {
          type: 'levels',
          levels: ['medium', 'high', 'xhigh'],
          maxLevel: 'xhigh',
          dynamicAllowed: false,
        },
      },
      {
        id: 'gpt-5-mini',
        name: 'GPT-5 Mini',
        description: 'Capped at high reasoning (no xhigh)',
        thinking: {
          type: 'levels',
          levels: ['medium', 'high'],
          maxLevel: 'high',
          dynamicAllowed: false,
        },
      },
    ],
  },
  claude: {
    provider: 'claude',
    displayName: 'Claude (Anthropic)',
    defaultModel: 'claude-sonnet-4-5-20250929',
    models: [
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        description: 'Latest flagship model',
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
 * Find model entry by ID
 * Note: Model IDs are normalized to lowercase for case-insensitive comparison
 */
export function findModel(provider: CLIProxyProvider, modelId: string): ModelEntry | undefined {
  const catalog = MODEL_CATALOG[provider];
  if (!catalog || !modelId) return undefined;
  const normalizedId = modelId.trim().toLowerCase();
  return catalog.models.find((m) => m.id.toLowerCase() === normalizedId);
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
  const model = findModel(provider, modelId);
  return model?.extendedContext === true;
}

/**
 * Check if model is a native Gemini model (not gemini-claude-*).
 * Native Gemini models get extended context auto-enabled.
 */
export function isNativeGeminiModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.startsWith('gemini-') && !lower.startsWith('gemini-claude-');
}
