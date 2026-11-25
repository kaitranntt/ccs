/**
 * Remote Auth Fetcher
 * Fetches and transforms auth data from remote CLIProxyAPI.
 */

import * as https from 'https';
import {
  getProxyTarget,
  buildProxyUrl,
  buildManagementHeaders,
  ProxyTarget,
} from '../proxy/proxy-target-resolver';
import { AuthError, ConfigError, NetworkError } from '../../errors/error-types';
import { getProviderDisplayName, mapExternalProviderName } from '../provider-capabilities';
import type { CLIProxyProvider } from '../types';

/** Timeout for remote fetch requests (ms) */
const REMOTE_FETCH_TIMEOUT_MS = 5000;

async function fetchRemoteAuthResponse(
  url: string,
  headers: Record<string, string>,
  target: ProxyTarget
): Promise<Response> {
  if (target.protocol !== 'https' || !target.allowSelfSigned) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return new Promise<Response>((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false });
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = setTimeout(() => {
      const timeoutError = new Error('Request timeout');
      req.destroy(timeoutError);
      settle(() => reject(timeoutError));
    }, REMOTE_FETCH_TIMEOUT_MS);

    const req = https.request(
      url,
      {
        method: 'GET',
        headers,
        agent,
        timeout: REMOTE_FETCH_TIMEOUT_MS,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          settle(() =>
            resolve(
              new Response(body, {
                status: res.statusCode || 500,
                statusText: res.statusMessage ?? '',
                headers:
                  typeof res.headers['content-type'] === 'string'
                    ? { 'Content-Type': res.headers['content-type'] }
                    : undefined,
              })
            )
          );
        });
      }
    );

    req.on('error', (error) => {
      settle(() => reject(error));
    });

    req.on('timeout', () => {
      const timeoutError = new Error('Request timeout');
      req.destroy(timeoutError);
      settle(() => reject(timeoutError));
    });

    req.end();
  });
}

/** Remote auth file from CLIProxyAPI /v0/management/auth-files */
interface RemoteAuthFile {
  id: string;
  name: string;
  type: string;
  provider: string;
  email?: string;
  status: 'active' | 'disabled' | 'unavailable';
  source: 'file' | 'memory';
}

/** Account info for UI display */
export interface RemoteAccountInfo {
  id: string;
  email: string;
  provider: CLIProxyProvider;
  isDefault: boolean;
  status: 'active' | 'disabled' | 'unavailable';
}

/** Auth status for a provider (UI format) */
export interface RemoteAuthStatus {
  provider: string;
  displayName: string;
  authenticated: boolean;
  tokenFiles: number;
  accounts: RemoteAccountInfo[];
  defaultAccount: string | null;
  source: 'remote';
}

/**
 * Fetch auth status from remote CLIProxyAPI
 * @throws Error if remote is unreachable or returns error
 */
export async function fetchRemoteAuthStatus(target?: ProxyTarget): Promise<RemoteAuthStatus[]> {
  const proxyTarget = target ?? getProxyTarget();

  if (!proxyTarget.isRemote) {
    throw new ConfigError('fetchRemoteAuthStatus called but remote mode not enabled');
  }

  const url = buildProxyUrl(proxyTarget, '/v0/management/auth-files');
  const headers = buildManagementHeaders(proxyTarget);

  try {
    const response = await fetchRemoteAuthResponse(url, headers, proxyTarget);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new AuthError('Authentication failed - check auth token in settings');
      }
      throw new NetworkError(
        `Remote returned ${response.status}: ${response.statusText}`,
        url,
        response.status
      );
    }

    const data: unknown = await response.json();

    // Validate response structure
    if (!data || typeof data !== 'object' || !('files' in data) || !Array.isArray(data.files)) {
      throw new NetworkError('Invalid response format from remote auth endpoint', url);
    }

    return transformRemoteAuthFiles(data.files as RemoteAuthFile[]);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new NetworkError('Remote proxy connection timed out', url);
    }
    if (error instanceof Error && error.message === 'Request timeout') {
      throw new NetworkError('Remote proxy connection timed out', url);
    }
    throw error;
  }
}

/**
 * Transform CLIProxyAPI auth files to CCS AuthStatus format
 * @param files Array of auth files from remote API
 */
function transformRemoteAuthFiles(files: RemoteAuthFile[]): RemoteAuthStatus[] {
  const byProvider = new Map<CLIProxyProvider, RemoteAuthFile[]>();

  for (const file of files) {
    const provider = mapExternalProviderName(file.provider);
    if (!provider) {
      // Unknown provider, skip (could add logging in debug mode)
      continue;
    }

    const existing = byProvider.get(provider);
    if (existing) {
      existing.push(file);
    } else {
      byProvider.set(provider, [file]);
    }
  }

  const result: RemoteAuthStatus[] = [];

  for (const [provider, providerFiles] of byProvider) {
    const activeFiles = providerFiles.filter((f) => f.status === 'active');
    const accounts: RemoteAccountInfo[] = providerFiles.map((f, idx) => ({
      id: f.id,
      email: f.email || f.name || 'Unknown',
      // Keep provider on each account so UI account rendering can infer capabilities safely.
      provider,
      isDefault: idx === 0,
      status: f.status,
    }));

    result.push({
      provider,
      displayName: getProviderDisplayName(provider),
      authenticated: activeFiles.length > 0,
      tokenFiles: providerFiles.length,
      accounts,
      defaultAccount: accounts.find((a) => a.isDefault)?.id || null,
      source: 'remote',
    });
  }

  return result;
}
