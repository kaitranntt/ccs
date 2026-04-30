/**
 * Tests: config schemas re-export backward compatibility.
 *
 * Verifies that every type, interface, constant, and function originally
 * exported from unified-config-types.ts is still accessible via both
 * the barrel file and the schemas/index barrel.
 */

import { describe, it, expect } from 'bun:test';

// Import from the backward-compatible barrel (this is what all existing code uses)
import * as barrel from '../../unified-config-types';

// Import from the new schemas barrel (this is what the barrel delegates to)
import * as schemas from '../index';

// ---------------------------------------------------------------------------
// Type-level checks (compile-time, not runtime)
// ---------------------------------------------------------------------------

// Verify key interfaces are accessible as types
import type {
  UnifiedConfig,
  AccountConfig,
  ProfileConfig,
  OAuthAccounts,
  CLIProxyAuthConfig,
  TokenRefreshSettings,
  DashboardAuthConfig,
  CLIProxyVariantConfig,
  CompositeTierConfig,
  CompositeVariantConfig,
  CLIProxyLoggingConfig,
  CLIProxySafetyConfig,
  CLIProxyRoutingConfig,
  CLIProxyConfig,
  AutoQuotaConfig,
  RuntimeMonitorConfig,
  ManualQuotaConfig,
  QuotaManagementMode,
  QuotaManagementConfig,
  ThinkingMode,
  ThinkingTierDefaults,
  ThinkingConfig,
  OfficialChannelId,
  OfficialChannelsConfig,
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
  BrowserToolPolicy,
  BrowserEvalMode,
  BrowserClaudeConfig,
  BrowserCodexConfig,
  BrowserConfig,
  LoggingLevel,
  LoggingConfig,
  PreferencesConfig,
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
} from '../../unified-config-types';

describe('config schemas backward compatibility', () => {
  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------
  it('re-exports UNIFIED_CONFIG_VERSION', () => {
    expect(barrel.UNIFIED_CONFIG_VERSION).toBe(13);
    expect(schemas.UNIFIED_CONFIG_VERSION).toBe(13);
  });

  it('re-exports CLIPROXY_SUPPORTED_PROVIDERS', () => {
    expect(Array.isArray(barrel.CLIPROXY_SUPPORTED_PROVIDERS)).toBe(true);
    expect(barrel.CLIPROXY_SUPPORTED_PROVIDERS.length).toBeGreaterThan(0);
    expect(barrel.CLIPROXY_SUPPORTED_PROVIDERS).toEqual(schemas.CLIPROXY_SUPPORTED_PROVIDERS);
  });

  // -------------------------------------------------------------------------
  // Default constants
  // -------------------------------------------------------------------------
  const defaultConstants = [
    'DEFAULT_CLIPROXY_SAFETY_CONFIG',
    'DEFAULT_LOGGING_CONFIG',
    'DEFAULT_OFFICIAL_CHANNELS_CONFIG',
    'DEFAULT_BROWSER_CONFIG',
    'DEFAULT_DASHBOARD_AUTH_CONFIG',
    'DEFAULT_AUTO_QUOTA_CONFIG',
    'DEFAULT_MANUAL_QUOTA_CONFIG',
    'DEFAULT_RUNTIME_MONITOR_CONFIG',
    'DEFAULT_QUOTA_MANAGEMENT_CONFIG',
    'DEFAULT_THINKING_TIER_DEFAULTS',
    'DEFAULT_THINKING_CONFIG',
    'DEFAULT_COPILOT_CONFIG',
    'DEFAULT_CURSOR_CONFIG',
    'DEFAULT_CLIPROXY_SERVER_CONFIG',
    'DEFAULT_OPENAI_COMPAT_PROXY_CONFIG',
    'DEFAULT_GLOBAL_ENV',
    'DEFAULT_IMAGE_ANALYSIS_CONFIG',
  ] as const;

  for (const name of defaultConstants) {
    it(`re-exports ${name}`, () => {
      expect(barrel[name]).toBeDefined();
      expect(barrel[name]).toEqual(schemas[name]);
    });
  }

  // -------------------------------------------------------------------------
  // Functions
  // -------------------------------------------------------------------------
  it('re-exports createEmptyUnifiedConfig', () => {
    expect(typeof barrel.createEmptyUnifiedConfig).toBe('function');
    expect(typeof schemas.createEmptyUnifiedConfig).toBe('function');

    const config = barrel.createEmptyUnifiedConfig();
    expect(config.version).toBe(13);
    expect(config.accounts).toEqual({});
    expect(config.profiles).toEqual({});
    expect(config.cliproxy).toBeDefined();
    expect(config.cliproxy.oauth_accounts).toEqual({});
    expect(config.cliproxy.variants).toEqual({});
    expect(config.logging).toBeDefined();
    expect(config.preferences).toBeDefined();
    expect(config.browser).toBeDefined();
    expect(config.image_analysis).toBeDefined();
    expect(config.quota_management).toBeDefined();
    expect(config.thinking).toBeDefined();
    expect(config.channels).toBeDefined();
    expect(config.dashboard_auth).toBeDefined();
    expect(config.copilot).toBeDefined();
    expect(config.cursor).toBeDefined();
    expect(config.cliproxy_server).toBeDefined();
    expect(config.websearch).toBeDefined();
  });

  it('re-exports isUnifiedConfig', () => {
    expect(typeof barrel.isUnifiedConfig).toBe('function');
    expect(typeof schemas.isUnifiedConfig).toBe('function');

    expect(barrel.isUnifiedConfig({ version: 13 })).toBe(true);
    expect(barrel.isUnifiedConfig(null)).toBe(false);
    expect(barrel.isUnifiedConfig({})).toBe(false);
    expect(barrel.isUnifiedConfig({ version: 0 })).toBe(false);
    expect(barrel.isUnifiedConfig({ version: 1 })).toBe(true);
    expect(barrel.isUnifiedConfig('not an object')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Barrel has all expected runtime exports (type-only exports are verified
  // at compile time via the import type block above — they are erased at
  // runtime and cannot be checked with the `in` operator).
  // -------------------------------------------------------------------------
  const expectedRuntimeExports = [
    'UNIFIED_CONFIG_VERSION',
    'CLIPROXY_SUPPORTED_PROVIDERS',
    'createEmptyUnifiedConfig',
    'isUnifiedConfig',
    'DEFAULT_CLIPROXY_SAFETY_CONFIG',
    'DEFAULT_LOGGING_CONFIG',
    'DEFAULT_OFFICIAL_CHANNELS_CONFIG',
    'DEFAULT_BROWSER_CONFIG',
    'DEFAULT_DASHBOARD_AUTH_CONFIG',
    'DEFAULT_AUTO_QUOTA_CONFIG',
    'DEFAULT_MANUAL_QUOTA_CONFIG',
    'DEFAULT_RUNTIME_MONITOR_CONFIG',
    'DEFAULT_QUOTA_MANAGEMENT_CONFIG',
    'DEFAULT_THINKING_TIER_DEFAULTS',
    'DEFAULT_THINKING_CONFIG',
    'DEFAULT_COPILOT_CONFIG',
    'DEFAULT_CURSOR_CONFIG',
    'DEFAULT_CLIPROXY_SERVER_CONFIG',
    'DEFAULT_OPENAI_COMPAT_PROXY_CONFIG',
    'DEFAULT_GLOBAL_ENV',
    'DEFAULT_IMAGE_ANALYSIS_CONFIG',
  ] as const;

  for (const name of expectedRuntimeExports) {
    it(`barrel exports "${name}"`, () => {
      expect(name in barrel).toBe(true);
    });
  }
});
