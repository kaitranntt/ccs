import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { ensureCLIProxyBinary, getInstalledCliproxyVersion } from '../cliproxy/binary-manager';
import {
  configExists,
  configNeedsRegeneration,
  CCS_CONTROL_PANEL_SECRET,
  CCS_INTERNAL_API_KEY,
  generateConfig,
  getCliproxyWritablePath,
  regenerateConfig,
} from '../cliproxy/config/config-generator';
import { CLIPROXY_DEFAULT_PORT } from '../cliproxy/config/port-manager';
import { getCliproxyConfigPath } from '../cliproxy/config/path-resolver';
import { registerSession, unregisterSession } from '../cliproxy/session-tracker';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../config/config-loader-facade';

function generateDockerSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function ensureDockerCliproxyAuth(): boolean {
  const config = loadOrCreateUnifiedConfig();
  const auth = config.cliproxy.auth;
  const needsApiKey = !auth?.api_key || auth.api_key === CCS_INTERNAL_API_KEY;
  const needsManagementSecret =
    !auth?.management_secret || auth.management_secret === CCS_CONTROL_PANEL_SECRET;

  if (!needsApiKey && !needsManagementSecret) {
    return false;
  }

  mutateConfig((nextConfig) => {
    nextConfig.cliproxy.auth ??= {};
    if (needsApiKey) {
      nextConfig.cliproxy.auth.api_key = generateDockerSecret();
    }
    if (needsManagementSecret) {
      nextConfig.cliproxy.auth.management_secret = generateDockerSecret();
    }
  });

  return true;
}

async function prepareIntegratedRuntime(): Promise<{ binaryPath: string; configPath: string }> {
  const binaryPath = await ensureCLIProxyBinary(false);
  const authWasGenerated = ensureDockerCliproxyAuth();
  const configPath = !configExists(CLIPROXY_DEFAULT_PORT)
    ? generateConfig('gemini', CLIPROXY_DEFAULT_PORT)
    : authWasGenerated || configNeedsRegeneration()
      ? regenerateConfig(CLIPROXY_DEFAULT_PORT)
      : getCliproxyConfigPath();

  return { binaryPath, configPath };
}

async function runCliproxy(): Promise<number> {
  const { binaryPath, configPath } = await prepareIntegratedRuntime();
  return new Promise<number>((resolve, reject) => {
    const child = spawn(binaryPath, ['--config', configPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        WRITABLE_PATH: getCliproxyWritablePath(),
      },
    });

    // Register session lock so dashboard can detect the running proxy
    let sessionId: string | undefined;
    child.on('spawn', () => {
      if (!child.pid) return;
      try {
        const version = getInstalledCliproxyVersion();
        sessionId = registerSession(CLIPROXY_DEFAULT_PORT, child.pid, version, 'plus');
      } catch (err) {
        console.error(
          `[cliproxy] Failed to register session lock: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (sessionId) {
        unregisterSession(sessionId, CLIPROXY_DEFAULT_PORT);
      }
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (command !== 'run-cliproxy') {
    console.error('[X] Usage: node dist/docker/docker-bootstrap.js run-cliproxy');
    return 1;
  }

  return runCliproxy();
}

if (require.main === module) {
  void main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(
        `[X] Failed to prepare Docker runtime: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exitCode = 1;
    });
}
