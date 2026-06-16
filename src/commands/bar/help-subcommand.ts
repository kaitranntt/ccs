import { color, dim, header, initUI, subheader } from '../../utils/ui';

export async function showHelp(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CCS Bar (macOS Menu Bar App)'));
  console.log('');
  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs bar', 'command')} [command] [options]`);
  console.log('');

  const sections: [string, [string, string][]][] = [
    [
      'Commands:',
      [
        ['launch', 'Spawn the server detached, write ~/.ccs/bar.json, open the app (default)'],
        ['stop', 'Stop the detached CCS Bar server'],
        ['status', 'Show whether the CCS Bar server is running'],
        ['install', 'Download CCS Bar from the ccs-bar-latest GitHub release into ~/Applications'],
        ['uninstall', 'Remove the app and version pin'],
        ['version', 'Show CLI and installed app versions'],
      ],
    ],
    [
      'Options:',
      [
        ['--help, -h', 'Show this help message'],
        ['--version', 'Show CLI and installed app versions'],
      ],
    ],
    [
      'Install options:',
      [
        ['--launch', 'Launch CCS Bar immediately after install without prompting'],
        ['--no-launch', 'Skip the launch prompt after install'],
      ],
    ],
    [
      'Examples:',
      [
        ['ccs bar', 'Start the server detached and open CCS Bar'],
        ['ccs bar stop', 'Stop the detached CCS Bar server'],
        ['ccs bar status', 'Show server running state and PID'],
        ['ccs bar install', 'Download and install CCS Bar, then prompt to launch'],
        ['ccs bar install --launch', 'Install and launch immediately (no prompt)'],
        ['ccs bar install --no-launch', 'Install without launching'],
        ['ccs bar version', 'Show CLI and installed app versions'],
        ['ccs bar uninstall', 'Remove CCS Bar and its version pin'],
      ],
    ],
  ];

  for (const [title, rows] of sections) {
    console.log(subheader(title));
    const width = Math.max(...rows.map(([command]) => command.length));
    for (const [command, description] of rows) {
      console.log(`  ${color(command.padEnd(width + 2), 'command')} ${description}`);
    }
    console.log('');
  }

  console.log(dim('  macOS only. The app communicates with the CCS web-server on localhost only.'));
  console.log(dim('  Gatekeeper quarantine is kept in place for macOS first-launch verification.'));
  console.log(
    dim('  `ccs bar launch` spawns the server detached — the terminal is freed immediately.')
  );
  console.log(dim('  The server persists until stopped with `ccs bar stop` or system reboot.'));
  console.log(
    dim('  If macOS blocks the app, right-click > Open to make an explicit trust decision.')
  );
  console.log('');
}
