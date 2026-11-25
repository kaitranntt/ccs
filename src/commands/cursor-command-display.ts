import type { CursorAuthStatus, CursorDaemonStatus, CursorModel } from '../cursor/types';
import type { CursorProbeResult } from '../cursor/cursor-runtime-probe';
import type { CursorConfig } from '../config/unified-config-types';
import { getCcsDirDisplay } from '../utils/config-manager';
import { color } from '../utils/ui';

const LEGACY_CURSOR_COMMAND = 'ccs legacy cursor';
const CLIPROXY_CURSOR_COMMAND = 'ccs cursor';

function printLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

export function renderCursorHelp(): number {
  printLines([
    'Legacy Cursor Compatibility',
    '',
    'Deprecated: `ccs cursor` now belongs to the CLIProxy Cursor provider.',
    `Supported auth path: ${CLIPROXY_CURSOR_COMMAND} --auth`,
    'Supported dashboard path: ccs config -> CLIProxy -> Cursor',
    '',
    `Usage: ${LEGACY_CURSOR_COMMAND} <subcommand>`,
    '',
    'Subcommands (deprecated compatibility for the local reverse-engineered bridge):',
    '  auth      Import Cursor IDE authentication token (deprecated)',
    '  status    Show legacy integration, authentication, and daemon status',
    '  probe     Run a live authenticated runtime probe',
    '  models    List available models',
    '  start     Start local cursor daemon',
    '  stop      Stop local cursor daemon',
    '  enable    Enable legacy cursor integration in unified config',
    '  disable   Disable legacy cursor integration in unified config',
    '  help      Show this help message',
    '',
    'Supported CLIProxy path:',
    `  ${CLIPROXY_CURSOR_COMMAND} --auth                                # Authenticate Cursor via CLIProxy`,
    `  ${CLIPROXY_CURSOR_COMMAND} --accounts                            # Manage CLIProxy Cursor accounts`,
    `  ${CLIPROXY_CURSOR_COMMAND} --config                              # Open CLIProxy Cursor settings`,
    '',
    'Legacy runtime entry (deprecated compatibility):',
    `  ${LEGACY_CURSOR_COMMAND} [claude args]                          # Run Claude via the local Cursor bridge`,
    '',
    'Legacy auth options:',
    `  ${LEGACY_CURSOR_COMMAND} auth                                    # Auto-detect from Cursor SQLite (deprecated)`,
    `  ${LEGACY_CURSOR_COMMAND} auth --manual --token <t> --machine-id <id>`,
    '',
    'Legacy bridge quick start:',
    `  1. ${LEGACY_CURSOR_COMMAND} enable   # Deprecated compatibility: enable local bridge`,
    `  2. ${LEGACY_CURSOR_COMMAND} auth     # Deprecated compatibility: import Cursor IDE token`,
    `  3. ${LEGACY_CURSOR_COMMAND} start    # Start local daemon`,
    `  4. ${LEGACY_CURSOR_COMMAND} probe    # Verify live runtime health`,
    `  5. ${LEGACY_CURSOR_COMMAND} "task"   # Run Claude through the local bridge`,
    `  6. ${LEGACY_CURSOR_COMMAND} status   # Inspect auth/daemon wiring`,
    '',
    'Web UI: ccs config -> Deprecated -> Cursor IDE',
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
  const dirDisplay = getCcsDirDisplay();
  const isReady =
    cursorConfig.enabled && authStatus.authenticated && !authStatus.expired && daemonStatus.running;

  console.log('Cursor IDE Status');
  console.log('-----------------');
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
  console.log(`  Raw settings:    ${dirDisplay}/cursor.settings.json`);
  console.log(
    `  Runtime entry:   ${LEGACY_CURSOR_COMMAND} [claude args] (deprecated compatibility)`
  );
  console.log(`  Supported auth:  ${CLIPROXY_CURSOR_COMMAND} --auth`);
  console.log(`  Live probe:      ${LEGACY_CURSOR_COMMAND} probe`);
  console.log(`  Status command:  ${LEGACY_CURSOR_COMMAND} status`);
  console.log(`  Help command:    ${LEGACY_CURSOR_COMMAND} help`);

  if (isReady) {
    return;
  }

  console.log('');

  console.log('Next steps:');
  if (!cursorConfig.enabled) {
    console.log(`  - Enable:      ${LEGACY_CURSOR_COMMAND} enable`);
  }
  if (!authStatus.authenticated || authStatus.expired) {
    console.log(`  - Supported:   ${CLIPROXY_CURSOR_COMMAND} --auth`);
    console.log(`  - Legacy auth: ${LEGACY_CURSOR_COMMAND} auth`);
  }
  if (!daemonStatus.running) {
    console.log(`  - Start:       ${LEGACY_CURSOR_COMMAND} start`);
  }
  console.log(`  - Help:        ${LEGACY_CURSOR_COMMAND} help`);
}

export function renderCursorModels(models: CursorModel[], defaultModel: string): void {
  console.log('Available Cursor Models');
  console.log('-----------------------');
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

export function renderCursorProbe(result: CursorProbeResult): void {
  const statusIcon = result.ok ? color('[OK]', 'success') : color('[X]', 'error');
  console.log('Cursor Live Probe');
  console.log('-----------------');
  console.log('');
  console.log(`Result:       ${statusIcon} ${result.ok ? 'Success' : 'Failure'}`);
  console.log(`Stage:        ${result.stage}`);
  console.log(`HTTP status:  ${result.status}`);
  console.log(`Duration:     ${result.duration_ms} ms`);
  if (result.model) {
    console.log(`Model:        ${result.model}`);
  }
  if (result.error_type) {
    console.log(`Error type:   ${result.error_type}`);
  }
  console.log(`Message:      ${result.message}`);
}
