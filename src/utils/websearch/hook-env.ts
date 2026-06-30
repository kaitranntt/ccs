/**
 * WebSearch Hook Environment Variables
 *
 * Provides environment variables for WebSearch hook configuration.
 *
 * @module utils/websearch/hook-env
 */

import { normalizeSearxngBaseUrl } from './types';
import { resolveAllowedWebSearchTraceFile } from './trace';
import { getWebSearchConfig } from '../../config/config-loader-facade';

/**
 * Get environment variables for WebSearch hook configuration.
 *
 * Simple env vars - hook reads these to control behavior.
 *
 * @returns Record of environment variables to set before spawning Claude
 */
export function getWebSearchHookEnv(): Record<string, string> {
  const wsConfig = getWebSearchConfig();
  const env: Record<string, string> = {
    CCS_WEBSEARCH_ENABLED: '0',
    CCS_WEBSEARCH_SKIP: '0',
    CCS_WEBSEARCH_EXA: '0',
    CCS_WEBSEARCH_TAVILY: '0',
    CCS_WEBSEARCH_BRAVE: '0',
    CCS_WEBSEARCH_SEARXNG: '0',
    CCS_WEBSEARCH_DUCKDUCKGO: '0',
    CCS_WEBSEARCH_AGY: '0',
    CCS_WEBSEARCH_GEMINI: '0',
    CCS_WEBSEARCH_OPENCODE: '0',
    CCS_WEBSEARCH_GROK: '0',
  };

  if (process.env.CCS_WEBSEARCH_TRACE === '1' || process.env.CCS_DEBUG === '1') {
    env.CCS_WEBSEARCH_TRACE = '1';
  }
  const traceFileOverride = resolveAllowedWebSearchTraceFile(process.env);
  if (traceFileOverride) {
    env.CCS_WEBSEARCH_TRACE_FILE = traceFileOverride;
  }

  // Skip hook entirely if disabled
  if (!wsConfig.enabled) {
    env.CCS_WEBSEARCH_SKIP = '1';
    return env;
  }

  // Pass master switch
  env.CCS_WEBSEARCH_ENABLED = '1';

  // Pass individual provider enabled states
  // Hook will only use providers that are BOTH enabled AND ready.
  if (wsConfig.providers?.exa?.enabled) {
    env.CCS_WEBSEARCH_EXA = '1';
    env.CCS_WEBSEARCH_EXA_MAX_RESULTS = String(wsConfig.providers.exa.max_results || 5);
  }

  if (wsConfig.providers?.tavily?.enabled) {
    env.CCS_WEBSEARCH_TAVILY = '1';
    env.CCS_WEBSEARCH_TAVILY_MAX_RESULTS = String(wsConfig.providers.tavily.max_results || 5);
  }

  if (wsConfig.providers?.duckduckgo?.enabled) {
    env.CCS_WEBSEARCH_DUCKDUCKGO = '1';
    env.CCS_WEBSEARCH_DUCKDUCKGO_MAX_RESULTS = String(
      wsConfig.providers.duckduckgo.max_results || 5
    );
  }

  if (wsConfig.providers?.brave?.enabled) {
    env.CCS_WEBSEARCH_BRAVE = '1';
    env.CCS_WEBSEARCH_BRAVE_MAX_RESULTS = String(wsConfig.providers.brave.max_results || 5);
  }

  const searxngBaseUrl = normalizeSearxngBaseUrl(wsConfig.providers?.searxng?.url);
  if (wsConfig.providers?.searxng?.enabled && searxngBaseUrl) {
    env.CCS_WEBSEARCH_SEARXNG = '1';
    env.CCS_WEBSEARCH_SEARXNG_URL = searxngBaseUrl;
    env.CCS_WEBSEARCH_SEARXNG_MAX_RESULTS = String(wsConfig.providers.searxng.max_results || 5);
  }

  if (wsConfig.providers?.agy?.enabled) {
    env.CCS_WEBSEARCH_AGY = '1';
    if (wsConfig.providers.agy.model) {
      env.CCS_WEBSEARCH_AGY_MODEL = wsConfig.providers.agy.model;
    }
    // Antigravity is the primary CLI fallback, so its timeout wins.
    env.CCS_WEBSEARCH_TIMEOUT = String(wsConfig.providers.agy.timeout || 90);
  }

  if (wsConfig.providers?.gemini?.enabled) {
    env.CCS_WEBSEARCH_GEMINI = '1';
    if (wsConfig.providers.gemini.model) {
      env.CCS_WEBSEARCH_GEMINI_MODEL = wsConfig.providers.gemini.model;
    }
    // Only set if Antigravity (primary) has not already chosen the timeout.
    if (!env.CCS_WEBSEARCH_TIMEOUT) {
      env.CCS_WEBSEARCH_TIMEOUT = String(wsConfig.providers.gemini.timeout || 55);
    }
  }

  if (wsConfig.providers?.opencode?.enabled) {
    env.CCS_WEBSEARCH_OPENCODE = '1';
    if (wsConfig.providers.opencode.model) {
      env.CCS_WEBSEARCH_OPENCODE_MODEL = wsConfig.providers.opencode.model;
    }
    // Use opencode timeout if no gemini timeout set
    if (!env.CCS_WEBSEARCH_TIMEOUT) {
      env.CCS_WEBSEARCH_TIMEOUT = String(wsConfig.providers.opencode.timeout || 90);
    }
  }

  if (wsConfig.providers?.grok?.enabled) {
    env.CCS_WEBSEARCH_GROK = '1';
    // Use grok timeout if no other timeout set
    if (!env.CCS_WEBSEARCH_TIMEOUT) {
      env.CCS_WEBSEARCH_TIMEOUT = String(wsConfig.providers.grok.timeout || 55);
    }
  }

  // Default timeout if none set
  if (!env.CCS_WEBSEARCH_TIMEOUT) {
    env.CCS_WEBSEARCH_TIMEOUT = '55';
  }

  return env;
}
