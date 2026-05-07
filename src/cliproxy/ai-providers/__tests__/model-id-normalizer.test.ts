import { describe, it, expect } from 'bun:test';
import {
  canonicalizeModelIdForProvider,
  extractProviderFromPathname,
  getDeniedModelIdReasonForProvider,
  isDeniedAntigravityModelId,
  isAntigravityProvider,
  migrateDeniedAntigravityModelAliases,
  normalizeClaudeDottedMajorMinor,
  normalizeClaudeDottedThinkingMajorMinor,
  normalizeCodexLegacyModelAliases,
  normalizeModelIdForProvider,
  normalizeModelIdForRouting,
  normalizeModelEnvVarsForProvider,
} from '../model-id-normalizer';

describe('model-id-normalizer', () => {
  describe('provider parsing', () => {
    it('extracts provider from provider route path', () => {
      expect(extractProviderFromPathname('/api/provider/agy/v1/messages')).toBe('agy');
      expect(extractProviderFromPathname('/api/provider/antigravity')).toBe('antigravity');
      expect(extractProviderFromPathname('/v1/messages')).toBeNull();
    });

    it('detects antigravity provider aliases', () => {
      expect(isAntigravityProvider('agy')).toBe(true);
      expect(isAntigravityProvider('antigravity')).toBe(true);
      expect(isAntigravityProvider('gemini')).toBe(false);
      expect(isAntigravityProvider(undefined)).toBe(false);
    });
  });

  describe('model normalization', () => {
    it('normalizes dotted Claude major.minor to hyphen format', () => {
      expect(normalizeClaudeDottedMajorMinor('claude-sonnet-4.6-thinking')).toBe(
        'claude-sonnet-4-6-thinking'
      );
      expect(normalizeClaudeDottedMajorMinor('claude-opus-4.6')).toBe('claude-opus-4-6');
    });

    it('normalizes only dotted thinking variants for root/composite routing', () => {
      expect(normalizeClaudeDottedThinkingMajorMinor('claude-sonnet-4.6-thinking')).toBe(
        'claude-sonnet-4-6-thinking'
      );
      expect(normalizeClaudeDottedThinkingMajorMinor('claude-sonnet-4.6')).toBe(
        'claude-sonnet-4.6'
      );
    });

    it('applies provider-aware routing normalization', () => {
      expect(normalizeModelIdForRouting('claude-sonnet-4.6-thinking', null)).toBe(
        'claude-sonnet-4-6'
      );
      expect(normalizeModelIdForRouting('claude-sonnet-4.6', null)).toBe('claude-sonnet-4.6');
      expect(normalizeModelIdForRouting('claude-sonnet-4.6', 'agy')).toBe('claude-sonnet-4-6');
      expect(normalizeModelIdForRouting('kimi-k2.5', 'iflow')).toBe('kimi-k2');
      expect(normalizeModelIdForRouting('kimi-k2.5(8192)', 'iflow')).toBe('kimi-k2(8192)');
      expect(normalizeModelIdForRouting('claude-sonnet-4-6-thinking', 'claude')).toBe(
        'claude-sonnet-4-6-thinking'
      );
      expect(normalizeModelIdForRouting('claude-sonnet-4.6-thinking', 'claude')).toBe(
        'claude-sonnet-4.6-thinking'
      );
    });

    it('applies provider-only normalization for antigravity', () => {
      expect(normalizeModelIdForProvider('claude-sonnet-4.6-thinking', 'agy')).toBe(
        'claude-sonnet-4-6'
      );
      expect(normalizeModelIdForProvider('claude-opus-4.6-thinking', 'agy')).toBe(
        'claude-opus-4-6-thinking'
      );
      expect(normalizeModelIdForProvider('claude-opus-4.5-thinking', 'agy')).toBe(
        'claude-opus-4-5-thinking'
      );
      expect(normalizeModelIdForProvider('claude-sonnet-4.5-thinking', 'agy')).toBe(
        'claude-sonnet-4-5-thinking'
      );
      expect(normalizeModelIdForProvider('claude-sonnet-4.5', 'agy')).toBe('claude-sonnet-4-5');
      expect(normalizeModelIdForProvider('claude-opus-4.6-thinking', 'gemini')).toBe(
        'claude-opus-4.6-thinking'
      );
    });

    it('applies provider canonicalization for codex and antigravity', () => {
      expect(canonicalizeModelIdForProvider('gpt-5.3-codex-xhigh', 'codex')).toBe(
        'gpt-5.3-codex-xhigh'
      );
      expect(canonicalizeModelIdForProvider('claude-sonnet-4.6-thinking', 'agy')).toBe(
        'claude-sonnet-4-6'
      );
      expect(canonicalizeModelIdForProvider('claude-sonnet-4-6-thinking', 'claude')).toBe(
        'claude-sonnet-4-6-thinking'
      );
    });

    it('trims and canonicalizes provider model IDs with surrounding whitespace', () => {
      expect(canonicalizeModelIdForProvider('  gpt-5.3-codex-high  ', 'codex')).toBe(
        'gpt-5.3-codex-high'
      );
      expect(canonicalizeModelIdForProvider('  claude-sonnet-4.6-thinking  ', 'agy')).toBe(
        'claude-sonnet-4-6'
      );
      expect(canonicalizeModelIdForProvider('  claude-sonnet-4-6-thinking  ', 'claude')).toBe(
        'claude-sonnet-4-6-thinking'
      );
      expect(normalizeModelIdForRouting('  claude-sonnet-4.6-thinking  ', null)).toBe(
        'claude-sonnet-4-6'
      );
    });

    it('normalizes known legacy iflow model aliases to supported upstream IDs', () => {
      expect(normalizeModelIdForProvider('iflow-default', 'iflow')).toBe('qwen3-coder-plus');
      expect(normalizeModelIdForProvider('kimi-k2.5', 'iflow')).toBe('kimi-k2');
      expect(normalizeModelIdForProvider('kimi-k2.5(8192)', 'iflow')).toBe('kimi-k2(8192)');
      expect(canonicalizeModelIdForProvider('deepseek-v3.2-chat', 'iflow')).toBe('deepseek-v3.2');
      expect(canonicalizeModelIdForProvider('glm-4.7', 'iflow')).toBe('glm-4.6');
      expect(canonicalizeModelIdForProvider('minimax-m2.5', 'iflow')).toBe('qwen3-coder-plus');
      expect(canonicalizeModelIdForProvider('kimi-k2.5', 'gemini')).toBe('kimi-k2.5');
    });

    it('normalizes legacy codex aliases to the current supported model IDs', () => {
      expect(normalizeCodexLegacyModelAliases('gpt-5-codex')).toBe('gpt-5.4');
      expect(normalizeCodexLegacyModelAliases('gpt-5-codex-mini[1m]')).toBe('gpt-5.4-mini[1m]');
      expect(normalizeCodexLegacyModelAliases('gpt-5-codex-high')).toBe('gpt-5.4-high');
      expect(normalizeCodexLegacyModelAliases('gpt-5-codex-fast-high')).toBe('gpt-5.4-high-fast');
      expect(normalizeCodexLegacyModelAliases('gpt-5-codex-high[1m]')).toBe('gpt-5.4-high[1m]');
      expect(normalizeCodexLegacyModelAliases('gpt-5-codex-high-fast[1m]')).toBe(
        'gpt-5.4-high-fast[1m]'
      );
      expect(normalizeModelIdForProvider('gpt-5.2-codex', 'codex')).toBe('gpt-5.2');
      expect(normalizeModelIdForProvider('gpt-5.1-codex-mini', 'codex')).toBe('gpt-5.4-mini');
      expect(canonicalizeModelIdForProvider('gpt-5-codex-high', 'codex')).toBe('gpt-5.4-high');
      expect(canonicalizeModelIdForProvider('gpt-5-codex-fast-high', 'codex')).toBe(
        'gpt-5.4-high-fast'
      );
    });
  });

  describe('env normalization', () => {
    it('normalizes model env vars for antigravity only', () => {
      const input: NodeJS.ProcessEnv = {
        ANTHROPIC_MODEL: 'claude-sonnet-4.5-thinking',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4.5-thinking',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4.5',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4.5',
        UNRELATED: 'keep-me',
      };

      const normalized = normalizeModelEnvVarsForProvider(input, 'agy');
      expect(normalized.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5-thinking');
      expect(normalized.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-5-thinking');
      expect(normalized.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5');
      expect(normalized.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5');
      expect(normalized.UNRELATED).toBe('keep-me');

      const unchanged = normalizeModelEnvVarsForProvider(input, 'gemini');
      expect(unchanged.ANTHROPIC_MODEL).toBe('claude-sonnet-4.5-thinking');
      expect(unchanged.UNRELATED).toBe('keep-me');
    });

    it('normalizes iflow legacy model aliases in env vars', () => {
      const input: NodeJS.ProcessEnv = {
        ANTHROPIC_MODEL: 'kimi-k2.5',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'iflow-default',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v3.2-chat',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.7',
      };

      const normalized = normalizeModelEnvVarsForProvider(input, 'iflow');
      expect(normalized.ANTHROPIC_MODEL).toBe('kimi-k2');
      expect(normalized.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen3-coder-plus');
      expect(normalized.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('deepseek-v3.2');
      expect(normalized.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.6');
    });

    it('flags denylisted antigravity models', () => {
      expect(isDeniedAntigravityModelId('claude-opus-4-5-thinking')).toBe(true);
      expect(isDeniedAntigravityModelId('claude-sonnet-4.5')).toBe(true);
      expect(getDeniedModelIdReasonForProvider('claude-sonnet-4.5', 'agy')).toContain('denylist');
      expect(getDeniedModelIdReasonForProvider('claude-sonnet-4.5', 'gemini')).toBeNull();
      expect(getDeniedModelIdReasonForProvider('claude-haiku-4.5', 'agy')).toBeNull();
    });

    it('migrates denylisted antigravity IDs to supported 4.6 fallbacks', () => {
      expect(migrateDeniedAntigravityModelAliases('claude-opus-4.5')).toBe(
        'claude-opus-4-6-thinking'
      );
      expect(migrateDeniedAntigravityModelAliases('claude-sonnet-4-5-thinking(8192)')).toBe(
        'claude-sonnet-4-6(8192)'
      );
      expect(migrateDeniedAntigravityModelAliases('claude-haiku-4-5')).toBe('claude-haiku-4-5');
    });
  });
});
