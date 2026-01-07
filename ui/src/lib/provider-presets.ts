/**
 * Provider Presets Configuration
 * Pre-configured templates for common API providers
 */

export type PresetCategory = 'recommended' | 'alternative';

export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  defaultProfileName: string;
  badge?: string;
  featured?: boolean;
  icon?: string;
  defaultModel?: string;
  requiresApiKey: boolean;
  apiKeyPlaceholder: string;
  apiKeyHint?: string;
  category: PresetCategory;
  /** Additional env vars for thinking mode, etc. */
  extraEnv?: Record<string, string>;
  /** Enable always thinking mode */
  alwaysThinkingEnabled?: boolean;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api';

export const PROVIDER_PRESETS: ProviderPreset[] = [
  // Recommended - OpenRouter
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: '349+ models from OpenAI, Anthropic, Google, Meta',
    baseUrl: OPENROUTER_BASE_URL,
    defaultProfileName: 'openrouter',
    badge: '349+ models',
    featured: true,
    icon: '/icons/openrouter.svg',
    defaultModel: 'anthropic/claude-opus-4.5',
    requiresApiKey: true,
    apiKeyPlaceholder: 'sk-or-...',
    apiKeyHint: 'Get your API key at openrouter.ai/keys',
    category: 'recommended',
  },
  // Alternative providers - GLM/GLMT/Kimi
  {
    id: 'glm',
    name: 'GLM',
    description: 'Claude via Z.AI',
    baseUrl: 'https://api.z.ai/api/anthropic',
    defaultProfileName: 'glm',
    badge: 'Z.AI',
    defaultModel: 'glm-4.7',
    requiresApiKey: true,
    apiKeyPlaceholder: 'ghp_...',
    apiKeyHint: 'Get your API key from Z.AI',
    category: 'alternative',
  },
  {
    id: 'glmt',
    name: 'GLMT',
    description: 'GLM with Thinking mode support',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
    defaultProfileName: 'glmt',
    badge: 'Thinking',
    defaultModel: 'glm-4.7',
    requiresApiKey: true,
    apiKeyPlaceholder: 'ghp_...',
    apiKeyHint: 'Same API key as GLM',
    category: 'alternative',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    description: 'Moonshot AI - Fast reasoning model',
    baseUrl: 'https://api.kimi.com/coding/',
    defaultProfileName: 'kimi',
    badge: 'Reasoning',
    defaultModel: 'kimi-k2-thinking-turbo',
    requiresApiKey: true,
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: 'Get your API key from Moonshot AI',
    category: 'alternative',
  },
  {
    id: 'foundry',
    name: 'Azure Foundry',
    description: 'Claude via Microsoft Azure AI Foundry',
    baseUrl: 'https://<your-resource>.services.ai.azure.com/api/anthropic',
    defaultProfileName: 'foundry',
    badge: 'Azure',
    defaultModel: 'claude-sonnet-4-5',
    requiresApiKey: true,
    apiKeyPlaceholder: 'YOUR_AZURE_API_KEY',
    apiKeyHint: 'Create resource at ai.azure.com, get API key from Keys tab',
    category: 'alternative',
  },
  {
    id: 'mm',
    name: 'Minimax',
    description: 'M2.1/M2.1-lightning/M2 - multilang coding (1M context)',
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultProfileName: 'mm',
    badge: '1M context',
    defaultModel: 'MiniMax-M2.1',
    requiresApiKey: true,
    apiKeyPlaceholder: 'YOUR_MINIMAX_API_KEY_HERE',
    apiKeyHint: 'Get your API key at platform.minimax.io',
    category: 'alternative',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'V3.2 and R1 reasoning model (128K context)',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultProfileName: 'deepseek',
    badge: 'Reasoning',
    defaultModel: 'deepseek-chat',
    requiresApiKey: true,
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: 'Get your API key at platform.deepseek.com',
    category: 'alternative',
  },
  {
    id: 'qwen',
    name: 'Qwen',
    description: 'Alibaba Cloud - qwen3-coder-plus (256K context)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/apps/anthropic',
    defaultProfileName: 'qwen',
    badge: 'Alibaba',
    defaultModel: 'qwen3-coder-plus',
    requiresApiKey: true,
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: 'Get your API key from Alibaba Cloud Model Studio',
    category: 'alternative',
  },
];

/** Get presets by category */
export function getPresetsByCategory(category: PresetCategory): ProviderPreset[] {
  return PROVIDER_PRESETS.filter((p) => p.category === category);
}

/** Get preset by ID */
export function getPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id.toLowerCase() === id.toLowerCase());
}

/** Check if a URL matches a known preset */
export function detectPresetFromUrl(baseUrl: string): ProviderPreset | undefined {
  const normalizedUrl = baseUrl.toLowerCase().trim();
  return PROVIDER_PRESETS.find((p) => normalizedUrl.includes(p.baseUrl.toLowerCase()));
}
