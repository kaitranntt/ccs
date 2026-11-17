import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, userEvent } from '@tests/setup/test-utils';
import WebSearchSection from '@/pages/settings/sections/websearch';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('WebSearchSection', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    let config = {
      enabled: true,
      providers: {
        exa: { enabled: true, max_results: 5 },
        tavily: { enabled: false, max_results: 5 },
        keenable: { enabled: false, max_results: 5 },
        brave: { enabled: false, max_results: 5 },
        duckduckgo: { enabled: false, max_results: 5 },
        gemini: { enabled: false, model: 'gemini-2.5-flash', timeout: 55 },
        grok: { enabled: false, timeout: 55 },
        opencode: { enabled: false, model: 'opencode/grok-code', timeout: 60 },
      },
      apiKeys: {
        exa: {
          envVar: 'EXA_API_KEY',
          configured: false,
          available: false,
          source: 'none',
        },
      },
    };

    let status = {
      providers: [
        {
          id: 'exa',
          kind: 'backend',
          name: 'Exa',
          enabled: true,
          available: false,
          version: null,
          requiresApiKey: true,
          apiKeyEnvVar: 'EXA_API_KEY',
          description: 'API-backed search with strong relevance and content extraction.',
          detail: 'Set EXA_API_KEY',
        },
      ],
      readiness: {
        status: 'needs_setup',
        message: 'Exa: Set EXA_API_KEY',
      },
    };

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url === '/api/websearch' && method === 'GET') {
        return jsonResponse(config);
      }

      if (url === '/api/websearch/status' && method === 'GET') {
        return jsonResponse(status);
      }

      if (url === '/api/config/raw' && method === 'GET') {
        return new Response('websearch:\n  enabled: true\n');
      }

      if (url === '/api/websearch' && method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          enabled?: boolean;
          providers?: typeof config.providers;
          apiKeys?: { exa?: string | null };
        };

        config = {
          ...config,
          enabled: body.enabled ?? config.enabled,
          providers: body.providers ?? config.providers,
          apiKeys: body.apiKeys?.exa
            ? {
                ...config.apiKeys,
                exa: {
                  envVar: 'EXA_API_KEY',
                  configured: true,
                  available: true,
                  source: 'global_env',
                  maskedValue: 'exa-************5678',
                },
              }
            : config.apiKeys,
        };

        status = {
          providers: [
            {
              ...status.providers[0],
              enabled: config.providers.exa.enabled,
              available: true,
              detail: 'API key detected (5 results)',
            },
          ],
          readiness: {
            status: 'ready',
            message: 'Ready (Exa)',
          },
        };

        return jsonResponse({ websearch: config });
      }

      return jsonResponse({ error: `Unhandled request: ${method} ${url}` }, 500);
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves an Exa API key from the WebSearch card', async () => {
    render(<WebSearchSection />, { withSettingsProvider: true });

    const input = await screen.findByPlaceholderText('Paste EXA_API_KEY');
    await userEvent.type(input, 'exa-secret-12345678');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/websearch',
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/websearch' && (init as RequestInit | undefined)?.method === 'PUT'
    );
    expect(putCall).toBeDefined();

    const requestBody = JSON.parse(String((putCall?.[1] as RequestInit | undefined)?.body ?? '{}'));
    expect(requestBody.apiKeys).toMatchObject({
      exa: 'exa-secret-12345678',
    });

    await screen.findByText('Stored in dashboard');
    expect(await screen.findByText('Ready')).toBeInTheDocument();
  });
});
