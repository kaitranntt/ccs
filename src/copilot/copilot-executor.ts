/**
 * Copilot Executor
 *
 * Main execution flow for running Claude Code with copilot-api proxy.
 * Uses local installation from ~/.ccs/copilot/ (managed by copilot-package-manager).
 */

import { spawn } from 'child_process';
import { CopilotConfig } from '../config/unified-config-types';
import { getGlobalEnvConfig } from '../config/unified-config-loader';
import { checkAuthStatus, isCopilotApiInstalled } from './copilot-auth';
import { isDaemonRunning, startDaemon } from './copilot-daemon';
import { ensureCopilotApi } from './copilot-package-manager';
import { CopilotStatus } from './types';
import { fail, info, ok } from '../utils/ui';
import { getWebSearchHookEnv } from '../utils/websearch-manager';
import { getImageAnalysisHookEnv } from '../utils/hooks';

/**
 * Get full copilot status (auth + daemon).
 */
export async function getCopilotStatus(config: CopilotConfig): Promise<CopilotStatus> {
  const [auth, daemonRunning] = await Promise.all([
    checkAuthStatus(),
    isDaemonRunning(config.port),
  ]);

  return {
    auth,
    daemon: {
      running: daemonRunning,
      port: config.port,
    },
  };
}

/**
 * Generate environment variables for Claude Code to use copilot-api.
 * Uses model mapping for opus/sonnet/haiku tiers if configured.
 */
export function generateCopilotEnv(config: CopilotConfig): Record<string, string> {
  // Use mapped models if configured, otherwise fall back to default model
  const opusModel = config.opus_model || config.model;
  const sonnetModel = config.sonnet_model || config.model;
  const haikuModel = config.haiku_model || config.model;

  // Use 127.0.0.1 instead of localhost for more reliable local connections
  // (bypasses DNS resolution and potential IPv6 issues)
  return {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${config.port}`,
    ANTHROPIC_AUTH_TOKEN: 'dummy', // copilot-api handles auth internally
    ANTHROPIC_MODEL: config.model,
    // Model tier mapping - allows different models for opus/sonnet/haiku
    ANTHROPIC_DEFAULT_OPUS_MODEL: opusModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: sonnetModel,
    ANTHROPIC_SMALL_FAST_MODEL: haikuModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: haikuModel,
    // Disable non-essential traffic to avoid rate limiting
    DISABLE_NON_ESSENTIAL_MODEL_CALLS: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
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
  claudeArgs: string[]
): Promise<number> {
  // Ensure copilot-api is installed (auto-install if missing, auto-update if outdated)
  try {
    await ensureCopilotApi();
  } catch (error) {
    console.error(fail('Failed to install copilot-api.'));
    console.error('');
    console.error(`Error: ${(error as Error).message}`);
    console.error('');
    console.error('Try installing manually:');
    console.error('  npm install -g copilot-api');
    return 1;
  }

  // Check if copilot-api is installed (should be after ensureCopilotApi)
  if (!isCopilotApiInstalled()) {
    console.error(fail('copilot-api is not installed.'));
    console.error('');
    console.error('Install with: ccs copilot --install');
    return 1;
  }

  // Check authentication
  const authStatus = await checkAuthStatus();
  if (!authStatus.authenticated) {
    console.error(fail('Not authenticated with GitHub.'));
    console.error('');
    console.error('Run: npx copilot-api auth');
    console.error('Or:  ccs copilot auth');
    return 1;
  }

  // Check if daemon is running or needs to be started
  let daemonRunning = await isDaemonRunning(config.port);

  if (!daemonRunning) {
    if (config.auto_start) {
      console.log(info('Starting copilot-api daemon...'));
      const result = await startDaemon(config);
      if (!result.success) {
        console.error(fail(`Failed to start daemon: ${result.error}`));
        return 1;
      }
      console.log(ok(`Daemon started on port ${config.port}`));
      daemonRunning = true;
    } else {
      console.error(fail('copilot-api daemon is not running.'));
      console.error('');
      console.error('Start the daemon manually:');
      console.error(`  npx copilot-api start --port ${config.port}`);
      console.error('');
      console.error('Or enable auto_start in config:');
      console.error('  ccs config  (then enable auto_start in Copilot section)');
      return 1;
    }
  }

  // Generate environment for Claude
  const copilotEnv = generateCopilotEnv(config);

  // Get global env vars (DISABLE_TELEMETRY, etc.) for third-party profiles
  const globalEnvConfig = getGlobalEnvConfig();
  const globalEnv = globalEnvConfig.enabled ? globalEnvConfig.env : {};

  // Merge with current environment (global env first, copilot overrides, then hook env vars)
  const webSearchEnv = getWebSearchHookEnv();
  const imageAnalysisEnv = getImageAnalysisHookEnv('copilot');
  const env = {
    ...process.env,
    ...globalEnv,
    ...copilotEnv,
    ...webSearchEnv,
    ...imageAnalysisEnv,
    CCS_PROFILE_TYPE: 'copilot',
  };

  console.log(info(`Using GitHub Copilot proxy (model: ${config.model})`));
  console.log('');

  // Spawn Claude CLI
  return new Promise((resolve) => {
    const proc = spawn('claude', claudeArgs, {
      stdio: 'inherit',
      env,
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
