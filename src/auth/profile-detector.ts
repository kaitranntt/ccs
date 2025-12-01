/**
 * Profile Detector
 *
 * Determines profile type (settings-based vs account-based) for routing.
 * Priority: settings-based profiles (glm/kimi) checked FIRST for backward compatibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { findSimilarStrings } from '../utils/helpers';
import { Config, Settings, ProfileMetadata } from '../types';

export type ProfileType = 'settings' | 'account' | 'cliproxy' | 'default';

/** CLIProxy profile names (OAuth-based, zero config) */
export const CLIPROXY_PROFILES = ['gemini', 'codex', 'agy', 'qwen'] as const;
export type CLIProxyProfileName = (typeof CLIPROXY_PROFILES)[number];

export interface ProfileDetectionResult {
  type: ProfileType;
  name: string;
  settingsPath?: string;
  profile?: Settings | ProfileMetadata;
  message?: string;
  /** For cliproxy variants: the underlying provider (gemini, codex, agy, qwen) */
  provider?: CLIProxyProfileName;
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
class ProfileDetector {
  private readonly configPath: string;
  private readonly profilesPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.ccs', 'config.json');
    this.profilesPath = path.join(os.homedir(), '.ccs', 'profiles.json');
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
   * 1. User-defined CLIProxy variants (config.cliproxy section)
   * 2. Settings-based profiles (config.profiles section)
   * 3. Account-based profiles (profiles.json)
   */
  detectProfileType(profileName: string | null | undefined): ProfileDetectionResult {
    // Special case: 'default' means use default profile
    if (profileName === 'default' || profileName === null || profileName === undefined) {
      return this.resolveDefaultProfile();
    }

    // Priority 0: Check CLIProxy profiles (gemini, codex, agy, qwen) - OAuth-based, zero config
    if (CLIPROXY_PROFILES.includes(profileName as CLIProxyProfileName)) {
      return {
        type: 'cliproxy',
        name: profileName,
        provider: profileName as CLIProxyProfileName,
      };
    }

    // Priority 1: Check user-defined CLIProxy variants (config.cliproxy section)
    const config = this.readConfig();

    if (config.cliproxy && config.cliproxy[profileName]) {
      const variant = config.cliproxy[profileName];
      return {
        type: 'cliproxy',
        name: profileName,
        provider: variant.provider as CLIProxyProfileName,
        settingsPath: variant.settings,
      };
    }

    // Priority 2: Check settings-based profiles (glm, kimi) - BACKWARD COMPATIBILITY
    if (config.profiles && config.profiles[profileName]) {
      return {
        type: 'settings',
        name: profileName,
        settingsPath: config.profiles[profileName],
      };
    }

    // Priority 3: Check account-based profiles (work, personal)
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
    // Check if account-based default exists
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

    if (config.profiles && config.profiles['default']) {
      return {
        type: 'settings',
        name: 'default',
        settingsPath: config.profiles['default'],
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
