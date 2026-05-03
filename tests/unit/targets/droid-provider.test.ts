import { describe, expect, it } from 'bun:test';
import {
  normalizeDroidProvider,
  inferDroidProviderFromBaseUrl,
  inferDroidProviderFromModel,
  resolveDroidProvider,
} from '../../../src/targets/droid-provider';

describe('droid-provider', () => {
  describe('normalizeDroidProvider', () => {
    it('accepts canonical provider names', () => {
      expect(normalizeDroidProvider('anthropic')).toBe('anthropic');
      expect(normalizeDroidProvider('openai')).toBe('openai');
      expect(normalizeDroidProvider('generic-chat-completion-api')).toBe(
        'generic-chat-completion-api'
      );
    });

    it('normalizes compatibility aliases', () => {
      expect(normalizeDroidProvider('anthropic-compatible')).toBe('anthropic');
      expect(normalizeDroidProvider('openai-compatible')).toBe('generic-chat-completion-api');
    });

    it('returns null for unknown values', () => {
      expect(normalizeDroidProvider('')).toBeNull();
      expect(normalizeDroidProvider('unsupported')).toBeNull();
      expect(normalizeDroidProvider(undefined)).toBeNull();
    });
  });

  describe('inferDroidProviderFromBaseUrl', () => {
    it('detects anthropic-compatible endpoints', () => {
      expect(inferDroidProviderFromBaseUrl('https://api.anthropic.com')).toBe('anthropic');
      expect(inferDroidProviderFromBaseUrl('https://api.z.ai/api/anthropic')).toBe('anthropic');
    });

    it('detects ollama.com as anthropic-native', () => {
      expect(inferDroidProviderFromBaseUrl('https://ollama.com')).toBe('anthropic');
      expect(inferDroidProviderFromBaseUrl('https://ollama.com/v1')).toBe('anthropic');
    });

    it('detects openai official endpoints', () => {
      expect(inferDroidProviderFromBaseUrl('https://api.openai.com/v1')).toBe('openai');
    });

    it('detects generic openai-chat-compatible endpoints', () => {
      expect(inferDroidProviderFromBaseUrl('https://openrouter.ai/api/v1')).toBe(
        'generic-chat-completion-api'
      );
      expect(inferDroidProviderFromBaseUrl('https://api.deepinfra.com/v1/openai')).toBe(
        'generic-chat-completion-api'
      );
    });

    it('detects localhost openai-compatible /v1 endpoints', () => {
      expect(inferDroidProviderFromBaseUrl('http://127.0.0.1:1234/v1')).toBe(
        'generic-chat-completion-api'
      );
      expect(inferDroidProviderFromBaseUrl('http://localhost:8317/v1/chat/completions')).toBe(
        'generic-chat-completion-api'
      );
      expect(inferDroidProviderFromBaseUrl('http://[::1]:8317/v1')).toBe(
        'generic-chat-completion-api'
      );
    });
  });

  describe('inferDroidProviderFromModel', () => {
    it('detects anthropic model naming', () => {
      expect(inferDroidProviderFromModel('claude-sonnet-4-5-20250929')).toBe('anthropic');
    });

    it('detects openai model naming', () => {
      expect(inferDroidProviderFromModel('gpt-5-codex')).toBe('openai');
    });

    it('detects generic openai-compatible model families', () => {
      expect(inferDroidProviderFromModel('qwen3-coder-plus')).toBe('generic-chat-completion-api');
      expect(inferDroidProviderFromModel('deepseek-v3.1')).toBe('generic-chat-completion-api');
      expect(inferDroidProviderFromModel('kimi-k2')).toBe('generic-chat-completion-api');
    });
  });

  describe('resolveDroidProvider', () => {
    it('prefers explicit provider', () => {
      expect(
        resolveDroidProvider({
          provider: 'generic-chat-completion-api',
          baseUrl: 'https://api.anthropic.com',
        })
      ).toBe('generic-chat-completion-api');
    });

    it('falls back to URL inference when provider hint is missing', () => {
      expect(resolveDroidProvider({ baseUrl: 'https://api.openai.com/v1' })).toBe('openai');
    });

    it('defaults to anthropic for legacy profiles without clear signal', () => {
      expect(resolveDroidProvider({ baseUrl: 'http://127.0.0.1:8317' })).toBe('anthropic');
      expect(resolveDroidProvider({})).toBe('anthropic');
    });
  });
});
