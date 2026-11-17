import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-standardcompute', () => {
  it('registers standardcompute in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('standardcompute');
    expect(isValidPresetId('standardcompute')).toBe(true);
  });

  it('uses the API root, which serves the Anthropic Messages API at /v1/messages', () => {
    const preset = getPresetById('standardcompute');
    expect(preset?.id).toBe('standardcompute');
    expect(preset?.name).toBe('Standard Compute');
    expect(preset?.baseUrl).toBe('https://api.stdcmpt.com');
    expect(preset?.defaultProfileName).toBe('standardcompute');
    expect(preset?.badge).toBe('Anthropic-compatible');
  });

  it('pins the routed default model id', () => {
    const preset = getPresetById('standardcompute');
    expect(preset?.defaultModel).toBe('StandardCompute');
  });

  it('requires an API key', () => {
    const preset = getPresetById('standardcompute');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('sk_live_...');
  });

  it('is an alternative, non-featured provider', () => {
    const preset = getPresetById('standardcompute');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('normalizes whitespace and case in the preset id', () => {
    expect(getPresetById('  StandardCompute  ')?.id).toBe('standardcompute');
  });

  it('does not resolve partial or invalid ids', () => {
    expect(getPresetById('standardcompute-invalid')).toBeUndefined();
    expect(isValidPresetId('standardcomp')).toBe(false);
  });
});
