/**
 * Config schema barrel re-exports.
 *
 * All types, interfaces, constants, and functions originally in
 * unified-config-types.ts are re-exported here for backward compatibility.
 * Each module is responsible for a focused domain of the config schema.
 */

// Version constant
export { UNIFIED_CONFIG_VERSION } from './version';

// Account, profile, OAuth, auth types
export type {
  AccountConfig,
  ProfileConfig,
  OAuthAccounts,
  CLIProxyAuthConfig,
  TokenRefreshSettings,
  DashboardAuthConfig,
} from './auth';
export { DEFAULT_DASHBOARD_AUTH_CONFIG } from './auth';

// CLIProxy provider, variant, routing, safety, logging types
export { CLIPROXY_SUPPORTED_PROVIDERS, DEFAULT_CLIPROXY_SAFETY_CONFIG } from './cliproxy';
export type {
  CLIProxyVariantConfig,
  CompositeTierConfig,
  CompositeVariantConfig,
  CLIProxyLoggingConfig,
  CLIProxySafetyConfig,
  CLIProxyRoutingConfig,
  CLIProxyConfig,
} from './cliproxy';

// Quota management types and defaults
export {
  DEFAULT_AUTO_QUOTA_CONFIG,
  DEFAULT_MANUAL_QUOTA_CONFIG,
  DEFAULT_RUNTIME_MONITOR_CONFIG,
  DEFAULT_QUOTA_MANAGEMENT_CONFIG,
} from './quota';
export type {
  AutoQuotaConfig,
  RuntimeMonitorConfig,
  ManualQuotaConfig,
  QuotaManagementMode,
  QuotaManagementConfig,
} from './quota';

// Thinking/reasoning budget types and defaults
export { DEFAULT_THINKING_TIER_DEFAULTS, DEFAULT_THINKING_CONFIG } from './thinking';
export type { ThinkingMode, ThinkingTierDefaults, ThinkingConfig } from './thinking';

// Official channels types and defaults
export { DEFAULT_OFFICIAL_CHANNELS_CONFIG } from './channels';
export type { OfficialChannelId, OfficialChannelsConfig } from './channels';

// WebSearch backend types
export type {
  DuckDuckGoWebSearchConfig,
  BraveWebSearchConfig,
  ExaWebSearchConfig,
  TavilyWebSearchConfig,
  SearxngWebSearchConfig,
  GeminiWebSearchConfig,
  GrokWebSearchConfig,
  OpenCodeWebSearchConfig,
  WebSearchProvidersConfig,
  WebSearchConfig,
} from './websearch';

// Browser automation types and defaults
export { DEFAULT_BROWSER_CONFIG } from './browser';
export type {
  BrowserToolPolicy,
  BrowserEvalMode,
  BrowserClaudeConfig,
  BrowserCodexConfig,
  BrowserConfig,
} from './browser';

// Logging and preferences types and defaults
export { DEFAULT_LOGGING_CONFIG } from './logging';
export type { LoggingLevel, LoggingConfig, PreferencesConfig } from './logging';

// Provider integration types and defaults
export {
  DEFAULT_GLOBAL_ENV,
  DEFAULT_COPILOT_CONFIG,
  DEFAULT_CURSOR_CONFIG,
  DEFAULT_CLIPROXY_SERVER_CONFIG,
  DEFAULT_OPENAI_COMPAT_PROXY_CONFIG,
  DEFAULT_IMAGE_ANALYSIS_CONFIG,
} from './providers';
export type {
  CopilotAccountType,
  CopilotConfig,
  CursorConfig,
  ProxyRemoteConfig,
  ProxyFallbackConfig,
  ProxyLocalConfig,
  OpenAICompatProxyRoutingConfig,
  OpenAICompatProxyConfig,
  CliproxyServerConfig,
  GlobalEnvConfig,
  ContinuityConfig,
  ImageAnalysisConfig,
} from './providers';

// Main unified config interface, factory, and type guard
export { createEmptyUnifiedConfig, isUnifiedConfig } from './unified-config';
export type { UnifiedConfig } from './unified-config';
