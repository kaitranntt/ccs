import { DockerExecutor } from '../../docker';
import { box, fail, info, initUI } from '../../utils/ui';
import { collectUnexpectedDockerArgs, parseDockerLogsOptions } from './options';

const KNOWN_FLAGS = ['--host', '--follow', '--service'] as const;

export async function handleLogs(args: string[]): Promise<void> {
  await initUI();
  const parsed = parseDockerLogsOptions(args, KNOWN_FLAGS);
  const errors = [
    ...parsed.errors,
    ...collectUnexpectedDockerArgs(parsed.remainingArgs, {
      knownFlags: ['--follow'],
      maxPositionals: 0,
    }),
  ];

  if (errors.length > 0) {
    console.error(box(fail(errors.join('\n')), { title: 'Docker', padding: 1 }));
    process.exitCode = 1;
    return;
  }

  const executor = new DockerExecutor();
  try {
    if (parsed.follow) {
      console.log(info(`Following Docker logs${parsed.host ? ` on ${parsed.host}` : ''}...`));
      await executor.logs({
        host: parsed.host,
        follow: true,
        service: parsed.service,
      });
      return;
    }

    const output = await executor.logs({
      host: parsed.host,
      follow: false,
      service: parsed.service,
    });
    console.log(output ?? '');
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
