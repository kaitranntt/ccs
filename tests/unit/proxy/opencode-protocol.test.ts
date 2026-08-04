import { describe, expect, it } from 'bun:test';
import {
  OPENCODE_ANTHROPIC_VERSION,
  classifyOpenCodeModel,
  isOpenCodeHost,
  resolveOpenCodeUpstreamMode,
} from '../../../src/proxy/opencode-protocol';

describe('isOpenCodeHost', () => {
  it('detects opencode.ai and subdomains', () => {
    expect(isOpenCodeHost('opencode.ai')).toBe(true);
    expect(isOpenCodeHost('api.opencode.ai')).toBe(true);
    expect(isOpenCodeHost('OPENCODE.AI')).toBe(true);
  });

  it('rejects unrelated hosts', () => {
    expect(isOpenCodeHost('api.anthropic.com')).toBe(false);
    expect(isOpenCodeHost('opencode.example.com')).toBe(false);
    expect(isOpenCodeHost('notopencode.ai')).toBe(false);
  });
});

describe('classifyOpenCodeModel', () => {
  it('routes Anthropic-family models to the /messages protocol', () => {
    expect(classifyOpenCodeModel('claude-sonnet-4-6')).toBe('anthropic');
    expect(classifyOpenCodeModel('claude-fable-5')).toBe('anthropic');
    expect(classifyOpenCodeModel('qwen3-max')).toBe('anthropic');
    expect(classifyOpenCodeModel('minimax-m3')).toBe('anthropic');
    expect(classifyOpenCodeModel('MiniMax-M2.7')).toBe('anthropic');
  });

  it('routes GPT/Codex models to the responses protocol', () => {
    expect(classifyOpenCodeModel('gpt-5.5')).toBe('responses');
    expect(classifyOpenCodeModel('gpt-5.6-sol')).toBe('responses');
    expect(classifyOpenCodeModel('gpt-5.1-codex')).toBe('responses');
  });

  it('routes Gemini models to the gemini protocol', () => {
    expect(classifyOpenCodeModel('gemini-3.6-flash')).toBe('gemini');
    expect(classifyOpenCodeModel('gemini-3.1-pro')).toBe('gemini');
  });

  it('defaults chat-completions models and unknown ids to chat-completions', () => {
    expect(classifyOpenCodeModel('deepseek-v4-flash')).toBe('chat-completions');
    expect(classifyOpenCodeModel('grok-4.5')).toBe('chat-completions');
    expect(classifyOpenCodeModel('glm-5')).toBe('chat-completions');
    expect(classifyOpenCodeModel('kimi-k2.7')).toBe('chat-completions');
    expect(classifyOpenCodeModel('deepseek-v4-flash-free')).toBe('chat-completions');
    expect(classifyOpenCodeModel('some-unknown-model')).toBe('chat-completions');
  });

  it('handles missing or empty model ids', () => {
    expect(classifyOpenCodeModel(undefined)).toBe('chat-completions');
    expect(classifyOpenCodeModel(null)).toBe('chat-completions');
    expect(classifyOpenCodeModel('  ')).toBe('chat-completions');
  });

  it('strips OpenCode-internal provider prefixes before classifying', () => {
    expect(classifyOpenCodeModel('opencode/claude-sonnet-4-6')).toBe('anthropic');
    expect(classifyOpenCodeModel('opencode-go/deepseek-v4-flash')).toBe('chat-completions');
    expect(classifyOpenCodeModel('opencode-go/MiniMax-M3')).toBe('anthropic');
    expect(classifyOpenCodeModel('opencode/gpt-5.5')).toBe('responses');
  });
});

describe('resolveOpenCodeUpstreamMode', () => {
  it('returns null for non-OpenCode hosts', () => {
    expect(
      resolveOpenCodeUpstreamMode('https://api.anthropic.com', 'claude-sonnet-4-6')
    ).toBeNull();
    expect(resolveOpenCodeUpstreamMode('https://api.deepseek.com/v1', 'deepseek-chat')).toBeNull();
  });

  it('returns null for malformed base URLs', () => {
    expect(resolveOpenCodeUpstreamMode('not a url', 'deepseek-v4-flash')).toBeNull();
  });

  it('resolves anthropic mode for Claude-family models on OpenCode hosts', () => {
    expect(resolveOpenCodeUpstreamMode('https://opencode.ai/zen/v1', 'claude-sonnet-4-6')).toEqual({
      mode: 'anthropic',
    });
    expect(resolveOpenCodeUpstreamMode('https://opencode.ai/zen/go/v1', 'qwen3-max')).toEqual({
      mode: 'anthropic',
    });
  });

  it('resolves chat-completions mode for OpenAI-compatible models', () => {
    expect(resolveOpenCodeUpstreamMode('https://opencode.ai/zen/v1', 'deepseek-v4-flash')).toEqual({
      mode: 'chat-completions',
    });
    expect(resolveOpenCodeUpstreamMode('https://opencode.ai/zen/v1', undefined)).toEqual({
      mode: 'chat-completions',
    });
  });

  it('flags responses-protocol models as unsupported', () => {
    const mode = resolveOpenCodeUpstreamMode('https://opencode.ai/zen/v1', 'gpt-5.5');
    expect(mode).not.toBeNull();
    expect(mode!.mode).toBe('unsupported');
    expect(mode!.mode === 'unsupported' && mode.reason).toContain('Responses');
  });

  it('flags gemini-protocol models as unsupported', () => {
    const mode = resolveOpenCodeUpstreamMode('https://opencode.ai/zen/v1', 'gemini-3.6-flash');
    expect(mode).not.toBeNull();
    expect(mode!.mode).toBe('unsupported');
    expect(mode!.mode === 'unsupported' && mode.reason).toContain('generateContent');
  });
});

describe('OPENCODE_ANTHROPIC_VERSION', () => {
  it('matches the Anthropic API version required by the gateway', () => {
    expect(OPENCODE_ANTHROPIC_VERSION).toBe('2023-06-01');
  });
});
