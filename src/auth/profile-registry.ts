import * as fs from 'fs';
import * as path from 'path';
import { ProfileMetadata } from '../types';

import type { AccountConfig } from '../config/unified-config-types';

import { isValidContextGroupName, normalizeContextGroupName } from './account-context';
import { createLogger } from '../services/logging';
import {
  getCcsDir,
  isUnifiedMode,
  loadOrCreateUnifiedConfig,
  mutateConfig,
} from '../config/config-loader-facade';
import { normalizeSharedResourceMetadata, type SharedResourceMode } from './shared-resource-policy';
import { ConfigError, ProfileError } from '../errors/error-types';

const logger = createLogger('auth:profile-registry');

/**
 * Profile Registry (Simplified)
 *
 * Manages account profile metadata in ~/.ccs/profiles.json
 * Each profile represents an isolated Claude instance with login credentials.
 *
 * Profile Schema (v3.0 - Minimal):
 * {
 *   type: 'account',         // Profile type
 *   created: <ISO timestamp>, // Creation time
 *   last_used: <ISO timestamp or null> // Last usage time
 *   context_mode?: 'isolated' | 'shared' // Workspace context policy
 *   context_group?: <string> // Shared context group when mode=shared
 *   continuity_mode?: 'standard' | 'deeper' // Shared continuity depth
 * }
 *
 * Removed fields from v2.x:
 * - vault: No encrypted vault (credentials in instance)
 * - subscription: No credential reading
 * - email: No credential reading
 */

interface ProfileData {
  version: string;
  profiles: Record<string, ProfileMetadata>;
  default: string | null;
}

interface CreateMetadata {
  type?: string;
  created?: string;
  last_used?: string | null;
  context_mode?: 'isolated' | 'shared';
  context_group?: string;
  continuity_mode?: 'standard' | 'deeper';
  shared_resource_mode?: SharedResourceMode;
  bare?: boolean;
}

export class ProfileRegistry {
  private profilesPath: string;

  constructor() {
    this.profilesPath = path.join(getCcsDir(), 'profiles.json');
  }

  private normalizeContextGroupValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = normalizeContextGroupName(value);
    if (normalized.length === 0 || !isValidContextGroupName(normalized)) {
      return undefined;
    }

    return normalized;
  }

  private normalizeLegacyProfileMetadata(metadata: ProfileMetadata): ProfileMetadata {
    const normalized: ProfileMetadata = { ...metadata };

    if (normalized.context_mode !== 'shared') {
      delete normalized.context_group;
      delete normalized.continuity_mode;
    } else {
      const normalizedGroup = this.normalizeContextGroupValue(normalized.context_group);
      if (normalizedGroup) {
        normalized.context_group = normalizedGroup;
      } else {
        delete normalized.context_group;
      }

      normalized.continuity_mode = normalized.continuity_mode === 'deeper' ? 'deeper' : 'standard';
    }

    return normalizeSharedResourceMetadata(normalized);
  }

  private normalizeUnifiedAccountConfig(account: AccountConfig): AccountConfig {
    const normalized: AccountConfig = { ...account };

    if (normalized.context_mode !== 'shared') {
      delete normalized.context_group;
      delete normalized.continuity_mode;
    } else {
      const normalizedGroup = this.normalizeContextGroupValue(normalized.context_group);
      if (normalizedGroup) {
        normalized.context_group = normalizedGroup;
      } else {
        delete normalized.context_group;
      }

      normalized.continuity_mode = normalized.continuity_mode === 'deeper' ? 'deeper' : 'standard';
    }

    return normalizeSharedResourceMetadata(normalized);
  }

  /**
   * Read profiles from disk
   */
  private _read(): ProfileData {
    if (!fs.existsSync(this.profilesPath)) {
      return {
        version: '2.0.0',
        profiles: {},
        default: null,
      };
    }

    try {
      const data = fs.readFileSync(this.profilesPath, 'utf8');
      return JSON.parse(data) as ProfileData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ConfigError(`Failed to read profiles: ${message}`, this.profilesPath);
    }
  }

  /**
   * Write profiles to disk atomically
   */
  private _write(data: ProfileData): void {
    const dir = path.dirname(this.profilesPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    // Atomic write: temp file + rename
    const tempPath = `${this.profilesPath}.tmp`;

    try {
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tempPath, this.profilesPath);
    } catch (error) {
      // Cleanup temp file on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ConfigError(`Failed to write profiles: ${message}`, this.profilesPath);
    }
  }

  /**
   * Create a new profile
   */
  createProfile(name: string, metadata: CreateMetadata = {}): void {
    const data = this._read();

    if (data.profiles[name]) {
      throw new ProfileError(`Profile already exists: ${name}`, name);
    }

    // v3.0 minimal schema: only essential fields
    data.profiles[name] = this.normalizeLegacyProfileMetadata({
      type: metadata.type || 'account',
      created: metadata.created || new Date().toISOString(),
      last_used: metadata.last_used || null,
      context_mode: metadata.context_mode,
      context_group: metadata.context_group,
      continuity_mode: metadata.continuity_mode,
      shared_resource_mode: metadata.shared_resource_mode,
      bare: metadata.bare,
    });

    // Note: No longer auto-set as default
    // Users must explicitly run: ccs auth default <profile>
    // Default always stays on implicit 'default' profile (uses ~/.claude/)

    this._write(data);
    logger.stage('route', 'auth.profile.created', 'Profile created in registry', {
      profile: name,
      profileType: metadata.type || 'account',
    });
  }

  /**
   * Get profile metadata
   */
  getProfile(name: string): ProfileMetadata {
    const data = this._read();

    if (!data.profiles[name]) {
      throw new ProfileError(`Profile not found: ${name}`, name);
    }

    return this.normalizeLegacyProfileMetadata(data.profiles[name]);
  }

  /**
   * Update profile metadata
   */
  updateProfile(name: string, updates: Partial<ProfileMetadata>): void {
    const data = this._read();

    if (!data.profiles[name]) {
      throw new ProfileError(`Profile not found: ${name}`, name);
    }

    data.profiles[name] = this.normalizeLegacyProfileMetadata({
      ...data.profiles[name],
      ...updates,
    });

    this._write(data);
  }

  /**
   * Delete a profile
   */
  deleteProfile(name: string): void {
    const data = this._read();

    if (!data.profiles[name]) {
      throw new ProfileError(`Profile not found: ${name}`, name);
    }

    delete data.profiles[name];

    // Clear default if it was the deleted profile
    if (data.default === name) {
      // Set to first remaining profile or null
      const remaining = Object.keys(data.profiles);
      data.default = remaining.length > 0 ? remaining[0] : null;
    }

    this._write(data);
    logger.stage('cleanup', 'auth.profile.deleted', 'Profile deleted from registry', {
      profile: name,
    });
  }

  /**
   * List all profiles
   */
  listProfiles(): string[] {
    const data = this._read();
    return Object.keys(data.profiles);
  }

  /**
   * Get all profiles with metadata
   */
  getAllProfiles(): Record<string, ProfileMetadata> {
    const data = this._read();
    const normalized: Record<string, ProfileMetadata> = {};
    for (const [name, profile] of Object.entries(data.profiles)) {
      normalized[name] = this.normalizeLegacyProfileMetadata(profile);
    }
    return normalized;
  }

  /**
   * Get default profile name
   */
  getDefaultProfile(): string | null {
    const data = this._read();
    return data.default;
  }

  /**
   * Set default profile
   */
  setDefaultProfile(name: string): void {
    const data = this._read();

    if (!data.profiles[name]) {
      throw new ProfileError(`Profile not found: ${name}`, name);
    }

    data.default = name;
    this._write(data);
  }

  /**
   * Clear default profile (restore original CCS behavior)
   */
  clearDefaultProfile(): void {
    const data = this._read();
    data.default = null;
    this._write(data);
  }

  /**
   * Check if profile exists
   */
  hasProfile(name: string): boolean {
    const data = this._read();
    return !!data.profiles[name];
  }

  /**
   * Update last used timestamp
   */
  touchProfile(name: string): void {
    this.updateProfile(name, {
      last_used: new Date().toISOString(),
    });
  }

  // ==========================================
  // Unified Config Methods
  // ==========================================

  /**
   * Create account in unified config (config.yaml)
   */
  createAccountUnified(name: string, metadata: CreateMetadata = {}): void {
    mutateConfig((config) => {
      if (config.accounts[name]) {
        throw new ProfileError(`Account already exists: ${name}`, name);
      }
      config.accounts[name] = this.normalizeUnifiedAccountConfig({
        created: new Date().toISOString(),
        last_used: null,
        context_mode: metadata.context_mode,
        context_group: metadata.context_group,
        continuity_mode: metadata.continuity_mode,
        shared_resource_mode: metadata.shared_resource_mode,
        bare: metadata.bare,
      });
    });
  }

  /**
   * Update account metadata in unified config
   */
  updateAccountUnified(name: string, updates: Partial<AccountConfig>): void {
    mutateConfig((config) => {
      if (!config.accounts[name]) {
        throw new ProfileError(`Account not found: ${name}`, name);
      }
      config.accounts[name] = this.normalizeUnifiedAccountConfig({
        ...config.accounts[name],
        ...updates,
      });
    });
  }

  /**
   * Remove account from unified config
   */
  removeAccountUnified(name: string): void {
    mutateConfig((config) => {
      if (!config.accounts[name]) {
        throw new ProfileError(`Account not found: ${name}`, name);
      }
      delete config.accounts[name];
      if (config.default === name) {
        config.default = undefined;
      }
    });
  }

  /**
   * Set default profile in unified config.
   * Accepts names from unified config (accounts, profiles, cliproxy variants)
   * as well as legacy profiles.json so that mixed-mode installs work correctly.
   */
  setDefaultUnified(name: string): void {
    // Check legacy registry outside the mutate callback to avoid re-reading inside the transaction.
    const legacyData = this._read();
    const existsLegacy = !!legacyData.profiles[name];

    mutateConfig((config) => {
      const existsUnified =
        config.accounts[name] || config.profiles[name] || config.cliproxy?.variants?.[name];
      if (!existsUnified && !existsLegacy) {
        throw new ProfileError(`Profile not found: ${name}`, name);
      }
      config.default = name;
    });
  }

  /**
   * Clear default profile in unified config (restore original CCS behavior)
   */
  clearDefaultUnified(): void {
    mutateConfig((config) => {
      config.default = undefined;
    });
  }

  /**
   * Check if account exists in unified config
   */
  hasAccountUnified(name: string): boolean {
    if (!isUnifiedMode()) return false;
    const config = loadOrCreateUnifiedConfig();
    return !!config.accounts[name];
  }

  /**
   * Get all accounts from unified config
   */
  getAllAccountsUnified(): Record<string, AccountConfig> {
    if (!isUnifiedMode()) return {};
    const config = loadOrCreateUnifiedConfig();
    const normalized: Record<string, AccountConfig> = {};
    for (const [name, account] of Object.entries(config.accounts)) {
      normalized[name] = this.normalizeUnifiedAccountConfig(account);
    }
    return normalized;
  }

  /**
   * Get default from unified config
   */
  getDefaultUnified(): string | undefined {
    if (!isUnifiedMode()) return undefined;
    const config = loadOrCreateUnifiedConfig();
    return config.default;
  }

  /**
   * Update account last_used in unified config
   */
  touchAccountUnified(name: string): void {
    mutateConfig((config) => {
      if (!config.accounts[name]) {
        throw new ProfileError(`Account not found: ${name}`, name);
      }
      config.accounts[name].last_used = new Date().toISOString();
      config.accounts[name] = this.normalizeUnifiedAccountConfig(config.accounts[name]);
    });
  }

  // ==========================================
  // DRY Helper Methods (consolidated logic)
  // ==========================================

  /**
   * Get all profiles merged from both legacy and unified config.
   * Unified config takes precedence for duplicate names.
   * DRY helper to consolidate merge logic used in multiple places.
   */
  getAllProfilesMerged(): Record<string, ProfileMetadata> {
    const legacyProfiles = this.getAllProfiles();
    const unifiedAccounts = this.getAllAccountsUnified();

    // Start with legacy profiles
    const merged: Record<string, ProfileMetadata> = { ...legacyProfiles };

    // Override with unified config accounts (takes precedence)
    for (const [name, account] of Object.entries(unifiedAccounts)) {
      merged[name] = {
        type: 'account',
        created: account.created,
        last_used: account.last_used,
        context_mode: account.context_mode,
        context_group: account.context_group,
        continuity_mode: account.continuity_mode,
        shared_resource_mode: account.shared_resource_mode,
        bare: account.bare,
      };
    }

    return merged;
  }

  /**
   * Get resolved default profile from unified config first, fallback to legacy.
   * DRY helper to consolidate default resolution logic.
   */
  getDefaultResolved(): string | null {
    return this.getDefaultUnified() ?? this.getDefaultProfile();
  }
}

export default ProfileRegistry;
