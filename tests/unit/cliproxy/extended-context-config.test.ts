import { describe, expect, it } from 'bun:test';

import { applyExtendedContextConfig } from '../../../src/cliproxy/config/extended-context-config';

describe('applyExtendedContextConfig', () => {
  it('strips a saved [1m] from the fable tier key in auto mode', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-opus-5[1m]',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1[1m]',
    };

    applyExtendedContextConfig(env, 'claude');

    expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5-1');
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5[1m]');
  });

  it('keeps the fable tier key plain when extended context is forced on', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-fable-5-1',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1',
      CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1',
    };

    applyExtendedContextConfig(env, 'claude', true);

    expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5-1');
    expect(env.ANTHROPIC_MODEL).toBe('claude-fable-5-1[1m]');
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBe('claude-fable-5-1[1m]');
  });
});
