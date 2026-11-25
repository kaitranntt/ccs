/**
 * Antigravity, Gemini, xAI, Qoder, and Kimi Provider Model Catalog Definitions
 */

import {
  AGY_GEMINI_PRO_HIGH_ID,
  AGY_GEMINI_PRO_LOW_ID,
} from '../../shared/agy-gemini-pro-compatibility';
import type { ProviderCatalog } from '../model-catalog-types';

export const AGY_MODEL_CATALOG: ProviderCatalog = {
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
};

export const GEMINI_MODEL_CATALOG: ProviderCatalog = {
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
};

export const XAI_MODEL_CATALOG: ProviderCatalog = {
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
};

export const QODER_MODEL_CATALOG: ProviderCatalog = {
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
};

export const KIMI_MODEL_CATALOG: ProviderCatalog = {
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
};
