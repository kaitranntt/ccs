import {
  DOCKER_DEFAULT_DASHBOARD_PORT,
  DOCKER_DEFAULT_PROXY_PORT,
  DockerExecutor,
} from '../../docker';
import { box, fail, info, initUI, ok } from '../../utils/ui';
import { collectUnexpectedDockerArgs, parseDockerUpOptions } from './options';

const KNOWN_FLAGS = ['--host', '--port', '--proxy-port'] as const;

export async function handleUp(args: string[]): Promise<void> {
  await initUI();
  const parsed = parseDockerUpOptions(args, KNOWN_FLAGS);
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

  const executor = new DockerExecutor();
  const port = parsed.port ?? DOCKER_DEFAULT_DASHBOARD_PORT;
  const proxyPort = parsed.proxyPort ?? DOCKER_DEFAULT_PROXY_PORT;

  console.log(
    info(`Starting integrated Docker stack${parsed.host ? ` on ${parsed.host}` : ''}...`)
  );
  try {
    await executor.up({ host: parsed.host, port, proxyPort });
    console.log(ok(`Docker stack is running${parsed.host ? ` on ${parsed.host}` : ' locally'}.`));
    console.log(info(`Dashboard port: ${port}`));
    console.log(info(`CLIProxy port: ${proxyPort}`));
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
