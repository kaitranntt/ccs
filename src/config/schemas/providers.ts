/**
 * Provider integration configuration types and defaults.
 *
 * Re-exports from focused sub-modules for backward compatibility.
 * Actual definitions live in:
 * - copilot-cursor.ts: CopilotConfig, CursorConfig + defaults
 * - proxy-server.ts: CliproxyServerConfig, OpenAICompatProxyConfig,
 *   GlobalEnvConfig, ContinuityConfig, ImageAnalysisConfig + defaults
 */

export type { CopilotAccountType, CopilotConfig, CursorConfig } from './copilot-cursor';
export { DEFAULT_COPILOT_CONFIG, DEFAULT_CURSOR_CONFIG } from './copilot-cursor';

export type {
  ProxyRemoteConfig,
  ProxyFallbackConfig,
  ProxyLocalConfig,
  OpenAICompatProxyRoutingConfig,
  OpenAICompatProxyConfig,
  CliproxyServerConfig,
  GlobalEnvConfig,
  ContinuityConfig,
  ImageAnalysisConfig,
} from './proxy-server';
export {
  DEFAULT_CLIPROXY_SERVER_CONFIG,
  DEFAULT_OPENAI_COMPAT_PROXY_CONFIG,
  DEFAULT_GLOBAL_ENV,
  DEFAULT_IMAGE_ANALYSIS_CONFIG,
} from './proxy-server';
