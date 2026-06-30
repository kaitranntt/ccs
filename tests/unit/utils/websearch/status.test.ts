import { describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as agyCli from '../../../../src/utils/websearch/agy';
import * as geminiCli from '../../../../src/utils/websearch/gemini-cli';
import * as grokCli from '../../../../src/utils/websearch/grok-cli';
import * as opencodeCli from '../../../../src/utils/websearch/opencode-cli';
import * as providerSecrets from '../../../../src/utils/websearch/provider-secrets';
import * as unifiedConfigLoader from '../../../../src/config/unified-config-loader';
import {
  buildWebSearchReadiness,
  getWebSearchCliProviders,
} from '../../../../src/utils/websearch/status';
import type { WebSearchCliInfo } from '../../../../src/utils/websearch/types';

function provider(
  overrides: Partial<WebSearchCliInfo> & Pick<WebSearchCliInfo, 'id' | 'name'>
): WebSearchCliInfo {
  return {
    id: overrides.id,
    kind: overrides.kind ?? 'backend',
    name: overrides.name,
    enabled: overrides.enabled ?? false,
    available: overrides.available ?? false,
    version: overrides.version ?? null,
    requiresApiKey: overrides.requiresApiKey ?? false,
    description: overrides.description ?? '',
    detail: overrides.detail ?? '',
    ...overrides,
  };
}

describe('websearch readiness', () => {
  it('is ready by default because DuckDuckGo is enabled', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: true,
        available: true,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('ready');
    expect(readiness.message).toContain('DuckDuckGo');
  });

  it('reports setup required when only Tavily is enabled without an API key', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'tavily',
        name: 'Tavily',
        enabled: true,
        available: false,
        requiresApiKey: true,
        apiKeyEnvVar: 'TAVILY_API_KEY',
        detail: 'Set TAVILY_API_KEY',
      }),
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: false,
        available: false,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('needs_setup');
    expect(readiness.message).toContain('Tavily');
    expect(readiness.message).toContain('TAVILY_API_KEY');
  });

  it('prefers API-backed readiness when Exa is enabled and configured', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'exa',
        name: 'Exa',
        enabled: true,
        available: true,
        requiresApiKey: true,
        apiKeyEnvVar: 'EXA_API_KEY',
        detail: 'API key detected (5 results)',
      }),
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: false,
        available: false,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('ready');
    expect(readiness.message).toContain('Exa');
  });

  it('treats SearXNG as ready when enabled with a valid URL', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'searxng',
        name: 'SearXNG',
        enabled: true,
        available: true,
        detail: 'Configured (5 results)',
      }),
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: false,
        available: false,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('ready');
    expect(readiness.message).toContain('SearXNG');
  });

  it('marks SearXNG as unavailable when config uses a query-bearing endpoint URL', () => {
    const getConfigSpy = spyOn(unifiedConfigLoader, 'getWebSearchConfig').mockReturnValue({
      enabled: true,
      providers: {
        exa: { enabled: false, max_results: 5 },
        tavily: { enabled: false, max_results: 5 },
        brave: { enabled: false, max_results: 5 },
        searxng: {
          enabled: true,
          url: 'https://search.example.com/search?format=json',
          max_results: 5,
        },
        duckduckgo: { enabled: false, max_results: 5 },
        gemini: { enabled: false },
        grok: { enabled: false },
        opencode: { enabled: false },
      },
    } as any);
    const apiKeySpy = spyOn(providerSecrets, 'getWebSearchApiKeyStates').mockReturnValue({
      exa: { envVar: 'EXA_API_KEY', configured: false, available: false, source: 'none' },
      tavily: { envVar: 'TAVILY_API_KEY', configured: false, available: false, source: 'none' },
      brave: { envVar: 'BRAVE_API_KEY', configured: false, available: false, source: 'none' },
    });
    const geminiStatusSpy = spyOn(geminiCli, 'getGeminiCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const geminiAuthSpy = spyOn(geminiCli, 'isGeminiAuthenticated').mockReturnValue(false);
    const grokStatusSpy = spyOn(grokCli, 'getGrokCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const opencodeStatusSpy = spyOn(opencodeCli, 'getOpenCodeCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const agyStatusSpy = spyOn(agyCli, 'getAgyCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);

    try {
      const providers = getWebSearchCliProviders();
      const searxng = providers.find((entry) => entry.id === 'searxng');

      expect(searxng?.enabled).toBe(true);
      expect(searxng?.available).toBe(false);
      expect(searxng?.detail).toContain('Set a valid SearXNG base URL');
    } finally {
      getConfigSpy.mockRestore();
      apiKeySpy.mockRestore();
      geminiStatusSpy.mockRestore();
      geminiAuthSpy.mockRestore();
      grokStatusSpy.mockRestore();
      opencodeStatusSpy.mockRestore();
      agyStatusSpy.mockRestore();
    }
  });

  it('marks SearXNG as unavailable when enabled with a blank URL', () => {
    const getConfigSpy = spyOn(unifiedConfigLoader, 'getWebSearchConfig').mockReturnValue({
      enabled: true,
      providers: {
        exa: { enabled: false, max_results: 5 },
        tavily: { enabled: false, max_results: 5 },
        brave: { enabled: false, max_results: 5 },
        searxng: {
          enabled: true,
          url: '',
          max_results: 5,
        },
        duckduckgo: { enabled: false, max_results: 5 },
        gemini: { enabled: false },
        grok: { enabled: false },
        opencode: { enabled: false },
      },
    } as any);
    const apiKeySpy = spyOn(providerSecrets, 'getWebSearchApiKeyStates').mockReturnValue({
      exa: { envVar: 'EXA_API_KEY', configured: false, available: false, source: 'none' },
      tavily: { envVar: 'TAVILY_API_KEY', configured: false, available: false, source: 'none' },
      brave: { envVar: 'BRAVE_API_KEY', configured: false, available: false, source: 'none' },
    });
    const geminiStatusSpy = spyOn(geminiCli, 'getGeminiCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const geminiAuthSpy = spyOn(geminiCli, 'isGeminiAuthenticated').mockReturnValue(false);
    const grokStatusSpy = spyOn(grokCli, 'getGrokCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const opencodeStatusSpy = spyOn(opencodeCli, 'getOpenCodeCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const agyStatusSpy = spyOn(agyCli, 'getAgyCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);

    try {
      const providers = getWebSearchCliProviders();
      const searxng = providers.find((entry) => entry.id === 'searxng');

      expect(searxng?.enabled).toBe(true);
      expect(searxng?.available).toBe(false);
      expect(searxng?.detail).toContain('Set a valid SearXNG base URL');
    } finally {
      getConfigSpy.mockRestore();
      apiKeySpy.mockRestore();
      geminiStatusSpy.mockRestore();
      geminiAuthSpy.mockRestore();
      grokStatusSpy.mockRestore();
      opencodeStatusSpy.mockRestore();
      agyStatusSpy.mockRestore();
    }
  });

  it('exposes Antigravity (agy) as a recommended CLI provider when enabled and installed', () => {
    const getConfigSpy = spyOn(unifiedConfigLoader, 'getWebSearchConfig').mockReturnValue({
      enabled: true,
      providers: {
        exa: { enabled: false, max_results: 5 },
        tavily: { enabled: false, max_results: 5 },
        brave: { enabled: false, max_results: 5 },
        searxng: { enabled: false, url: '', max_results: 5 },
        duckduckgo: { enabled: false, max_results: 5 },
        agy: { enabled: true, model: 'gemini-2.5-flash', timeout: 90 },
        gemini: { enabled: false },
        grok: { enabled: false },
        opencode: { enabled: false },
      },
    } as any);
    const apiKeySpy = spyOn(providerSecrets, 'getWebSearchApiKeyStates').mockReturnValue({
      exa: { envVar: 'EXA_API_KEY', configured: false, available: false, source: 'none' },
      tavily: { envVar: 'TAVILY_API_KEY', configured: false, available: false, source: 'none' },
      brave: { envVar: 'BRAVE_API_KEY', configured: false, available: false, source: 'none' },
    });
    const agyStatusSpy = spyOn(agyCli, 'getAgyCliStatus').mockReturnValue({
      installed: true,
      version: '1.0.13',
    } as any);
    const geminiStatusSpy = spyOn(geminiCli, 'getGeminiCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const geminiAuthSpy = spyOn(geminiCli, 'isGeminiAuthenticated').mockReturnValue(false);
    const grokStatusSpy = spyOn(grokCli, 'getGrokCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const opencodeStatusSpy = spyOn(opencodeCli, 'getOpenCodeCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);

    try {
      const providers = getWebSearchCliProviders();
      const agy = providers.find((entry) => entry.id === 'agy');

      expect(agy?.name).toBe('Antigravity CLI');
      expect(agy?.kind).toBe('legacy-cli');
      expect(agy?.command).toBe('agy');
      expect(agy?.enabled).toBe(true);
      expect(agy?.available).toBe(true);
      expect(agy?.requiresApiKey).toBe(false);
      expect(agy?.installCommand).toContain('antigravity.google');
      expect(agy?.detail).toContain('1.0.13');

      const readiness = buildWebSearchReadiness(true, providers);
      expect(readiness.readiness).toBe('ready');
      expect(readiness.message).toContain('Antigravity CLI');
    } finally {
      getConfigSpy.mockRestore();
      apiKeySpy.mockRestore();
      agyStatusSpy.mockRestore();
      geminiStatusSpy.mockRestore();
      geminiAuthSpy.mockRestore();
      grokStatusSpy.mockRestore();
      opencodeStatusSpy.mockRestore();
    }
  });

  it('treats cooled-down providers as temporarily unavailable in readiness status', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'websearch-status-cooldown-'));
    const statePath = join(tempHome, '.ccs', 'cache', 'websearch-provider-state.json');
    const originalCcsHome = process.env.CCS_HOME;

    mkdirSync(join(tempHome, '.ccs', 'cache'), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          cooldowns: {
            exa: {
              until: Date.now() + 10 * 60 * 1000,
              reason: 'quota_exhausted',
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );
    process.env.CCS_HOME = tempHome;

    const getConfigSpy = spyOn(unifiedConfigLoader, 'getWebSearchConfig').mockReturnValue({
      enabled: true,
      providers: {
        exa: { enabled: true, max_results: 5 },
        tavily: { enabled: false, max_results: 5 },
        brave: { enabled: false, max_results: 5 },
        searxng: { enabled: false, url: '', max_results: 5 },
        duckduckgo: { enabled: false, max_results: 5 },
        gemini: { enabled: false },
        grok: { enabled: false },
        opencode: { enabled: false },
      },
    } as any);
    const apiKeySpy = spyOn(providerSecrets, 'getWebSearchApiKeyStates').mockReturnValue({
      exa: {
        envVar: 'EXA_API_KEY',
        configured: true,
        available: true,
        source: 'process_env',
      },
      tavily: {
        envVar: 'TAVILY_API_KEY',
        configured: false,
        available: false,
        source: 'none',
      },
      brave: {
        envVar: 'BRAVE_API_KEY',
        configured: false,
        available: false,
        source: 'none',
      },
    });
    const geminiStatusSpy = spyOn(geminiCli, 'getGeminiCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const geminiAuthSpy = spyOn(geminiCli, 'isGeminiAuthenticated').mockReturnValue(false);
    const grokStatusSpy = spyOn(grokCli, 'getGrokCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const opencodeStatusSpy = spyOn(opencodeCli, 'getOpenCodeCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);
    const agyStatusSpy = spyOn(agyCli, 'getAgyCliStatus').mockReturnValue({
      installed: false,
      version: null,
    } as any);

    try {
      const providers = getWebSearchCliProviders();
      const exa = providers.find((provider) => provider.id === 'exa');

      expect(exa?.enabled).toBe(true);
      expect(exa?.available).toBe(false);
      expect(exa?.detail).toContain('Cooling down');
      expect(exa?.detail).toContain('quota exhaustion');

      const readiness = buildWebSearchReadiness(true, providers);
      expect(readiness.readiness).toBe('needs_setup');
      expect(readiness.message).toContain('Cooling down');
    } finally {
      getConfigSpy.mockRestore();
      apiKeySpy.mockRestore();
      geminiStatusSpy.mockRestore();
      geminiAuthSpy.mockRestore();
      grokStatusSpy.mockRestore();
      opencodeStatusSpy.mockRestore();
      agyStatusSpy.mockRestore();

      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
