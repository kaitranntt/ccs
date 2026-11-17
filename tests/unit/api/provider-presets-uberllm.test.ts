import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-uberllm', () => {
  it('registers uberllm in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('uberllm');
    expect(isValidPresetId('uberllm')).toBe(true);
  });

  it('uses the UberLLM API root, which serves the Anthropic Messages API at /v1/messages', () => {
    const preset = getPresetById('uberllm');
    expect(preset?.id).toBe('uberllm');
    expect(preset?.baseUrl).toBe('https://api.uberllm.dev');
    expect(preset?.defaultProfileName).toBe('uberllm');
  });

  it('pins a lab-prefixed default model', () => {
    const preset = getPresetById('uberllm');
    expect(preset?.defaultModel).toBe('deepseek/deepseek-v4-flash');
  });

  it('requires an API key', () => {
    const preset = getPresetById('uberllm');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('ull_...');
  });

  it('is an alternative, non-featured provider', () => {
    const preset = getPresetById('uberllm');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('normalizes whitespace and case in the preset id', () => {
    expect(getPresetById('  UberLLM  ')?.id).toBe('uberllm');
  });

  it('does not resolve partial or invalid ids', () => {
    expect(getPresetById('uberllm-invalid')).toBeUndefined();
    expect(isValidPresetId('uberl')).toBe(false);
  });
});
