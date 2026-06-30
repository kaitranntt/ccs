/**
 * Image Analysis MCP installer and ~/.claude.json provisioning.
 */

import * as fs from 'fs';
import * as path from 'path';

import { getCcsDir } from '../config-manager';
import { getClaudeUserConfigPath } from '../claude-config-path';
import { info, warn } from '../ui';
import { InstanceManager } from '../../management/instance-manager';
import { installImageAnalysisPrompts } from './hook-installer';
import { getImageAnalysisConfig } from '../../config/config-loader-facade';
import {
  isClaudeUserConfigLockUnavailableError as isLockUnavailableError,
  withClaudeUserConfigLock,
} from '../claude-user-config-lock';

const IMAGE_ANALYSIS_MCP_SERVER = 'ccs-image-analysis-server.cjs';
const IMAGE_ANALYSIS_MCP_RUNTIME = 'image-analysis-runtime.cjs';
const IMAGE_ANALYSIS_MCP_SERVER_NAME = 'ccs-image-analysis';

interface ClaudeUserConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ManagedImageAnalysisMcpConfig {
  type: 'stdio';
  command: 'node';
  args: [string];
  env: Record<string, string>;
}

function getCcsMcpDir(): string {
  return path.join(getCcsDir(), 'mcp');
}

export function getImageAnalysisMcpServerName(): string {
  return IMAGE_ANALYSIS_MCP_SERVER_NAME;
}

export function getImageAnalysisMcpServerPath(): string {
  return path.join(getCcsMcpDir(), IMAGE_ANALYSIS_MCP_SERVER);
}

export function getImageAnalysisMcpRuntimePath(): string {
  return path.join(getCcsMcpDir(), IMAGE_ANALYSIS_MCP_RUNTIME);
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
        String(
          warn(`Existing Image Analysis MCP server is unreadable: ${(error as Error).message}`)
        ) + '\n'
      );
    }
    return false;
  }
}

function getTempPath(targetPath: string): string {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${targetPath}.${suffix}.tmp`;
}

function resolveBundledArtifactSourcePath(fileName: string): string | null {
  const possiblePaths = [
    path.join(__dirname, '..', '..', '..', 'lib', 'mcp', fileName),
    path.join(__dirname, '..', '..', 'lib', 'mcp', fileName),
    path.join(__dirname, '..', 'lib', 'mcp', fileName),
    path.join(__dirname, '..', '..', '..', 'lib', 'hooks', fileName),
    path.join(__dirname, '..', '..', 'lib', 'hooks', fileName),
    path.join(__dirname, '..', 'lib', 'hooks', fileName),
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

export function hasImageAnalysisMcpServerInstalled(): boolean {
  return (
    fs.existsSync(getImageAnalysisMcpServerPath()) &&
    fs.existsSync(getImageAnalysisMcpRuntimePath())
  );
}

export function hasImageAnalysisMcpConfig(configPath = getClaudeUserConfigPath()): boolean {
  const config = readClaudeUserConfig(configPath);
  if (config === null) {
    return false;
  }

  const existingServers =
    config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers)
      ? (config.mcpServers as Record<string, unknown>)
      : {};
  const currentConfig = existingServers[IMAGE_ANALYSIS_MCP_SERVER_NAME];

  return (
    typeof currentConfig === 'object' &&
    currentConfig !== null &&
    JSON.stringify(currentConfig) ===
      JSON.stringify({
        type: 'stdio',
        command: 'node',
        args: [getImageAnalysisMcpServerPath()],
        env: {},
      })
  );
}

export function hasImageAnalysisMcpReady(configPath = getClaudeUserConfigPath()): boolean {
  return hasImageAnalysisMcpServerInstalled() && hasImageAnalysisMcpConfig(configPath);
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

      if (!(IMAGE_ANALYSIS_MCP_SERVER_NAME in existingServers)) {
        return false;
      }

      delete existingServers[IMAGE_ANALYSIS_MCP_SERVER_NAME];

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
            String(info(`Removed Image Analysis MCP config from ${configPath}`)) + '\n'
          );
        }
        return true;
      } catch (error) {
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(
              warn(
                `Failed to remove Image Analysis MCP config from ${configPath}: ${(error as Error).message}`
              )
            ) + '\n'
          );
        }
        return false;
      }
    });
  } catch (error) {
    if (isLockUnavailableError(error)) {
      if (process.env.CCS_DEBUG) {
        process.stderr.write(
          String(
            warn(
              `Image Analysis MCP cleanup skipped because ${configPath} is locked by another process`
            )
          ) + '\n'
        );
      }
      return false;
    }
    throw error;
  }
}

export function installImageAnalysisMcpServer(): boolean {
  const config = getImageAnalysisConfig();
  if (!config.enabled) {
    return false;
  }

  const artifacts = [
    {
      fileName: IMAGE_ANALYSIS_MCP_SERVER,
      sourcePath: resolveBundledArtifactSourcePath(IMAGE_ANALYSIS_MCP_SERVER),
      destinationPath: getImageAnalysisMcpServerPath(),
    },
    {
      fileName: IMAGE_ANALYSIS_MCP_RUNTIME,
      sourcePath: resolveBundledArtifactSourcePath(IMAGE_ANALYSIS_MCP_RUNTIME),
      destinationPath: getImageAnalysisMcpRuntimePath(),
    },
  ];

  const missingArtifact = artifacts.find((artifact) => !artifact.sourcePath);
  if (missingArtifact) {
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn(`Image Analysis MCP runtime source not found: ${missingArtifact.fileName}`)) +
          '\n'
      );
    }
    return false;
  }

  const mcpDir = getCcsMcpDir();
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true, mode: 0o700 });
  }

  try {
    for (const artifact of artifacts) {
      const sourcePath = artifact.sourcePath;
      if (!sourcePath) {
        continue;
      }

      if (hasMatchingContents(sourcePath, artifact.destinationPath)) {
        continue;
      }

      const tempPath = getTempPath(artifact.destinationPath);

      try {
        fs.copyFileSync(sourcePath, tempPath);
        fs.chmodSync(tempPath, 0o755);
        try {
          fs.renameSync(tempPath, artifact.destinationPath);
        } catch (renameError) {
          const errorCode = (renameError as NodeJS.ErrnoException).code;
          if (errorCode !== 'EEXIST' && errorCode !== 'EPERM') {
            throw renameError;
          }

          if (!hasMatchingContents(sourcePath, artifact.destinationPath)) {
            fs.copyFileSync(tempPath, artifact.destinationPath);
            fs.chmodSync(artifact.destinationPath, 0o755);
          }
        }
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    }

    installImageAnalysisPrompts();
    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn(`Failed to install Image Analysis MCP server: ${(error as Error).message}`)) +
          '\n'
      );
    }
    return false;
  }
}

export function ensureImageAnalysisMcpConfig(): boolean {
  const imageConfig = getImageAnalysisConfig();
  if (!imageConfig.enabled) {
    return false;
  }

  const claudeUserConfigPath = getClaudeUserConfigPath();
  const claudeUserConfigDir = path.dirname(claudeUserConfigPath);
  if (!fs.existsSync(claudeUserConfigDir)) {
    fs.mkdirSync(claudeUserConfigDir, { recursive: true, mode: 0o700 });
  }
  const desiredServerConfig: ManagedImageAnalysisMcpConfig = {
    type: 'stdio',
    command: 'node',
    args: [getImageAnalysisMcpServerPath()],
    env: {},
  };

  try {
    return withClaudeUserConfigLock(claudeUserConfigPath, () => {
      const config = readClaudeUserConfig(claudeUserConfigPath);

      if (config === null) {
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(warn('Malformed ~/.claude.json prevents Image Analysis MCP provisioning')) + '\n'
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
      const currentConfig = existingServers[IMAGE_ANALYSIS_MCP_SERVER_NAME];
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
          [IMAGE_ANALYSIS_MCP_SERVER_NAME]: desiredServerConfig,
        },
      };

      try {
        writeClaudeUserConfig(claudeUserConfigPath, nextConfig);
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(info(`Ensured Image Analysis MCP config in ${claudeUserConfigPath}`)) + '\n'
          );
        }
        return true;
      } catch (error) {
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
      if (process.env.CCS_DEBUG) {
        process.stderr.write(
          String(
            warn(
              `Image Analysis MCP provisioning skipped because ${claudeUserConfigPath} is locked by another process`
            )
          ) + '\n'
        );
      }
      return false;
    }
    throw error;
  }
}

export function ensureImageAnalysisMcp(): boolean {
  const imageConfig = getImageAnalysisConfig();
  if (!imageConfig.enabled) {
    return false;
  }

  const installed = installImageAnalysisMcpServer();
  const configured = installed && ensureImageAnalysisMcpConfig();
  return installed && configured;
}

export function syncImageAnalysisMcpToConfigDir(claudeConfigDir: string | undefined): boolean {
  if (!claudeConfigDir) {
    return false;
  }

  return new InstanceManager().syncMcpServers(claudeConfigDir);
}

export function uninstallImageAnalysisMcpServer(): boolean {
  const artifactPaths = [getImageAnalysisMcpServerPath(), getImageAnalysisMcpRuntimePath()];
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
    if (process.env.CCS_DEBUG) {
      process.stderr.write(
        String(warn(`Failed to remove Image Analysis MCP server: ${(error as Error).message}`)) +
          '\n'
      );
    }
    return false;
  }
}

export function removeImageAnalysisMcpConfig(): boolean {
  let removed = removeManagedServerConfig(getClaudeUserConfigPath());

  const instanceManager = new InstanceManager();
  for (const instanceName of instanceManager.listInstances()) {
    const instancePath = instanceManager.getInstancePath(instanceName);
    const instanceClaudeConfigPath = path.join(instancePath, '.claude.json');
    removed = removeManagedServerConfig(instanceClaudeConfigPath) || removed;
  }

  return removed;
}

export function uninstallImageAnalysisMcp(): boolean {
  const removedConfig = removeImageAnalysisMcpConfig();
  const removedServer = uninstallImageAnalysisMcpServer();
  return removedConfig || removedServer;
}

export function ensureImageAnalysisMcpOrThrow(): boolean {
  const imageConfig = getImageAnalysisConfig();
  if (!imageConfig.enabled) {
    return false;
  }

  const ready = ensureImageAnalysisMcp();
  if (!ready) {
    process.stderr.write(
      String(
        warn(
          'Image Analysis is enabled, but CCS could not prepare the local ImageAnalysis tool. This session will fall back to native Read.'
        )
      ) + '\n'
    );
  }

  return ready;
}
