/**
 * Model Catalogs for CLIProxy providers
 * Shared data for Quick Setup Wizard and Provider Editor
 */

import type { ProviderCatalog } from '@/components/cliproxy/provider-model-selector';

/** Model catalog data - mirrors src/cliproxy/model-catalog.ts */
export const MODEL_CATALOGS: Record<string, ProviderCatalog> = {
  agy: {
    provider: 'agy',
    displayName: 'Antigravity',
    defaultModel: 'gemini-claude-opus-4-6-thinking',
    models: [
      {
        id: 'gemini-claude-opus-4-6-thinking',
        name: 'Claude Opus 4.6 Thinking',
        description: 'Latest flagship, 1M context, extended thinking',
        extendedContext: true,
        presetMapping: {
          default: 'gemini-claude-opus-4-6-thinking',
          opus: 'gemini-claude-opus-4-6-thinking',
          sonnet: 'gemini-claude-sonnet-4-5-thinking',
          haiku: 'gemini-claude-sonnet-4-5',
        },
      },
      {
        id: 'gemini-claude-opus-4-5-thinking',
        name: 'Claude Opus 4.5 Thinking',
        description: 'Previous flagship, extended thinking',
        presetMapping: {
          default: 'gemini-claude-opus-4-5-thinking',
          opus: 'gemini-claude-opus-4-5-thinking',
          sonnet: 'gemini-claude-sonnet-4-5-thinking',
          haiku: 'gemini-claude-sonnet-4-5',
        },
      },
      {
        id: 'gemini-claude-sonnet-4-5-thinking',
        name: 'Claude Sonnet 4.5 Thinking',
        description: 'Balanced with extended thinking',
        presetMapping: {
          default: 'gemini-claude-sonnet-4-5-thinking',
          opus: 'gemini-claude-opus-4-6-thinking',
          sonnet: 'gemini-claude-sonnet-4-5-thinking',
          haiku: 'gemini-claude-sonnet-4-5',
        },
      },
      {
        id: 'gemini-claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        description: 'Fast and capable',
        presetMapping: {
          default: 'gemini-claude-sonnet-4-5',
          opus: 'gemini-claude-opus-4-6-thinking',
          sonnet: 'gemini-claude-sonnet-4-5',
          haiku: 'gemini-claude-sonnet-4-5',
        },
      },
      {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro',
        description: 'Google latest model via Antigravity',
        extendedContext: true,
        presetMapping: {
          default: 'gemini-3-pro-preview',
          opus: 'gemini-3-pro-preview',
          sonnet: 'gemini-3-pro-preview',
          haiku: 'gemini-3-flash-preview',
        },
      },
      {
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash',
        description: 'Fast Gemini model via Antigravity',
        extendedContext: true,
        presetMapping: {
          default: 'gemini-3-flash-preview',
          opus: 'gemini-3-pro-preview',
          sonnet: 'gemini-3-pro-preview',
          haiku: 'gemini-3-flash-preview',
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
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro',
        tier: 'paid',
        description: 'Latest model, requires paid Google account',
        extendedContext: true,
        presetMapping: {
          default: 'gemini-3-pro-preview',
          opus: 'gemini-3-pro-preview',
          sonnet: 'gemini-3-pro-preview',
          haiku: 'gemini-3-flash-preview',
        },
      },
      {
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash',
        tier: 'paid',
        description: 'Fast Gemini 3 model, requires paid Google account',
        extendedContext: true,
        presetMapping: {
          default: 'gemini-3-flash-preview',
          opus: 'gemini-3-pro-preview',
          sonnet: 'gemini-3-pro-preview',
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
    defaultModel: 'gpt-5.2-codex',
    models: [
      {
        id: 'gpt-5.2-codex',
        name: 'GPT-5.2 Codex',
        description: 'Full reasoning support (xhigh)',
        presetMapping: {
          default: 'gpt-5.2-codex',
          opus: 'gpt-5.2-codex',
          sonnet: 'gpt-5.2-codex',
          haiku: 'gpt-5-mini',
        },
      },
      {
        id: 'gpt-5-mini',
        name: 'GPT-5 Mini',
        description: 'Fast, capped at high reasoning (no xhigh)',
        presetMapping: {
          default: 'gpt-5-mini',
          opus: 'gpt-5.2-codex',
          sonnet: 'gpt-5-mini',
          haiku: 'gpt-5-mini',
        },
      },
      {
        id: 'gpt-5.1-codex-max',
        name: 'Codex Max (5.1)',
        description: 'Legacy most capable Codex model',
        presetMapping: {
          default: 'gpt-5.1-codex-max',
          opus: 'gpt-5.1-codex-max-high',
          sonnet: 'gpt-5.1-codex-max',
          haiku: 'gpt-5.1-codex-mini-high',
        },
      },
      {
        id: 'gpt-5.2',
        name: 'GPT 5.2',
        description: 'Latest GPT model',
        presetMapping: {
          default: 'gpt-5.2',
          opus: 'gpt-5.2',
          sonnet: 'gpt-5.2',
          haiku: 'gpt-5.2',
        },
      },
      {
        id: 'gpt-5.1-codex-mini',
        name: 'Codex Mini',
        description: 'Fast and efficient Codex model',
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
    defaultModel: 'iflow-default',
    models: [
      {
        id: 'iflow-default',
        name: 'iFlow Default',
        description: 'Default iFlow model',
      },
    ],
  },
  kiro: {
    provider: 'kiro',
    displayName: 'Kiro (AWS)',
    defaultModel: 'kiro-claude-sonnet-4-5',
    models: [
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
    defaultModel: 'claude-sonnet-4-5-20250929',
    models: [
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        description: 'Latest flagship model',
        extendedContext: true,
        presetMapping: {
          default: 'claude-opus-4-6',
          opus: 'claude-opus-4-6',
          sonnet: 'claude-sonnet-4-5-20250929',
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
