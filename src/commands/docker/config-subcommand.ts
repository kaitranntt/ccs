import { DockerExecutor } from '../../docker';
import { box, color, fail, initUI, table } from '../../utils/ui';
import { collectUnexpectedDockerArgs, parseDockerTarget } from './options';

const KNOWN_FLAGS = ['--host'] as const;

export async function handleConfig(args: string[]): Promise<void> {
  await initUI();
  const parsed = parseDockerTarget(args, KNOWN_FLAGS);
  const errors = [
    ...parsed.errors,
    ...collectUnexpectedDockerArgs(parsed.remainingArgs, {
      knownFlags: [],
      maxPositionals: 0,
    }),
  ];

  if (errors.length > 0) {
    console.error(box(fail(errors.join('\n')), { title: 'Docker', padding: 1 }));
    process.exitCode = 1;
    return;
  }

  try {
    const config = new DockerExecutor().getConfig({ host: parsed.host });
    const rows = [
      ['Mode', config.remote ? `remote (${config.host})` : 'local'],
      ['Local CCS Dir', config.ccsDir],
      ['Bundled Docker Dir', config.dockerDir],
      ['Compose File', config.composeFile],
      ['Dockerfile', config.dockerfile],
      ['Supervisor Config', config.supervisordConfig],
      ['Entrypoint', config.entrypoint],
      ['Remote Deploy Dir', config.remoteDeployDir],
      ['Compose Service', config.composeService],
      ['Container Name', config.containerName],
      ['Dashboard Port', String(config.dashboardPort)],
      ['CLIProxy Port', String(config.proxyPort)],
    ];

    console.log(
      table(
        rows.map(([key, value]) => [color(key, 'primary'), value]),
        {
          head: ['Setting', 'Value'],
          style: 'ascii',
        }
      )
    );
  } catch (error) {
    console.error(
      box(fail(error instanceof Error ? error.message : String(error)), {
        title: 'Docker',
        padding: 1,
      })
    );
    process.exitCode = 1;
  }
}
