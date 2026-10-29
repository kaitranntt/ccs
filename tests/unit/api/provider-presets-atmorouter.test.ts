import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-atmorouter', () => {
  it('registers atmorouter in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('atmorouter');
    expect(isValidPresetId('atmorouter')).toBe(true);
  });

  it('uses the AtmoRouter API root, which serves the Anthropic Messages API at /v1/messages', () => {
    const preset = getPresetById('atmorouter');
    expect(preset?.id).toBe('atmorouter');
    expect(preset?.baseUrl).toBe('https://atmorouter.dev');
    expect(preset?.defaultProfileName).toBe('atmorouter');
  });

  it('pins a family-prefixed default model', () => {
    const preset = getPresetById('atmorouter');
    expect(preset?.defaultModel).toBe('cc/claude-sonnet-4-6');
  });

  it('requires an API key', () => {
    const preset = getPresetById('atmorouter');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('ar-...');
  });

  it('is an alternative, non-featured provider', () => {
    const preset = getPresetById('atmorouter');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('normalizes whitespace and case in the preset id', () => {
    expect(getPresetById('  AtmoRouter  ')?.id).toBe('atmorouter');
  });

  it('does not resolve partial or invalid ids', () => {
    expect(getPresetById('atmorouter-invalid')).toBeUndefined();
    expect(isValidPresetId('atmo')).toBe(false);
  });
});
