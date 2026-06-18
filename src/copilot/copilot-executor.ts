/**
 * Copilot Executor
 *
 * Main execution flow for running Claude Code with copilot-api proxy.
 * Uses local installation from ~/.ccs/copilot/ (managed by copilot-package-manager).
 */

import { spawn } from 'child_process';
import { CopilotConfig } from '../config/unified-config-types';

import { ensureCliproxyService } from '../cliproxy';
import { getEffectiveApiKey } from '../cliproxy/auth/auth-token-manager';
import { resolveLifecyclePort } from '../cliproxy/config/port-manager';
import { checkAuthStatus, isCopilotApiInstalled } from './copilot-auth';
import { isDaemonRunning, startDaemon } from './copilot-daemon';
import { ensureCopilotApi } from './copilot-package-manager';
import { normalizeCopilotConfigWithWarnings } from './copilot-model-normalizer';
import { CopilotStatus } from './types';
import { fail, info, ok, warn } from '../utils/ui';
import {
  getWebSearchHookEnv,
  appendThirdPartyWebSearchToolArgs,
  createWebSearchTraceContext,
  syncWebSearchMcpToConfigDir,
} from '../utils/websearch-manager';
import {
  appendThirdPartyImageAnalysisToolArgs,
  ensureImageAnalysisMcpOrThrow,
  syncImageAnalysisMcpToConfigDir,
} from '../utils/image-analysis';
import {
  applyImageAnalysisRuntimeOverrides,
  getImageAnalysisHookEnv,
  resolveImageAnalysisRuntimeConnection,
  resolveImageAnalysisRuntimeStatus,
} from '../utils/hooks';
import { stripClaudeCodeEnv } from '../utils/shell-executor';
import { createLogger, forwardRequestIdEnv } from '../services/logging';
import { getGlobalEnvConfig } from '../config/config-loader-facade';

const logger = createLogger('copilot:executor');

interface CopilotImageAnalysisDeps {
  ensureCliproxyService: typeof ensureCliproxyService;
  getImageAnalysisHookEnv: typeof getImageAnalysisHookEnv;
  resolveImageAnalysisRuntimeStatus: typeof resolveImageAnalysisRuntimeStatus;
  getLocalRuntimeApiKey: typeof getEffectiveApiKey;
}

interface CopilotImageAnalysisResolution {
  env: Record<string, string>;
  warning: string | null;
}

/**
 * Get full copilot status (auth + daemon).
 */
export async function getCopilotStatus(config: CopilotConfig): Promise<CopilotStatus> {
  const normalizedConfig = normalizeCopilotConfigWithWarnings(config).config;
  const [auth, daemonRunning] = await Promise.all([
    checkAuthStatus(),
    isDaemonRunning(normalizedConfig.port),
  ]);

  return {
    auth,
    daemon: {
      running: daemonRunning,
      port: normalizedConfig.port,
    },
  };
}

/**
 * Generate environment variables for Claude Code to use copilot-api.
 * Uses model mapping for opus/sonnet/haiku tiers if configured.
 */
export function generateCopilotEnv(
  config: CopilotConfig,
  claudeConfigDir?: string
): Record<string, string> {
  const normalizedConfig = normalizeCopilotConfigWithWarnings(config).config;

  // Use mapped models if configured, otherwise fall back to default model
  const opusModel = normalizedConfig.opus_model || normalizedConfig.model;
  const sonnetModel = normalizedConfig.sonnet_model || normalizedConfig.model;
  const haikuModel = normalizedConfig.haiku_model || normalizedConfig.model;

  // Use 127.0.0.1 instead of localhost for more reliable local connections
  // (bypasses DNS resolution and potential IPv6 issues)
  return {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${normalizedConfig.port}`,
    ANTHROPIC_AUTH_TOKEN: 'dummy', // copilot-api handles auth internally
    ANTHROPIC_MODEL: normalizedConfig.model,
    // Model tier mapping - allows different models for opus/sonnet/haiku
    ANTHROPIC_DEFAULT_OPUS_MODEL: opusModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: sonnetModel,
    ANTHROPIC_SMALL_FAST_MODEL: haikuModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: haikuModel,
    // Disable non-essential traffic to avoid rate limiting
    DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    ...(claudeConfigDir ? { CLAUDE_CONFIG_DIR: claudeConfigDir } : {}),
  };
}

export async function resolveCopilotImageAnalysisEnv(
  verbose = false,
  deps: Partial<CopilotImageAnalysisDeps> = {}
): Promise<CopilotImageAnalysisResolution> {
  const resolvedDeps: CopilotImageAnalysisDeps = {
    ensureCliproxyService,
    getImageAnalysisHookEnv,
    resolveImageAnalysisRuntimeStatus,
    getLocalRuntimeApiKey: getEffectiveApiKey,
    ...deps,
  };

  const env = resolvedDeps.getImageAnalysisHookEnv({
    profileName: 'copilot',
    profileType: 'copilot',
  });
  const provider = env['CCS_CURRENT_PROVIDER'];
  if (env['CCS_IMAGE_ANALYSIS_SKIP'] === '1' || !provider) {
    return { env, warning: null };
  }

  const status = await resolvedDeps.resolveImageAnalysisRuntimeStatus({
    profileName: 'copilot',
    profileType: 'copilot',
  });

  if (status.effectiveRuntimeMode === 'native-read') {
    return {
      env: {
        ...env,
        CCS_CURRENT_PROVIDER: '',
        CCS_IMAGE_ANALYSIS_SKIP: '1',
      },
      warning: `${status.effectiveRuntimeReason || `Image analysis via ${provider} is unavailable.`} This session will use native Read.`,
    };
  }

  if (status.proxyReadiness === 'stopped') {
    const ensureServiceResult = await resolvedDeps.ensureCliproxyService(
      resolveLifecyclePort(),
      verbose
    );
    if (!ensureServiceResult.started) {
      return {
        env: {
          ...env,
          CCS_CURRENT_PROVIDER: '',
          CCS_IMAGE_ANALYSIS_SKIP: '1',
        },
        warning: `Image analysis via ${provider} is unavailable because CCS could not start the local CLIProxy service. This session will use native Read.`,
      };
    }
  }

  const runtimeConnection = resolveImageAnalysisRuntimeConnection();
  return {
    env: applyImageAnalysisRuntimeOverrides(env, {
      backendId: status.backendId,
      model: status.model,
      runtimePath: status.runtimePath,
      baseUrl: runtimeConnection.baseUrl,
      apiKey: runtimeConnection.proxyTarget.isRemote
        ? runtimeConnection.apiKey
        : resolvedDeps.getLocalRuntimeApiKey(),
      allowSelfSigned: runtimeConnection.allowSelfSigned,
    }),
    warning: null,
  };
}

/**
 * Execute Claude Code with copilot-api proxy.
 *
 * @param config Copilot configuration
 * @param claudeArgs Arguments to pass to Claude CLI
 * @returns Exit code
 */
export async function executeCopilotProfile(
  config: CopilotConfig,
  claudeArgs: string[],
  claudeConfigDir?: string,
  claudeCliPath: string = 'claude'
): Promise<number> {
  const { config: normalizedConfig, warnings } = normalizeCopilotConfigWithWarnings(config);

  logger.stage('intake', 'copilot.execute.start', 'Starting Copilot profile execution', {
    provider: 'copilot',
    model: normalizedConfig.model,
    port: normalizedConfig.port,
  });

  if (warnings.length > 0) {
    warnings.forEach(({ message }) => console.log(warn(message)));
    console.log(
      warn('Run `ccs config` and save the Copilot section to persist these replacements.')
    );
    console.log('');
  }

  // Ensure copilot-api is installed (auto-install if missing, auto-update if outdated)
  try {
    await ensureCopilotApi();
  } catch (error) {
    process.stderr.write(String(fail('Failed to install copilot-api.')) + '\n');
    process.stderr.write('\n');
    process.stderr.write(String(`Error: ${(error as Error).message}`) + '\n');
    process.stderr.write('\n');
    process.stderr.write('Try installing manually:\n');
    process.stderr.write('  npm install -g copilot-api\n');
    return 1;
  }

  // Check if copilot-api is installed (should be after ensureCopilotApi)
  if (!isCopilotApiInstalled()) {
    process.stderr.write(String(fail('copilot-api is not installed.')) + '\n');
    process.stderr.write('\n');
    process.stderr.write('Install/repair by running: ccs copilot start\n');
    return 1;
  }

  // Check authentication
  const authStatus = await checkAuthStatus();
  logger.stage('auth', 'copilot.execute.auth_check', 'Checked Copilot auth status', {
    provider: 'copilot',
    authenticated: authStatus.authenticated,
  });
  if (!authStatus.authenticated) {
    process.stderr.write(String(fail('Not authenticated with GitHub.')) + '\n');
    process.stderr.write('\n');
    process.stderr.write('Run: npx copilot-api auth\n');
    process.stderr.write('Or:  ccs copilot auth\n');
    return 1;
  }

  // Check if daemon is running or needs to be started
  let daemonRunning = await isDaemonRunning(normalizedConfig.port);

  if (!daemonRunning) {
    if (normalizedConfig.auto_start) {
      console.log(info('Starting copilot-api daemon...'));
      const result = await startDaemon(normalizedConfig);
      if (!result.success) {
        process.stderr.write(String(fail(`Failed to start daemon: ${result.error}`)) + '\n');
        return 1;
      }
      console.log(ok(`Daemon started on port ${normalizedConfig.port}`));
      daemonRunning = true;
    } else {
      process.stderr.write(String(fail('copilot-api daemon is not running.')) + '\n');
      process.stderr.write('\n');
      process.stderr.write('Start the daemon:\n');
      process.stderr.write('  ccs copilot start\n');
      process.stderr.write('Fallback manual command:\n');
      process.stderr.write(`  npx copilot-api start --port ${normalizedConfig.port}\n`);
      process.stderr.write('\n');
      process.stderr.write('Or enable auto_start in config:\n');
      process.stderr.write('  ccs config  (then enable auto_start in Copilot section)\n');
      return 1;
    }
  }

  // Generate environment for Claude
  const copilotEnv = generateCopilotEnv(normalizedConfig, claudeConfigDir);

  // Get global env vars (DISABLE_TELEMETRY, etc.) for third-party profiles
  const globalEnvConfig = getGlobalEnvConfig();
  const globalEnv = globalEnvConfig.enabled ? globalEnvConfig.env : {};
  const imageAnalysisMcpReady = ensureImageAnalysisMcpOrThrow();
  syncWebSearchMcpToConfigDir(claudeConfigDir);
  syncImageAnalysisMcpToConfigDir(claudeConfigDir);

  // Merge with current environment (global env first, copilot overrides, then hook env vars)
  const webSearchEnv = getWebSearchHookEnv();
  const imageAnalysisResolution = await resolveCopilotImageAnalysisEnv();
  const imageAnalysisProvisioningFailed =
    !imageAnalysisMcpReady && imageAnalysisResolution.env.CCS_IMAGE_ANALYSIS_ENABLED === '1';
  const imageAnalysisWarning = imageAnalysisProvisioningFailed
    ? 'ImageAnalysis MCP provisioning failed. This session will use compatibility fallback when available.'
    : imageAnalysisResolution.warning;
  const imageAnalysisEnv = {
    ...imageAnalysisResolution.env,
    CCS_IMAGE_ANALYSIS_SKIP_HOOK: imageAnalysisMcpReady ? '1' : '0',
  };
  const env = stripClaudeCodeEnv({
    ...process.env,
    ...globalEnv,
    ...copilotEnv,
    ...webSearchEnv,
    ...imageAnalysisEnv,
    CCS_PROFILE_TYPE: 'copilot',
  });

  console.log(info(`Using GitHub Copilot proxy (model: ${normalizedConfig.model})`));
  if (imageAnalysisWarning) {
    console.log(info(imageAnalysisWarning));
  }
  console.log('');

  // Spawn Claude CLI
  const spawnStartedAt = Date.now();
  return new Promise((resolve) => {
    const imageAnalysisArgs = imageAnalysisMcpReady
      ? appendThirdPartyImageAnalysisToolArgs(claudeArgs)
      : claudeArgs;
    const launchArgs = appendThirdPartyWebSearchToolArgs(imageAnalysisArgs);
    const traceEnv = createWebSearchTraceContext({
      launcher: 'copilot.executor',
      args: launchArgs,
      profile: 'copilot',
      profileType: 'copilot',
      claudeConfigDir,
    });

    logger.stage('dispatch', 'copilot.execute.spawn', 'Spawning Claude via Copilot proxy', {
      provider: 'copilot',
      argCount: launchArgs.length,
    });

    const proc = spawn(claudeCliPath, launchArgs, {
      stdio: 'inherit',
      env: { ...env, ...traceEnv, ...forwardRequestIdEnv() },
      shell: process.platform === 'win32',
    });

    proc.on('close', (code) => {
      logger.stage(
        'respond',
        'copilot.execute.exit',
        'Claude process exited (Copilot)',
        { provider: 'copilot', exitCode: code },
        { latencyMs: Date.now() - spawnStartedAt }
      );
      resolve(code ?? 0);
    });

    proc.on('error', (err) => {
      logger.stage(
        'cleanup',
        'copilot.execute.error',
        'Failed to spawn Claude (Copilot)',
        { provider: 'copilot' },
        {
          level: 'error',
          latencyMs: Date.now() - spawnStartedAt,
          error: { name: err.name, message: err.message },
        }
      );
      process.stderr.write(String(fail(`Failed to start Claude: ${err.message}`)) + '\n');
      resolve(1);
    });
  });
}
