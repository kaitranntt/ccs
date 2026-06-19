/**
 * WebSearch MCP installer and ~/.claude.json provisioning.
 */

import * as fs from 'fs';
import * as path from 'path';

import { getCcsDir } from '../config-manager';
import { getClaudeUserConfigPath } from '../claude-config-path';
import { info, warn } from '../ui';
import { InstanceManager } from '../../management/instance-manager';
import { installWebSearchHook } from './hook-installer';
import { appendWebSearchTrace } from './trace';
import { getWebSearchConfig } from '../../config/config-loader-facade';
import {
  isClaudeUserConfigLockUnavailableError as isLockUnavailableError,
  withClaudeUserConfigLock,
} from '../claude-user-config-lock';

const WEBSEARCH_MCP_SERVER = 'ccs-websearch-server.cjs';
const WEBSEARCH_MCP_SERVER_NAME = 'ccs-websearch';

interface ClaudeUserConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ManagedWebSearchMcpConfig {
  type: 'stdio';
  command: 'node';
  args: [string];
  env: Record<string, string>;
}

function getCcsMcpDir(): string {
  return path.join(getCcsDir(), 'mcp');
}

export function getWebSearchMcpServerName(): string {
  return WEBSEARCH_MCP_SERVER_NAME;
}

export function getWebSearchMcpServerPath(): string {
  return path.join(getCcsMcpDir(), WEBSEARCH_MCP_SERVER);
}

function hasMatchingContents(sourcePath: string, destinationPath: string): boolean {
  if (!fs.existsSync(destinationPath)) {
    return false;
  }

  const source = fs.readFileSync(sourcePath);
  try {
    const destination = fs.readFileSync(destinationPath);
    return source.equals(destination);
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn(`Existing WebSearch MCP server is unreadable: ${(error as Error).message}`)) +
          '\n'
      );
    }
    return false;
  }
}

function getTempPath(targetPath: string): string {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${targetPath}.${suffix}.tmp`;
}

function resolveBundledServerSourcePath(): string | null {
  const possiblePaths = [
    path.join(__dirname, '..', '..', '..', 'lib', 'mcp', WEBSEARCH_MCP_SERVER),
    path.join(__dirname, '..', '..', 'lib', 'mcp', WEBSEARCH_MCP_SERVER),
    path.join(__dirname, '..', 'lib', 'mcp', WEBSEARCH_MCP_SERVER),
  ];

  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readClaudeUserConfig(configPath: string): ClaudeUserConfig | null {
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

function writeClaudeUserConfig(configPath: string, config: ClaudeUserConfig): boolean {
  const tempPath = getTempPath(configPath);
  const fileMode = fs.existsSync(configPath) ? fs.statSync(configPath).mode & 0o777 : 0o600;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    fs.chmodSync(tempPath, fileMode);
    fs.renameSync(tempPath, configPath);
    return true;
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function removeManagedServerConfig(configPath: string): boolean {
  if (!fs.existsSync(configPath)) {
    return false;
  }

  try {
    return withClaudeUserConfigLock(configPath, () => {
      const config = readClaudeUserConfig(configPath);
      if (config === null) {
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(warn(`Malformed Claude config prevents MCP cleanup: ${configPath}`)) + '\n'
          );
        }
        return false;
      }

      const existingServers =
        config.mcpServers &&
        typeof config.mcpServers === 'object' &&
        !Array.isArray(config.mcpServers)
          ? { ...(config.mcpServers as Record<string, unknown>) }
          : {};

      if (!(WEBSEARCH_MCP_SERVER_NAME in existingServers)) {
        return false;
      }

      delete existingServers[WEBSEARCH_MCP_SERVER_NAME];

      const nextConfig: ClaudeUserConfig = { ...config };
      if (Object.keys(existingServers).length === 0) {
        delete nextConfig.mcpServers;
      } else {
        nextConfig.mcpServers = existingServers;
      }

      try {
        writeClaudeUserConfig(configPath, nextConfig);
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(info(`Removed WebSearch MCP config from ${configPath}`)) + '\n'
          );
        }
        return true;
      } catch (error) {
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(
              warn(
                `Failed to remove WebSearch MCP config from ${configPath}: ${(error as Error).message}`
              )
            ) + '\n'
          );
        }
        return false;
      }
    });
  } catch (error) {
    if (isLockUnavailableError(error)) {
      appendWebSearchTrace('websearch_mcp_config_remove_skipped', {
        reason: 'user_config_locked',
        configPath,
        error: (error as Error).message,
      });
      return false;
    }
    throw error;
  }
}

export function installWebSearchMcpServer(): boolean {
  const wsConfig = getWebSearchConfig();
  if (!wsConfig.enabled) {
    appendWebSearchTrace('websearch_mcp_install_skipped', { reason: 'disabled' });
    return false;
  }

  if (!installWebSearchHook()) {
    appendWebSearchTrace('websearch_mcp_install_failed', { reason: 'hook_unavailable' });
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn('WebSearch MCP server install skipped because hook runtime is unavailable')) +
          '\n'
      );
    }
    return false;
  }

  const sourcePath = resolveBundledServerSourcePath();
  if (!sourcePath) {
    appendWebSearchTrace('websearch_mcp_install_failed', { reason: 'source_missing' });
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn(`WebSearch MCP server source not found: ${WEBSEARCH_MCP_SERVER}`)) + '\n'
      );
    }
    return false;
  }

  const mcpDir = getCcsMcpDir();
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true, mode: 0o700 });
  }

  const serverPath = getWebSearchMcpServerPath();
  if (hasMatchingContents(sourcePath, serverPath)) {
    appendWebSearchTrace('websearch_mcp_install_ready', { serverPath });
    return true;
  }

  const tempPath = getTempPath(serverPath);

  try {
    fs.copyFileSync(sourcePath, tempPath);
    fs.chmodSync(tempPath, 0o755);
    try {
      fs.renameSync(tempPath, serverPath);
    } catch (renameError) {
      const errorCode = (renameError as NodeJS.ErrnoException).code;
      if (errorCode !== 'EEXIST' && errorCode !== 'EPERM') {
        throw renameError;
      }

      if (!hasMatchingContents(sourcePath, serverPath)) {
        fs.copyFileSync(tempPath, serverPath);
        fs.chmodSync(serverPath, 0o755);
      }
    }
    appendWebSearchTrace('websearch_mcp_install_ready', { serverPath });
    return true;
  } catch (error) {
    appendWebSearchTrace('websearch_mcp_install_failed', {
      reason: 'copy_failed',
      error: (error as Error).message,
    });
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn(`Failed to install WebSearch MCP server: ${(error as Error).message}`)) + '\n'
      );
    }
    return false;
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

export function ensureWebSearchMcpConfig(): boolean {
  const wsConfig = getWebSearchConfig();
  if (!wsConfig.enabled) {
    appendWebSearchTrace('websearch_mcp_config_skipped', { reason: 'disabled' });
    return false;
  }

  const claudeUserConfigPath = getClaudeUserConfigPath();

  try {
    return withClaudeUserConfigLock(claudeUserConfigPath, () => {
      const config = readClaudeUserConfig(claudeUserConfigPath);

      if (config === null) {
        appendWebSearchTrace('websearch_mcp_config_failed', { reason: 'malformed_user_config' });
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(warn('Malformed ~/.claude.json prevents WebSearch MCP provisioning')) + '\n'
          );
        }
        return false;
      }

      const existingServers =
        config.mcpServers &&
        typeof config.mcpServers === 'object' &&
        !Array.isArray(config.mcpServers)
          ? (config.mcpServers as Record<string, unknown>)
          : {};
      const desiredServerConfig: ManagedWebSearchMcpConfig = {
        type: 'stdio',
        command: 'node',
        args: [getWebSearchMcpServerPath()],
        env: {},
      };

      const currentConfig = existingServers[WEBSEARCH_MCP_SERVER_NAME];
      if (
        typeof currentConfig === 'object' &&
        currentConfig !== null &&
        JSON.stringify(currentConfig) === JSON.stringify(desiredServerConfig)
      ) {
        appendWebSearchTrace('websearch_mcp_config_ready', { configPath: claudeUserConfigPath });
        return true;
      }

      const nextConfig: ClaudeUserConfig = {
        ...config,
        mcpServers: {
          ...existingServers,
          [WEBSEARCH_MCP_SERVER_NAME]: desiredServerConfig,
        },
      };

      try {
        writeClaudeUserConfig(claudeUserConfigPath, nextConfig);
        appendWebSearchTrace('websearch_mcp_config_ready', { configPath: claudeUserConfigPath });
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(info(`Ensured WebSearch MCP config in ${claudeUserConfigPath}`)) + '\n'
          );
        }
        return true;
      } catch (error) {
        appendWebSearchTrace('websearch_mcp_config_failed', {
          reason: 'write_failed',
          configPath: claudeUserConfigPath,
          error: (error as Error).message,
        });
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(warn(`Failed to update ~/.claude.json: ${(error as Error).message}`)) + '\n'
          );
        }
        return false;
      }
    });
  } catch (error) {
    if (isLockUnavailableError(error)) {
      appendWebSearchTrace('websearch_mcp_config_failed', {
        reason: 'user_config_locked',
        configPath: claudeUserConfigPath,
        error: (error as Error).message,
      });
      if (process.env.CCS_DEBUG) {
        process.stderr.write(
          String(
            warn(
              `WebSearch MCP config skipped because ${claudeUserConfigPath} is locked by another process`
            )
          ) + '\n'
        );
      }
      return false;
    }
    throw error;
  }
}

export function ensureWebSearchMcp(): boolean {
  const wsConfig = getWebSearchConfig();
  if (!wsConfig.enabled) {
    appendWebSearchTrace('websearch_mcp_ensure_skipped', { reason: 'disabled' });
    return false;
  }

  const installed = installWebSearchMcpServer();
  const configured = installed && ensureWebSearchMcpConfig();
  appendWebSearchTrace('websearch_mcp_ensure_result', { installed, configured });
  return installed && configured;
}

export function syncWebSearchMcpToConfigDir(claudeConfigDir: string | undefined): boolean {
  if (!claudeConfigDir) {
    appendWebSearchTrace('websearch_mcp_sync_skipped', { reason: 'missing_config_dir' });
    return false;
  }

  const synced = new InstanceManager().syncMcpServers(claudeConfigDir);
  appendWebSearchTrace('websearch_mcp_sync_result', { claudeConfigDir, synced });
  return synced;
}

export function uninstallWebSearchMcpServer(): boolean {
  const serverPath = getWebSearchMcpServerPath();
  if (!fs.existsSync(serverPath)) {
    return false;
  }

  try {
    fs.unlinkSync(serverPath);
    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn(`Failed to remove WebSearch MCP server: ${(error as Error).message}`)) + '\n'
      );
    }
    return false;
  }
}

export function removeWebSearchMcpConfig(): boolean {
  let removed = removeManagedServerConfig(getClaudeUserConfigPath());

  const instanceManager = new InstanceManager();
  for (const instanceName of instanceManager.listInstances()) {
    const instancePath = instanceManager.getInstancePath(instanceName);
    const instanceClaudeConfigPath = path.join(instancePath, '.claude.json');
    removed = removeManagedServerConfig(instanceClaudeConfigPath) || removed;
  }

  return removed;
}

export function uninstallWebSearchMcp(): boolean {
  const removedConfig = removeWebSearchMcpConfig();
  const removedServer = uninstallWebSearchMcpServer();
  return removedConfig || removedServer;
}

export function ensureWebSearchMcpOrThrow(): void {
  const wsConfig = getWebSearchConfig();
  if (!wsConfig.enabled) {
    return;
  }

  if (!ensureWebSearchMcp()) {
    throw new Error('WebSearch is enabled, but CCS could not prepare the local WebSearch tool.');
  }
}

/**
 * Prepare WebSearch for a user launch without blocking Claude startup.
 *
 * Returns true when the normal WebSearch status line is still accurate. A
 * failed MCP prepare already prints a degraded-path warning, so callers should
 * skip the ready/status line when this returns false.
 */
export function ensureWebSearchMcpForLaunch(): boolean {
  const wsConfig = getWebSearchConfig();
  if (!wsConfig.enabled) {
    return true;
  }

  const ready = ensureWebSearchMcp();
  if (!ready) {
    process.stderr.write(
      String(
        warn(
          'WebSearch is enabled, but CCS could not prepare the local WebSearch tool. This session will continue without local WebSearch.'
        )
      ) + '\n'
    );
  }

  return ready;
}
