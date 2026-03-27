import { DockerExecutor } from '../../docker';
import { box, color, fail, info, initUI, ok, subheader } from '../../utils/ui';
import { collectUnexpectedDockerArgs, parseDockerTarget } from './options';

const KNOWN_FLAGS = ['--host'] as const;

export async function handleStatus(args: string[]): Promise<void> {
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
    const status = await new DockerExecutor().status({ host: parsed.host });
    console.log(ok(`Docker status${parsed.host ? ` for ${parsed.host}` : ''}`));
    console.log('');
    console.log(subheader('Compose:'));
    console.log(status.compose.stdout.trim() || info('No docker compose output.'));
    if (status.supervisor?.exitCode === 0 && status.supervisor.stdout.trim()) {
      console.log('');
      console.log(subheader('Supervisor:'));
      console.log(status.supervisor.stdout.trim());
    } else if (status.supervisor) {
      console.log('');
      console.log(subheader('Supervisor:'));
      const detail = (status.supervisor.stderr || status.supervisor.stdout).trim();
      console.log(
        info(
          `Supervisor status check failed for ${color('ccs-cliproxy', 'command')}.\n${detail || 'No additional detail provided.'}`
        )
      );
    } else {
      console.log('');
      console.log(info(`Supervisor status unavailable for ${color('ccs-cliproxy', 'command')}.`));
    }
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
