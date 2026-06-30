/**
 * WebSearch backend configuration types.
 *
 * Covers all supported search backends:
 * - API-backed: Exa, Tavily, Brave
 * - Self-hosted: SearXNG
 * - Zero-setup: DuckDuckGo
 * - LLM CLI fallbacks: Antigravity (agy, recommended), Gemini (deprecated), Grok, OpenCode
 */

/**
 * DuckDuckGo WebSearch configuration.
 */
export interface DuckDuckGoWebSearchConfig {
  /** Enable DuckDuckGo HTML search fallback (default: true) */
  enabled?: boolean;
  /** Number of results to fetch (default: 5) */
  max_results?: number;
}

/**
 * Brave WebSearch configuration.
 */
export interface BraveWebSearchConfig {
  /** Enable Brave Search when BRAVE_API_KEY is available (default: false) */
  enabled?: boolean;
  /** Number of results to fetch (default: 5) */
  max_results?: number;
}

/**
 * Exa WebSearch configuration.
 */
export interface ExaWebSearchConfig {
  /** Enable Exa Search when EXA_API_KEY is available (default: false) */
  enabled?: boolean;
  /** Number of results to fetch (default: 5) */
  max_results?: number;
}

/**
 * Tavily WebSearch configuration.
 */
export interface TavilyWebSearchConfig {
  /** Enable Tavily Search when TAVILY_API_KEY is available (default: false) */
  enabled?: boolean;
  /** Number of results to fetch (default: 5) */
  max_results?: number;
}

/**
 * SearXNG WebSearch configuration.
 */
export interface SearxngWebSearchConfig {
  /** Enable SearXNG JSON search backend (default: false) */
  enabled?: boolean;
  /** Base SearXNG URL, e.g. https://search.example.com (default: '') */
  url?: string;
  /** Number of results to fetch (default: 5) */
  max_results?: number;
}

/**
 * Antigravity CLI (agy) WebSearch configuration.
 *
 * Recommended LLM CLI fallback. `agy` is Google's successor to the retired
 * `gemini` CLI. Install: `curl -fsSL https://antigravity.google/cli/install.sh | bash`.
 */
export interface AgyWebSearchConfig {
  /** Enable Antigravity CLI fallback (default: false) */
  enabled?: boolean;
  /** Model to use (default: gemini-2.5-flash; accepts legacy gemini ids) */
  model?: string;
  /** Timeout in seconds (default: 90) */
  timeout?: number;
}

/**
 * Gemini CLI WebSearch configuration.
 *
 * @deprecated Google retired the gemini CLI on 2026-06-18. Use Antigravity (agy) instead.
 */
export interface GeminiWebSearchConfig {
  /** Enable Gemini CLI legacy fallback (default: false) */
  enabled?: boolean;
  /** Model to use (default: gemini-2.5-flash) */
  model?: string;
  /** Timeout in seconds (default: 55) */
  timeout?: number;
}

/**
 * Grok CLI WebSearch configuration.
 */
export interface GrokWebSearchConfig {
  /** Enable Grok CLI legacy fallback (default: false - requires GROK_API_KEY) */
  enabled?: boolean;
  /** Timeout in seconds (default: 55) */
  timeout?: number;
}

/**
 * OpenCode CLI WebSearch configuration.
 */
export interface OpenCodeWebSearchConfig {
  /** Enable OpenCode CLI legacy fallback (default: false) */
  enabled?: boolean;
  /** Model to use (default: opencode/grok-code) */
  model?: string;
  /** Timeout in seconds (default: 60) */
  timeout?: number;
}

/**
 * WebSearch providers configuration.
 * Uses deterministic search backends first, with optional legacy CLI fallback.
 */
export interface WebSearchProvidersConfig {
  /** Exa Search API - API-backed search with strong relevance and content extraction */
  exa?: ExaWebSearchConfig;
  /** Tavily Search API - API-backed search optimized for agent/tool usage */
  tavily?: TavilyWebSearchConfig;
  /** Brave Search API - higher quality results when BRAVE_API_KEY is set */
  brave?: BraveWebSearchConfig;
  /** SearXNG JSON search - self-hosted or public instance backend */
  searxng?: SearxngWebSearchConfig;
  /** DuckDuckGo HTML search - zero setup default backend */
  duckduckgo?: DuckDuckGoWebSearchConfig;
  /** Antigravity CLI (agy) - recommended LLM CLI fallback (Gemini CLI successor) */
  agy?: AgyWebSearchConfig;
  /** Gemini CLI - deprecated legacy LLM fallback (retired upstream) */
  gemini?: GeminiWebSearchConfig;
  /** Grok CLI - optional legacy LLM fallback */
  grok?: GrokWebSearchConfig;
  /** OpenCode - optional legacy LLM fallback */
  opencode?: OpenCodeWebSearchConfig;
}

/**
 * WebSearch configuration.
 * Uses deterministic local backends for third-party profiles.
 * Legacy AI CLI fallbacks remain available for compatibility only.
 */
export interface WebSearchConfig {
  /** Master switch - enable/disable WebSearch (default: true) */
  enabled?: boolean;
  /** Individual provider configurations */
  providers?: WebSearchProvidersConfig;
  // Legacy fields (deprecated, kept for backwards compatibility)
  /** @deprecated Use providers.gemini instead */
  gemini?: {
    enabled?: boolean;
    timeout?: number;
  };
  /** @deprecated Unused */
  mode?: 'sequential' | 'parallel';
  /** @deprecated Unused */
  provider?: 'auto' | 'web-search-prime' | 'brave' | 'tavily';
  /** @deprecated Unused */
  fallback?: boolean;
  /** @deprecated Unused */
  webSearchPrimeUrl?: string;
  /** @deprecated Unused */
  selectedProviders?: string[];
  /** @deprecated Unused */
  customMcp?: unknown[];
}
