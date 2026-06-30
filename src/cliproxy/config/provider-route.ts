import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import { DEFAULT_BACKEND } from '../binary/platform-detector';
import type { CLIProxyBackend, CLIProxyProvider } from '../types';

export function getConfiguredCliproxyBackend(): CLIProxyBackend {
  try {
    const backend = loadOrCreateUnifiedConfig().cliproxy?.backend;
    return backend === 'plus' || backend === 'original' ? backend : DEFAULT_BACKEND;
  } catch {
    return DEFAULT_BACKEND;
  }
}

export function usesScopedProviderRoutes(
  backend: CLIProxyBackend = getConfiguredCliproxyBackend()
): boolean {
  return backend === 'plus';
}

/**
 * Return the CLIProxy route path for a provider.
 *
 * The original backend routes Claude-compatible traffic at the root and relies
 * on model-based provider selection. The Plus backend exposes provider-scoped
 * routes for non-Claude providers.
 */
export function buildCliproxyProviderPath(
  provider: CLIProxyProvider,
  backend: CLIProxyBackend = getConfiguredCliproxyBackend()
): string {
  if (provider === 'claude') return '';
  return usesScopedProviderRoutes(backend) ? `/api/provider/${provider}` : '';
}

export function buildLocalProviderBaseUrl(
  provider: CLIProxyProvider,
  port: number,
  backend: CLIProxyBackend = getConfiguredCliproxyBackend()
): string {
  const rootUrl = `http://127.0.0.1:${port}`;
  return `${rootUrl}${buildCliproxyProviderPath(provider, backend)}`;
}

export function buildCodexResponsesProviderPath(
  backend: CLIProxyBackend = getConfiguredCliproxyBackend()
): string {
  return usesScopedProviderRoutes(backend) ? '/api/provider/codex' : '/backend-api/codex';
}

export function buildLocalCodexResponsesBaseUrl(
  port: number,
  backend: CLIProxyBackend = getConfiguredCliproxyBackend()
): string {
  return `http://127.0.0.1:${port}${buildCodexResponsesProviderPath(backend)}`;
}

export function normalizeCodexResponsesBaseUrl(
  baseUrl: string,
  backend: CLIProxyBackend = getConfiguredCliproxyBackend()
): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return baseUrl;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return baseUrl;

    const currentPath = parsed.pathname.replace(/\/+$/, '') || '/';
    const expectedPath = buildCodexResponsesProviderPath(backend);
    if (currentPath === expectedPath) return trimmed;

    const legacyCodexPath = '/api/provider/codex';
    const managedPaths = new Set(['/', legacyCodexPath]);
    if (!managedPaths.has(currentPath)) return trimmed;

    parsed.pathname = expectedPath;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return baseUrl;
  }
}
