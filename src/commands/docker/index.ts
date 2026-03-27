import { extractOption, hasAnyFlag } from '../arg-extractor';
import { handleConfig } from './config-subcommand';
import { handleDown } from './down-subcommand';
import { showHelp } from './help-subcommand';
import { handleLogs } from './logs-subcommand';
import { handleStatus } from './status-subcommand';
import { handleUp } from './up-subcommand';
import { handleUpdate } from './update-subcommand';

function normalizeLeadingHostArg(args: string[]): string[] {
  const firstToken = args[0];
  if (!firstToken || (firstToken !== '--host' && !firstToken.startsWith('--host='))) {
    return args;
  }

  const extracted = extractOption(args, ['--host'], {
    knownFlags: ['--host', '--help', '-h'],
  });
  if (extracted.missingValue || !extracted.value?.trim()) {
    return args;
  }

  const command = extracted.remainingArgs[0];
  if (!command || command.startsWith('-')) {
    return args;
  }

  return [command, '--host', extracted.value.trim(), ...extracted.remainingArgs.slice(1)];
}

export async function handleDockerCommand(args: string[]): Promise<void> {
  const normalizedArgs = normalizeLeadingHostArg(args);

  if (hasAnyFlag(normalizedArgs, ['--help', '-h'])) {
    await showHelp();
    return;
  }

  const command = normalizedArgs[0];
  const commandHandlers: Record<string, (subArgs: string[]) => Promise<void>> = {
    up: handleUp,
    down: handleDown,
    status: handleStatus,
    update: handleUpdate,
    logs: handleLogs,
    config: handleConfig,
    help: async () => showHelp(),
  };

  if (!command) {
    await showHelp();
    return;
  }

  const handler = commandHandlers[command];
  if (!handler) {
    await showHelp();
    process.exitCode = 1;
    return;
  }

  await handler(normalizedArgs.slice(1));
}
