import { DockerExecutor } from '../../docker';
import { box, fail, info, initUI, ok } from '../../utils/ui';
import { collectUnexpectedDockerArgs, parseDockerTarget } from './options';

const KNOWN_FLAGS = ['--host'] as const;

export async function handleUpdate(args: string[]): Promise<void> {
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

  console.log(info(`Updating running Docker stack${parsed.host ? ` on ${parsed.host}` : ''}...`));
  try {
    await new DockerExecutor().update({ host: parsed.host });
    console.log(ok(`Docker stack updated${parsed.host ? ` on ${parsed.host}` : ''}.`));
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
