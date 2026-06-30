/**
 * WebSearch Manager - Manages CCS WebSearch runtime
 *
 * WebSearch is a server-side tool executed by Anthropic's API.
 * Third-party providers (gemini, agy, codex, qwen) don't have access.
 * CCS exposes a first-class local WebSearch tool for those profiles and keeps
 * the legacy hook runtime only as a compatibility fallback.
 *
 * Runtime Architecture:
 *   - User-scope MCP server in ~/.claude.json for third-party profiles
 *   - Real search providers first (Exa, Tavily, Brave Search, DuckDuckGo)
 *   - Gemini/OpenCode/Grok retained as optional legacy fallback
 *
 * @module utils/websearch-manager
 */

// Re-export types
export type {
  AgyCliStatus,
  GeminiCliStatus,
  GrokCliStatus,
  OpenCodeCliStatus,
  WebSearchReadiness,
  WebSearchStatus,
  WebSearchCliInfo,
} from './websearch/types';

// Re-export CLI detection functions
export { getAgyCliStatus, hasAgyCli, clearAgyCliCache } from './websearch/agy';

export {
  getGeminiCliStatus,
  hasGeminiCli,
  isGeminiAuthenticated,
  clearGeminiCliCache,
} from './websearch/gemini-cli';

export { getGrokCliStatus, hasGrokCli, clearGrokCliCache } from './websearch/grok-cli';

export {
  getOpenCodeCliStatus,
  hasOpenCodeCli,
  clearOpenCodeCliCache,
} from './websearch/opencode-cli';

// Re-export hook management functions
export {
  getHookPath,
  hasWebSearchHook,
  getWebSearchHookConfig,
  installWebSearchHook,
  removeMigrationMarker,
  uninstallWebSearchHook,
} from './websearch/hook-installer';

// Re-export hook environment
export { getWebSearchHookEnv } from './websearch/hook-env';

// Re-export MCP runtime helpers
export {
  getWebSearchMcpServerName,
  getWebSearchMcpServerPath,
  installWebSearchMcpServer,
  ensureWebSearchMcpConfig,
  ensureWebSearchMcp,
  uninstallWebSearchMcpServer,
  removeWebSearchMcpConfig,
  uninstallWebSearchMcp,
  syncWebSearchMcpToConfigDir,
  ensureWebSearchMcpForLaunch,
  ensureWebSearchMcpOrThrow,
} from './websearch/mcp-installer';

// Re-export Claude launch arg helpers
export { appendThirdPartyWebSearchToolArgs } from './websearch/claude-tool-args';

// Re-export trace helpers
export {
  appendWebSearchTrace,
  createWebSearchTraceContext,
  isWebSearchTraceEnabled,
  readWebSearchTraceRecords,
} from './websearch/trace';

// Re-export status and readiness functions
export {
  getWebSearchCliProviders,
  hasAnyWebSearchCli,
  getCliInstallHints,
  getWebSearchReadiness,
  displayWebSearchStatus,
} from './websearch/status';

// Re-export profile compatibility hook injection
export { ensureProfileHooks, ensureProfileHooksOrThrow } from './websearch/profile-hook-injector';

// Import for local use
import {
  clearAgyCliCache,
  clearGeminiCliCache,
  clearGrokCliCache,
  clearOpenCodeCliCache,
} from './websearch';

/**
 * Clear all CLI caches
 */
export function clearAllCliCaches(): void {
  clearAgyCliCache();
  clearGeminiCliCache();
  clearGrokCliCache();
  clearOpenCodeCliCache();
}

export { ensureWebSearchMcp as ensureMcpWebSearch } from './websearch/mcp-installer';
