import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';

describe('provider-presets-cheaperinference', () => {
  it('resolves cheaperinference preset id', () => {
    const preset = getPresetById('cheaperinference');
    expect(preset?.id).toBe('cheaperinference');
    expect(preset?.baseUrl).toBe('https://api.cheaperinference.com/v1');
    expect(preset?.defaultProfileName).toBe('cheaperinference');
  });

  it('registers cheaperinference in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('cheaperinference');
  });

  it('uses the OpenAI-compatible base URL with a /v1 suffix', () => {
    const preset = getPresetById('cheaperinference');
    expect(preset?.baseUrl).toBe('https://api.cheaperinference.com/v1');
    expect(preset?.baseUrl.endsWith('/v1')).toBe(true);
  });

  it('pins a bare model id default (gpt-5.4-mini)', () => {
    const preset = getPresetById('cheaperinference');
    expect(preset?.defaultModel).toBe('gpt-5.4-mini');
  });

  it('validates cheaperinference preset requires an API key', () => {
    const preset = getPresetById('cheaperinference');
    expect(preset?.requiresApiKey).toBe(true);
  });

  it('is a plain (non-featured) alternative provider', () => {
    const preset = getPresetById('cheaperinference');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('treats cheaperinference as a valid preset id', () => {
    expect(isValidPresetId('cheaperinference')).toBe(true);
  });

  it('handles whitespace in cheaperinference preset id', () => {
    const preset = getPresetById('  cheaperinference  ');
    expect(preset?.id).toBe('cheaperinference');
  });

  it('handles uppercase cheaperinference preset id', () => {
    const preset = getPresetById('CHEAPERINFERENCE');
    expect(preset?.id).toBe('cheaperinference');
  });

  it('does not resolve partial or invalid cheaperinference ids', () => {
    expect(getPresetById('cheaperinference-invalid')).toBeUndefined();
    expect(isValidPresetId('cheaperinference-invalid')).toBe(false);
  });
});
