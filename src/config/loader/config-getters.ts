/**
 * config-getters.ts
 *
 * Typed sub-config accessor functions extracted from unified-config-loader.ts
 * (Phase 5 split — issue #1164).
 *
 * All functions read the loaded config via loadOrCreateUnifiedConfig and
 * return typed sub-configs with defaults applied.
 *
 * No I/O beyond what loadOrCreateUnifiedConfig performs internally.
 */

import {
  DEFAULT_CLIPROXY_SAFETY_CONFIG,
  DEFAULT_CURSOR_CONFIG,
  DEFAULT_GLOBAL_ENV,
  DEFAULT_IMAGE_ANALYSIS_CONFIG,
  DEFAULT_LOGGING_CONFIG,
  DEFAULT_OFFICIAL_CHANNELS_CONFIG,
  DEFAULT_THINKING_CONFIG,
  buildOutputLimitsEnv,
} from '../unified-config-types';
import type {
  BrowserConfig,
  CLIProxySafetyConfig,
  CursorConfig,
  DashboardAuthConfig,
  GlobalEnvConfig,
  ImageAnalysisConfig,
  LoggingConfig,
  OfficialChannelsConfig,
  ThinkingConfig,
} from '../unified-config-types';
import { canonicalizeBrowserConfig } from './normalizers';
import { canonicalizeImageAnalysisConfig } from '../../utils/hooks/image-analysis-backend-resolver';
import { normalizeOfficialChannelIds } from '../../channels/official-channels-ids';
import { normalizeSearxngBaseUrl } from '../../utils/websearch/types';

// ---------------------------------------------------------------------------
// Circular-import safety: loadOrCreateUnifiedConfig lives in
// unified-config-loader.ts which imports this file. We break the cycle by
// using a lazy require() inside getConfig() so the module is resolved at
// call time (after both modules have finished loading) rather than at import
// time. This also preserves spy/mock compatibility: test spies replace the
// function on the module namespace object, and require() returns that live
// namespace, so the spy is always picked up.
// ---------------------------------------------------------------------------

function getConfig(): import('../unified-config-types').UnifiedConfig {
  const loader = require('../unified-config-loader') as {
    loadOrCreateUnifiedConfig: () => import('../unified-config-types').UnifiedConfig;
  };
  return loader.loadOrCreateUnifiedConfig();
}

function getPersistedConfig(): import('../unified-config-types').UnifiedConfig | null {
  const loader = require('../unified-config-loader') as {
    loadUnifiedConfig: () => import('../unified-config-types').UnifiedConfig | null;
  };
  return loader.loadUnifiedConfig();
}

// ---------------------------------------------------------------------------
// GeminiWebSearchInfo interface
// ---------------------------------------------------------------------------

/**
 * Gemini CLI WebSearch configuration
 */
export interface GeminiWebSearchInfo {
  enabled: boolean;
  model: string;
  timeout: number;
}

// ---------------------------------------------------------------------------
// Accessor functions
// ---------------------------------------------------------------------------

/**
 * Get websearch configuration.
 * Returns defaults if not configured.
 * Supports deterministic providers and optional Gemini/OpenCode/Grok CLI fallbacks.
 */
export function getWebSearchConfig(): {
  enabled: boolean;
  providers?: {
    exa?: { enabled?: boolean; max_results?: number };
    tavily?: { enabled?: boolean; max_results?: number };
    brave?: { enabled?: boolean; max_results?: number };
    searxng?: { enabled?: boolean; url?: string; max_results?: number };
    duckduckgo?: { enabled?: boolean; max_results?: number };
    gemini?: GeminiWebSearchInfo;
    opencode?: { enabled?: boolean; model?: string; timeout?: number };
    grok?: { enabled?: boolean; timeout?: number };
  };
  // Legacy fields (deprecated)
  gemini?: { enabled?: boolean; timeout?: number };
} {
  const config = getConfig();

  // Build provider configs
  const exaConfig = {
    enabled: config.websearch?.providers?.exa?.enabled ?? false,
    max_results: config.websearch?.providers?.exa?.max_results ?? 5,
  };

  const tavilyConfig = {
    enabled: config.websearch?.providers?.tavily?.enabled ?? false,
    max_results: config.websearch?.providers?.tavily?.max_results ?? 5,
  };

  const duckDuckGoConfig = {
    enabled: config.websearch?.providers?.duckduckgo?.enabled ?? true,
    max_results: config.websearch?.providers?.duckduckgo?.max_results ?? 5,
  };

  const braveConfig = {
    enabled: config.websearch?.providers?.brave?.enabled ?? false,
    max_results: config.websearch?.providers?.brave?.max_results ?? 5,
  };

  const searxngConfig = {
    enabled: config.websearch?.providers?.searxng?.enabled ?? false,
    url: normalizeSearxngBaseUrl(config.websearch?.providers?.searxng?.url) ?? '',
    max_results: config.websearch?.providers?.searxng?.max_results ?? 5,
  };

  const geminiConfig: GeminiWebSearchInfo = {
    enabled:
      config.websearch?.providers?.gemini?.enabled ?? config.websearch?.gemini?.enabled ?? false,
    model: config.websearch?.providers?.gemini?.model ?? 'gemini-2.5-flash',
    timeout:
      config.websearch?.providers?.gemini?.timeout ?? config.websearch?.gemini?.timeout ?? 55,
  };

  const opencodeConfig = {
    enabled: config.websearch?.providers?.opencode?.enabled ?? false,
    model: config.websearch?.providers?.opencode?.model ?? 'opencode/grok-code',
    timeout: config.websearch?.providers?.opencode?.timeout ?? 90,
  };

  const grokConfig = {
    enabled: config.websearch?.providers?.grok?.enabled ?? false,
    timeout: config.websearch?.providers?.grok?.timeout ?? 55,
  };

  // Auto-enable master switch if ANY provider is enabled
  const anyProviderEnabled =
    exaConfig.enabled ||
    tavilyConfig.enabled ||
    braveConfig.enabled ||
    searxngConfig.enabled ||
    duckDuckGoConfig.enabled ||
    geminiConfig.enabled ||
    opencodeConfig.enabled ||
    grokConfig.enabled;
  const enabled = anyProviderEnabled && (config.websearch?.enabled ?? true);

  return {
    enabled,
    providers: {
      exa: exaConfig,
      tavily: tavilyConfig,
      brave: braveConfig,
      searxng: searxngConfig,
      duckduckgo: duckDuckGoConfig,
      gemini: geminiConfig,
      opencode: opencodeConfig,
      grok: grokConfig,
    },
    // Legacy field for backwards compatibility
    gemini: config.websearch?.gemini,
  };
}

/**
 * Get global_env configuration.
 * Returns defaults if not configured.
 */
export function getGlobalEnvConfig(): GlobalEnvConfig {
  const config = getConfig();
  return {
    enabled: config.global_env?.enabled ?? true,
    env: config.global_env?.env ?? { ...DEFAULT_GLOBAL_ENV },
  };
}

/**
 * Get opt-in output-limit env vars for the spawned downstream CLI (issue #231).
 *
 * Returns ONLY the env vars the user has explicitly configured under
 * config.runtime.outputLimits. When the section is absent or empty, returns an
 * empty object so callers inject nothing and the downstream CLI keeps its own
 * defaults. All values are strings.
 */
export function getOutputLimitsEnv(): Record<string, string> {
  const config = getConfig();
  return buildOutputLimitsEnv(config.runtime?.outputLimits);
}

/**
 * Get continuity inheritance mapping.
 * Returns empty mapping when not configured.
 */
export function getContinuityInheritanceMap(): Record<string, string> {
  const config = getConfig();
  return config.continuity?.inherit_from_account ?? {};
}

/**
 * Get cliproxy safety configuration.
 * Returns defaults if not configured.
 */
export function getCliproxySafetyConfig(): CLIProxySafetyConfig {
  const config = getConfig();
  return {
    antigravity_ack_bypass:
      config.cliproxy?.safety?.antigravity_ack_bypass ??
      DEFAULT_CLIPROXY_SAFETY_CONFIG.antigravity_ack_bypass,
  };
}

/**
 * Get thinking configuration.
 * Returns defaults if not configured.
 */
export function getThinkingConfig(): ThinkingConfig {
  const config = getConfig();

  // W2: Check for invalid thinking config (e.g., thinking: true instead of object)
  if (config.thinking !== undefined && typeof config.thinking !== 'object') {
    console.warn(
      `[!] Invalid thinking config: expected object, got ${typeof config.thinking}. Using defaults.`
    );
    console.warn(`    Tip: Use 'thinking: { mode: auto }' instead of 'thinking: true'`);
    return DEFAULT_THINKING_CONFIG;
  }

  return {
    mode: config.thinking?.mode ?? DEFAULT_THINKING_CONFIG.mode,
    override: config.thinking?.override,
    tier_defaults: {
      opus: config.thinking?.tier_defaults?.opus ?? DEFAULT_THINKING_CONFIG.tier_defaults.opus,
      sonnet:
        config.thinking?.tier_defaults?.sonnet ?? DEFAULT_THINKING_CONFIG.tier_defaults.sonnet,
      haiku: config.thinking?.tier_defaults?.haiku ?? DEFAULT_THINKING_CONFIG.tier_defaults.haiku,
    },
    provider_overrides: config.thinking?.provider_overrides,
    show_warnings: config.thinking?.show_warnings ?? DEFAULT_THINKING_CONFIG.show_warnings,
  };
}

/**
 * Get Official Channels configuration.
 * Returns defaults if not configured.
 */
export function getOfficialChannelsConfig(): OfficialChannelsConfig {
  const config = getConfig();

  return {
    selected:
      config.channels?.selected && config.channels.selected.length > 0
        ? normalizeOfficialChannelIds(config.channels.selected)
        : DEFAULT_OFFICIAL_CHANNELS_CONFIG.selected,
    unattended: config.channels?.unattended ?? DEFAULT_OFFICIAL_CHANNELS_CONFIG.unattended,
  };
}

/**
 * Check if dashboard auth is enabled.
 * Priority: ENV vars > config.yaml > defaults
 */
export function isDashboardAuthEnabled(): boolean {
  const envEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;

  if (envEnabled !== undefined) {
    return envEnabled === 'true' || envEnabled === '1';
  }

  const config = getConfig();
  return config.dashboard_auth?.enabled ?? false;
}

/**
 * Get dashboard_auth configuration with ENV var override.
 * Priority: ENV vars > config.yaml > defaults
 */
export function getDashboardAuthConfig(): DashboardAuthConfig {
  const config = getConfig();

  // ENV vars take precedence
  const envEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
  const envUsername = process.env.CCS_DASHBOARD_USERNAME;
  const envPasswordHash = process.env.CCS_DASHBOARD_PASSWORD_HASH;

  return {
    enabled:
      envEnabled !== undefined
        ? envEnabled === 'true' || envEnabled === '1'
        : (config.dashboard_auth?.enabled ?? false),
    username: envUsername ?? config.dashboard_auth?.username ?? '',
    password_hash: envPasswordHash ?? config.dashboard_auth?.password_hash ?? '',
    session_timeout_hours: config.dashboard_auth?.session_timeout_hours ?? 24,
  };
}

/**
 * Get browser automation configuration.
 * Returns canonicalized defaults if not configured.
 */
export function getBrowserConfig(): BrowserConfig {
  const config = getConfig();
  return canonicalizeBrowserConfig(config.browser);
}

/**
 * Return whether the persisted browser config explicitly defines
 * claude.devtools_port. Canonicalized BrowserConfig values always contain a
 * default port, so config-backed browser attach callers must use this raw
 * persisted shape to decide whether the port should bypass profile discovery.
 */
export function hasExplicitClaudeBrowserDevtoolsPort(): boolean {
  const claude = getPersistedConfig()?.browser?.claude;
  if (!claude || !Object.prototype.hasOwnProperty.call(claude, 'devtools_port')) {
    return false;
  }

  const port = claude.devtools_port;
  return Number.isFinite(port) && Math.floor(port as number) === port && port >= 1 && port <= 65535;
}

/**
 * Get image_analysis configuration.
 * Returns defaults if not configured.
 */
export function getImageAnalysisConfig(): ImageAnalysisConfig {
  const config = getConfig();

  return canonicalizeImageAnalysisConfig({
    enabled: config.image_analysis?.enabled ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.enabled,
    timeout: config.image_analysis?.timeout ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.timeout,
    provider_models:
      config.image_analysis?.provider_models ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models,
    fallback_backend:
      config.image_analysis?.fallback_backend ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.fallback_backend,
    profile_backends:
      config.image_analysis?.profile_backends ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.profile_backends,
  });
}

/**
 * Get logging configuration.
 * Returns defaults if not configured.
 */
export function getLoggingConfig(): LoggingConfig {
  const config = getConfig();

  return {
    enabled: config.logging?.enabled ?? DEFAULT_LOGGING_CONFIG.enabled,
    level: config.logging?.level ?? DEFAULT_LOGGING_CONFIG.level,
    rotate_mb: config.logging?.rotate_mb ?? DEFAULT_LOGGING_CONFIG.rotate_mb,
    retain_days: config.logging?.retain_days ?? DEFAULT_LOGGING_CONFIG.retain_days,
    redact: config.logging?.redact ?? DEFAULT_LOGGING_CONFIG.redact,
    live_buffer_size: config.logging?.live_buffer_size ?? DEFAULT_LOGGING_CONFIG.live_buffer_size,
  };
}

/**
 * Get cursor configuration.
 * Returns defaults if not configured.
 */
export function getCursorConfig(): CursorConfig {
  const config = getConfig();
  return config.cursor ?? { ...DEFAULT_CURSOR_CONFIG };
}
