import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-runcrate', () => {
  it('registers runcrate in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('runcrate');
    expect(isValidPresetId('runcrate')).toBe(true);
  });

  it('uses the Runcrate API root, which serves the Anthropic Messages API at /v1/messages', () => {
    const preset = getPresetById('runcrate');
    expect(preset?.id).toBe('runcrate');
    expect(preset?.baseUrl).toBe('https://api.runcrate.ai');
    expect(preset?.defaultProfileName).toBe('runcrate');
  });

  it('pins a lab-prefixed default model', () => {
    const preset = getPresetById('runcrate');
    expect(preset?.defaultModel).toBe('deepseek-ai/DeepSeek-V4.1-Flash');
  });

  it('requires an API key', () => {
    const preset = getPresetById('runcrate');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('rc_live_...');
  });

  it('is an alternative, non-featured provider', () => {
    const preset = getPresetById('runcrate');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('normalizes whitespace and case in the preset id', () => {
    expect(getPresetById('  Runcrate  ')?.id).toBe('runcrate');
  });

  it('does not resolve partial or invalid ids', () => {
    expect(getPresetById('runcrate-invalid')).toBeUndefined();
    expect(isValidPresetId('runcr')).toBe(false);
  });
});
