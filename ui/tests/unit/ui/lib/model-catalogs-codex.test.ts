import { describe, expect, it } from 'vitest';
import { MODEL_CATALOGS } from '@/lib/model-catalogs';

describe('codex model catalog defaults', () => {
  it('uses gpt-5-codex-mini as the haiku mapping for cross-plan codex presets', () => {
    const codexCatalog = MODEL_CATALOGS.codex;
    const codex55 = codexCatalog.models.find((model) => model.id === 'gpt-5.5');
    const codex53 = codexCatalog.models.find((model) => model.id === 'gpt-5.3-codex');
    const codex52 = codexCatalog.models.find((model) => model.id === 'gpt-5.2-codex');
    const codexMini = codexCatalog.models.find((model) => model.id === 'gpt-5-codex-mini');

    expect(codex55?.presetMapping?.haiku).toBe('gpt-5-codex-mini');
    expect(codex55?.codexMaxEffort).toBe('xhigh');
    expect(codex53?.presetMapping?.haiku).toBe('gpt-5-codex-mini');
    expect(codex52?.presetMapping?.haiku).toBe('gpt-5-codex-mini');
    expect(codex53?.codexMaxEffort).toBe('xhigh');
    expect(codexMini?.codexMaxEffort).toBe('high');
  });
});
