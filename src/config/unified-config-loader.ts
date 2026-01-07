/**
 * Unified Config Loader
 *
 * Loads and saves the unified YAML configuration.
 * Provides fallback to legacy JSON format for backward compatibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getCcsDir } from '../utils/config-manager';
import {
  UnifiedConfig,
  isUnifiedConfig,
  createEmptyUnifiedConfig,
  UNIFIED_CONFIG_VERSION,
  DEFAULT_COPILOT_CONFIG,
  DEFAULT_GLOBAL_ENV,
  DEFAULT_CLIPROXY_SERVER_CONFIG,
  DEFAULT_QUOTA_MANAGEMENT_CONFIG,
  GlobalEnvConfig,
} from './unified-config-types';
import { isUnifiedConfigEnabled } from './feature-flags';

const CONFIG_YAML = 'config.yaml';
const CONFIG_JSON = 'config.json';

/**
 * Get path to unified config.yaml
 */
export function getConfigYamlPath(): string {
  return path.join(getCcsDir(), CONFIG_YAML);
}

/**
 * Get path to legacy config.json
 */
export function getConfigJsonPath(): string {
  return path.join(getCcsDir(), CONFIG_JSON);
}

/**
 * Check if unified config.yaml exists
 */
export function hasUnifiedConfig(): boolean {
  return fs.existsSync(getConfigYamlPath());
}

/**
 * Check if legacy config.json exists
 */
export function hasLegacyConfig(): boolean {
  return fs.existsSync(getConfigJsonPath());
}

/**
 * Determine which config format is active.
 * Returns 'yaml' if unified config exists or is enabled,
 * 'json' if only legacy config exists,
 * 'none' if no config exists.
 */
export function getConfigFormat(): 'yaml' | 'json' | 'none' {
  if (hasUnifiedConfig()) return 'yaml';
  if (isUnifiedConfigEnabled()) return 'yaml';
  if (hasLegacyConfig()) return 'json';
  return 'none';
}

/**
 * Load unified config from YAML file.
 * Returns null if file doesn't exist or format check fails.
 * Auto-upgrades config if version is outdated (regenerates comments).
 */
export function loadUnifiedConfig(): UnifiedConfig | null {
  const yamlPath = getConfigYamlPath();

  // If file doesn't exist, return null
  if (!fs.existsSync(yamlPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(yamlPath, 'utf8');
    const parsed = yaml.load(content);

    if (!isUnifiedConfig(parsed)) {
      console.error(`[!] Invalid config format in ${yamlPath}`);
      return null;
    }

    // Auto-upgrade if version is outdated (regenerates YAML with new comments and fields)
    if ((parsed.version ?? 1) < UNIFIED_CONFIG_VERSION) {
      // Merge with defaults to add new fields (e.g., model for websearch providers)
      const upgraded = mergeWithDefaults(parsed);
      upgraded.version = UNIFIED_CONFIG_VERSION;
      try {
        saveUnifiedConfig(upgraded);
        if (process.env.CCS_DEBUG) {
          console.error(`[i] Config upgraded to v${UNIFIED_CONFIG_VERSION}`);
        }
        return upgraded;
      } catch {
        // Ignore save errors during upgrade - config still works
      }
    }

    return parsed;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[X] Failed to load config: ${error}`);
    return null;
  }
}

/**
 * Merge partial config with defaults.
 * Preserves existing data while filling in missing sections.
 */
function mergeWithDefaults(partial: Partial<UnifiedConfig>): UnifiedConfig {
  const defaults = createEmptyUnifiedConfig();
  return {
    version: partial.version ?? defaults.version,
    default: partial.default ?? defaults.default,
    accounts: partial.accounts ?? defaults.accounts,
    profiles: partial.profiles ?? defaults.profiles,
    cliproxy: {
      oauth_accounts: partial.cliproxy?.oauth_accounts ?? defaults.cliproxy.oauth_accounts,
      providers: defaults.cliproxy.providers, // Always use defaults for providers
      variants: partial.cliproxy?.variants ?? defaults.cliproxy.variants,
      logging: {
        enabled: partial.cliproxy?.logging?.enabled ?? defaults.cliproxy.logging?.enabled ?? false,
        request_log:
          partial.cliproxy?.logging?.request_log ?? defaults.cliproxy.logging?.request_log ?? false,
      },
      // Auth config - preserve user values, no defaults (uses constants as fallback)
      auth: partial.cliproxy?.auth,
    },
    preferences: {
      ...defaults.preferences,
      ...partial.preferences,
    },
    websearch: {
      enabled: partial.websearch?.enabled ?? defaults.websearch?.enabled ?? true,
      providers: {
        gemini: {
          enabled:
            partial.websearch?.providers?.gemini?.enabled ??
            partial.websearch?.gemini?.enabled ?? // Legacy fallback
            true,
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
    // Global env - injected into all non-Claude subscription profiles
    global_env: {
      enabled: partial.global_env?.enabled ?? true,
      env: partial.global_env?.env ?? { ...DEFAULT_GLOBAL_ENV },
    },
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
    },
  };
}

/**
 * Load config, preferring YAML if available, falling back to creating empty config.
 * Merges with defaults to ensure all sections exist.
 */
export function loadOrCreateUnifiedConfig(): UnifiedConfig {
  const existing = loadUnifiedConfig();
  if (existing) {
    // Merge with defaults to fill any missing sections
    return mergeWithDefaults(existing);
  }

  // Create empty config
  const config = createEmptyUnifiedConfig();
  return config;
}

/**
 * Generate YAML header with helpful comments.
 */
function generateYamlHeader(): string {
  return `# CCS Unified Configuration
# Docs: https://github.com/kaitranntt/ccs
`;
}

/**
 * Generate YAML content with section comments for better readability.
 */
function generateYamlWithComments(config: UnifiedConfig): string {
  const lines: string[] = [];

  // Version
  lines.push(`version: ${config.version}`);
  lines.push('');

  // Default
  if (config.default) {
    lines.push(`# Default profile used when running 'ccs' without arguments`);
    lines.push(`default: "${config.default}"`);
    lines.push('');
  }

  // Accounts section
  lines.push('# ----------------------------------------------------------------------------');
  lines.push('# Accounts: Isolated Claude instances (each with separate auth/sessions)');
  lines.push('# Manage with: ccs auth add <name>, ccs auth list, ccs auth remove <name>');
  lines.push('# ----------------------------------------------------------------------------');
  lines.push(
    yaml.dump({ accounts: config.accounts }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
  );
  lines.push('');

  // Profiles section
  lines.push('# ----------------------------------------------------------------------------');
  lines.push('# Profiles: API-based providers (GLM, GLMT, Kimi, custom endpoints)');
  lines.push('# Each profile points to a *.settings.json file containing env vars.');
  lines.push('# Edit the settings file directly to customize (ANTHROPIC_MAX_TOKENS, etc.)');
  lines.push('# ----------------------------------------------------------------------------');
  lines.push(
    yaml.dump({ profiles: config.profiles }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
  );
  lines.push('');

  // CLIProxy section
  lines.push('# ----------------------------------------------------------------------------');
  lines.push('# CLIProxy: OAuth-based providers (gemini, codex, agy, qwen, iflow)');
  lines.push('# Each variant can reference a *.settings.json file for custom env vars.');
  lines.push('# Edit the settings file directly to customize model or other settings.');
  lines.push('# ----------------------------------------------------------------------------');
  lines.push(
    yaml.dump({ cliproxy: config.cliproxy }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
  );
  lines.push('');

  // CLIProxy Server section (remote proxy configuration) - placed right after cliproxy
  if (config.cliproxy_server) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# CLIProxy Server: Remote proxy connection settings');
    lines.push('# Configure via Dashboard (`ccs config`) > Proxy tab.');
    lines.push('#');
    lines.push('# remote: Connect to a remote CLIProxyAPI instance');
    lines.push('# fallback: Use local proxy if remote is unreachable');
    lines.push('# local: Local proxy settings (port, auto-start)');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump(
          { cliproxy_server: config.cliproxy_server },
          { indent: 2, lineWidth: -1, quotingType: '"' }
        )
        .trim()
    );
    lines.push('');
  }

  // Preferences section
  lines.push('# ----------------------------------------------------------------------------');
  lines.push('# Preferences: User settings');
  lines.push('# ----------------------------------------------------------------------------');
  lines.push(
    yaml
      .dump({ preferences: config.preferences }, { indent: 2, lineWidth: -1, quotingType: '"' })
      .trim()
  );
  lines.push('');

  // WebSearch section
  if (config.websearch) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# WebSearch: CLI-based web search for third-party profiles');
    lines.push('# Dashboard (`ccs config`) is the source of truth for provider selection.');
    lines.push('#');
    lines.push('# Third-party providers (gemini, codex, agy, etc.) do not have access to');
    lines.push("# Anthropic's WebSearch tool. These CLI tools provide fallback web search.");
    lines.push('#');
    lines.push('# Fallback chain: Gemini -> OpenCode -> Grok (tries in order until success)');
    lines.push('#');
    lines.push(
      '# Gemini models: gemini-2.5-flash (default), gemini-2.5-pro, gemini-2.5-flash-lite'
    );
    lines.push(
      '# OpenCode models: opencode/grok-code (default), opencode/gpt-4o, opencode/claude-3.5-sonnet'
    );
    lines.push('#');
    lines.push('# Install commands:');
    lines.push('#   gemini: npm i -g @google/gemini-cli (FREE - 1000 req/day)');
    lines.push('#   opencode: curl -fsSL https://opencode.ai/install | bash (FREE via Zen)');
    lines.push('#   grok: npm i -g @vibe-kit/grok-cli (requires GROK_API_KEY)');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump({ websearch: config.websearch }, { indent: 2, lineWidth: -1, quotingType: '"' })
        .trim()
    );
    lines.push('');
  }

  // Copilot section (GitHub Copilot proxy)
  if (config.copilot) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Copilot: GitHub Copilot API proxy (via copilot-api)');
    lines.push('# Uses your existing GitHub Copilot subscription with Claude Code.');
    lines.push('#');
    lines.push('# !! DISCLAIMER - USE AT YOUR OWN RISK !!');
    lines.push('# This uses an UNOFFICIAL reverse-engineered API.');
    lines.push('# Excessive usage may trigger GitHub account restrictions.');
    lines.push('# CCS provides NO WARRANTY and accepts NO RESPONSIBILITY for consequences.');
    lines.push('#');
    lines.push('# Setup: npx copilot-api auth (authenticate with GitHub)');
    lines.push('# Usage: ccs copilot (switch to copilot profile)');
    lines.push('#');
    lines.push('# Models: claude-sonnet-4.5, claude-opus-4.5, gpt-5.1, gemini-2.5-pro');
    lines.push('# Account types: individual, business, enterprise');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml.dump({ copilot: config.copilot }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
    );
    lines.push('');
  }

  // Global env section
  if (config.global_env) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      '# Global Environment Variables: Injected into all non-Claude subscription profiles'
    );
    lines.push('# These env vars disable telemetry/reporting for third-party providers.');
    lines.push('# Configure via Dashboard (`ccs config`) > Global Env tab.');
    lines.push('#');
    lines.push('# Default variables:');
    lines.push('#   DISABLE_BUG_COMMAND: Disables /bug command (not supported by proxy)');
    lines.push('#   DISABLE_ERROR_REPORTING: Disables error reporting to Anthropic');
    lines.push('#   DISABLE_TELEMETRY: Disables usage telemetry');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump({ global_env: config.global_env }, { indent: 2, lineWidth: -1, quotingType: '"' })
        .trim()
    );
    lines.push('');
  }

  // Router section (multi-provider tier routing)
  if (config.router && Object.keys(config.router).length > 0) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Router: Multi-provider tier routing for Claude API requests');
    lines.push('# Routes opus/sonnet/haiku tiers to different providers with fallback chains.');
    lines.push('# Configure via Dashboard (`ccs config`) > Router tab or `ccs router` CLI.');
    lines.push('#');
    lines.push('# Profiles define which provider/model handles each tier:');
    lines.push('#   opus: High-capability tier (Claude Opus, GPT-4.5, Gemini Ultra)');
    lines.push('#   sonnet: Balanced tier (Claude Sonnet, GPT-4, Gemini Pro)');
    lines.push('#   haiku: Fast/cheap tier (Claude Haiku, GPT-3.5, Gemini Flash)');
    lines.push('#');
    lines.push('# Each tier supports fallback chains for redundancy.');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml.dump({ router: config.router }, { indent: 2, lineWidth: -1, quotingType: '"' }).trim()
    );
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Save unified config to YAML file.
 * Uses atomic write (temp file + rename) to prevent corruption.
 */
export function saveUnifiedConfig(config: UnifiedConfig): void {
  const yamlPath = getConfigYamlPath();
  const dir = path.dirname(yamlPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Ensure version is set
  config.version = UNIFIED_CONFIG_VERSION;

  // Generate YAML with section comments
  const yamlContent = generateYamlWithComments(config);
  const content = generateYamlHeader() + yamlContent;

  // Atomic write: write to temp file, then rename
  const tempPath = `${yamlPath}.tmp.${process.pid}`;

  try {
    fs.writeFileSync(tempPath, content, { mode: 0o600 });
    fs.renameSync(tempPath, yamlPath);
  } catch (err) {
    // Clean up temp file on error
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw err;
  }
}

/**
 * Update unified config with partial data.
 * Loads existing config, merges changes, and saves.
 */
export function updateUnifiedConfig(updates: Partial<UnifiedConfig>): UnifiedConfig {
  const config = loadOrCreateUnifiedConfig();
  const updated = { ...config, ...updates };
  saveUnifiedConfig(updated);
  return updated;
}

/**
 * Check if unified config mode is active.
 * Returns true if config.yaml exists OR CCS_UNIFIED_CONFIG=1.
 *
 * Use this centralized function instead of duplicating the logic.
 */
export function isUnifiedMode(): boolean {
  return hasUnifiedConfig() || isUnifiedConfigEnabled();
}

/**
 * Get or set default profile name.
 */
export function getDefaultProfile(): string | undefined {
  const config = loadUnifiedConfig();
  return config?.default;
}

export function setDefaultProfile(name: string): void {
  updateUnifiedConfig({ default: name });
}

/**
 * Gemini CLI WebSearch configuration
 */
export interface GeminiWebSearchInfo {
  enabled: boolean;
  model: string;
  timeout: number;
}

/**
 * Get websearch configuration.
 * Returns defaults if not configured.
 * Supports Gemini CLI, OpenCode, and Grok CLI providers.
 */
export function getWebSearchConfig(): {
  enabled: boolean;
  providers?: {
    gemini?: GeminiWebSearchInfo;
    opencode?: { enabled?: boolean; model?: string; timeout?: number };
    grok?: { enabled?: boolean; timeout?: number };
  };
  // Legacy fields (deprecated)
  gemini?: { enabled?: boolean; timeout?: number };
} {
  const config = loadOrCreateUnifiedConfig();

  // Build provider configs
  const geminiConfig: GeminiWebSearchInfo = {
    enabled:
      config.websearch?.providers?.gemini?.enabled ?? config.websearch?.gemini?.enabled ?? true,
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
  const anyProviderEnabled = geminiConfig.enabled || opencodeConfig.enabled || grokConfig.enabled;
  const enabled = anyProviderEnabled && (config.websearch?.enabled ?? true);

  return {
    enabled,
    providers: {
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
  const config = loadOrCreateUnifiedConfig();
  return {
    enabled: config.global_env?.enabled ?? true,
    env: config.global_env?.env ?? { ...DEFAULT_GLOBAL_ENV },
  };
}
