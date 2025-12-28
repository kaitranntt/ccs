/**
 * Unified Config Types for CCS v2
 *
 * This file defines the new unified YAML configuration format that consolidates:
 * - config.json (API profiles)
 * - profiles.json (account metadata)
 * - *.settings.json (env vars)
 *
 * Into a single config.yaml structure.
 */

/**
 * Unified config version.
 * Version 2 = YAML unified format
 * Version 3 = WebSearch config with model configuration for Gemini/OpenCode
 * Version 4 = Copilot API integration (GitHub Copilot proxy)
 * Version 5 = Remote proxy configuration (connect to remote CLIProxyAPI)
 * Version 6 = Customizable auth tokens (API key and management secret)
 */
export const UNIFIED_CONFIG_VERSION = 6;

/**
 * Account configuration (formerly in profiles.json).
 * Represents an isolated Claude instance via CLAUDE_CONFIG_DIR.
 */
export interface AccountConfig {
  /** ISO timestamp when account was created */
  created: string;
  /** ISO timestamp of last usage, null if never used */
  last_used: string | null;
}

/**
 * API-based profile configuration.
 * Injects environment variables for alternative providers (GLM, Kimi, etc.).
 *
 * Settings are stored in separate *.settings.json files (matching Claude's pattern)
 * to allow users to edit them directly without touching config.yaml.
 */
export interface ProfileConfig {
  /** Profile type - currently only 'api' */
  type: 'api';
  /** Path to settings file (e.g., "~/.ccs/glm.settings.json") */
  settings: string;
}

/**
 * CLIProxy OAuth account nickname mapping.
 * Maps user-friendly nicknames to email addresses.
 */
export type OAuthAccounts = Record<string, string>;

/**
 * CLIProxy variant configuration.
 * User-defined variants of built-in OAuth providers.
 *
 * Settings are stored in separate *.settings.json files (matching Claude's pattern)
 * to allow users to edit them directly without touching config.yaml.
 */
export interface CLIProxyVariantConfig {
  /** Base provider to use */
  provider: 'gemini' | 'codex' | 'agy' | 'qwen' | 'iflow' | 'kiro' | 'ghcp';
  /** Account nickname (references oauth_accounts) */
  account?: string;
  /** Path to settings file (e.g., "~/.ccs/gemini-custom.settings.json") */
  settings?: string;
  /** Unique port for variant isolation (8318-8417) */
  port?: number;
  /** Per-variant auth override (optional) */
  auth?: CLIProxyAuthConfig;
}

/**
 * CLIProxy authentication configuration.
 * Allows customization of API key and management secret for CLIProxyAPI.
 */
export interface CLIProxyAuthConfig {
  /** API key for CCS-managed requests (default: 'ccs-internal-managed') */
  api_key?: string;
  /** Management secret for Control Panel login (default: 'ccs') */
  management_secret?: string;
}

/**
 * CLIProxy logging configuration.
 * Controls whether CLIProxyAPI writes logs to disk.
 * Logs can grow to several GB if left enabled.
 */
export interface CLIProxyLoggingConfig {
  /** Enable logging to file (default: false to prevent disk bloat) */
  enabled?: boolean;
  /** Enable request logging for debugging (default: false) */
  request_log?: boolean;
}

/**
 * CLIProxy configuration section.
 */
export interface CLIProxyConfig {
  /** Nickname to email mapping for OAuth accounts */
  oauth_accounts: OAuthAccounts;
  /** Built-in providers (read-only, for reference) */
  providers: readonly string[];
  /** User-defined provider variants */
  variants: Record<string, CLIProxyVariantConfig>;
  /** Logging configuration (disabled by default) */
  logging?: CLIProxyLoggingConfig;
  /** Kiro: disable incognito browser mode (use normal browser to save credentials) */
  kiro_no_incognito?: boolean;
  /** Global auth configuration for CLIProxyAPI */
  auth?: CLIProxyAuthConfig;
}

/**
 * User preferences.
 */
export interface PreferencesConfig {
  /** UI theme preference */
  theme?: 'light' | 'dark' | 'system';
  /** Enable anonymous telemetry */
  telemetry?: boolean;
  /** Enable automatic update checks */
  auto_update?: boolean;
}

/**
 * Gemini CLI WebSearch configuration.
 */
export interface GeminiWebSearchConfig {
  /** Enable Gemini CLI for WebSearch (default: true) */
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
  /** Enable Grok CLI for WebSearch (default: false - requires GROK_API_KEY) */
  enabled?: boolean;
  /** Timeout in seconds (default: 55) */
  timeout?: number;
}

/**
 * OpenCode CLI WebSearch configuration.
 */
export interface OpenCodeWebSearchConfig {
  /** Enable OpenCode CLI for WebSearch (default: false) */
  enabled?: boolean;
  /** Model to use (default: opencode/grok-code) */
  model?: string;
  /** Timeout in seconds (default: 60) */
  timeout?: number;
}

/**
 * WebSearch providers configuration.
 * Supports Gemini CLI, Grok CLI, and OpenCode.
 */
export interface WebSearchProvidersConfig {
  /** Gemini CLI - uses google_web_search tool (FREE tier: 1000 req/day) */
  gemini?: GeminiWebSearchConfig;
  /** Grok CLI - xAI web search (requires GROK_API_KEY) */
  grok?: GrokWebSearchConfig;
  /** OpenCode - built-in web search (FREE via OpenCode Zen) */
  opencode?: OpenCodeWebSearchConfig;
}

/**
 * Copilot API account type.
 */
export type CopilotAccountType = 'individual' | 'business' | 'enterprise';

/**
 * Copilot API configuration.
 * Enables GitHub Copilot subscription usage via copilot-api proxy.
 * Strictly opt-in - disabled by default.
 *
 * !! DISCLAIMER - USE AT YOUR OWN RISK !!
 * This uses an UNOFFICIAL reverse-engineered API.
 * Excessive usage may trigger GitHub account restrictions.
 * CCS provides NO WARRANTY and accepts NO RESPONSIBILITY for any consequences.
 */
export interface CopilotConfig {
  /** Enable Copilot integration (default: false) - must be explicitly enabled */
  enabled: boolean;
  /** Auto-start copilot-api daemon when using profile (default: false) */
  auto_start: boolean;
  /** Port for copilot-api proxy (default: 4141) */
  port: number;
  /** GitHub Copilot account type (default: individual) */
  account_type: CopilotAccountType;
  /** Rate limit in seconds between requests (null = no limit) */
  rate_limit: number | null;
  /** Wait instead of error when rate limit is hit (default: true) */
  wait_on_limit: boolean;
  /** Default model ID (e.g., claude-sonnet-4.5) */
  model: string;
  /** Model mapping for Claude tiers - maps opus/sonnet/haiku to specific models */
  opus_model?: string;
  sonnet_model?: string;
  haiku_model?: string;
}

/**
 * Remote proxy configuration.
 * Connect to a remote CLIProxyAPI instance instead of spawning local binary.
 */
export interface ProxyRemoteConfig {
  /** Enable remote proxy mode (default: false = local mode) */
  enabled: boolean;
  /** Remote proxy hostname or IP (empty = not configured) */
  host: string;
  /**
   * Remote proxy port.
   * Optional - defaults based on protocol:
   * - HTTPS: 443
   * - HTTP: 80
   * When empty/undefined, uses protocol default.
   */
  port?: number;
  /** Protocol for remote connection */
  protocol: 'http' | 'https';
  /** Auth token for remote proxy (optional, sent as header) */
  auth_token: string;
  /** Connection timeout in milliseconds (default: 2000) */
  timeout?: number;
}

/**
 * Fallback configuration when remote proxy is unreachable.
 */
export interface ProxyFallbackConfig {
  /** Enable fallback to local proxy (default: true) */
  enabled: boolean;
  /** Auto-start local proxy without prompting (default: false = prompt user) */
  auto_start: boolean;
}

/**
 * Local proxy configuration.
 */
export interface ProxyLocalConfig {
  /** Local proxy port (default: 8317) */
  port: number;
  /** Auto-start local binary (default: true) */
  auto_start: boolean;
}

/**
 * CLIProxy server configuration section.
 * Controls whether CCS uses local or remote CLIProxyAPI instance.
 */
export interface CliproxyServerConfig {
  /** Remote proxy settings */
  remote: ProxyRemoteConfig;
  /** Fallback behavior when remote is unreachable */
  fallback: ProxyFallbackConfig;
  /** Local proxy settings */
  local: ProxyLocalConfig;
}

/**
 * Global environment variables configuration.
 * These env vars are injected into ALL non-Claude subscription profiles.
 * Useful for disabling telemetry, bug commands, error reporting, etc.
 */
export interface GlobalEnvConfig {
  /** Enable global env injection (default: true) */
  enabled: boolean;
  /** Environment variables to inject */
  env: Record<string, string>;
}

/**
 * Default global env vars for third-party profiles.
 * These disable Claude Code telemetry/reporting since we're using proxy.
 */
export const DEFAULT_GLOBAL_ENV: Record<string, string> = {
  DISABLE_BUG_COMMAND: '1',
  DISABLE_ERROR_REPORTING: '1',
  DISABLE_TELEMETRY: '1',
};

/**
 * WebSearch configuration.
 * Uses CLI tools (Gemini CLI, Grok CLI, OpenCode) for third-party profiles.
 * Third-party providers don't have server-side WebSearch access.
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

/**
 * Main unified configuration structure.
 * Stored in ~/.ccs/config.yaml
 */
export interface UnifiedConfig {
  /** Config version (5 for remote proxy support) */
  version: number;
  /** Default profile name to use when none specified */
  default?: string;
  /** Account-based profiles (isolated Claude instances) */
  accounts: Record<string, AccountConfig>;
  /** API-based profiles (env var injection) */
  profiles: Record<string, ProfileConfig>;
  /** CLIProxy configuration */
  cliproxy: CLIProxyConfig;
  /** User preferences */
  preferences: PreferencesConfig;
  /** WebSearch configuration */
  websearch?: WebSearchConfig;
  /** Global environment variables for all non-Claude subscription profiles */
  global_env?: GlobalEnvConfig;
  /** Copilot API configuration (GitHub Copilot proxy) */
  copilot?: CopilotConfig;
  /** CLIProxy server configuration for remote/local mode */
  cliproxy_server?: CliproxyServerConfig;
}

/**
 * Default Copilot configuration.
 * Strictly opt-in - disabled by default.
 * Uses gpt-4.1 as default model (free tier compatible).
 */
export const DEFAULT_COPILOT_CONFIG: CopilotConfig = {
  enabled: false,
  auto_start: false,
  port: 4141,
  account_type: 'individual',
  rate_limit: null,
  wait_on_limit: true,
  model: 'gpt-4.1', // Free tier compatible
};

/**
 * Default CLIProxy server configuration.
 * Local mode by default - remote must be explicitly enabled.
 * Port is optional for remote - defaults based on protocol.
 */
export const DEFAULT_CLIPROXY_SERVER_CONFIG: CliproxyServerConfig = {
  remote: {
    enabled: false,
    host: '',
    // port is intentionally omitted - will use protocol default (443 for HTTPS, 8317 for HTTP)
    protocol: 'http',
    auth_token: '',
  },
  fallback: {
    enabled: true,
    auto_start: false,
  },
  local: {
    port: 8317,
    auto_start: true,
  },
};

/**
 * Create an empty unified config with defaults.
 */
export function createEmptyUnifiedConfig(): UnifiedConfig {
  return {
    version: UNIFIED_CONFIG_VERSION,
    default: undefined,
    accounts: {},
    profiles: {},
    cliproxy: {
      oauth_accounts: {},
      providers: ['gemini', 'codex', 'agy', 'qwen', 'iflow', 'kiro', 'ghcp'],
      variants: {},
      logging: {
        enabled: false,
        request_log: false,
      },
    },
    preferences: {
      theme: 'system',
      telemetry: false,
      auto_update: true,
    },
    websearch: {
      enabled: true,
      providers: {
        gemini: {
          enabled: true,
          model: 'gemini-2.5-flash',
          timeout: 55,
        },
        opencode: {
          enabled: false,
          model: 'opencode/grok-code',
          timeout: 90,
        },
        grok: {
          enabled: false,
          timeout: 55,
        },
      },
    },
    global_env: {
      enabled: true,
      env: { ...DEFAULT_GLOBAL_ENV },
    },
    copilot: { ...DEFAULT_COPILOT_CONFIG },
    cliproxy_server: { ...DEFAULT_CLIPROXY_SERVER_CONFIG },
  };
}

/**
 * Type guard for UnifiedConfig.
 * Relaxed validation: accepts configs with version >= 1 and any subset of sections.
 * Missing sections will be filled with defaults during merge.
 */
export function isUnifiedConfig(obj: unknown): obj is UnifiedConfig {
  if (typeof obj !== 'object' || obj === null) return false;
  const config = obj as Record<string, unknown>;
  // Only require version to be a number >= 1 (allow future versions)
  // Sections are optional - will be merged with defaults in loadOrCreateUnifiedConfig
  return typeof config.version === 'number' && config.version >= 1;
}
