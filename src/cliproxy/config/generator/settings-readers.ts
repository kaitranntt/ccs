/**
 * CLIProxy Config Generation Settings Readers & YAML Scalar Helpers
 */

import type { CLIProxyBackend, CLIProxyProvider, ProviderConfig } from '../../types';
import { getProviderDisplayName } from '../../provider-capabilities';
import { getModelMappingFromConfig } from '../base-config-loader';
import { loadOrCreateUnifiedConfig } from '../../../config/config-loader-facade';
import { isValidCliproxyRetryValue } from '../../../config/schemas/cliproxy';

export const CLIPROXY_CONFIG_VERSION = 22;

/**
 * Default CLIProxy listen address: loopback only, so other machines on the network
 * cannot reach the proxy. CLIProxyAPI treats an empty host as "all interfaces".
 */
export const CLIPROXY_DEFAULT_HOST = '127.0.0.1';

export const ORIGINAL_MANAGEMENT_PANEL_REPOSITORY =
  'https://github.com/router-for-me/Cli-Proxy-API-Management-Center';
export const PLUS_MANAGEMENT_PANEL_REPOSITORY =
  'https://github.com/kaitranntt/Cli-Proxy-API-Management-Center';

const GO_DURATION_SEGMENT = String.raw`(?:\d+(?:\.\d+)?(?:ns|us|µs|μs|ms|s|m|h))`;
const GO_DURATION_PATTERN = new RegExp(`^${GO_DURATION_SEGMENT}+$`);

/**
 * Get provider configuration
 * Model mappings are loaded from config/base-{provider}.settings.json
 */
export function getProviderConfig(provider: CLIProxyProvider): ProviderConfig {
  const models = getModelMappingFromConfig(provider);

  return {
    name: provider,
    displayName: getProviderDisplayName(provider),
    models,
    requiresOAuth: true,
  };
}

export function getLoggingSettings(): { loggingToFile: boolean; requestLog: boolean } {
  const config = loadOrCreateUnifiedConfig();
  return {
    loggingToFile: config.cliproxy.logging?.enabled ?? false,
    requestLog: config.cliproxy.logging?.request_log ?? false,
  };
}

export function isPoolRoutingEnabled(): boolean {
  return loadOrCreateUnifiedConfig().cliproxy?.pool_routing?.enabled === true;
}

export function getPoolMaxRetryCredentials(): number {
  return loadOrCreateUnifiedConfig().cliproxy?.pool_routing?.max_retry_credentials ?? 3;
}

export function getRoutingStrategy(): 'round-robin' | 'fill-first' {
  const config = loadOrCreateUnifiedConfig();
  return config.cliproxy?.routing?.strategy === 'fill-first' ? 'fill-first' : 'round-robin';
}

export function getSessionAffinityEnabled(): boolean {
  return loadOrCreateUnifiedConfig().cliproxy?.routing?.session_affinity ?? false;
}

export function getSessionAffinityTtl(): string {
  const ttl = loadOrCreateUnifiedConfig().cliproxy?.routing?.session_affinity_ttl?.trim();
  return ttl && GO_DURATION_PATTERN.test(ttl) && hasPositiveDuration(ttl) ? ttl : '1h';
}

export function getRequestRetry(): number {
  const value = loadOrCreateUnifiedConfig().cliproxy?.retry?.request_retry;
  return isValidCliproxyRetryValue(value) ? value : 0;
}

export function getMaxRetryInterval(): number {
  const value = loadOrCreateUnifiedConfig().cliproxy?.retry?.max_retry_interval;
  return isValidCliproxyRetryValue(value) ? value : 0;
}

function normalizeManagementPanelRepository(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getDefaultManagementPanelRepository(backend: CLIProxyBackend | undefined): string {
  return backend === 'plus'
    ? PLUS_MANAGEMENT_PANEL_REPOSITORY
    : ORIGINAL_MANAGEMENT_PANEL_REPOSITORY;
}

export function getManagementPanelRepository(): string {
  const config = loadOrCreateUnifiedConfig();
  return (
    normalizeManagementPanelRepository(config.cliproxy?.management_panel_repository) ??
    getDefaultManagementPanelRepository(config.cliproxy?.backend)
  );
}

export function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function hasPositiveDuration(value: string): boolean {
  const segments = value.match(new RegExp(GO_DURATION_SEGMENT, 'g'));
  if (!segments) {
    return false;
  }

  return segments.some((segment) => {
    const numeric = parseFloat(segment);
    return Number.isFinite(numeric) && numeric > 0;
  });
}

export function sanitizeYamlScalar(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseManagementPanelRepository(content: string): string | null {
  const match = content.match(/^\s*panel-github-repository:\s*(.+?)\s*$/m);
  return match ? sanitizeYamlScalar(match[1]) : null;
}

export function getConfigVersionFromContent(content: string): number | null {
  const versionMatch = content.match(/CCS v(\d+)/);
  if (!versionMatch) {
    return null;
  }

  const parsedVersion = Number.parseInt(versionMatch[1], 10);
  return Number.isNaN(parsedVersion) ? null : parsedVersion;
}

export function resolveListenHost(existingHost?: string): string {
  const envHost = process.env.CCS_CLIPROXY_HOST?.trim();
  if (envHost) {
    return envHost;
  }
  return existingHost ?? CLIPROXY_DEFAULT_HOST;
}
