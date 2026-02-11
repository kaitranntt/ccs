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
  DEFAULT_THINKING_CONFIG,
  DEFAULT_DASHBOARD_AUTH_CONFIG,
  DEFAULT_IMAGE_ANALYSIS_CONFIG,
  GlobalEnvConfig,
  ThinkingConfig,
  DashboardAuthConfig,
  ImageAnalysisConfig,
} from './unified-config-types';
import { isUnifiedConfigEnabled } from './feature-flags';

const CONFIG_YAML = 'config.yaml';
const CONFIG_JSON = 'config.json';
const CONFIG_LOCK = 'config.yaml.lock';
const LOCK_STALE_MS = 5000; // Lock is stale after 5 seconds

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
 * Get path to config lockfile
 */
function getLockFilePath(): string {
  return path.join(getCcsDir(), CONFIG_LOCK);
}

/**
 * Acquire lockfile for config write operations.
 * Returns true if lock acquired, false if already locked by another process.
 * Cleans up stale locks (older than LOCK_STALE_MS).
 */

function acquireLock(): boolean {
  const lockPath = getLockFilePath();
  const lockData = `${process.pid}\n${Date.now()}`;

  try {
    // Check if lock exists
    if (fs.existsSync(lockPath)) {
      const content = fs.readFileSync(lockPath, 'utf8');
      const [pidStr, timestampStr] = content.trim().split('\n');
      const timestamp = parseInt(timestampStr, 10);

      // Check if lock is stale
      if (Date.now() - timestamp > LOCK_STALE_MS) {
        // Stale lock - remove and acquire
        fs.unlinkSync(lockPath);
      } else {
        // Check if process still exists
        try {
          process.kill(parseInt(pidStr, 10), 0); // Signal 0 checks if process exists
          // Process exists - lock is valid
          return false;
        } catch {
          // Process doesn't exist - remove stale lock
          fs.unlinkSync(lockPath);
        }
      }
    }

    // Acquire lock
    fs.writeFileSync(lockPath, lockData, { flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) {
    // EEXIST means another process acquired the lock between our check and write
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }
    return false;
  }
}

/**
 * Release lockfile after config write operation.
 */

function releaseLock(): void {
  const lockPath = getLockFilePath();
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // Ignore cleanup errors
  }
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
      } catch (saveError) {
        console.error('[!] Config upgrade failed to save:', (saveError as Error).message);
        // Continue using the upgraded version in-memory even if save fails
      }
    }

    return parsed;
  } catch (err) {
    // U3: Provide better context for YAML syntax errors
    if (err instanceof yaml.YAMLException) {
      const mark = err.mark;
      console.error(`[X] YAML syntax error in ${yamlPath}:`);
      console.error(
        `    Line ${(mark?.line ?? 0) + 1}, Column ${(mark?.column ?? 0) + 1}: ${err.reason || 'Invalid syntax'}`
      );
      if (mark?.snippet) {
        console.error(`    ${mark.snippet}`);
      }
      console.error(
        `    Tip: Check for missing colons, incorrect indentation, or unquoted special characters.`
      );
    } else {
      const error = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[X] Failed to load config: ${error}`);
    }
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
    setup_completed: partial.setup_completed,
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
      // Backend selection - validate and preserve user choice (original vs plus)
      backend:
        partial.cliproxy?.backend === 'original' || partial.cliproxy?.backend === 'plus'
          ? partial.cliproxy.backend
          : undefined, // Invalid values become undefined (defaults to 'plus' at runtime)
      // Auto-sync - default to true
      auto_sync: partial.cliproxy?.auto_sync ?? defaults.cliproxy.auto_sync ?? true,
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
    // Image analysis config - enabled by default for CLIProxy providers
    image_analysis: {
      enabled: partial.image_analysis?.enabled ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.enabled,
      timeout: partial.image_analysis?.timeout ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.timeout,
      provider_models:
        partial.image_analysis?.provider_models ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models,
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
  if (config.setup_completed !== undefined) {
    lines.push(`setup_completed: ${config.setup_completed}`);
  }
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

  // Thinking section (extended thinking/reasoning configuration)
  if (config.thinking) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Thinking: Extended thinking/reasoning budget configuration');
    lines.push('# Controls reasoning depth for supported providers (agy, gemini, codex).');
    lines.push('#');
    lines.push('# Modes: auto (use tier_defaults), off (disable), manual (--thinking flag only)');
    lines.push('# Levels: minimal (512), low (1K), medium (8K), high (24K), xhigh (32K), auto');
    lines.push('# Override: Set global override value (number or level name)');
    lines.push('# Provider overrides: Per-provider tier defaults');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump({ thinking: config.thinking }, { indent: 2, lineWidth: -1, quotingType: '"' })
        .trim()
    );
    lines.push('');
  }

  // Dashboard auth section (only if configured)
  if (config.dashboard_auth?.enabled) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Dashboard Auth: Optional login protection for CCS dashboard');
    lines.push('# Generate password hash: npx bcrypt-cli hash "your-password"');
    lines.push(
      '# ENV override: CCS_DASHBOARD_AUTH_ENABLED, CCS_DASHBOARD_USERNAME, CCS_DASHBOARD_PASSWORD_HASH'
    );
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump(
          { dashboard_auth: config.dashboard_auth },
          { indent: 2, lineWidth: -1, quotingType: '"' }
        )
        .trim()
    );
    lines.push('');
  }

  // Image analysis section
  if (config.image_analysis) {
    lines.push('# ----------------------------------------------------------------------------');
    lines.push('# Image Analysis: Vision-based analysis for images and PDFs');
    lines.push('# Routes Read tool requests for images/PDFs through CLIProxy vision API.');
    lines.push('#');
    lines.push('# When enabled: Image files trigger vision analysis instead of raw file read');
    lines.push('# Provider models: Vision model used for each CLIProxy provider');
    lines.push('# Timeout: Maximum seconds to wait for analysis (10-600)');
    lines.push('#');
    lines.push('# Supported formats: .jpg, .jpeg, .png, .gif, .webp, .heic, .bmp, .tiff, .pdf');
    lines.push('# Configure via: ccs config image-analysis');
    lines.push('# ----------------------------------------------------------------------------');
    lines.push(
      yaml
        .dump(
          { image_analysis: config.image_analysis },
          { indent: 2, lineWidth: -1, quotingType: '"' }
        )
        .trim()
    );
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Save unified config to YAML file.
 * Uses atomic write (temp file + rename) to prevent corruption.
 * Uses lockfile to prevent concurrent writes.
 */
export function saveUnifiedConfig(config: UnifiedConfig): void {
  const yamlPath = getConfigYamlPath();
  const dir = path.dirname(yamlPath);

  // Acquire lock (retry for up to 1 second)
  const maxRetries = 10;
  const retryDelayMs = 100;
  let lockAcquired = false;
  for (let i = 0; i < maxRetries; i++) {
    if (acquireLock()) {
      lockAcquired = true;
      break;
    }
    // Synchronous sleep without CPU-intensive busy-wait
    // Uses Atomics.wait which properly sleeps the thread
    // Note: saveUnifiedConfig is sync API with 19+ callers, converting to async not feasible
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelayMs);
    } catch {
      // Fallback for environments without SharedArrayBuffer/Atomics support
      const end = Date.now() + retryDelayMs;
      while (Date.now() < end) {
        /* busy-wait */
      }
    }
  }

  if (!lockAcquired) {
    throw new Error('Config file is locked by another process. Wait a moment and try again.');
  }

  try {
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
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      // Classify filesystem errors
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOSPC') {
        throw new Error('Disk full - cannot save config. Free up space and try again.');
      } else if (err.code === 'EROFS' || err.code === 'EACCES') {
        throw new Error(`Cannot write config - check file permissions: ${err.message}`);
      }
      throw error;
    }
  } finally {
    // Always release lock
    releaseLock();
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

/**
 * Get thinking configuration.
 * Returns defaults if not configured.
 */
export function getThinkingConfig(): ThinkingConfig {
  const config = loadOrCreateUnifiedConfig();

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
 * Get dashboard_auth configuration with ENV var override.
 * Priority: ENV vars > config.yaml > defaults
 */
export function getDashboardAuthConfig(): DashboardAuthConfig {
  const config = loadOrCreateUnifiedConfig();

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
 * Get image_analysis configuration.
 * Returns defaults if not configured.
 */
export function getImageAnalysisConfig(): ImageAnalysisConfig {
  const config = loadOrCreateUnifiedConfig();

  return {
    enabled: config.image_analysis?.enabled ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.enabled,
    timeout: config.image_analysis?.timeout ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.timeout,
    provider_models:
      config.image_analysis?.provider_models ?? DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models,
  };
}
