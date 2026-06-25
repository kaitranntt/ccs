/**
 * Shared provider preset catalog for CLI + Dashboard.
 *
 * Keep this file runtime-agnostic (no Node/browser APIs) so both
 * backend and UI can import the same source of truth.
 */

export type PresetCategory = 'recommended' | 'alternative';
export type ProviderPresetTarget = 'claude' | 'droid';

export const PROVIDER_PRESET_IDS = [
  'openrouter',
  'alibaba-coding-plan',
  'huggingface',
  'tuningengines',
  'ollama',
  'llamacpp',
  'anthropic',
  'glm',
  'km',
  'foundry',
  'mm',
  'deepseek',
  'qwen',
  'ollama-cloud',
  'novita',
  'fireworks',
  'requesty',
] as const;

export type ProviderPresetId = (typeof PROVIDER_PRESET_IDS)[number];

export interface ProviderPresetDefinition {
  id: ProviderPresetId;
  name: string;
  description: string;
  baseUrl: string;
  defaultProfileName: string;
  defaultModel: string;
  apiKeyPlaceholder: string;
  apiKeyHint: string;
  category: PresetCategory;
  requiresApiKey: boolean;
  defaultTarget?: ProviderPresetTarget;
  /** Additional env vars for thinking mode, etc. */
  extraEnv?: Record<string, string>;
  /** Enable always thinking mode. */
  alwaysThinkingEnabled?: boolean;
  /** UI metadata */
  badge?: string;
  featured?: boolean;
  icon?: string;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Legacy aliases mapped to canonical preset IDs.
 * Keep this minimal and explicit to avoid hidden implicit behavior.
 */
export const PROVIDER_PRESET_ALIASES: Readonly<Record<string, ProviderPresetId>> = Object.freeze({
  glmt: 'glm',
  kimi: 'km',
  alibaba: 'alibaba-coding-plan',
  acp: 'alibaba-coding-plan',
  hf: 'huggingface',
  te: 'tuningengines',
  tuning: 'tuningengines',
});

const RAW_PROVIDER_PRESET_DEFINITIONS: readonly ProviderPresetDefinition[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: '349+ models from OpenAI, Anthropic, Google, Meta',
    baseUrl: OPENROUTER_BASE_URL,
    defaultProfileName: 'openrouter',
    defaultModel: 'anthropic/claude-opus-4.5',
    apiKeyPlaceholder: 'sk-or-...',
    apiKeyHint: 'Get your API key at openrouter.ai/keys',
    category: 'recommended',
    requiresApiKey: true,
    badge: '349+ models',
    featured: true,
    icon: '/icons/openrouter.svg',
  },
  {
    id: 'alibaba-coding-plan',
    name: 'Alibaba Coding Plan',
    description: 'Alibaba Cloud Coding Plan via Anthropic-compatible endpoint',
    baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic',
    defaultProfileName: 'albb',
    defaultModel: 'qwen3-coder-plus',
    apiKeyPlaceholder: 'sk-sp-...',
    apiKeyHint: 'Get your Coding Plan key from Alibaba Cloud Model Studio',
    category: 'recommended',
    requiresApiKey: true,
    badge: 'Coding Plan',
    featured: true,
    icon: '/assets/providers/alibabacloud-color.svg',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Local open-source models via Ollama (32K+ context)',
    baseUrl: 'http://localhost:11434',
    defaultProfileName: 'ollama',
    defaultModel: 'qwen3-coder',
    apiKeyPlaceholder: 'ollama',
    apiKeyHint: 'Install Ollama from ollama.com - no API key needed for local',
    category: 'recommended',
    requiresApiKey: false,
    badge: 'Local',
    featured: true,
    icon: '/icons/ollama.svg',
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp (Local)',
    description: 'Local inference via llama.cpp (LLaMA models)',
    baseUrl: 'http://127.0.0.1:8080',
    defaultProfileName: 'llamacpp',
    defaultModel: 'llama3-8b',
    apiKeyPlaceholder: 'llamacpp',
    apiKeyHint: 'Run llama.cpp server: ./server --host 0.0.0.0 --port 8080 -m model.gguf',
    category: 'recommended',
    requiresApiKey: false,
    badge: 'Local',
    featured: true,
    icon: '/assets/providers/llama-cpp.svg',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Direct API)',
    description: 'Use your own Anthropic API key (sk-ant-...)',
    baseUrl: '',
    defaultProfileName: 'anthropic',
    defaultModel: 'claude-sonnet-4-5-20250929',
    apiKeyPlaceholder: 'sk-ant-api03-...',
    apiKeyHint: 'Get key at console.anthropic.com/settings/keys',
    category: 'recommended',
    requiresApiKey: true,
    badge: 'Direct',
    featured: true,
    icon: '/assets/providers/claude.svg',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Inference Providers router via OpenAI-compatible chat completions',
    baseUrl: 'https://router.huggingface.co/v1',
    defaultProfileName: 'hf',
    defaultModel: 'openai/gpt-oss-120b:fastest',
    apiKeyPlaceholder: 'hf_...',
    apiKeyHint: 'Create a User Access Token at hf.co/settings/tokens',
    category: 'alternative',
    requiresApiKey: true,
    defaultTarget: 'droid',
    badge: 'Router',
  },
  {
    id: 'tuningengines',
    name: 'Tuning Engines',
    description: 'OpenAI-compatible chat completions gateway',
    baseUrl: 'https://api.tuningengines.com/v1',
    defaultProfileName: 'te',
    defaultModel: 'gpt-4o',
    apiKeyPlaceholder: 'sk-te-...',
    apiKeyHint: 'Create an inference key at app.tuningengines.com/inference/keys',
    category: 'alternative',
    requiresApiKey: true,
    defaultTarget: 'droid',
    badge: 'Gateway',
  },
  {
    id: 'glm',
    name: 'GLM',
    description: 'Direct Z.AI Anthropic-compatible API profile',
    baseUrl: 'https://api.z.ai/api/anthropic',
    defaultProfileName: 'glm',
    defaultModel: 'glm-5.2',
    apiKeyPlaceholder: 'ghp_...',
    apiKeyHint: 'Get your API key from Z.AI',
    category: 'alternative',
    requiresApiKey: true,
    badge: 'Z.AI',
    icon: '/icons/zai.svg',
  },
  {
    id: 'km',
    name: 'Kimi',
    description: 'Kimi Code membership API with stable latest-coding model alias',
    baseUrl: 'https://api.kimi.com/coding/',
    defaultProfileName: 'km',
    defaultModel: 'kimi-for-coding',
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: 'Get your API key from the Kimi Code Console',
    category: 'alternative',
    requiresApiKey: true,
    alwaysThinkingEnabled: true,
    badge: 'Kimi Code',
    icon: '/icons/kimi.svg',
  },
  {
    id: 'foundry',
    name: 'Azure Foundry',
    description: 'Claude via Microsoft Azure AI Foundry',
    baseUrl: 'https://<your-resource>.services.ai.azure.com/api/anthropic',
    defaultProfileName: 'foundry',
    defaultModel: 'claude-sonnet-4-5',
    apiKeyPlaceholder: 'YOUR_AZURE_API_KEY',
    apiKeyHint: 'Create resource at ai.azure.com, get API key from Keys tab',
    category: 'alternative',
    requiresApiKey: true,
    badge: 'Azure',
    icon: '/icons/azure.svg',
  },
  {
    id: 'mm',
    name: 'Minimax',
    description: 'M3 frontier multimodal coding model with 1M context',
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultProfileName: 'mm',
    defaultModel: 'MiniMax-M3',
    apiKeyPlaceholder: 'YOUR_MINIMAX_API_KEY_HERE',
    apiKeyHint: 'Get your API key at platform.minimax.io',
    category: 'alternative',
    requiresApiKey: true,
    badge: '1M context',
    icon: '/icons/minimax.svg',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'V3.2 and R1 reasoning model (128K context)',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultProfileName: 'deepseek',
    defaultModel: 'deepseek-chat',
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: 'Get your API key at platform.deepseek.com',
    category: 'alternative',
    requiresApiKey: true,
    badge: 'Reasoning',
    icon: '/icons/deepseek.svg',
  },
  {
    id: 'qwen',
    name: 'Qwen',
    description: 'Alibaba Cloud - Qwen3 models (256K-1M context, thinking support)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/apps/anthropic',
    defaultProfileName: 'qwen-api',
    defaultModel: 'qwen3-coder-plus',
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: 'Get your API key from Alibaba Cloud Model Studio',
    category: 'alternative',
    requiresApiKey: true,
    badge: 'Alibaba',
    icon: '/assets/providers/qwen-color.svg',
  },
  {
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    description: 'Ollama cloud models via direct API (glm-5:cloud, minimax-m2.1:cloud)',
    baseUrl: 'https://ollama.com',
    defaultProfileName: 'ollama-cloud',
    defaultModel: 'glm-5:cloud',
    apiKeyPlaceholder: 'YOUR_OLLAMA_CLOUD_API_KEY',
    apiKeyHint: 'Get your API key at ollama.com',
    category: 'alternative',
    requiresApiKey: true,
    badge: 'Cloud',
    icon: '/icons/ollama.svg',
  },
  {
    id: 'novita',
    name: 'Novita AI',
    description: 'Anthropic-compatible API for Claude Code and CCS profiles',
    baseUrl: 'https://api.novita.ai/anthropic',
    defaultProfileName: 'novita',
    defaultModel: 'deepseek/deepseek-v3.2',
    apiKeyPlaceholder: 'YOUR_NOVITA_API_KEY',
    apiKeyHint: 'Get your API key at novita.ai',
    category: 'alternative',
    requiresApiKey: true,
    badge: 'Anthropic-compatible',
    icon: '/icons/novita.svg',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    description: 'Anthropic-compatible inference (Kimi, Qwen, Llama) via api.fireworks.ai',
    baseUrl: 'https://api.fireworks.ai/inference',
    defaultProfileName: 'fireworks',
    defaultModel: 'accounts/fireworks/models/kimi-k2p5',
    apiKeyPlaceholder: 'fw_...',
    apiKeyHint: 'Get your API key at fireworks.ai/api-keys',
    category: 'alternative',
    requiresApiKey: true,
    badge: 'Anthropic-compatible',
  },
  {
    id: 'requesty',
    name: 'Requesty',
    description: 'OpenAI-compatible LLM gateway (provider/model naming, e.g. openai/gpt-4o-mini)',
    baseUrl: 'https://router.requesty.ai/v1',
    defaultProfileName: 'requesty',
    defaultModel: 'openai/gpt-4o-mini',
    apiKeyPlaceholder: 'rqsty-sk-...',
    apiKeyHint: 'Create an API key at app.requesty.ai/api-keys',
    category: 'alternative',
    requiresApiKey: true,
    badge: 'OpenAI-compatible',
  },
];

function clonePresetDefinition(preset: ProviderPresetDefinition): ProviderPresetDefinition {
  return {
    ...preset,
    extraEnv: preset.extraEnv ? { ...preset.extraEnv } : undefined,
  };
}

function freezePresetDefinition(preset: ProviderPresetDefinition): ProviderPresetDefinition {
  const cloned = clonePresetDefinition(preset);
  if (cloned.extraEnv) {
    Object.freeze(cloned.extraEnv);
  }
  return Object.freeze(cloned);
}

function assertProviderPresetCatalogIntegrity(
  definitions: readonly ProviderPresetDefinition[],
  aliases: Readonly<Record<string, ProviderPresetId>>
): void {
  const presetIdSet = new Set<string>();
  for (const definition of definitions) {
    const normalizedId = definition.id.trim().toLowerCase();
    if (definition.id !== normalizedId) {
      throw new Error(`Preset ID must be normalized: "${definition.id}"`);
    }
    if (presetIdSet.has(definition.id)) {
      throw new Error(`Duplicate preset ID detected: "${definition.id}"`);
    }
    presetIdSet.add(definition.id);
  }

  const normalizedAliasSet = new Set<string>();
  for (const [alias, target] of Object.entries(aliases)) {
    const normalizedAlias = alias.trim().toLowerCase();
    if (!normalizedAlias) {
      throw new Error('Preset alias keys cannot be empty');
    }
    if (alias !== normalizedAlias) {
      throw new Error(`Preset alias must be normalized: "${alias}"`);
    }
    if (normalizedAliasSet.has(normalizedAlias)) {
      throw new Error(`Duplicate normalized preset alias detected: "${alias}"`);
    }
    normalizedAliasSet.add(normalizedAlias);

    if (!presetIdSet.has(target)) {
      throw new Error(`Preset alias "${alias}" points to unknown target "${target}"`);
    }
    if (presetIdSet.has(normalizedAlias)) {
      throw new Error(
        `Preset alias "${alias}" collides with canonical preset ID "${normalizedAlias}"`
      );
    }
  }
}

assertProviderPresetCatalogIntegrity(RAW_PROVIDER_PRESET_DEFINITIONS, PROVIDER_PRESET_ALIASES);

export const PROVIDER_PRESET_DEFINITIONS: readonly ProviderPresetDefinition[] = Object.freeze(
  RAW_PROVIDER_PRESET_DEFINITIONS.map(freezePresetDefinition)
);

export function createProviderPresetDefinitions(): ProviderPresetDefinition[] {
  return PROVIDER_PRESET_DEFINITIONS.map(clonePresetDefinition);
}

export function normalizeProviderPresetId(id: string): string {
  const normalized = id.trim().toLowerCase();
  return PROVIDER_PRESET_ALIASES[normalized] || normalized;
}
