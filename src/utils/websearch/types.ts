/**
 * WebSearch Type Definitions
 *
 * Contains all type definitions for WebSearch providers and status.
 *
 * @module utils/websearch/types
 */

import type { ComponentStatus } from '../../types/utils';

/**
 * Antigravity CLI (agy) installation status
 * @deprecated Use ComponentStatus directly
 */
export type AgyCliStatus = ComponentStatus;

/**
 * Gemini CLI installation status
 * @deprecated Use ComponentStatus directly
 */
export type GeminiCliStatus = ComponentStatus;

/**
 * Grok CLI installation status
 * @deprecated Use ComponentStatus directly
 */
export type GrokCliStatus = ComponentStatus;

/**
 * OpenCode CLI installation status
 * @deprecated Use ComponentStatus directly
 */
export type OpenCodeCliStatus = ComponentStatus;

/**
 * WebSearch availability status for third-party profiles
 */
export type WebSearchReadiness = 'ready' | 'needs_setup' | 'unavailable';

/**
 * WebSearch provider identifier
 */
export type WebSearchProviderId =
  | 'exa'
  | 'tavily'
  | 'brave'
  | 'searxng'
  | 'duckduckgo'
  | 'agy'
  | 'gemini'
  | 'grok'
  | 'opencode';

/**
 * Provider execution class.
 */
export type WebSearchProviderKind = 'backend' | 'legacy-cli';

/**
 * WebSearch provider information for health checks and UI
 */
export interface WebSearchCliInfo {
  /** Provider ID */
  id: WebSearchProviderId;
  /** Backend vs legacy CLI */
  kind: WebSearchProviderKind;
  /** Display name */
  name: string;
  /** Command name for legacy providers */
  command?: string;
  /** Whether the provider is enabled in config */
  enabled: boolean;
  /** Whether the provider is ready right now */
  available: boolean;
  /** CLI version if applicable */
  version: string | null;
  /** Install or setup command when applicable */
  installCommand?: string;
  /** Docs URL */
  docsUrl?: string;
  /** Whether this provider requires an API key */
  requiresApiKey: boolean;
  /** API key environment variable name */
  apiKeyEnvVar?: string;
  /** Brief description */
  description: string;
  /** Summary detail shown in status UIs */
  detail: string;
}

/**
 * WebSearch status for display
 */
export interface WebSearchStatus {
  readiness: WebSearchReadiness;
  message: string;
  providers: WebSearchCliInfo[];
}

/**
 * WebSearch provider configuration from config.yaml
 */
export interface WebSearchProviderConfig {
  enabled?: boolean;
  model?: string;
  timeout?: number;
  max_results?: number;
  url?: string;
}

/**
 * WebSearch configuration from config.yaml
 */
export interface WebSearchConfig {
  enabled: boolean;
  providers?: {
    exa?: WebSearchProviderConfig;
    tavily?: WebSearchProviderConfig;
    brave?: WebSearchProviderConfig;
    searxng?: WebSearchProviderConfig;
    duckduckgo?: WebSearchProviderConfig;
    agy?: WebSearchProviderConfig;
    gemini?: WebSearchProviderConfig;
    opencode?: WebSearchProviderConfig;
    grok?: WebSearchProviderConfig;
  };
}

/**
 * Normalize a SearXNG base URL so runtime code can safely append `/search`.
 *
 * Accepts optional subpaths (for reverse-proxy deployments), strips a trailing
 * `/search` endpoint suffix, and rejects query/hash-bearing URLs because the
 * runtime owns the request path and query params.
 */
export function normalizeSearxngBaseUrl(url: string | undefined): string | null {
  const normalized = String(url || '').trim();
  if (!normalized) {
    return '';
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    if (parsed.username || parsed.password) {
      return null;
    }

    if (parsed.search || parsed.hash) {
      return null;
    }

    let pathname = parsed.pathname.replace(/\/+$/, '');
    if (pathname.toLowerCase().endsWith('/search')) {
      pathname = pathname.slice(0, -'/search'.length);
    }

    parsed.pathname = pathname || '/';
    parsed.search = '';
    parsed.hash = '';

    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}
