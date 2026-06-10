/**
 * `ccs bar` command dispatcher
 *
 * Mirrors the pattern in src/commands/docker/index.ts.
 * Subcommands: launch (default), install, uninstall, version / --version, help / --help / -h.
 */

import { hasAnyFlag } from '../arg-extractor';

export async function handleBarCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  // --help / -h anywhere in args (e.g. `ccs bar install --help`) → show help.
  // Mirrors docker/index.ts: hasAnyFlag(normalizedArgs, ['--help', '-h']).
  // Also dispatch bare `help` subcommand for symmetry.
  if (hasAnyFlag(args, ['--help', '-h']) || subcommand === 'help') {
    const { showHelp } = await import('./help-subcommand');
    await showHelp();
    return;
  }

  // --version / version are aliases for the version subcommand
  if (subcommand === '--version' || subcommand === 'version') {
    const { handleBarVersion } = await import('./version-subcommand');
    await handleBarVersion();
    return;
  }

  const commandHandlers: Record<string, (subArgs: string[]) => Promise<void>> = {
    launch: async (subArgs) => {
      const { handleBarLaunch } = await import('./launch-subcommand');
      await handleBarLaunch(subArgs);
    },
    install: async (subArgs) => {
      const { handleBarInstall } = await import('./install-subcommand');
      await handleBarInstall(subArgs);
    },
    uninstall: async (subArgs) => {
      const { handleBarUninstall } = await import('./uninstall-subcommand');
      await handleBarUninstall(subArgs);
    },
  };

  // Bare `ccs bar` → launch
  if (!subcommand || subcommand === 'launch') {
    await commandHandlers.launch(subcommand ? args.slice(1) : []);
    return;
  }

  const handler = commandHandlers[subcommand];
  if (!handler) {
    console.error(`[X] Unknown bar subcommand: ${subcommand}`);
    console.error('[i] Usage: ccs bar [launch|install|uninstall|version|--help]');
    return;
  }

  await handler(args.slice(1));
}
