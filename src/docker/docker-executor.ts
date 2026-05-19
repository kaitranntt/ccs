import { spawn, spawnSync } from 'child_process';
import * as path from 'path';
import {
  DOCKER_CONTAINER_NAME,
  DOCKER_LOG_FILES,
  DOCKER_REMOTE_DIR,
  type DockerAssetPaths,
  createDockerConfigSummary,
  getInstalledCcsVersion,
  getDockerAssetPaths,
} from './docker-assets';
import type {
  DockerCommandResult,
  DockerCommandTarget,
  DockerConfigSummary,
  DockerLogsOptions,
  DockerStatusResult,
  DockerUpOptions,
} from './docker-types';

const LOCAL_DOCKER_SYNC_TIMEOUT_MS = 10_000;
const REMOTE_DOCKER_SYNC_TIMEOUT_MS = 30_000;
const REMOTE_DOCKER_BUILD_TIMEOUT_MS = 300_000;

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function renderCommand(command: string, args: string[]): string {
  return [command, ...args.map((arg) => quotePosix(arg))].join(' ');
}

function normalizeOutput(value: string | Buffer | null | undefined): string {
  if (typeof value === 'string') return value;
  return value ? value.toString('utf8') : '';
}

interface DockerSyncRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  remote?: boolean;
  timeoutMs?: number;
}

function formatTimeout(timeoutMs: number): string {
  return timeoutMs % 1000 === 0 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`;
}

function buildTimeoutMessage(
  command: string,
  args: string[],
  timeoutMs: number,
  remote: boolean
): string {
  return [
    `Command timed out after ${formatTimeout(timeoutMs)} while running a ${
      remote ? 'remote' : 'local'
    } Docker command.`,
    `Command: ${renderCommand(command, args)}`,
    remote
      ? 'Check SSH reachability and the remote Docker host, then try again.'
      : 'Check Docker availability on this machine, then try again.',
  ].join('\n');
}

function applyDefaultTimeouts(options: DockerSyncRunOptions): DockerSyncRunOptions {
  return {
    ...options,
    timeoutMs:
      options.timeoutMs ??
      (options.remote ? REMOTE_DOCKER_SYNC_TIMEOUT_MS : LOCAL_DOCKER_SYNC_TIMEOUT_MS),
  };
}

function runSync(
  command: string,
  args: string[],
  options: DockerSyncRunOptions = {}
): DockerCommandResult {
  const normalizedOptions = applyDefaultTimeouts(options);
  const result = spawnSync(command, args, {
    cwd: normalizedOptions.cwd,
    env: normalizedOptions.env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: normalizedOptions.timeoutMs,
    windowsHide: true,
  });
  const errorMessage =
    result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT'
      ? buildTimeoutMessage(
          command,
          args,
          normalizedOptions.timeoutMs ?? LOCAL_DOCKER_SYNC_TIMEOUT_MS,
          normalizedOptions.remote ?? false
        )
      : result.error?.message;
  const stderr = [normalizeOutput(result.stderr), errorMessage].filter(Boolean).join('\n');

  return {
    command: renderCommand(command, args),
    exitCode: result.status ?? 1,
    stdout: normalizeOutput(result.stdout),
    stderr,
    remote: normalizedOptions.remote ?? false,
  };
}

function runStreaming(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: true,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if ((code ?? 1) === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${code ?? 1}): ${renderCommand(command, args)}`));
    });
  });
}

let cachedLocalComposePrefix: string[] | undefined;

function resolveLocalComposePrefix(): string[] {
  if (cachedLocalComposePrefix) {
    return [...cachedLocalComposePrefix];
  }
  if (
    runSync('docker', ['compose', 'version'], {
      timeoutMs: LOCAL_DOCKER_SYNC_TIMEOUT_MS,
    }).exitCode === 0
  ) {
    cachedLocalComposePrefix = ['docker', 'compose'];
    return [...cachedLocalComposePrefix];
  }
  if (
    runSync('docker-compose', ['version'], {
      timeoutMs: LOCAL_DOCKER_SYNC_TIMEOUT_MS,
    }).exitCode === 0
  ) {
    cachedLocalComposePrefix = ['docker-compose'];
    return [...cachedLocalComposePrefix];
  }
  throw new Error('Docker Compose is not available. Install Docker Desktop or docker-compose.');
}

function buildRemoteComposeCommand(composeArgs: string[]): string {
  const suffix = composeArgs.map((arg) => quotePosix(arg)).join(' ');
  return [
    'if docker compose version >/dev/null 2>&1; then',
    `docker compose ${suffix};`,
    'elif docker-compose version >/dev/null 2>&1; then',
    `docker-compose ${suffix};`,
    'else',
    "echo 'Docker Compose is not available on the remote host.' >&2;",
    'exit 127;',
    'fi',
  ].join(' ');
}

function buildRemoteDockerCommand(args: string[]): string {
  return ['docker', ...args.map((arg) => quotePosix(arg))].join(' ');
}

interface DockerExecutorDeps {
  assets?: DockerAssetPaths;
  getInstalledCcsVersion?: () => string;
  resolveLocalComposePrefix?: () => string[];
  runSync?: (
    command: string,
    args: string[],
    options?: DockerSyncRunOptions
  ) => DockerCommandResult;
  runStreaming?: (command: string, args: string[]) => Promise<void>;
}

export class DockerExecutor {
  private readonly assets: DockerAssetPaths;

  constructor(private readonly deps: DockerExecutorDeps = {}) {
    this.assets = deps.assets ?? getDockerAssetPaths();
  }

  getConfig(options: { host?: string; port?: number; proxyPort?: number }): DockerConfigSummary {
    return createDockerConfigSummary(options);
  }

  up(options: DockerUpOptions): void {
    if (options.host) {
      this.stageRemoteAssets(options.host);
    }
    this.ensureSuccess(
      this.runCompose(
        ['up', '-d', '--build'],
        options,
        {
          CCS_NPM_VERSION: this.getInstalledCcsVersion(),
          CCS_DASHBOARD_PORT: String(options.port),
          CCS_CLIPROXY_PORT: String(options.proxyPort),
          CCS_DOCKER_BIND_HOST: process.env.CCS_DOCKER_BIND_HOST || '127.0.0.1',
        },
        REMOTE_DOCKER_BUILD_TIMEOUT_MS
      ),
      'Docker stack startup',
      options
    );
  }

  down(options: DockerCommandTarget): void {
    this.ensureSuccess(this.runCompose(['down'], options), 'Docker stack shutdown', options);
  }

  status(options: DockerCommandTarget): DockerStatusResult {
    const compose = this.runCompose(['ps'], options);
    this.ensureSuccess(compose, 'Docker status', options);
    let supervisor: DockerCommandResult | undefined;
    if (compose.exitCode === 0) {
      supervisor = this.runDocker(
        ['exec', DOCKER_CONTAINER_NAME, 'supervisorctl', '-c', '/etc/supervisord.conf', 'status'],
        options
      );
    }
    return { compose, supervisor };
  }

  update(options: DockerCommandTarget): void {
    const script =
      'npm install -g @kaitranntt/ccs@latest --force && ccs cliproxy --latest && supervisorctl -c /etc/supervisord.conf restart ccs-dashboard cliproxy';
    this.ensureSuccess(
      this.runDocker(
        ['exec', DOCKER_CONTAINER_NAME, 'sh', '-lc', script],
        options,
        REMOTE_DOCKER_BUILD_TIMEOUT_MS
      ),
      'Docker stack update',
      options
    );
  }

  async logs(options: DockerLogsOptions): Promise<string | void> {
    const files = options.service
      ? [DOCKER_LOG_FILES[options.service]]
      : [DOCKER_LOG_FILES.ccs, DOCKER_LOG_FILES.cliproxy];
    const touch = `mkdir -p /var/log/ccs && touch ${files.map((file) => quotePosix(file)).join(' ')}`;
    const command = options.follow
      ? `${touch} && tail -n 100 -F ${files.map((file) => quotePosix(file)).join(' ')}`
      : options.service
        ? `${touch} && tail -n 100 ${quotePosix(files[0])}`
        : `${touch} && printf '== ccs ==\\n' && tail -n 100 ${quotePosix(
            DOCKER_LOG_FILES.ccs
          )} && printf '\\n== cliproxy ==\\n' && tail -n 100 ${quotePosix(DOCKER_LOG_FILES.cliproxy)}`;

    if (options.follow) {
      await this.runDockerStreaming(['exec', DOCKER_CONTAINER_NAME, 'sh', '-lc', command], options);
      return;
    }

    const result = this.runDocker(['exec', DOCKER_CONTAINER_NAME, 'sh', '-lc', command], options);
    this.ensureSuccess(result, 'Docker log retrieval', options);
    return result.stdout;
  }

  private stageRemoteAssets(host: string): void {
    this.ensureSuccess(
      this.runSync('ssh', [host, `mkdir -p ${DOCKER_REMOTE_DIR}`], { remote: true }),
      'Remote Docker asset staging',
      { host }
    );
    const files = [
      this.assets.composeFile,
      this.assets.dockerfile,
      this.assets.supervisordConfig,
      this.assets.entrypoint,
    ];
    const target = `${host}:${DOCKER_REMOTE_DIR}/`;
    this.ensureSuccess(
      this.runSync('scp', [...files, target], { remote: true }),
      'Remote Docker asset copy',
      {
        host,
      }
    );
  }

  private runCompose(
    args: string[],
    options: DockerCommandTarget,
    env: Record<string, string> = {},
    timeoutMs?: number
  ): DockerCommandResult {
    if (!options.host) {
      const prefix = this.resolveLocalComposePrefix();
      const command = prefix[0];
      const composeArgs = [...prefix.slice(1), '-f', this.assets.composeFile, ...args];
      return this.runSync(command, composeArgs, {
        cwd: path.dirname(this.assets.composeFile),
        env: { ...process.env, ...env },
        remote: false,
        timeoutMs,
      });
    }

    const envExports = Object.entries(env)
      .map(([key, value]) => `export ${key}=${quotePosix(value)}`)
      .join(' && ');
    const composeArgs = ['-f', path.basename(this.assets.composeFile), ...args];
    const remoteCommand = `cd ${DOCKER_REMOTE_DIR}${envExports ? ` && ${envExports}` : ''} && ${buildRemoteComposeCommand(composeArgs)}`;
    return this.runSync('ssh', [options.host, remoteCommand], { remote: true, timeoutMs });
  }

  private runDocker(
    args: string[],
    options: DockerCommandTarget,
    timeoutMs?: number
  ): DockerCommandResult {
    if (!options.host) {
      return this.runSync('docker', args, { timeoutMs });
    }
    return this.runSync('ssh', [options.host, buildRemoteDockerCommand(args)], {
      remote: true,
      timeoutMs,
    });
  }

  private async runDockerStreaming(args: string[], options: DockerCommandTarget): Promise<void> {
    if (!options.host) {
      await this.runStreaming('docker', args);
      return;
    }
    await this.runStreaming('ssh', [options.host, buildRemoteDockerCommand(args)]);
  }

  private getInstalledCcsVersion(): string {
    return this.deps.getInstalledCcsVersion?.() ?? getInstalledCcsVersion();
  }

  private resolveLocalComposePrefix(): string[] {
    return this.deps.resolveLocalComposePrefix?.() ?? resolveLocalComposePrefix();
  }

  private runSync(
    command: string,
    args: string[],
    options: DockerSyncRunOptions = {}
  ): DockerCommandResult {
    const normalizedOptions = applyDefaultTimeouts(options);
    return (
      this.deps.runSync?.(command, args, normalizedOptions) ??
      runSync(command, args, normalizedOptions)
    );
  }

  private async runStreaming(command: string, args: string[]): Promise<void> {
    await (this.deps.runStreaming?.(command, args) ?? runStreaming(command, args));
  }

  private ensureSuccess(
    result: DockerCommandResult,
    label: string,
    options: DockerCommandTarget
  ): void {
    if (result.exitCode === 0) {
      return;
    }

    const detail = (result.stderr || result.stdout).trim();
    const hint =
      options.host && /No such file|no configuration file|can't cd|not found/i.test(detail)
        ? `\nRun \`ccs docker up --host ${options.host}\` first.`
        : '';
    throw new Error(`${label} failed.${detail ? `\n${detail}` : ''}${hint}`);
  }
}
