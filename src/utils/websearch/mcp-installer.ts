/**
 * WebSearch MCP installer and ~/.claude.json provisioning.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getClaudeUserConfigPath } from '../claude-config-path';
import { info, warn } from '../ui';
import { InstanceManager } from '../../management/instance-manager';
import { installWebSearchHook } from './hook-installer';
import { appendWebSearchTrace } from './trace';
import { getWebSearchConfig } from '../../config/config-loader-facade';
import { ConfigError } from '../../errors/error-types';
import type { WebSearchConfigSnapshot } from './launch-state';
import {
  ensureManagedMcpServerConfig,
  getCcsMcpDir,
  hasMatchingContents,
  removeManagedMcpServerFromConfigPaths,
  resolveBundledMcpArtifactSourcePath,
  stageMcpArtifact,
  uninstallMcpArtifactFiles,
  type ManagedMcpServerConfig,
} from '../../shared/mcp-claude-installer';

const WEBSEARCH_MCP_SERVER = 'ccs-websearch-server.cjs';
const WEBSEARCH_MCP_SERVER_NAME = 'ccs-websearch';

export function getWebSearchMcpServerName(): string {
  return WEBSEARCH_MCP_SERVER_NAME;
}

export function getWebSearchMcpServerPath(): string {
  return path.join(getCcsMcpDir(), WEBSEARCH_MCP_SERVER);
}

export function installWebSearchMcpServer(
  wsConfig: WebSearchConfigSnapshot = getWebSearchConfig()
): boolean {
  if (!wsConfig.enabled) {
    appendWebSearchTrace('websearch_mcp_install_skipped', { reason: 'disabled' });
    return false;
  }

  if (!installWebSearchHook(wsConfig)) {
    appendWebSearchTrace('websearch_mcp_install_failed', { reason: 'hook_unavailable' });
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn('WebSearch MCP server install skipped because hook runtime is unavailable')) +
          '\n'
      );
    }
    return false;
  }

  const sourcePath = resolveBundledMcpArtifactSourcePath(WEBSEARCH_MCP_SERVER);
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
  const logUnreadable = (error: Error) => {
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn(`Existing WebSearch MCP server is unreadable: ${error.message}`)) + '\n'
      );
    }
  };

  if (hasMatchingContents(sourcePath, serverPath, logUnreadable)) {
    appendWebSearchTrace('websearch_mcp_install_ready', { serverPath });
    return true;
  }

  try {
    stageMcpArtifact(sourcePath, serverPath, {
      mode: 0o755,
      onUnreadable: logUnreadable,
    });
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
  }
}

export function ensureWebSearchMcpConfig(
  wsConfig: WebSearchConfigSnapshot = getWebSearchConfig()
): boolean {
  if (!wsConfig.enabled) {
    appendWebSearchTrace('websearch_mcp_config_skipped', { reason: 'disabled' });
    return false;
  }

  const desiredServerConfig: ManagedMcpServerConfig = {
    type: 'stdio',
    command: 'node',
    args: [getWebSearchMcpServerPath()],
    env: {},
  };

  const status = ensureManagedMcpServerConfig({
    serverName: WEBSEARCH_MCP_SERVER_NAME,
    desiredConfig: desiredServerConfig,
    callbacks: {
      onMalformed: () => {
        appendWebSearchTrace('websearch_mcp_config_failed', { reason: 'malformed_user_config' });
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(warn('Malformed ~/.claude.json prevents WebSearch MCP provisioning')) + '\n'
          );
        }
      },
      onReady: (configPath) => {
        appendWebSearchTrace('websearch_mcp_config_ready', { configPath });
      },
      onUpdated: (configPath) => {
        appendWebSearchTrace('websearch_mcp_config_ready', { configPath });
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(info(`Ensured WebSearch MCP config in ${configPath}`)) + '\n'
          );
        }
      },
      onWriteFailed: (configPath, error) => {
        appendWebSearchTrace('websearch_mcp_config_failed', {
          reason: 'write_failed',
          configPath,
          error: error.message,
        });
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(warn(`Failed to update ~/.claude.json: ${error.message}`)) + '\n'
          );
        }
      },
      onLocked: (configPath, error) => {
        appendWebSearchTrace('websearch_mcp_config_failed', {
          reason: 'user_config_locked',
          configPath,
          error: error.message,
        });
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(
              warn(
                `WebSearch MCP config skipped because ${configPath} is locked by another process`
              )
            ) + '\n'
          );
        }
      },
    },
  });

  return status === 'ready' || status === 'updated';
}

export function ensureWebSearchMcp(
  wsConfig: WebSearchConfigSnapshot = getWebSearchConfig()
): boolean {
  if (!wsConfig.enabled) {
    appendWebSearchTrace('websearch_mcp_ensure_skipped', { reason: 'disabled' });
    return false;
  }

  const installed = installWebSearchMcpServer(wsConfig);
  const configured = installed && ensureWebSearchMcpConfig(wsConfig);
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
  return uninstallMcpArtifactFiles([getWebSearchMcpServerPath()], (error) => {
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn(`Failed to remove WebSearch MCP server: ${error.message}`)) + '\n'
      );
    }
  });
}

export function removeWebSearchMcpConfig(): boolean {
  const instanceManager = new InstanceManager();
  const configPaths = [
    getClaudeUserConfigPath(),
    ...instanceManager
      .listInstances()
      .map((instanceName) =>
        path.join(instanceManager.getInstancePath(instanceName), '.claude.json')
      ),
  ];

  return removeManagedMcpServerFromConfigPaths(WEBSEARCH_MCP_SERVER_NAME, configPaths, {
    onMalformed: (configPath) => {
      if (process.env.CCS_DEBUG) {
        process.stderr.write(
          String(warn(`Malformed Claude config prevents MCP cleanup: ${configPath}`)) + '\n'
        );
      }
    },
    onRemoved: (configPath) => {
      if (process.env.CCS_DEBUG) {
        process.stderr.write(
          String(info(`Removed WebSearch MCP config from ${configPath}`)) + '\n'
        );
      }
    },
    onWriteFailed: (configPath, error) => {
      if (process.env.CCS_DEBUG) {
        process.stderr.write(
          String(
            warn(`Failed to remove WebSearch MCP config from ${configPath}: ${error.message}`)
          ) + '\n'
        );
      }
    },
    onLocked: (configPath, error) => {
      appendWebSearchTrace('websearch_mcp_config_remove_skipped', {
        reason: 'user_config_locked',
        configPath,
        error: error.message,
      });
    },
  });
}

export function uninstallWebSearchMcp(): boolean {
  const removedConfig = removeWebSearchMcpConfig();
  const removedServer = uninstallWebSearchMcpServer();
  return removedConfig || removedServer;
}

export function ensureWebSearchMcpOrThrow(
  wsConfig: WebSearchConfigSnapshot = getWebSearchConfig()
): void {
  if (!wsConfig.enabled) {
    return;
  }

  if (!ensureWebSearchMcp(wsConfig)) {
    throw new ConfigError(
      'WebSearch is enabled, but CCS could not prepare the local WebSearch tool.'
    );
  }
}

/**
 * Prepare WebSearch for a user launch.
 *
 * WebSearch-enabled launches must fail closed when the managed local MCP
 * runtime cannot be prepared. Otherwise CCS would still suppress Claude's
 * native WebSearch and inject fallback steering while the constrained MCP
 * search path is unavailable.
 */
export function ensureWebSearchMcpForLaunch(wsConfig: WebSearchConfigSnapshot): void {
  ensureWebSearchMcpOrThrow(wsConfig);
}
