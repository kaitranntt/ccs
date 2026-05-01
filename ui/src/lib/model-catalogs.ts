/**
 * Model Catalogs for CLIProxy providers
 * Shared data for Quick Setup Wizard and Provider Editor
 */

import type { ModelEntry, ProviderCatalog } from '@/components/cliproxy/provider-model-selector';
import { stripModelConfigurationSuffixes } from '@/lib/extended-context-utils';
import {
  AGY_GEMINI_PRO_COMPATIBILITY_IDS,
  AGY_GEMINI_PRO_HIGH_ID,
  AGY_GEMINI_PRO_LOW_ID,
} from '@shared/agy-gemini-pro-compatibility';
import { GEMINI_MINOR_VERSION_COMPATIBILITY_IDS } from '@shared/gemini-minor-version-compatibility';

const GEMINI_PREVIEW_MODEL_ID_PATTERN =
  /^gemini-(\d+(?:[.-]\d+)*)-(pro|flash)-preview(-customtools)?$/i;
const MANAGED_MODEL_PREFIXES = ['agy/', 'gcli/'] as const;

export type CatalogAvailableModel = {
  id: string;
  owned_by: string;
};

type GeminiPreviewFamily = 'pro' | 'flash';

type GeminiPreviewModelInfo = {
  normalizedId: string;
  version: number[];
  family: GeminiPreviewFamily;
  customtools: boolean;
  dottedVersion: boolean;
};

function normalizeModelId(modelId: string): string {
  return stripModelConfigurationSuffixes(modelId).toLowerCase();
}

function stripManagedModelPrefix(modelId: string): string {
  const trimmedModelId = modelId.trim();
  const normalizedModelId = trimmedModelId.toLowerCase();

  for (const prefix of MANAGED_MODEL_PREFIXES) {
    if (normalizedModelId.startsWith(prefix)) {
      return trimmedModelId.slice(prefix.length);
    }
  }

  return trimmedModelId;
}

function stripCustomtoolsSuffix(modelId: string): string {
  return modelId.replace(/-customtools$/i, '');
}

function getAgyGeminiProCompatibilityId(modelId: string): string | undefined {
  return AGY_GEMINI_PRO_COMPATIBILITY_IDS[
    normalizeModelId(modelId) as keyof typeof AGY_GEMINI_PRO_COMPATIBILITY_IDS
  ];
}

function parseGeminiPreviewModelId(modelId: string): GeminiPreviewModelInfo | null {
  const normalizedId = normalizeModelId(modelId);
  const match = normalizedId.match(GEMINI_PREVIEW_MODEL_ID_PATTERN);
  if (!match) return null;

  const [, versionString, family, customtoolsSuffix] = match;

  return {
    normalizedId,
    version: versionString.split(/[.-]/).map((segment) => Number(segment)),
    family: family as GeminiPreviewFamily,
    customtools: Boolean(customtoolsSuffix),
    dottedVersion: versionString.includes('.'),
  };
}

function compareGeminiVersions(a: number[], b: number[]): number {
  const maxLength = Math.max(a.length, b.length);
  for (let index = 0; index < maxLength; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left === right) continue;
    return left > right ? 1 : -1;
  }

  return 0;
}

function compareGeminiPreviewCandidates(
  left: GeminiPreviewModelInfo,
  right: GeminiPreviewModelInfo,
  target: GeminiPreviewModelInfo
): number {
  if (left.customtools !== right.customtools) {
    return left.customtools ? 1 : -1;
  }

  const versionComparison = compareGeminiVersions(left.version, right.version);
  if (versionComparison !== 0) {
    return versionComparison > 0 ? -1 : 1;
  }

  const leftStyleMatch = Number(left.dottedVersion === target.dottedVersion);
  const rightStyleMatch = Number(right.dottedVersion === target.dottedVersion);
  if (leftStyleMatch !== rightStyleMatch) {
    return rightStyleMatch - leftStyleMatch;
  }

  return left.normalizedId.localeCompare(right.normalizedId);
}

function findAvailableModelId(
  availableModels: CatalogAvailableModel[],
  modelId: string
): string | undefined {
  const normalizedModelId = normalizeModelId(modelId);
  return availableModels.find((model) => normalizeModelId(model.id) === normalizedModelId)?.id;
}

function resolveGeminiPreviewModelId(
  modelId: string,
  availableModels: CatalogAvailableModel[]
): string | undefined {
  const targetModel = parseGeminiPreviewModelId(modelId);
  if (!targetModel || availableModels.length === 0) return undefined;

  const bestMatch = availableModels
    .map((model) => {
      const info = parseGeminiPreviewModelId(model.id);
      if (!info || info.family !== targetModel.family) return null;
      return { id: model.id, info };
    })
    .filter((candidate): candidate is { id: string; info: GeminiPreviewModelInfo } =>
      Boolean(candidate)
    )
    .sort((left, right) => compareGeminiPreviewCandidates(left.info, right.info, targetModel))[0];

  return bestMatch?.id;
}

/** Model catalog data - mirrors src/cliproxy/model-catalog.ts */
// TODO i18n: missing keys for MODEL_CATALOGS displayNames, model names, and descriptions
export const MODEL_CATALOGS: Record<string, ProviderCatalog> = {
  agy: {
    provider: 'agy',
    displayName: 'Antigravity',
    defaultModel: 'claude-opus-4-6-thinking',
    models: [
      {
        id: 'claude-opus-4-6-thinking',
        name: 'Claude Opus 4.6 Thinking',
        description: 'Latest flagship, extended thinking',
        // TODO: Re-enable when Antigravity backend supports 1M context (currently 256k)
        // extendedContext: true,
        extendedContext: false,
        presetMapping: {
          default: 'claude-opus-4-6-thinking',
          opus: 'claude-opus-4-6-thinking',
          sonnet: 'claude-sonnet-4-6',
          haiku: 'claude-sonnet-4-6',
        },
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        description: 'Latest Sonnet with thinking budget support',
        presetMapping: {
          default: 'claude-sonnet-4-6',
          opus: 'claude-opus-4-6-thinking',
          sonnet: 'claude-sonnet-4-6',
          haiku: 'claude-sonnet-4-6',
        },
      },
      {
        id: AGY_GEMINI_PRO_HIGH_ID,
        name: 'Gemini Pro High',
        description: 'Current Antigravity Gemini Pro route with higher reasoning budget',
        extendedContext: true,
        presetMapping: {
          default: AGY_GEMINI_PRO_HIGH_ID,
          opus: AGY_GEMINI_PRO_HIGH_ID,
          sonnet: AGY_GEMINI_PRO_HIGH_ID,
          haiku: 'gemini-3-1-flash-preview',
        },
      },
      {
        id: AGY_GEMINI_PRO_LOW_ID,
        name: 'Gemini Pro Low',
        description: 'Current Antigravity Gemini Pro route with the lighter quota tier',
        extendedContext: true,
        presetMapping: {
          default: AGY_GEMINI_PRO_LOW_ID,
          opus: AGY_GEMINI_PRO_LOW_ID,
          sonnet: AGY_GEMINI_PRO_LOW_ID,
          haiku: 'gemini-3-1-flash-preview',
        },
      },
      {
        id: 'gemini-3-1-flash-preview',
        name: 'Gemini Flash',
        description: 'Resolves to the best advertised Gemini Flash preview via Antigravity',
        extendedContext: true,
        presetMapping: {
          default: 'gemini-3-1-flash-preview',
          opus: AGY_GEMINI_PRO_HIGH_ID,
          sonnet: AGY_GEMINI_PRO_HIGH_ID,
          haiku: 'gemini-3-1-flash-preview',
        },
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
        name: 'Gemini Pro',
        tier: 'paid',
        description: 'Uses the best advertised Gemini Pro preview when Google exposes one',
        extendedContext: true,
        presetMapping: {
          default: 'gemini-3.1-pro-preview',
          opus: 'gemini-3.1-pro-preview',
          sonnet: 'gemini-3.1-pro-preview',
          haiku: 'gemini-3-flash-preview',
        },
      },
      {
        id: 'gemini-3-flash-preview',
        name: 'Gemini Flash',
        tier: 'paid',
        description: 'Uses the best advertised Gemini Flash preview when Google exposes one',
        extendedContext: true,
        presetMapping: {
          default: 'gemini-3-flash-preview',
          opus: 'gemini-3.1-pro-preview',
          sonnet: 'gemini-3.1-pro-preview',
          haiku: 'gemini-3-flash-preview',
        },
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Stable, works with free Google account',
        extendedContext: true,
        presetMapping: {
          default: 'gemini-2.5-pro',
          opus: 'gemini-2.5-pro',
          sonnet: 'gemini-2.5-pro',
          haiku: 'gemini-2.5-flash',
        },
      },
    ],
  },
  codex: {
    provider: 'codex',
    displayName: 'Codex',
    defaultModel: 'gpt-5.4',
    models: [
      {
        id: 'gpt-5.5',
        name: 'GPT-5.5',
        tier: 'paid',
        description:
          'Newest Codex-released GPT-5 family model; falls back to GPT-5.4 on free plans',
        codexMaxEffort: 'xhigh',
        presetMapping: {
          default: 'gpt-5.5',
          opus: 'gpt-5.5',
          sonnet: 'gpt-5.5',
          haiku: 'gpt-5.4-mini',
        },
      },
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        description: 'Recommended Codex default for most coding and agentic tasks',
        codexMaxEffort: 'xhigh',
        presetMapping: {
          default: 'gpt-5.4',
          opus: 'gpt-5.4',
          sonnet: 'gpt-5.4',
          haiku: 'gpt-5.4-mini',
        },
      },
      {
        id: 'gpt-5.4-mini',
        name: 'GPT-5.4 Mini',
        description: 'Fast, lower-cost Codex option for lighter tasks and haiku-tier routing',
        codexMaxEffort: 'high',
        presetMapping: {
          default: 'gpt-5.4-mini',
          opus: 'gpt-5.4',
          sonnet: 'gpt-5.4',
          haiku: 'gpt-5.4-mini',
        },
      },
      {
        id: 'gpt-5.3-codex',
        name: 'GPT-5.3 Codex',
        tier: 'paid',
        description: 'Previous flagship coding model whose capabilities now power GPT-5.4',
        codexMaxEffort: 'xhigh',
        presetMapping: {
          default: 'gpt-5.3-codex',
          opus: 'gpt-5.3-codex',
          sonnet: 'gpt-5.3-codex',
          haiku: 'gpt-5.4-mini',
        },
      },
      {
        id: 'gpt-5.3-codex-spark',
        name: 'GPT-5.3 Codex Spark',
        tier: 'paid',
        description:
          'Research preview model for ChatGPT Pro subscribers, optimized for near-instant coding iteration',
        codexMaxEffort: 'xhigh',
        presetMapping: {
          default: 'gpt-5.3-codex-spark',
          opus: 'gpt-5.3-codex',
          sonnet: 'gpt-5.3-codex',
          haiku: 'gpt-5.4-mini',
        },
      },
      {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        description: 'Previous general-purpose Codex model',
        codexMaxEffort: 'xhigh',
        presetMapping: {
          default: 'gpt-5.2',
          opus: 'gpt-5.2',
          sonnet: 'gpt-5.2',
          haiku: 'gpt-5.4-mini',
        },
      },
    ],
  },
  qwen: {
    provider: 'qwen',
    displayName: 'Qwen',
    defaultModel: 'qwen3-coder-plus',
    models: [
      {
        id: 'qwen3-coder-plus',
        name: 'Qwen3 Coder Plus',
        description: 'Code-focused model (1M context)',
        presetMapping: {
          default: 'qwen3-coder-plus',
          opus: 'qwen3-max',
          sonnet: 'qwen3-coder-plus',
          haiku: 'qwen3-coder-flash',
        },
      },
      {
        id: 'qwen3-max',
        name: 'Qwen3 Max',
        description: 'Flagship model (256K context)',
        presetMapping: {
          default: 'qwen3-max',
          opus: 'qwen3-max',
          sonnet: 'qwen3-coder-plus',
          haiku: 'qwen3-coder-flash',
        },
      },
      {
        id: 'qwen3-max-preview',
        name: 'Qwen3 Max Preview',
        description: 'Preview with thinking support (256K)',
        presetMapping: {
          default: 'qwen3-max-preview',
          opus: 'qwen3-max-preview',
          sonnet: 'qwen3-max',
          haiku: 'qwen3-coder-flash',
        },
      },
      {
        id: 'qwen3-235b',
        name: 'Qwen3 235B',
        description: 'Large 235B A22B model',
        presetMapping: {
          default: 'qwen3-235b',
          opus: 'qwen3-max',
          sonnet: 'qwen3-235b',
          haiku: 'qwen3-coder-flash',
        },
      },
      {
        id: 'qwen3-vl-plus',
        name: 'Qwen3 VL Plus',
        description: 'Vision-language multimodal',
      },
      {
        id: 'qwen3-coder-flash',
        name: 'Qwen3 Coder Flash',
        description: 'Fast code generation',
      },
      {
        id: 'qwen3-32b',
        name: 'Qwen3 32B',
        description: 'Qwen3 32B model',
      },
    ],
  },
  iflow: {
    provider: 'iflow',
    displayName: 'iFlow',
    defaultModel: 'qwen3-coder-plus',
    models: [
      {
        id: 'qwen3-coder-plus',
        name: 'Qwen3 Coder Plus',
        description: 'Recommended default for iFlow accounts',
        presetMapping: {
          default: 'qwen3-coder-plus',
          opus: 'qwen3-coder-plus',
          sonnet: 'qwen3-coder-plus',
          haiku: 'qwen3-coder-plus',
        },
      },
      {
        id: 'qwen3-max',
        name: 'Qwen3 Max',
        description: 'Flagship Qwen model via iFlow',
      },
      {
        id: 'kimi-k2',
        name: 'Kimi K2',
        description: 'Kimi model currently available via iFlow',
      },
      {
        id: 'deepseek-v3.2',
        name: 'DeepSeek V3.2',
        description: 'Current DeepSeek V3.2 model via iFlow',
      },
      {
        id: 'deepseek-r1',
        name: 'DeepSeek R1',
        description: 'Reasoning-focused DeepSeek model',
      },
      {
        id: 'glm-4.6',
        name: 'GLM 4.6',
        description: 'Zhipu GLM 4.6 via iFlow',
      },
      {
        id: 'qwen3-vl-plus',
        name: 'Qwen3 VL Plus',
        description: 'Vision-language model',
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
        presetMapping: {
          default: 'kimi-k2.5',
          opus: 'kimi-k2.5',
          sonnet: 'kimi-k2-thinking',
          haiku: 'kimi-k2',
        },
      },
      {
        id: 'kimi-k2-thinking',
        name: 'Kimi K2 Thinking',
        description: 'Extended reasoning model',
        presetMapping: {
          default: 'kimi-k2-thinking',
          opus: 'kimi-k2.5',
          sonnet: 'kimi-k2-thinking',
          haiku: 'kimi-k2',
        },
      },
      {
        id: 'kimi-k2',
        name: 'Kimi K2',
        description: 'Flagship coding model',
      },
    ],
  },
  kiro: {
    provider: 'kiro',
    displayName: 'Kiro (AWS)',
    defaultModel: 'kiro-claude-sonnet-4-6',
    models: [
      {
        id: 'kiro-claude-opus-4-6',
        name: 'Kiro Claude Opus 4.6',
        description: 'Claude Opus 4.6 via Kiro (2.2x credit)',
        presetMapping: {
          default: 'kiro-claude-opus-4-6',
          opus: 'kiro-claude-opus-4-6',
          sonnet: 'kiro-claude-sonnet-4-6',
          haiku: 'kiro-claude-haiku-4-5',
        },
      },
      {
        id: 'kiro-claude-sonnet-4-6',
        name: 'Kiro Claude Sonnet 4.6',
        description: 'Claude Sonnet 4.6 via Kiro (1.3x credit)',
        presetMapping: {
          default: 'kiro-claude-sonnet-4-6',
          opus: 'kiro-claude-opus-4-6',
          sonnet: 'kiro-claude-sonnet-4-6',
          haiku: 'kiro-claude-haiku-4-5',
        },
      },
      {
        id: 'kiro-claude-opus-4-5',
        name: 'Kiro Claude Opus 4.5',
        description: 'Claude Opus 4.5 via Kiro (2.2x credit)',
        presetMapping: {
          default: 'kiro-claude-opus-4-5',
          opus: 'kiro-claude-opus-4-5',
          sonnet: 'kiro-claude-sonnet-4-5',
          haiku: 'kiro-claude-haiku-4-5',
        },
      },
      {
        id: 'kiro-claude-sonnet-4-5',
        name: 'Kiro Claude Sonnet 4.5',
        description: 'Claude Sonnet 4.5 via Kiro (1.3x credit)',
        presetMapping: {
          default: 'kiro-claude-sonnet-4-5',
          opus: 'kiro-claude-opus-4-5',
          sonnet: 'kiro-claude-sonnet-4-5',
          haiku: 'kiro-claude-haiku-4-5',
        },
      },
      {
        id: 'kiro-claude-sonnet-4',
        name: 'Kiro Claude Sonnet 4',
        description: 'Claude Sonnet 4 via Kiro (1.3x credit)',
        presetMapping: {
          default: 'kiro-claude-sonnet-4',
          opus: 'kiro-claude-opus-4-5',
          sonnet: 'kiro-claude-sonnet-4',
          haiku: 'kiro-claude-haiku-4-5',
        },
      },
      {
        id: 'kiro-claude-haiku-4-5',
        name: 'Kiro Claude Haiku 4.5',
        description: 'Claude Haiku 4.5 via Kiro (0.4x credit)',
      },
    ],
  },
  ghcp: {
    provider: 'ghcp',
    displayName: 'GitHub Copilot (OAuth)',
    defaultModel: 'claude-sonnet-4.5',
    models: [
      {
        id: 'claude-opus-4.5',
        name: 'Claude Opus 4.5',
        description: 'Anthropic Claude Opus 4.5 via GitHub Copilot',
        presetMapping: {
          default: 'claude-opus-4.5',
          opus: 'claude-opus-4.5',
          sonnet: 'claude-sonnet-4.5',
          haiku: 'claude-haiku-4.5',
        },
      },
      {
        id: 'claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        description: 'Anthropic Claude Sonnet 4.5 via GitHub Copilot',
        presetMapping: {
          default: 'claude-sonnet-4.5',
          opus: 'claude-opus-4.5',
          sonnet: 'claude-sonnet-4.5',
          haiku: 'claude-haiku-4.5',
        },
      },
      {
        id: 'claude-sonnet-4',
        name: 'Claude Sonnet 4',
        description: 'Anthropic Claude Sonnet 4 via GitHub Copilot',
      },
      {
        id: 'claude-haiku-4.5',
        name: 'Claude Haiku 4.5',
        description: 'Anthropic Claude Haiku 4.5 via GitHub Copilot',
      },
      {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        description: 'OpenAI GPT-5.2 via GitHub Copilot',
        presetMapping: {
          default: 'gpt-5.2',
          opus: 'gpt-5.2',
          sonnet: 'gpt-5.1',
          haiku: 'gpt-5-mini',
        },
      },
      {
        id: 'gpt-5.1',
        name: 'GPT-5.1',
        description: 'OpenAI GPT-5.1 via GitHub Copilot',
      },
      {
        id: 'gpt-5',
        name: 'GPT-5',
        description: 'OpenAI GPT-5 via GitHub Copilot',
      },
      {
        id: 'gpt-5-mini',
        name: 'GPT-5 Mini',
        description: 'OpenAI GPT-5 Mini via GitHub Copilot',
      },
      {
        id: 'gemini-3-pro',
        name: 'Gemini 3 Pro',
        description: 'Google Gemini 3 Pro via GitHub Copilot',
      },
    ],
  },
  claude: {
    provider: 'claude',
    displayName: 'Claude (Anthropic)',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        description: 'Latest flagship model',
        extendedContext: true,
        presetMapping: {
          default: 'claude-opus-4-6',
          opus: 'claude-opus-4-6',
          sonnet: 'claude-sonnet-4-6',
          haiku: 'claude-haiku-4-5-20251001',
        },
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        description: 'Balanced performance and speed',
        extendedContext: true,
        presetMapping: {
          default: 'claude-sonnet-4-6',
          opus: 'claude-opus-4-6',
          sonnet: 'claude-sonnet-4-6',
          haiku: 'claude-haiku-4-5-20251001',
        },
      },
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        description: 'Most capable Claude model',
        extendedContext: true,
        presetMapping: {
          default: 'claude-opus-4-5-20251101',
          opus: 'claude-opus-4-5-20251101',
          sonnet: 'claude-sonnet-4-5-20250929',
          haiku: 'claude-haiku-4-5-20251001',
        },
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        description: 'Balanced performance and speed',
        extendedContext: true,
        presetMapping: {
          default: 'claude-sonnet-4-5-20250929',
          opus: 'claude-opus-4-5-20251101',
          sonnet: 'claude-sonnet-4-5-20250929',
          haiku: 'claude-haiku-4-5-20251001',
        },
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        description: 'Previous generation Sonnet',
        extendedContext: true,
        presetMapping: {
          default: 'claude-sonnet-4-20250514',
          opus: 'claude-opus-4-5-20251101',
          sonnet: 'claude-sonnet-4-20250514',
          haiku: 'claude-haiku-4-5-20251001',
        },
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        description: 'Fast and efficient',
      },
    ],
  },
};

function findCatalogModelInCatalog(catalog: ProviderCatalog | undefined, modelId: string) {
  if (!catalog) return undefined;

  const normalizedModelId = normalizeModelId(modelId);
  if (catalog.provider === 'agy') {
    const agyCompatibilityId = getAgyGeminiProCompatibilityId(normalizedModelId);
    if (agyCompatibilityId) {
      const compatibilityMatch = catalog.models.find((model) => model.id === agyCompatibilityId);
      if (compatibilityMatch) return compatibilityMatch;
    }
  }
  const compatibilityModelId =
    GEMINI_MINOR_VERSION_COMPATIBILITY_IDS[
      normalizedModelId.toLowerCase() as keyof typeof GEMINI_MINOR_VERSION_COMPATIBILITY_IDS
    ];

  const exactMatch = catalog.models.find(
    (model) => model.id === normalizedModelId || model.id === compatibilityModelId
  );
  if (exactMatch) return exactMatch;

  const geminiModelInfo = parseGeminiPreviewModelId(normalizedModelId);
  if (!geminiModelInfo) return undefined;

  return catalog.models
    .map((model) => ({ model, info: parseGeminiPreviewModelId(model.id) }))
    .filter(
      (
        candidate
      ): candidate is {
        model: ModelEntry;
        info: GeminiPreviewModelInfo;
      } => Boolean(candidate.info && candidate.info.family === geminiModelInfo.family)
    )
    .sort((left, right) => compareGeminiVersions(right.info.version, left.info.version))[0]?.model;
}

function normalizeCatalogTier(tier: unknown): ModelEntry['tier'] {
  if (tier === 'free') return 'free';
  if (typeof tier === 'string' && tier.trim().length > 0) return 'paid';
  return undefined;
}

export function buildUiCatalog(
  provider: string,
  liveCatalog: ProviderCatalog | undefined
): ProviderCatalog | undefined {
  const staticCatalog = MODEL_CATALOGS[provider.toLowerCase()];
  if (!liveCatalog || liveCatalog.models.length === 0) {
    return staticCatalog;
  }

  const availableModels = liveCatalog.models.map((model) => ({
    id: model.id,
    owned_by: liveCatalog.provider,
  }));

  const models = liveCatalog.models.map((model) => {
    const staticModel = findCatalogModelInCatalog(staticCatalog, model.id);
    return {
      ...model,
      name: model.name || staticModel?.name || model.id,
      tier: staticModel?.tier ?? normalizeCatalogTier(model.tier),
      description: model.description ?? staticModel?.description,
      broken: staticModel?.broken,
      issueUrl: staticModel?.issueUrl,
      deprecated: staticModel?.deprecated,
      deprecationReason: staticModel?.deprecationReason,
      extendedContext: model.extendedContext ?? staticModel?.extendedContext,
      presetMapping: staticModel?.presetMapping,
    };
  });

  const fallbackDefaultModel = staticCatalog?.defaultModel
    ? resolveCatalogModelId(staticCatalog.defaultModel, availableModels)
    : undefined;
  const hasFallbackDefaultModel =
    typeof fallbackDefaultModel === 'string' &&
    availableModels.some(
      (model) => normalizeModelId(model.id) === normalizeModelId(fallbackDefaultModel)
    );

  return {
    provider: liveCatalog.provider,
    displayName: liveCatalog.displayName || staticCatalog?.displayName || provider,
    defaultModel: hasFallbackDefaultModel ? fallbackDefaultModel : liveCatalog.defaultModel,
    models,
  };
}

export function buildUiCatalogs(
  liveCatalogs: Partial<Record<string, ProviderCatalog>> | undefined
): Partial<Record<string, ProviderCatalog>> {
  const catalogs: Partial<Record<string, ProviderCatalog>> = {};
  const providers = new Set<string>([
    ...Object.keys(MODEL_CATALOGS),
    ...Object.keys(liveCatalogs ?? {}),
  ]);

  for (const provider of providers) {
    const catalog = buildUiCatalog(provider, liveCatalogs?.[provider]);
    if (catalog) {
      catalogs[provider] = catalog;
    }
  }

  return catalogs;
}

export function findCatalogModel(
  provider: string,
  modelId: string,
  catalogOverride?: ProviderCatalog
) {
  const overrideMatch = findCatalogModelInCatalog(catalogOverride, modelId);
  if (overrideMatch) {
    return overrideMatch;
  }

  return findCatalogModelInCatalog(MODEL_CATALOGS[provider.toLowerCase()], modelId);
}

export function resolveCatalogModelId(
  modelId: string,
  availableModels: CatalogAvailableModel[] = []
): string {
  const normalizedModelId = normalizeModelId(modelId);
  const liveGeminiModelId = resolveGeminiPreviewModelId(normalizedModelId, availableModels);
  if (liveGeminiModelId) return liveGeminiModelId;

  const exactLiveModelId = findAvailableModelId(availableModels, normalizedModelId);
  if (exactLiveModelId) return exactLiveModelId;

  const compatibilityModelId =
    GEMINI_MINOR_VERSION_COMPATIBILITY_IDS[
      normalizedModelId as keyof typeof GEMINI_MINOR_VERSION_COMPATIBILITY_IDS
    ];
  const compatibleLiveModelId = compatibilityModelId
    ? findAvailableModelId(availableModels, compatibilityModelId)
    : undefined;

  return compatibleLiveModelId ?? normalizedModelId;
}

export function resolvePresetMapping(
  presetMapping: NonNullable<ModelEntry['presetMapping']>,
  availableModels: CatalogAvailableModel[] = []
) {
  return {
    default: resolveCatalogModelId(presetMapping.default, availableModels),
    opus: resolveCatalogModelId(presetMapping.opus, availableModels),
    sonnet: resolveCatalogModelId(presetMapping.sonnet, availableModels),
    haiku: resolveCatalogModelId(presetMapping.haiku, availableModels),
  };
}

export function getResolvedCatalogModels(
  catalog: ProviderCatalog | undefined,
  availableModels: CatalogAvailableModel[] = []
) {
  if (!catalog) return [];

  const recommendedCatalog = MODEL_CATALOGS[catalog.provider.toLowerCase()] ?? catalog;
  const seenModelIds = new Set<string>();

  return recommendedCatalog.models
    .map((model) => {
      const resolvedModelId = resolveCatalogModelId(model.id, availableModels);
      const resolvedPresetModelMapping = model.presetMapping
        ? resolvePresetMapping(model.presetMapping, availableModels)
        : undefined;
      const liveModelMatch = catalog.models.find(
        (catalogModel) => normalizeModelId(catalogModel.id) === normalizeModelId(resolvedModelId)
      );

      return {
        ...model,
        id: resolvedModelId,
        name: liveModelMatch?.name || model.name,
        description: liveModelMatch?.description ?? model.description,
        presetMapping: resolvedPresetModelMapping,
      };
    })
    .filter((model) => {
      if (seenModelIds.has(model.id)) return false;
      seenModelIds.add(model.id);
      return true;
    });
}

export function getSupplementalCatalogModels(
  provider: string,
  catalog: ProviderCatalog | undefined,
  availableModels: CatalogAvailableModel[] = []
) {
  const normalizedProvider = provider.trim().toLowerCase();
  if (!catalog || !normalizedProvider) return [];

  const staticCatalog = MODEL_CATALOGS[normalizedProvider] ?? catalog;
  const recommendedModels = getResolvedCatalogModels(catalog, availableModels);
  const recommendedIds = new Set(recommendedModels.map((model) => normalizeModelId(model.id)));
  const recommendedCanonicalIds = new Set(
    recommendedModels
      .map((model) => findCatalogModelInCatalog(staticCatalog, model.id)?.id)
      .filter((modelId): modelId is string => Boolean(modelId))
      .map((modelId) => normalizeModelId(modelId))
  );
  const seenCanonicalIds = new Set<string>();
  const normalizedRawIds = new Set(availableModels.map((model) => normalizeModelId(model.id)));

  return availableModels.filter((availableModel) => {
    const normalizedAvailableModelId = normalizeModelId(availableModel.id);
    const strippedModelId = stripManagedModelPrefix(availableModel.id);
    const baseModelId = stripCustomtoolsSuffix(strippedModelId);
    const matchedModel =
      findCatalogModelInCatalog(staticCatalog, strippedModelId) ??
      findCatalogModelInCatalog(staticCatalog, baseModelId);

    if (recommendedIds.has(normalizeModelId(strippedModelId))) {
      return false;
    }

    if (
      normalizedAvailableModelId !== normalizeModelId(strippedModelId) &&
      normalizedRawIds.has(normalizeModelId(strippedModelId))
    ) {
      return false;
    }

    const normalizedBaseModelId = normalizeModelId(baseModelId);
    if (
      normalizedBaseModelId !== normalizeModelId(strippedModelId) &&
      normalizedRawIds.has(normalizedBaseModelId)
    ) {
      return false;
    }

    const canonicalId = matchedModel ? normalizeModelId(matchedModel.id) : normalizedBaseModelId;
    if (matchedModel && recommendedCanonicalIds.has(canonicalId)) {
      return false;
    }
    if (seenCanonicalIds.has(canonicalId)) {
      return false;
    }

    if (!matchedModel && normalizedProvider === 'agy') {
      return false;
    }

    seenCanonicalIds.add(canonicalId);
    return true;
  });
}

export function supportsExtendedContext(
  provider: string,
  modelId: string,
  catalogOverride?: ProviderCatalog
): boolean {
  return findCatalogModel(provider, modelId, catalogOverride)?.extendedContext === true;
}
