import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-cloudgpu', () => {
  it('registers cloudgpu in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('cloudgpu');
    expect(isValidPresetId('cloudgpu')).toBe(true);
  });

  it('uses the OpenAI-compatible base URL with a /v1 suffix', () => {
    const preset = getPresetById('cloudgpu');
    expect(preset?.id).toBe('cloudgpu');
    expect(preset?.baseUrl).toBe('https://cloudgpu.app/v1');
    expect(preset?.defaultProfileName).toBe('cloudgpu');
  });

  it('pins a bare default model id', () => {
    const preset = getPresetById('cloudgpu');
    expect(preset?.defaultModel).toBe('deepseek-v4.1-flash');
  });

  it('requires an API key', () => {
    const preset = getPresetById('cloudgpu');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('sk-...');
  });

  it('is an alternative, non-featured provider', () => {
    const preset = getPresetById('cloudgpu');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('normalizes whitespace and case in the preset id', () => {
    expect(getPresetById('  CloudGPU  ')?.id).toBe('cloudgpu');
  });

  it('does not resolve partial or invalid ids', () => {
    expect(getPresetById('cloudgpu-invalid')).toBeUndefined();
    expect(isValidPresetId('cloudg')).toBe(false);
  });
});
