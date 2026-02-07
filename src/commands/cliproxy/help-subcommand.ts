/**
 * CLIProxy Help Display
 *
 * Handles:
 * - ccs cliproxy --help
 */

import { initUI, header, subheader, color, dim } from '../../utils/ui';
import {
  DEFAULT_BACKEND,
  getFallbackVersion,
  BACKEND_CONFIG,
} from '../../cliproxy/platform-detector';

export async function showHelp(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Management'));
  console.log('');
  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs cliproxy', 'command')} <command> [options]`);
  console.log('');

  const sections: [string, [string, string][]][] = [
    [
      'Profile Commands:',
      [
        ['create [name]', 'Create new CLIProxy variant profile'],
        ['list', 'List all CLIProxy variant profiles'],
        ['remove <name>', 'Remove a CLIProxy variant profile'],
      ],
    ],
    [
      'Catalog Commands:',
      [
        ['catalog', 'Show catalog status (cached vs static)'],
        ['catalog refresh', 'Sync models from remote CLIProxy'],
        ['catalog reset', 'Clear cache, revert to static catalog'],
      ],
    ],
    [
      'Local Sync:',
      [
        ['sync', 'Sync API profiles to local CLIProxy config'],
        ['sync --dry-run', 'Preview sync without applying'],
        ['sync --verbose', 'Show detailed sync information'],
      ],
    ],
    [
      'Quota Management:',
      [
        ['default <account>', 'Set default account for rotation'],
        ['pause <account>', 'Pause account (skip in rotation)'],
        ['resume <account>', 'Resume paused account'],
        ['quota', 'Show quota status for all providers'],
        ['quota --provider <name>', 'Filter by provider (agy|codex|gemini)'],
      ],
    ],
    [
      'Proxy Lifecycle:',
      [
        ['status', 'Show running CLIProxy status'],
        ['stop', 'Stop running CLIProxy instance'],
        ['doctor', 'Quota diagnostics and shared project detection'],
      ],
    ],
    [
      'Binary Commands:',
      [
        ['--install <version>', 'Install and pin a specific version'],
        ['--latest', 'Install the latest version (no pin)'],
        ['--update', 'Unpin and update to latest version'],
      ],
    ],
    [
      'Options:',
      [
        ['--backend <type>', 'Use specific backend: original | plus (default: from config)'],
        ['--verbose, -v', 'Show detailed quota fetch diagnostics'],
      ],
    ],
  ];

  for (const [title, cmds] of sections) {
    console.log(subheader(title));
    const maxLen = Math.max(...cmds.map(([cmd]) => cmd.length));
    for (const [cmd, desc] of cmds) {
      console.log(`  ${color(cmd.padEnd(maxLen + 2), 'command')} ${desc}`);
    }
    console.log('');
  }

  console.log(dim('  Note: CLIProxy now persists by default. Use "stop" to terminate.'));
  console.log('');
  console.log(subheader('Notes:'));
  console.log(`  Default fallback version: ${color(getFallbackVersion(), 'info')}`);
  console.log(
    `  Releases: ${color(`https://github.com/${BACKEND_CONFIG[DEFAULT_BACKEND].repo}/releases`, 'path')}`
  );
  console.log('');
}
