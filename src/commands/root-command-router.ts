import { resolveNamedCommand, type NamedCommandRoute } from './named-command-router';

async function printUpdateCommandHelp(): Promise<void> {
  console.log('');
  console.log('Usage: ccs update [options]');
  console.log('');
  console.log('Options:');
  console.log('  --force       Force reinstall current version');
  console.log('  --beta, --dev Install from dev channel (unstable)');
  console.log('  --help, -h    Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  ccs update           Update to latest stable');
  console.log('  ccs update --force   Force reinstall');
  console.log('  ccs update --beta    Install dev channel');
  console.log('');
}

export const ROOT_COMMAND_ROUTES: readonly NamedCommandRoute[] = [
  {
    name: 'migrate',
    aliases: ['--migrate'],
    handle: async (args) => {
      const { handleMigrateCommand, printMigrateHelp } = await import('./migrate-command');
      if (args.includes('--help') || args.includes('-h')) {
        printMigrateHelp();
        return;
      }
      await handleMigrateCommand(args);
    },
  },
  {
    name: 'update',
    aliases: ['--update'],
    handle: async (args) => {
      if (args.includes('--help') || args.includes('-h')) {
        await printUpdateCommandHelp();
        return;
      }
      const { handleUpdateCommand } = await import('./update-command');
      await handleUpdateCommand({
        force: args.includes('--force'),
        beta: args.includes('--beta') || args.includes('--dev'),
      });
    },
  },
  {
    name: 'version',
    aliases: ['--version', '-v'],
    handle: async () => {
      const { handleVersionCommand } = await import('./version-command');
      await handleVersionCommand();
    },
  },
  {
    name: 'help',
    aliases: ['--help', '-h'],
    handle: async (args) => {
      const { handleHelpRoute } = await import('./help-command');
      await handleHelpRoute(args);
    },
  },
  {
    name: '--install',
    handle: async () => {
      const { handleInstallCommand } = await import('./install-command');
      await handleInstallCommand();
    },
  },
  {
    name: '--uninstall',
    handle: async () => {
      const { handleUninstallCommand } = await import('./install-command');
      await handleUninstallCommand();
    },
  },
  {
    name: '--shell-completion',
    aliases: ['-sc'],
    handle: async (args) => {
      const { handleShellCompletionCommand } = await import('./shell-completion-command');
      await handleShellCompletionCommand(args);
    },
  },
  {
    name: '__complete',
    handle: async (args) => {
      const { handleCompletionCommand } = await import('./completion-backend');
      await handleCompletionCommand(args);
    },
  },
  {
    name: 'doctor',
    aliases: ['--doctor'],
    handle: async (args) => {
      const { handleDoctorCommand } = await import('./doctor-command');
      await handleDoctorCommand(args);
    },
  },
  {
    name: 'sync',
    aliases: ['--sync'],
    handle: async () => {
      const { handleSyncCommand } = await import('./sync-command');
      await handleSyncCommand();
    },
  },
  {
    name: 'browser',
    handle: async (args) => {
      const { handleBrowserCommand } = await import('./browser-command');
      await handleBrowserCommand(args);
    },
  },
  {
    name: 'cleanup',
    aliases: ['--cleanup'],
    handle: async (args) => {
      const { handleCleanupCommand } = await import('./cleanup-command');
      await handleCleanupCommand(args);
    },
  },
  {
    name: 'auth',
    handle: async (args) => {
      const AuthCommandsModule = await import('../auth/auth-commands');
      const AuthCommands = AuthCommandsModule.default;
      const authCommands = new AuthCommands();
      await authCommands.route(args);
    },
  },
  {
    name: 'api',
    handle: async (args) => {
      const { handleApiCommand } = await import('./api-command/index');
      await handleApiCommand(args);
    },
  },
  {
    name: 'cliproxy',
    handle: async (args) => {
      const { handleCliproxyCommand } = await import('./cliproxy-command');
      await handleCliproxyCommand(args);
    },
  },
  {
    name: 'proxy',
    handle: async (args) => {
      const { handleProxyCommand } = await import('./proxy-command');
      process.exit(await handleProxyCommand(args));
    },
  },
  {
    name: 'docker',
    handle: async (args) => {
      const { handleDockerCommand } = await import('./docker-command');
      await handleDockerCommand(args);
    },
  },
  {
    name: 'config',
    handle: async (args) => {
      const { handleConfigCommand } = await import('./config-command');
      await handleConfigCommand(args);
    },
  },
  {
    name: 'tokens',
    handle: async (args) => {
      const { handleTokensCommand } = await import('./tokens-command');
      process.exit(await handleTokensCommand(args));
    },
  },
  {
    name: 'persist',
    handle: async (args) => {
      const { handlePersistCommand } = await import('./persist-command');
      await handlePersistCommand(args);
    },
  },
  {
    name: 'env',
    handle: async (args) => {
      const { handleEnvCommand } = await import('./env-command');
      await handleEnvCommand(args);
    },
  },
  {
    name: 'setup',
    aliases: ['--setup'],
    handle: async (args) => {
      const { handleSetupCommand } = await import('./setup-command');
      await handleSetupCommand(args);
    },
  },
  {
    name: 'bar',
    handle: async (args) => {
      const { handleBarCommand } = await import('./bar');
      await handleBarCommand(args);
    },
  },
];

export async function tryHandleRootCommand(args: string[]): Promise<boolean> {
  const route = resolveNamedCommand(args[0], ROOT_COMMAND_ROUTES);
  if (!route) {
    return false;
  }

  await route.handle(args.slice(1));
  return true;
}
