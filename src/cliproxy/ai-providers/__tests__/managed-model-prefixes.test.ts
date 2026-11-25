import { afterEach, describe, expect, it, mock } from 'bun:test';
import { ensureManagedModelPrefixes } from '../managed-model-prefixes';

const originalFetch = global.fetch;

interface MockAuthFileRecord {
  account_type?: string;
  name: string;
  provider?: string;
  type?: string;
}

interface DownloadResponse {
  body: string;
  status?: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetchMock(options: {
  files: MockAuthFileRecord[];
  downloads?: Record<string, DownloadResponse | Error>;
  patchStatuses?: Record<string, number>;
}) {
  const requests: Array<{ url: string; method: string; body: string | undefined }> = [];

  global.fetch = mock((input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;

    requests.push({ url, method, body });

    if (url.endsWith('/v0/management/auth-files') && method === 'GET') {
      return Promise.resolve(jsonResponse({ files: options.files }));
    }

    if (url.includes('/v0/management/auth-files/download') && method === 'GET') {
      const name = new URL(url).searchParams.get('name');
      if (!name) {
        return Promise.reject(new Error(`Missing auth file name for ${url}`));
      }

      const response = options.downloads?.[name];
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      if (!response) {
        return Promise.resolve(textResponse('{}', 404));
      }

      return Promise.resolve(textResponse(response.body, response.status ?? 200));
    }

    if (url.endsWith('/v0/management/auth-files/fields') && method === 'PATCH') {
      const payload = JSON.parse(body ?? '{}') as { name?: string };
      const status = Number((payload.name && options.patchStatuses?.[payload.name]) ?? 200);
      return Promise.resolve(jsonResponse({ ok: status < 400 }, status));
    }

    return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`));
  }) as unknown as typeof fetch;

  return requests;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('ensureManagedModelPrefixes', () => {
  it('patches missing managed prefixes for matching oauth providers', async () => {
    const requests = installFetchMock({
      files: [
        { account_type: 'oauth', name: 'gemini-main', provider: 'gemini' },
        { account_type: 'oauth', name: 'agy-main', provider: 'antigravity' },
        { account_type: 'apikey', name: 'gemini-key', provider: 'gemini' },
      ],
      downloads: {
        'gemini-main': { body: JSON.stringify({ prefix: null, provider: 'gemini' }) },
        'agy-main': { body: JSON.stringify({ prefix: null, provider: 'antigravity' }) },
      },
    });

    const result = await ensureManagedModelPrefixes(['gemini']);

    expect(result).toEqual({ checked: 1, updated: 1 });

    const patchRequest = requests.find(
      (request) =>
        request.url.endsWith('/v0/management/auth-files/fields') && request.method === 'PATCH'
    );
    expect(patchRequest?.body).toBe(JSON.stringify({ name: 'gemini-main', prefix: 'gcli' }));

    const downloadedNames = requests
      .filter((request) => request.url.includes('/v0/management/auth-files/download'))
      .map((request) => new URL(request.url).searchParams.get('name'));
    expect(downloadedNames).toEqual(['gemini-main']);
  });

  it('returns immediately when called for providers without managed prefixes', async () => {
    const fetchMock = mock(() => Promise.reject(new Error('should not fetch')));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ensureManagedModelPrefixes(['codex']);

    expect(result).toEqual({ checked: 0, updated: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips files that already have the managed prefix or a different custom prefix', async () => {
    const requests = installFetchMock({
      files: [
        { account_type: 'oauth', name: 'gemini-managed', provider: 'gemini' },
        { account_type: 'oauth', name: 'gemini-custom', provider: 'gemini' },
      ],
      downloads: {
        'gemini-managed': { body: JSON.stringify({ prefix: 'gcli', provider: 'gemini' }) },
        'gemini-custom': { body: JSON.stringify({ prefix: 'team-a', provider: 'gemini' }) },
      },
    });

    const result = await ensureManagedModelPrefixes(['gemini']);

    expect(result).toEqual({ checked: 2, updated: 0 });
    expect(
      requests.some(
        (request) =>
          request.url.endsWith('/v0/management/auth-files/fields') && request.method === 'PATCH'
      )
    ).toBe(false);
  });

  it('skips patching when the downloaded auth file belongs to a different provider', async () => {
    const requests = installFetchMock({
      files: [{ account_type: 'oauth', name: 'gemini-shadowed', provider: 'gemini' }],
      downloads: {
        'gemini-shadowed': {
          body: JSON.stringify({ prefix: null, provider: 'antigravity' }),
        },
      },
    });

    const result = await ensureManagedModelPrefixes(['gemini']);

    expect(result).toEqual({ checked: 1, updated: 0 });
    expect(
      requests.some(
        (request) =>
          request.url.endsWith('/v0/management/auth-files/fields') && request.method === 'PATCH'
      )
    ).toBe(false);
  });

  it('swallows read and patch failures so later files can still be repaired', async () => {
    const requests = installFetchMock({
      files: [
        { account_type: 'oauth', name: 'gemini-unreadable', provider: 'gemini' },
        { account_type: 'oauth', name: 'gemini-patch-fails', provider: 'gemini' },
        { account_type: 'oauth', name: 'gemini-success', provider: 'gemini' },
      ],
      downloads: {
        'gemini-unreadable': new Error('network down'),
        'gemini-patch-fails': { body: JSON.stringify({ prefix: null, provider: 'gemini' }) },
        'gemini-success': { body: JSON.stringify({ prefix: null, provider: 'gemini' }) },
      },
      patchStatuses: {
        'gemini-patch-fails': 500,
      },
    });

    const result = await ensureManagedModelPrefixes(['gemini']);

    expect(result).toEqual({ checked: 3, updated: 1 });

    const patchPayloads = requests
      .filter(
        (request) =>
          request.url.endsWith('/v0/management/auth-files/fields') && request.method === 'PATCH'
      )
      .map((request) => request.body);
    expect(patchPayloads).toEqual([
      JSON.stringify({ name: 'gemini-patch-fails', prefix: 'gcli' }),
      JSON.stringify({ name: 'gemini-success', prefix: 'gcli' }),
    ]);
  });
});
