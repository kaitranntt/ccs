import { describe, expect, it } from 'bun:test';

import {
  ANTHROPIC_MODEL_ENV_KEYS,
  EXTENDED_CONTEXT_MODEL_ENV_KEYS,
  applyExtendedContextPreferenceToAnthropicModels,
  hasAnthropicExtendedContextEnabled,
  isAnthropicModelEnvKey,
  isExtendedContextModelEnvKey,
} from '../../../src/shared/extended-context-utils';

describe('Anthropic model env keys', () => {
  it('includes all five tier mapping keys', () => {
    expect([...ANTHROPIC_MODEL_ENV_KEYS]).toEqual([
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'ANTHROPIC_DEFAULT_FABLE_MODEL',
    ]);
  });

  it('recognizes the fable tier key like the other tiers', () => {
    expect(isAnthropicModelEnvKey('ANTHROPIC_DEFAULT_FABLE_MODEL')).toBe(true);
    expect(isAnthropicModelEnvKey('ANTHROPIC_DEFAULT_HAIKU_MODEL')).toBe(true);
    expect(isAnthropicModelEnvKey('ANTHROPIC_BASE_URL')).toBe(false);
  });
});

describe('extended-context model env keys', () => {
  it('covers the Anthropic tiers plus the subagent and startup-default model keys', () => {
    expect([...EXTENDED_CONTEXT_MODEL_ENV_KEYS]).toEqual([
      ...ANTHROPIC_MODEL_ENV_KEYS,
      'CLAUDE_CODE_SUBAGENT_MODEL',
      'ANTHROPIC_DEFAULT_MODEL',
    ]);
    expect(isExtendedContextModelEnvKey('CLAUDE_CODE_SUBAGENT_MODEL')).toBe(true);
    expect(isExtendedContextModelEnvKey('ANTHROPIC_DEFAULT_MODEL')).toBe(true);
    expect(isAnthropicModelEnvKey('CLAUDE_CODE_SUBAGENT_MODEL')).toBe(false);
    expect(isAnthropicModelEnvKey('ANTHROPIC_DEFAULT_MODEL')).toBe(false);
  });
});

describe('applyExtendedContextPreferenceToAnthropicModels', () => {
  it('writes [1m] into every managed key, the fable tier included', () => {
    // Behind a proxy base URL Claude Code clamps a bare Fable id to 200k, so the
    // fable tier needs the suffix exactly like the opus/sonnet tiers do.
    const env = applyExtendedContextPreferenceToAnthropicModels(
      {
        ANTHROPIC_MODEL: 'claude-fable-5-1',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-5',
        ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1',
        CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1',
      },
      true
    );

    expect(env).toEqual({
      ANTHROPIC_MODEL: 'claude-fable-5-1[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-5[1m]',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1[1m]',
      CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1[1m]',
    });
  });

  it('strips every managed key when the preference is off', () => {
    const env = applyExtendedContextPreferenceToAnthropicModels(
      {
        ANTHROPIC_MODEL: 'claude-opus-5[1m]',
        ANTHROPIC_DEFAULT_MODEL: 'claude-opus-5[1m]',
        ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1[1m]',
        CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1[1m]',
      },
      false
    );

    expect(env).toEqual({
      ANTHROPIC_MODEL: 'claude-opus-5',
      ANTHROPIC_DEFAULT_MODEL: 'claude-opus-5',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1',
      CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1',
    });
  });

  it('suffixes the startup-default model key when the preference is on', () => {
    const env = applyExtendedContextPreferenceToAnthropicModels(
      { ANTHROPIC_DEFAULT_MODEL: 'claude-opus-5' },
      true
    );

    expect(env).toEqual({ ANTHROPIC_DEFAULT_MODEL: 'claude-opus-5[1m]' });
  });

  it('honors a caller compatibility predicate', () => {
    const env = applyExtendedContextPreferenceToAnthropicModels(
      {
        ANTHROPIC_MODEL: 'claude-opus-5',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
      },
      true,
      { supportsExtendedContext: (modelId) => !modelId.startsWith('claude-haiku-') }
    );

    expect(env).toEqual({
      ANTHROPIC_MODEL: 'claude-opus-5[1m]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    });
  });

  it('reads saved intent from any managed key', () => {
    expect(
      hasAnthropicExtendedContextEnabled({ CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1[1m]' })
    ).toBe(true);
    expect(
      hasAnthropicExtendedContextEnabled({ ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1[1m]' })
    ).toBe(true);
    expect(
      hasAnthropicExtendedContextEnabled({ ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1' })
    ).toBe(false);
  });
});
