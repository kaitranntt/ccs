/**
 * Core config generation for CLIProxyAPI
 * Handles unified config.yaml generation for all providers
 */

import * as fs from 'fs';
import * as path from 'path';
import { CLIProxyProvider, ProviderConfig } from '../types';
import { getModelMappingFromConfig } from '../base-config-loader';
import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import { getEffectiveApiKey, getEffectiveManagementSecret } from '../auth-token-manager';
import { getAuthDir, getProviderAuthDir, getConfigPathForPort } from './path-resolver';
import { CLIPROXY_DEFAULT_PORT } from './port-manager';

/** Internal API key for CCS-managed requests */
export const CCS_INTERNAL_API_KEY = 'ccs-internal-managed';

/** Simple secret key for Control Panel login (user-facing) */
export const CCS_CONTROL_PANEL_SECRET = 'ccs';

/**
 * Config version - bump when config format changes to trigger regeneration
 * v1: Initial config (port, auth-dir, api-keys only)
 * v2: Full-featured config with dashboard, quota mgmt, simplified key
 * v3: Logging disabled by default (user opt-in via ~/.ccs/config.yaml)
 * v4: Added Kiro (AWS) and GitHub Copilot providers
 * v5: Added disable-cooling: true for stability
 * v6: Added oauth-model-alias with Opus 4.6 support
 */
export const CLIPROXY_CONFIG_VERSION = 6;

/**
 * Default Antigravity oauth-model-alias entries.
 * Maps user-facing model names to Antigravity internal model names.
 * Must stay in sync with CLIProxyAPIPlus defaultAntigravityAliases().
 */
const DEFAULT_ANTIGRAVITY_ALIASES: Array<{ name: string; alias: string }> = [
  { name: 'rev19-uic3-1p', alias: 'gemini-2.5-computer-use-preview-10-2025' },
  { name: 'gemini-3-pro-image', alias: 'gemini-3-pro-image-preview' },
  { name: 'gemini-3-pro-high', alias: 'gemini-3-pro-preview' },
  { name: 'gemini-3-flash', alias: 'gemini-3-flash-preview' },
  { name: 'claude-sonnet-4-5', alias: 'gemini-claude-sonnet-4-5' },
  { name: 'claude-sonnet-4-5-thinking', alias: 'gemini-claude-sonnet-4-5-thinking' },
  { name: 'claude-opus-4-5-thinking', alias: 'gemini-claude-opus-4-5-thinking' },
  { name: 'claude-opus-4-6-thinking', alias: 'gemini-claude-opus-4-6-thinking' },
];

/** Provider display names (static metadata) */
const PROVIDER_DISPLAY_NAMES: Record<CLIProxyProvider, string> = {
  gemini: 'Gemini',
  codex: 'Codex',
  agy: 'Antigravity',
  qwen: 'Qwen Code',
  iflow: 'iFlow',
  kiro: 'Kiro (AWS)',
  ghcp: 'GitHub Copilot (OAuth)',
  claude: 'Claude (Anthropic)',
};

/**
 * Get provider configuration
 * Model mappings are loaded from config/base-{provider}.settings.json
 */
export function getProviderConfig(provider: CLIProxyProvider): ProviderConfig {
  const displayName = PROVIDER_DISPLAY_NAMES[provider];
  if (!displayName) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  // Load models from base config file
  const models = getModelMappingFromConfig(provider);

  return {
    name: provider,
    displayName,
    models,
    requiresOAuth: true, // All CLIProxy providers require OAuth
  };
}

/**
 * Get CLIProxy logging settings from user config.
 * Defaults to disabled to prevent disk bloat.
 */
function getLoggingSettings(): { loggingToFile: boolean; requestLog: boolean } {
  const config = loadOrCreateUnifiedConfig();
  return {
    loggingToFile: config.cliproxy.logging?.enabled ?? false,
    requestLog: config.cliproxy.logging?.request_log ?? false,
  };
}

/**
 * Generate oauth-model-alias YAML section.
 * Merges default Antigravity aliases with any user-added custom aliases.
 */
function generateOAuthModelAliasSection(existingAliases?: string): string {
  // Start with default aliases
  const aliasEntries = [...DEFAULT_ANTIGRAVITY_ALIASES];

  // Parse and merge existing user aliases if provided
  if (existingAliases) {
    const existingNames = new Set(aliasEntries.map((a) => a.name));
    const lines = existingAliases.split('\n');
    let currentName = '';
    for (const line of lines) {
      const nameMatch = line.match(/^\s+-\s*name:\s*(.+)/);
      const aliasMatch = line.match(/^\s+alias:\s*(.+)/);
      if (nameMatch) {
        currentName = nameMatch[1].trim();
      } else if (aliasMatch && currentName && !existingNames.has(currentName)) {
        aliasEntries.push({ name: currentName, alias: aliasMatch[1].trim() });
        existingNames.add(currentName);
        currentName = '';
      }
    }
  }

  const entries = aliasEntries
    .map((a) => `    - name: ${a.name}\n      alias: ${a.alias}`)
    .join('\n');

  return `oauth-model-alias:\n  antigravity:\n${entries}`;
}

/**
 * Generate UNIFIED config.yaml content for ALL providers
 * This enables concurrent usage of gemini/codex/agy without config conflicts.
 * CLIProxyAPI routes requests by model name to the appropriate provider.
 *
 * @param port - Server port (default: 8317)
 * @param userApiKeys - User-added API keys to preserve (default: [])
 * @param existingAliases - Existing oauth-model-alias content to merge with defaults
 */
function generateUnifiedConfigContent(
  port: number = CLIPROXY_DEFAULT_PORT,
  userApiKeys: string[] = [],
  existingAliases?: string
): string {
  const authDir = getAuthDir(); // Base auth dir - CLIProxyAPI scans subdirectories
  // Convert Windows backslashes to forward slashes for YAML compatibility
  const authDirNormalized = authDir.split(path.sep).join('/');

  // Get logging settings from user config (disabled by default)
  const { loggingToFile, requestLog } = getLoggingSettings();

  // Get effective auth tokens (respects user customization)
  const effectiveApiKey = getEffectiveApiKey();
  const effectiveSecret = getEffectiveManagementSecret();

  // Build api-keys section with internal key + preserved user keys
  const allApiKeys = [effectiveApiKey, ...userApiKeys];
  const apiKeysYaml = allApiKeys.map((key) => `  - "${key}"`).join('\n');

  // Unified config with enhanced CLIProxyAPI features
  const config = `# CLIProxyAPI config generated by CCS v${CLIPROXY_CONFIG_VERSION}
# Supports: gemini, codex, agy, qwen, iflow (concurrent usage)
# Generated: ${new Date().toISOString()}
#
# This config is auto-managed by CCS. Manual edits may be overwritten.
# Use 'ccs doctor' to regenerate with latest settings.

# =============================================================================
# Server Settings
# =============================================================================

port: ${port}
debug: false

# =============================================================================
# Logging
# =============================================================================
# WARNING: Logs can grow to several GB if enabled!
# To enable logging, edit ~/.ccs/config.yaml:
#   cliproxy:
#     logging:
#       enabled: true
#       request_log: true
# Then run 'ccs doctor --fix' to regenerate this config.
# Use 'ccs cleanup' to remove old logs.

# Write logs to file (stored in ~/.ccs/cliproxy/logs/)
logging-to-file: ${loggingToFile}

# Log individual API requests for debugging/analytics
request-log: ${requestLog}

# =============================================================================
# Dashboard & Management
# =============================================================================

# Enable usage statistics for CCS dashboard analytics
usage-statistics-enabled: true

# Remote management API for CCS dashboard integration
remote-management:
  allow-remote: true
  secret-key: "${effectiveSecret}"
  disable-control-panel: false

# =============================================================================
# Reliability & Quota Management
# =============================================================================

# Disable quota cooldown scheduling for stability
disable-cooling: true

# Auto-retry on transient errors (403, 408, 500, 502, 503, 504)
request-retry: 0
max-retry-interval: 0

# Auto-switch accounts on quota exceeded (429)
# This enables seamless multi-account rotation when rate limited
quota-exceeded:
  switch-project: true
  switch-preview-model: true

# =============================================================================
# Authentication
# =============================================================================

# API keys for CCS and user-added external requests
# NOTE: User-added keys are preserved across CCS updates (fix for issue #200)
api-keys:
${apiKeysYaml}

# OAuth tokens directory (auto-discovered by CLIProxyAPI)
auth-dir: "${authDirNormalized}"
${generateOAuthModelAliasSection(existingAliases)}
`;

  return config;
}

/**
 * Generate unified config.yaml file (supports all providers concurrently)
 * Only regenerates if config doesn't exist.
 * @returns Path to config file
 */
export function generateConfig(
  provider: CLIProxyProvider,
  port: number = CLIPROXY_DEFAULT_PORT
): string {
  const configPath = getConfigPathForPort(port);

  // Ensure provider auth directory exists
  const authDir = getProviderAuthDir(provider);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });

  // Only generate config if it doesn't exist (unified config serves all providers)
  if (!fs.existsSync(configPath)) {
    const configContent = generateUnifiedConfigContent(port);
    fs.writeFileSync(configPath, configContent, { mode: 0o600 });
  }

  return configPath;
}

/**
 * Parse user-added API keys from existing config content.
 * Extracts all keys except the internal CCS key for preservation.
 *
 * @param content - Existing config.yaml content
 * @returns Array of user-added API keys (excludes CCS_INTERNAL_API_KEY)
 */
export function parseUserApiKeys(content: string): string[] {
  const userKeys: string[] = [];

  // Find the api-keys section by looking for lines starting with "  - " after "api-keys:"
  // Normalize line endings first
  const normalizedContent = content.replace(/\r\n/g, '\n');

  // Find the api-keys: line and extract all subsequent key entries
  const lines = normalizedContent.split('\n');
  let inApiKeysSection = false;

  for (const line of lines) {
    // Check if this is the start of api-keys section
    if (line.match(/^api-keys:\s*$/)) {
      inApiKeysSection = true;
      continue;
    }

    // If we're in the api-keys section, look for key entries
    if (inApiKeysSection) {
      // Key entries are indented with "  - " or similar
      const keyMatch = line.match(/^\s+-\s*"([^"]*)"/);
      if (keyMatch) {
        const key = keyMatch[1];
        // Exclude the internal CCS key and empty strings
        if (key && key !== CCS_INTERNAL_API_KEY) {
          userKeys.push(key);
        }
      } else if (line.match(/^\S/) && line.trim().length > 0) {
        // Non-indented line that's not empty means we've left the api-keys section
        break;
      }
      // Continue for blank lines or other indented content
    }
  }

  return userKeys;
}

/**
 * Extract a YAML section from config content by key name.
 * Returns the raw lines (including indented children) or empty string.
 */
function extractYamlSection(content: string, sectionKey: string): string {
  const lines = content.split('\n');
  const sectionLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.startsWith(`${sectionKey}:`)) {
      inSection = true;
      continue; // Skip the key line itself
    }
    if (inSection) {
      // Section ends at next top-level key (skip comments and blank lines)
      if (line.match(/^\S/) && !line.startsWith('#') && line.trim().length > 0) {
        break;
      }
      sectionLines.push(line);
    }
  }

  // Strip leading/trailing blank lines but preserve indentation
  return sectionLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * Force regenerate config.yaml with latest settings.
 * Preserves user-added API keys, claude-api-key section, and port settings.
 *
 * @param port - Default port to use if not found in existing config
 * @returns Path to new config file
 */
export function regenerateConfig(port: number = CLIPROXY_DEFAULT_PORT): string {
  const configPath = getConfigPathForPort(port);

  // Preserve user settings from existing config
  let effectivePort = port;
  let userApiKeys: string[] = [];
  let claudeApiKeySection = '';
  let existingAliases = '';

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');

      // Preserve port setting
      const portMatch = content.match(/^port:\s*(\d+)/m);
      if (portMatch) {
        effectivePort = parseInt(portMatch[1], 10);
      }

      // Preserve user-added API keys (fix for issue #200)
      userApiKeys = parseUserApiKeys(content);

      // Preserve claude-api-key section (managed via dashboard/API)
      claudeApiKeySection = extractYamlSection(content, 'claude-api-key');

      // Preserve existing oauth-model-alias user customizations
      existingAliases = extractYamlSection(content, 'oauth-model-alias');
    } catch {
      // Use defaults if reading fails
    }
    // Delete existing config
    fs.unlinkSync(configPath);
  }

  // Ensure directories exist
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(getAuthDir(), { recursive: true, mode: 0o700 });

  // Generate fresh config with preserved user API keys and aliases
  let configContent = generateUnifiedConfigContent(effectivePort, userApiKeys, existingAliases);

  // Re-append claude-api-key section if it existed
  if (claudeApiKeySection) {
    configContent += `claude-api-key:\n${claudeApiKeySection}\n`;
  }

  fs.writeFileSync(configPath, configContent, { mode: 0o600 });

  return configPath;
}

/**
 * Check if config needs regeneration (version mismatch)
 * @returns true if config should be regenerated
 */
export function configNeedsRegeneration(): boolean {
  const configPath = getConfigPathForPort(CLIPROXY_DEFAULT_PORT);
  if (!fs.existsSync(configPath)) {
    return false; // Will be created on first use
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');

    // Check for version marker
    const versionMatch = content.match(/CCS v(\d+)/);
    if (!versionMatch) {
      return true; // No version marker = old config
    }

    const configVersion = parseInt(versionMatch[1], 10);
    return configVersion < CLIPROXY_CONFIG_VERSION;
  } catch {
    return true; // Error reading = regenerate
  }
}

/**
 * Check if config exists for port
 */
export function configExists(port: number = CLIPROXY_DEFAULT_PORT): boolean {
  return fs.existsSync(getConfigPathForPort(port));
}

/**
 * Delete config file for specific port
 */
export function deleteConfigForPort(port: number): void {
  const configPath = getConfigPathForPort(port);
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

/**
 * Delete config file (default port)
 */
export function deleteConfig(): void {
  deleteConfigForPort(CLIPROXY_DEFAULT_PORT);
}
