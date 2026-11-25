import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AllProviders } from '../../setup/test-utils';
import { useDroid } from '@/hooks/use-droid';
import { ApiConflictError } from '@/lib/api-client';

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const wrapper = ({ children }: { children: ReactNode }) => <AllProviders>{children}</AllProviders>;

describe('useDroid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches diagnostics and raw settings, updates cached settings on save, and surfaces conflicts/errors', async () => {
    let saveMode: 'ok' | 'conflict' | 'error' = 'ok';

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/api/droid/diagnostics')) {
        return Promise.resolve(
          createJsonResponse({
            binary: {
              installed: true,
              path: '/usr/local/bin/droid',
              installDir: '/usr/local/bin',
              source: 'PATH',
              version: '0.5.0',
              overridePath: null,
            },
            files: {
              settings: {
                label: 'settings.json',
                path: '~/.factory/settings.json',
                resolvedPath: '/tmp/.factory/settings.json',
                exists: true,
                isSymlink: false,
                isRegularFile: true,
                sizeBytes: 42,
                mtimeMs: 100,
                parseError: null,
                readError: null,
              },
              legacyConfig: {
                label: 'config.json',
                path: '~/.factory/config.json',
                resolvedPath: '/tmp/.factory/config.json',
                exists: false,
                isSymlink: false,
                isRegularFile: false,
                sizeBytes: null,
                mtimeMs: null,
                parseError: null,
                readError: null,
              },
            },
            byok: {
              activeModelSelector: null,
              customModelCount: 0,
              ccsManagedCount: 0,
              userManagedCount: 0,
              invalidModelEntryCount: 0,
              providerBreakdown: {},
              customModels: [],
            },
            warnings: [],
            docsReference: {
              providerValues: [],
              settingsHierarchy: [],
              notes: [],
              links: [],
              providerDocs: [],
            },
          })
        );
      }

      if (url.endsWith('/api/droid/settings/raw') && method === 'GET') {
        return Promise.resolve(
          createJsonResponse({
            path: '~/.factory/settings.json',
            resolvedPath: '/tmp/.factory/settings.json',
            exists: true,
            mtime: 100,
            rawText: '{"customModels":[]}',
            settings: { customModels: [] },
            parseError: null,
          })
        );
      }

      if (url.endsWith('/api/droid/settings/raw') && method === 'PUT') {
        if (saveMode === 'conflict') {
          return Promise.resolve(createJsonResponse({ error: 'Conflict' }, 409));
        }
        if (saveMode === 'error') {
          return Promise.resolve(createJsonResponse({ error: 'Invalid settings payload' }, 400));
        }
        return Promise.resolve(createJsonResponse({ success: true, mtime: 200 }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDroid(), { wrapper });

    await waitFor(() => expect(result.current.diagnostics?.binary.installed).toBe(true));
    await waitFor(() => expect(result.current.rawSettings?.mtime).toBe(100));

    // Save valid JSON object -> updates cache with parsed object
    await act(async () => {
      const saved = await result.current.saveRawSettingsAsync({
        rawText: '{"customModels":[{"model":"gpt-5"}]}',
        expectedMtime: 100,
      });
      expect(saved.mtime).toBe(200);
    });
    await waitFor(() =>
      expect(result.current.rawSettings?.settings).toEqual({ customModels: [{ model: 'gpt-5' }] })
    );
    expect(result.current.rawSettings?.parseError).toBeNull();

    // Save non-object JSON -> sets parseError in cache
    await act(async () => {
      await result.current.saveRawSettingsAsync({
        rawText: '[]',
        expectedMtime: 200,
      });
    });
    await waitFor(() =>
      expect(result.current.rawSettings?.parseError).toBe('JSON root must be an object.')
    );
    expect(result.current.rawSettings?.settings).toBeNull();

    // Save malformed JSON -> sets SyntaxError message in cache
    await act(async () => {
      await result.current.saveRawSettingsAsync({
        rawText: '{bad',
        expectedMtime: 200,
      });
    });
    await waitFor(() => expect(result.current.rawSettings?.parseError).toBeTruthy());
    expect(result.current.rawSettings?.settings).toBeNull();

    saveMode = 'conflict';
    await expect(
      result.current.saveRawSettingsAsync({ rawText: '{}', expectedMtime: 200 })
    ).rejects.toBeInstanceOf(ApiConflictError);

    saveMode = 'error';
    await expect(
      result.current.saveRawSettingsAsync({ rawText: '{}', expectedMtime: 200 })
    ).rejects.toThrow('Invalid settings payload');
  });

  it('surfaces fetch errors on diagnostics and raw settings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(createJsonResponse({ error: 'Down' }, 500)))
    );

    const { result } = renderHook(() => useDroid(), { wrapper });

    await waitFor(() => expect(result.current.diagnosticsError).toBeInstanceOf(Error));
    await waitFor(() => expect(result.current.rawSettingsError).toBeInstanceOf(Error));
  });
});
