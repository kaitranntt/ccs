/**
 * Cursor CLI Command
 *
 * Handles `ccs cursor <subcommand>` commands.
 */

import {
  autoDetectTokens,
  validateToken,
  saveCredentials,
  checkAuthStatus,
  startDaemon,
  stopDaemon,
  getDaemonStatus,
  getAvailableModels,
  getDefaultModel,
} from '../cursor';
import { getCursorConfig, mutateUnifiedConfig } from '../config/unified-config-loader';
import { DEFAULT_CURSOR_CONFIG } from '../config/unified-config-types';
import { renderCursorHelp, renderCursorModels, renderCursorStatus } from './cursor-command-display';
import { ok, fail, info } from '../utils/ui';

/** Valid cursor subcommands — imported by ccs.ts for routing */
export const CURSOR_SUBCOMMANDS = [
  'auth',
  'status',
  'models',
  'start',
  'stop',
  'enable',
  'disable',
  'help',
  '--help',
  '-h',
] as const;

/**
 * Handle cursor subcommand.
 */
export async function handleCursorCommand(args: string[]): Promise<number> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'auth':
      return handleAuth(args.slice(1));
    case 'status':
      return handleStatus();
    case 'models':
      return handleModels();
    case 'start':
      return handleStart();
    case 'stop':
      return handleStop();
    case 'enable':
      return handleEnable();
    case 'disable':
      return handleDisable();
    case undefined:
      return handleStatus();
    case 'help':
    case '--help':
    case '-h':
      return handleHelp();
    default:
      console.error(fail(`Unknown subcommand: ${subcommand}`));
      console.error('');
      void handleHelp(); // Print help but keep exit code 1
      return 1;
  }
}

function handleHelp(): number {
  return renderCursorHelp();
}

function parseOptionValue(args: string[], key: string): string | undefined {
  const exactIndex = args.findIndex((arg) => arg === key);
  if (exactIndex !== -1 && args[exactIndex + 1]) {
    return args[exactIndex + 1];
  }

  const prefix = `${key}=`;
  const withEquals = args.find((arg) => arg.startsWith(prefix));
  if (withEquals) {
    return withEquals.slice(prefix.length);
  }

  return undefined;
}

/**
 * Handle auth subcommand.
 */
async function handleAuth(args: string[]): Promise<number> {
  const manual = args.includes('--manual');

  if (manual) {
    const accessToken =
      parseOptionValue(args, '--token') ?? parseOptionValue(args, '--access-token') ?? '';
    const machineId =
      parseOptionValue(args, '--machine-id') ?? parseOptionValue(args, '--machineId') ?? '';

    if (!accessToken || !machineId) {
      console.error(
        fail(
          'Manual auth requires both token and machine ID.\n\nExample:\n  ccs cursor auth --manual --token <token> --machine-id <machine-id>'
        )
      );
      return 1;
    }

    if (!validateToken(accessToken, machineId)) {
      console.error(fail('Invalid token or machine ID format'));
      return 1;
    }

    saveCredentials({
      accessToken,
      machineId,
      authMethod: 'manual',
      importedAt: new Date().toISOString(),
    });

    console.log(ok('Cursor credentials imported (manual mode)'));
    console.log('');
    console.log('Next steps:');
    console.log('  1. Enable integration: ccs cursor enable');
    console.log('  2. Start daemon:       ccs cursor start');
    return 0;
  }

  console.log(info('Importing Cursor IDE authentication...'));
  console.log('');
  console.log(info('Attempting auto-detection...'));

  const autoResult = autoDetectTokens();

  if (autoResult.found && autoResult.accessToken && autoResult.machineId) {
    saveCredentials({
      accessToken: autoResult.accessToken,
      machineId: autoResult.machineId,
      authMethod: 'auto-detect',
      importedAt: new Date().toISOString(),
    });

    console.log(ok('Auto-detected Cursor credentials'));
    console.log('');
    console.log('Next steps:');
    console.log('  1. Enable integration: ccs cursor enable');
    console.log('  2. Start daemon:       ccs cursor start');
    console.log('  3. Check status:       ccs cursor status');
    return 0;
  }

  console.log('');
  console.error(fail(`Auto-detection failed: ${autoResult.error ?? 'Unknown error'}`));
  console.log('');
  console.log('Manual fallback:');
  console.log('  ccs cursor auth --manual --token <token> --machine-id <machine-id>');
  console.log('');

  return 1;
}

async function handleStatus(): Promise<number> {
  const cursorConfig = getCursorConfig();
  const authStatus = checkAuthStatus();
  const daemonStatus = await getDaemonStatus(cursorConfig.port);
  renderCursorStatus(cursorConfig, authStatus, daemonStatus);
  return 0;
}

async function handleModels(): Promise<number> {
  const cursorConfig = getCursorConfig();
  const models = await getAvailableModels(cursorConfig.port);
  const defaultModel = getDefaultModel();
  renderCursorModels(models, defaultModel);
  return 0;
}

/**
 * Handle start subcommand.
 */
async function handleStart(): Promise<number> {
  const cursorConfig = getCursorConfig();

  if (!cursorConfig.enabled) {
    console.error(fail('Cursor integration is disabled. Run: ccs cursor enable'));
    return 1;
  }

  const authStatus = checkAuthStatus();
  if (!authStatus.authenticated) {
    console.error(fail('Not authenticated. Run: ccs cursor auth'));
    return 1;
  }
  if (authStatus.expired) {
    console.error(fail('Credentials expired. Run: ccs cursor auth'));
    return 1;
  }

  console.log(info(`Starting cursor daemon on port ${cursorConfig.port}...`));

  const result = await startDaemon({
    port: cursorConfig.port,
    ghost_mode: cursorConfig.ghost_mode,
  });

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
  console.log(info('Stopping cursor daemon...'));

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
  mutateUnifiedConfig((config) => {
    if (!config.cursor) {
      config.cursor = { ...DEFAULT_CURSOR_CONFIG };
    }

    config.cursor.enabled = true;
  });

  console.log(ok('Cursor integration enabled'));
  console.log('');
  console.log('Next steps:');
  console.log('  1. Authenticate: ccs cursor auth');
  console.log('  2. Start daemon: ccs cursor start');
  console.log('  3. Check status: ccs cursor status');

  return 0;
}

/**
 * Handle disable subcommand.
 */
async function handleDisable(): Promise<number> {
  mutateUnifiedConfig((config) => {
    if (config.cursor) {
      config.cursor.enabled = false;
    }
  });

  console.log(ok('Cursor integration disabled'));
  return 0;
}
