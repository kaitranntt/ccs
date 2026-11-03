import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import * as fs from 'fs';
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
import { startClaudePoolPolicyController } from '../cliproxy/accounts/claude-pool-policy';
import {
  getConfigYamlPath,
  loadOrCreateUnifiedConfig,
  mutateConfig,
} from '../config/config-loader-facade';
import {
  addLegacyKeyGrace,
  createDockerBootstrapState,
  DOCKER_LEGACY_API_KEY,
  isDockerLegacyKeyGraceActive,
  isLikelyDockerGeneratedApiKey,
  readDockerBootstrapState,
  shouldRestoreDockerLegacyApiKey,
  writeDockerBootstrapState,
} from './docker-key-rotation';

function generateDockerSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function ensureDockerCliproxyAuth(): boolean {
  const now = new Date();
  const hadUnifiedConfig = fs.existsSync(getConfigYamlPath());
  const hadCliproxyConfig = configExists(CLIPROXY_DEFAULT_PORT);
  const cliproxyConfigPath = getCliproxyConfigPath();
  const existingCliproxyConfig = hadCliproxyConfig
    ? fs.readFileSync(cliproxyConfigPath, 'utf8')
    : '';
  const config = loadOrCreateUnifiedConfig();
  const auth = config.cliproxy.auth;
  const needsApiKey = !auth?.api_key || auth.api_key === CCS_INTERNAL_API_KEY;
  const needsManagementSecret =
    !auth?.management_secret || auth.management_secret === CCS_CONTROL_PANEL_SECRET;
  const stateRead = readDockerBootstrapState();
  const existingState = stateRead.state;
  const existingApiKey = auth?.api_key;

  let replacementApiKey = existingApiKey;
  let configChanged = false;

  if (needsApiKey || needsManagementSecret) {
    mutateConfig((nextConfig) => {
      nextConfig.cliproxy.auth ??= {};
      if (needsApiKey) {
        replacementApiKey = generateDockerSecret();
        nextConfig.cliproxy.auth.api_key = replacementApiKey;
      }
      if (needsManagementSecret) {
        nextConfig.cliproxy.auth.management_secret = generateDockerSecret();
      }
    });
    configChanged = true;
  }

  if (!replacementApiKey) {
    replacementApiKey = loadOrCreateUnifiedConfig().cliproxy.auth?.api_key;
  }

  const existingLegacyKeyInCliproxyConfig = existingCliproxyConfig.includes(
    `"${DOCKER_LEGACY_API_KEY}"`
  );
  const freshInstall = !hadUnifiedConfig && !hadCliproxyConfig;
  const oldDefaultUpgrade = needsApiKey && !freshInstall;
  const explicitLegacyRestore = shouldRestoreDockerLegacyApiKey();
  const legacyRestoreEligible = !existingState?.legacyKeyGrace;
  const alreadyBrokenUpgrade =
    explicitLegacyRestore &&
    legacyRestoreEligible &&
    hadCliproxyConfig &&
    isLikelyDockerGeneratedApiKey(replacementApiKey) &&
    !existingLegacyKeyInCliproxyConfig;
  const corruptedRecoverableUpgrade =
    explicitLegacyRestore &&
    stateRead.corrupted &&
    hadCliproxyConfig &&
    isLikelyDockerGeneratedApiKey(replacementApiKey);

  let nextState = existingState ?? createDockerBootstrapState(replacementApiKey, now);

  if (replacementApiKey && !nextState.apiKey) {
    nextState = { ...nextState, apiKey: replacementApiKey };
  }

  if (
    replacementApiKey &&
    !isDockerLegacyKeyGraceActive(existingState, now) &&
    (oldDefaultUpgrade || alreadyBrokenUpgrade || corruptedRecoverableUpgrade)
  ) {
    nextState = addLegacyKeyGrace(nextState, replacementApiKey, now);
  }

  if (!existingState || stateRead.corrupted || nextState !== existingState) {
    writeDockerBootstrapState(nextState);
  }

  const legacyShouldBePresent = isDockerLegacyKeyGraceActive(nextState, now);
  const legacyPresenceChanged = existingLegacyKeyInCliproxyConfig !== legacyShouldBePresent;

  return configChanged || legacyPresenceChanged;
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
  const stopClaudePoolPolicy = startClaudePoolPolicyController();
  return new Promise<number>((resolve, reject) => {
    const child = spawn(binaryPath, ['--config', configPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        WRITABLE_PATH: getCliproxyWritablePath(),
      },
    });
    let shuttingDown = false;
    const shutdown = (signal: NodeJS.Signals) => {
      if (shuttingDown) return;
      shuttingDown = true;
      void stopClaudePoolPolicy().finally(() => {
        child.kill(signal);
      });
    };
    const onSigterm = () => shutdown('SIGTERM');
    const onSigint = () => shutdown('SIGINT');
    const removeSignalHandlers = () => {
      process.off('SIGTERM', onSigterm);
      process.off('SIGINT', onSigint);
    };
    process.on('SIGTERM', onSigterm);
    process.on('SIGINT', onSigint);

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

    child.on('error', (error) => {
      removeSignalHandlers();
      void stopClaudePoolPolicy().then(
        () => reject(error),
        () => reject(error)
      );
    });
    child.on('close', (code) => {
      removeSignalHandlers();
      void stopClaudePoolPolicy().then(() => {
        if (sessionId) unregisterSession(sessionId, CLIPROXY_DEFAULT_PORT);
        resolve(shuttingDown ? 0 : (code ?? 1));
      }, reject);
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
