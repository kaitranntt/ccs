/**
 * Instance Manager (Simplified)
 *
 * Manages isolated Claude CLI instances per profile for concurrent sessions.
 * Each instance is an isolated CLAUDE_CONFIG_DIR where users login directly.
 * No credential copying/encryption - Claude manages credentials per instance.
 */

import * as fs from 'fs';
import * as path from 'path';
import SharedManager from './shared-manager';
import ProfileContextSyncLock from './profile-context-sync-lock';
import { DEFAULT_ACCOUNT_CONTEXT_MODE } from '../auth/account-context';
import type { AccountContextPolicy } from '../auth/account-context';
import { getCcsHome } from '../utils/config-manager';
import { withClaudeUserConfigLock } from '../utils/claude-user-config-lock';
import { writeAtomicJsonFile } from '../utils/atomic-json-file';
import { createLogger } from '../services/logging';
import { getCcsDir } from '../config/config-loader-facade';
import { ProfileError } from '../errors/error-types';
import {
  assertSafeAccountInstancePath,
  ensureSafeAccountInstancesDirectory,
  listAccountInstanceNames,
  normalizeAccountInstanceName,
} from './instance-directory';

const logger = createLogger('management:instance-manager');

const MANAGED_MCP_SERVER_NAMES = new Set(['ccs-websearch', 'ccs-image-analysis', 'ccs-browser']);

/** Options for instance creation */
export interface InstanceOptions {
  /** Skip shared symlinks (commands, skills, agents, settings.json, CLAUDE.md) */
  bare?: boolean;
}

/**
 * Instance Manager Class
 */
class InstanceManager {
  private readonly instancesDir: string;
  private readonly sharedManager: SharedManager;
  private readonly contextSyncLock: ProfileContextSyncLock;
  private readonly pluginLayoutLock: ProfileContextSyncLock;

  constructor() {
    this.instancesDir = path.join(getCcsDir(), 'instances');
    this.sharedManager = new SharedManager();
    this.contextSyncLock = new ProfileContextSyncLock(this.instancesDir);
    this.pluginLayoutLock = new ProfileContextSyncLock(this.instancesDir);
  }

  /**
   * Ensure instance exists for profile (lazy init only)
   */
  async ensureInstance(
    profileName: string,
    contextPolicy: AccountContextPolicy = { mode: DEFAULT_ACCOUNT_CONTEXT_MODE },
    options: InstanceOptions = {}
  ): Promise<string> {
    const instancePath = this.getInstancePath(profileName);
    const initialInstanceStats = this.getInstanceStats(instancePath);
    if (initialInstanceStats) {
      assertSafeAccountInstancePath(this.instancesDir, instancePath);
    } else {
      ensureSafeAccountInstancesDirectory(this.instancesDir);
    }

    // Serialize context sync operations per profile across processes.
    await this.contextSyncLock.withLock(profileName, async () => {
      // Lazy initialization
      if (!this.getInstanceStats(instancePath)) {
        ensureSafeAccountInstancesDirectory(this.instancesDir);
        logger.stage('route', 'instance.init', 'Initializing new profile instance', {
          profile: profileName,
          bare: options.bare === true,
        });
        this.initializeInstance(profileName, instancePath, options);
      }

      // Re-check after locking/creation before any operation can mutate the instance.
      assertSafeAccountInstancePath(this.instancesDir, instancePath);

      // Validate structure (auto-fix missing dirs)
      this.validateInstance(instancePath);

      // Apply context policy (isolated by default, optional shared group).
      await this.sharedManager.syncProjectContext(instancePath, contextPolicy);
      await this.sharedManager.syncAdvancedContinuityArtifacts(instancePath, contextPolicy);

      await this.pluginLayoutLock.withNamedLock('__plugin-layout__', async () => {
        if (!options.bare) {
          this.sharedManager.linkSharedDirectories(instancePath);
          return;
        }

        this.sharedManager.detachSharedDirectories(instancePath);
        this.sharedManager.normalizeSharedPluginMetadataPaths();
      });
    });

    // Sync MCP servers from global ~/.claude.json (unless bare)
    if (!options.bare) {
      this.syncMcpServers(instancePath);
    }

    return instancePath;
  }

  /**
   * Get instance path for profile
   */
  getInstancePath(profileName: string): string {
    const safeName = normalizeAccountInstanceName(profileName);
    return path.join(this.instancesDir, safeName);
  }

  /**
   * Initialize new instance directory
   */
  private initializeInstance(
    profileName: string,
    instancePath: string,
    _options: InstanceOptions = {}
  ): void {
    try {
      // Create base directory
      fs.mkdirSync(instancePath, { mode: 0o700 });

      // Expected subdirectories and shared links are created only after the
      // caller validates that this new root stayed inside the managed parent.
    } catch (error) {
      throw new ProfileError(
        `Failed to initialize instance for ${profileName}: ${(error as Error).message}`,
        profileName
      );
    }
  }

  /**
   * Validate instance directory structure (auto-fix missing directories)
   */
  private validateInstance(instancePath: string): void {
    // Check required directories (auto-create if missing for migration)
    const requiredDirs = [
      'session-env',
      'todos',
      'logs',
      'file-history',
      'shell-snapshots',
      'debug',
      '.anthropic',
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(instancePath, dir);
      if (!fs.existsSync(dirPath)) {
        // Auto-create missing directory (migration from older versions)
        fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
      }
    }

    // Note: Credentials managed by Claude CLI in instance (no validation needed)
  }

  /**
   * Delete instance for profile
   */
  async deleteInstance(profileName: string): Promise<void> {
    const instancePath = this.getInstancePath(profileName);

    if (!fs.existsSync(instancePath)) {
      return;
    }

    await this.contextSyncLock.withLock(profileName, async () => {
      await this.pluginLayoutLock.withNamedLock('__plugin-layout__', async () => {
        if (!fs.existsSync(instancePath)) {
          return;
        }

        fs.rmSync(instancePath, { recursive: true, force: true });
        logger.stage('cleanup', 'instance.deleted', 'Profile instance deleted', {
          profile: profileName,
        });
      });
    });
  }

  /**
   * List all instance names
   */
  listInstances(): string[] {
    return listAccountInstanceNames(this.instancesDir);
  }

  /**
   * Check if instance exists for profile
   */
  hasInstance(profileName: string): boolean {
    const instancePath = this.getInstancePath(profileName);
    return fs.existsSync(instancePath);
  }

  /**
   * Sync MCP servers from global ~/.claude.json to instance .claude.json.
   * Selectively copies only mcpServers key (not OAuth sessions or caches).
   */
  syncMcpServers(instancePath: string): boolean {
    const homeDir = getCcsHome();
    const globalClaudeJson = path.join(homeDir, '.claude.json');

    if (!fs.existsSync(globalClaudeJson)) {
      return false;
    }

    try {
      const globalContent = JSON.parse(fs.readFileSync(globalClaudeJson, 'utf8'));
      const rawMcpServers = globalContent.mcpServers;
      if (
        !rawMcpServers ||
        typeof rawMcpServers !== 'object' ||
        Array.isArray(rawMcpServers) ||
        Object.keys(rawMcpServers).length === 0
      ) {
        return false;
      }

      const mcpServers = rawMcpServers as Record<string, unknown>;
      const instanceClaudeJson = path.join(instancePath, '.claude.json');
      return withClaudeUserConfigLock(instanceClaudeJson, () => {
        let instanceContent: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(fs.readFileSync(instanceClaudeJson, 'utf8'));
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new TypeError('Instance Claude config must contain a JSON object');
          }
          instanceContent = parsed as Record<string, unknown>;
        } catch (error) {
          // Only a genuinely missing file is new; malformed/unreadable state is preserved.
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }

        // Instance overrides win, except CCS-managed servers track the global runtime.
        const rawExistingMcp = instanceContent.mcpServers;
        const existingMcp =
          rawExistingMcp && typeof rawExistingMcp === 'object' && !Array.isArray(rawExistingMcp)
            ? (rawExistingMcp as Record<string, unknown>)
            : {};
        const mergedMcpServers = { ...mcpServers, ...existingMcp };
        for (const managedName of MANAGED_MCP_SERVER_NAMES) {
          if (managedName in mcpServers) {
            mergedMcpServers[managedName] = mcpServers[managedName];
          }
        }
        instanceContent.mcpServers = mergedMcpServers;
        writeAtomicJsonFile(instanceClaudeJson, instanceContent);
        return true;
      });
    } catch (error) {
      // Best-effort: don't fail instance creation if MCP sync fails
      console.warn(`[!] MCP sync skipped: ${(error as Error).message}`);
      return false;
    }
  }

  private getInstanceStats(instancePath: string): fs.Stats | null {
    try {
      return fs.lstatSync(instancePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}

export { InstanceManager };
export default InstanceManager;
