import { describe, expect, it } from 'bun:test';
import { resolveOpenAICompatProfileConfig } from '../../../src/proxy/profile-router';

describe('resolveOpenAICompatProfileConfig', () => {
  it('detects generic OpenAI-compatible profiles from base URL and provider hint', () => {
    const result = resolveOpenAICompatProfileConfig('hf', '/tmp/hf.settings.json', {
      ANTHROPIC_BASE_URL: 'https://router.huggingface.co/v1',
      ANTHROPIC_AUTH_TOKEN: 'hf_token',
      ANTHROPIC_MODEL: 'openai/gpt-oss-120b:fastest',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('generic-chat-completion-api');
    expect(result?.profileName).toBe('hf');
  });

  it('detects official OpenAI-style endpoints', () => {
    const result = resolveOpenAICompatProfileConfig('openai', '/tmp/openai.settings.json', {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-openai',
      ANTHROPIC_MODEL: 'gpt-4.1',
      CCS_OPENAI_PROXY_INSECURE: 'true',
    });

    expect(result?.provider).toBe('openai');
    expect(result?.model).toBe('gpt-4.1');
    expect(result?.insecure).toBe(true);
  });

  it('supports opt-in reasoning payload shaping for opaque OpenAI-compatible model IDs', () => {
    const result = resolveOpenAICompatProfileConfig('gateway', '/tmp/gateway.settings.json', {
      ANTHROPIC_BASE_URL: 'https://gateway.example.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'gateway-token',
      ANTHROPIC_MODEL: 'b3f9a2c7e8d14f60',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      CCS_OPENAI_REASONING_MODEL: 'yes',
    });

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('generic-chat-completion-api');
    expect(result?.forceOpenAIReasoningModel).toBe(true);
  });

  it('ignores Anthropic-compatible profiles', () => {
    const result = resolveOpenAICompatProfileConfig('glm', '/tmp/glm.settings.json', {
      ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'glm-key',
      ANTHROPIC_MODEL: 'glm-5',
    });

    expect(result).toBeNull();
  });

  it('prefers OpenAI-compatible URL inference over stale anthropic provider hints', () => {
    const result = resolveOpenAICompatProfileConfig('q', '/tmp/q.settings.json', {
      ANTHROPIC_BASE_URL: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
      ANTHROPIC_AUTH_TOKEN: 'q-token',
      ANTHROPIC_MODEL: 'qwen3.6-plus',
      CCS_DROID_PROVIDER: 'anthropic',
    });

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('generic-chat-completion-api');
    expect(result?.model).toBe('qwen3.6-plus');
  });

  it('does not proxy bare ollama.com profiles that are anthropic-native', () => {
    const result = resolveOpenAICompatProfileConfig(
      'ollama-cloud',
      '/tmp/ollama-cloud.settings.json',
      {
        ANTHROPIC_BASE_URL: 'https://ollama.com',
        ANTHROPIC_AUTH_TOKEN: 'ollama-token',
        ANTHROPIC_MODEL: 'qwen3-coder-plus',
      }
    );

    expect(result).toBeNull();
  });

  it('still proxies explicit ollama.com chat-completions endpoints', () => {
    const result = resolveOpenAICompatProfileConfig(
      'ollama-cloud-chat-completions',
      '/tmp/ollama-cloud-chat-completions.settings.json',
      {
        ANTHROPIC_BASE_URL: 'https://ollama.com/v1/chat/completions',
        ANTHROPIC_AUTH_TOKEN: 'ollama-token',
        ANTHROPIC_MODEL: 'qwen3-coder-plus',
      }
    );

    expect(result).not.toBeNull();
    expect(result?.provider).toBe('generic-chat-completion-api');
  });
});
