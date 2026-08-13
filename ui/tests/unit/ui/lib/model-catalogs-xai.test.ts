import { describe, expect, it } from 'vitest';
import { buildUiCatalog, MODEL_CATALOGS, supportsExtendedContext } from '@/lib/model-catalogs';

describe('xAI model catalog defaults', () => {
  it('mirrors the CLIProxyAPI text catalog and default tier routing', () => {
    const catalog = MODEL_CATALOGS.xai;
    const ids = catalog.models.map((model) => model.id);
    const defaultModel = catalog.models.find((model) => model.id === catalog.defaultModel);

    expect(catalog.displayName).toBe('xAI (Grok)');
    expect(catalog.defaultModel).toBe('grok-build-0.1');
    expect(ids).toEqual([
      'grok-build-0.1',
      'grok-4.6',
      'grok-4.5',
      'grok-4.3',
      'grok-4.20-0309-reasoning',
      'grok-4.20-0309-non-reasoning',
      'grok-4.20-multi-agent-0309',
      'grok-3-mini',
      'grok-3-mini-fast',
      'grok-composer-2.5-fast',
    ]);
    expect(catalog.models.find((model) => model.id === 'grok-4.6')?.reasoningLevels).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(defaultModel?.presetMapping).toEqual({
      default: 'grok-build-0.1',
      opus: 'grok-4.5',
      sonnet: 'grok-build-0.1',
      haiku: 'grok-composer-2.5-fast',
    });
  });

  it('does not expose Claude [1m] suffix support for xAI model IDs', () => {
    const catalog = MODEL_CATALOGS.xai;

    for (const model of catalog.models) {
      expect(model.extendedContext).not.toBe(true);
      expect(supportsExtendedContext('xai', model.id)).toBe(false);
    }
  });

  it('strips generic extended-context metadata from live xAI catalogs', () => {
    const catalog = buildUiCatalog('xai', {
      provider: 'xai',
      displayName: 'xAI (Grok)',
      defaultModel: 'grok-4.3',
      models: [
        {
          id: 'grok-4.3',
          name: 'Grok 4.3',
          extendedContext: true,
        },
      ],
    });

    expect(catalog?.models[0]?.extendedContext).toBeUndefined();
    expect(supportsExtendedContext('xai', 'grok-4.3', catalog)).toBe(false);
  });
});
