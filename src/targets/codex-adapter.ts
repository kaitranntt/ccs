import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import type { ProfileType } from '../types/profile';
import { runCleanup } from '../errors';
import { expandPath } from '../utils/helpers';
import { wireChildProcessSignals } from '../utils/signal-forwarder';
import {
  escapeShellArg,
  getWindowsEscapedCommandShell,
  stripBrowserEnv,
  stripAnthropicEnv,
  stripCodexSessionEnv,
} from '../utils/shell-executor';
import type {
  TargetAdapter,
  TargetBinaryInfo,
  TargetCredentials,
  TargetType,
} from './target-adapter';
import {
  codexBinarySupportsConfigOverrides,
  detectCodexCli,
  getCodexBinaryInfo,
  readCodexVersion,
} from './codex-detector';
import { createLogger } from '../services/logging';
import { getEffectiveApiKey } from '../cliproxy/auth/auth-token-manager';
import { resolveLifecyclePort } from '../cliproxy/config/port-manager';
import {
  CCSXP_CLIPROXY_SHORTCUT_ENV,
  CODEX_CLIPROXY_PROVIDER_ENV_KEY,
  ensureCodexCliproxyProviderConfig,
  isCcsxpCliproxyShortcut,
} from './codex-cliproxy-provider-config';

const adapterLogger = createLogger('targets:codex');

const CODEX_RUNTIME_PROVIDER_ID = 'ccs_runtime';
const CODEX_RUNTIME_ENV_KEY = 'CCS_CODEX_API_KEY';
const CODEX_REASONING_LEVELS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);
const CODEX_INFO_FLAGS = new Set(['--help', '-h', '--version', '-v']);

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function buildConfigOverrideArgs(overrides: string[]): string[] {
  return overrides.flatMap((override) => ['-c', override]);
}

function buildConfigOverrideSupportError(binaryInfo?: TargetBinaryInfo): Error {
  const versionSummary = binaryInfo?.version ? ` (${binaryInfo.version})` : '';
  return new Error(
    `Codex CLI${versionSummary} does not advertise --config overrides. Upgrade Codex before using CCS-backed Codex profiles or runtime reasoning overrides.`
  );
}

function hydrateCodexBinaryVersion(binaryInfo?: TargetBinaryInfo): TargetBinaryInfo | undefined {
  if (!binaryInfo || binaryInfo.version || !binaryInfo.path) {
    return binaryInfo;
  }

  return {
    ...binaryInfo,
    version: readCodexVersion(binaryInfo.path),
  };
}

function findDisallowedCodexManagedFlags(args: string[]): string[] {
  const disallowed = new Set<string>();

  for (const arg of args) {
    if (arg === '-c' || arg === '--config' || arg.startsWith('--config=')) {
      disallowed.add('--config/-c');
      continue;
    }
    if (arg === '-p' || arg === '--profile' || arg.startsWith('--profile=')) {
      disallowed.add('--profile/-p');
      continue;
    }
    if (arg === '--oss') {
      disallowed.add('--oss');
      continue;
    }
    if (arg === '--local-provider' || arg.startsWith('--local-provider=')) {
      disallowed.add('--local-provider');
    }
  }

  return [...disallowed];
}

function normalizeCodexReasoningOverride(value: string | number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && CODEX_REASONING_LEVELS.has(value)) {
    return value;
  }
  throw new Error(
    'Codex target supports reasoning levels only: minimal, low, medium, high, xhigh.'
  );
}

function isInformationalCodexInvocation(args: string[]): boolean {
  if (args.length === 1) {
    return CODEX_INFO_FLAGS.has(args[0] || '');
  }

  if (args.length === 2) {
    return CODEX_INFO_FLAGS.has(args[1] || '');
  }

  return false;
}

function normalizeExplicitCodexHomeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const rawCodexHome = env.CODEX_HOME;
  if (rawCodexHome === undefined) {
    return env;
  }

  const trimmedCodexHome = rawCodexHome.trim();
  if (!trimmedCodexHome) {
    const nextEnv = { ...env };
    delete nextEnv.CODEX_HOME;
    return nextEnv;
  }

  const normalizedCodexHome = expandPath(trimmedCodexHome);
  if (normalizedCodexHome === rawCodexHome) {
    return env;
  }

  return {
    ...env,
    CODEX_HOME: normalizedCodexHome,
  };
}

function prepareExplicitCodexHome(
  env: NodeJS.ProcessEnv,
  args: string[]
): { env: NodeJS.ProcessEnv; error?: string } {
  const normalizedEnv = normalizeExplicitCodexHomeEnv(env);
  const codexHome = normalizedEnv.CODEX_HOME;
  if (!codexHome) {
    return { env: normalizedEnv };
  }

  if (isInformationalCodexInvocation(args)) {
    return { env: normalizedEnv };
  }

  try {
    fs.mkdirSync(codexHome, { recursive: true });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'EEXIST') {
      return {
        env: normalizedEnv,
        error: `[X] Unable to initialize CODEX_HOME (${error.code || 'unknown'}): ${codexHome}`,
      };
    }
  }

  try {
    if (!fs.statSync(codexHome).isDirectory()) {
      return {
        env: normalizedEnv,
        error: `[X] CODEX_HOME path is not a directory: ${codexHome}`,
      };
    }
    return { env: normalizedEnv };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    return {
      env: normalizedEnv,
      error: `[X] Unable to access CODEX_HOME (${error.code || 'unknown'}): ${codexHome}`,
    };
  }
}

export class CodexAdapter implements TargetAdapter {
  readonly type: TargetType = 'codex';
  readonly displayName = 'Codex CLI';
  private ccsxpCliproxyEnvKey = CODEX_CLIPROXY_PROVIDER_ENV_KEY;

  detectBinary(): TargetBinaryInfo | null {
    return getCodexBinaryInfo({ includeVersion: false, includeFeatures: false });
  }

  async prepareCredentials(_creds: TargetCredentials): Promise<void> {
    if (!isCcsxpCliproxyShortcut()) {
      return;
    }

    try {
      const providerRepair = await ensureCodexCliproxyProviderConfig(resolveLifecyclePort());
      this.ccsxpCliproxyEnvKey = providerRepair.envKey;
    } catch (error) {
      throw new Error(
        `ccsxp could not repair the native Codex cliproxy provider: ${(error as Error).message}`
      );
    }
  }

  buildArgs(
    _profile: string,
    userArgs: string[],
    options?: {
      creds?: TargetCredentials;
      profileType?: ProfileType;
      binaryInfo?: TargetBinaryInfo;
    }
  ): string[] {
    const profileType = options?.profileType || 'default';
    const creds = options?.creds;
    const reasoningOverride = normalizeCodexReasoningOverride(creds?.reasoningOverride);
    const runtimeConfigOverrides = creds?.runtimeConfigOverrides ?? [];

    if (profileType === 'default') {
      const overrides = [...runtimeConfigOverrides];
      if (reasoningOverride) {
        overrides.push(`model_reasoning_effort=${formatTomlString(reasoningOverride)}`);
      }
      if (overrides.length === 0) {
        return userArgs;
      }
      if (!codexBinarySupportsConfigOverrides(options?.binaryInfo)) {
        if (reasoningOverride) {
          throw buildConfigOverrideSupportError(hydrateCodexBinaryVersion(options?.binaryInfo));
        }
        return userArgs;
      }
      return [...buildConfigOverrideArgs(overrides), ...userArgs];
    }

    if (!codexBinarySupportsConfigOverrides(options?.binaryInfo)) {
      throw buildConfigOverrideSupportError(hydrateCodexBinaryVersion(options?.binaryInfo));
    }

    if (!creds?.baseUrl?.trim() || !creds.apiKey?.trim()) {
      throw new Error(
        'Codex target requires base URL and API key for CCS-backed profile launches.'
      );
    }

    const disallowedFlags = findDisallowedCodexManagedFlags(userArgs);
    if (disallowedFlags.length > 0) {
      throw new Error(
        `Codex target does not allow ${disallowedFlags.join(', ')} when CCS manages the runtime provider. Remove native Codex provider selection flags and retry.`
      );
    }

    const overrides = [
      `model_provider=${formatTomlString(CODEX_RUNTIME_PROVIDER_ID)}`,
      `model_providers.${CODEX_RUNTIME_PROVIDER_ID}.name=${formatTomlString('CCS Runtime')}`,
      `model_providers.${CODEX_RUNTIME_PROVIDER_ID}.base_url=${formatTomlString(creds.baseUrl)}`,
      `model_providers.${CODEX_RUNTIME_PROVIDER_ID}.env_key=${formatTomlString(CODEX_RUNTIME_ENV_KEY)}`,
      `model_providers.${CODEX_RUNTIME_PROVIDER_ID}.wire_api=${formatTomlString('responses')}`,
    ];

    if (creds.model?.trim()) {
      overrides.push(`model=${formatTomlString(creds.model)}`);
    }

    overrides.push(...runtimeConfigOverrides);

    if (reasoningOverride) {
      overrides.push(`model_reasoning_effort=${formatTomlString(reasoningOverride)}`);
    }

    return [...buildConfigOverrideArgs(overrides), ...userArgs];
  }

  buildEnv(creds: TargetCredentials, profileType: ProfileType): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...stripBrowserEnv(stripCodexSessionEnv(stripAnthropicEnv(process.env))),
    };
    delete env[CCSXP_CLIPROXY_SHORTCUT_ENV];
    delete env[CODEX_RUNTIME_ENV_KEY];
    if (profileType === 'default' && isCcsxpCliproxyShortcut()) {
      env[this.ccsxpCliproxyEnvKey || CODEX_CLIPROXY_PROVIDER_ENV_KEY] = getEffectiveApiKey();
    }
    if (profileType !== 'default') {
      if (!creds.apiKey?.trim()) {
        throw new Error('Codex target requires an API key for CCS-backed profile launches.');
      }
      env[CODEX_RUNTIME_ENV_KEY] = creds.apiKey;
    }
    return env;
  }

  exec(
    args: string[],
    env: NodeJS.ProcessEnv,
    options?: { cwd?: string; binaryInfo?: TargetBinaryInfo }
  ): void {
    const exitWithCleanup = (code: number): never => {
      try {
        runCleanup();
      } catch {
        // Cleanup is best-effort on launch errors.
      }
      process.exit(code);
    };

    const codexPath = options?.binaryInfo?.path || detectCodexCli();
    if (!codexPath) {
      console.error('[X] Codex CLI not found. Install a recent @openai/codex build first.');
      return exitWithCleanup(1);
    }

    try {
      const stat = fs.statSync(codexPath);
      if (!stat.isFile()) {
        console.error(`[X] Codex CLI path is not a file: ${codexPath}`);
        return exitWithCleanup(1);
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      console.error(
        `[X] Codex CLI path is not accessible (${error.code || 'unknown'}): ${codexPath}`
      );
      return exitWithCleanup(1);
    }

    const codexHomePreparation = prepareExplicitCodexHome(env, args);
    if (codexHomePreparation.error) {
      console.error(codexHomePreparation.error);
      return exitWithCleanup(1);
    }
    const launchEnv = codexHomePreparation.env;

    const isWindows = process.platform === 'win32';
    const isPowerShellScript = isWindows && /\.ps1$/i.test(codexPath);
    const needsShell = isWindows && /\.(cmd|bat)$/i.test(codexPath);

    const spawnStartedAt = Date.now();
    adapterLogger.stage('dispatch', 'target.spawn', 'Spawning Codex CLI child process', {
      target: 'codex',
      codexPath,
      argCount: args.length,
    });

    let child: ChildProcess;
    if (isPowerShellScript) {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', codexPath, ...args],
        { stdio: 'inherit', windowsHide: true, env: launchEnv }
      );
    } else if (needsShell) {
      const cmdString = [codexPath, ...args].map(escapeShellArg).join(' ');
      child = spawn(cmdString, {
        stdio: 'inherit',
        windowsHide: true,
        shell: getWindowsEscapedCommandShell(),
        env: launchEnv,
      });
    } else {
      child = spawn(codexPath, args, { stdio: 'inherit', windowsHide: true, env: launchEnv });
    }

    child.on('exit', (code, signal) => {
      adapterLogger.stage(
        'respond',
        'target.exit',
        'Codex CLI child process exited',
        { target: 'codex', exitCode: code, signal },
        { latencyMs: Date.now() - spawnStartedAt }
      );
    });

    wireChildProcessSignals(child, (err: NodeJS.ErrnoException) => {
      if (err.code === 'EACCES') {
        console.error(`[X] Codex CLI is not executable: ${codexPath}`);
        console.error('    Check file permissions and executable bit.');
      } else if (err.code === 'ENOENT') {
        if (isPowerShellScript) {
          console.error('[X] PowerShell executable not found (required for .ps1 wrapper launch).');
        } else if (needsShell) {
          console.error('[X] Windows command shell not found for Codex wrapper launch.');
        } else {
          console.error(`[X] Codex CLI not found: ${codexPath}`);
        }
      } else {
        console.error(`[X] Failed to start Codex CLI (${codexPath}): ${err.message}`);
      }
      return exitWithCleanup(1);
    });
  }

  supportsProfileType(profileType: ProfileType): boolean {
    // Bridge-backed settings profiles need additional compatibility context that the
    // adapter contract does not receive, so keep the adapter-level claim conservative.
    return profileType === 'default' || profileType === 'cliproxy';
  }
}
