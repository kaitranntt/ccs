/**
 * WebSearch Module Barrel Export
 *
 * Re-exports all WebSearch functionality from submodules.
 *
 * @module utils/websearch
 */

// Types
export type {
  GeminiCliStatus,
  GrokCliStatus,
  OpenCodeCliStatus,
  WebSearchReadiness,
  WebSearchStatus,
  WebSearchCliInfo,
  WebSearchProviderConfig,
  WebSearchConfig,
} from './types';

export type { WebSearchApiKeyState } from './provider-secrets';

// Gemini CLI
export {
  getGeminiCliStatus,
  hasGeminiCli,
  isGeminiAuthenticated,
  clearGeminiCliCache,
} from './gemini-cli';

// Grok CLI
export { getGrokCliStatus, hasGrokCli, clearGrokCliCache } from './grok-cli';

// OpenCode CLI
export { getOpenCodeCliStatus, hasOpenCodeCli, clearOpenCodeCliCache } from './opencode-cli';

// Hook Installation
export {
  getHookPath,
  hasWebSearchHook,
  getWebSearchHookConfig,
  installWebSearchHook,
  removeMigrationMarker,
  uninstallWebSearchHook,
} from './hook-installer';

// Hook Config (removal)
export { removeHookConfig } from './hook-config';

// Hook Environment
export { getWebSearchHookEnv } from './hook-env';

// MCP Runtime
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
} from './mcp-installer';

// Claude launch args
export { appendThirdPartyWebSearchToolArgs } from './claude-tool-args';

// Trace helpers
export {
  appendWebSearchTrace,
  createWebSearchTraceContext,
  isWebSearchTraceEnabled,
  readWebSearchTraceRecords,
} from './trace';

// Status and Readiness
export {
  getWebSearchCliProviders,
  hasAnyWebSearchCli,
  getCliInstallHints,
  getWebSearchReadiness,
  displayWebSearchStatus,
} from './status';

export { WEBSEARCH_API_KEY_PROVIDERS, getWebSearchApiKeyStates } from './provider-secrets';

// Profile compatibility hook injection
export { ensureProfileHooks, ensureProfileHooksOrThrow } from './profile-hook-injector';
