import { describe, expect, it } from 'vitest';

import { MODEL_CATALOGS } from '@/lib/model-catalogs';

describe('GitHub Copilot model catalog defaults', () => {
  it('surfaces Claude Sonnet 5 as the default Copilot preset model', () => {
    const ghcpCatalog = MODEL_CATALOGS.ghcp;
    const sonnet5 = ghcpCatalog.models.find((model) => model.id === 'claude-sonnet-5');

    expect(ghcpCatalog.defaultModel).toBe('claude-sonnet-5');
    expect(sonnet5?.name).toBe('Claude Sonnet 5');
    expect(sonnet5?.extendedContext).toBe(true);
    expect(sonnet5?.presetMapping).toEqual({
      default: 'claude-sonnet-5',
      opus: 'claude-opus-5.5',
      sonnet: 'claude-sonnet-5',
      haiku: 'claude-haiku-4.5',
    });
  });

  it('advertises current Copilot models without retired recommendations', () => {
    const ids = MODEL_CATALOGS.ghcp.models.map((model) => model.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'claude-sonnet-5',
        'claude-opus-5.5',
        'claude-opus-4.8',
        'claude-opus-4.8-fast-mode',
        'claude-fable-5',
        'gpt-5.5',
        'gpt-5.4',
        'gpt-5.3-codex',
        'gemini-3.5-flash',
        'kimi-k2.7-code',
        'mai-code-1-flash',
        'raptor-mini',
      ])
    );
    expect(ids).not.toEqual(
      expect.arrayContaining(['claude-sonnet-4', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gemini-3-pro'])
    );
  });
});
