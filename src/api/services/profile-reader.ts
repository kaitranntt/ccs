/**
 * API Profile Reader Service
 *
 * Read operations for API profiles.
 * Supports both unified YAML config and legacy JSON config.
 */

import * as fs from 'fs';
import { loadConfigSafe } from '../../utils/config-manager';
import { loadOrCreateUnifiedConfig, isUnifiedMode } from '../../config/unified-config-loader';
import { expandPath } from '../../utils/helpers';
import type { TargetType } from '../../targets/target-adapter';
import { isPersistedTargetType } from '../../targets/target-metadata';
import type { Settings } from '../../types/config';
import type { ApiProfileInfo, CliproxyVariantInfo, ApiListResult } from './profile-types';
import { resolveCliproxyBridgeMetadata } from './cliproxy-profile-bridge';

function sanitizeTarget(target: unknown): TargetType {
  if (isPersistedTargetType(target)) {
    return target as TargetType;
  }
  return 'claude';
}

/**
 * Check if API profile exists in config
 */
export function apiProfileExists(name: string): boolean {
  try {
    if (isUnifiedMode()) {
      const config = loadOrCreateUnifiedConfig();
      return name in config.profiles;
    }
    const config = loadConfigSafe();
    return name in config.profiles;
  } catch {
    return false;
  }
}

/**
 * Load settings file from a config reference such as ~/.ccs/name.settings.json.
 */
function loadProfileSettings(settingsReference: string | undefined): Settings | null {
  if (!settingsReference || settingsReference === 'config.yaml') {
    return null;
  }

  try {
    const settingsPath = expandPath(settingsReference);
    if (!fs.existsSync(settingsPath)) return null;
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Settings;
  } catch {
    return null;
  }
}

function isConfiguredFromSettings(settings: Settings | null): boolean {
  const token = settings?.env?.ANTHROPIC_AUTH_TOKEN || settings?.env?.ANTHROPIC_API_KEY || '';
  return token.length > 0 && !token.includes('YOUR_') && !token.includes('your-');
}

function resolveProfileSettingsReference(name: string): string | undefined {
  if (isUnifiedMode()) {
    const config = loadOrCreateUnifiedConfig();
    return config.profiles[name]?.settings;
  }

  const config = loadConfigSafe();
  return config.profiles[name];
}

/**
 * Check if API profile has real API key (not placeholder)
 */
export function isApiProfileConfigured(apiName: string): boolean {
  return isConfiguredFromSettings(loadProfileSettings(resolveProfileSettingsReference(apiName)));
}

/**
 * List all API profiles
 *
 * Note: The 'default' profile (pointing to ~/.claude/settings.json) is excluded
 * as it represents the user's native Claude subscription, not an API profile.
 */
export function listApiProfiles(): ApiListResult {
  const profiles: ApiProfileInfo[] = [];
  const variants: CliproxyVariantInfo[] = [];

  if (isUnifiedMode()) {
    const unifiedConfig = loadOrCreateUnifiedConfig();
    for (const [name, profile] of Object.entries(unifiedConfig.profiles)) {
      // Skip 'default' profile - it's the user's native Claude settings
      if (name === 'default' && profile.settings?.includes('.claude/settings.json')) {
        continue;
      }
      const settingsPath = profile.settings || 'config.yaml';
      const settings = loadProfileSettings(settingsPath);
      profiles.push({
        name,
        settingsPath,
        isConfigured: isConfiguredFromSettings(settings),
        configSource: 'unified',
        target: sanitizeTarget(profile.target),
        cliproxyBridge: resolveCliproxyBridgeMetadata(settings),
      });
    }
    // CLIProxy variants
    for (const [name, variant] of Object.entries(unifiedConfig.cliproxy?.variants || {})) {
      const provider =
        variant && 'type' in variant && variant.type === 'composite'
          ? 'composite'
          : (variant as { provider?: string })?.provider || 'unknown';
      variants.push({
        name,
        provider,
        settings: variant?.settings || '-',
        target: sanitizeTarget(variant?.target),
      });
    }
  } else {
    const config = loadConfigSafe();
    const legacyTargetMap = (config as { profile_targets?: Record<string, unknown> })
      .profile_targets;
    for (const [name, settingsPath] of Object.entries(config.profiles)) {
      // Skip 'default' profile - it's the user's native Claude settings
      if (name === 'default' && (settingsPath as string).includes('.claude/settings.json')) {
        continue;
      }
      const settings = loadProfileSettings(settingsPath as string);
      profiles.push({
        name,
        settingsPath: settingsPath as string,
        isConfigured: isConfiguredFromSettings(settings),
        configSource: 'legacy',
        target: sanitizeTarget(legacyTargetMap?.[name]),
        cliproxyBridge: resolveCliproxyBridgeMetadata(settings),
      });
    }
    // CLIProxy variants
    if (config.cliproxy) {
      for (const [name, v] of Object.entries(config.cliproxy)) {
        const variant = v as { provider: string; settings: string; target?: unknown };
        variants.push({
          name,
          provider: variant.provider,
          settings: variant.settings,
          target: sanitizeTarget(variant.target),
        });
      }
    }
  }

  return { profiles, variants };
}

/**
 * Get list of available API profile names
 */
export function getApiProfileNames(): string[] {
  if (isUnifiedMode()) {
    const config = loadOrCreateUnifiedConfig();
    return Object.keys(config.profiles);
  }
  const config = loadConfigSafe();
  return Object.keys(config.profiles);
}

/**
 * Check if using unified config mode
 */
export function isUsingUnifiedConfig(): boolean {
  return isUnifiedMode();
}
