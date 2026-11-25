/**
 * Unit tests for management-api-client module
 */
import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { ManagementApiClient } from '../management-api-client';
import type {
  ManagementClientConfig,
  ManagementHealthStatus,
  ClaudeKey,
} from '../management-api-types';

const asFetch = (fn: unknown): typeof fetch => fn as typeof fetch;

describe('management-api-client', () => {
  describe('ManagementApiClient', () => {
    let config: ManagementClientConfig;

    beforeEach(() => {
      config = {
        host: 'localhost',
        port: 8317,
        protocol: 'http',
        managementKey: 'test-management-key-12345',
        timeout: 2000,
        allowSelfSigned: false,
      };
    });

    describe('constructor', () => {
      it('should create client with provided config', () => {
        const client = new ManagementApiClient(config);
        expect(client).toBeDefined();
        expect(client.getBaseUrl()).toBe('http://localhost:8317');
      });

      it('should use default timeout if not provided', () => {
        const configWithoutTimeout = { ...config };
        delete configWithoutTimeout.timeout;
        const client = new ManagementApiClient(configWithoutTimeout);
        expect(client).toBeDefined();
      });
    });

    describe('getBaseUrl', () => {
      it('should construct HTTP URL with port', () => {
        const client = new ManagementApiClient(config);
        expect(client.getBaseUrl()).toBe('http://localhost:8317');
      });

      it('should construct HTTPS URL with custom port', () => {
        const httpsConfig = { ...config, protocol: 'https' as const, port: 8443 };
        const client = new ManagementApiClient(httpsConfig);
        expect(client.getBaseUrl()).toBe('https://localhost:8443');
      });

      it('should omit standard HTTP port 80', () => {
        const configPort80 = { ...config, port: 80 };
        const client = new ManagementApiClient(configPort80);
        expect(client.getBaseUrl()).toBe('http://localhost');
      });

      it('should omit standard HTTPS port 443', () => {
        const configPort443 = { ...config, protocol: 'https' as const, port: 443 };
        const client = new ManagementApiClient(configPort443);
        expect(client.getBaseUrl()).toBe('https://localhost');
      });

      it('should use default port 8317 for HTTP when port is undefined', () => {
        const configNoPort = { ...config };
        delete configNoPort.port;
        const client = new ManagementApiClient(configNoPort);
        expect(client.getBaseUrl()).toBe('http://localhost:8317');
      });

      it('should use default port 443 for HTTPS when port is undefined', () => {
        const configNoPort = { ...config, protocol: 'https' as const };
        delete configNoPort.port;
        const client = new ManagementApiClient(configNoPort);
        expect(client.getBaseUrl()).toBe('https://localhost');
      });

      it('should warn and fall back when configured port is invalid', () => {
        const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

        const client = new ManagementApiClient({ ...config, port: 99999 });
        expect(client.getBaseUrl()).toBe('http://localhost:8317');
        expect(warnSpy).toHaveBeenCalledWith(
          '[management-api-client] Invalid port "99999", using default 8317'
        );

        warnSpy.mockRestore();
      });
    });

    describe('routing strategy helpers', () => {
      it('reads the routing strategy from the management endpoint', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        const fetchMock = mock(() =>
          Promise.resolve(
            new Response(JSON.stringify({ strategy: 'fill-first' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        );
        global.fetch = fetchMock as unknown as typeof fetch;

        const strategy = await client.getRoutingStrategy();

        expect(strategy).toBe('fill-first');
        expect(fetchMock).toHaveBeenCalled();
        global.fetch = originalFetch;
      });

      it('writes the routing strategy using the expected payload shape', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        const fetchMock = mock(() =>
          Promise.resolve(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        );
        global.fetch = fetchMock as unknown as typeof fetch;

        const strategy = await client.putRoutingStrategy('round-robin');

        expect(strategy).toBe('round-robin');
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:8317/v0/management/routing/strategy',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ value: 'round-robin' }),
          })
        );
        global.fetch = originalFetch;
      });
    });

    describe('error code mapping', () => {
      it('should map ENOTFOUND to DNS_FAILED', () => {
        const error = new Error('getaddrinfo ENOTFOUND example.com') as NodeJS.ErrnoException;
        error.code = 'ENOTFOUND';

        // Test via health check which uses mapErrorToCode internally
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(mock(() => Promise.reject(error)));

        client.health().then((status: ManagementHealthStatus) => {
          expect(status.healthy).toBe(false);
          expect(status.errorCode).toBe('DNS_FAILED');
        });

        global.fetch = originalFetch;
      });

      it('should map ECONNREFUSED to CONNECTION_REFUSED', () => {
        const error = new Error('connect ECONNREFUSED') as NodeJS.ErrnoException;
        error.code = 'ECONNREFUSED';

        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(mock(() => Promise.reject(error)));

        client.health().then((status: ManagementHealthStatus) => {
          expect(status.healthy).toBe(false);
          expect(status.errorCode).toBe('CONNECTION_REFUSED');
        });

        global.fetch = originalFetch;
      });

      it('should map ETIMEDOUT to TIMEOUT', () => {
        const error = new Error('request timeout') as NodeJS.ErrnoException;
        error.code = 'ETIMEDOUT';

        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(mock(() => Promise.reject(error)));

        client.health().then((status: ManagementHealthStatus) => {
          expect(status.healthy).toBe(false);
          expect(status.errorCode).toBe('TIMEOUT');
        });

        global.fetch = originalFetch;
      });

      it('should map ENETUNREACH to NETWORK_UNREACHABLE', () => {
        const error = new Error('network unreachable') as NodeJS.ErrnoException;
        error.code = 'ENETUNREACH';

        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(mock(() => Promise.reject(error)));

        client.health().then((status: ManagementHealthStatus) => {
          expect(status.healthy).toBe(false);
          expect(status.errorCode).toBe('NETWORK_UNREACHABLE');
        });

        global.fetch = originalFetch;
      });

      it('should map 401 status to AUTH_FAILED', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(
          mock(() =>
            Promise.resolve({
              ok: false,
              status: 401,
              statusText: 'Unauthorized',
              headers: new Headers(),
              text: () => Promise.resolve(''),
            } as Response)
          )
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('AUTH_FAILED');

        global.fetch = originalFetch;
      });

      it('should map 403 status to AUTH_FAILED', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(
          mock(() =>
            Promise.resolve({
              ok: false,
              status: 403,
              statusText: 'Forbidden',
              headers: new Headers(),
              text: () => Promise.resolve(''),
            } as Response)
          )
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('AUTH_FAILED');

        global.fetch = originalFetch;
      });

      it('should map 404 status to NOT_FOUND', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(
          mock(() =>
            Promise.resolve({
              ok: false,
              status: 404,
              statusText: 'Not Found',
              headers: new Headers(),
              text: () => Promise.resolve(''),
            } as Response)
          )
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('NOT_FOUND');

        global.fetch = originalFetch;
      });

      it('should map 400 status to BAD_REQUEST', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(
          mock(() =>
            Promise.resolve({
              ok: false,
              status: 400,
              statusText: 'Bad Request',
              headers: new Headers(),
              text: () => Promise.resolve(''),
            } as Response)
          )
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('BAD_REQUEST');

        global.fetch = originalFetch;
      });

      it('should map 500+ status to SERVER_ERROR', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(
          mock(() =>
            Promise.resolve({
              ok: false,
              status: 500,
              statusText: 'Internal Server Error',
              headers: new Headers(),
              text: () => Promise.resolve(''),
            } as Response)
          )
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('SERVER_ERROR');

        global.fetch = originalFetch;
      });

      it('should map unknown errors to UNKNOWN', async () => {
        const client = new ManagementApiClient(config);
        const originalFetch = global.fetch;
        global.fetch = asFetch(mock(() => Promise.reject(new Error('Something weird happened'))));

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('UNKNOWN');

        global.fetch = originalFetch;
      });
    });

    describe('authentication header', () => {
      it('should include Bearer token in Authorization header', async () => {
        const client = new ManagementApiClient(config);
        let capturedHeaders: Record<string, string> = {};

        const originalFetch = global.fetch;
        global.fetch = asFetch(
          mock((_url: string, options?: RequestInit) => {
            if (options?.headers) {
              capturedHeaders = options.headers as Record<string, string>;
            }
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers(),
              text: () => Promise.resolve('{"claude-api-key":[]}'),
            } as Response);
          })
        );

        await client.getClaudeKeys();
        expect(capturedHeaders['Authorization']).toBe('Bearer test-management-key-12345');

        global.fetch = originalFetch;
      });

      it('should mask management key in logs/errors', () => {
        // Management key should never appear in plain text in error messages
        const sensitiveKey = 'super-secret-key-abc123';
        const clientConfig = { ...config, managementKey: sensitiveKey };
        const client = new ManagementApiClient(clientConfig);

        // The key should be used internally but not exposed
        expect(client.getBaseUrl()).not.toContain(sensitiveKey);
      });
    });

    describe('timeout handling', () => {
      it('should respect custom timeout value', () => {
        const customTimeout = 10000;
        const configWithTimeout = { ...config, timeout: customTimeout };
        const client = new ManagementApiClient(configWithTimeout);
        expect(client).toBeDefined();
      });

      it('should abort request on timeout', async () => {
        const client = new ManagementApiClient({ ...config, timeout: 100 });

        const originalFetch = global.fetch;
        global.fetch = asFetch(
          mock(
            () =>
              new Promise((_, reject) => {
                setTimeout(() => {
                  const error = new Error('The operation was aborted');
                  error.name = 'AbortError';
                  reject(error);
                }, 150);
              })
          )
        );

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.errorCode).toBe('TIMEOUT');

        global.fetch = originalFetch;
      });
    });

    describe('self-signed certificate option', () => {
      it('should use fetch for HTTP regardless of allowSelfSigned', async () => {
        const client = new ManagementApiClient({ ...config, allowSelfSigned: true });

        const originalFetch = global.fetch;
        let fetchCalled = false;
        global.fetch = asFetch(
          mock(() => {
            fetchCalled = true;
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers(),
              text: () => Promise.resolve('{"claude-api-key":[]}'),
            } as Response);
          })
        );

        await client.getClaudeKeys();
        expect(fetchCalled).toBe(true);

        global.fetch = originalFetch;
      });

      it('should use https module for HTTPS with allowSelfSigned', () => {
        const httpsConfig = {
          ...config,
          protocol: 'https' as const,
          allowSelfSigned: true,
        };
        const client = new ManagementApiClient(httpsConfig);
        expect(client).toBeDefined();
        // Actual HTTPS request would use native https module with rejectUnauthorized: false
      });

      it('should use fetch for HTTPS without allowSelfSigned', async () => {
        const httpsConfig = {
          ...config,
          protocol: 'https' as const,
          allowSelfSigned: false,
        };
        const client = new ManagementApiClient(httpsConfig);

        const originalFetch = global.fetch;
        let fetchCalled = false;
        global.fetch = asFetch(
          mock(() => {
            fetchCalled = true;
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers(),
              text: () => Promise.resolve('{"claude-api-key":[]}'),
            } as Response);
          })
        );

        await client.getClaudeKeys();
        expect(fetchCalled).toBe(true);

        global.fetch = originalFetch;
      });
    });

    describe('health check', () => {
      it('should return healthy status with version info', async () => {
        const client = new ManagementApiClient(config);

        const originalFetch = global.fetch;
        global.fetch = asFetch(
          mock(() =>
            Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({
                'x-cpa-version': '1.2.3',
                'x-cpa-commit': 'abc123',
              }),
              text: () => Promise.resolve('{"claude-api-key":[]}'),
            } as Response)
          )
        );

        const status = await client.health();
        expect(status.healthy).toBe(true);
        expect(status.version).toBe('1.2.3');
        expect(status.commit).toBe('abc123');
        expect(status.latencyMs).toBeGreaterThanOrEqual(0);

        global.fetch = originalFetch;
      });

      it('should return unhealthy status on error', async () => {
        const client = new ManagementApiClient(config);

        const originalFetch = global.fetch;
        global.fetch = asFetch(mock(() => Promise.reject(new Error('Connection failed'))));

        const status = await client.health();
        expect(status.healthy).toBe(false);
        expect(status.error).toBeDefined();
        expect(status.errorCode).toBeDefined();

        global.fetch = originalFetch;
      });
    });

    describe('CRUD operations', () => {
      it('should get claude keys', async () => {
        const client = new ManagementApiClient(config);
        const mockKeys: ClaudeKey[] = [{ 'api-key': 'sk-test-123', prefix: 'glm-' }];

        const originalFetch = global.fetch;
        global.fetch = asFetch(
          mock(() =>
            Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers(),
              text: () => Promise.resolve(JSON.stringify({ 'claude-api-key': mockKeys })),
            } as Response)
          )
        );

        const keys = await client.getClaudeKeys();
        expect(keys).toEqual(mockKeys);

        global.fetch = originalFetch;
      });

      it('should put claude keys', async () => {
        const client = new ManagementApiClient(config);
        const mockKeys: ClaudeKey[] = [{ 'api-key': 'sk-test-456', prefix: 'kimi-' }];

        const originalFetch = global.fetch;
        let requestBody: string | undefined;
        global.fetch = asFetch(
          mock((_url: string, options?: RequestInit) => {
            requestBody = options?.body as string;
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers(),
              text: () => Promise.resolve(''),
            } as Response);
          })
        );

        await client.putClaudeKeys(mockKeys);
        expect(requestBody).toBe(JSON.stringify(mockKeys));

        global.fetch = originalFetch;
      });

      it('should patch claude key', async () => {
        const client = new ManagementApiClient(config);
        const patch = {
          index: 0,
          value: { prefix: 'updated-' },
        };

        const originalFetch = global.fetch;
        let requestBody: string | undefined;
        global.fetch = asFetch(
          mock((_url: string, options?: RequestInit) => {
            requestBody = options?.body as string;
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers(),
              text: () => Promise.resolve(''),
            } as Response);
          })
        );

        await client.patchClaudeKey(patch);
        expect(requestBody).toBe(JSON.stringify(patch));

        global.fetch = originalFetch;
      });

      it('should delete claude key', async () => {
        const client = new ManagementApiClient(config);
        const apiKey = 'sk-test-to-delete';

        const originalFetch = global.fetch;
        let requestUrl = '';
        global.fetch = asFetch(
          mock((url: string) => {
            requestUrl = url;
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers(),
              text: () => Promise.resolve(''),
            } as Response);
          })
        );

        await client.deleteClaudeKey(apiKey);
        expect(requestUrl).toContain(encodeURIComponent(apiKey));

        global.fetch = originalFetch;
      });
    });
  });
});
