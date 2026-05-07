import { describe, expect, it } from 'bun:test';
import { getProviderCatalog, getModelMaxLevel } from '../../model-catalog';
import {
  getDefaultCodexModel,
  getFreePlanFallbackCodexModel,
  parseCodexUnsupportedModelError,
  resolveRuntimeCodexFallbackModel,
} from '../../ai-providers/codex-plan-compatibility';

describe('codex plan compatibility', () => {
  it('uses a cross-plan safe Codex default', () => {
    expect(getDefaultCodexModel()).toBe('gpt-5.4');
    expect(getProviderCatalog('codex')?.defaultModel).toBe('gpt-5.4');
  });

  it('maps paid-only free-plan models to safe fallbacks', () => {
    expect(getFreePlanFallbackCodexModel('gpt-5.5')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.5-xhigh')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.5-high-fast')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.5-fast-high')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex-xhigh')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex(high)')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex-spark')).toBe('gpt-5.4-mini');
  });

  it('does not rewrite cross-plan or already-safe Codex models', () => {
    expect(getFreePlanFallbackCodexModel('gpt-5.4')).toBeNull();
    expect(getFreePlanFallbackCodexModel('gpt-5.4-mini')).toBeNull();
    expect(getFreePlanFallbackCodexModel('gpt-5.2')).toBeNull();
  });

  it('detects upstream Codex model_not_supported responses', () => {
    expect(
      parseCodexUnsupportedModelError(
        400,
        JSON.stringify({
          error: {
            message: 'The requested model is not supported.',
            code: 'model_not_supported',
            param: 'model',
            type: 'invalid_request_error',
          },
        })
      )
    ).toEqual({
      message: 'The requested model is not supported.',
      code: 'model_not_supported',
      param: 'model',
      type: 'invalid_request_error',
    });
    expect(
      parseCodexUnsupportedModelError(500, '{"error":{"code":"model_not_supported"}}')
    ).toBeNull();
  });

  it('resolves runtime fallbacks without retrying the rejected model again', () => {
    expect(
      resolveRuntimeCodexFallbackModel({
        requestedModel: 'gpt-5.3-codex',
        modelMap: { defaultModel: 'gpt-5.4' },
      })
    ).toBe('gpt-5.4');

    expect(
      resolveRuntimeCodexFallbackModel({
        requestedModel: 'gpt-5.3-codex',
        modelMap: {
          defaultModel: 'gpt-5.4',
          haikuModel: 'gpt-5.4-mini',
        },
        excludeModels: ['gpt-5.4'],
      })
    ).toBe('gpt-5.4-mini');
  });

  it('tracks Codex thinking caps for current safe defaults, paid models, and legacy aliases', () => {
    expect(getModelMaxLevel('codex', 'gpt-5.5')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.4')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.4-mini')).toBe('high');
    expect(getModelMaxLevel('codex', 'gpt-5-codex')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5-codex-mini')).toBe('high');
    expect(getModelMaxLevel('codex', 'gpt-5.2-codex')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.3-codex')).toBe('xhigh');
  });
});
