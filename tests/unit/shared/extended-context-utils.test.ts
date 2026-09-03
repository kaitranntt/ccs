import { describe, expect, it } from 'bun:test';

import {
  ANTHROPIC_MODEL_ENV_KEYS,
  EXTENDED_CONTEXT_MODEL_ENV_KEYS,
  applyExtendedContextPreferenceToAnthropicModels,
  envKeyAcceptsExtendedContextSuffix,
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
  it('covers the Anthropic tiers plus the subagent model key', () => {
    expect([...EXTENDED_CONTEXT_MODEL_ENV_KEYS]).toEqual([
      ...ANTHROPIC_MODEL_ENV_KEYS,
      'CLAUDE_CODE_SUBAGENT_MODEL',
    ]);
    expect(isExtendedContextModelEnvKey('CLAUDE_CODE_SUBAGENT_MODEL')).toBe(true);
    expect(isAnthropicModelEnvKey('CLAUDE_CODE_SUBAGENT_MODEL')).toBe(false);
  });

  it('marks the fable tier key as suffix-stripping', () => {
    expect(envKeyAcceptsExtendedContextSuffix('ANTHROPIC_DEFAULT_FABLE_MODEL')).toBe(false);
    expect(envKeyAcceptsExtendedContextSuffix('ANTHROPIC_MODEL')).toBe(true);
    expect(envKeyAcceptsExtendedContextSuffix('ANTHROPIC_DEFAULT_OPUS_MODEL')).toBe(true);
    expect(envKeyAcceptsExtendedContextSuffix('CLAUDE_CODE_SUBAGENT_MODEL')).toBe(true);
  });
});

describe('applyExtendedContextPreferenceToAnthropicModels', () => {
  it('never writes [1m] into the fable tier key and strips a saved one', () => {
    const env = applyExtendedContextPreferenceToAnthropicModels(
      {
        ANTHROPIC_MODEL: 'claude-fable-5-1',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-5',
        ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1[1m]',
        CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1',
      },
      true
    );

    expect(env).toEqual({
      ANTHROPIC_MODEL: 'claude-fable-5-1[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-5[1m]',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1',
      CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1[1m]',
    });
  });

  it('strips every managed key when the preference is off', () => {
    const env = applyExtendedContextPreferenceToAnthropicModels(
      {
        ANTHROPIC_MODEL: 'claude-opus-5[1m]',
        ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1[1m]',
        CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1[1m]',
      },
      false
    );

    expect(env).toEqual({
      ANTHROPIC_MODEL: 'claude-opus-5',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1',
      CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1',
    });
  });

  it('honors a caller compatibility predicate on top of the key guard', () => {
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

  it('reads saved intent from the subagent key too', () => {
    expect(
      hasAnthropicExtendedContextEnabled({ CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1[1m]' })
    ).toBe(true);
    expect(
      hasAnthropicExtendedContextEnabled({ ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1' })
    ).toBe(false);
  });
});
