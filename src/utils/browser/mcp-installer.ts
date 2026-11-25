/**
 * Browser MCP installer and ~/.claude.json provisioning.
 */

import * as fs from 'fs';
import * as path from 'path';
import { InstanceManager } from '../../management/instance-manager';
import {
  ensureManagedMcpServerConfig,
  getCcsMcpDir,
  removeManagedMcpServerFromConfigPaths,
  resolveBundledMcpArtifactSourcePath,
  stageMcpArtifact,
  uninstallMcpArtifactFiles,
  type ManagedMcpServerConfig,
} from '../../shared/mcp-claude-installer';
import { getClaudeUserConfigPath } from '../claude-config-path';
import { ConfigError } from '../../errors/error-types';

const BROWSER_MCP_SERVER = 'ccs-browser-server.cjs';
const BROWSER_MCP_SERVER_NAME = 'ccs-browser';

function resolvePackageRoot(fromPath: string): string | null {
  let currentDir = path.dirname(fromPath);
  while (true) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function getBrowserMcpServerEnv(): Record<string, string> {
  const sourcePath = resolveBundledMcpArtifactSourcePath(BROWSER_MCP_SERVER);
  if (!sourcePath) {
    return {};
  }

  const packageRoot = resolvePackageRoot(sourcePath);
  if (!packageRoot) {
    return {};
  }

  const nodeModulesPath = path.join(packageRoot, 'node_modules');
  return fs.existsSync(nodeModulesPath) ? { NODE_PATH: nodeModulesPath } : {};
}

export function getBrowserMcpServerName(): string {
  return BROWSER_MCP_SERVER_NAME;
}

export function getBrowserMcpServerPath(): string {
  return path.join(getCcsMcpDir(), BROWSER_MCP_SERVER);
}

export function installBrowserMcpServer(): boolean {
  const sourcePath = resolveBundledMcpArtifactSourcePath(BROWSER_MCP_SERVER);
  if (!sourcePath) {
    return false;
  }

  const mcpDir = getCcsMcpDir();
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true, mode: 0o700 });
  }

  try {
    stageMcpArtifact(sourcePath, getBrowserMcpServerPath(), { preserveSourceMode: true });
    return true;
  } catch {
    return false;
  }
}

export function ensureBrowserMcpConfig(): boolean {
  const desiredServerConfig: ManagedMcpServerConfig = {
    type: 'stdio',
    command: 'node',
    args: [getBrowserMcpServerPath()],
    env: getBrowserMcpServerEnv(),
  };

  const status = ensureManagedMcpServerConfig({
    serverName: BROWSER_MCP_SERVER_NAME,
    desiredConfig: desiredServerConfig,
    ensureParentDir: true,
  });
  return status === 'ready' || status === 'updated';
}

export function ensureBrowserMcp(): boolean {
  const installed = installBrowserMcpServer();
  const configured = installed && ensureBrowserMcpConfig();
  return installed && configured;
}

export function syncBrowserMcpToConfigDir(claudeConfigDir: string | undefined): boolean {
  if (!claudeConfigDir) {
    return false;
  }

  return new InstanceManager().syncMcpServers(claudeConfigDir);
}

export function uninstallBrowserMcpServer(): boolean {
  return uninstallMcpArtifactFiles([getBrowserMcpServerPath()]);
}

export function removeBrowserMcpConfig(): boolean {
  const instanceManager = new InstanceManager();
  const configPaths = [
    getClaudeUserConfigPath(),
    ...instanceManager
      .listInstances()
      .map((instanceName) =>
        path.join(instanceManager.getInstancePath(instanceName), '.claude.json')
      ),
  ];

  return removeManagedMcpServerFromConfigPaths(BROWSER_MCP_SERVER_NAME, configPaths);
}

export function uninstallBrowserMcp(): boolean {
  const removedConfig = removeBrowserMcpConfig();
  const removedServer = uninstallBrowserMcpServer();
  return removedConfig || removedServer;
}

export function ensureBrowserMcpOrThrow(): boolean {
  const ready = ensureBrowserMcp();
  if (!ready) {
    throw new ConfigError(
      'Browser MCP is enabled, but CCS could not prepare the local browser tool.'
    );
  }

  return ready;
}
