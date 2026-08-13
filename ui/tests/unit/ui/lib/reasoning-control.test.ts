import { describe, expect, it } from 'vitest';
import type { ProviderCatalog } from '@/components/cliproxy/provider-model-selector';
import {
  applyXaiReasoningSuffix,
  getReasoningAdapter,
  parseXaiReasoningLevel,
  stripXaiReasoningSuffix,
} from '@/lib/reasoning-control';

const xaiCatalog: ProviderCatalog = {
  provider: 'xai',
  displayName: 'xAI (Grok)',
  defaultModel: 'grok-build-0.1',
  models: [
    { id: 'grok-build-0.1', name: 'Grok Build 0.1' },
    {
      id: 'grok-4.6',
      name: 'Grok 4.6',
      reasoningLevels: ['low', 'medium', 'high', 'xhigh'],
    },
    { id: 'grok-4.5', name: 'Grok 4.5', reasoningLevels: ['low', 'medium', 'high'] },
    { id: 'grok-4.3', name: 'Grok 4.3', reasoningLevels: ['none', 'low', 'medium', 'high'] },
  ],
};

const codexCatalog: ProviderCatalog = {
  provider: 'codex',
  displayName: 'Codex',
  defaultModel: 'gpt-5.3-codex',
  models: [
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', codexMaxEffort: 'xhigh' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', codexMaxEffort: 'high' },
    {
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6 Sol',
      codexEfforts: ['low', 'medium', 'high', 'xhigh'],
    },
  ],
};

describe('xai paren codec', () => {
  it('parses paren level suffixes', () => {
    expect(parseXaiReasoningLevel('grok-4.5(high)')).toBe('high');
    expect(parseXaiReasoningLevel('grok-4.3(none)')).toBe('none');
    expect(parseXaiReasoningLevel('grok-4.5(HIGH)')).toBe('high');
  });

  it('returns undefined for unsuffixed or non-level values', () => {
    expect(parseXaiReasoningLevel('grok-4.5')).toBeUndefined();
    expect(parseXaiReasoningLevel('grok-4(1m)')).toBeUndefined();
    expect(parseXaiReasoningLevel(undefined)).toBeUndefined();
  });

  it('only matches the suffix at end-of-string', () => {
    expect(parseXaiReasoningLevel('grok(high)-fast')).toBeUndefined();
    expect(stripXaiReasoningSuffix('grok(high)-fast')).toBe('grok(high)-fast');
  });

  it('strips paren suffixes for catalog lookup', () => {
    expect(stripXaiReasoningSuffix('grok-4.5(high)')).toBe('grok-4.5');
    expect(stripXaiReasoningSuffix('grok-4.5')).toBe('grok-4.5');
    expect(stripXaiReasoningSuffix(undefined)).toBe('');
  });

  it('applies and replaces paren suffixes', () => {
    expect(applyXaiReasoningSuffix('grok-4.5', 'high')).toBe('grok-4.5(high)');
    expect(applyXaiReasoningSuffix('grok-4.5(high)', 'low')).toBe('grok-4.5(low)');
    expect(applyXaiReasoningSuffix('grok-4.3', 'none')).toBe('grok-4.3(none)');
  });

  it('strips the suffix when no level is given', () => {
    expect(applyXaiReasoningSuffix('grok-4.5(high)', undefined)).toBe('grok-4.5');
    expect(applyXaiReasoningSuffix('grok-4.3(none)', undefined)).toBe('grok-4.3');
    expect(applyXaiReasoningSuffix(undefined, 'high')).toBe('');
  });

  it('round-trips through parse and apply', () => {
    const stored = applyXaiReasoningSuffix('grok-4.5', 'high');
    expect(parseXaiReasoningLevel(stored)).toBe('high');
    expect(applyXaiReasoningSuffix(stored, parseXaiReasoningLevel(stored))).toBe(stored);
  });
});

describe('getReasoningAdapter', () => {
  it('returns adapters for codex and xai only', () => {
    expect(getReasoningAdapter('codex')).toBeDefined();
    expect(getReasoningAdapter('xai')).toBeDefined();
    expect(getReasoningAdapter('XAI')).toBeDefined();
    expect(getReasoningAdapter('gemini')).toBeUndefined();
    expect(getReasoningAdapter(undefined)).toBeUndefined();
  });
});

function requireAdapter(provider: string) {
  const adapter = getReasoningAdapter(provider);
  if (!adapter) throw new Error(`missing reasoning adapter for ${provider}`);
  return adapter;
}

describe('xai adapter', () => {
  const adapter = requireAdapter('xai');

  it('returns per-model levels from catalog metadata', () => {
    expect(adapter.getOptions('grok-4.6', xaiCatalog)).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(adapter.getOptions('grok-4.5', xaiCatalog)).toEqual(['low', 'medium', 'high']);
    expect(adapter.getOptions('grok-4.3', xaiCatalog)).toEqual(['none', 'low', 'medium', 'high']);
  });

  it('hides the control for models without levels metadata', () => {
    expect(adapter.getOptions('grok-build-0.1', xaiCatalog)).toBeNull();
    expect(adapter.getOptions('grok-unknown-model', xaiCatalog)).toBeNull();
    expect(adapter.getOptions('', xaiCatalog)).toBeNull();
  });

  it('writes and clears suffixed values through apply', () => {
    expect(adapter.apply('grok-4.6', 'xhigh')).toBe('grok-4.6(xhigh)');
    expect(adapter.apply('grok-4.5', 'high')).toBe('grok-4.5(high)');
    expect(adapter.apply('grok-4.5(high)', undefined)).toBe('grok-4.5');
    expect(adapter.apply('grok-4.3', 'none')).toBe('grok-4.3(none)');
  });

  it('pre-selects stored suffixed values', () => {
    expect(adapter.parse('grok-4.5(high)')).toBe('high');
    expect(adapter.strip('grok-4.5(high)')).toBe('grok-4.5');
  });
});

describe('codex adapter', () => {
  const adapter = requireAdapter('codex');

  it('delegates parse and strip to codex-effort helpers', () => {
    expect(adapter.parse('gpt-5.3-codex-high')).toBe('high');
    expect(adapter.parse('gpt-5.4-high-fast')).toBe('high');
    expect(adapter.parse('gpt-5.3-codex')).toBeUndefined();
    expect(adapter.strip('gpt-5.4-fast-high')).toBe('gpt-5.4');
  });

  it('applies dash suffixes preserving fast tier and routing prefix', () => {
    expect(adapter.apply('gpt-5.4-high-fast', 'low')).toBe('gpt-5.4-low-fast');
    expect(adapter.apply('gpt-5.4-high-fast', undefined)).toBe('gpt-5.4-fast');
    expect(adapter.apply('codex/gpt-5.6-sol', 'high')).toBe('codex/gpt-5.6-sol-high');
  });

  it('returns catalog-driven effort options', () => {
    expect(adapter.getOptions('gpt-5.4-mini', codexCatalog)).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
    ]);
    expect(adapter.getOptions('gpt-5.6-sol', codexCatalog)).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('falls back to all five efforts for custom or unselected models', () => {
    expect(adapter.getOptions('my-org/custom-model', codexCatalog)).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(adapter.getOptions('', codexCatalog)).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });
});
