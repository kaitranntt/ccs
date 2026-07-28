import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllProviders } from '../../../../setup/test-utils';
import { useProviderEditor } from '@/components/cliproxy/provider-editor/use-provider-editor';

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const wrapper = ({ children }: { children: ReactNode }) => <AllProviders>{children}</AllProviders>;

describe('useProviderEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('derives extended-context state from all Anthropic model env keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/settings/claude/raw')) {
          return Promise.resolve(
            createJsonResponse({
              profile: 'claude',
              settings: {
                env: {
                  ANTHROPIC_MODEL: 'claude-sonnet-4-6',
                  ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6[1m]',
                  ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
                  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
                },
              },
              mtime: 1,
              path: '~/.ccs/profiles/claude/settings.json',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useProviderEditor('claude'), { wrapper });

    await waitFor(() => expect(result.current.currentModel).toBe('claude-sonnet-4-6'));
    expect(result.current.extendedContextEnabled).toBe(true);
  });

  it('applies [1m] across compatible Claude mappings and leaves Haiku plain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/settings/claude/raw')) {
          return Promise.resolve(
            createJsonResponse({
              profile: 'claude',
              settings: {
                env: {
                  ANTHROPIC_MODEL: 'claude-sonnet-4-6',
                  ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6',
                  ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
                  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
                },
              },
              mtime: 1,
              path: '~/.ccs/profiles/claude/settings.json',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useProviderEditor('claude'), { wrapper });

    await waitFor(() => expect(result.current.currentModel).toBe('claude-sonnet-4-6'));

    act(() => {
      result.current.toggleExtendedContext(true);
    });

    const nextSettings = JSON.parse(result.current.rawJsonContent);
    expect(nextSettings.env).toMatchObject({
      ANTHROPIC_MODEL: 'claude-sonnet-4-6[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6[1m]',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6[1m]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    });
  });

  it('preserves explicit long-context intent when preset-style updates replace mappings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/settings/claude/raw')) {
          return Promise.resolve(
            createJsonResponse({
              profile: 'claude',
              settings: {
                env: {
                  ANTHROPIC_MODEL: 'claude-sonnet-4-6[1m]',
                  ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6[1m]',
                  ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6[1m]',
                  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
                },
              },
              mtime: 1,
              path: '~/.ccs/profiles/claude/settings.json',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useProviderEditor('claude'), { wrapper });

    await waitFor(() => expect(result.current.extendedContextEnabled).toBe(true));

    act(() => {
      result.current.updateEnvValues({
        ANTHROPIC_MODEL: 'claude-opus-4-6',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
      });
    });

    const nextSettings = JSON.parse(result.current.rawJsonContent);
    expect(nextSettings.env).toMatchObject({
      ANTHROPIC_MODEL: 'claude-opus-4-6[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6[1m]',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6[1m]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    });
  });

  it('derives fableModel and round-trips ANTHROPIC_DEFAULT_FABLE_MODEL updates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/settings/codex/raw')) {
          return Promise.resolve(
            createJsonResponse({
              profile: 'codex',
              settings: {
                env: {
                  ANTHROPIC_MODEL: 'gpt-5.3-codex-high',
                  ANTHROPIC_DEFAULT_FABLE_MODEL: 'gpt-5.6-sol-xhigh',
                },
              },
              mtime: 1,
              path: '~/.ccs/codex.settings.json',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useProviderEditor('codex'), { wrapper });

    await waitFor(() => expect(result.current.fableModel).toBe('gpt-5.6-sol-xhigh'));

    act(() => {
      result.current.updateEnvValue('ANTHROPIC_DEFAULT_FABLE_MODEL', 'gpt-5.6-sol-max');
    });

    const nextSettings = JSON.parse(result.current.rawJsonContent);
    expect(nextSettings.env.ANTHROPIC_DEFAULT_FABLE_MODEL).toBe('gpt-5.6-sol-max');
  });

  it('preserves explicit codex effort suffixes in editor state updates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/settings/codex/raw')) {
          return Promise.resolve(
            createJsonResponse({
              profile: 'codex',
              settings: {
                env: {
                  ANTHROPIC_MODEL: 'gpt-5.3-codex-high',
                  ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
                  ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
                  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.4-mini-medium',
                },
              },
              mtime: 1,
              path: '~/.ccs/codex.settings.json',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useProviderEditor('codex'), { wrapper });

    await waitFor(() => expect(result.current.currentModel).toBe('gpt-5.3-codex-high'));

    act(() => {
      result.current.updateEnvValue('ANTHROPIC_MODEL', 'gpt-5.3-codex-xhigh');
    });

    const nextSettings = JSON.parse(result.current.rawJsonContent);
    expect(nextSettings.env).toMatchObject({
      ANTHROPIC_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.4-mini-medium',
    });
  });
});
