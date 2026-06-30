import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-requesty', () => {
  it('resolves requesty preset id', () => {
    const preset = getPresetById('requesty');
    expect(preset?.id).toBe('requesty');
    expect(preset?.baseUrl).toBe('https://router.requesty.ai/v1');
    expect(preset?.defaultProfileName).toBe('requesty');
  });

  it('registers requesty in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('requesty');
  });

  it('uses the OpenAI-compatible base URL with a /v1 suffix', () => {
    const preset = getPresetById('requesty');
    expect(preset?.baseUrl).toBe('https://router.requesty.ai/v1');
    expect(preset?.baseUrl.endsWith('/v1')).toBe(true);
  });

  it('pins a provider/model default (openai/gpt-4o-mini)', () => {
    const preset = getPresetById('requesty');
    expect(preset?.defaultModel).toBe('openai/gpt-4o-mini');
  });

  it('validates requesty preset requires an API key', () => {
    const preset = getPresetById('requesty');
    expect(preset?.requiresApiKey).toBe(true);
  });

  it('is a plain (non-featured) alternative provider', () => {
    const preset = getPresetById('requesty');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('treats requesty as a valid preset id', () => {
    expect(isValidPresetId('requesty')).toBe(true);
  });

  it('handles whitespace in requesty preset id', () => {
    const preset = getPresetById('  requesty  ');
    expect(preset?.id).toBe('requesty');
  });

  it('handles uppercase requesty preset id', () => {
    const preset = getPresetById('REQUESTY');
    expect(preset?.id).toBe('requesty');
  });

  it('does not resolve partial or invalid requesty ids', () => {
    expect(getPresetById('requesty-invalid')).toBeUndefined();
    expect(isValidPresetId('requesty-invalid')).toBe(false);
  });
});
