/**
 * Copilot CLI Command
 *
 * Handles `ccs copilot <subcommand>` commands.
 */

import {
  startAuthFlow,
  getCopilotStatus,
  getCopilotUsage,
  startDaemon,
  stopDaemon,
  getAvailableModels,
  isCopilotApiInstalled,
  normalizeCopilotConfigWithWarnings,
} from '../copilot';
import type { CopilotModel } from '../copilot';

import { DEFAULT_COPILOT_CONFIG } from '../config/unified-config-types';
import { ok, fail, info, color, warn } from '../utils/ui';
import { normalizeCopilotSubcommand } from '../copilot/constants';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../config/config-loader-facade';

/**
 * Handle copilot subcommand.
 */
export async function handleCopilotCommand(args: string[]): Promise<number> {
  const subcommand = normalizeCopilotSubcommand(args[0]);

  switch (subcommand) {
    case 'auth':
      return handleAuth();
    case 'status':
      return handleStatus();
    case 'models':
      return handleModels();
    case 'usage':
      return handleUsage();
    case 'start':
      return handleStart();
    case 'stop':
      return handleStop();
    case 'enable':
      return handleEnable();
    case 'disable':
      return handleDisable();
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return handleHelp();
    default:
      console.error(fail(`Unknown subcommand: ${subcommand}`));
      console.error('');
      handleHelp();
      return 1;
  }
}

function loadCopilotConfigWithWarnings() {
  const config = loadOrCreateUnifiedConfig();
  return normalizeCopilotConfigWithWarnings(config.copilot ?? DEFAULT_COPILOT_CONFIG);
}

function printCopilotWarnings(messages: string[]): void {
  if (messages.length === 0) return;
  messages.forEach((message) => console.log(warn(message)));
  console.log(warn('Run `ccs config` and save the Copilot section to persist these replacements.'));
  console.log('');
}

/**
 * Show help for copilot commands.
 */
function handleHelp(): number {
  console.log('GitHub Copilot Integration (deprecated)');
  console.log('');
  console.log(
    warn(
      'Deprecated: GitHub usage-based Copilot billing begins June 1, 2026. Existing local setups remain available for compatibility; prefer Codex or another active provider for new work.'
    )
  );
  console.log('');
  console.log('Usage: ccs copilot <subcommand>');
  console.log('');
  console.log('Subcommands:');
  console.log('  auth      Start GitHub OAuth authentication');
  console.log('  status    Show authentication and daemon status');
  console.log('  models    List available models');
  console.log('  usage     Show Copilot quota usage');
  console.log('  start     Start copilot-api daemon');
  console.log('  stop      Stop copilot-api daemon');
  console.log('  enable    Enable copilot integration');
  console.log('  disable   Disable copilot integration');
  console.log('  help      Show this help message');
  console.log('');
  console.log('Quick start:');
  console.log('  1. ccs copilot auth     # Authenticate with GitHub');
  console.log('  2. ccs copilot enable   # Enable integration');
  console.log('  3. ccs copilot start    # Start daemon');
  console.log('  4. ccs copilot usage    # Check quota usage');
  console.log('');
  console.log('Flag aliases:');
  console.log(
    '  ccs copilot --auth | --status | --models | --usage | --start | --stop | --enable | --disable'
  );
  console.log('');
  console.log('Or use the web UI: ccs config → Copilot tab');
  console.log('');
  return 0;
}

/**
 * Handle auth subcommand.
 */
async function handleAuth(): Promise<number> {
  if (!isCopilotApiInstalled()) {
    console.error(fail('copilot-api is not installed.'));
    console.error('');
    console.error('Install with: npm install -g copilot-api');
    return 1;
  }

  const result = await startAuthFlow();

  if (result.success) {
    console.log('');
    console.log(ok('Authentication successful!'));
    console.log('');
    console.log('Next steps:');
    console.log('  1. Enable copilot: ccs copilot enable');
    console.log('  2. Start daemon:   ccs copilot start');
    console.log('     (fallback:      npx copilot-api start)');
    console.log('  3. Use copilot:    ccs copilot');
    return 0;
  } else {
    console.error('');
    console.error(fail(result.error || 'Authentication failed'));
    return 1;
  }
}

/**
 * Handle status subcommand.
 */
async function handleStatus(): Promise<number> {
  const { config: copilotConfig, warnings } = loadCopilotConfigWithWarnings();
  printCopilotWarnings(warnings.map((warning) => warning.message));

  const status = await getCopilotStatus(copilotConfig);

  console.log('GitHub Copilot Status');
  console.log('─────────────────────');
  console.log('');

  // Enabled status
  const enabledIcon = copilotConfig.enabled ? color('[OK]', 'success') : color('[X]', 'error');
  const enabledText = copilotConfig.enabled ? 'Enabled' : 'Disabled';
  console.log(`Integration:    ${enabledIcon} ${enabledText}`);

  // Auth status
  const authIcon = status.auth.authenticated ? color('[OK]', 'success') : color('[X]', 'error');
  const authText = status.auth.authenticated ? 'Authenticated' : 'Not authenticated';
  console.log(`Authentication: ${authIcon} ${authText}`);

  // Daemon status
  const daemonIcon = status.daemon.running ? color('[OK]', 'success') : color('[X]', 'error');
  const daemonText = status.daemon.running ? 'Running' : 'Not running';
  console.log(`Daemon:         ${daemonIcon} ${daemonText}`);

  console.log('');
  console.log('Configuration:');
  console.log(`  Port:         ${copilotConfig.port}`);
  console.log(`  Model:        ${copilotConfig.model}`);
  console.log(`  Account Type: ${copilotConfig.account_type}`);
  console.log(`  Auto-start:   ${copilotConfig.auto_start ? 'Yes' : 'No'}`);

  if (copilotConfig.rate_limit !== null) {
    console.log(`  Rate Limit:   ${copilotConfig.rate_limit}s`);
  }

  console.log('');

  // Show next steps if not fully configured
  if (!copilotConfig.enabled || !status.auth.authenticated || !status.daemon.running) {
    console.log('Next steps:');
    if (!copilotConfig.enabled) {
      console.log('  - Enable:      ccs copilot enable');
    }
    if (!status.auth.authenticated) {
      console.log('  - Auth:        ccs copilot auth');
    }
    if (!status.daemon.running) {
      console.log('  - Start:       ccs copilot start');
    }
  }

  return 0;
}

/**
 * Handle models subcommand.
 */
async function handleModels(): Promise<number> {
  const { config: copilotConfig, warnings } = loadCopilotConfigWithWarnings();
  printCopilotWarnings(warnings.map((warning) => warning.message));

  console.log('Available Copilot Models');
  console.log('────────────────────────');
  console.log('');

  const models = await getAvailableModels(copilotConfig.port);

  for (const model of models) {
    const current = model.id === copilotConfig.model ? ' [CURRENT]' : '';
    const defaultMark = model.isDefault ? ' (default)' : '';
    console.log(`  ${model.id}${current}${defaultMark}`);
    console.log(`    Provider: ${model.provider}`);
    const limits = formatModelLimits(model);
    if (limits) {
      console.log(`    Limits:   ${limits}`);
    }
  }

  console.log('');
  if (models.some((model) => formatModelLimits(model))) {
    console.log('Live limits above come from GitHub Copilot model metadata.');
  } else {
    console.log('Live Copilot limits were unavailable. Start the daemon and rerun this command.');
  }
  console.log(
    'CCS can switch Copilot models, but it cannot raise GitHub Copilot prompt/context caps.'
  );
  console.log('');
  console.log('To change model: ccs config (Copilot section)');

  return 0;
}

function formatCompactTokens(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
  }
  return `${value}`;
}

function formatModelLimits(model: CopilotModel): string | null {
  if (!model.limits) return null;

  const parts: string[] = [];
  if (model.limits.maxPromptTokens) {
    parts.push(`prompt ${formatCompactTokens(model.limits.maxPromptTokens)}`);
  }
  if (model.limits.maxContextWindowTokens) {
    parts.push(`context ${formatCompactTokens(model.limits.maxContextWindowTokens)}`);
  }
  if (model.limits.maxOutputTokens) {
    parts.push(`output ${formatCompactTokens(model.limits.maxOutputTokens)}`);
  }

  return parts.length > 0 ? parts.join(' | ') : null;
}

function formatQuotaLine(
  label: string,
  snapshot: {
    entitlement: number;
    used: number;
    percentUsed: number;
    percentRemaining: number;
    unlimited: boolean;
  }
): string {
  const quotaText = snapshot.unlimited
    ? 'Unlimited'
    : `${snapshot.used}/${snapshot.entitlement} used`;
  return `${label.padEnd(20)} ${quotaText} (${snapshot.percentUsed.toFixed(1)}% used, ${snapshot.percentRemaining.toFixed(1)}% remaining)`;
}

function formatResetDate(resetDate: string | null): string {
  if (!resetDate) return 'unknown';
  const date = new Date(resetDate);
  if (Number.isNaN(date.getTime())) return resetDate;
  return date.toLocaleString();
}

/**
 * Handle usage subcommand.
 */
async function handleUsage(): Promise<number> {
  const { config: copilotConfig, warnings } = loadCopilotConfigWithWarnings();
  printCopilotWarnings(warnings.map((warning) => warning.message));
  const status = await getCopilotStatus(copilotConfig);

  if (!status.daemon.running) {
    console.error(fail('copilot-api daemon is not running.'));
    console.error('');
    console.error('Start daemon first: ccs copilot start');
    return 1;
  }

  const usage = await getCopilotUsage(copilotConfig.port);
  if (!usage) {
    console.error(fail('Failed to fetch Copilot usage.'));
    console.error('');
    console.error('Try restarting daemon: ccs copilot stop && ccs copilot start');
    return 1;
  }

  console.log('GitHub Copilot Usage');
  console.log('────────────────────');
  console.log('');
  console.log(`Plan:        ${usage.plan || 'unknown'}`);
  console.log(`Quota Reset: ${formatResetDate(usage.quotaResetDate)}`);
  console.log('');
  console.log('Quotas:');
  console.log(`  ${formatQuotaLine('Premium Interactions', usage.quotas.premiumInteractions)}`);
  console.log(`  ${formatQuotaLine('Chat', usage.quotas.chat)}`);
  console.log(`  ${formatQuotaLine('Completions', usage.quotas.completions)}`);
  console.log('');

  return 0;
}

/**
 * Handle start subcommand.
 */
async function handleStart(): Promise<number> {
  const { config: copilotConfig, warnings } = loadCopilotConfigWithWarnings();
  printCopilotWarnings(warnings.map((warning) => warning.message));

  console.log(info(`Starting copilot-api daemon on port ${copilotConfig.port}...`));

  const result = await startDaemon(copilotConfig);

  if (result.success) {
    console.log(ok(`Daemon started (PID: ${result.pid})`));
    return 0;
  } else {
    console.error(fail(result.error || 'Failed to start daemon'));
    return 1;
  }
}

/**
 * Handle stop subcommand.
 */
async function handleStop(): Promise<number> {
  console.log(info('Stopping copilot-api daemon...'));

  const result = await stopDaemon();

  if (result.success) {
    console.log(ok('Daemon stopped'));
    return 0;
  } else {
    console.error(fail(result.error || 'Failed to stop daemon'));
    return 1;
  }
}

/**
 * Handle enable subcommand.
 */
async function handleEnable(): Promise<number> {
  mutateConfig((config) => {
    if (!config.copilot) {
      config.copilot = { ...DEFAULT_COPILOT_CONFIG };
    }

    config.copilot.enabled = true;
  });

  console.log(ok('Copilot integration enabled'));
  console.log('');
  console.log('Next steps:');
  console.log('  1. Authenticate: ccs copilot auth');
  console.log('  2. Start daemon: ccs copilot start');
  console.log('  3. Use:          ccs copilot');

  return 0;
}

/**
 * Handle disable subcommand.
 */
async function handleDisable(): Promise<number> {
  mutateConfig((config) => {
    if (config.copilot) {
      config.copilot.enabled = false;
    }
  });

  console.log(ok('Copilot integration disabled'));

  return 0;
}
