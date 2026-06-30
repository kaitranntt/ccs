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
} from '../../cliproxy/binary/platform-detector';
import { QUOTA_PROVIDER_HELP_TEXT } from '../../cliproxy/provider-capabilities';

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
        ['create --composite', 'Create composite variant (mix providers per tier)'],
        ['edit [name]', 'Edit an existing CLIProxy variant profile'],
        ['list', 'List all CLIProxy variant profiles'],
        ['remove <name>', 'Remove a CLIProxy variant profile'],
      ],
    ],
    [
      'Catalog Commands:',
      [
        ['catalog', 'Show catalog status, routing hints, and pinned short prefixes'],
        ['catalog refresh', 'Sync models from remote CLIProxy'],
        ['catalog reset', 'Clear cache, revert to static catalog'],
        ['catalog --json', 'Output full model catalog as minified JSON'],
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
        ['default <account> [--provider <name>]', 'Set default account for rotation'],
        ['pause <account> [--provider <name>]', 'Pause account (skip in rotation)'],
        ['resume <account> [--provider <name>]', 'Resume paused account'],
        [
          'quota',
          'Show quota status + pool context (drain order, per-account available/cooling/paused)',
        ],
        ['quota --provider <name>', `Filter by provider (${QUOTA_PROVIDER_HELP_TEXT})`],
        ['routing', 'Show current routing strategy and manual guidance'],
        ['routing explain', 'Explain strategy vs session-affinity and how sessions are recognized'],
        ['routing set <mode>', 'Explicitly set round-robin or fill-first'],
        ['routing affinity', 'Show local session-affinity status and TTL'],
        ['routing affinity <on|off> [--ttl <duration>]', 'Toggle local session-affinity settings'],
        ['pool', 'Show pool routing status (fill-first + affinity + 429 cooldown)'],
        ['pool --enable', 'Enable pool routing (writes cooling/affinity/retry-cap to config)'],
        ['pool --disable', 'Disable pool routing and restore non-pool config'],
        [
          'accounts order <provider>',
          'Show effective drain order (priority bucket desc, then ID asc)',
        ],
        [
          'accounts order <provider> --by-tier',
          'Set drain order from tier metadata (ultra > pro > free)',
        ],
        [
          'accounts order <provider> --set a,b,c',
          'Set manual drain order (comma-separated account IDs)',
        ],
        ['accounts order <provider> --reset', 'Revert drain order to stable file order'],
      ],
    ],
    [
      'Proxy Lifecycle:',
      [
        ['start', 'Start CLIProxy instance in background'],
        ['restart', 'Restart CLIProxy instance'],
        [
          'status [--verbose]',
          'Show CLIProxy status + Control Panel URL and masked login key (--verbose adds uptime)',
        ],
        ['stop', 'Stop running CLIProxy instance'],
        ['doctor | diag', 'Quota diagnostics and shared project detection'],
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
        [
          '--backend <type>',
          'Use specific backend: original | plus (default: original; plus uses community fork)',
        ],
        ['--target <cli>', 'Default target for created/edited variants: claude | droid'],
        ['--verbose, -v', 'Show detailed diagnostics including routing hints and quota fetches'],
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
  console.log(dim('  Routing: use gcli/<model> or agy/<model> to keep overlapping models pinned.'));
  console.log(dim('  Backend: original is the default; plus is opt-in for plus-only providers.'));
  console.log('');
  console.log(subheader('Notes:'));
  console.log(`  Default fallback version: ${color(getFallbackVersion(), 'info')}`);
  console.log(
    `  Releases: ${color(`https://github.com/${BACKEND_CONFIG[DEFAULT_BACKEND].repo}/releases`, 'path')}`
  );
  console.log('');
}
