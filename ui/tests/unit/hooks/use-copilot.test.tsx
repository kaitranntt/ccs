import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AllProviders } from '../../setup/test-utils';
import { useCopilot } from '@/hooks/use-copilot';
import { ApiConflictError } from '@/lib/api-client';

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const wrapper = ({ children }: { children: ReactNode }) => <AllProviders>{children}</AllProviders>;

describe('useCopilot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads copilot queries and executes config, raw settings, auth, daemon, and install mutations', async () => {
    let rawSettingsStatus = 200;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/api/copilot/status')) {
        return Promise.resolve(
          createJsonResponse({
            enabled: true,
            installed: true,
            version: '1.2.3',
            authenticated: true,
            daemon_running: false,
            port: 4141,
            model: 'claude-sonnet-4',
            account_type: 'individual',
            auto_start: false,
            rate_limit: null,
            wait_on_limit: false,
          })
        );
      }

      if (url.endsWith('/api/copilot/config') && method === 'GET') {
        return Promise.resolve(
          createJsonResponse({
            enabled: true,
            auto_start: false,
            port: 4141,
            account_type: 'individual',
            rate_limit: null,
            wait_on_limit: false,
            model: 'claude-sonnet-4',
          })
        );
      }

      if (url.endsWith('/api/copilot/config') && method === 'PUT') {
        return Promise.resolve(
          createJsonResponse({
            success: true,
            copilot: {
              enabled: true,
              auto_start: true,
              port: 4141,
              account_type: 'individual',
              rate_limit: null,
              wait_on_limit: false,
              model: 'claude-sonnet-4',
            },
          })
        );
      }

      if (url.endsWith('/api/copilot/models')) {
        return Promise.resolve(
          createJsonResponse({
            models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic' }],
            current: 'claude-sonnet-4',
          })
        );
      }

      if (url.endsWith('/api/copilot/settings/raw') && method === 'GET') {
        return Promise.resolve(
          createJsonResponse({
            settings: { env: { ANTHROPIC_MODEL: 'claude-sonnet-4' } },
            mtime: 100,
            path: '/tmp/copilot.settings.json',
            exists: true,
          })
        );
      }

      if (url.endsWith('/api/copilot/settings/raw') && method === 'PUT') {
        if (rawSettingsStatus === 409) {
          return Promise.resolve(createJsonResponse({ error: 'Conflict' }, 409));
        }
        if (rawSettingsStatus >= 400) {
          return Promise.resolve(createJsonResponse({ error: 'Failed' }, rawSettingsStatus));
        }
        return Promise.resolve(createJsonResponse({ success: true, mtime: 200 }));
      }

      if (url.endsWith('/api/copilot/info')) {
        return Promise.resolve(
          createJsonResponse({
            installed: true,
            version: '1.2.3',
            path: '/usr/local/bin/copilot-api',
            pinnedVersion: null,
          })
        );
      }

      if (url.endsWith('/api/copilot/auth/start') && method === 'POST') {
        return Promise.resolve(
          createJsonResponse({
            success: true,
            deviceCode: 'ABCD-1234',
            verificationUrl: 'https://github.com/login/device',
          })
        );
      }

      if (url.endsWith('/api/copilot/daemon/start') && method === 'POST') {
        return Promise.resolve(createJsonResponse({ success: true, pid: 9999 }));
      }

      if (url.endsWith('/api/copilot/daemon/stop') && method === 'POST') {
        return Promise.resolve(createJsonResponse({ success: true }));
      }

      if (url.endsWith('/api/copilot/install') && method === 'POST') {
        return Promise.resolve(
          createJsonResponse({
            success: true,
            installed: true,
            version: '1.3.0',
            path: '/usr/local/bin/copilot-api',
          })
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCopilot(), { wrapper });

    await waitFor(() => expect(result.current.status?.installed).toBe(true));
    await waitFor(() => expect(result.current.models).toHaveLength(1));
    await waitFor(() => expect(result.current.info?.version).toBe('1.2.3'));
    await waitFor(() => expect(result.current.rawSettings?.mtime).toBe(100));

    await act(async () => {
      const updated = await result.current.updateConfigAsync({ auto_start: true });
      expect(updated.success).toBe(true);

      const saved = await result.current.saveRawSettingsAsync({
        settings: { env: { ANTHROPIC_MODEL: 'claude-opus-4' } },
        expectedMtime: 100,
      });
      expect(saved.mtime).toBe(200);

      const auth = await result.current.startAuthAsync();
      expect(auth.deviceCode).toBe('ABCD-1234');

      result.current.startDaemon();
      result.current.stopDaemon();

      const installed = await result.current.installAsync('1.3.0');
      expect(installed.version).toBe('1.3.0');
    });

    rawSettingsStatus = 409;
    await expect(
      result.current.saveRawSettingsAsync({
        settings: { env: {} },
        expectedMtime: 100,
      })
    ).rejects.toBeInstanceOf(ApiConflictError);

    rawSettingsStatus = 500;
    await expect(
      result.current.saveRawSettingsAsync({
        settings: { env: {} },
        expectedMtime: 100,
      })
    ).rejects.toThrow('Failed to save copilot raw settings');
  });

  it('surfaces non-OK errors across copilot queries and mutations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(createJsonResponse({ error: 'Server error' }, 500)))
    );

    const { result } = renderHook(() => useCopilot(), { wrapper });

    await waitFor(() => expect(result.current.statusError).toBeInstanceOf(Error));
    await expect(result.current.updateConfigAsync({ enabled: false })).rejects.toThrow(
      'Failed to update copilot config'
    );
    await expect(result.current.startAuthAsync()).rejects.toThrow('Failed to start auth');
    await expect(result.current.installAsync()).rejects.toThrow('Failed to install copilot-api');
  });
});
