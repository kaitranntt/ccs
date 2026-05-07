import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { AllProviders } from '../../setup/test-utils';
import { useCliproxyAuthFlow } from '@/hooks/use-cliproxy-auth-flow';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AllProviders>{children}</AllProviders>
);

describe('useCliproxyAuthFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes Cursor through start-url browser polling by default', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/cursor/start-url')) {
        return Promise.resolve(
          createJsonResponse({
            success: true,
            authUrl: 'https://cursor.com/loginDeepControl?state=cursor-state',
            state: 'cursor-state',
          })
        );
      }

      if (url.includes('/status?state=cursor-state')) {
        return Promise.resolve(createJsonResponse({ status: 'wait' }));
      }

      return Promise.resolve(createJsonResponse({ success: true, account: { id: 'cursor-test' } }));
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('cursor');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cliproxy/auth/cursor/start-url',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.current.isDeviceCodeFlow).toBe(false);
    expect(result.current.authUrl).toContain('cursor.com/loginDeepControl');
    expect(window.open).toHaveBeenCalledWith(
      'https://cursor.com/loginDeepControl?state=cursor-state',
      '_blank'
    );
  });

  it('ignores stale poll completions from a superseded auth attempt', async () => {
    const firstPoll = createDeferred<Response>();
    let startCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/start-url')) {
          startCount += 1;
          return Promise.resolve(
            createJsonResponse({
              success: true,
              authUrl: `https://auth.example/${startCount}`,
              state: `state-${startCount}`,
            })
          );
        }

        if (url.includes('/status?state=state-1')) {
          return firstPoll.promise;
        }

        if (url.includes('/status?state=state-2')) {
          return Promise.resolve(createJsonResponse({ status: 'wait' }));
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('gemini', { startEndpoint: 'start-url' });
    });

    expect(result.current.oauthState).toBe('state-1');

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.startAuth('gemini', { startEndpoint: 'start-url' });
    });

    expect(result.current.oauthState).toBe('state-2');
    expect(result.current.isAuthenticating).toBe(true);

    await act(async () => {
      firstPoll.resolve(createJsonResponse({ status: 'ok' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.oauthState).toBe('state-2');
    expect(result.current.isAuthenticating).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('surfaces repeated poll transport failures instead of retrying forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/start-url')) {
          return Promise.resolve(
            createJsonResponse({
              success: true,
              authUrl: 'https://auth.example/fail',
              state: 'state-fail',
            })
          );
        }

        if (url.includes('/status?state=state-fail')) {
          return Promise.reject(new Error('poll failed'));
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('gemini', { startEndpoint: 'start-url' });
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(result.current.error).toBe('poll failed');
    expect(result.current.isAuthenticating).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('poll failed');
  });

  it('keeps polling through wait responses until a later ok response includes the account', async () => {
    let pollCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/start-url')) {
          return Promise.resolve(
            createJsonResponse({
              success: true,
              authUrl: 'https://auth.example/wait-ok',
              state: 'state-wait-ok',
            })
          );
        }

        if (url.includes('/status?state=state-wait-ok')) {
          pollCount += 1;
          if (pollCount === 1) {
            return Promise.resolve(createJsonResponse({ status: 'wait' }));
          }

          return Promise.resolve(
            createJsonResponse({
              status: 'ok',
              account: {
                id: 'delayed@example.com',
                email: 'delayed@example.com',
                nickname: 'delayed',
                provider: 'codex',
                isDefault: true,
              },
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('codex', { startEndpoint: 'start-url' });
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isAuthenticating).toBe(true);
    expect(result.current.oauthState).toBe('state-wait-ok');
    expect(result.current.error).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isAuthenticating).toBe(false);
    expect(result.current.oauthState).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('codex authentication successful');
  });

  it('promotes a state-first auth bootstrap into an immediate auth URL without waiting for the first interval', async () => {
    let pollCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/start-url')) {
          return Promise.resolve(
            createJsonResponse({
              success: true,
              authUrl: null,
              state: 'state-kiro-social',
            })
          );
        }

        if (url.includes('/status?state=state-kiro-social')) {
          pollCount += 1;
          return Promise.resolve(
            createJsonResponse({
              status: 'auth_url',
              url: 'https://auth.example/kiro-social',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('kiro', { startEndpoint: 'start-url', kiroMethod: 'google' });
    });

    expect(result.current.authUrl).toBe('https://auth.example/kiro-social');
    expect(result.current.oauthState).toBe('state-kiro-social');
    expect(result.current.isAuthenticating).toBe(true);
    expect(pollCount).toBe(1);
  });

  it('forwards Kiro IDC options to the backend start endpoint payload', async () => {
    let requestBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes('/start')) {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return createJsonResponse({
            success: true,
            account: {
              id: 'kiro-idc-account',
              provider: 'kiro',
            },
          });
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('kiro', {
        startEndpoint: 'start',
        flowType: 'authorization_code',
        kiroMethod: 'idc',
        kiroIDCStartUrl: 'https://d-123.awsapps.com/start',
        kiroIDCRegion: 'ca-central-1',
        kiroIDCFlow: 'authcode',
      });
    });

    expect(requestBody).toEqual({
      nickname: undefined,
      kiroMethod: 'idc',
      kiroIDCStartUrl: 'https://d-123.awsapps.com/start',
      kiroIDCRegion: 'ca-central-1',
      kiroIDCFlow: 'authcode',
      gitlabAuthMode: undefined,
      gitlabBaseUrl: undefined,
      gitlabPersonalAccessToken: undefined,
      riskAcknowledgement: undefined,
    });
  });

  it('forwards GitLab PAT options to the backend start endpoint payload', async () => {
    let requestBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes('/start')) {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return createJsonResponse({
            success: true,
            account: {
              id: 'gitlab-account',
              provider: 'gitlab',
            },
          });
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('gitlab', {
        startEndpoint: 'start',
        gitlabAuthMode: 'pat',
        gitlabBaseUrl: 'https://gitlab.example.com',
        gitlabPersonalAccessToken: 'glpat-test-token',
      });
    });

    expect(requestBody).toEqual({
      nickname: undefined,
      kiroMethod: undefined,
      kiroIDCStartUrl: undefined,
      kiroIDCRegion: undefined,
      kiroIDCFlow: undefined,
      gitlabAuthMode: 'pat',
      gitlabBaseUrl: 'https://gitlab.example.com',
      gitlabPersonalAccessToken: 'glpat-test-token',
      riskAcknowledgement: undefined,
    });
  });

  it('treats callback responses without an account as failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/start-url')) {
          return Promise.resolve(
            createJsonResponse({
              success: true,
              authUrl: 'https://auth.example/callback',
              state: 'state-callback',
            })
          );
        }

        if (url.includes('/submit-callback')) {
          return Promise.resolve(createJsonResponse({ success: true, account: null }));
        }

        if (url.includes('/status?state=state-callback')) {
          return Promise.resolve(createJsonResponse({ status: 'wait' }));
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('gemini', { startEndpoint: 'start-url' });
    });

    await act(async () => {
      await result.current.submitCallback(
        'http://localhost/callback?code=abc123&state=state-callback'
      );
    });

    expect(result.current.error).toBe('Authenticated account could not be registered');
    expect(result.current.isSubmittingCallback).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Authenticated account could not be registered');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps auth active when callback submission returns wait and only errors on the terminal poll', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/start-url')) {
          return Promise.resolve(
            createJsonResponse({
              success: true,
              authUrl: 'https://auth.example/callback-wait',
              state: 'state-callback-wait',
            })
          );
        }

        if (url.includes('/submit-callback')) {
          return Promise.resolve(createJsonResponse({ status: 'wait' }));
        }

        if (url.includes('/status?state=state-callback-wait')) {
          return Promise.resolve(
            createJsonResponse({
              status: 'error',
              error:
                'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('codex', { startEndpoint: 'start-url' });
    });

    await act(async () => {
      await result.current.submitCallback(
        'http://localhost/callback?code=abc123&state=state-callback-wait'
      );
    });

    expect(result.current.isSubmittingCallback).toBe(false);
    expect(result.current.isAuthenticating).toBe(true);
    expect(result.current.error).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isAuthenticating).toBe(false);
    expect(result.current.error).toBe(
      'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.'
    );
    expect(toast.error).toHaveBeenCalledWith(
      'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.'
    );
  });

  it('treats status ok responses without an account as failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/start-url')) {
          return Promise.resolve(
            createJsonResponse({
              success: true,
              authUrl: 'https://auth.example/status-only',
              state: 'state-status-only',
            })
          );
        }

        if (url.includes('/status?state=state-status-only')) {
          return Promise.resolve(createJsonResponse({ status: 'ok' }));
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useCliproxyAuthFlow(), { wrapper });

    await act(async () => {
      await result.current.startAuth('codex', { startEndpoint: 'start-url' });
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe('Authenticated account could not be registered');
    expect(result.current.isAuthenticating).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Authenticated account could not be registered');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
