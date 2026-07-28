import { describe, expect, it } from 'vitest';
import { buildUiCatalog } from '@/lib/model-catalogs';

describe('buildUiCatalog codex tuning metadata merge', () => {
  it('preserves static codex effort and service-tier metadata when the live catalog omits them', () => {
    const merged = buildUiCatalog('codex', {
      provider: 'codex',
      displayName: 'Codex',
      defaultModel: 'gpt-5.6-sol',
      models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
    });

    const model = merged?.models.find((entry) => entry.id === 'gpt-5.6-sol');
    expect(model?.codexMaxEffort).toBe('xhigh');
    expect(model?.codexEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(model?.codexServiceTiers).toEqual(['fast']);
  });

  it('prefers live metadata over static when the live catalog provides it', () => {
    const merged = buildUiCatalog('codex', {
      provider: 'codex',
      displayName: 'Codex',
      defaultModel: 'gpt-5.6-sol',
      models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', codexServiceTiers: [] }],
    });

    const model = merged?.models.find((entry) => entry.id === 'gpt-5.6-sol');
    expect(model?.codexServiceTiers).toEqual([]);
  });
});
