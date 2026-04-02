/**
 * Profile Detector
 *
 * Determines profile type (settings-based vs account-based) for routing.
 * Priority: settings-based profiles (glm/km) checked FIRST for backward compatibility.
 *
 * Supports dual-mode configuration:
 * - Unified YAML format (config.yaml) when CCS_UNIFIED_CONFIG=1 or config.yaml exists
 * - Legacy JSON format (config.json, profiles.json) as fallback
 */

import * as fs from 'fs';
import * as path from 'path';
import { findSimilarStrings, expandPath } from '../utils/helpers';
import { Config, Settings, ProfileMetadata } from '../types';
import {
  UnifiedConfig,
  CopilotConfig,
  CursorConfig,
  CLIProxyVariantConfig,
  CompositeVariantConfig,
  CompositeTierConfig,
} from '../config/unified-config-types';
import { loadUnifiedConfig, isUnifiedMode } from '../config/unified-config-loader';
import { getCcsDir } from '../utils/config-manager';
import { getProfileLookupCandidates, isLegacyProfileAlias } from '../utils/profile-compat';
import type { CLIProxyProvider } from '../cliproxy/types';
import { CLIPROXY_PROVIDER_IDS, isCLIProxyProvider } from '../cliproxy/provider-capabilities';
import { normalizeCopilotModelId } from '../copilot/copilot-model-normalizer';
import type { TargetType } from '../targets/target-adapter';
import type { ProfileType } from '../types/profile';
export type { ProfileType } from '../types/profile';

/** CLIProxy profile names (OAuth-based, zero config) */
export const CLIPROXY_PROFILES: readonly CLIProxyProvider[] = CLIPROXY_PROVIDER_IDS;
export type CLIProxyProfileName = CLIProxyProvider;

export interface ProfileDetectionResult {
  type: ProfileType;
  name: string;
  target?: TargetType;
  settingsPath?: string;
  profile?: Settings | ProfileMetadata;
  message?: string;
  /** For cliproxy variants: the underlying provider (gemini, codex, agy, qwen) */
  provider?: CLIProxyProfileName;
  /** For cliproxy variants: dedicated port for isolation (8318-8417) */
  port?: number;
  /** For unified config profiles: merged env vars (config + secrets) */
  env?: Record<string, string>;
  /** For copilot profile: the copilot config */
  copilotConfig?: CopilotConfig;
  /** For cursor profile: the cursor config */
  cursorConfig?: CursorConfig;
  /** For composite variants: true when variant mixes providers per tier */
  isComposite?: boolean;
  /** For composite variants: which tier is the default */
  compositeDefaultTier?: 'opus' | 'sonnet' | 'haiku';
  /** For composite variants: per-tier provider+model mappings */
  compositeTiers?: {
    opus: CompositeTierConfig;
    sonnet: CompositeTierConfig;
    haiku: CompositeTierConfig;
  };
}

export interface AllProfiles {
  settings: string[];
  accounts: string[];
  default?: string;
}

export interface ProfileNotFoundError extends Error {
  profileName: string;
  suggestions: string[];
  availableProfiles: string;
}

/**
 * Profile Detector Class
 */
/**
 * Load env vars from a settings file (*.settings.json).
 * Uses expandPath() for consistent cross-platform path handling.
 * Returns empty object on error.
 */
export function loadSettingsFromFile(settingsPath: string): Record<string, string> {
  const expandedPath = expandPath(settingsPath);
  try {
    if (!fs.existsSync(expandedPath)) return {};
    const content = fs.readFileSync(expandedPath, 'utf8');
    const settings = JSON.parse(content) as { env?: Record<string, string> };
    return settings.env || {};
  } catch {
    return {};
  }
}

class ProfileDetector {
  private readonly configPath: string;
  private readonly profilesPath: string;

  constructor() {
    const ccsDir = getCcsDir();
    this.configPath = path.join(ccsDir, 'config.json');
    this.profilesPath = path.join(ccsDir, 'profiles.json');
  }

  /**
   * Load unified config if available.
   * Returns null if not in unified mode or load fails.
   */
  private readUnifiedConfig(): UnifiedConfig | null {
    if (!isUnifiedMode()) return null;
    return loadUnifiedConfig();
  }

  /**
   * Resolve profile from unified config format.
   * Returns null if profile not found in unified config.
   */
  private resolveFromUnifiedConfig(
    profileName: string,
    config: UnifiedConfig
  ): ProfileDetectionResult | null {
    // Check CLIProxy variants first
    if (config.cliproxy?.variants?.[profileName]) {
      const variant = config.cliproxy.variants[profileName];

      // Handle composite variants
      if ('type' in variant && variant.type === 'composite') {
        const composite = variant as CompositeVariantConfig;

        // Defensive: check for missing tiers or default_tier
        if (!composite.tiers || !composite.default_tier) {
          console.warn(
            `[!] Warning: Composite variant '${profileName}' has missing tiers or default_tier`
          );
          return null;
        }

        const defaultTierConfig = composite.tiers[composite.default_tier];
        if (!defaultTierConfig) {
          console.warn(
            `[!] Warning: Composite variant '${profileName}' missing config for default tier '${composite.default_tier}'`
          );
          return null;
        }

        return {
          type: 'cliproxy',
          name: profileName,
          target: composite.target,
          provider: defaultTierConfig.provider as CLIProxyProfileName,
          settingsPath: composite.settings,
          port: composite.port,
          isComposite: true,
          compositeDefaultTier: composite.default_tier,
          compositeTiers: composite.tiers,
        };
      }

      const singleVariant = variant as CLIProxyVariantConfig;
      return {
        type: 'cliproxy',
        name: profileName,
        target: singleVariant.target,
        provider: singleVariant.provider as CLIProxyProfileName,
        settingsPath: singleVariant.settings,
        port: singleVariant.port,
      };
    }

    // Check API profiles (supports compatibility aliases, e.g. km -> kimi)
    for (const candidate of getProfileLookupCandidates(profileName)) {
      if (!config.profiles?.[candidate]) {
        continue;
      }

      const profile = config.profiles[candidate];
      const settingsPath = profile.settings;
      const settingsEnv = loadSettingsFromFile(settingsPath);
      const viaLegacyAlias = isLegacyProfileAlias(profileName, candidate);

      return {
        type: 'settings',
        name: profileName,
        target: profile.target,
        settingsPath,
        env: settingsEnv,
        message: viaLegacyAlias
          ? `Using legacy API profile "${candidate}" for "${profileName}".`
          : undefined,
      };
    }

    // Check accounts
    if (config.accounts?.[profileName]) {
      const account = config.accounts[profileName];
      return {
        type: 'account',
        name: profileName,
        profile: {
          type: 'account',
          created: account.created,
          last_used: account.last_used,
          context_mode: account.context_mode,
          context_group: account.context_group,
          continuity_mode: account.continuity_mode,
          bare: account.bare,
        },
      };
    }

    return null;
  }

  /**
   * Read settings-based config (config.json)
   */
  private readConfig(): Config {
    if (!fs.existsSync(this.configPath)) {
      return { profiles: {} };
    }

    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data) as Config;
    } catch (error) {
      console.warn(`[!] Warning: Could not read config.json: ${(error as Error).message}`);
      return { profiles: {} };
    }
  }

  /**
   * Read account-based profiles (profiles.json)
   */
  private readProfiles(): { profiles: Record<string, ProfileMetadata>; default?: string } {
    if (!fs.existsSync(this.profilesPath)) {
      return { profiles: {}, default: undefined };
    }

    try {
      const data = fs.readFileSync(this.profilesPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn(`[!] Warning: Could not read profiles.json: ${(error as Error).message}`);
      return { profiles: {}, default: undefined };
    }
  }

  /**
   * Detect profile type and return routing information
   *
   * Priority order:
   * 0. Hardcoded CLIProxy profiles (gemini, codex, agy, qwen)
   * 0.5. Copilot profile (if enabled in config)
   * 0.75. Cursor profile (if enabled in config)
   * 1. Unified config profiles (if config.yaml exists or CCS_UNIFIED_CONFIG=1)
   * 2. User-defined CLIProxy variants (config.cliproxy section) [legacy]
   * 3. Settings-based profiles (config.profiles section) [legacy]
   * 4. Account-based profiles (profiles.json) [legacy]
   */
  detectProfileType(profileName: string | null | undefined): ProfileDetectionResult {
    // Special case: 'default' means use default profile
    if (profileName === 'default' || profileName === null || profileName === undefined) {
      return this.resolveDefaultProfile();
    }

    // Priority 0: Check CLIProxy profiles (gemini, codex, agy, qwen) - OAuth-based, zero config
    if (isCLIProxyProvider(profileName)) {
      return {
        type: 'cliproxy',
        name: profileName,
        provider: profileName,
      };
    }

    // Priority 0.5: Check Copilot profile - GitHub Copilot subscription via copilot-api
    if (profileName === 'copilot') {
      const unifiedConfig = this.readUnifiedConfig();
      const copilotConfig = unifiedConfig?.copilot;

      if (!copilotConfig?.enabled) {
        const error = new Error(
          'Copilot profile is not enabled.\n\n' +
            'To enable GitHub Copilot integration:\n' +
            '  1. Run: ccs config\n' +
            '  2. Go to "GitHub Copilot" section\n' +
            '  3. Enable the integration\n' +
            '  4. Authenticate with GitHub: npx copilot-api auth\n\n' +
            'Or manually edit ~/.ccs/config.yaml:\n' +
            '  copilot:\n' +
            '    enabled: true'
        ) as ProfileNotFoundError;
        error.profileName = profileName;
        error.suggestions = [];
        error.availableProfiles = this.listAvailableProfiles();
        throw error;
      }

      return {
        type: 'copilot',
        name: 'copilot',
        copilotConfig,
      };
    }

    // Priority 0.75: Check Cursor profile - local Cursor daemon runtime
    if (profileName === 'cursor') {
      const unifiedConfig = this.readUnifiedConfig();
      const cursorConfig = unifiedConfig?.cursor;

      if (!cursorConfig?.enabled) {
        const error = new Error(
          'Cursor profile is not enabled.\n\n' +
            'To enable Cursor integration:\n' +
            '  1. Run: ccs cursor enable\n' +
            '  2. Import auth: ccs cursor auth\n' +
            '  3. Start daemon: ccs cursor start\n\n' +
            'Or manually edit ~/.ccs/config.yaml:\n' +
            '  cursor:\n' +
            '    enabled: true'
        ) as ProfileNotFoundError;
        error.profileName = profileName;
        error.suggestions = [];
        error.availableProfiles = this.listAvailableProfiles();
        throw error;
      }

      return {
        type: 'cursor',
        name: 'cursor',
        cursorConfig,
      };
    }

    // Priority 1: Try unified config if available
    const unifiedConfig = this.readUnifiedConfig();
    if (unifiedConfig) {
      const result = this.resolveFromUnifiedConfig(profileName, unifiedConfig);
      if (result) return result;
      // Fall through to legacy if not found in unified config
    }

    // Priority 2: Check user-defined CLIProxy variants (config.cliproxy section)
    const config = this.readConfig();
    const legacyTargetMap = (config as { profile_targets?: Record<string, TargetType> })
      .profile_targets;

    if (config.cliproxy && config.cliproxy[profileName]) {
      const variant = config.cliproxy[profileName];
      return {
        type: 'cliproxy',
        name: profileName,
        target: variant.target,
        provider: variant.provider as CLIProxyProfileName,
        settingsPath: variant.settings,
        port: variant.port,
      };
    }

    // Priority 3: Check settings-based profiles (glm, km) - LEGACY FALLBACK
    if (config.profiles) {
      for (const candidate of getProfileLookupCandidates(profileName)) {
        if (!config.profiles[candidate]) {
          continue;
        }

        const viaLegacyAlias = isLegacyProfileAlias(profileName, candidate);
        return {
          type: 'settings',
          name: profileName,
          settingsPath: config.profiles[candidate],
          target: legacyTargetMap?.[candidate],
          message: viaLegacyAlias
            ? `Using legacy API profile "${candidate}" for "${profileName}".`
            : undefined,
        };
      }
    }

    // Priority 4: Check account-based profiles (work, personal) - LEGACY FALLBACK
    const profiles = this.readProfiles();

    if (profiles.profiles && profiles.profiles[profileName]) {
      return {
        type: 'account',
        name: profileName,
        profile: profiles.profiles[profileName],
      };
    }

    // Not found - generate suggestions
    const allProfiles = this.getAllProfiles();
    const allProfileNames = [
      ...allProfiles.cliproxy,
      ...allProfiles.cliproxyVariants,
      ...allProfiles.settings,
      ...allProfiles.accounts,
    ];
    const suggestions = findSimilarStrings(profileName, allProfileNames);

    const error = new Error(`Profile not found: ${profileName}`) as ProfileNotFoundError;
    error.profileName = profileName;
    error.suggestions = suggestions;
    error.availableProfiles = this.listAvailableProfiles();
    throw error;
  }

  /**
   * Resolve default profile
   */
  private resolveDefaultProfile(): ProfileDetectionResult {
    // Check unified config first
    const unifiedConfig = this.readUnifiedConfig();
    if (unifiedConfig?.default) {
      const result = this.resolveFromUnifiedConfig(unifiedConfig.default, unifiedConfig);
      if (result) return result;
    }

    // Check if account-based default exists (legacy)
    const profiles = this.readProfiles();

    if (profiles.default && profiles.profiles[profiles.default]) {
      return {
        type: 'account',
        name: profiles.default,
        profile: profiles.profiles[profiles.default],
      };
    }

    // Check if settings-based default exists
    const config = this.readConfig();
    const legacyTargetMap = (config as { profile_targets?: Record<string, TargetType> })
      .profile_targets;

    if (config.profiles && config.profiles['default']) {
      const settingsPath = config.profiles['default'];
      // Safety net: If default points to ~/.claude/settings.json, treat as pass-through
      // to avoid loading stale env vars from previous profile sessions (issue #37).
      // The ~/.claude/settings.json is Claude's native config - let Claude handle it.
      if (settingsPath.includes('.claude') && settingsPath.endsWith('settings.json')) {
        return {
          type: 'default',
          name: 'default',
          message: 'Using native Claude auth (no custom env vars)',
        };
      }
      return {
        type: 'settings',
        name: 'default',
        settingsPath,
        target: legacyTargetMap?.['default'],
      };
    }

    // No default profile configured, use Claude's own defaults
    return {
      type: 'default',
      name: 'default',
      message: 'No profile configured. Using Claude CLI defaults from ~/.claude/',
    };
  }

  /**
   * List available profiles (for error messages)
   */
  private listAvailableProfiles(): string {
    const lines: string[] = [];

    // CLIProxy profiles (OAuth-based, always available)
    lines.push('CLIProxy profiles (OAuth, zero config):');
    CLIPROXY_PROFILES.forEach((name) => {
      lines.push(`  - ${name}`);
    });

    // Check unified config first
    const unifiedConfig = this.readUnifiedConfig();
    if (unifiedConfig) {
      // Copilot profile (if enabled)
      if (unifiedConfig.copilot?.enabled) {
        const currentCopilotModel = normalizeCopilotModelId(unifiedConfig.copilot.model);
        lines.push('GitHub Copilot (via copilot-api):');
        lines.push(`  - copilot (model: ${currentCopilotModel})`);
      }

      if (unifiedConfig.cursor?.enabled) {
        lines.push('Cursor local proxy:');
        lines.push(`  - cursor (model: ${unifiedConfig.cursor.model})`);
      }

      // CLIProxy variants from unified config
      const variants = Object.keys(unifiedConfig.cliproxy?.variants || {});
      if (variants.length > 0) {
        lines.push('CLIProxy variants (unified config):');
        variants.forEach((name) => {
          const variant = unifiedConfig.cliproxy?.variants[name];
          const label =
            variant && 'type' in variant && variant.type === 'composite'
              ? 'composite'
              : (variant as { provider?: string })?.provider || 'unknown';
          lines.push(`  - ${name} (${label})`);
        });
      }

      // API profiles from unified config
      const apiProfiles = Object.keys(unifiedConfig.profiles || {});
      if (apiProfiles.length > 0) {
        lines.push('API profiles (unified config):');
        apiProfiles.forEach((name) => {
          const isDefault = name === unifiedConfig.default;
          lines.push(`  - ${name}${isDefault ? ' [DEFAULT]' : ''}`);
        });
      }

      // Account profiles from unified config
      const accounts = Object.keys(unifiedConfig.accounts || {});
      if (accounts.length > 0) {
        lines.push('Account profiles (unified config):');
        accounts.forEach((name) => {
          const isDefault = name === unifiedConfig.default;
          lines.push(`  - ${name}${isDefault ? ' [DEFAULT]' : ''}`);
        });
      }

      return lines.join('\n');
    }

    // Fall back to legacy config display
    // CLIProxy variants (user-defined)
    const config = this.readConfig();
    const cliproxyVariants = Object.keys(config.cliproxy || {});

    const cliproxyConfig = config.cliproxy;
    if (cliproxyVariants.length > 0 && cliproxyConfig) {
      lines.push('CLIProxy variants (user-defined):');
      cliproxyVariants.forEach((name) => {
        const variant = cliproxyConfig[name];
        lines.push(`  - ${name} (${variant.provider})`);
      });
    }

    // Settings-based profiles
    const settingsProfiles = Object.keys(config.profiles || {});

    if (settingsProfiles.length > 0) {
      lines.push('Settings-based profiles (GLM, Kimi, etc.):');
      settingsProfiles.forEach((name) => {
        lines.push(`  - ${name}`);
      });
    }

    // Account-based profiles
    const profiles = this.readProfiles();
    const accountProfiles = Object.keys(profiles.profiles || {});

    if (accountProfiles.length > 0) {
      lines.push('Account-based profiles:');
      accountProfiles.forEach((name) => {
        const isDefault = name === profiles.default;
        lines.push(`  - ${name}${isDefault ? ' [DEFAULT]' : ''}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Check if profile exists (any type)
   */
  hasProfile(profileName: string): boolean {
    try {
      this.detectProfileType(profileName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all available profile names
   */
  getAllProfiles(): AllProfiles & { cliproxy: string[]; cliproxyVariants: string[] } {
    // Check unified config first
    const unifiedConfig = this.readUnifiedConfig();
    if (unifiedConfig) {
      return {
        settings: Object.keys(unifiedConfig.profiles || {}),
        accounts: Object.keys(unifiedConfig.accounts || {}),
        cliproxy: [...CLIPROXY_PROFILES],
        cliproxyVariants: Object.keys(unifiedConfig.cliproxy?.variants || {}),
        default: unifiedConfig.default,
      };
    }

    // Fall back to legacy config
    const config = this.readConfig();
    const profiles = this.readProfiles();

    return {
      settings: Object.keys(config.profiles || {}),
      accounts: Object.keys(profiles.profiles || {}),
      cliproxy: [...CLIPROXY_PROFILES],
      cliproxyVariants: Object.keys(config.cliproxy || {}),
      default: profiles.default,
    };
  }
}

export default ProfileDetector;
