import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from '../utils/config-manager';
import type { DockerConfigSummary } from './docker-types';

export const DOCKER_REMOTE_DIR = '~/.ccs/docker';
export const DOCKER_COMPOSE_SERVICE = 'ccs-cliproxy';
export const DOCKER_CONTAINER_NAME = 'ccs-cliproxy';
export const DOCKER_DEFAULT_DASHBOARD_PORT = 3000;
export const DOCKER_DEFAULT_PROXY_PORT = 8317;

export const DOCKER_LOG_FILES = {
  ccs: '/var/log/ccs/ccs-dashboard.log',
  cliproxy: '/var/log/ccs/cliproxy.log',
} as const;

export interface DockerAssetPaths {
  dockerDir: string;
  composeFile: string;
  dockerfile: string;
  supervisordConfig: string;
  entrypoint: string;
}

function getPackageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function getDockerAssetPaths(): DockerAssetPaths {
  const packageRoot = getPackageRoot();
  const dockerDir = path.join(packageRoot, 'docker');
  const assets: DockerAssetPaths = {
    dockerDir,
    composeFile: path.join(dockerDir, 'docker-compose.integrated.yml'),
    dockerfile: path.join(dockerDir, 'Dockerfile.integrated'),
    supervisordConfig: path.join(dockerDir, 'supervisord.conf'),
    entrypoint: path.join(dockerDir, 'entrypoint-integrated.sh'),
  };

  for (const assetPath of Object.values(assets)) {
    if (!fs.existsSync(assetPath)) {
      throw new Error(
        `Missing bundled Docker asset: ${assetPath}\nReinstall CCS or use a package build that includes docker/ assets.`
      );
    }
  }

  return assets;
}

export function getInstalledCcsVersion(): string {
  const packageJsonPath = path.join(getPackageRoot(), 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      version?: string;
    };
    return packageJson.version?.trim() || 'latest';
  } catch {
    return 'latest';
  }
}

export function createDockerConfigSummary(options: {
  host?: string;
  port?: number;
  proxyPort?: number;
}): DockerConfigSummary {
  const assets = getDockerAssetPaths();
  return {
    host: options.host,
    remote: Boolean(options.host),
    ccsDir: getCcsDir(),
    dockerDir: assets.dockerDir,
    composeFile: assets.composeFile,
    dockerfile: assets.dockerfile,
    supervisordConfig: assets.supervisordConfig,
    entrypoint: assets.entrypoint,
    remoteDeployDir: DOCKER_REMOTE_DIR,
    composeService: DOCKER_COMPOSE_SERVICE,
    containerName: DOCKER_CONTAINER_NAME,
    dashboardPort: options.port ?? DOCKER_DEFAULT_DASHBOARD_PORT,
    proxyPort: options.proxyPort ?? DOCKER_DEFAULT_PROXY_PORT,
  };
}
