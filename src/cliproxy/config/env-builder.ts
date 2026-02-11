/**
 * Environment variable builder for CLIProxy
 * Handles env var construction, merging, and remote URL rewriting
 */

import * as fs from 'fs';
import { CLIProxyProvider, ProviderModelMapping } from '../types';
import { getModelMappingFromConfig, getEnvVarsFromConfig } from '../base-config-loader';
import { getGlobalEnvConfig } from '../../config/unified-config-loader';
import { getEffectiveApiKey } from '../auth-token-manager';
import { expandPath } from '../../utils/helpers';
import { warn } from '../../utils/ui';
import {
  validatePort,
  validateRemotePort,
  getRemoteDefaultPort,
  normalizeProtocol,
  CLIPROXY_DEFAULT_PORT,
} from './port-manager';
import { getProviderSettingsPath } from './path-resolver';

/** Settings file structure for user overrides */
interface ProviderSettings {
  env: NodeJS.ProcessEnv;
}

/** Model name prefix that was deprecated in CLIProxyAPI registry */
const DEPRECATED_MODEL_PREFIX = 'gemini-claude-';
/** Replacement prefix matching actual upstream model names */
const UPSTREAM_MODEL_PREFIX = 'claude-';

/** Env vars that contain model names and may need migration */
const MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
];

/**
 * Migrate deprecated gemini-claude-* model names to upstream claude-* names in a settings file.
 * CLIProxyAPI registry no longer recognizes the gemini-claude-* prefix convention.
 * Preserves any suffixes like (high), [1m], etc.
 *
 * Returns true if migration was performed and file was updated.
 */
function migrateDeprecatedModelNames(settingsPath: string, settings: ProviderSettings): boolean {
  if (!settings.env || typeof settings.env !== 'object') return false;

  let migrated = false;
  for (const key of MODEL_ENV_KEYS) {
    const value = settings.env[key];
    if (typeof value !== 'string') continue;

    // Check if the base model name (before any suffixes) uses the deprecated prefix
    if (value.toLowerCase().startsWith(DEPRECATED_MODEL_PREFIX)) {
      settings.env[key] = UPSTREAM_MODEL_PREFIX + value.slice(DEPRECATED_MODEL_PREFIX.length);
      migrated = true;
    }
  }

  if (migrated) {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
    } catch {
      // Best-effort migration — don't block startup if write fails
    }
  }

  return migrated;
}

/** Remote proxy configuration for URL rewriting */
export interface RemoteProxyRewriteConfig {
  host: string;
  port?: number;
  protocol: 'http' | 'https';
  authToken?: string;
}

/**
 * Get model mapping for provider
 * Loads from config/base-{provider}.settings.json
 */
export function getModelMapping(provider: CLIProxyProvider): ProviderModelMapping {
  return getModelMappingFromConfig(provider);
}

/**
 * Get environment variables for Claude CLI (bundled defaults)
 * Uses provider-specific endpoint (e.g., /api/provider/gemini) for explicit routing.
 * This enables concurrent gemini/codex usage - each session routes to its provider via URL path.
 */
export function getClaudeEnvVars(
  provider: CLIProxyProvider,
  port: number = CLIPROXY_DEFAULT_PORT
): NodeJS.ProcessEnv {
  const models = getModelMapping(provider);

  // Base env vars from config file (includes ANTHROPIC_MAX_TOKENS, etc.)
  const baseEnvVars = getEnvVarsFromConfig(provider);

  // Core env vars that we always set dynamically
  const coreEnvVars = {
    // Provider-specific endpoint - routes to correct provider via URL path
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}/api/provider/${provider}`,
    ANTHROPIC_AUTH_TOKEN: getEffectiveApiKey(),
    ANTHROPIC_MODEL: models.claudeModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: models.opusModel || models.claudeModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnetModel || models.claudeModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haikuModel || models.claudeModel,
  };

  // Filter out core env vars from base config to avoid conflicts
  const {
    ANTHROPIC_BASE_URL: _baseUrl,
    ANTHROPIC_AUTH_TOKEN: _authToken,
    ANTHROPIC_MODEL: _model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: _opusModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: _sonnetModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: _haikuModel,
    ...additionalEnvVars
  } = baseEnvVars;

  // Merge core env vars with additional env vars from base config
  return {
    ...coreEnvVars,
    ...additionalEnvVars, // Includes ANTHROPIC_MAX_TOKENS, etc.
  };
}

/**
 * Get global env vars to inject into all third-party profiles.
 * Returns empty object if disabled.
 */
function getGlobalEnvVars(): Record<string, string> {
  const globalEnvConfig = getGlobalEnvConfig();
  if (!globalEnvConfig.enabled) {
    return {};
  }
  return globalEnvConfig.env;
}

/**
 * Ensure required CLIProxy env vars are present.
 * Falls back to bundled defaults if missing from user settings.
 * This prevents 404 errors when users forget to set BASE_URL/AUTH_TOKEN.
 */
function ensureRequiredEnvVars(
  envVars: NodeJS.ProcessEnv,
  provider: CLIProxyProvider,
  port: number
): NodeJS.ProcessEnv {
  const validPort = validatePort(port);
  const result = { ...envVars };
  const defaults = getClaudeEnvVars(provider, validPort);

  // Fill in missing required vars from defaults
  if (!result.ANTHROPIC_BASE_URL?.trim()) {
    result.ANTHROPIC_BASE_URL = defaults.ANTHROPIC_BASE_URL;
  }
  if (!result.ANTHROPIC_AUTH_TOKEN?.trim()) {
    result.ANTHROPIC_AUTH_TOKEN = defaults.ANTHROPIC_AUTH_TOKEN;
  }

  return result;
}

/**
 * Rewrite localhost URLs to remote server URLs.
 * Handles various localhost patterns: 127.0.0.1, localhost, 0.0.0.0
 */
function rewriteLocalhostUrls(
  envVars: NodeJS.ProcessEnv,
  provider: CLIProxyProvider,
  remoteConfig: RemoteProxyRewriteConfig
): NodeJS.ProcessEnv {
  const result = { ...envVars };
  const baseUrl = result.ANTHROPIC_BASE_URL;

  if (!baseUrl) return result;

  // Check if URL points to localhost (127.0.0.1, localhost, 0.0.0.0)
  const localhostPattern = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?/i;
  if (!localhostPattern.test(baseUrl)) return result;

  // Build remote URL with smart port handling (8317 for HTTP, 443 for HTTPS)
  // Validate port and normalize protocol for defensive handling
  const normalizedProtocol = normalizeProtocol(remoteConfig.protocol);
  const validatedPort = validateRemotePort(remoteConfig.port);
  const effectivePort = validatedPort ?? getRemoteDefaultPort(normalizedProtocol);
  // Omit port suffix for standard web ports (80/443) for cleaner URLs
  const standardWebPort = normalizedProtocol === 'https' ? 443 : 80;
  const portSuffix = effectivePort === standardWebPort ? '' : `:${effectivePort}`;
  const remoteBaseUrl = `${normalizedProtocol}://${remoteConfig.host}${portSuffix}/api/provider/${provider}`;

  result.ANTHROPIC_BASE_URL = remoteBaseUrl;

  // Update auth token if provided
  if (remoteConfig.authToken) {
    result.ANTHROPIC_AUTH_TOKEN = remoteConfig.authToken;
  }

  return result;
}

/**
 * Get effective environment variables for provider
 *
 * Priority order:
 * 1. Custom settings path (for user-defined CLIProxy variants)
 * 2. User settings file (~/.ccs/{provider}.settings.json) if exists
 * 3. Bundled defaults from PROVIDER_CONFIGS
 *
 * All results are merged with global_env vars (telemetry/reporting disables).
 * User takes full responsibility for custom settings.
 *
 * If remoteRewriteConfig is provided, localhost URLs are rewritten to remote server.
 */
export function getEffectiveEnvVars(
  provider: CLIProxyProvider,
  port: number = CLIPROXY_DEFAULT_PORT,
  customSettingsPath?: string,
  remoteRewriteConfig?: RemoteProxyRewriteConfig
): NodeJS.ProcessEnv {
  // Get global env vars (DISABLE_TELEMETRY, etc.)
  const globalEnv = getGlobalEnvVars();

  let envVars: NodeJS.ProcessEnv;

  // Priority 1: Custom settings path (for user-defined variants)
  if (customSettingsPath) {
    const expandedPath = expandPath(customSettingsPath);
    if (fs.existsSync(expandedPath)) {
      try {
        const content = fs.readFileSync(expandedPath, 'utf-8');
        const settings: ProviderSettings = JSON.parse(content);

        if (settings.env && typeof settings.env === 'object') {
          // Migrate deprecated gemini-claude-* model names if present
          migrateDeprecatedModelNames(expandedPath, settings);
          // Custom variant settings found - merge with global env
          envVars = { ...globalEnv, ...settings.env };
          // Ensure required vars are present (fall back to defaults if missing)
          envVars = ensureRequiredEnvVars(envVars, provider, port);
          // Apply remote rewrite if configured
          if (remoteRewriteConfig) {
            envVars = rewriteLocalhostUrls(envVars, provider, remoteRewriteConfig);
          }
          return envVars;
        }
      } catch {
        // Invalid JSON - fall through to provider defaults
        console.warn(warn(`Invalid settings file: ${customSettingsPath}`));
      }
    } else {
      console.warn(warn(`Settings file not found: ${customSettingsPath}`));
    }
  }

  // Priority 2: Default provider settings file
  const settingsPath = getProviderSettingsPath(provider);

  // Check for user override file
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      const settings: ProviderSettings = JSON.parse(content);

      if (settings.env && typeof settings.env === 'object') {
        // Migrate deprecated gemini-claude-* model names if present
        migrateDeprecatedModelNames(settingsPath, settings);
        // User override found - merge with global env
        envVars = { ...globalEnv, ...settings.env };
        // Ensure required vars are present (fall back to defaults if missing)
        envVars = ensureRequiredEnvVars(envVars, provider, port);
        // Apply remote rewrite if configured
        if (remoteRewriteConfig) {
          envVars = rewriteLocalhostUrls(envVars, provider, remoteRewriteConfig);
        }
        return envVars;
      }
    } catch {
      // Invalid JSON or structure - fall through to defaults
      // Silent fallback: don't spam errors for broken user files
    }
  }

  // No override or invalid - use bundled defaults merged with global env
  return { ...globalEnv, ...getClaudeEnvVars(provider, port) };
}

/**
 * Copy bundled settings template to user directory if not exists
 * Called during installation/first run
 */
export function ensureProviderSettings(provider: CLIProxyProvider): void {
  const settingsPath = getProviderSettingsPath(provider);

  // Only create if doesn't exist (preserve user edits)
  if (fs.existsSync(settingsPath)) {
    return;
  }

  // Generate default settings from PROVIDER_CONFIGS
  const envVars = getClaudeEnvVars(provider);
  const settings: ProviderSettings = { env: envVars };

  // Ensure directory exists
  fs.mkdirSync(require('path').dirname(settingsPath), { recursive: true });

  // Write with restricted permissions
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', {
    mode: 0o600,
  });
}

/**
 * Get environment variables for remote proxy mode.
 * Uses the remote proxy's provider endpoint as the base URL.
 * Respects user model settings from custom settings path or provider settings file.
 *
 * @param provider CLIProxy provider (gemini, codex, agy, qwen, iflow)
 * @param remoteConfig Remote proxy connection details
 * @param customSettingsPath Optional path to user's custom settings file
 * @returns Environment variables for Claude CLI
 */
export function getRemoteEnvVars(
  provider: CLIProxyProvider,
  remoteConfig: { host: string; port?: number; protocol: 'http' | 'https'; authToken?: string },
  customSettingsPath?: string
): Record<string, string> {
  // Build URL with smart port handling (8317 for HTTP, 443 for HTTPS)
  // Validate port and normalize protocol for defensive handling
  const normalizedProtocol = normalizeProtocol(remoteConfig.protocol);
  const validatedPort = validateRemotePort(remoteConfig.port);
  const effectivePort = validatedPort ?? getRemoteDefaultPort(normalizedProtocol);
  // Omit port suffix for standard web ports (80/443) for cleaner URLs
  const standardWebPort = normalizedProtocol === 'https' ? 443 : 80;
  const portSuffix = effectivePort === standardWebPort ? '' : `:${effectivePort}`;
  // Remote CLIProxyAPI uses root path (e.g., /v1/messages), not /api/provider/{provider}/v1/messages
  // The /api/provider/ prefix is only for local CLIProxy instances
  const baseUrl = `${normalizedProtocol}://${remoteConfig.host}${portSuffix}`;

  // Get global env vars (DISABLE_TELEMETRY, etc.)
  const globalEnv = getGlobalEnvVars();

  // Load user settings with priority: custom path > user settings file > base config
  let userEnvVars: Record<string, string> = {};

  // Priority 1: Custom settings path (for user-defined variants)
  if (customSettingsPath) {
    const expandedPath = expandPath(customSettingsPath);
    if (fs.existsSync(expandedPath)) {
      try {
        const content = fs.readFileSync(expandedPath, 'utf-8');
        const settings: ProviderSettings = JSON.parse(content);
        if (settings.env && typeof settings.env === 'object') {
          migrateDeprecatedModelNames(expandedPath, settings);
          userEnvVars = settings.env as Record<string, string>;
        }
      } catch {
        // Invalid JSON - fall through to provider defaults
        console.warn(warn(`Invalid settings file: ${customSettingsPath}`));
      }
    }
  }

  // Priority 2: Default provider settings file (~/.ccs/{provider}.settings.json)
  if (Object.keys(userEnvVars).length === 0) {
    const settingsPath = getProviderSettingsPath(provider);
    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        const settings: ProviderSettings = JSON.parse(content);
        if (settings.env && typeof settings.env === 'object') {
          migrateDeprecatedModelNames(settingsPath, settings);
          userEnvVars = settings.env as Record<string, string>;
        }
      } catch {
        // Invalid JSON - fall through to base config
      }
    }
  }

  // Priority 3: Base config defaults
  if (Object.keys(userEnvVars).length === 0) {
    const models = getModelMapping(provider);
    const baseEnvVars = getEnvVarsFromConfig(provider);
    // Filter out URL/auth from base config (we'll set those from remote config)
    const {
      ANTHROPIC_BASE_URL: _baseUrl,
      ANTHROPIC_AUTH_TOKEN: _authToken,
      ...additionalEnvVars
    } = baseEnvVars;
    userEnvVars = {
      ...additionalEnvVars,
      ANTHROPIC_MODEL: models.claudeModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: models.opusModel || models.claudeModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnetModel || models.claudeModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haikuModel || models.claudeModel,
    };
  }

  // Build final env: global + user settings + remote URL/auth override
  const env: Record<string, string> = {
    ...globalEnv,
    ...userEnvVars,
    // Always override URL and auth token with remote config
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: remoteConfig.authToken || getEffectiveApiKey(),
  };

  return env;
}
