/**
 * Mock HTTP Server
 *
 * Simulates HTTP server responses without actual network operations.
 * No port binding - instant responses for fast testing.
 */

import type {
  HttpMethod,
  MockHttpServer,
  MockHttpServerConfig,
  MockResponse,
  CapturedRequest,
  RouteKey,
} from './types';

/** Default 404 response for unmatched routes */
const DEFAULT_NOT_FOUND: MockResponse = {
  status: 404,
  body: { error: 'Not Found' },
};

/**
 * Create a mock HTTP server that handles requests without network
 *
 * @example
 * const server = createMockHttpServer({
 *   routes: {
 *     'GET /health': { status: 200, body: { healthy: true } },
 *     'POST /upload': { status: 201, body: { id: '123' } },
 *   }
 * });
 * const response = server.handle('GET', '/health');
 */
export function createMockHttpServer(config: MockHttpServerConfig): MockHttpServer {
  const capturedRequests: CapturedRequest[] = [];
  const { routes, defaultResponse = DEFAULT_NOT_FOUND } = config;

  return {
    handle(method: HttpMethod, path: string, body?: unknown): MockResponse {
      // Capture request for assertions
      capturedRequests.push({
        url: path,
        method,
        headers: {},
        body: body ? JSON.stringify(body) : null,
      });

      // Find matching route
      const routeKey = `${method} ${path}` as RouteKey;
      const exactMatch = routes[routeKey];
      if (exactMatch) {
        return exactMatch;
      }

      // Try pattern matching for routes with wildcards
      for (const [key, response] of Object.entries(routes)) {
        // Split on first space only to preserve spaces in path
        const spaceIndex = key.indexOf(' ');
        if (spaceIndex === -1) continue;
        const routeMethod = key.slice(0, spaceIndex);
        const routePath = key.slice(spaceIndex + 1);
        if (routeMethod !== method) continue;

        // Check if route path is a pattern (contains *)
        if (routePath.includes('*')) {
          // Escape regex special chars, then replace * with .*
          const escaped = routePath.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
          const pattern = escaped.replace(/\*/g, '.*');
          const regex = new RegExp(`^${pattern}$`);
          if (regex.test(path)) {
            return response;
          }
        }
      }

      return defaultResponse;
    },

    getCapturedRequests(): CapturedRequest[] {
      return [...capturedRequests];
    },

    clearCapturedRequests(): void {
      capturedRequests.length = 0;
    },
  };
}

/**
 * Create a mock Response object (Web API compatible)
 *
 * @example
 * const response = createMockResponse({ status: 200, body: { ok: true } });
 */
export function createMockResponse(config: MockResponse): Response {
  const { status = 200, body, headers = {} } = config;

  let responseBody: string | null = null;
  const responseHeaders = new Headers(headers);

  if (body !== null && body !== undefined) {
    if (typeof body === 'object' && !Buffer.isBuffer(body)) {
      responseBody = JSON.stringify(body);
      if (!responseHeaders.has('Content-Type')) {
        responseHeaders.set('Content-Type', 'application/json');
      }
    } else if (Buffer.isBuffer(body)) {
      responseBody = body.toString();
    } else {
      responseBody = body;
    }
  }

  return new Response(responseBody, {
    status,
    headers: responseHeaders,
  });
}
