import { describe, expect, it } from 'bun:test';
import {
  isAnthropicPassthroughProfile,
  resolveOpenAIChatCompletionsUrl,
  resolveOpenAIModelsUrl,
} from '../../../src/proxy/upstream-url';

describe('OpenAI-compatible upstream URL resolution', () => {
  it('routes current OpenRouter API roots through /api/v1', () => {
    expect(resolveOpenAIChatCompletionsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/chat/completions'
    );
    expect(resolveOpenAIModelsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/models'
    );
  });

  it('repairs legacy OpenRouter /api roots before appending OpenAI endpoints', () => {
    expect(resolveOpenAIChatCompletionsUrl('https://openrouter.ai/api')).toBe(
      'https://openrouter.ai/api/v1/chat/completions'
    );
    expect(resolveOpenAIModelsUrl('https://openrouter.ai/api')).toBe(
      'https://openrouter.ai/api/v1/models'
    );
  });

  it('does not rewrite non-OpenRouter /api roots', () => {
    expect(resolveOpenAIChatCompletionsUrl('https://example.test/api')).toBe(
      'https://example.test/api/chat/completions'
    );
  });
});

describe('Anthropic passthrough URL resolution', () => {
  it('resolves to /v1/messages when forcePassthrough is set', () => {
    expect(
      resolveOpenAIChatCompletionsUrl('https://api.kimi.com/coding/', {
        passthrough: true,
      })
    ).toBe('https://api.kimi.com/coding/v1/messages');
  });

  it('drops a duplicated /v1 prefix when the base URL already ends in /v1', () => {
    expect(
      resolveOpenAIChatCompletionsUrl('https://api.kimi.com/coding/v1', {
        passthrough: true,
      })
    ).toBe('https://api.kimi.com/coding/v1/messages');
  });

  it('routes /v1/models in passthrough mode', () => {
    expect(
      resolveOpenAIModelsUrl('https://api.kimi.com/coding/v1', {
        passthrough: true,
      })
    ).toBe('https://api.kimi.com/coding/v1/models');
  });

  it('auto-detects known Anthropic-style hosts', () => {
    expect(isAnthropicPassthroughProfile('https://api.kimi.com/coding/')).toBe(true);
    expect(isAnthropicPassthroughProfile('https://api.kimi.com/coding/v1')).toBe(true);
    expect(isAnthropicPassthroughProfile('https://api.anthropic.com')).toBe(true);
  });

  it('does not treat generic /v1 roots as Anthropic-style passthrough', () => {
    expect(isAnthropicPassthroughProfile('https://example.test/v1')).toBe(false);
    expect(isAnthropicPassthroughProfile('https://example.test/v1/')).toBe(false);
    expect(isAnthropicPassthroughProfile('https://example.test/api/v1')).toBe(false);
    expect(isAnthropicPassthroughProfile('https://api.openai.com/v1')).toBe(false);
    expect(isAnthropicPassthroughProfile('https://api.minimax.io/v1')).toBe(false);
  });

  it('does not auto-detect OpenAI-style base URLs as Anthropic-style', () => {
    expect(isAnthropicPassthroughProfile('https://api.fireworks.ai/inference')).toBe(false);
    expect(isAnthropicPassthroughProfile('https://api.openai.com/v1')).toBe(false);
  });

  it('honors explicit force passthrough for unknown mirrors', () => {
    expect(
      isAnthropicPassthroughProfile('https://anthropic-mirror.example.test/v1', {
        forcePassthrough: true,
      })
    ).toBe(true);
  });
});
