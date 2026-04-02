import type { CursorAuthStatus, CursorDaemonStatus, CursorModel } from '../cursor/types';
import type { CursorConfig } from '../config/unified-config-types';
import { color } from '../utils/ui';

function printLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

export function renderCursorHelp(): number {
  printLines([
    'Cursor IDE Integration',
    '',
    'Usage: ccs cursor [subcommand] [options]',
    '',
    'Subcommands:',
    '  auth      Import Cursor IDE authentication token',
    '  status    Show integration, authentication, and daemon status',
    '  models    List available models',
    '  start     Start cursor daemon',
    '  stop      Stop cursor daemon',
    '  enable    Enable cursor integration in unified config',
    '  disable   Disable cursor integration in unified config',
    '  help      Show this help message',
    '',
    'Auth options:',
    '  ccs cursor auth                                    # Auto-detect from Cursor SQLite',
    '  ccs cursor auth --manual --token <t> --machine-id <id>',
    '',
    'Quick start:',
    '  1. ccs cursor enable   # Enable integration',
    '  2. ccs cursor auth     # Import Cursor IDE token',
    '  3. ccs cursor start    # Start daemon',
    '  4. ccs cursor          # Show status and runtime connection details',
    '',
    'Or use the web UI: ccs config -> Cursor page',
    '',
  ]);

  return 0;
}

export function renderCursorStatus(
  cursorConfig: CursorConfig,
  authStatus: CursorAuthStatus,
  daemonStatus: CursorDaemonStatus
): void {
  const localBaseUrl = `http://127.0.0.1:${cursorConfig.port}`;
  const isReady =
    cursorConfig.enabled && authStatus.authenticated && !authStatus.expired && daemonStatus.running;

  console.log('Cursor IDE Status');
  console.log('─────────────────');
  console.log('');

  const enabledIcon = cursorConfig.enabled ? color('[OK]', 'success') : color('[X]', 'error');
  console.log(`Integration:    ${enabledIcon} ${cursorConfig.enabled ? 'Enabled' : 'Disabled'}`);

  const authIcon = authStatus.authenticated ? color('[OK]', 'success') : color('[X]', 'error');
  const expiredSuffix = authStatus.authenticated && authStatus.expired ? ' (expired)' : '';
  const authText = authStatus.authenticated ? `Authenticated${expiredSuffix}` : 'Not authenticated';
  console.log(`Authentication: ${authIcon} ${authText}`);

  if (authStatus.authenticated && authStatus.tokenAge !== undefined) {
    console.log(`  Token age:    ${authStatus.tokenAge} hours`);
    if (authStatus.credentials?.authMethod) {
      console.log(`  Method:       ${authStatus.credentials.authMethod}`);
    }
  }

  const daemonIcon = daemonStatus.running ? color('[OK]', 'success') : color('[X]', 'error');
  console.log(`Daemon:         ${daemonIcon} ${daemonStatus.running ? 'Running' : 'Not running'}`);
  if (daemonStatus.pid) {
    console.log(`  PID:          ${daemonStatus.pid}`);
  }

  console.log('');
  console.log('Configuration:');
  console.log(`  Port:         ${cursorConfig.port}`);
  console.log(`  Auto-start:   ${cursorConfig.auto_start ? 'Yes' : 'No'}`);
  console.log(`  Ghost mode:   ${cursorConfig.ghost_mode ? 'On' : 'Off'}`);
  console.log('');

  console.log('Runtime:');
  console.log(`  OpenAI base:     ${localBaseUrl}/v1`);
  console.log(`  Anthropic base:  ${localBaseUrl}`);
  console.log(`  Chat route:      ${localBaseUrl}/v1/chat/completions`);
  console.log(`  Messages route:  ${localBaseUrl}/v1/messages`);
  console.log(`  Models route:    ${localBaseUrl}/v1/models`);
  console.log('');
  console.log('Client setup:');
  console.log('  Raw settings:    ~/.ccs/cursor.settings.json');
  console.log('  Subcommands:     ccs cursor help');

  if (isReady) {
    return;
  }

  console.log('');

  console.log('Next steps:');
  if (!cursorConfig.enabled) {
    console.log('  - Enable:      ccs cursor enable');
  }
  if (!authStatus.authenticated || authStatus.expired) {
    console.log('  - Auth:        ccs cursor auth');
  }
  if (!daemonStatus.running) {
    console.log('  - Start:       ccs cursor start');
  }
  console.log('  - Help:        ccs cursor help');
}

export function renderCursorModels(models: CursorModel[], defaultModel: string): void {
  console.log('Available Cursor Models');
  console.log('───────────────────────');
  console.log('');

  for (const model of models) {
    const defaultMark = model.id === defaultModel ? ' [DEFAULT]' : '';
    console.log(`  ${model.id}${defaultMark}`);
    console.log(`    Provider: ${model.provider}`);
  }

  console.log('');
  console.log('Model selection is request-driven by the calling client.');
  console.log('Dashboard: ccs config -> Cursor page');
}
