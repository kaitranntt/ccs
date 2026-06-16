import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-fireworks', () => {
  it('resolves fireworks preset id', () => {
    const preset = getPresetById('fireworks');
    expect(preset?.id).toBe('fireworks');
    expect(preset?.baseUrl).toBe('https://api.fireworks.ai/inference');
    expect(preset?.defaultProfileName).toBe('fireworks');
  });

  it('registers fireworks in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('fireworks');
  });

  it('uses the Anthropic-compatible base URL without a /v1 suffix', () => {
    const preset = getPresetById('fireworks');
    expect(preset?.baseUrl).toBe('https://api.fireworks.ai/inference');
    expect(preset?.baseUrl.endsWith('/v1')).toBe(false);
  });

  it('pins a fully-qualified Fireworks model id as default', () => {
    const preset = getPresetById('fireworks');
    expect(preset?.defaultModel).toMatch(/^accounts\/fireworks\/(models|routers)\//);
  });

  it('validates fireworks preset requires API key with the fw_ placeholder', () => {
    const preset = getPresetById('fireworks');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('fw_...');
  });

  it('treats fireworks as a valid preset id', () => {
    expect(isValidPresetId('fireworks')).toBe(true);
  });

  it('handles whitespace in fireworks preset id', () => {
    const preset = getPresetById('  fireworks  ');
    expect(preset?.id).toBe('fireworks');
  });

  it('handles uppercase fireworks preset id', () => {
    const preset = getPresetById('FIREWORKS');
    expect(preset?.id).toBe('fireworks');
  });

  it('does not resolve partial or invalid fireworks ids', () => {
    expect(getPresetById('fireworks-invalid')).toBeUndefined();
    expect(isValidPresetId('fireworks-invalid')).toBe(false);
  });
});
