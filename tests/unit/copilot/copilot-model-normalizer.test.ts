import { describe, expect, it } from 'bun:test';
import { DEFAULT_COPILOT_CONFIG } from '../../../src/config/unified-config-types';
import {
  DEPRECATED_COPILOT_MODEL_IDS,
  normalizeCopilotConfigWithWarnings,
  normalizeCopilotModelId,
  normalizeCopilotSettings,
  normalizeCopilotSettingsWithWarnings,
} from '../../../src/copilot/copilot-model-normalizer';

describe('copilot-model-normalizer', () => {
  it('tracks raptor-mini as deprecated', () => {
    expect(DEPRECATED_COPILOT_MODEL_IDS).toContain('raptor-mini');
  });

  it('normalizes deprecated model IDs to the safe default', () => {
    expect(normalizeCopilotModelId('raptor-mini')).toBe(DEFAULT_COPILOT_CONFIG.model);
  });

  it('falls back deprecated tier overrides to the normalized base model', () => {
    const result = normalizeCopilotConfigWithWarnings({
      ...DEFAULT_COPILOT_CONFIG,
      model: 'claude-sonnet-4.5',
      haiku_model: 'raptor-mini',
    });

    expect(result.config.model).toBe('claude-sonnet-4.5');
    expect(result.config.haiku_model).toBe('claude-sonnet-4.5');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toContain("'raptor-mini'");
    expect(result.warnings[0]?.message).toContain("'claude-sonnet-4.5'");
  });

  it('normalizes raw settings payloads without dropping unrelated env keys', () => {
    const normalized = normalizeCopilotSettings(
      {
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:4141',
          ANTHROPIC_MODEL: 'raptor-mini',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'raptor-mini',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'raptor-mini',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'raptor-mini',
          EXTRA_FLAG: 'keep-me',
        },
      },
      {
        ...DEFAULT_COPILOT_CONFIG,
        model: 'raptor-mini',
      }
    );

    expect(normalized.env?.ANTHROPIC_MODEL).toBe('gpt-4.1');
    expect(normalized.env?.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-4.1');
    expect(normalized.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-4.1');
    expect(normalized.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-4.1');
    expect(normalized.env?.EXTRA_FLAG).toBe('keep-me');
  });

  it('keeps small-fast and haiku env settings in lockstep', () => {
    const result = normalizeCopilotSettingsWithWarnings(
      {
        env: {
          ANTHROPIC_MODEL: 'claude-sonnet-4.5',
          ANTHROPIC_SMALL_FAST_MODEL: 'raptor-mini',
        },
      },
      {
        ...DEFAULT_COPILOT_CONFIG,
        model: 'claude-sonnet-4.5',
      }
    );

    expect(result.settings.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-sonnet-4.5');
    expect(result.settings.env?.ANTHROPIC_SMALL_FAST_MODEL).toBe('claude-sonnet-4.5');
    expect(result.effectiveConfig.haiku_model).toBe('claude-sonnet-4.5');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.tier).toBe('haiku');
  });
});
