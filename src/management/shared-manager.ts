/**
 * SharedManager - Manages symlinked shared directories for CCS
 * v3.2.0: Symlink-based architecture
 *
 * Purpose: Eliminates duplication by symlinking:
 * ~/.claude/ ← ~/.ccs/shared/ ← instance/
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ProfileContextSyncLock from './profile-context-sync-lock';
import { ok, info, warn } from '../utils/ui';
import { DEFAULT_ACCOUNT_CONTEXT_GROUP } from '../auth/account-context';
import type { AccountContextPolicy } from '../auth/account-context';

import {
  normalizePluginMetadataContent,
  normalizePluginMetadataValue,
} from './plugin-path-normalizer';
import { getCcsDir } from '../config/config-loader-facade';
import { listAccountInstanceNames, listAccountInstancePaths } from './instance-directory';
export {
  normalizePluginMetadataContent,
  normalizePluginMetadataPathString,
} from './plugin-path-normalizer';

interface SharedItem {
  name: string;
  type: 'directory' | 'file';
}

const DEFAULT_INSTALLED_PLUGIN_REGISTRY = JSON.stringify(
  {
    version: 2,
    plugins: {},
  },
  null,
  2
);

/**
 * SharedManager Class
 */
class SharedManager {
  private readonly homeDir: string;
  private readonly sharedDir: string;
  private readonly claudeDir: string;
  private readonly instancesDir: string;
  private readonly pluginLayoutLock: ProfileContextSyncLock;
  private readonly sharedItems: SharedItem[];
  private readonly sharedPluginEntries: readonly SharedItem[] = [
    { name: 'cache', type: 'directory' },
    { name: 'marketplaces', type: 'directory' },
    { name: 'installed_plugins.json', type: 'file' },
  ];
  private readonly instanceLocalPluginMetadataFiles = new Set(['known_marketplaces.json']);
  private readonly advancedContinuityItems: readonly string[] = [
    'session-env',
    'file-history',
    'shell-snapshots',
    'todos',
  ];

  constructor() {
    this.homeDir = os.homedir();
    const ccsDir = getCcsDir();
    this.sharedDir = path.join(ccsDir, 'shared');
    this.claudeDir = path.join(this.homeDir, '.claude');
    this.instancesDir = path.join(ccsDir, 'instances');
    this.pluginLayoutLock = new ProfileContextSyncLock(this.instancesDir);
    this.sharedItems = [
      { name: 'commands', type: 'directory' },
      { name: 'skills', type: 'directory' },
      { name: 'agents', type: 'directory' },
      { name: 'plugins', type: 'directory' },
      { name: 'settings.json', type: 'file' },
    ];
  }

  /**
   * Detect circular symlink before creation
   */
  private detectCircularSymlink(target: string): boolean {
    try {
      const stats = fs.lstatSync(target);
      if (!stats.isSymbolicLink()) {
        return false;
      }

      // Resolve target's link
      const targetLink = fs.readlinkSync(target);
      const resolvedTarget = path.resolve(path.dirname(target), targetLink);
      const sharedDirPath = path.resolve(this.sharedDir);

      // A raw target path pointing back into ~/.ccs/shared is already unsafe.
      // Re-pointing ~/.ccs/shared/* to ~/.claude/* would turn it into a real loop,
      // even if the current ~/.ccs/shared entry ultimately resolves to an external path.
      if (this.isPathWithinDirectory(resolvedTarget, sharedDirPath)) {
        console.log(warn(`Circular symlink detected: ${target} → ${resolvedTarget}`));
        return true;
      }

      // Only treat targets inside the managed shared root as circular.
      // Existing shared symlinks may already resolve through ~/.claude/ to an
      // external repo, which is a supported upgrade path rather than a loop.
      const sharedDir = this.resolveCanonicalPath(sharedDirPath);
      const canonicalResolvedTarget = this.resolveCanonicalPath(resolvedTarget);

      if (this.isPathWithinDirectory(canonicalResolvedTarget, sharedDir)) {
        console.log(warn(`Circular symlink detected: ${target} → ${resolvedTarget}`));
        return true;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw err;
    }

    return false;
  }

  /**
   * Ensure shared directories exist as symlinks to ~/.claude/
   * Creates ~/.claude/ structure if missing
   */
  ensureSharedDirectories(): void {
    // Create ~/.claude/ if missing
    if (!this.getLstatSync(this.claudeDir)) {
      console.log(info('Creating ~/.claude/ directory structure'));
      fs.mkdirSync(this.claudeDir, { recursive: true, mode: 0o700 });
    }

    // Create shared directory
    if (!this.getLstatSync(this.sharedDir)) {
      fs.mkdirSync(this.sharedDir, { recursive: true, mode: 0o700 });
    }

    this.ensureSharedPluginLayoutDefaults();

    // Create symlinks ~/.ccs/shared/* → ~/.claude/*
    for (const item of this.sharedItems) {
      const claudePath = path.join(this.claudeDir, item.name);
      const sharedPath = path.join(this.sharedDir, item.name);

      // Create in ~/.claude/ if missing
      if (!this.getLstatSync(claudePath)) {
        if (item.type === 'directory') {
          fs.mkdirSync(claudePath, { recursive: true, mode: 0o700 });
        } else if (item.type === 'file') {
          // Create empty settings.json if missing
          fs.writeFileSync(claudePath, JSON.stringify({}, null, 2), 'utf8');
        }
      }

      // Check for circular symlink
      if (this.detectCircularSymlink(claudePath)) {
        console.log(warn(`Skipping ${item.name}: circular symlink detected`));
        continue;
      }

      // If already a symlink pointing to correct target, skip
      if (this.getLstatSync(sharedPath)) {
        try {
          const stats = fs.lstatSync(sharedPath);
          if (stats.isSymbolicLink()) {
            const currentTarget = fs.readlinkSync(sharedPath);
            const resolvedTarget = path.resolve(path.dirname(sharedPath), currentTarget);
            if (resolvedTarget === claudePath) {
              continue; // Already correct
            }
          }
        } catch (_err) {
          // Continue to recreate
        }

        // Remove existing file/directory/link
        if (item.type === 'directory') {
          fs.rmSync(sharedPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(sharedPath);
        }
      }

      // Create symlink
      try {
        const symlinkType = item.type === 'directory' ? 'dir' : 'file';
        fs.symlinkSync(claudePath, sharedPath, symlinkType);
      } catch (_err) {
        // Windows fallback: copy
        if (process.platform === 'win32') {
          if (item.type === 'directory') {
            this.copyDirectoryFallback(claudePath, sharedPath);
          } else if (item.type === 'file') {
            fs.copyFileSync(claudePath, sharedPath);
          }
          console.log(
            warn(`Symlink failed for ${item.name}, copied instead (enable Developer Mode)`)
          );
        } else {
          throw _err;
        }
      }
    }
  }

  /**
   * Link shared directories to instance
   */
  linkSharedDirectories(instancePath: string): void {
    this.ensureSharedDirectories();

    for (const item of this.sharedItems) {
      if (item.name === 'plugins') {
        this.linkInstancePlugins(instancePath);
        continue;
      }

      const linkPath = path.join(instancePath, item.name);
      const targetPath = path.join(this.sharedDir, item.name);

      this.removeExistingPath(linkPath, item.type);

      // Create symlink
      try {
        const symlinkType = item.type === 'directory' ? 'dir' : 'file';
        fs.symlinkSync(targetPath, linkPath, symlinkType);
      } catch (_err) {
        // Windows fallback
        if (process.platform === 'win32') {
          if (item.type === 'directory') {
            this.copyDirectoryFallback(targetPath, linkPath);
          } else if (item.type === 'file') {
            fs.copyFileSync(targetPath, linkPath);
          }
          console.log(
            warn(`Symlink failed for ${item.name}, copied instead (enable Developer Mode)`)
          );
        } else {
          throw _err;
        }
      }
    }

    this.normalizeSharedPluginMetadataPaths(instancePath);
  }

  detachSharedDirectories(instancePath: string): void {
    this.ensureSharedDirectories();

    for (const item of this.sharedItems) {
      const managedPath = path.join(instancePath, item.name);
      if (!fs.existsSync(managedPath)) {
        continue;
      }

      if (item.name === 'plugins') {
        this.detachManagedPluginLayout(instancePath);
        continue;
      }

      const stats = fs.lstatSync(managedPath);
      if (!stats.isSymbolicLink()) {
        continue;
      }

      if (this.symlinkPointsTo(managedPath, path.join(this.sharedDir, item.name))) {
        this.removeExistingPath(managedPath, item.type);
      }
    }
  }

  private ensureSharedPluginLayoutDefaults(): void {
    const pluginsDir = path.join(this.claudeDir, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true, mode: 0o700 });

    for (const entry of this.sharedPluginEntries) {
      const entryPath = path.join(pluginsDir, entry.name);
      if (fs.existsSync(entryPath)) {
        continue;
      }

      if (entry.type === 'directory') {
        fs.mkdirSync(entryPath, { recursive: true, mode: 0o700 });
        continue;
      }

      fs.writeFileSync(entryPath, DEFAULT_INSTALLED_PLUGIN_REGISTRY, 'utf8');
    }

    const marketplaceRegistryPath = path.join(pluginsDir, 'known_marketplaces.json');
    if (!fs.existsSync(marketplaceRegistryPath)) {
      fs.writeFileSync(marketplaceRegistryPath, JSON.stringify({}, null, 2), 'utf8');
    }
  }

  private linkInstancePlugins(instancePath: string): void {
    const linkPath = path.join(instancePath, 'plugins');
    const targetPath = path.join(this.sharedDir, 'plugins');
    let linkStats: fs.Stats | null = null;

    try {
      linkStats = fs.lstatSync(linkPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }

    if (linkStats?.isSymbolicLink() || (linkStats && !linkStats.isDirectory())) {
      this.removeExistingPath(linkPath, linkStats.isDirectory() ? 'directory' : 'file');
    }

    if (!linkStats || !linkStats.isDirectory()) {
      fs.mkdirSync(linkPath, { recursive: true, mode: 0o700 });
    }

    for (const item of this.getSharedPluginLinkItems()) {
      const targetEntryPath = path.join(targetPath, item.name);
      const linkEntryPath = path.join(linkPath, item.name);

      this.removeExistingPath(linkEntryPath, item.type);

      try {
        const symlinkType = item.type === 'directory' ? 'dir' : 'file';
        fs.symlinkSync(targetEntryPath, linkEntryPath, symlinkType);
      } catch (_err) {
        if (process.platform === 'win32') {
          if (item.type === 'directory') {
            this.copyDirectoryFallback(targetEntryPath, linkEntryPath);
          } else {
            fs.copyFileSync(targetEntryPath, linkEntryPath);
          }
          console.log(
            warn(`Symlink failed for plugins/${item.name}, copied instead (enable Developer Mode)`)
          );
        } else {
          throw _err;
        }
      }
    }
  }

  private getSharedPluginLinkItems(): SharedItem[] {
    const sharedPluginsPath = path.join(this.sharedDir, 'plugins');
    const items = new Map<string, SharedItem>(
      this.sharedPluginEntries.map((entry) => [entry.name, { ...entry }])
    );

    for (const entry of fs.readdirSync(sharedPluginsPath, { withFileTypes: true })) {
      if (items.has(entry.name) || this.instanceLocalPluginMetadataFiles.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(sharedPluginsPath, entry.name);
      const stats = fs.statSync(entryPath);
      items.set(entry.name, {
        name: entry.name,
        type: stats.isDirectory() ? 'directory' : 'file',
      });
    }

    return [...items.values()];
  }

  private removeExistingPath(targetPath: string, typeHint: SharedItem['type']): void {
    try {
      const stats = fs.lstatSync(targetPath);
      if (stats.isDirectory() && !stats.isSymbolicLink()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        return;
      }

      if (stats.isSymbolicLink() || typeHint === 'file') {
        fs.unlinkSync(targetPath);
        return;
      }

      fs.rmSync(targetPath, { recursive: true, force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }

      if (typeHint === 'directory') {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.rmSync(targetPath, { force: true });
      }
    }
  }

  /**
   * Sync project workspace context based on account policy.
   *
   * - isolated (default): each profile keeps its own ./projects directory.
   * - shared: profile ./projects becomes symlink to shared context group root.
   */
  async syncProjectContext(instancePath: string, policy: AccountContextPolicy): Promise<void> {
    const projectsPath = path.join(instancePath, 'projects');
    const instanceName = path.basename(instancePath);
    const mode = policy.mode === 'shared' ? 'shared' : 'isolated';

    if (mode === 'shared') {
      const contextGroup = policy.group || DEFAULT_ACCOUNT_CONTEXT_GROUP;
      const sharedProjectsPath = path.join(
        this.sharedDir,
        'context-groups',
        contextGroup,
        'projects'
      );

      await this.ensureDirectory(sharedProjectsPath);
      await this.ensureDirectory(path.dirname(projectsPath));

      const currentStats = await this.getLstat(projectsPath);
      if (!currentStats) {
        await this.linkDirectoryWithFallback(sharedProjectsPath, projectsPath);
        return;
      }

      if (currentStats.isSymbolicLink()) {
        if (await this.isSymlinkTarget(projectsPath, sharedProjectsPath)) {
          return;
        }

        const currentTarget = await this.resolveSymlinkTargetPath(projectsPath);
        if (
          currentTarget &&
          path.resolve(currentTarget) !== path.resolve(sharedProjectsPath) &&
          this.isSafeProjectsMergeSource(currentTarget, instanceName) &&
          (await this.pathExists(currentTarget))
        ) {
          await this.mergeDirectoryWithConflictCopies(
            currentTarget,
            sharedProjectsPath,
            instanceName
          );
        } else if (currentTarget && !this.isSafeProjectsMergeSource(currentTarget, instanceName)) {
          console.log(
            warn(`Skipping unsafe project merge source outside CCS roots: ${currentTarget}`)
          );
        }

        await fs.promises.unlink(projectsPath);
        await this.linkDirectoryWithFallback(sharedProjectsPath, projectsPath);
        return;
      }

      if (currentStats.isDirectory()) {
        await this.detachLegacySharedMemoryLinks(projectsPath, instanceName);
        await this.mergeDirectoryWithConflictCopies(projectsPath, sharedProjectsPath, instanceName);
        await fs.promises.rm(projectsPath, { recursive: true, force: true });
        await this.linkDirectoryWithFallback(sharedProjectsPath, projectsPath);
        return;
      }

      await fs.promises.rm(projectsPath, { force: true });
      await this.linkDirectoryWithFallback(sharedProjectsPath, projectsPath);
      return;
    }

    const currentStats = await this.getLstat(projectsPath);
    if (!currentStats) {
      await this.ensureDirectory(projectsPath);
      return;
    }

    if (currentStats.isDirectory()) {
      await this.detachLegacySharedMemoryLinks(projectsPath, instanceName);
      return;
    }

    if (currentStats.isSymbolicLink()) {
      const currentTarget = await this.resolveSymlinkTargetPath(projectsPath);
      await fs.promises.unlink(projectsPath);
      await this.ensureDirectory(projectsPath);

      if (
        currentTarget &&
        path.resolve(currentTarget) !== path.resolve(projectsPath) &&
        this.isSafeProjectsMergeSource(currentTarget, instanceName) &&
        (await this.pathExists(currentTarget))
      ) {
        await this.mergeDirectoryWithConflictCopies(currentTarget, projectsPath, instanceName);
      } else if (currentTarget && !this.isSafeProjectsMergeSource(currentTarget, instanceName)) {
        console.log(
          warn(`Skipping unsafe project merge source outside CCS roots: ${currentTarget}`)
        );
      }

      return;
    }

    await fs.promises.rm(projectsPath, { force: true });
    await this.ensureDirectory(projectsPath);
  }

  /**
   * Sync advanced continuity artifacts for shared deeper mode.
   *
   * - shared + deeper: artifacts are linked per context group.
   * - shared + standard / isolated: artifacts stay local to instance.
   */
  async syncAdvancedContinuityArtifacts(
    instancePath: string,
    policy: AccountContextPolicy
  ): Promise<void> {
    const instanceName = path.basename(instancePath);
    const useSharedContinuity = policy.mode === 'shared' && policy.continuityMode === 'deeper';
    const contextGroup = policy.group || DEFAULT_ACCOUNT_CONTEXT_GROUP;

    for (const artifactName of this.advancedContinuityItems) {
      const instanceArtifactPath = path.join(instancePath, artifactName);

      if (useSharedContinuity) {
        const sharedArtifactPath = path.join(
          this.sharedDir,
          'context-groups',
          contextGroup,
          'continuity',
          artifactName
        );

        await this.ensureDirectory(sharedArtifactPath);
        await this.ensureDirectory(path.dirname(instanceArtifactPath));

        const currentStats = await this.getLstat(instanceArtifactPath);
        if (!currentStats) {
          await this.linkDirectoryWithFallback(sharedArtifactPath, instanceArtifactPath);
          continue;
        }

        if (currentStats.isSymbolicLink()) {
          if (await this.isSymlinkTarget(instanceArtifactPath, sharedArtifactPath)) {
            continue;
          }

          const currentTarget = await this.resolveSymlinkTargetPath(instanceArtifactPath);
          if (
            currentTarget &&
            path.resolve(currentTarget) !== path.resolve(sharedArtifactPath) &&
            this.isSafeContinuityMergeSource(currentTarget, instanceName, artifactName) &&
            (await this.pathExists(currentTarget))
          ) {
            await this.mergeDirectoryWithConflictCopies(
              currentTarget,
              sharedArtifactPath,
              instanceName
            );
          } else if (
            currentTarget &&
            !this.isSafeContinuityMergeSource(currentTarget, instanceName, artifactName)
          ) {
            console.log(
              warn(
                `Skipping unsafe ${artifactName} merge source outside CCS roots: ${currentTarget}`
              )
            );
          }

          await fs.promises.unlink(instanceArtifactPath);
          await this.linkDirectoryWithFallback(sharedArtifactPath, instanceArtifactPath);
          continue;
        }

        if (currentStats.isDirectory()) {
          await this.mergeDirectoryWithConflictCopies(
            instanceArtifactPath,
            sharedArtifactPath,
            instanceName
          );
          await fs.promises.rm(instanceArtifactPath, { recursive: true, force: true });
          await this.linkDirectoryWithFallback(sharedArtifactPath, instanceArtifactPath);
          continue;
        }

        await fs.promises.rm(instanceArtifactPath, { force: true });
        await this.linkDirectoryWithFallback(sharedArtifactPath, instanceArtifactPath);
        continue;
      }

      const currentStats = await this.getLstat(instanceArtifactPath);
      if (!currentStats) {
        await this.ensureDirectory(instanceArtifactPath);
        continue;
      }

      if (currentStats.isDirectory()) {
        continue;
      }

      if (currentStats.isSymbolicLink()) {
        const currentTarget = await this.resolveSymlinkTargetPath(instanceArtifactPath);
        await fs.promises.unlink(instanceArtifactPath);
        await this.ensureDirectory(instanceArtifactPath);

        if (
          currentTarget &&
          path.resolve(currentTarget) !== path.resolve(instanceArtifactPath) &&
          this.isSafeContinuityMergeSource(currentTarget, instanceName, artifactName) &&
          (await this.pathExists(currentTarget))
        ) {
          await this.mergeDirectoryWithConflictCopies(
            currentTarget,
            instanceArtifactPath,
            instanceName
          );
        } else if (
          currentTarget &&
          !this.isSafeContinuityMergeSource(currentTarget, instanceName, artifactName)
        ) {
          console.log(
            warn(`Skipping unsafe ${artifactName} merge source outside CCS roots: ${currentTarget}`)
          );
        }

        continue;
      }

      await fs.promises.rm(instanceArtifactPath, { force: true });
      await this.ensureDirectory(instanceArtifactPath);
    }
  }

  /**
   * Ensure all project memory directories for an instance are shared.
   *
   * Source layout (isolated):
   *   ~/.ccs/instances/<profile>/projects/<project>/memory/
   *
   * Shared layout (canonical):
   *   ~/.ccs/shared/memory/<project>/
   */
  async syncProjectMemories(instancePath: string): Promise<void> {
    const projectsDir = path.join(instancePath, 'projects');
    if (!(await this.pathExists(projectsDir))) {
      return;
    }

    await this.ensureDirectory(this.sharedDir);

    const sharedMemoryRoot = path.join(this.sharedDir, 'memory');
    await this.ensureDirectory(sharedMemoryRoot);

    let projectEntries: fs.Dirent[] = [];
    try {
      projectEntries = await fs.promises.readdir(projectsDir, { withFileTypes: true });
    } catch (_err) {
      return;
    }

    const projects = projectEntries.filter((entry) => entry.isDirectory());
    if (projects.length === 0) {
      return;
    }

    let migrated = 0;
    let merged = 0;
    let linked = 0;
    const instanceName = path.basename(instancePath);

    for (const project of projects) {
      const projectDir = path.join(projectsDir, project.name);
      const projectMemoryPath = path.join(projectDir, 'memory');
      const sharedProjectMemoryPath = path.join(sharedMemoryRoot, project.name);

      const projectMemoryStats = await this.getLstat(projectMemoryPath);
      if (!projectMemoryStats) {
        if (await this.ensureProjectMemoryLink(projectMemoryPath, sharedProjectMemoryPath)) {
          linked++;
        }
        continue;
      }

      if (projectMemoryStats.isSymbolicLink()) {
        if (await this.isSymlinkTarget(projectMemoryPath, sharedProjectMemoryPath)) {
          continue;
        }

        await fs.promises.unlink(projectMemoryPath);
        if (await this.ensureProjectMemoryLink(projectMemoryPath, sharedProjectMemoryPath)) {
          linked++;
        }
        continue;
      }

      if (!projectMemoryStats.isDirectory()) {
        continue;
      }

      if (!(await this.pathExists(sharedProjectMemoryPath))) {
        await this.moveDirectory(projectMemoryPath, sharedProjectMemoryPath);
        migrated++;
      } else {
        merged += await this.mergeDirectoryWithConflictCopies(
          projectMemoryPath,
          sharedProjectMemoryPath,
          instanceName
        );
        await fs.promises.rm(projectMemoryPath, { recursive: true, force: true });
      }

      if (await this.ensureProjectMemoryLink(projectMemoryPath, sharedProjectMemoryPath)) {
        linked++;
      }
    }

    if (migrated > 0 || merged > 0 || linked > 0) {
      console.log(
        ok(
          `Synced shared project memory: ${migrated} migrated, ${merged} merged conflict(s), ${linked} linked`
        )
      );
    }
  }

  /**
   * Normalize plugin metadata and reconcile marketplace metadata for the active config dir.
   */
  normalizeSharedPluginMetadataPaths(configDir?: string): void {
    this.normalizePluginRegistryPaths(configDir);
    this.normalizeMarketplaceRegistryPaths(configDir);
  }

  normalizeSharedPluginMetadataPathsLocked(configDir?: string): void {
    this.pluginLayoutLock.withNamedLockSync('__plugin-layout__', () => {
      this.normalizeSharedPluginMetadataPaths(configDir);
    });
  }

  /**
   * Normalize plugin registry paths to use canonical ~/.claude/ paths
   * instead of instance-specific ~/.ccs/instances/<name>/ paths.
   *
   * This ensures installed_plugins.json is consistent regardless of
   * which CCS instance installed the plugin.
   */
  normalizePluginRegistryPaths(configDir?: string): void {
    this.normalizePluginMetadataFiles(
      'installed_plugins.json',
      configDir,
      'Normalized plugin registry paths',
      'plugin registry'
    );
  }

  /**
   * Reconcile marketplace registry content into the active config dir while
   * keeping the global ~/.claude copy up to date for non-instance flows.
   */
  normalizeMarketplaceRegistryPaths(configDir?: string): void {
    const successMessage = 'Synchronized marketplace registry paths';
    const warningLabel = 'marketplace registry';

    try {
      const sourcePaths = this.getMarketplaceRegistrySourcePaths(configDir);
      this.writePluginMetadataFile(
        path.join(this.claudeDir, 'plugins', 'known_marketplaces.json'),
        this.buildMarketplaceRegistryContent(sourcePaths, this.claudeDir),
        successMessage
      );

      if (configDir && path.resolve(configDir) !== path.resolve(this.claudeDir)) {
        this.writePluginMetadataFile(
          path.join(configDir, 'plugins', 'known_marketplaces.json'),
          this.buildMarketplaceRegistryContent(sourcePaths, configDir),
          successMessage
        );
      }
    } catch (err) {
      console.log(warn(`Could not synchronize ${warningLabel}: ${(err as Error).message}`));
    }
  }

  private normalizePluginMetadataFiles(
    fileName: string,
    configDir: string | undefined,
    successMessage: string,
    warningLabel: string
  ): void {
    const seen = new Set<string>();

    for (const registryPath of this.getPluginMetadataFilePaths(fileName, configDir)) {
      const dedupeKey = this.resolveCanonicalPath(registryPath);
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      this.normalizePluginMetadataFile(registryPath, successMessage, warningLabel);
    }
  }

  private getPluginMetadataFilePaths(fileName: string, configDir?: string): string[] {
    const pluginDirs = new Set<string>([
      path.join(this.claudeDir, 'plugins'),
      path.join(this.sharedDir, 'plugins'),
    ]);

    if (configDir && path.resolve(configDir) !== path.resolve(this.claudeDir)) {
      pluginDirs.add(path.join(configDir, 'plugins'));
    }

    return [...pluginDirs].map((pluginDir) => path.join(pluginDir, fileName));
  }

  private normalizePluginMetadataFile(
    registryPath: string,
    successMessage: string,
    warningLabel: string
  ): void {
    if (!fs.existsSync(registryPath)) {
      return;
    }

    try {
      const original = fs.readFileSync(registryPath, 'utf8');
      const normalized = normalizePluginMetadataContent(original);

      if (normalized !== original) {
        fs.writeFileSync(registryPath, normalized, 'utf8');
        console.log(ok(successMessage));
      }
    } catch (err) {
      console.log(warn(`Could not normalize ${warningLabel}: ${(err as Error).message}`));
    }
  }

  private getMarketplaceRegistrySourcePaths(configDir?: string): string[] {
    const sourcePaths = new Set<string>([
      path.join(this.claudeDir, 'plugins', 'known_marketplaces.json'),
    ]);

    for (const instancePath of listAccountInstancePaths(this.instancesDir)) {
      sourcePaths.add(path.join(instancePath, 'plugins', 'known_marketplaces.json'));
    }

    if (configDir && path.resolve(configDir) !== path.resolve(this.claudeDir)) {
      sourcePaths.add(path.join(configDir, 'plugins', 'known_marketplaces.json'));
    }

    return [...sourcePaths];
  }

  private buildMarketplaceRegistryContent(sourcePaths: string[], targetConfigDir: string): string {
    const merged: Record<string, unknown> = {};

    for (const registryPath of sourcePaths) {
      if (!fs.existsSync(registryPath)) {
        continue;
      }

      try {
        const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          continue;
        }

        for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (!this.isMarketplaceRegistryEntry(value)) {
            continue;
          }

          merged[name] = normalizePluginMetadataValue(value, targetConfigDir).normalized;
        }
      } catch (err) {
        console.log(
          warn(`Skipping malformed marketplace registry ${registryPath}: ${(err as Error).message}`)
        );
      }
    }

    const discoveredEntries = this.discoverMarketplaceEntries(targetConfigDir);

    // Keep only registry entries that have a physical directory, and update their
    // installLocation. Entries only on disk (no registry record) are excluded —
    // they lack required schema fields that Claude Code enforces.
    for (const name of Object.keys(merged)) {
      const entry = merged[name];
      if (!(name in discoveredEntries)) {
        delete merged[name];
      } else if (this.isMarketplaceRegistryEntry(entry)) {
        merged[name] = {
          ...entry,
          installLocation: discoveredEntries[name].installLocation,
        };
      } else {
        delete merged[name];
      }
    }

    return JSON.stringify(merged, null, 2);
  }

  private discoverMarketplaceEntries(
    targetConfigDir: string
  ): Record<string, { installLocation: string }> {
    const marketplacesDir = path.join(targetConfigDir, 'plugins', 'marketplaces');
    if (!fs.existsSync(marketplacesDir)) {
      return {};
    }

    const discovered: Record<string, { installLocation: string }> = {};

    for (const entry of fs.readdirSync(marketplacesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      // Skip hidden dirs and Claude Code rename-dance leftovers (.staging/.bak).
      if (this.isTransientMarketplaceDirectory(entry.name)) {
        continue;
      }

      discovered[entry.name] = {
        installLocation: path.join(targetConfigDir, 'plugins', 'marketplaces', entry.name),
      };
    }

    return discovered;
  }

  private isTransientMarketplaceDirectory(name: string): boolean {
    return name.startsWith('.') || name.endsWith('.staging') || name.endsWith('.bak');
  }

  private isMarketplaceRegistryEntry(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private writePluginMetadataFile(
    registryPath: string,
    content: string,
    successMessage: string
  ): void {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true, mode: 0o700 });
    const current = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : null;

    if (current === content) {
      return;
    }

    fs.writeFileSync(registryPath, content, 'utf8');
    console.log(ok(successMessage));
  }

  /**
   * Migrate from v3.1.1 (copied data in ~/.ccs/shared/) to v3.2.0 (symlinks to ~/.claude/)
   * Runs once on upgrade
   */
  migrateFromV311(): void {
    // Check if migration already done (shared dirs are symlinks)
    const commandsPath = path.join(this.sharedDir, 'commands');
    if (fs.existsSync(commandsPath)) {
      try {
        if (fs.lstatSync(commandsPath).isSymbolicLink()) {
          return; // Already migrated
        }
      } catch (_err) {
        // Continue with migration
      }
    }

    console.log(info('Migrating from v3.1.1 to v3.2.0...'));

    // Ensure ~/.claude/ exists
    if (!fs.existsSync(this.claudeDir)) {
      fs.mkdirSync(this.claudeDir, { recursive: true, mode: 0o700 });
    }

    // Copy user modifications from ~/.ccs/shared/ to ~/.claude/
    for (const item of this.sharedItems) {
      const sharedPath = path.join(this.sharedDir, item.name);
      const claudePath = path.join(this.claudeDir, item.name);

      if (!fs.existsSync(sharedPath)) continue;

      try {
        const stats = fs.lstatSync(sharedPath);

        // Handle directories
        if (item.type === 'directory' && stats.isDirectory()) {
          // Create claude dir if missing
          if (!fs.existsSync(claudePath)) {
            fs.mkdirSync(claudePath, { recursive: true, mode: 0o700 });
          }

          // Copy files from shared to claude (preserve user modifications)
          const entries = fs.readdirSync(sharedPath, { withFileTypes: true });
          let copied = 0;

          for (const entry of entries) {
            const src = path.join(sharedPath, entry.name);
            const dest = path.join(claudePath, entry.name);

            // Skip if already exists in claude
            if (fs.existsSync(dest)) continue;

            if (entry.isDirectory()) {
              fs.cpSync(src, dest, { recursive: true });
            } else {
              fs.copyFileSync(src, dest);
            }
            copied++;
          }

          if (copied > 0) {
            console.log(ok(`Migrated ${copied} ${item.name} to ~/.claude/${item.name}`));
          }
        }

        // Handle files (settings.json)
        else if (item.type === 'file' && stats.isFile()) {
          // Only copy if ~/.claude/ version doesn't exist
          if (!fs.existsSync(claudePath)) {
            fs.copyFileSync(sharedPath, claudePath);
            console.log(ok(`Migrated ${item.name} to ~/.claude/${item.name}`));
          }
        }
      } catch (_err) {
        console.log(warn(`Failed to migrate ${item.name}: ${(_err as Error).message}`));
      }
    }

    // Now run ensureSharedDirectories to create symlinks
    this.ensureSharedDirectories();

    // Update all instances to use new symlinks
    if (fs.existsSync(this.instancesDir)) {
      try {
        for (const instance of listAccountInstanceNames(this.instancesDir)) {
          const instancePath = path.join(this.instancesDir, instance);
          try {
            this.linkSharedDirectories(instancePath);
          } catch (_err) {
            console.log(warn(`Failed to update instance ${instance}: ${(_err as Error).message}`));
          }
        }
      } catch (_err) {
        // No instances to update
      }
    }

    console.log(ok('Migration to v3.2.0 complete'));
  }

  /**
   * Migrate existing instances from isolated to shared settings.json (v4.4+)
   * Runs once on upgrade
   */
  migrateToSharedSettings(): void {
    console.log(info('Migrating instances to shared settings.json...'));

    // Ensure ~/.claude/settings.json exists (authoritative source)
    const claudeSettings = path.join(this.claudeDir, 'settings.json');
    if (!fs.existsSync(claudeSettings)) {
      // Create empty settings if missing
      fs.writeFileSync(claudeSettings, JSON.stringify({}, null, 2), 'utf8');
      console.log(info('Created ~/.claude/settings.json'));
    }

    // Ensure shared settings.json symlink exists
    this.ensureSharedDirectories();

    // Migrate each instance
    if (!fs.existsSync(this.instancesDir)) {
      console.log(info('No instances to migrate'));
      return;
    }

    const instances = listAccountInstanceNames(this.instancesDir);

    let migrated = 0;
    let skipped = 0;

    for (const instance of instances) {
      const instancePath = path.join(this.instancesDir, instance);
      const instanceSettings = path.join(instancePath, 'settings.json');

      try {
        // Check if already symlink
        if (fs.existsSync(instanceSettings)) {
          const stats = fs.lstatSync(instanceSettings);
          if (stats.isSymbolicLink()) {
            skipped++;
            continue; // Already migrated
          }

          // Backup existing settings
          const backup = instanceSettings + '.pre-shared-migration';
          if (!fs.existsSync(backup)) {
            fs.copyFileSync(instanceSettings, backup);
            console.log(info(`Backed up ${instance}/settings.json`));
          }

          // Remove old settings.json
          fs.unlinkSync(instanceSettings);
        }

        // Create symlink via SharedManager
        const sharedSettings = path.join(this.sharedDir, 'settings.json');

        try {
          fs.symlinkSync(sharedSettings, instanceSettings, 'file');
          migrated++;
        } catch (_err) {
          // Windows fallback
          if (process.platform === 'win32') {
            fs.copyFileSync(sharedSettings, instanceSettings);
            console.log(warn(`Symlink failed for ${instance}, copied instead`));
            migrated++;
          } else {
            throw _err;
          }
        }
      } catch (_err) {
        console.log(warn(`Failed to migrate ${instance}: ${(_err as Error).message}`));
      }
    }

    console.log(ok(`Migrated ${migrated} instance(s), skipped ${skipped}`));
  }

  /**
   * Ensure memory path is linked to shared memory root.
   * Returns true when a link/copy was created or updated.
   */
  private async ensureProjectMemoryLink(linkPath: string, targetPath: string): Promise<boolean> {
    await this.ensureDirectory(targetPath);

    const linkStats = await this.getLstat(linkPath);
    if (linkStats) {
      if (linkStats.isSymbolicLink() && (await this.isSymlinkTarget(linkPath, targetPath))) {
        return false;
      }

      if (linkStats.isDirectory()) {
        await fs.promises.rm(linkPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(linkPath);
      }
    }

    const symlinkType: 'dir' | 'junction' = process.platform === 'win32' ? 'junction' : 'dir';
    const linkTarget = process.platform === 'win32' ? path.resolve(targetPath) : targetPath;

    try {
      await fs.promises.symlink(linkTarget, linkPath, symlinkType);
      return true;
    } catch (_err) {
      if (process.platform === 'win32') {
        this.copyDirectoryFallback(targetPath, linkPath);
        console.log(
          warn(`Symlink failed for project memory, copied instead (enable Developer Mode)`)
        );
        return true;
      }
      throw _err;
    }
  }

  /**
   * Check whether symlink points to expected target.
   */
  private async isSymlinkTarget(linkPath: string, expectedTarget: string): Promise<boolean> {
    try {
      const stats = await fs.promises.lstat(linkPath);
      if (!stats.isSymbolicLink()) {
        return false;
      }

      const currentTarget = await fs.promises.readlink(linkPath);
      const resolvedCurrentTarget = path.resolve(path.dirname(linkPath), currentTarget);
      const resolvedExpectedTarget = path.resolve(expectedTarget);
      return resolvedCurrentTarget === resolvedExpectedTarget;
    } catch (_err) {
      return false;
    }
  }

  /**
   * Resolve symlink target to absolute path.
   */
  private async resolveSymlinkTargetPath(linkPath: string): Promise<string | null> {
    try {
      const currentTarget = await fs.promises.readlink(linkPath);
      return path.resolve(path.dirname(linkPath), currentTarget);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Guard project merge operations to known CCS-managed roots only.
   */
  private isSafeProjectsMergeSource(sourcePath: string, instanceName: string): boolean {
    const resolvedSource = this.resolveCanonicalPath(sourcePath);
    const sharedContextRoot = this.resolveCanonicalPath(
      path.join(this.sharedDir, 'context-groups')
    );
    const instanceProjectsRoot = this.resolveCanonicalPath(
      path.join(this.instancesDir, instanceName, 'projects')
    );

    return (
      this.isPathWithinDirectory(resolvedSource, sharedContextRoot) ||
      this.isPathWithinDirectory(resolvedSource, instanceProjectsRoot)
    );
  }

  /**
   * Guard advanced continuity merge operations to known CCS-managed roots only.
   */
  private isSafeContinuityMergeSource(
    sourcePath: string,
    instanceName: string,
    artifactName: string
  ): boolean {
    const resolvedSource = this.resolveCanonicalPath(sourcePath);
    const sharedContextRoot = this.resolveCanonicalPath(
      path.join(this.sharedDir, 'context-groups')
    );
    const instanceArtifactRoot = this.resolveCanonicalPath(
      path.join(this.instancesDir, instanceName, artifactName)
    );

    const normalizedSource =
      process.platform === 'win32' ? resolvedSource.toLowerCase() : resolvedSource;
    const continuitySegment =
      process.platform === 'win32'
        ? `${path.sep}continuity${path.sep}`.toLowerCase()
        : `${path.sep}continuity${path.sep}`;

    const withinSharedContinuity =
      this.isPathWithinDirectory(resolvedSource, sharedContextRoot) &&
      normalizedSource.includes(continuitySegment);

    return (
      withinSharedContinuity || this.isPathWithinDirectory(resolvedSource, instanceArtifactRoot)
    );
  }

  /**
   * Link directory with Windows fallback to recursive copy.
   */
  private async linkDirectoryWithFallback(targetPath: string, linkPath: string): Promise<void> {
    const symlinkType: 'dir' | 'junction' = process.platform === 'win32' ? 'junction' : 'dir';
    const linkTarget = process.platform === 'win32' ? path.resolve(targetPath) : targetPath;

    try {
      await fs.promises.symlink(linkTarget, linkPath, symlinkType);
    } catch (_err) {
      if (process.platform === 'win32') {
        this.copyDirectoryFallback(targetPath, linkPath);
        console.log(
          warn(`Symlink failed for context projects, copied instead (enable Developer Mode)`)
        );
        return;
      }

      throw _err;
    }
  }

  /**
   * Migrate legacy per-project memory symlinks that point to ~/.ccs/shared/memory.
   * This preserves data while restoring true profile isolation.
   */
  private async detachLegacySharedMemoryLinks(
    projectsPath: string,
    instanceName: string
  ): Promise<void> {
    const sharedMemoryRoot = this.resolveCanonicalPath(path.join(this.sharedDir, 'memory'));

    let projectEntries: fs.Dirent[] = [];
    try {
      projectEntries = await fs.promises.readdir(projectsPath, { withFileTypes: true });
    } catch (_err) {
      return;
    }

    for (const entry of projectEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectPath = path.join(projectsPath, entry.name);
      const memoryPath = path.join(projectPath, 'memory');
      const memoryStats = await this.getLstat(memoryPath);

      if (!memoryStats?.isSymbolicLink()) {
        continue;
      }

      const memoryTarget = await this.resolveSymlinkTargetPath(memoryPath);
      if (!memoryTarget) {
        continue;
      }

      const canonicalMemoryTarget = this.resolveCanonicalPath(memoryTarget);
      if (!this.isPathWithinDirectory(canonicalMemoryTarget, sharedMemoryRoot)) {
        continue;
      }

      await fs.promises.unlink(memoryPath);
      await this.ensureDirectory(memoryPath);

      if (await this.pathExists(canonicalMemoryTarget)) {
        await this.mergeDirectoryWithConflictCopies(
          canonicalMemoryTarget,
          memoryPath,
          instanceName
        );
      }
    }
  }

  /**
   * Move directory, with cross-device fallback.
   */
  private async moveDirectory(src: string, dest: string): Promise<void> {
    try {
      await fs.promises.rename(src, dest);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'EXDEV') {
        throw err;
      }

      await fs.promises.cp(src, dest, { recursive: true });
      await fs.promises.rm(src, { recursive: true, force: true });
    }
  }

  /**
   * Merge source into target. On file conflicts, keep target and copy source
   * as "<name>.migrated-from-<instance>[-N]" to avoid data loss.
   */
  private async mergeDirectoryWithConflictCopies(
    sourceDir: string,
    targetDir: string,
    instanceName: string
  ): Promise<number> {
    await this.ensureDirectory(targetDir);

    let conflicts = 0;
    const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        conflicts += await this.mergeDirectoryWithConflictCopies(
          sourcePath,
          targetPath,
          instanceName
        );
        continue;
      }

      if (entry.isFile()) {
        if (!(await this.pathExists(targetPath))) {
          await fs.promises.copyFile(sourcePath, targetPath);
          continue;
        }

        if (await this.fileContentsEqual(sourcePath, targetPath)) {
          continue;
        }

        const conflictPath = await this.getConflictCopyPath(targetPath, instanceName);
        await fs.promises.copyFile(sourcePath, conflictPath);
        conflicts++;
      }
    }

    return conflicts;
  }

  /**
   * Compare two files byte-for-byte.
   */
  private async fileContentsEqual(fileA: string, fileB: string): Promise<boolean> {
    try {
      const [statA, statB] = await Promise.all([fs.promises.stat(fileA), fs.promises.stat(fileB)]);
      if (statA.size !== statB.size) {
        return false;
      }

      const [contentA, contentB] = await Promise.all([
        fs.promises.readFile(fileA),
        fs.promises.readFile(fileB),
      ]);
      return contentA.equals(contentB);
    } catch (_err) {
      return false;
    }
  }

  /**
   * Build a non-destructive conflict copy path.
   */
  private async getConflictCopyPath(
    existingTargetPath: string,
    instanceName: string
  ): Promise<string> {
    const safeInstanceName = instanceName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const baseSuffix = `.migrated-from-${safeInstanceName}`;

    let candidate = `${existingTargetPath}${baseSuffix}`;
    let sequence = 1;
    while (await this.pathExists(candidate)) {
      candidate = `${existingTargetPath}${baseSuffix}-${sequence}`;
      sequence++;
    }

    return candidate;
  }

  private symlinkPointsTo(linkPath: string, expectedTarget: string): boolean {
    try {
      const currentTarget = fs.readlinkSync(linkPath);
      const resolvedCurrentTarget = path.resolve(path.dirname(linkPath), currentTarget);
      return (
        this.resolveCanonicalPath(resolvedCurrentTarget) ===
        this.resolveCanonicalPath(expectedTarget)
      );
    } catch {
      return false;
    }
  }

  private detachManagedPluginLayout(instancePath: string): void {
    const pluginsPath = path.join(instancePath, 'plugins');
    if (!fs.existsSync(pluginsPath)) {
      return;
    }

    const stats = fs.lstatSync(pluginsPath);
    const sharedPluginsPath = path.join(this.sharedDir, 'plugins');

    if (stats.isSymbolicLink()) {
      if (this.symlinkPointsTo(pluginsPath, sharedPluginsPath)) {
        this.removeExistingPath(pluginsPath, 'directory');
      }
      return;
    }

    if (!stats.isDirectory()) {
      return;
    }

    let removedManagedEntries = false;

    for (const item of this.getSharedPluginLinkItems()) {
      const pluginEntryPath = path.join(pluginsPath, item.name);
      if (!fs.existsSync(pluginEntryPath)) {
        continue;
      }

      const entryStats = fs.lstatSync(pluginEntryPath);
      if (!entryStats.isSymbolicLink()) {
        continue;
      }

      if (this.symlinkPointsTo(pluginEntryPath, path.join(sharedPluginsPath, item.name))) {
        this.removeExistingPath(pluginEntryPath, item.type);
        removedManagedEntries = true;
      }
    }

    if (!removedManagedEntries) {
      return;
    }

    this.reconcileLocalMarketplaceRegistry(instancePath);

    if (fs.readdirSync(pluginsPath).length === 0) {
      fs.rmSync(pluginsPath, { recursive: true, force: true });
    }
  }

  private reconcileLocalMarketplaceRegistry(configDir: string): void {
    const registryPath = path.join(configDir, 'plugins', 'known_marketplaces.json');
    if (!fs.existsSync(registryPath)) {
      return;
    }

    const discoveredEntries = this.discoverMarketplaceEntries(configDir);
    if (Object.keys(discoveredEntries).length === 0) {
      this.removeExistingPath(registryPath, 'file');
      return;
    }

    let parsed: Record<string, unknown> = {};
    try {
      const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as unknown;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        parsed = raw as Record<string, unknown>;
      }
    } catch {
      parsed = {};
    }

    const reconciled = Object.fromEntries(
      Object.entries(discoveredEntries).map(([name, value]) => {
        const existing = parsed[name];
        if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
          return [
            name,
            {
              ...(normalizePluginMetadataValue(existing, configDir).normalized as Record<
                string,
                unknown
              >),
              installLocation: value.installLocation,
            },
          ];
        }

        return [name, value];
      })
    );

    this.writePluginMetadataFile(
      registryPath,
      JSON.stringify(reconciled, null, 2),
      'Synchronized marketplace registry paths'
    );
  }

  private resolveCanonicalPath(targetPath: string): string {
    try {
      return fs.realpathSync.native(targetPath);
    } catch {
      return path.resolve(targetPath);
    }
  }

  private isPathWithinDirectory(candidatePath: string, rootPath: string): boolean {
    const normalizeForCompare = (inputPath: string): string => {
      const resolved = path.resolve(inputPath);
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    };

    const normalizedCandidate = normalizeForCompare(candidatePath);
    const normalizedRoot = normalizeForCompare(rootPath);
    const relative = path.relative(normalizedRoot, normalizedCandidate);

    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.promises.access(targetPath);
      return true;
    } catch (_err) {
      return false;
    }
  }

  private async ensureDirectory(targetPath: string): Promise<void> {
    await fs.promises.mkdir(targetPath, { recursive: true, mode: 0o700 });
  }

  private async getLstat(targetPath: string): Promise<fs.Stats | null> {
    try {
      return await fs.promises.lstat(targetPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  private getLstatSync(targetPath: string): fs.Stats | null {
    try {
      return fs.lstatSync(targetPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Copy directory as fallback (Windows without Developer Mode)
   */
  private copyDirectoryFallback(src: string, dest: string): void {
    if (!fs.existsSync(src)) {
      fs.mkdirSync(src, { recursive: true, mode: 0o700 });
      return;
    }

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectoryFallback(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

export default SharedManager;
