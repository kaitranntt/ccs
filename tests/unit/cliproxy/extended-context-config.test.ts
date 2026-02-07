/**
 * Unit tests for extended context configuration
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  applyExtendedContextSuffix,
  shouldApplyExtendedContext,
  applyExtendedContextConfig,
} from '../../../src/cliproxy/config/extended-context-config';

describe('applyExtendedContextSuffix', () => {
  it('appends [1m] to model without suffix', () => {
    expect(applyExtendedContextSuffix('gemini-2.5-pro')).toBe('gemini-2.5-pro[1m]');
  });

  it('does not double-append [1m]', () => {
    expect(applyExtendedContextSuffix('gemini-2.5-pro[1m]')).toBe('gemini-2.5-pro[1m]');
  });

  it('handles model with thinking suffix', () => {
    expect(applyExtendedContextSuffix('gemini-2.5-pro(high)')).toBe('gemini-2.5-pro(high)[1m]');
  });

  it('handles uppercase [1M] suffix', () => {
    expect(applyExtendedContextSuffix('gemini-2.5-pro[1M]')).toBe('gemini-2.5-pro[1M]');
  });

  it('handles mixed case [1m] suffix', () => {
    expect(applyExtendedContextSuffix('gemini-2.5-pro[1M]')).toBe('gemini-2.5-pro[1M]');
  });

  it('returns empty input unchanged', () => {
    expect(applyExtendedContextSuffix('')).toBe('');
  });
});

describe('shouldApplyExtendedContext', () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('auto behavior (no override)', () => {
    it('returns true for native Gemini models with extendedContext in catalog', () => {
      // gemini-2.5-pro is in catalog with extendedContext: true
      expect(shouldApplyExtendedContext('gemini', 'gemini-2.5-pro', undefined)).toBe(true);
    });

    it('returns true for gemini-3-pro-preview', () => {
      expect(shouldApplyExtendedContext('gemini', 'gemini-3-pro-preview', undefined)).toBe(true);
    });

    it('returns false for gemini-claude-* models (not native Gemini)', () => {
      expect(shouldApplyExtendedContext('agy', 'gemini-claude-opus-4-5-thinking', undefined)).toBe(
        false
      );
    });

    it('returns false for Claude models without explicit flag', () => {
      expect(shouldApplyExtendedContext('claude', 'claude-opus-4-5-20251101', undefined)).toBe(
        false
      );
    });

    it('handles case-insensitive Gemini prefix', () => {
      expect(shouldApplyExtendedContext('gemini', 'GEMINI-2.5-pro', undefined)).toBe(true);
    });
  });

  describe('explicit --1m override', () => {
    it('returns true for Claude models with explicit --1m flag', () => {
      expect(shouldApplyExtendedContext('claude', 'claude-opus-4-5-20251101', true)).toBe(true);
    });

    it('returns false and warns for model not in catalog', () => {
      const result = shouldApplyExtendedContext('qwen', 'qwen-coder-plus', true);
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('returns false and warns for model without extendedContext support', () => {
      const result = shouldApplyExtendedContext('claude', 'claude-haiku-4-5-20251001', true);
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('explicit --no-1m override', () => {
    it('returns false even for native Gemini with explicit --no-1m', () => {
      expect(shouldApplyExtendedContext('gemini', 'gemini-2.5-pro', false)).toBe(false);
    });
  });
});

describe('applyExtendedContextConfig', () => {
  it('applies suffix to ANTHROPIC_MODEL for Gemini', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gemini-2.5-pro',
    };
    applyExtendedContextConfig(env, 'gemini', undefined);
    expect(env.ANTHROPIC_MODEL).toBe('gemini-2.5-pro[1m]');
  });

  it('applies suffix to tier models independently', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gemini-2.5-pro',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gemini-3-pro-preview',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gemini-2.5-pro',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-2.5-flash', // Not in catalog
    };
    applyExtendedContextConfig(env, 'gemini', undefined);
    expect(env.ANTHROPIC_MODEL).toBe('gemini-2.5-pro[1m]');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gemini-3-pro-preview[1m]');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gemini-2.5-pro[1m]');
    // Haiku not in catalog, should be unchanged
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gemini-2.5-flash');
  });

  it('does not apply suffix when --no-1m is set', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gemini-2.5-pro',
    };
    applyExtendedContextConfig(env, 'gemini', false);
    expect(env.ANTHROPIC_MODEL).toBe('gemini-2.5-pro');
  });

  it('applies suffix to Claude with explicit --1m', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-opus-4-5-20251101',
    };
    applyExtendedContextConfig(env, 'claude', true);
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-4-5-20251101[1m]');
  });

  it('strips existing suffixes before catalog lookup', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gemini-2.5-pro(high)',
    };
    applyExtendedContextConfig(env, 'gemini', undefined);
    expect(env.ANTHROPIC_MODEL).toBe('gemini-2.5-pro(high)[1m]');
  });

  it('handles empty env vars gracefully', () => {
    const env: NodeJS.ProcessEnv = {};
    applyExtendedContextConfig(env, 'gemini', undefined);
    expect(env.ANTHROPIC_MODEL).toBeUndefined();
  });

  it('strips [1m] suffix from models that no longer support extended context', () => {
    // Simulates user who had [1m] in saved settings before support was removed
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gemini-claude-opus-4-6-thinking[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gemini-claude-opus-4-6-thinking[1m]',
    };
    applyExtendedContextConfig(env, 'agy', undefined);
    expect(env.ANTHROPIC_MODEL).toBe('gemini-claude-opus-4-6-thinking');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gemini-claude-opus-4-6-thinking');
  });

  it('strips [1m] suffix when --no-1m is explicit even if model has it', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gemini-2.5-pro[1m]',
    };
    applyExtendedContextConfig(env, 'gemini', false);
    expect(env.ANTHROPIC_MODEL).toBe('gemini-2.5-pro');
  });
});
