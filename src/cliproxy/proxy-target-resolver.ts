/**
 * Proxy Target Resolver
 *
 * Determines whether CLIProxyAPI requests should go to local or remote
 * based on unified config. Used by stats-fetcher, auth-routes, and UI.
 */

import { loadOrCreateUnifiedConfig } from '../config/unified-config-loader';
import type { CliproxyServerConfig } from '../config/unified-config-types';
import {
  CLIPROXY_DEFAULT_PORT,
  getRemoteDefaultPort,
  normalizeProtocol,
  validateRemotePort,
} from './config-generator';

/** Resolved proxy target for making requests */
export interface ProxyTarget {
  /** Target hostname or IP */
  host: string;
  /** Target port */
  port: number;
  /** Protocol (http/https) */
  protocol: 'http' | 'https';
  /** Optional auth token for API endpoints - only send header if defined and non-empty */
  authToken?: string;
  /** Optional management key for management API endpoints (/v0/management/*) */
  managementKey?: string;
  /** True if targeting remote server, false if local */
  isRemote: boolean;
}

/**
 * Load cliproxy_server configuration from unified config.
 * Returns undefined if not configured.
 */
function loadCliproxyServerConfig(): CliproxyServerConfig | undefined {
  const config = loadOrCreateUnifiedConfig();
  return config.cliproxy_server;
}

/**
 * Get the current CLIProxyAPI target based on unified config.
 * Returns remote server config if enabled, otherwise localhost.
 */
export function getProxyTarget(): ProxyTarget {
  const config = loadCliproxyServerConfig();

  if (config?.remote?.enabled && config.remote?.host) {
    // Normalize protocol (handles case sensitivity and invalid values)
    const protocol = normalizeProtocol(config.remote.protocol);
    // Validate port (returns undefined for invalid, triggering default)
    const validatedPort = validateRemotePort(config.remote.port);
    const port = validatedPort ?? getRemoteDefaultPort(protocol);

    return {
      host: config.remote.host,
      port,
      protocol,
      authToken: config.remote.auth_token || undefined, // Empty string -> undefined
      managementKey: config.remote.management_key || undefined, // Empty string -> undefined
      isRemote: true,
    };
  }

  return {
    host: '127.0.0.1',
    port: config?.local?.port ?? CLIPROXY_DEFAULT_PORT,
    protocol: 'http',
    isRemote: false,
  };
}

/**
 * Build URL for proxy endpoint
 * @param target Resolved proxy target
 * @param path Endpoint path (e.g., '/v0/management/usage')
 */
export function buildProxyUrl(target: ProxyTarget, path: string): string {
  // Normalize path to ensure leading slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${target.protocol}://${target.host}:${target.port}${normalizedPath}`;
}

/**
 * Build request headers for proxy requests
 * Handles optional auth token - only adds Authorization header if token is set.
 *
 * @param target Resolved proxy target
 * @param additionalHeaders Extra headers to merge
 */
export function buildProxyHeaders(
  target: ProxyTarget,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...additionalHeaders,
  };

  // Only add auth header if token is configured
  if (target.authToken) {
    headers['Authorization'] = `Bearer ${target.authToken}`;
  }

  return headers;
}

/**
 * Build request headers for management API endpoints (/v0/management/*).
 * Uses management_key if configured, otherwise falls back to authToken.
 *
 * @param target Resolved proxy target
 * @param additionalHeaders Extra headers to merge
 */
export function buildManagementHeaders(
  target: ProxyTarget,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...additionalHeaders,
  };

  // Use management key for management API, fallback to authToken
  const authKey = target.managementKey ?? target.authToken;

  if (authKey) {
    headers['Authorization'] = `Bearer ${authKey}`;
  }

  return headers;
}
