import { spawn } from 'child_process';

import type { CursorConfig } from '../config/unified-config-types';
import { getGlobalEnvConfig } from '../config/unified-config-loader';
import { ensureCliproxyService } from '../cliproxy';
import { CLIPROXY_DEFAULT_PORT } from '../cliproxy/config/port-manager';
import { fail, info, ok } from '../utils/ui';
import {
  appendThirdPartyWebSearchToolArgs,
  createWebSearchTraceContext,
  getWebSearchHookEnv,
  syncWebSearchMcpToConfigDir,
} from '../utils/websearch-manager';
import { getImageAnalysisHookEnv, resolveImageAnalysisRuntimeStatus } from '../utils/hooks';
import { stripClaudeCodeEnv } from '../utils/shell-executor';
import { checkAuthStatus } from './cursor-auth';
import { isDaemonRunning, startDaemon } from './cursor-daemon';

interface CursorImageAnalysisResolution {
  env: Record<string, string>;
  warning: string | null;
}

export function generateCursorEnv(
  config: CursorConfig,
  claudeConfigDir?: string
): Record<string, string> {
  const opusModel = config.opus_model || config.model;
  const sonnetModel = config.sonnet_model || config.model;
  const haikuModel = config.haiku_model || config.model;

  return {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${config.port}`,
    ANTHROPIC_AUTH_TOKEN: 'cursor-managed',
    ANTHROPIC_MODEL: config.model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: opusModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: sonnetModel,
    ANTHROPIC_SMALL_FAST_MODEL: haikuModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: haikuModel,
    DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    ...(claudeConfigDir ? { CLAUDE_CONFIG_DIR: claudeConfigDir } : {}),
  };
}

export async function resolveCursorImageAnalysisEnv(
  verbose = false
): Promise<CursorImageAnalysisResolution> {
  const env = getImageAnalysisHookEnv({
    profileName: 'cursor',
    profileType: 'cursor',
  });
  const provider = env['CCS_CURRENT_PROVIDER'];
  if (env['CCS_IMAGE_ANALYSIS_SKIP'] === '1' || !provider) {
    return { env, warning: null };
  }

  const status = await resolveImageAnalysisRuntimeStatus({
    profileName: 'cursor',
    profileType: 'cursor',
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
    const ensureServiceResult = await ensureCliproxyService(CLIPROXY_DEFAULT_PORT, verbose);
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

  return { env, warning: null };
}

export async function executeCursorProfile(
  config: CursorConfig,
  claudeArgs: string[],
  claudeConfigDir?: string,
  claudeCliPath = 'claude'
): Promise<number> {
  if (!config.enabled) {
    console.error(fail('Cursor integration is not enabled.'));
    console.error('');
    console.error('Enable it first: ccs cursor enable');
    return 1;
  }

  const authStatus = checkAuthStatus();
  if (!authStatus.authenticated) {
    console.error(fail('Cursor credentials not found.'));
    console.error('');
    console.error('Authenticate first: ccs cursor auth');
    return 1;
  }
  if (authStatus.expired) {
    console.error(fail('Cursor credentials have expired.'));
    console.error('');
    console.error('Refresh them with: ccs cursor auth');
    return 1;
  }

  let daemonRunning = await isDaemonRunning(config.port);
  if (!daemonRunning) {
    if (config.auto_start) {
      console.log(info('Starting cursor daemon...'));
      const result = await startDaemon({
        port: config.port,
        ghost_mode: config.ghost_mode,
      });
      if (!result.success) {
        console.error(fail(`Failed to start cursor daemon: ${result.error}`));
        return 1;
      }
      console.log(ok(`Daemon started on port ${config.port}`));
      daemonRunning = true;
    } else {
      console.error(fail('Cursor daemon is not running.'));
      console.error('');
      console.error('Start the daemon:');
      console.error('  ccs cursor start');
      console.error('Or enable auto_start in the Cursor config section.');
      return 1;
    }
  }

  const cursorEnv = generateCursorEnv(config, claudeConfigDir);
  const globalEnvConfig = getGlobalEnvConfig();
  const globalEnv = globalEnvConfig.enabled ? globalEnvConfig.env : {};
  const webSearchEnv = getWebSearchHookEnv();
  const { env: imageAnalysisEnv, warning: imageAnalysisWarning } =
    await resolveCursorImageAnalysisEnv();
  const env = stripClaudeCodeEnv({
    ...process.env,
    ...globalEnv,
    ...cursorEnv,
    ...webSearchEnv,
    ...imageAnalysisEnv,
    CCS_PROFILE_TYPE: 'cursor',
  });

  console.log(info(`Using Cursor proxy (model: ${config.model})`));
  if (imageAnalysisWarning) {
    console.log(info(imageAnalysisWarning));
  }
  console.log('');

  syncWebSearchMcpToConfigDir(claudeConfigDir);

  return new Promise((resolve) => {
    const launchArgs = appendThirdPartyWebSearchToolArgs(claudeArgs);
    const traceEnv = createWebSearchTraceContext({
      launcher: 'cursor.executor',
      args: launchArgs,
      profile: 'cursor',
      profileType: 'cursor',
      claudeConfigDir,
    });

    const proc = spawn(claudeCliPath, launchArgs, {
      stdio: 'inherit',
      env: { ...env, ...traceEnv },
      shell: process.platform === 'win32',
    });

    proc.on('close', (code) => {
      resolve(code ?? 0);
    });

    proc.on('error', (err) => {
      console.error(fail(`Failed to start Claude: ${err.message}`));
      resolve(1);
    });
  });
}
