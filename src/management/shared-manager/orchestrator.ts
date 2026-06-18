/**
 * SharedManager orchestrator.
 *
 * Thin coordinator over the focused submodules under shared-manager/. The
 * class is responsible ONLY for:
 *   1. Resolving filesystem roots (homeDir, ccsDir, sharedDir, claudeDir,
 *      instancesDir) and the plugin-layout lock.
 *   2. Forwarding every public method to the appropriate extracted helper,
 *      passing those roots explicitly.
 *
 * All behavior, signatures, and structured logging live in the submodules
 * and are preserved exactly. This file deliberately contains no logic of
 * its own.
 */

import * as os from 'os';
import * as path from 'path';

import { warn } from '../../utils/ui';
import type { AccountContextPolicy } from '../../auth/account-context';
import { getCcsDir } from '../../config/config-loader-facade';
import ProfileContextSyncLock from '../profile-context-sync-lock';

import {
  normalizeMarketplaceRegistryPaths,
  normalizePluginRegistryPaths,
  type PluginMetadataRoots,
} from './plugin-metadata-normalizer';
import {
  ensureSharedDirectories,
  detachSharedDirectories,
  linkSharedDirectories,
  type LinkerRoots,
} from './shared-dir-linker';
import {
  syncAdvancedContinuityArtifacts,
  syncProjectContext,
  type ContextSyncRoots,
} from './project-context-sync';
import { syncProjectMemories } from './project-memory-sync';
import { migrateFromV311, migrateToSharedSettings } from './migrations';
import type { SymlinkHelperDeps } from './symlink-helpers';

/**
 * SharedManager Class
 *
 * Manages symlinked shared directories for CCS. See submodule docs for the
 * detailed behavior of each operation.
 */
class SharedManager {
  private readonly homeDir: string;
  private readonly sharedDir: string;
  private readonly claudeDir: string;
  private readonly instancesDir: string;
  private readonly pluginLayoutLock: ProfileContextSyncLock;

  constructor() {
    this.homeDir = os.homedir();
    const ccsDir = getCcsDir();
    this.sharedDir = path.join(ccsDir, 'shared');
    this.claudeDir = path.join(this.homeDir, '.claude');
    this.instancesDir = path.join(ccsDir, 'instances');
    this.pluginLayoutLock = new ProfileContextSyncLock(this.instancesDir);
  }

  private get roots(): LinkerRoots & PluginMetadataRoots & ContextSyncRoots {
    return {
      claudeDir: this.claudeDir,
      sharedDir: this.sharedDir,
      instancesDir: this.instancesDir,
    };
  }

  private get symlinkDeps(): SymlinkHelperDeps {
    return { warn };
  }

  /**
   * Ensure shared directories exist as symlinks to ~/.claude/. Creates
   * ~/.claude/ structure if missing.
   */
  ensureSharedDirectories(): void {
    ensureSharedDirectories(this.roots);
  }

  /**
   * Link shared directories into an instance.
   */
  linkSharedDirectories(instancePath: string): void {
    linkSharedDirectories(this.roots, instancePath);
  }

  /**
   * Detach shared-directory symlinks from an instance.
   */
  detachSharedDirectories(instancePath: string): void {
    detachSharedDirectories(this.roots, instancePath);
  }

  /**
   * Sync project workspace context based on account policy.
   */
  async syncProjectContext(instancePath: string, policy: AccountContextPolicy): Promise<void> {
    await syncProjectContext(this.roots, instancePath, policy, this.symlinkDeps);
  }

  /**
   * Sync advanced continuity artifacts for shared deeper mode.
   */
  async syncAdvancedContinuityArtifacts(
    instancePath: string,
    policy: AccountContextPolicy
  ): Promise<void> {
    await syncAdvancedContinuityArtifacts(this.roots, instancePath, policy, this.symlinkDeps);
  }

  /**
   * Ensure all project memory directories for an instance are shared.
   */
  async syncProjectMemories(instancePath: string): Promise<void> {
    await syncProjectMemories(this.roots, instancePath, this.symlinkDeps);
  }

  /**
   * Normalize plugin metadata and reconcile marketplace metadata for the
   * active config dir.
   */
  normalizeSharedPluginMetadataPaths(configDir?: string): void {
    this.normalizePluginRegistryPaths(configDir);
    this.normalizeMarketplaceRegistryPaths(configDir);
  }

  /**
   * Same as normalizeSharedPluginMetadataPaths but guarded by the
   * plugin-layout named lock so concurrent instances cannot interleave.
   */
  normalizeSharedPluginMetadataPathsLocked(configDir?: string): void {
    this.pluginLayoutLock.withNamedLockSync('__plugin-layout__', () => {
      this.normalizeSharedPluginMetadataPaths(configDir);
    });
  }

  /**
   * Normalize installed_plugins.json paths to canonical ~/.claude/ paths.
   */
  normalizePluginRegistryPaths(configDir?: string): void {
    normalizePluginRegistryPaths(this.roots, configDir);
  }

  /**
   * Reconcile marketplace registry content into the active config dir and
   * keep the global ~/.claude copy up to date.
   */
  normalizeMarketplaceRegistryPaths(configDir?: string): void {
    normalizeMarketplaceRegistryPaths(this.roots, configDir);
  }

  /**
   * Migrate from v3.1.1 (copied data in ~/.ccs/shared/) to v3.2.0 (symlinks
   * to ~/.claude/). Runs once on upgrade.
   */
  migrateFromV311(): void {
    migrateFromV311(this.roots);
  }

  /**
   * Migrate existing instances from isolated to shared settings.json
   * (v4.4+). Runs once on upgrade.
   */
  migrateToSharedSettings(): void {
    migrateToSharedSettings(this.roots);
  }
}

export default SharedManager;
