/**
 * Mock Fetch Utilities
 *
 * Intercept global fetch() for testing without network operations.
 * Uses Bun's native spyOn for reliable mocking.
 */

import { spyOn, type Mock } from 'bun:test';
import type { MockFetchHandler, CapturedRequest } from './types';

/** Store for original fetch and mock state */
let originalFetch: typeof fetch | null = null;
let mockInstance: Mock<typeof fetch> | null = null;
let capturedRequests: CapturedRequest[] = [];

/**
 * Install mock fetch handlers
 *
 * @example
 * beforeEach(() => {
 *   mockFetch([
 *     { url: /\/health/, response: { ok: true } },
 *     { url: /\/upload/, response: { id: '123' }, status: 201 },
 *   ]);
 * });
 *
 * afterEach(() => restoreFetch());
 */
export function mockFetch(handlers: MockFetchHandler[]): void {
  // Restore previous mock if exists (prevents spy leak on double-call)
  if (mockInstance) {
    mockInstance.mockRestore();
    mockInstance = null;
  }

  // Store original if not already stored
  if (!originalFetch) {
    originalFetch = globalThis.fetch;
  }

  // Clear previous captures
  capturedRequests = [];

  // Create mock implementation
  mockInstance = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';

    // Capture request
    const captured: CapturedRequest = {
      url,
      method,
      headers: {},
      body: null,
    };

    // Extract headers
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          captured.headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          captured.headers[key] = value;
        }
      } else {
        captured.headers = { ...init.headers } as Record<string, string>;
      }
    }

    // Extract body with type differentiation
    if (init?.body) {
      if (typeof init.body === 'string') {
        captured.body = init.body;
      } else if (init.body instanceof FormData) {
        captured.body = '[FormData]';
      } else if (init.body instanceof URLSearchParams) {
        captured.body = '[URLSearchParams]';
      } else if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body)) {
        captured.body = '[ArrayBuffer]';
      } else if (init.body instanceof Blob) {
        captured.body = '[Blob]';
      } else if (typeof init.body === 'object' && 'getReader' in init.body) {
        captured.body = '[ReadableStream]';
      } else {
        captured.body = '[Binary]';
      }
    }

    capturedRequests.push(captured);

    // Find matching handler
    for (const handler of handlers) {
      // Check method match
      if (handler.method && handler.method !== method) continue;

      // Check URL match
      const urlMatches =
        typeof handler.url === 'string' ? url === handler.url : handler.url.test(url);

      if (!urlMatches) continue;

      // Call onRequest callback if provided
      if (handler.onRequest && input instanceof Request) {
        handler.onRequest(input);
      }

      // Apply delay if specified
      if (handler.delay) {
        await new Promise((resolve) => setTimeout(resolve, handler.delay));
      }

      // Build response
      const status = handler.status ?? 200;
      const headers = new Headers(handler.headers ?? {});

      let body: string | null = null;
      if (handler.response !== null && handler.response !== undefined) {
        if (typeof handler.response === 'object') {
          body = JSON.stringify(handler.response);
          if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
          }
        } else {
          body = String(handler.response);
        }
      }

      return new Response(body, { status, headers });
    }

    // No handler matched - return 404
    return new Response(JSON.stringify({ error: 'No mock handler matched', url, method }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch);
}

/**
 * Restore original fetch after tests
 * MUST be called in afterEach to prevent test pollution
 */
export function restoreFetch(): void {
  if (mockInstance) {
    mockInstance.mockRestore();
    mockInstance = null;
  }
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
  capturedRequests = [];
}

/**
 * Get all requests captured during mock
 * Useful for asserting request parameters
 */
export function getCapturedFetchRequests(): CapturedRequest[] {
  return [...capturedRequests];
}

/**
 * Clear captured requests without restoring fetch
 */
export function clearCapturedFetchRequests(): void {
  capturedRequests = [];
}

/**
 * Check if fetch is currently mocked
 */
export function isFetchMocked(): boolean {
  return mockInstance !== null;
}
