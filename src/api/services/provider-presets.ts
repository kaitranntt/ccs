/**
 * Provider Presets for CLI
 *
 * Pre-configured templates for common API providers.
 * Mirrors the UI presets in ui/src/lib/provider-presets.ts
 */

export type PresetCategory = 'recommended' | 'alternative';

export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  defaultProfileName: string;
  defaultModel: string;
  apiKeyPlaceholder: string;
  apiKeyHint: string;
  category: PresetCategory;
  /** Additional env vars for thinking mode, etc. */
  extraEnv?: Record<string, string>;
  /** Enable always thinking mode */
  alwaysThinkingEnabled?: boolean;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api';

/**
 * Provider presets available via CLI and UI
 *
 * NOTE: Keep in sync with ui/src/lib/provider-presets.ts
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  // Recommended
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
  },
  // Alternative providers
  {
    id: 'glm',
    name: 'GLM',
    description: 'Claude via Z.AI',
    baseUrl: 'https://api.z.ai/api/anthropic',
    defaultProfileName: 'glm',
    defaultModel: 'glm-4.7',
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
    defaultModel: 'glm-4.7',
    apiKeyPlaceholder: 'ghp_...',
    apiKeyHint: 'Same API key as GLM',
    category: 'alternative',
    extraEnv: {
      ANTHROPIC_TEMPERATURE: '0.2',
      ANTHROPIC_MAX_TOKENS: '65536',
      MAX_THINKING_TOKENS: '32768',
      ENABLE_STREAMING: 'true',
      ANTHROPIC_SAFE_MODE: 'false',
      API_TIMEOUT_MS: '3000000',
    },
    alwaysThinkingEnabled: true,
  },
  {
    id: 'kimi',
    name: 'Kimi',
    description: 'Moonshot AI - Fast reasoning model',
    baseUrl: 'https://api.kimi.com/coding/',
    defaultProfileName: 'kimi',
    defaultModel: 'kimi-k2-thinking-turbo',
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: 'Get your API key from Moonshot AI',
    category: 'alternative',
    alwaysThinkingEnabled: true,
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
  },
  {
    id: 'mm',
    name: 'Minimax',
    description: 'M2.1/M2.1-lightning/M2 - multilang coding (1M context)',
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultProfileName: 'mm',
    defaultModel: 'MiniMax-M2.1',
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
    defaultModel: 'deepseek-chat',
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
    defaultModel: 'qwen3-coder-plus',
    apiKeyPlaceholder: 'sk-...',
    apiKeyHint: 'Get your API key from Alibaba Cloud Model Studio',
    category: 'alternative',
  },
];

/** Get preset by ID */
export function getPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id.toLowerCase());
}

/** Get all preset IDs */
export function getPresetIds(): string[] {
  return PROVIDER_PRESETS.map((p) => p.id);
}

/** Check if preset ID is valid */
export function isValidPresetId(id: string): boolean {
  return getPresetById(id) !== undefined;
}
