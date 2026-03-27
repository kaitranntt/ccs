import { spawn } from 'child_process';
import { ensureCLIProxyBinary } from '../cliproxy/binary-manager';
import {
  configExists,
  configNeedsRegeneration,
  generateConfig,
  getCliproxyWritablePath,
  regenerateConfig,
} from '../cliproxy/config-generator';
import { CLIPROXY_DEFAULT_PORT } from '../cliproxy/config/port-manager';
import { getCliproxyConfigPath } from '../cliproxy/config/path-resolver';

async function prepareIntegratedRuntime(): Promise<{ binaryPath: string; configPath: string }> {
  const binaryPath = await ensureCLIProxyBinary(false);
  const configPath = !configExists(CLIPROXY_DEFAULT_PORT)
    ? generateConfig('gemini', CLIPROXY_DEFAULT_PORT)
    : configNeedsRegeneration()
      ? regenerateConfig(CLIPROXY_DEFAULT_PORT)
      : getCliproxyConfigPath();

  return { binaryPath, configPath };
}

async function runCliproxy(): Promise<void> {
  const { binaryPath, configPath } = await prepareIntegratedRuntime();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binaryPath, ['--config', configPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        WRITABLE_PATH: getCliproxyWritablePath(),
      },
    });

    child.on('error', reject);
    child.on('close', (code) => {
      process.exit(code ?? 1);
    });
    child.on('spawn', () => resolve());
  });
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'run-cliproxy') {
    console.error('[X] Usage: node dist/docker/docker-bootstrap.js run-cliproxy');
    process.exit(1);
  }

  await runCliproxy();
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(
      `[X] Failed to prepare Docker runtime: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}
