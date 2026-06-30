import { existsSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'bun:test';
import {
  PROVIDER_PRESETS,
  getPresetById,
  isValidPresetId,
} from '../../../src/api/services/provider-presets';

describe('provider-presets', () => {
  it('resolves Alibaba Coding Plan preset id', () => {
    const preset = getPresetById('alibaba-coding-plan');
    expect(preset?.id).toBe('alibaba-coding-plan');
    expect(preset?.baseUrl).toBe('https://coding-intl.dashscope.aliyuncs.com/apps/anthropic');
    expect(preset?.defaultProfileName).toBe('albb');
  });

  it('resolves alibaba alias to Alibaba Coding Plan preset', () => {
    const preset = getPresetById('alibaba');
    expect(preset?.id).toBe('alibaba-coding-plan');
  });

  it('treats alibaba alias as a valid preset id', () => {
    expect(isValidPresetId('alibaba')).toBe(true);
  });

  it('resolves canonical km preset id', () => {
    const preset = getPresetById('km');
    expect(preset?.id).toBe('km');
  });

  it('tracks current provider default model updates', () => {
    expect(getPresetById('glm')?.defaultModel).toBe('glm-5.2');
    expect(getPresetById('glmt')?.defaultModel).toBe('glm-5.2');
    expect(getPresetById('km')?.defaultModel).toBe('kimi-for-coding');
    expect(getPresetById('kimi')?.defaultModel).toBe('kimi-for-coding');
    expect(getPresetById('mm')?.defaultModel).toBe('MiniMax-M3');
  });

  it('resolves llama.cpp preset with local-provider sentinel token', () => {
    const preset = getPresetById('llamacpp');
    expect(preset?.id).toBe('llamacpp');
    expect(preset?.requiresApiKey).toBe(false);
    expect(preset?.apiKeyPlaceholder).toBe('llamacpp');
    expect(preset?.baseUrl).toBe('http://127.0.0.1:8080');
    expect(preset?.icon).toBe('/assets/providers/llama-cpp.svg');
  });

  it('resolves legacy kimi preset alias to km', () => {
    const preset = getPresetById('kimi');
    expect(preset?.id).toBe('km');
  });

  it('resolves legacy glmt preset alias to glm', () => {
    const preset = getPresetById('glmt');
    expect(preset?.id).toBe('glm');
    expect(preset?.baseUrl).toBe('https://api.z.ai/api/anthropic');
  });

  it('resolves preset id with extra whitespace', () => {
    const preset = getPresetById('  km  ');
    expect(preset?.id).toBe('km');
  });

  it('resolves uppercase legacy alias', () => {
    const preset = getPresetById('KIMI');
    expect(preset?.id).toBe('km');
  });

  it('treats legacy kimi alias as a valid preset id', () => {
    expect(isValidPresetId('kimi')).toBe(true);
  });

  it('keeps glmt out of the canonical preset catalog while preserving alias compatibility', () => {
    expect(PROVIDER_PRESETS.some((preset) => preset.id === 'glmt')).toBe(false);
    expect(isValidPresetId('glmt')).toBe(true);
  });

  it('uses non-reserved default profile name for qwen API preset', () => {
    const preset = getPresetById('qwen');
    expect(preset?.defaultProfileName).toBe('qwen-api');
  });

  it('resolves Hugging Face preset metadata', () => {
    const preset = getPresetById('huggingface');
    expect(preset?.id).toBe('huggingface');
    expect(preset?.baseUrl).toBe('https://router.huggingface.co/v1');
    expect(preset?.defaultProfileName).toBe('hf');
    expect(preset?.defaultModel).toBe('openai/gpt-oss-120b:fastest');
    expect(preset?.defaultTarget).toBe('droid');
    expect(preset?.apiKeyPlaceholder).toBe('hf_...');
  });

  it('resolves hf alias to the Hugging Face preset', () => {
    const preset = getPresetById('hf');
    expect(preset?.id).toBe('huggingface');
  });

  it('treats hf alias as a valid preset id', () => {
    expect(isValidPresetId('hf')).toBe(true);
  });

  it('resolves Tuning Engines preset metadata and aliases', () => {
    const preset = getPresetById('tuningengines');
    expect(preset?.id).toBe('tuningengines');
    expect(preset?.baseUrl).toBe('https://api.tuningengines.com/v1');
    expect(preset?.defaultProfileName).toBe('te');
    expect(preset?.defaultModel).toBe('gpt-4o');
    expect(preset?.defaultTarget).toBe('droid');
    expect(preset?.apiKeyPlaceholder).toBe('sk-te-...');
    expect(getPresetById('te')?.id).toBe('tuningengines');
    expect(getPresetById('tuning')?.id).toBe('tuningengines');
    expect(isValidPresetId('te')).toBe(true);
  });

  it('uses OpenRouter v1 as the OpenAI-compatible API root', () => {
    const preset = getPresetById('openrouter');
    expect(preset?.baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('keeps Anthropic direct last in the recommended preset order and reuses the Claude logo', () => {
    const recommendedPresetIds = PROVIDER_PRESETS.filter(
      (preset) => preset.category === 'recommended'
    ).map((preset) => preset.id);

    expect(recommendedPresetIds.at(-1)).toBe('anthropic');
    expect(getPresetById('anthropic')?.icon).toBe('/assets/providers/claude.svg');
  });

  it('only references provider preset icons that exist in ui/public', () => {
    for (const preset of PROVIDER_PRESETS) {
      if (!preset.icon) continue;

      const iconPath = resolve(
        import.meta.dir,
        '../../../ui/public',
        preset.icon.replace(/^\/+/, '')
      );
      expect(existsSync(iconPath)).toBe(true);
    }
  });
});
