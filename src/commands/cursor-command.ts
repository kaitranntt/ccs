/**
 * Cursor CLI Command
 *
 * Handles `ccs cursor [subcommand]` commands.
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
  probeCursorRuntime,
} from '../cursor';

import { DEFAULT_CURSOR_CONFIG } from '../config/unified-config-types';
import { getCursorDaemonToken } from '../cursor/cursor-daemon-auth';
import {
  renderCursorHelp,
  renderCursorModels,
  renderCursorProbe,
  renderCursorStatus,
} from './cursor-command-display';
import { ok, fail, info } from '../utils/ui';
import { getCursorConfig, mutateConfig } from '../config/config-loader-facade';

const LEGACY_CURSOR_COMMAND = 'ccs legacy cursor';
const CLIPROXY_CURSOR_COMMAND = 'ccs cursor';

function printLegacyCursorDeprecationNotice(): void {
  console.log(
    info(
      `Deprecated compatibility path. \`${CLIPROXY_CURSOR_COMMAND}\` now belongs to the CLIProxy Cursor provider; use \`${LEGACY_CURSOR_COMMAND}\` for the old bridge.`
    )
  );
  console.log('');
}

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
    case 'probe':
      return handleProbe();
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
      return handleHelp();
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

function printAutoDetectFailure(result: {
  error?: string;
  checkedPaths?: string[];
  reason?: string;
}): void {
  console.error(fail(`Auto-detection failed: ${result.error ?? 'Unknown error'}`));

  if (result.checkedPaths?.length && result.reason === 'db_not_found') {
    console.log('');
    console.log('Checked paths:');
    for (const candidate of result.checkedPaths) {
      console.log(`  - ${candidate}`);
    }
  }

  if (result.reason === 'sqlite_unavailable') {
    console.log('');
    console.log('Recommended next steps:');
    console.log('  1. Install sqlite3 so CCS can read Cursor state automatically');
    console.log('  2. Or use manual import immediately');
  } else if (result.reason === 'db_query_failed') {
    console.log('');
    console.log('Recommended next steps:');
    console.log('  1. Close Cursor IDE and retry auto-detect');
    console.log('  2. If the database remains unreadable, use manual import');
  }
}

/**
 * Handle auth subcommand.
 */
async function handleAuth(args: string[]): Promise<number> {
  printLegacyCursorDeprecationNotice();
  const manual = args.includes('--manual');

  if (manual) {
    const accessToken =
      parseOptionValue(args, '--token') ?? parseOptionValue(args, '--access-token') ?? '';
    const machineId =
      parseOptionValue(args, '--machine-id') ?? parseOptionValue(args, '--machineId') ?? '';

    if (!accessToken || !machineId) {
      console.error(
        fail(
          `Manual auth requires both token and machine ID.\n\nExample:\n  ${LEGACY_CURSOR_COMMAND} auth --manual --token <token> --machine-id <machine-id>`
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
    console.log(`  0. Preferred auth:     ${CLIPROXY_CURSOR_COMMAND} --auth`);
    console.log(`  1. Enable integration: ${LEGACY_CURSOR_COMMAND} enable`);
    console.log(`  2. Start daemon:       ${LEGACY_CURSOR_COMMAND} start`);
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
    console.log(`  0. Preferred auth:     ${CLIPROXY_CURSOR_COMMAND} --auth`);
    console.log(`  1. Enable integration: ${LEGACY_CURSOR_COMMAND} enable`);
    console.log(`  2. Start daemon:       ${LEGACY_CURSOR_COMMAND} start`);
    console.log(`  3. Check status:       ${LEGACY_CURSOR_COMMAND} status`);
    return 0;
  }

  console.log('');
  printAutoDetectFailure(autoResult);
  console.log('');
  console.log('Manual fallback:');
  console.log(`  ${LEGACY_CURSOR_COMMAND} auth --manual --token <token> --machine-id <machine-id>`);
  console.log('');

  return 1;
}

async function handleStatus(): Promise<number> {
  printLegacyCursorDeprecationNotice();
  const cursorConfig = getCursorConfig();
  const authStatus = checkAuthStatus();
  const daemonStatus = await getDaemonStatus(cursorConfig.port);
  renderCursorStatus(cursorConfig, authStatus, daemonStatus);
  return 0;
}

async function handleProbe(): Promise<number> {
  printLegacyCursorDeprecationNotice();
  const cursorConfig = getCursorConfig();
  const result = await probeCursorRuntime(cursorConfig);
  renderCursorProbe(result);
  return result.ok ? 0 : 1;
}

async function handleModels(): Promise<number> {
  printLegacyCursorDeprecationNotice();
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
  printLegacyCursorDeprecationNotice();
  const cursorConfig = getCursorConfig();

  if (!cursorConfig.enabled) {
    console.error(fail(`Cursor integration is disabled. Run: ${LEGACY_CURSOR_COMMAND} enable`));
    return 1;
  }

  const authStatus = checkAuthStatus();
  if (!authStatus.authenticated) {
    console.error(fail(`Not authenticated. Run: ${LEGACY_CURSOR_COMMAND} auth`));
    return 1;
  }
  if (authStatus.expired) {
    console.error(fail(`Credentials expired. Run: ${LEGACY_CURSOR_COMMAND} auth`));
    return 1;
  }

  console.log(info(`Starting cursor daemon on port ${cursorConfig.port}...`));

  const result = await startDaemon({
    port: cursorConfig.port,
    ghost_mode: cursorConfig.ghost_mode,
    daemon_token: getCursorDaemonToken(),
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
  printLegacyCursorDeprecationNotice();
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
  printLegacyCursorDeprecationNotice();
  mutateConfig((config) => {
    if (!config.cursor) {
      config.cursor = { ...DEFAULT_CURSOR_CONFIG };
    }

    config.cursor.enabled = true;
  });

  console.log(ok('Cursor integration enabled'));
  console.log('');
  console.log('Next steps:');
  console.log(`  0. Preferred auth: ${CLIPROXY_CURSOR_COMMAND} --auth`);
  console.log(`  1. Authenticate: ${LEGACY_CURSOR_COMMAND} auth`);
  console.log(`  2. Start daemon: ${LEGACY_CURSOR_COMMAND} start`);
  console.log(`  3. Check status: ${LEGACY_CURSOR_COMMAND} status`);

  return 0;
}

/**
 * Handle disable subcommand.
 */
async function handleDisable(): Promise<number> {
  printLegacyCursorDeprecationNotice();
  mutateConfig((config) => {
    if (config.cursor) {
      config.cursor.enabled = false;
    }
  });

  console.log(ok('Cursor integration disabled'));
  return 0;
}
