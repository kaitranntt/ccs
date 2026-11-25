/**
 * Claude (Anthropic) Provider Model Catalog Definition
 */

import type { ProviderCatalog } from '../model-catalog-types';

export const CLAUDE_MODEL_CATALOG: ProviderCatalog = {
  provider: 'claude',
  displayName: 'Claude (Anthropic)',
  defaultModel: 'claude-sonnet-5-5',
  models: [
    {
      id: 'claude-sonnet-5-5',
      name: 'Claude Sonnet 5.5',
      description: 'Latest Sonnet model (1M context, 128K output)',
      contextWindow: 1000000,
      nativeImageInput: true,
      // Adaptive thinking; Anthropic rejects `thinking.type: "disabled"` and manual
      // budget_tokens with 400 (its off switch is `between_tools`, which CCS does not
      // emit), so zero is not allowed. Effort levels are recalibrated from Sonnet 5.
      thinking: {
        type: 'levels',
        levels: ['low', 'medium', 'high', 'xhigh', 'max'],
        maxLevel: 'max',
        dynamicAllowed: true,
      },
      extendedContext: true,
    },
    {
      id: 'claude-sonnet-5',
      name: 'Claude Sonnet 5',
      description: 'Previous Sonnet model',
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
      id: 'claude-fable-5-2',
      name: 'Claude Fable 5.2',
      description: 'Most powerful model (1M context, 128K output)',
      contextWindow: 1000000,
      nativeImageInput: true,
      // Same request surface as Fable 5.1: thinking is always on, `disabled` and
      // manual budget_tokens are rejected with 400, and depth is steered only
      // through effort levels (default `high`). Listed first so it backs the
      // Claude Code `fable` tier by default (getDefaultFableTierModel).
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
      description: 'Previous most powerful model (1M context, 128K output)',
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
      description: 'Older most powerful model',
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
      id: 'claude-opus-5-5',
      name: 'Claude Opus 5.5',
      description: 'Most capable model for long-running agentic coding and knowledge work',
      contextWindow: 1000000,
      nativeImageInput: true,
      // Thinking is always on: Anthropic rejects `thinking.type: "disabled"` and
      // manual budget_tokens with 400. Default effort is `medium`, not `high`.
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
      id: 'claude-haiku-5-5',
      name: 'Claude Haiku 5.5',
      description: 'Fast and efficient (1M context, 128K output)',
      contextWindow: 1000000,
      nativeImageInput: true,
      // Adaptive thinking is on by default (default effort `medium`); Anthropic
      // rejects manual budget_tokens with 400 and accepts `thinking.type: "disabled"`
      // only at effort `high` or below, so zero is not allowed.
      thinking: {
        type: 'levels',
        levels: ['low', 'medium', 'high', 'xhigh', 'max'],
        maxLevel: 'max',
        dynamicAllowed: true,
      },
      extendedContext: true,
    },
    {
      id: 'claude-haiku-4-5-20251001',
      name: 'Claude Haiku 4.5',
      description: 'Previous Haiku model',
      contextWindow: 200000,
      nativeImageInput: true,
      thinking: { type: 'none' },
    },
  ],
};
