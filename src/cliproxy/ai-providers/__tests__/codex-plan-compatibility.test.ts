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
    expect(getFreePlanFallbackCodexModel('gpt-5.5-minimal')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.5-low')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.5-xhigh')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.5-low-fast')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.5-high-fast')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.5-fast-minimal')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.5-fast-high')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex-xhigh')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex(high)')).toBe('gpt-5.4');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex-spark')).toBe('gpt-5.4-mini');
  });

  it('keeps Astra routing direct without a predefined free-plan fallback', () => {
    expect(getFreePlanFallbackCodexModel('gpt-6-astra')).toBeNull();
    expect(getFreePlanFallbackCodexModel('gpt-6-astra-high')).toBeNull();
    expect(getFreePlanFallbackCodexModel('gpt-6-astra-fast')).toBeNull();
    expect(getFreePlanFallbackCodexModel('gpt-6-astra-xhigh-fast')).toBeNull();
  });

  it('does not rewrite cross-plan or already-safe Codex models', () => {
    expect(getFreePlanFallbackCodexModel('gpt-5.6-sol')).toBeNull();
    expect(getFreePlanFallbackCodexModel('gpt-5.6-terra-high')).toBeNull();
    expect(getFreePlanFallbackCodexModel('gpt-5.6-luna-fast')).toBeNull();
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

  it('prefers a rejected model explicit free-plan fallback over saved paid-only models', () => {
    expect(
      resolveRuntimeCodexFallbackModel({
        requestedModel: 'gpt-5.3-codex-spark',
        modelMap: {
          defaultModel: 'gpt-5.3-codex',
          opusModel: 'gpt-5.3-codex',
          sonnetModel: 'gpt-5.3-codex',
          haikuModel: 'gpt-5.3-codex-spark',
        },
        excludeModels: ['gpt-5.3-codex-spark'],
      })
    ).toBe('gpt-5.4-mini');
  });

  it('tracks Codex thinking caps for current safe defaults, paid models, and legacy aliases', () => {
    expect(getModelMaxLevel('codex', 'gpt-6-astra')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-6-astra-high-fast')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.6-sol')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.6-terra')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.6-luna')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.5')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.4')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.4-mini')).toBe('high');
    expect(getModelMaxLevel('codex', 'gpt-5-codex')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5-codex-mini')).toBe('high');
    expect(getModelMaxLevel('codex', 'gpt-5.2-codex')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.3-codex')).toBe('xhigh');
  });
});
