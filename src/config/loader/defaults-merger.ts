/**
 * defaults-merger.ts
 *
 * mergeWithDefaults function extracted from unified-config-loader.ts
 * (Phase 4 split — issue #1164).
 *
 * Pure transform: no I/O, no side effects. Merges a partial UnifiedConfig
 * with defaults, filling in missing sections.
 *
 * Circular-import note: this module imports from normalizers.ts (Phase 2)
 * and io-locks.ts (Phase 1) is NOT imported here, so there is no cycle.
 * io-locks.ts callbacks (mergeWithDefaults, validateCompositeVariants) are
 * now replaced with direct imports in unified-config-loader.ts (Phase 6).
 */

import {
  createEmptyUnifiedConfig,
  DEFAULT_COPILOT_CONFIG,
  DEFAULT_CURSOR_CONFIG,
  DEFAULT_GLOBAL_ENV,
  DEFAULT_CLIPROXY_SERVER_CONFIG,
  DEFAULT_CLIPROXY_SAFETY_CONFIG,
  DEFAULT_OPENAI_COMPAT_PROXY_CONFIG,
  DEFAULT_QUOTA_MANAGEMENT_CONFIG,
  DEFAULT_THINKING_CONFIG,
  DEFAULT_DASHBOARD_AUTH_CONFIG,
  DEFAULT_IMAGE_ANALYSIS_CONFIG,
  DEFAULT_LOGGING_CONFIG,
} from '../unified-config-types';
import type { UnifiedConfig } from '../unified-config-types';
import { canonicalizeBrowserConfig, normalizeSessionAffinityTtl } from './normalizers';
import { normalizeContinuityConfig, normalizeOfficialChannelsConfig } from './normalizers';
import type { LegacyDiscordChannelsConfig } from './normalizers';
import { canonicalizeImageAnalysisConfig } from '../../utils/hooks/image-analysis-backend-resolver';
import { normalizeSearxngBaseUrl } from '../../utils/websearch/types';

// ---------------------------------------------------------------------------
// mergeWithDefaults
// ---------------------------------------------------------------------------

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Merge partial config with defaults.
 * Preserves existing data while filling in missing sections.
 */
export function mergeWithDefaults(partial: Partial<UnifiedConfig>): UnifiedConfig {
  const defaults = createEmptyUnifiedConfig();
  const continuity = normalizeContinuityConfig(partial);
  return {
    version: partial.version ?? defaults.version,
    setup_completed: partial.setup_completed,
    default: partial.default ?? defaults.default,
    accounts: partial.accounts ?? defaults.accounts,
    profiles: partial.profiles ?? defaults.profiles,
    cliproxy: {
      ...partial.cliproxy,
      oauth_accounts: partial.cliproxy?.oauth_accounts ?? defaults.cliproxy.oauth_accounts,
      providers: defaults.cliproxy.providers, // Always use defaults for providers
      variants: partial.cliproxy?.variants ?? defaults.cliproxy.variants,
      logging: {
        enabled: partial.cliproxy?.logging?.enabled ?? defaults.cliproxy.logging?.enabled ?? false,
        request_log:
          partial.cliproxy?.logging?.request_log ?? defaults.cliproxy.logging?.request_log ?? false,
      },
      safety: {
        antigravity_ack_bypass:
          partial.cliproxy?.safety?.antigravity_ack_bypass ??
          DEFAULT_CLIPROXY_SAFETY_CONFIG.antigravity_ack_bypass,
      },
      // Kiro browser behavior setting (optional)
      kiro_no_incognito: partial.cliproxy?.kiro_no_incognito,
      // Auth config - preserve user values, no defaults (uses constants as fallback)
      auth: partial.cliproxy?.auth,
      // Background token refresh config (optional)
      token_refresh: partial.cliproxy?.token_refresh,
      // Backend selection - validate and preserve user choice (original vs plus)
      backend:
        partial.cliproxy?.backend === 'original' || partial.cliproxy?.backend === 'plus'
          ? partial.cliproxy.backend
          : undefined, // Invalid values become undefined (defaults to 'original' at runtime)
      management_panel_repository: normalizeOptionalString(
        partial.cliproxy?.management_panel_repository
      ),
      // Auto-sync - default to true
      auto_sync: partial.cliproxy?.auto_sync ?? defaults.cliproxy.auto_sync ?? true,
      routing: {
        strategy:
          partial.cliproxy?.routing?.strategy === 'fill-first' ||
          partial.cliproxy?.routing?.strategy === 'round-robin'
            ? partial.cliproxy.routing.strategy
            : defaults.cliproxy.routing?.strategy,
        session_affinity:
          typeof partial.cliproxy?.routing?.session_affinity === 'boolean'
            ? partial.cliproxy.routing.session_affinity
            : defaults.cliproxy.routing?.session_affinity,
        session_affinity_ttl: normalizeSessionAffinityTtl(
          partial.cliproxy?.routing?.session_affinity_ttl,
          defaults.cliproxy.routing?.session_affinity_ttl ?? '1h'
        ),
      },
    },
    proxy: {
      port: partial.proxy?.port ?? DEFAULT_OPENAI_COMPAT_PROXY_CONFIG.port,
      profile_ports: partial.proxy?.profile_ports ?? {
        ...DEFAULT_OPENAI_COMPAT_PROXY_CONFIG.profile_ports,
      },
      routing: {
        default: partial.proxy?.routing?.default ?? defaults.proxy?.routing?.default,
        background: partial.proxy?.routing?.background ?? defaults.proxy?.routing?.background,
        think: partial.proxy?.routing?.think ?? defaults.proxy?.routing?.think,
        longContext: partial.proxy?.routing?.longContext ?? defaults.proxy?.routing?.longContext,
        webSearch: partial.proxy?.routing?.webSearch ?? defaults.proxy?.routing?.webSearch,
        longContextThreshold:
          partial.proxy?.routing?.longContextThreshold ??
          defaults.proxy?.routing?.longContextThreshold,
      },
    },
    logging: {
      enabled: partial.logging?.enabled ?? DEFAULT_LOGGING_CONFIG.enabled,
      level: partial.logging?.level ?? DEFAULT_LOGGING_CONFIG.level,
      rotate_mb: partial.logging?.rotate_mb ?? DEFAULT_LOGGING_CONFIG.rotate_mb,
      retain_days: partial.logging?.retain_days ?? DEFAULT_LOGGING_CONFIG.retain_days,
      redact: partial.logging?.redact ?? DEFAULT_LOGGING_CONFIG.redact,
      live_buffer_size:
        partial.logging?.live_buffer_size ?? DEFAULT_LOGGING_CONFIG.live_buffer_size,
    },
    preferences: {
      ...defaults.preferences,
      ...partial.preferences,
    },
    websearch: {
      enabled: partial.websearch?.enabled ?? defaults.websearch?.enabled ?? true,
      providers: {
        exa: {
          enabled: partial.websearch?.providers?.exa?.enabled ?? false,
          max_results: partial.websearch?.providers?.exa?.max_results ?? 5,
        },
        tavily: {
          enabled: partial.websearch?.providers?.tavily?.enabled ?? false,
          max_results: partial.websearch?.providers?.tavily?.max_results ?? 5,
        },
        brave: {
          enabled: partial.websearch?.providers?.brave?.enabled ?? false,
          max_results: partial.websearch?.providers?.brave?.max_results ?? 5,
        },
        searxng: {
          enabled: partial.websearch?.providers?.searxng?.enabled ?? false,
          url: normalizeSearxngBaseUrl(partial.websearch?.providers?.searxng?.url) ?? '',
          max_results: partial.websearch?.providers?.searxng?.max_results ?? 5,
        },
        duckduckgo: {
          enabled: partial.websearch?.providers?.duckduckgo?.enabled ?? true,
          max_results: partial.websearch?.providers?.duckduckgo?.max_results ?? 5,
        },
        gemini: {
          enabled:
            partial.websearch?.providers?.gemini?.enabled ??
            partial.websearch?.gemini?.enabled ?? // Legacy fallback
            false,
          model: partial.websearch?.providers?.gemini?.model ?? 'gemini-2.5-flash',
          timeout:
            partial.websearch?.providers?.gemini?.timeout ??
            partial.websearch?.gemini?.timeout ?? // Legacy fallback
            55,
        },
        opencode: {
          enabled: partial.websearch?.providers?.opencode?.enabled ?? false,
          model: partial.websearch?.providers?.opencode?.model ?? 'opencode/grok-code',
          timeout: partial.websearch?.providers?.opencode?.timeout ?? 90,
        },
        grok: {
          enabled: partial.websearch?.providers?.grok?.enabled ?? false,
          timeout: partial.websearch?.providers?.grok?.timeout ?? 55,
        },
      },
      // Legacy fields (keep for backwards compatibility during read)
      gemini: partial.websearch?.gemini,
    },
    // Copilot config - strictly opt-in, merge with defaults
    copilot: {
      enabled: partial.copilot?.enabled ?? DEFAULT_COPILOT_CONFIG.enabled,
      auto_start: partial.copilot?.auto_start ?? DEFAULT_COPILOT_CONFIG.auto_start,
      port: partial.copilot?.port ?? DEFAULT_COPILOT_CONFIG.port,
      account_type: partial.copilot?.account_type ?? DEFAULT_COPILOT_CONFIG.account_type,
      rate_limit: partial.copilot?.rate_limit ?? DEFAULT_COPILOT_CONFIG.rate_limit,
      wait_on_limit: partial.copilot?.wait_on_limit ?? DEFAULT_COPILOT_CONFIG.wait_on_limit,
      model: partial.copilot?.model ?? DEFAULT_COPILOT_CONFIG.model,
    },
    // Cursor config - disabled by default, merge with defaults
    cursor: {
      enabled: partial.cursor?.enabled ?? DEFAULT_CURSOR_CONFIG.enabled,
      port: partial.cursor?.port ?? DEFAULT_CURSOR_CONFIG.port,
      auto_start: partial.cursor?.auto_start ?? DEFAULT_CURSOR_CONFIG.auto_start,
      ghost_mode: partial.cursor?.ghost_mode ?? DEFAULT_CURSOR_CONFIG.ghost_mode,
      model: partial.cursor?.model ?? DEFAULT_CURSOR_CONFIG.model,
      opus_model: partial.cursor?.opus_model,
      sonnet_model: partial.cursor?.sonnet_model,
      haiku_model: partial.cursor?.haiku_model,
    },
    // Global env - injected into all non-Claude subscription profiles
    global_env: {
      enabled: partial.global_env?.enabled ?? true,
      env: partial.global_env?.env ?? { ...DEFAULT_GLOBAL_ENV },
    },
    continuity,
    // CLIProxy server config - remote/local CLIProxyAPI settings
    cliproxy_server: {
      remote: {
        enabled:
          partial.cliproxy_server?.remote?.enabled ?? DEFAULT_CLIPROXY_SERVER_CONFIG.remote.enabled,
        host: partial.cliproxy_server?.remote?.host ?? DEFAULT_CLIPROXY_SERVER_CONFIG.remote.host,
        // Port is optional - undefined means use protocol default (443 for HTTPS, 8317 for HTTP)
        port: partial.cliproxy_server?.remote?.port,
        protocol:
          partial.cliproxy_server?.remote?.protocol ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.remote.protocol,
        auth_token:
          partial.cliproxy_server?.remote?.auth_token ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.remote.auth_token,
        // management_key is optional - falls back to auth_token when not set
        management_key: partial.cliproxy_server?.remote?.management_key,
      },
      fallback: {
        enabled:
          partial.cliproxy_server?.fallback?.enabled ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.fallback.enabled,
        auto_start:
          partial.cliproxy_server?.fallback?.auto_start ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.fallback.auto_start,
      },
      local: {
        port: partial.cliproxy_server?.local?.port ?? DEFAULT_CLIPROXY_SERVER_CONFIG.local.port,
        auto_start:
          partial.cliproxy_server?.local?.auto_start ??
          DEFAULT_CLIPROXY_SERVER_CONFIG.local.auto_start,
      },
    },
    // Quota management config - hybrid auto+manual account selection
    quota_management: {
      mode: partial.quota_management?.mode ?? DEFAULT_QUOTA_MANAGEMENT_CONFIG.mode,
      auto: {
        preflight_check:
          partial.quota_management?.auto?.preflight_check ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.auto.preflight_check,
        exhaustion_threshold:
          partial.quota_management?.auto?.exhaustion_threshold ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.auto.exhaustion_threshold,
        tier_priority:
          partial.quota_management?.auto?.tier_priority ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.auto.tier_priority,
        cooldown_minutes:
          partial.quota_management?.auto?.cooldown_minutes ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.auto.cooldown_minutes,
      },
      manual: {
        paused_accounts:
          partial.quota_management?.manual?.paused_accounts ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.manual.paused_accounts,
        forced_default:
          partial.quota_management?.manual?.forced_default ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.manual.forced_default,
        tier_lock:
          partial.quota_management?.manual?.tier_lock ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.manual.tier_lock,
      },
      runtime_monitor: {
        enabled:
          partial.quota_management?.runtime_monitor?.enabled ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.enabled,
        normal_interval_seconds:
          partial.quota_management?.runtime_monitor?.normal_interval_seconds ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.normal_interval_seconds,
        critical_interval_seconds:
          partial.quota_management?.runtime_monitor?.critical_interval_seconds ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.critical_interval_seconds,
        warn_threshold:
          partial.quota_management?.runtime_monitor?.warn_threshold ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.warn_threshold,
        exhaustion_threshold:
          partial.quota_management?.runtime_monitor?.exhaustion_threshold ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.exhaustion_threshold,
        cooldown_minutes:
          partial.quota_management?.runtime_monitor?.cooldown_minutes ??
          DEFAULT_QUOTA_MANAGEMENT_CONFIG.runtime_monitor.cooldown_minutes,
      },
    },
    // Thinking config - auto/manual/off control for reasoning budget
    thinking: {
      mode: partial.thinking?.mode ?? DEFAULT_THINKING_CONFIG.mode,
      override: partial.thinking?.override,
      tier_defaults: {
        opus: partial.thinking?.tier_defaults?.opus ?? DEFAULT_THINKING_CONFIG.tier_defaults.opus,
        sonnet:
          partial.thinking?.tier_defaults?.sonnet ?? DEFAULT_THINKING_CONFIG.tier_defaults.sonnet,
        haiku:
          partial.thinking?.tier_defaults?.haiku ?? DEFAULT_THINKING_CONFIG.tier_defaults.haiku,
      },
      provider_overrides: partial.thinking?.provider_overrides,
      show_warnings: partial.thinking?.show_warnings ?? DEFAULT_THINKING_CONFIG.show_warnings,
    },
    channels: normalizeOfficialChannelsConfig(
      partial as Partial<UnifiedConfig> & { discord_channels?: LegacyDiscordChannelsConfig }
    ),
    // Dashboard auth config - disabled by default
    dashboard_auth: {
      enabled: partial.dashboard_auth?.enabled ?? DEFAULT_DASHBOARD_AUTH_CONFIG.enabled,
      username: partial.dashboard_auth?.username ?? DEFAULT_DASHBOARD_AUTH_CONFIG.username,
      password_hash:
        partial.dashboard_auth?.password_hash ?? DEFAULT_DASHBOARD_AUTH_CONFIG.password_hash,
      session_timeout_hours:
        partial.dashboard_auth?.session_timeout_hours ??
        DEFAULT_DASHBOARD_AUTH_CONFIG.session_timeout_hours,
    },
    browser: canonicalizeBrowserConfig(partial.browser),
    // Image analysis config - enabled by default for CLIProxy providers
    image_analysis: canonicalizeImageAnalysisConfig({
      enabled: partial.image_analysis?.enabled ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.enabled,
      timeout: partial.image_analysis?.timeout ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.timeout,
      provider_models:
        partial.image_analysis?.provider_models ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models,
      fallback_backend:
        partial.image_analysis?.fallback_backend ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.fallback_backend,
      profile_backends:
        partial.image_analysis?.profile_backends ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.profile_backends,
    }),
  };
}
