import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';
import { PROVIDER_PRESET_IDS } from '../../../src/shared/provider-preset-catalog';
import { resolveDroidProvider } from '../../../src/targets/droid-provider';

describe('provider-presets-aigrow', () => {
  it('registers aigrow in PROVIDER_PRESET_IDS', () => {
    expect(PROVIDER_PRESET_IDS).toContain('aigrow');
    expect(isValidPresetId('aigrow')).toBe(true);
  });

  it('uses the AIGROW API root, which serves the Anthropic Messages API at /v1/messages', () => {
    const preset = getPresetById('aigrow');
    expect(preset?.id).toBe('aigrow');
    expect(preset?.baseUrl).toBe('https://aigrow.gg');
    expect(preset?.defaultProfileName).toBe('aigrow');
  });

  it('pins a Claude default model', () => {
    const preset = getPresetById('aigrow');
    expect(preset?.defaultModel).toBe('claude-opus-5.5');
  });

  it('resolves to the Anthropic route, so Claude Code talks to it without the local proxy', () => {
    const preset = getPresetById('aigrow');
    expect(resolveDroidProvider({ baseUrl: preset?.baseUrl, model: preset?.defaultModel })).toBe(
      'anthropic'
    );
  });

  it('requires an API key', () => {
    const preset = getPresetById('aigrow');
    expect(preset?.requiresApiKey).toBe(true);
    expect(preset?.apiKeyPlaceholder).toBe('ag_...');
  });

  it('is an alternative, non-featured provider', () => {
    const preset = getPresetById('aigrow');
    expect(preset?.category).toBe('alternative');
    expect(preset?.featured).toBeUndefined();
  });

  it('normalizes whitespace and case in the preset id', () => {
    expect(getPresetById('  AIGROW  ')?.id).toBe('aigrow');
  });

  it('does not resolve partial or invalid ids', () => {
    expect(getPresetById('aigrow-invalid')).toBeUndefined();
    expect(isValidPresetId('aigr')).toBe(false);
  });
});
