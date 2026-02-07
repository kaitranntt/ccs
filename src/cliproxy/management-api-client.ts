/**
 * Management API Client for CLIProxyAPI
 *
 * HTTP client for CLIProxy Management API endpoints.
 * Handles authentication, error mapping, and provides typed methods for CRUD operations.
 */

import * as https from 'https';
import type {
  ManagementClientConfig,
  ManagementHealthStatus,
  ManagementApiErrorCode,
  ClaudeKey,
  GetClaudeKeysResponse,
  ClaudeKeyPatch,
  RemoteModelInfo,
  GetModelDefinitionsResponse,
} from './management-api-types';

/** Default timeout for management operations (longer than health check) */
const DEFAULT_TIMEOUT_MS = 5000;

/** Default port for HTTP protocol */
const DEFAULT_HTTP_PORT = 8317;

/** Default port for HTTPS protocol */
const DEFAULT_HTTPS_PORT = 443;

/**
 * Get effective port based on config and protocol.
 */
function getEffectivePort(port: number | undefined, protocol: 'http' | 'https'): number {
  if (port !== undefined && Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }
  return protocol === 'https' ? DEFAULT_HTTPS_PORT : DEFAULT_HTTP_PORT;
}

/**
 * Build URL for Management API endpoint.
 */
function buildUrl(config: ManagementClientConfig, path: string): string {
  const port = getEffectivePort(config.port, config.protocol);
  // Only omit port if it matches standard web ports
  if (
    (config.protocol === 'https' && port === 443) ||
    (config.protocol === 'http' && port === 80)
  ) {
    return `${config.protocol}://${config.host}${path}`;
  }
  return `${config.protocol}://${config.host}:${port}${path}`;
}

/**
 * Map error to ManagementApiErrorCode.
 */
function mapErrorToCode(error: Error, statusCode?: number): ManagementApiErrorCode {
  const message = error.message.toLowerCase();
  const rawCode = (error as NodeJS.ErrnoException).code;
  const code = typeof rawCode === 'string' ? rawCode.toLowerCase() : undefined;

  // DNS resolution failed
  if (code === 'enotfound' || code === 'eai_again' || message.includes('dns')) {
    return 'DNS_FAILED';
  }

  // Network unreachable
  if (code === 'enetunreach' || code === 'ehostunreach' || message.includes('unreachable')) {
    return 'NETWORK_UNREACHABLE';
  }

  // Connection refused
  if (code === 'econnrefused' || message.includes('connection refused')) {
    return 'CONNECTION_REFUSED';
  }

  // Timeout
  if (code === 'etimedout' || message.includes('timeout') || message.includes('aborted')) {
    return 'TIMEOUT';
  }

  // HTTP status codes
  if (statusCode === 401 || statusCode === 403) {
    return 'AUTH_FAILED';
  }
  if (statusCode === 404) {
    return 'NOT_FOUND';
  }
  if (statusCode === 400) {
    return 'BAD_REQUEST';
  }
  if (statusCode && statusCode >= 500) {
    return 'SERVER_ERROR';
  }

  return 'UNKNOWN';
}

/**
 * Get human-readable error message from error code.
 */
function getErrorMessage(errorCode: ManagementApiErrorCode, rawError?: string): string {
  switch (errorCode) {
    case 'CONNECTION_REFUSED':
      return 'Connection refused - is CLIProxy running?';
    case 'TIMEOUT':
      return 'Request timed out - server may be slow or unreachable';
    case 'AUTH_FAILED':
      return 'Authentication failed - check management key';
    case 'DNS_FAILED':
      return 'DNS lookup failed - check hostname';
    case 'NETWORK_UNREACHABLE':
      return 'Network unreachable - check if host is accessible';
    case 'NOT_FOUND':
      return 'Endpoint not found - check CLIProxy version';
    case 'BAD_REQUEST':
      return 'Invalid request - check payload format';
    case 'SERVER_ERROR':
      return 'Server error - check CLIProxy logs';
    default:
      return rawError || 'Request failed';
  }
}

/**
 * Management API Client for CLIProxyAPI.
 * Provides typed methods for CRUD operations on claude-api-key configuration.
 */
export class ManagementApiClient {
  private readonly config: ManagementClientConfig;
  private readonly timeout: number;

  constructor(config: ManagementClientConfig) {
    this.config = config;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Build base URL for display purposes.
   */
  getBaseUrl(): string {
    return buildUrl(this.config, '');
  }

  /**
   * Check health of Management API.
   * Uses GET /v0/management/claude-api-key as health check.
   */
  async health(): Promise<ManagementHealthStatus> {
    const startTime = Date.now();
    try {
      const response = await this.request('GET', '/v0/management/claude-api-key');
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        version: response.headers?.['x-cpa-version'],
        commit: response.headers?.['x-cpa-commit'],
      };
    } catch (error) {
      const err = error as Error & { statusCode?: number; errorCode?: ManagementApiErrorCode };
      return {
        healthy: false,
        error: err.message,
        errorCode: err.errorCode ?? 'UNKNOWN',
      };
    }
  }

  /**
   * Get all claude-api-key entries from remote CLIProxy.
   */
  async getClaudeKeys(): Promise<ClaudeKey[]> {
    const response = await this.request<GetClaudeKeysResponse>(
      'GET',
      '/v0/management/claude-api-key'
    );
    return response.data?.['claude-api-key'] ?? [];
  }

  /**
   * Replace all claude-api-key entries on remote CLIProxy.
   * This is an atomic operation - all entries are replaced at once.
   */
  async putClaudeKeys(keys: ClaudeKey[]): Promise<void> {
    await this.request('PUT', '/v0/management/claude-api-key', keys);
  }

  /**
   * Update a single claude-api-key entry by index or api-key match.
   */
  async patchClaudeKey(patch: ClaudeKeyPatch): Promise<void> {
    await this.request('PATCH', '/v0/management/claude-api-key', patch);
  }

  /**
   * Delete a claude-api-key entry by api-key value.
   */
  async deleteClaudeKey(apiKey: string): Promise<void> {
    const encodedKey = encodeURIComponent(apiKey);
    await this.request('DELETE', `/v0/management/claude-api-key?api-key=${encodedKey}`);
  }

  /**
   * Get model definitions for a channel from CLIProxyAPI.
   * GET /v0/management/model-definitions/:channel
   */
  async getModelDefinitions(channel: string): Promise<RemoteModelInfo[]> {
    const encodedChannel = encodeURIComponent(channel);
    const response = await this.request<GetModelDefinitionsResponse>(
      'GET',
      `/v0/management/model-definitions/${encodedChannel}`
    );
    return response.data?.models ?? [];
  }

  /**
   * Make an HTTP request to the Management API.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ data?: T; headers?: Record<string, string> }> {
    const url = buildUrl(this.config, path);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.config.managementKey}`,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    // Use native https for self-signed cert support
    if (this.config.protocol === 'https' && this.config.allowSelfSigned) {
      return this.requestWithHttps<T>(method, url, headers, body);
    }

    return this.requestWithFetch<T>(method, url, headers, body);
  }

  /**
   * Make request using native fetch API.
   */
  private async requestWithFetch<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<{ data?: T; headers?: Record<string, string> }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorCode = mapErrorToCode(new Error(response.statusText), response.status);
        const error = new Error(getErrorMessage(errorCode)) as Error & {
          statusCode: number;
          errorCode: ManagementApiErrorCode;
        };
        error.statusCode = response.status;
        error.errorCode = errorCode;
        throw error;
      }

      // Extract headers we care about
      const responseHeaders: Record<string, string> = {};
      const version = response.headers.get('x-cpa-version');
      const commit = response.headers.get('x-cpa-commit');
      if (version) responseHeaders['x-cpa-version'] = version;
      if (commit) responseHeaders['x-cpa-commit'] = commit;

      // Parse JSON response if present
      const text = await response.text();
      let data: T | undefined;
      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          // Non-JSON response is ok for PUT/DELETE
        }
      }

      return { data, headers: responseHeaders };
    } catch (error) {
      clearTimeout(timeoutId);
      const err = error as Error & { statusCode?: number; errorCode?: ManagementApiErrorCode };
      if (!err.errorCode) {
        err.errorCode = mapErrorToCode(err, err.statusCode);
        err.message = getErrorMessage(err.errorCode, err.message);
      }
      throw err;
    }
  }

  /**
   * Make request using native https module for self-signed cert support.
   */
  private async requestWithHttps<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<{ data?: T; headers?: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const agent = new https.Agent({ rejectUnauthorized: false });
      const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

      if (bodyStr) {
        headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
      }

      const reqTimeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, this.timeout);

      const req = https.request(
        url,
        {
          method,
          headers,
          agent,
          timeout: this.timeout,
        },
        (res) => {
          clearTimeout(reqTimeout);
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              const errorCode = mapErrorToCode(new Error(res.statusMessage || ''), res.statusCode);
              const error = new Error(getErrorMessage(errorCode)) as Error & {
                statusCode: number;
                errorCode: ManagementApiErrorCode;
              };
              error.statusCode = res.statusCode;
              error.errorCode = errorCode;
              reject(error);
              return;
            }

            const responseHeaders: Record<string, string> = {};
            const version = res.headers['x-cpa-version'];
            const commit = res.headers['x-cpa-commit'];
            if (typeof version === 'string') responseHeaders['x-cpa-version'] = version;
            if (typeof commit === 'string') responseHeaders['x-cpa-commit'] = commit;

            let parsed: T | undefined;
            if (data) {
              try {
                parsed = JSON.parse(data) as T;
              } catch {
                // Non-JSON response is ok
              }
            }

            resolve({ data: parsed, headers: responseHeaders });
          });
        }
      );

      req.on('error', (err) => {
        clearTimeout(reqTimeout);
        const error = err as Error & { errorCode?: ManagementApiErrorCode };
        error.errorCode = mapErrorToCode(err);
        error.message = getErrorMessage(error.errorCode, err.message);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        const error = new Error('Request timeout') as Error & { errorCode: ManagementApiErrorCode };
        error.errorCode = 'TIMEOUT';
        reject(error);
      });

      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }
}

/**
 * Create a ManagementApiClient from CCS config.
 * Uses cliproxy_server.remote settings.
 */
export function createManagementClient(
  remoteConfig: {
    host: string;
    port?: number;
    protocol: 'http' | 'https';
    management_key?: string;
    auth_token?: string;
    timeout?: number;
  },
  allowSelfSigned = true
): ManagementApiClient {
  return new ManagementApiClient({
    host: remoteConfig.host,
    port: remoteConfig.port,
    protocol: remoteConfig.protocol,
    managementKey: remoteConfig.management_key || remoteConfig.auth_token || '',
    timeout: remoteConfig.timeout,
    allowSelfSigned,
  });
}
