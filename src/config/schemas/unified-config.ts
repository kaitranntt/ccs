/**
 * Main unified configuration interface, factory, and type guard.
 *
 * The UnifiedConfig type is the root of the entire config.yaml schema.
 * This file imports all section types from their respective schema modules.
 */

import type { AccountConfig, ProfileConfig, DashboardAuthConfig } from './auth';
import { DEFAULT_DASHBOARD_AUTH_CONFIG } from './auth';
import type { CLIProxyConfig } from './cliproxy';
import { CLIPROXY_SUPPORTED_PROVIDERS, DEFAULT_CLIPROXY_SAFETY_CONFIG } from './cliproxy';
import type { LoggingConfig, PreferencesConfig } from './logging';
import { DEFAULT_LOGGING_CONFIG } from './logging';
import type { WebSearchConfig } from './websearch';
import type {
  GlobalEnvConfig,
  ContinuityConfig,
  CopilotConfig,
  CursorConfig,
  CliproxyServerConfig,
  OpenAICompatProxyConfig,
  ImageAnalysisConfig,
} from './providers';
import {
  DEFAULT_COPILOT_CONFIG,
  DEFAULT_CURSOR_CONFIG,
  DEFAULT_CLIPROXY_SERVER_CONFIG,
  DEFAULT_OPENAI_COMPAT_PROXY_CONFIG,
  DEFAULT_IMAGE_ANALYSIS_CONFIG,
  DEFAULT_GLOBAL_ENV,
} from './providers';
import { UNIFIED_CONFIG_VERSION } from './version';
import type { QuotaManagementConfig } from './quota';
import { DEFAULT_QUOTA_MANAGEMENT_CONFIG } from './quota';
import type { ThinkingConfig } from './thinking';
import { DEFAULT_THINKING_CONFIG } from './thinking';
import type { OfficialChannelsConfig } from './channels';
import { DEFAULT_OFFICIAL_CHANNELS_CONFIG } from './channels';
import type { BrowserConfig } from './browser';
import { DEFAULT_BROWSER_CONFIG } from './browser';

/**
 * Main unified configuration structure.
 * Stored in ~/.ccs/config.yaml
 */
export interface UnifiedConfig {
  /** Config version */
  version: number;
  /** Flag indicating setup wizard has been completed */
  setup_completed?: boolean;
  /** Default profile name to use when none specified */
  default?: string;
  /** Account-based profiles (isolated Claude instances) */
  accounts: Record<string, AccountConfig>;
  /** API-based profiles (env var injection) */
  profiles: Record<string, ProfileConfig>;
  /** CLIProxy configuration */
  cliproxy: CLIProxyConfig;
  /** OpenAI-compatible local proxy configuration */
  proxy?: OpenAICompatProxyConfig;
  /** CCS-owned structured logging configuration */
  logging?: LoggingConfig;
  /** User preferences */
  preferences: PreferencesConfig;
  /** WebSearch configuration */
  websearch?: WebSearchConfig;
  /** Global environment variables for all non-Claude subscription profiles */
  global_env?: GlobalEnvConfig;
  /** Cross-profile continuity inheritance mapping */
  continuity?: ContinuityConfig;
  /** Copilot API configuration (GitHub Copilot proxy) */
  copilot?: CopilotConfig;
  /** Cursor IDE configuration (Cursor proxy daemon) */
  cursor?: CursorConfig;
  /** CLIProxy server configuration for remote/local mode */
  cliproxy_server?: CliproxyServerConfig;
  /** Quota management configuration (v7+) */
  quota_management?: QuotaManagementConfig;
  /** Thinking/reasoning budget configuration (v8+) */
  thinking?: ThinkingConfig;
  /** Official Channels runtime auto-enable preferences (v11+) */
  channels?: OfficialChannelsConfig;
  /** Dashboard authentication configuration (optional) */
  dashboard_auth?: DashboardAuthConfig;
  /** Browser automation configuration */
  browser?: BrowserConfig;
  /** Image analysis configuration (vision via CLIProxy) */
  image_analysis?: ImageAnalysisConfig;
}

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
      backend: 'original',
      oauth_accounts: {},
      providers: [...CLIPROXY_SUPPORTED_PROVIDERS],
      variants: {},
      logging: {
        enabled: false,
        request_log: false,
      },
      safety: { ...DEFAULT_CLIPROXY_SAFETY_CONFIG },
      auto_sync: true,
      routing: {
        strategy: 'round-robin',
        session_affinity: false,
        session_affinity_ttl: '1h',
      },
    },
    proxy: {
      port: DEFAULT_OPENAI_COMPAT_PROXY_CONFIG.port,
      profile_ports: { ...DEFAULT_OPENAI_COMPAT_PROXY_CONFIG.profile_ports },
      routing: {
        ...DEFAULT_OPENAI_COMPAT_PROXY_CONFIG.routing,
      },
    },
    logging: { ...DEFAULT_LOGGING_CONFIG },
    preferences: {
      theme: 'system',
      telemetry: false,
      auto_update: true,
    },
    websearch: {
      enabled: true,
      providers: {
        exa: {
          enabled: false,
          max_results: 5,
        },
        tavily: {
          enabled: false,
          max_results: 5,
        },
        brave: {
          enabled: false,
          max_results: 5,
        },
        searxng: {
          enabled: false,
          url: '',
          max_results: 5,
        },
        duckduckgo: {
          enabled: true,
          max_results: 5,
        },
        gemini: {
          enabled: false,
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
    cursor: { ...DEFAULT_CURSOR_CONFIG },
    cliproxy_server: { ...DEFAULT_CLIPROXY_SERVER_CONFIG },
    quota_management: { ...DEFAULT_QUOTA_MANAGEMENT_CONFIG },
    thinking: { ...DEFAULT_THINKING_CONFIG },
    channels: { ...DEFAULT_OFFICIAL_CHANNELS_CONFIG },
    dashboard_auth: { ...DEFAULT_DASHBOARD_AUTH_CONFIG },
    browser: {
      claude: { ...DEFAULT_BROWSER_CONFIG.claude },
      codex: { ...DEFAULT_BROWSER_CONFIG.codex },
    },
    image_analysis: { ...DEFAULT_IMAGE_ANALYSIS_CONFIG },
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
