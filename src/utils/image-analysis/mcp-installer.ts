/**
 * Image Analysis MCP installer and ~/.claude.json provisioning.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getClaudeUserConfigPath } from '../claude-config-path';
import { info, warn } from '../ui';
import { InstanceManager } from '../../management/instance-manager';
import { installImageAnalysisPrompts } from './hook-installer';
import { getImageAnalysisConfig } from '../../config/config-loader-facade';
import {
  ensureManagedMcpServerConfig,
  getCcsMcpDir,
  hasManagedMcpServerConfig,
  removeManagedMcpServerFromConfigPaths,
  resolveBundledMcpArtifactSourcePath,
  stageMcpArtifact,
  uninstallMcpArtifactFiles,
  type ManagedMcpServerConfig,
} from '../../shared/mcp-claude-installer';

const IMAGE_ANALYSIS_MCP_SERVER = 'ccs-image-analysis-server.cjs';
const IMAGE_ANALYSIS_MCP_RUNTIME = 'image-analysis-runtime.cjs';
const IMAGE_ANALYSIS_MCP_SERVER_NAME = 'ccs-image-analysis';

export function getImageAnalysisMcpServerName(): string {
  return IMAGE_ANALYSIS_MCP_SERVER_NAME;
}

export function getImageAnalysisMcpServerPath(): string {
  return path.join(getCcsMcpDir(), IMAGE_ANALYSIS_MCP_SERVER);
}

export function getImageAnalysisMcpRuntimePath(): string {
  return path.join(getCcsMcpDir(), IMAGE_ANALYSIS_MCP_RUNTIME);
}

function getDesiredImageAnalysisMcpConfig(): ManagedMcpServerConfig {
  return {
    type: 'stdio',
    command: 'node',
    args: [getImageAnalysisMcpServerPath()],
    env: {},
  };
}

export function hasImageAnalysisMcpServerInstalled(): boolean {
  return (
    fs.existsSync(getImageAnalysisMcpServerPath()) &&
    fs.existsSync(getImageAnalysisMcpRuntimePath())
  );
}

export function hasImageAnalysisMcpConfig(configPath = getClaudeUserConfigPath()): boolean {
  return hasManagedMcpServerConfig(
    configPath,
    IMAGE_ANALYSIS_MCP_SERVER_NAME,
    getDesiredImageAnalysisMcpConfig()
  );
}

export function hasImageAnalysisMcpReady(configPath = getClaudeUserConfigPath()): boolean {
  return hasImageAnalysisMcpServerInstalled() && hasImageAnalysisMcpConfig(configPath);
}

export function installImageAnalysisMcpServer(): boolean {
  const config = getImageAnalysisConfig();
  if (!config.enabled) {
    return false;
  }

  const artifacts = [
    {
      fileName: IMAGE_ANALYSIS_MCP_SERVER,
      sourcePath: resolveBundledMcpArtifactSourcePath(IMAGE_ANALYSIS_MCP_SERVER, ['mcp', 'hooks']),
      destinationPath: getImageAnalysisMcpServerPath(),
    },
    {
      fileName: IMAGE_ANALYSIS_MCP_RUNTIME,
      sourcePath: resolveBundledMcpArtifactSourcePath(IMAGE_ANALYSIS_MCP_RUNTIME, ['mcp', 'hooks']),
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
      if (!artifact.sourcePath) {
        continue;
      }

      stageMcpArtifact(artifact.sourcePath, artifact.destinationPath, {
        mode: 0o755,
        onUnreadable: (error) => {
          if (process.env.CCS_DEBUG) {
            process.stderr.write(
              String(warn(`Existing Image Analysis MCP server is unreadable: ${error.message}`)) +
                '\n'
            );
          }
        },
      });
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

  const status = ensureManagedMcpServerConfig({
    serverName: IMAGE_ANALYSIS_MCP_SERVER_NAME,
    desiredConfig: getDesiredImageAnalysisMcpConfig(),
    ensureParentDir: true,
    callbacks: {
      onMalformed: () => {
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(warn('Malformed ~/.claude.json prevents Image Analysis MCP provisioning')) + '\n'
          );
        }
      },
      onUpdated: (configPath) => {
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(info(`Ensured Image Analysis MCP config in ${configPath}`)) + '\n'
          );
        }
      },
      onWriteFailed: (_configPath, error) => {
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(warn(`Failed to update ~/.claude.json: ${error.message}`)) + '\n'
          );
        }
      },
      onLocked: (configPath) => {
        if (process.env.CCS_DEBUG) {
          process.stderr.write(
            String(
              warn(
                `Image Analysis MCP provisioning skipped because ${configPath} is locked by another process`
              )
            ) + '\n'
          );
        }
      },
    },
  });

  return status === 'ready' || status === 'updated';
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
  return uninstallMcpArtifactFiles(
    [getImageAnalysisMcpServerPath(), getImageAnalysisMcpRuntimePath()],
    (error) => {
      if (process.env.CCS_DEBUG) {
        process.stderr.write(
          String(warn(`Failed to remove Image Analysis MCP server: ${error.message}`)) + '\n'
        );
      }
    }
  );
}

export function removeImageAnalysisMcpConfig(): boolean {
  const instanceManager = new InstanceManager();
  const configPaths = [
    getClaudeUserConfigPath(),
    ...instanceManager
      .listInstances()
      .map((instanceName) =>
        path.join(instanceManager.getInstancePath(instanceName), '.claude.json')
      ),
  ];

  return removeManagedMcpServerFromConfigPaths(IMAGE_ANALYSIS_MCP_SERVER_NAME, configPaths, {
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
          String(info(`Removed Image Analysis MCP config from ${configPath}`)) + '\n'
        );
      }
    },
    onWriteFailed: (configPath, error) => {
      if (process.env.CCS_DEBUG) {
        process.stderr.write(
          String(
            warn(`Failed to remove Image Analysis MCP config from ${configPath}: ${error.message}`)
          ) + '\n'
        );
      }
    },
    onLocked: (configPath) => {
      if (process.env.CCS_DEBUG) {
        process.stderr.write(
          String(
            warn(
              `Image Analysis MCP cleanup skipped because ${configPath} is locked by another process`
            )
          ) + '\n'
        );
      }
    },
  });
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
