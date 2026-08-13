import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-orcarouter', () => {
  it('resolves orcarouter preset id', () => {
    const preset = getPresetById('orcarouter');
    expect(preset?.id).toBe('orcarouter');
    expect(preset?.baseUrl).toBe('https://api.orcarouter.ai/v1');
    expect(preset?.defaultProfileName).toBe('orcarouter');
  });

  it('registers orcarouter in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('orcarouter');
  });

  it('uses the OpenAI-compatible base URL with a /v1 suffix', () => {
    const preset = getPresetById('orcarouter');
    expect(preset?.baseUrl).toBe('https://api.orcarouter.ai/v1');
    expect(preset?.baseUrl.endsWith('/v1')).toBe(true);
  });

  it('pins a provider/model default (openai/gpt-5.5)', () => {
    const preset = getPresetById('orcarouter');
    expect(preset?.defaultModel).toBe('openai/gpt-5.5');
  });

  it('validates orcarouter preset requires an API key with the sk-orca- placeholder', () => {
    const preset = getPresetById('orcarouter');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('sk-orca-...');
  });

  it('is a recommended, featured provider', () => {
    const preset = getPresetById('orcarouter');
    expect(preset?.category).toBe('recommended');
    expect(preset?.featured).toBe(true);
  });

  it('treats orcarouter as a valid preset id', () => {
    expect(isValidPresetId('orcarouter')).toBe(true);
  });

  it('handles whitespace in orcarouter preset id', () => {
    const preset = getPresetById('  orcarouter  ');
    expect(preset?.id).toBe('orcarouter');
  });

  it('handles uppercase orcarouter preset id', () => {
    const preset = getPresetById('ORCAROUTER');
    expect(preset?.id).toBe('orcarouter');
  });

  it('does not resolve partial or invalid orcarouter ids', () => {
    expect(getPresetById('orcarouter-invalid')).toBeUndefined();
    expect(isValidPresetId('orcarouter-invalid')).toBe(false);
  });
});
