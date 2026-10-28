import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-obscurifyai', () => {
  it('registers obscurifyai in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('obscurifyai');
    expect(isValidPresetId('obscurifyai')).toBe(true);
  });

  it('uses the OpenAI-compatible base URL with a /v1 suffix', () => {
    const preset = getPresetById('obscurifyai');
    expect(preset?.id).toBe('obscurifyai');
    expect(preset?.name).toBe('Obscurify.ai');
    expect(preset?.baseUrl).toBe('https://obscurify.ai/v1');
    expect(preset?.defaultProfileName).toBe('obscurifyai');
    expect(preset?.badge).toBe('OpenAI-compatible');
  });

  it('pins a vendor-prefixed default model', () => {
    const preset = getPresetById('obscurifyai');
    expect(preset?.defaultModel).toBe('deepseek/deepseek-v4-flash');
  });

  it('requires an API key', () => {
    const preset = getPresetById('obscurifyai');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('sk-obs1_...');
  });

  it('is an alternative, non-featured provider', () => {
    const preset = getPresetById('obscurifyai');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('normalizes whitespace and case in the preset id', () => {
    expect(getPresetById('  ObscurifyAI  ')?.id).toBe('obscurifyai');
  });

  it('does not resolve partial or invalid ids', () => {
    expect(getPresetById('obscurifyai-invalid')).toBeUndefined();
    expect(isValidPresetId('obscurify')).toBe(false);
  });
});
