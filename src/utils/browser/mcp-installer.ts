/**
 * Browser MCP installer and ~/.claude.json provisioning.
 */

import * as fs from 'fs';
import * as path from 'path';
import { InstanceManager } from '../../management/instance-manager';
import { getClaudeUserConfigPath } from '../claude-config-path';
import { getCcsDir } from '../config-manager';
import {
  isClaudeUserConfigLockUnavailableError as isLockUnavailableError,
  withClaudeUserConfigLock,
} from '../claude-user-config-lock';

const BROWSER_MCP_SERVER = 'ccs-browser-server.cjs';
const BROWSER_MCP_SERVER_NAME = 'ccs-browser';

interface ClaudeUserConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ManagedBrowserMcpConfig {
  type: 'stdio';
  command: 'node';
  args: [string];
  env: Record<string, string>;
}

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
  const sourcePath = resolveBundledServerSourcePath();
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

function getCcsMcpDir(): string {
  return path.join(getCcsDir(), 'mcp');
}

export function getBrowserMcpServerName(): string {
  return BROWSER_MCP_SERVER_NAME;
}

export function getBrowserMcpServerPath(): string {
  return path.join(getCcsMcpDir(), BROWSER_MCP_SERVER);
}

function hasMatchingContents(sourcePath: string, destinationPath: string): boolean {
  if (!fs.existsSync(destinationPath)) {
    return false;
  }

  const source = fs.readFileSync(sourcePath);
  try {
    const destination = fs.readFileSync(destinationPath);
    return source.equals(destination);
  } catch {
    return false;
  }
}

function getTempPath(targetPath: string): string {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${targetPath}.${suffix}.tmp`;
}

function resolveBundledServerSourcePath(): string | null {
  const possiblePaths = [
    path.join(__dirname, '..', '..', '..', 'lib', 'mcp', BROWSER_MCP_SERVER),
    path.join(__dirname, '..', '..', 'lib', 'mcp', BROWSER_MCP_SERVER),
    path.join(__dirname, '..', 'lib', 'mcp', BROWSER_MCP_SERVER),
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
        return false;
      }

      const existingServers =
        config.mcpServers &&
        typeof config.mcpServers === 'object' &&
        !Array.isArray(config.mcpServers)
          ? { ...(config.mcpServers as Record<string, unknown>) }
          : {};

      if (!(BROWSER_MCP_SERVER_NAME in existingServers)) {
        return false;
      }

      delete existingServers[BROWSER_MCP_SERVER_NAME];

      const nextConfig: ClaudeUserConfig = { ...config };
      if (Object.keys(existingServers).length === 0) {
        delete nextConfig.mcpServers;
      } else {
        nextConfig.mcpServers = existingServers;
      }

      try {
        return writeClaudeUserConfig(configPath, nextConfig);
      } catch {
        return false;
      }
    });
  } catch (error) {
    if (isLockUnavailableError(error)) {
      return false;
    }
    throw error;
  }
}

export function installBrowserMcpServer(): boolean {
  const sourcePath = resolveBundledServerSourcePath();
  if (!sourcePath) {
    return false;
  }

  const mcpDir = getCcsMcpDir();
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true, mode: 0o700 });
  }

  const serverPath = getBrowserMcpServerPath();
  const sourceMode = fs.statSync(sourcePath).mode & 0o777;
  if (hasMatchingContents(sourcePath, serverPath)) {
    if ((fs.statSync(serverPath).mode & 0o777) !== sourceMode) {
      fs.chmodSync(serverPath, sourceMode);
    }
    return true;
  }

  const tempPath = getTempPath(serverPath);

  try {
    fs.copyFileSync(sourcePath, tempPath);
    fs.chmodSync(tempPath, sourceMode);
    try {
      fs.renameSync(tempPath, serverPath);
    } catch (renameError) {
      const errorCode = (renameError as NodeJS.ErrnoException).code;
      if (errorCode !== 'EEXIST' && errorCode !== 'EPERM') {
        throw renameError;
      }

      if (!hasMatchingContents(sourcePath, serverPath)) {
        fs.copyFileSync(tempPath, serverPath);
        fs.chmodSync(serverPath, sourceMode);
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

export function ensureBrowserMcpConfig(): boolean {
  const claudeUserConfigPath = getClaudeUserConfigPath();
  const claudeUserConfigDir = path.dirname(claudeUserConfigPath);
  if (!fs.existsSync(claudeUserConfigDir)) {
    fs.mkdirSync(claudeUserConfigDir, { recursive: true, mode: 0o700 });
  }

  const desiredServerConfig: ManagedBrowserMcpConfig = {
    type: 'stdio',
    command: 'node',
    args: [getBrowserMcpServerPath()],
    env: getBrowserMcpServerEnv(),
  };

  try {
    return withClaudeUserConfigLock(claudeUserConfigPath, () => {
      const config = readClaudeUserConfig(claudeUserConfigPath);
      if (config === null) {
        return false;
      }

      const existingServers =
        config.mcpServers &&
        typeof config.mcpServers === 'object' &&
        !Array.isArray(config.mcpServers)
          ? (config.mcpServers as Record<string, unknown>)
          : {};
      const currentConfig = existingServers[BROWSER_MCP_SERVER_NAME];
      if (
        typeof currentConfig === 'object' &&
        currentConfig !== null &&
        JSON.stringify(currentConfig) === JSON.stringify(desiredServerConfig)
      ) {
        return true;
      }

      const nextConfig: ClaudeUserConfig = {
        ...config,
        mcpServers: {
          ...existingServers,
          [BROWSER_MCP_SERVER_NAME]: desiredServerConfig,
        },
      };

      try {
        writeClaudeUserConfig(claudeUserConfigPath, nextConfig);
        return true;
      } catch {
        return false;
      }
    });
  } catch (error) {
    if (isLockUnavailableError(error)) {
      return false;
    }
    throw error;
  }
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
  const serverPath = getBrowserMcpServerPath();
  if (!fs.existsSync(serverPath)) {
    return false;
  }

  try {
    fs.unlinkSync(serverPath);
    return true;
  } catch {
    return false;
  }
}

export function removeBrowserMcpConfig(): boolean {
  let removed = removeManagedServerConfig(getClaudeUserConfigPath());

  const instanceManager = new InstanceManager();
  for (const instanceName of instanceManager.listInstances()) {
    const instancePath = instanceManager.getInstancePath(instanceName);
    const instanceClaudeConfigPath = path.join(instancePath, '.claude.json');
    removed = removeManagedServerConfig(instanceClaudeConfigPath) || removed;
  }

  return removed;
}

export function uninstallBrowserMcp(): boolean {
  const removedConfig = removeBrowserMcpConfig();
  const removedServer = uninstallBrowserMcpServer();
  return removedConfig || removedServer;
}

export function ensureBrowserMcpOrThrow(): boolean {
  const ready = ensureBrowserMcp();
  if (!ready) {
    throw new Error('Browser MCP is enabled, but CCS could not prepare the local browser tool.');
  }

  return ready;
}
