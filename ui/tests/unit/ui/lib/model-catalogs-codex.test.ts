import { describe, expect, it } from 'vitest';
import { MODEL_CATALOGS } from '@/lib/model-catalogs';

describe('codex model catalog defaults', () => {
  it('mirrors the current Codex runtime catalog and free-safe defaults', () => {
    const codexCatalog = MODEL_CATALOGS.codex;
    const codex6Astra = codexCatalog.models.find((model) => model.id === 'gpt-6-astra');
    const codex56Sol = codexCatalog.models.find((model) => model.id === 'gpt-5.6-sol');
    const codex56Terra = codexCatalog.models.find((model) => model.id === 'gpt-5.6-terra');
    const codex56Luna = codexCatalog.models.find((model) => model.id === 'gpt-5.6-luna');
    const codex55 = codexCatalog.models.find((model) => model.id === 'gpt-5.5');
    const codex53 = codexCatalog.models.find((model) => model.id === 'gpt-5.3-codex');
    const codex52 = codexCatalog.models.find((model) => model.id === 'gpt-5.2');
    const codex54 = codexCatalog.models.find((model) => model.id === 'gpt-5.4');
    const codexMini = codexCatalog.models.find((model) => model.id === 'gpt-5.4-mini');

    expect(codexCatalog.defaultModel).toBe('gpt-5.4');
    expect(codex6Astra?.presetMapping).toEqual({
      default: 'gpt-6-astra',
      opus: 'gpt-6-astra',
      sonnet: 'gpt-6-astra',
      haiku: 'gpt-5.4-mini',
    });
    expect(codex6Astra?.codexMaxEffort).toBe('xhigh');
    for (const model of [codex6Astra, codex56Sol, codex56Terra, codex56Luna]) {
      expect(model?.tier).toBeUndefined();
      expect(model?.codexEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
      expect(model?.codexServiceTiers).toEqual(['fast']);
      expect(model?.presetMapping?.haiku).toBe('gpt-5.4-mini');
    }
    expect(codex55?.tier).toBe('paid');
    expect(codex55?.presetMapping?.haiku).toBe('gpt-5.4-mini');
    expect(codex55?.codexMaxEffort).toBe('xhigh');
    expect(codex55?.codexServiceTiers).toEqual(['fast']);
    expect(codex54?.tier).toBeUndefined();
    expect(codex54?.presetMapping?.haiku).toBe('gpt-5.4-mini');
    expect(codex54?.codexServiceTiers).toEqual(['fast']);
    expect(codex53?.presetMapping?.haiku).toBe('gpt-5.4-mini');
    expect(codex52?.presetMapping?.haiku).toBe('gpt-5.4-mini');
    expect(codex53?.codexMaxEffort).toBe('xhigh');
    expect(codexMini?.codexMaxEffort).toBe('high');
  });
});
