import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildUiCatalogs,
  MODEL_CATALOGS,
  findCatalogModel,
  getResolvedCatalogModels,
  getSupplementalCatalogModels,
  resolveCatalogModelId,
} from '@/lib/model-catalogs';
import { applyDefaultPreset } from '@/lib/preset-utils';

describe('claude preset utils', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the claude catalog default on Sonnet 4.6 while exposing Opus 4.7/4.8 and Fable 5', () => {
    const claudeCatalog = MODEL_CATALOGS.claude;
    const ids = claudeCatalog.models.map((model) => model.id);

    expect(claudeCatalog.defaultModel).toBe('claude-sonnet-4-6');
    expect(ids).toContain('claude-fable-5');
    expect(ids).toContain('claude-opus-4-8');
    expect(ids).toContain('claude-opus-4-7');
    expect(ids).toContain('claude-sonnet-4-6');
  });

  it('applies the default claude preset from the catalog default model mapping', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          catalogs: {
            claude: MODEL_CATALOGS.claude,
          },
          source: 'live',
          cache: { synced: true, age: '0m ago' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiKey: { value: 'managed-key' } }),
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);

    const result = await applyDefaultPreset('claude');

    expect(result).toEqual({ success: true, presetName: 'Claude Sonnet 4.6' });

    const [, requestInit] = fetchMock.mock.calls[2] ?? [];
    const body = JSON.parse(String(requestInit?.body));

    expect(body.settings.env).toMatchObject({
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    });
  });

  it('skips catalog fetch when the caller already has the provider catalog cached', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiKey: { value: 'managed-key' } }),
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);

    const result = await applyDefaultPreset('claude', undefined, MODEL_CATALOGS.claude);

    expect(result).toEqual({ success: true, presetName: 'Claude Sonnet 4.6' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/settings/auth/tokens/raw');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/settings/claude',
      expect.objectContaining({
        method: 'PUT',
      })
    );
  });

  it('builds UI catalogs from upstream provider models without requiring static dropdown edits', () => {
    const liveCatalogs = {
      gemini: {
        provider: 'gemini',
        displayName: 'Gemini',
        defaultModel: 'gemini-3.9-pro-preview',
        models: [
          { id: 'gemini-3.9-pro-preview', name: 'Gemini 3.9 Pro Preview' },
          { id: 'gemini-3-9-flash-preview', name: 'Gemini 3.9 Flash Preview' },
        ],
      },
    };

    const catalogs = buildUiCatalogs(liveCatalogs);
    const resolvedGeminiModels = getResolvedCatalogModels(catalogs.gemini, [
      { id: 'gemini-3.9-pro-preview', owned_by: 'google' },
      { id: 'gemini-3-9-flash-preview', owned_by: 'google' },
    ]);

    expect(catalogs.gemini?.defaultModel).toBe('gemini-3.9-pro-preview');
    expect(resolvedGeminiModels.find((model) => model.id === 'gemini-3.9-pro-preview')).toEqual(
      expect.objectContaining({
        name: 'Gemini 3.9 Pro Preview',
        presetMapping: expect.objectContaining({
          default: 'gemini-3.9-pro-preview',
          haiku: 'gemini-3-9-flash-preview',
        }),
      })
    );
  });

  it('builds UI catalogs with a visible default when the live default is stale', () => {
    const liveCatalogs = {
      gemini: {
        provider: 'gemini',
        displayName: 'Gemini',
        defaultModel: 'gemini-2.5-pro',
        models: [{ id: 'gemini-live-only', name: 'Gemini Live Only' }],
      },
    };

    const catalogs = buildUiCatalogs(liveCatalogs);

    expect(catalogs.gemini?.defaultModel).toBe('gemini-live-only');
    expect(catalogs.gemini?.models.map((model) => model.id)).toContain(
      catalogs.gemini?.defaultModel
    );
  });

  it('uses the selected visible model for quick setup fallback mappings', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiKey: { value: 'managed-key' } }),
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);

    const result = await applyDefaultPreset('gemini', undefined, {
      provider: 'gemini',
      displayName: 'Gemini',
      defaultModel: 'gemini-2.5-pro',
      models: [{ id: 'gemini-live-only', name: 'Gemini Live Only' }],
    });

    expect(result).toEqual({ success: true, presetName: 'Gemini Live Only' });

    const [, requestInit] = fetchMock.mock.calls[1] ?? [];
    const body = JSON.parse(String(requestInit?.body));

    expect(body.settings.env).toMatchObject({
      ANTHROPIC_MODEL: 'gemini-live-only',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gemini-live-only',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gemini-live-only',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-live-only',
    });
  });

  it('keeps Gemini presets on 3.1 Pro while resolving 3/3.1 alias variants', () => {
    const geminiCatalog = MODEL_CATALOGS.gemini;
    const latestPro = geminiCatalog.models.find((model) => model.id === 'gemini-3.1-pro-preview');

    expect(latestPro?.name).toBe('Gemini Pro');
    expect(latestPro?.presetMapping?.default).toBe('gemini-3.1-pro-preview');
    expect(findCatalogModel('gemini', 'gemini-3-pro-preview')?.id).toBe('gemini-3.1-pro-preview');
    expect(findCatalogModel('gemini', 'gemini-3.1-flash-preview')?.id).toBe(
      'gemini-3-flash-preview'
    );
  });

  it('maps legacy Antigravity Gemini Pro aliases to the current catalog entries', () => {
    expect(findCatalogModel('agy', 'gemini-3.1-pro-preview')?.id).toBe('gemini-3.1-pro-high');
    expect(findCatalogModel('agy', 'gemini-3-pro-preview')?.id).toBe('gemini-3.1-pro-high');
    expect(findCatalogModel('agy', 'gemini-3-pro-low')?.id).toBe('gemini-3.1-pro-low');
  });

  it('resolves Antigravity Gemini presets to the current live-safe model ids', () => {
    const availableModels = [
      { id: 'agy/gemini-3.1-pro-high', owned_by: 'antigravity' },
      { id: 'gemini-3.1-pro-high', owned_by: 'antigravity' },
      { id: 'gemini-3.1-pro-low', owned_by: 'antigravity' },
      { id: 'gemini-3.1-pro-preview', owned_by: 'antigravity' },
      { id: 'gemini-3.1-pro-preview-customtools', owned_by: 'antigravity' },
      { id: 'gemini-3-pro-preview', owned_by: 'antigravity' },
      { id: 'gemini-3-1-flash-preview-customtools', owned_by: 'antigravity' },
      { id: 'gemini-3-1-flash-preview', owned_by: 'antigravity' },
      { id: 'gpt-oss-120b-medium', owned_by: 'antigravity' },
    ];

    expect(findCatalogModel('agy', 'gemini-3.1-pro-preview')?.id).toBe('gemini-3.1-pro-high');

    const resolvedAgyModels = getResolvedCatalogModels(MODEL_CATALOGS.agy, availableModels);
    expect(resolvedAgyModels.find((model) => model.name === 'Gemini Pro High')?.id).toBe(
      'gemini-3.1-pro-high'
    );
    expect(resolvedAgyModels.find((model) => model.name === 'Gemini Pro Low')?.id).toBe(
      'gemini-3.1-pro-low'
    );
    expect(resolvedAgyModels.find((model) => model.name === 'Gemini Flash')?.id).toBe(
      'gemini-3-1-flash-preview'
    );
    expect(resolvedAgyModels.find((model) => model.name === 'Gemini Flash')?.presetMapping).toEqual(
      expect.objectContaining({
        opus: 'gemini-3.1-pro-high',
        sonnet: 'gemini-3.1-pro-high',
      })
    );

    const supplementalAgyModels = getSupplementalCatalogModels(
      'agy',
      MODEL_CATALOGS.agy,
      availableModels
    );
    expect(supplementalAgyModels.map((model) => model.id)).not.toContain('gpt-oss-120b-medium');
    expect(supplementalAgyModels.map((model) => model.id)).not.toContain('gemini-3-pro-preview');
    expect(supplementalAgyModels.map((model) => model.id)).not.toContain('gemini-3.1-pro-preview');
    expect(supplementalAgyModels.map((model) => model.id)).not.toContain('agy/gemini-3.1-pro-high');
    expect(supplementalAgyModels.map((model) => model.id)).not.toContain(
      'gemini-3-1-flash-preview-customtools'
    );
  });

  it('preserves newly advertised non-Antigravity models in the supplemental list', () => {
    const supplementalCodexModels = getSupplementalCatalogModels('codex', MODEL_CATALOGS.codex, [
      { id: 'gpt-5.9-codex', owned_by: 'openai' },
    ]);

    expect(supplementalCodexModels).toEqual([{ id: 'gpt-5.9-codex', owned_by: 'openai' }]);
  });

  it('does not silently swap Gemini Flash presets to flash-lite', () => {
    const availableModels = [{ id: 'gemini-3.1-flash-lite-preview', owned_by: 'google' }];

    expect(resolveCatalogModelId('gemini-3-flash-preview', availableModels)).toBe(
      'gemini-3-flash-preview'
    );
  });

  it('passes through non-Gemini model ids unchanged', () => {
    expect(resolveCatalogModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('falls back to the catalog id when no live model matches', () => {
    expect(resolveCatalogModelId('gemini-3.1-pro-preview', [])).toBe('gemini-3.1-pro-preview');
    expect(
      resolveCatalogModelId('gemini-3.1-pro-preview', [
        { id: 'gemini-2.5-pro', owned_by: 'google' },
      ])
    ).toBe('gemini-3.1-pro-preview');
  });
});
