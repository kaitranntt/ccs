import { describe, expect, it } from 'bun:test';

import { applyExtendedContextConfig } from '../../../src/cliproxy/config/extended-context-config';

describe('applyExtendedContextConfig', () => {
  it('keeps a saved [1m] on the fable tier key in auto mode', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-opus-5[1m]',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1[1m]',
    };

    applyExtendedContextConfig(env, 'claude');

    expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5-1[1m]');
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5[1m]');
  });

  it('suffixes the fable tier key like every other tier when forced on', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-fable-5-1',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1',
      CLAUDE_CODE_SUBAGENT_MODEL: 'claude-fable-5-1',
    };

    applyExtendedContextConfig(env, 'claude', true);

    expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5-1[1m]');
    expect(env.ANTHROPIC_MODEL).toBe('claude-fable-5-1[1m]');
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBe('claude-fable-5-1[1m]');
  });

  it('strips the fable tier key with the others when forced off', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-opus-5[1m]',
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5-1[1m]',
    };

    applyExtendedContextConfig(env, 'claude', false);

    expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5-1');
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5');
  });

  describe('fable tier default on the claude provider', () => {
    it('fills a missing fable tier with the catalog Fable model plus [1m] when a saved tier carries [1m]', () => {
      const env: NodeJS.ProcessEnv = {
        ANTHROPIC_MODEL: 'claude-opus-5[1m]',
      };

      applyExtendedContextConfig(env, 'claude');

      expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5-1[1m]');
    });

    it('fills a missing fable tier when --1m is passed', () => {
      const env: NodeJS.ProcessEnv = {
        ANTHROPIC_MODEL: 'claude-opus-5',
      };

      applyExtendedContextConfig(env, 'claude', true);

      expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5[1m]');
      expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5-1[1m]');
    });

    it('fills a missing fable tier on a model-neutral claude launch when --1m is passed', () => {
      const env: NodeJS.ProcessEnv = {};

      applyExtendedContextConfig(env, 'claude', true);

      expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5-1[1m]');
      expect(Object.keys(env)).toEqual(['ANTHROPIC_DEFAULT_FABLE_MODEL']);
    });

    it('leaves the fable tier alone when no long-context intent exists', () => {
      const env: NodeJS.ProcessEnv = {
        ANTHROPIC_MODEL: 'claude-opus-5',
      };

      applyExtendedContextConfig(env, 'claude');

      expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBeUndefined();
    });

    it('leaves the fable tier alone when --no-1m is passed', () => {
      const env: NodeJS.ProcessEnv = {
        ANTHROPIC_MODEL: 'claude-opus-5[1m]',
      };

      applyExtendedContextConfig(env, 'claude', false);

      expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5');
      expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBeUndefined();
    });

    it('never overrides an explicit fable tier mapping', () => {
      const env: NodeJS.ProcessEnv = {
        ANTHROPIC_MODEL: 'claude-opus-5[1m]',
        ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5[1m]',
      };

      applyExtendedContextConfig(env, 'claude');

      expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('claude-fable-5[1m]');
    });

    it('does not invent a fable tier for providers without Fable models', () => {
      const env: NodeJS.ProcessEnv = {
        ANTHROPIC_MODEL: 'gpt-5.4[1m]',
      };

      applyExtendedContextConfig(env, 'codex');

      expect(env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBeUndefined();
    });
  });
});
