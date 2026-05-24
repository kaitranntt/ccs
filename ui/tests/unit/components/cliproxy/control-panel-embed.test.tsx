import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../../../setup/test-utils';
import { ControlPanelEmbed } from '@/components/cliproxy/control-panel-embed';

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }

  return String(input);
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

describe('ControlPanelEmbed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('waits for the real local management secret before rendering the iframe', async () => {
    const tokenRequest = createDeferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = getRequestUrl(input);

      if (url.endsWith('/api/cliproxy-server')) {
        return Promise.resolve(
          createJsonResponse({
            remote: {
              enabled: false,
              host: '',
              protocol: 'http',
              auth_token: '',
            },
            fallback: {
              enabled: true,
              auto_start: false,
            },
            local: {
              port: 8317,
              auto_start: true,
            },
          })
        );
      }

      if (url.endsWith('/api/settings/auth/tokens/raw')) {
        return tokenRequest.promise;
      }

      if (url.endsWith('/api/cliproxy-local/')) {
        return Promise.resolve(new Response('ok', { status: 200 }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<ControlPanelEmbed />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/settings/auth/tokens/raw');
    });

    expect(screen.queryByTitle('CLIProxy Management Panel')).toBeNull();

    tokenRequest.resolve(
      createJsonResponse({
        apiKey: { value: 'ccs-internal-managed', isCustom: false },
        managementSecret: { value: 'custom-secret', isCustom: true },
      })
    );

    const iframe = await screen.findByTitle('CLIProxy Management Panel');

    expect(iframe).toHaveAttribute('src', '/api/cliproxy-local/management.html');
    fireEvent.load(iframe);

    await waitFor(() => {
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('cli-proxy-auth');
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'apiBase',
        'http://localhost:3000/api/cliproxy-local'
      );
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'apiUrl',
        'http://localhost:3000/api/cliproxy-local'
      );
      expect(window.localStorage.setItem).toHaveBeenCalledWith('managementKey', 'custom-secret');
      expect(window.localStorage.setItem).toHaveBeenCalledWith('isLoggedIn', 'true');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('managementKey');
    });

    vi.clearAllMocks();
    unmount();

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('cli-proxy-auth');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('apiBase');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('apiUrl');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('managementKey');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('isLoggedIn');
  });

  it('clears stale local control-panel session keys when token bootstrap fails', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = getRequestUrl(input);

      if (url.endsWith('/api/cliproxy-server')) {
        return Promise.resolve(
          createJsonResponse({
            remote: {
              enabled: false,
              host: '',
              protocol: 'http',
              auth_token: '',
            },
            fallback: {
              enabled: true,
              auto_start: false,
            },
            local: {
              port: 8317,
              auto_start: true,
            },
          })
        );
      }

      if (url.endsWith('/api/settings/auth/tokens/raw')) {
        return Promise.reject(new Error('token bootstrap failed'));
      }

      if (url.endsWith('/api/cliproxy-local/')) {
        return Promise.resolve(new Response('ok', { status: 200 }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<ControlPanelEmbed />);

    await screen.findByTitle('CLIProxy Management Panel');

    await waitFor(() => {
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('cli-proxy-auth');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('apiBase');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('apiUrl');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('managementKey');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('isLoggedIn');
    });
  });

  it('preserves remote postMessage bootstrap for remote iframes', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = getRequestUrl(input);

      if (url.endsWith('/api/cliproxy-server')) {
        return Promise.resolve(
          createJsonResponse({
            remote: {
              enabled: true,
              host: 'remote.example.com',
              protocol: 'https',
              auth_token: 'remote-secret',
              port: 443,
            },
            fallback: {
              enabled: true,
              auto_start: false,
            },
            local: {
              port: 8317,
              auto_start: true,
            },
          })
        );
      }

      if (url.endsWith('/api/cliproxy-server/test')) {
        return Promise.resolve(createJsonResponse({ reachable: true }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<ControlPanelEmbed />);

    const iframe = await screen.findByTitle('CLIProxy Management Panel');
    expect(iframe).toHaveAttribute('src', 'https://remote.example.com/management.html');

    const postMessage = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    fireEvent.load(iframe);

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'ccs-auto-login',
        apiBase: 'https://remote.example.com',
        managementKey: 'remote-secret',
      },
      'https://remote.example.com'
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/api/settings/auth/tokens/raw');
  });
});
