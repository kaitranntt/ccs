import { color, dim, header, initUI, subheader } from '../../utils/ui';

export async function showHelp(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('Docker Deployment'));
  console.log('');
  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs docker', 'command')} <command> [options]`);
  console.log('');

  const sections: [string, [string, string][]][] = [
    [
      'Commands:',
      [
        ['up', 'Build and start the integrated CCS + CLIProxy stack'],
        ['down', 'Stop and remove the integrated stack'],
        ['status', 'Show docker compose and supervisor status'],
        ['update', 'Update CCS and CLIProxy inside the running container'],
        ['logs', 'Show or follow container log output'],
        ['config', 'Show bundled asset paths and deployment defaults'],
      ],
    ],
    [
      'Common Options:',
      [
        ['--host <target>', 'Run command on a remote host over SSH (single target or SSH alias)'],
        ['--help, -h', 'Show this help message'],
      ],
    ],
    [
      'Per-Command Options:',
      [
        ['up --port <port>', 'Publish dashboard on a custom host port'],
        ['up --proxy-port <port>', 'Publish CLIProxy on a custom host port'],
        ['logs --follow', 'Stream logs continuously'],
        ['logs --service <name>', 'Filter logs to ccs or cliproxy'],
      ],
    ],
    [
      'Examples:',
      [
        ['ccs docker up', 'Start the stack locally on ports 3000 and 8317'],
        ['ccs docker up --port 4000 --proxy-port 9317', 'Start locally with custom ports'],
        ['ccs docker --host my-box status', 'Use the documented common-option ordering'],
        ['ccs docker up --host my-box', 'Stage assets to ~/.ccs/docker and deploy remotely'],
        ['ccs docker logs --follow --service ccs', 'Tail dashboard logs only'],
        ['ccs docker update --host my-box', 'Update the running remote stack in place'],
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

  console.log(
    dim('  Remote deployments use ~/.ccs/docker on the target host to avoid root-only paths.')
  );
  console.log('');
}
