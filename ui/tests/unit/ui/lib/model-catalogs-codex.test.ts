import { describe, expect, it } from 'vitest';
import { MODEL_CATALOGS } from '@/lib/model-catalogs';

describe('codex model catalog defaults', () => {
  it('mirrors the current Codex runtime catalog and free-safe defaults', () => {
    const codexCatalog = MODEL_CATALOGS.codex;
    const codex55 = codexCatalog.models.find((model) => model.id === 'gpt-5.5');
    const codex53 = codexCatalog.models.find((model) => model.id === 'gpt-5.3-codex');
    const codex52 = codexCatalog.models.find((model) => model.id === 'gpt-5.2');
    const codex54 = codexCatalog.models.find((model) => model.id === 'gpt-5.4');
    const codexMini = codexCatalog.models.find((model) => model.id === 'gpt-5.4-mini');

    expect(codexCatalog.defaultModel).toBe('gpt-5.4');
    expect(codex55?.tier).toBe('paid');
    expect(codex55?.presetMapping?.haiku).toBe('gpt-5.4-mini');
    expect(codex55?.codexMaxEffort).toBe('xhigh');
    expect(codex54?.tier).toBeUndefined();
    expect(codex54?.presetMapping?.haiku).toBe('gpt-5.4-mini');
    expect(codex53?.presetMapping?.haiku).toBe('gpt-5.4-mini');
    expect(codex52?.presetMapping?.haiku).toBe('gpt-5.4-mini');
    expect(codex53?.codexMaxEffort).toBe('xhigh');
    expect(codexMini?.codexMaxEffort).toBe('high');
  });
});
