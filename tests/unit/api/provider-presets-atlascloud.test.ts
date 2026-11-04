import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-atlascloud', () => {
  it('registers atlascloud in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('atlascloud');
    expect(isValidPresetId('atlascloud')).toBe(true);
  });

  it('uses the Atlas Cloud API root, which serves the Anthropic Messages API at /v1/messages', () => {
    const preset = getPresetById('atlascloud');
    expect(preset?.id).toBe('atlascloud');
    expect(preset?.baseUrl).toBe('https://api.atlascloud.ai');
    expect(preset?.defaultProfileName).toBe('atlascloud');
  });

  it('pins a lab-prefixed default model', () => {
    const preset = getPresetById('atlascloud');
    expect(preset?.defaultModel).toBe('deepseek-ai/deepseek-v4-flash');
  });

  it('requires an API key', () => {
    const preset = getPresetById('atlascloud');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('apikey-...');
  });

  it('is an alternative, non-featured provider', () => {
    const preset = getPresetById('atlascloud');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('normalizes whitespace and case in the preset id', () => {
    expect(getPresetById('  AtlasCloud  ')?.id).toBe('atlascloud');
  });

  it('does not resolve partial or invalid ids', () => {
    expect(getPresetById('atlascloud-invalid')).toBeUndefined();
    expect(isValidPresetId('atlas')).toBe(false);
  });
});
