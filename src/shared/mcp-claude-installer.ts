/**
 * Shared MCP Claude User Config & Artifact Installer
 *
 * Consolidates ~/.claude.json atomic read/write, lock-coordinated server
 * provisioning, .cjs artifact staging, and uninstall/status helpers across
 * browser, image-analysis, and websearch MCP installers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from './ccs-paths';
import { getClaudeUserConfigPath } from '../utils/claude-config-path';
import { writeAtomicJsonFile } from '../utils/atomic-json-file';
import {
  isClaudeUserConfigLockUnavailableError as isLockUnavailableError,
  withClaudeUserConfigLock,
} from '../utils/claude-user-config-lock';

export interface ClaudeUserConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ManagedMcpServerConfig {
  type: 'stdio';
  command: 'node';
  args: [string];
  env: Record<string, string>;
}

export type EnsureManagedMcpConfigStatus =
  | 'ready'
  | 'updated'
  | 'malformed'
  | 'write_failed'
  | 'locked';

export interface EnsureManagedMcpConfigCallbacks {
  onMalformed?: (configPath: string) => void;
  onReady?: (configPath: string) => void;
  onUpdated?: (configPath: string) => void;
  onWriteFailed?: (configPath: string, error: Error) => void;
  onLocked?: (configPath: string, error: Error) => void;
}

export interface RemoveManagedMcpConfigCallbacks {
  onMalformed?: (configPath: string) => void;
  onRemoved?: (configPath: string) => void;
  onWriteFailed?: (configPath: string, error: Error) => void;
  onLocked?: (configPath: string, error: Error) => void;
}

export interface StageMcpArtifactOptions {
  /** Explicit file mode (defaults to 0o755 unless preserveSourceMode is true). */
  mode?: number;
  /** Copy permissions from sourcePath when staging or reconciling existing copies. */
  preserveSourceMode?: boolean;
  onUnreadable?: (error: Error) => void;
}

export function getCcsMcpDir(): string {
  return path.join(getCcsDir(), 'mcp');
}

export function getTempPath(targetPath: string): string {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${targetPath}.${suffix}.tmp`;
}

export function hasMatchingContents(
  sourcePath: string,
  destinationPath: string,
  onUnreadable?: (error: Error) => void
): boolean {
  if (!fs.existsSync(destinationPath)) {
    return false;
  }

  const source = fs.readFileSync(sourcePath);
  try {
    const destination = fs.readFileSync(destinationPath);
    return source.equals(destination);
  } catch (error) {
    onUnreadable?.(error as Error);
    return false;
  }
}

export function resolveBundledMcpArtifactSourcePath(
  fileName: string,
  subdirs: readonly string[] = ['mcp']
): string | null {
  const relativeRoots = [['..', '..', '..'], ['..', '..'], ['..']];

  for (const subdir of subdirs) {
    for (const rootParts of relativeRoots) {
      const candidate = path.join(__dirname, ...rootParts, 'lib', subdir, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Stage a bundled MCP .cjs artifact into destinationPath atomically.
 * Skips rewriting when contents already match (reconciling mode if preserveSourceMode).
 */
export function stageMcpArtifact(
  sourcePath: string,
  destinationPath: string,
  options: StageMcpArtifactOptions = {}
): void {
  const targetMode = options.preserveSourceMode
    ? fs.statSync(sourcePath).mode & 0o777
    : (options.mode ?? 0o755);

  if (hasMatchingContents(sourcePath, destinationPath, options.onUnreadable)) {
    if (options.preserveSourceMode && (fs.statSync(destinationPath).mode & 0o777) !== targetMode) {
      fs.chmodSync(destinationPath, targetMode);
    }
    return;
  }

  const tempPath = getTempPath(destinationPath);

  try {
    fs.copyFileSync(sourcePath, tempPath);
    fs.chmodSync(tempPath, targetMode);
    try {
      fs.renameSync(tempPath, destinationPath);
    } catch (renameError) {
      const errorCode = (renameError as NodeJS.ErrnoException).code;
      if (errorCode !== 'EEXIST' && errorCode !== 'EPERM') {
        throw renameError;
      }

      if (!hasMatchingContents(sourcePath, destinationPath, options.onUnreadable)) {
        fs.copyFileSync(tempPath, destinationPath);
        fs.chmodSync(destinationPath, targetMode);
      }
    }
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

export function readClaudeUserConfig(configPath: string): ClaudeUserConfig | null {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as ClaudeUserConfig;
  } catch {
    return null;
  }
}

export function writeClaudeUserConfig(configPath: string, config: ClaudeUserConfig): boolean {
  writeAtomicJsonFile(configPath, config);
  return true;
}

function getMcpServersRecord(config: ClaudeUserConfig): Record<string, unknown> {
  return config.mcpServers &&
    typeof config.mcpServers === 'object' &&
    !Array.isArray(config.mcpServers)
    ? (config.mcpServers as Record<string, unknown>)
    : {};
}

export function hasManagedMcpServerConfig(
  configPath: string,
  serverName: string,
  expectedConfig: ManagedMcpServerConfig
): boolean {
  const config = readClaudeUserConfig(configPath);
  if (config === null) {
    return false;
  }

  const existingServers = getMcpServersRecord(config);
  const currentConfig = existingServers[serverName];

  return (
    typeof currentConfig === 'object' &&
    currentConfig !== null &&
    JSON.stringify(currentConfig) === JSON.stringify(expectedConfig)
  );
}

export function ensureManagedMcpServerConfig(options: {
  serverName: string;
  desiredConfig: ManagedMcpServerConfig;
  configPath?: string;
  ensureParentDir?: boolean;
  callbacks?: EnsureManagedMcpConfigCallbacks;
}): EnsureManagedMcpConfigStatus {
  const configPath = options.configPath ?? getClaudeUserConfigPath();
  if (options.ensureParentDir) {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
  }

  try {
    return withClaudeUserConfigLock(configPath, () => {
      const config = readClaudeUserConfig(configPath);
      if (config === null) {
        options.callbacks?.onMalformed?.(configPath);
        return 'malformed';
      }

      const existingServers = getMcpServersRecord(config);
      const currentConfig = existingServers[options.serverName];
      if (
        typeof currentConfig === 'object' &&
        currentConfig !== null &&
        JSON.stringify(currentConfig) === JSON.stringify(options.desiredConfig)
      ) {
        options.callbacks?.onReady?.(configPath);
        return 'ready';
      }

      const nextConfig: ClaudeUserConfig = {
        ...config,
        mcpServers: {
          ...existingServers,
          [options.serverName]: options.desiredConfig,
        },
      };

      try {
        writeClaudeUserConfig(configPath, nextConfig);
        options.callbacks?.onUpdated?.(configPath);
        return 'updated';
      } catch (error) {
        options.callbacks?.onWriteFailed?.(configPath, error as Error);
        return 'write_failed';
      }
    });
  } catch (error) {
    if (isLockUnavailableError(error)) {
      options.callbacks?.onLocked?.(configPath, error as Error);
      return 'locked';
    }
    throw error;
  }
}

export function removeManagedMcpServerConfig(
  configPath: string,
  serverName: string,
  callbacks?: RemoveManagedMcpConfigCallbacks
): boolean {
  if (!fs.existsSync(configPath)) {
    return false;
  }

  try {
    return withClaudeUserConfigLock(configPath, () => {
      const config = readClaudeUserConfig(configPath);
      if (config === null) {
        callbacks?.onMalformed?.(configPath);
        return false;
      }

      const existingServers = { ...getMcpServersRecord(config) };
      if (!(serverName in existingServers)) {
        return false;
      }

      delete existingServers[serverName];

      const nextConfig: ClaudeUserConfig = { ...config };
      if (Object.keys(existingServers).length === 0) {
        delete nextConfig.mcpServers;
      } else {
        nextConfig.mcpServers = existingServers;
      }

      try {
        writeClaudeUserConfig(configPath, nextConfig);
        callbacks?.onRemoved?.(configPath);
        return true;
      } catch (error) {
        callbacks?.onWriteFailed?.(configPath, error as Error);
        return false;
      }
    });
  } catch (error) {
    if (isLockUnavailableError(error)) {
      callbacks?.onLocked?.(configPath, error as Error);
      return false;
    }
    throw error;
  }
}

export function removeManagedMcpServerFromConfigPaths(
  serverName: string,
  configPaths: readonly string[],
  callbacks?: RemoveManagedMcpConfigCallbacks
): boolean {
  let removed = false;
  for (const configPath of configPaths) {
    removed = removeManagedMcpServerConfig(configPath, serverName, callbacks) || removed;
  }
  return removed;
}

export function uninstallMcpArtifactFiles(
  artifactPaths: readonly string[],
  onError?: (error: Error) => void
): boolean {
  if (!artifactPaths.some((artifactPath) => fs.existsSync(artifactPath))) {
    return false;
  }

  try {
    let removed = false;
    for (const artifactPath of artifactPaths) {
      if (!fs.existsSync(artifactPath)) {
        continue;
      }
      fs.unlinkSync(artifactPath);
      removed = true;
    }
    return removed;
  } catch (error) {
    onError?.(error as Error);
    return false;
  }
}
