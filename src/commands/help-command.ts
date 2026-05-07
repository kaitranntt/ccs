import packageJson from '../../package.json';
import type { CLIProxyProvider } from '../cliproxy';
import { color, dim, header, initUI, subheader } from '../utils/ui';
import {
  BUILTIN_PROVIDER_SHORTCUTS,
  ROOT_COMMAND_CATALOG,
  ROOT_COMPATIBLE_ALIAS_EXAMPLES,
  ROOT_HELP_TOPICS,
  ROOT_PROFILE_EXAMPLES,
  getPublicRootCommands,
  type HelpTopicName,
  type RootCommandEntry,
} from './command-catalog';

type HelpWriter = (line: string) => void;

function getTopicSummary(name: HelpTopicName): string {
  return ROOT_HELP_TOPICS.find((topic) => topic.name === name)?.summary || '';
}

function writeCommandTable(
  title: string,
  entries: readonly { name: string; summary: string }[],
  writeLine: HelpWriter
): void {
  writeLine(subheader(title));
  const maxWidth = Math.max(...entries.map((entry) => entry.name.length));
  for (const entry of entries) {
    writeLine(`  ${color(entry.name.padEnd(maxWidth + 2), 'command')} ${entry.summary}`);
  }
  writeLine('');
}

function writeGroupedCommands(group: RootCommandEntry['group'], writeLine: HelpWriter): void {
  const entries = getPublicRootCommands()
    .filter((entry) => entry.group === group)
    .map((entry) => ({ name: entry.name, summary: entry.summary }));

  const titles: Record<RootCommandEntry['group'], string> = {
    start: 'Start Here',
    manage: 'Profile Management',
    operations: 'Operations',
    runtime: 'Compatible Runtimes',
  };

  writeCommandTable(titles[group], entries, writeLine);
}

async function showProfilesHelp(writeLine: HelpWriter): Promise<void> {
  await initUI();
  writeLine(header('CCS Profiles Help'));
  writeLine('');
  writeCommandTable(
    'Profile Types',
    [
      { name: 'ccs auth create <name>', summary: 'Concurrent Claude account profile' },
      { name: 'ccs api create', summary: 'API-backed settings profile' },
      { name: 'ccs cliproxy create <name>', summary: 'Named CLIProxy variant profile' },
      { name: 'ccs env <profile>', summary: 'Export an existing profile for other tools' },
    ],
    writeLine
  );
  writeCommandTable('Examples', ROOT_PROFILE_EXAMPLES, writeLine);
  writeLine(`  ${dim('Deep help: ccs auth --help | ccs api --help | ccs cliproxy --help')}`);
  writeLine('');
}

async function showProvidersHelp(writeLine: HelpWriter): Promise<void> {
  await initUI();
  writeLine(header('CCS Providers Help'));
  writeLine('');
  writeCommandTable('Built-in OAuth Providers', BUILTIN_PROVIDER_SHORTCUTS, writeLine);
  writeCommandTable(
    'Common Setup Paths',
    [
      {
        name: 'ccs <provider> --auth',
        summary: 'Authenticate a provider account without launching',
      },
      { name: 'ccs api create --preset <id>', summary: 'Create an API-backed provider profile' },
      { name: 'ccs config', summary: 'Use the dashboard for provider and model setup' },
      { name: 'ccs help kiro', summary: 'Kiro-specific auth methods and IDC flags' },
    ],
    writeLine
  );
  writeCommandTable(
    'GitLab Duo Flags',
    [
      {
        name: 'ccs gitlab --auth --gitlab-token-login',
        summary: 'Authenticate with a GitLab Personal Access Token',
      },
      {
        name: 'ccs gitlab --auth --token-login',
        summary: 'Legacy alias for GitLab PAT login (still supported)',
      },
      {
        name: 'ccs gitlab --auth --gitlab-url <url>',
        summary: 'Use a self-hosted GitLab base URL during OAuth or PAT auth',
      },
    ],
    writeLine
  );
  writeLine(`  ${dim('Deep help: ccs cliproxy --help | ccs api --help')}`);
  writeLine('');
}

export async function showProviderShortcutHelp(
  provider: CLIProxyProvider,
  writeLine: HelpWriter = console.log
): Promise<void> {
  if (provider === 'kiro') {
    await showKiroHelp(writeLine);
    return;
  }

  await initUI();

  const providerEntry = BUILTIN_PROVIDER_SHORTCUTS.find((entry) => entry.name === provider);
  writeLine(header(`CCS ${provider} Shortcut Help`));
  writeLine('');
  writeLine(`  ${providerEntry?.summary || 'CLIProxy OAuth provider shortcut'}.`);
  writeLine('');
  writeCommandTable(
    'Common Commands',
    [
      { name: `ccs ${provider} --auth`, summary: 'Authenticate the provider account via CLIProxy' },
      { name: `ccs ${provider} --accounts`, summary: 'List or manage stored CLIProxy accounts' },
      { name: `ccs ${provider} --config`, summary: 'Open the provider config flow' },
      { name: `ccs ${provider} "task"`, summary: 'Run Claude through this provider shortcut' },
    ],
    writeLine
  );

  if (provider === 'gitlab') {
    writeCommandTable(
      'GitLab Duo Flags',
      [
        {
          name: '--gitlab-token-login',
          summary: 'Use a GitLab Personal Access Token instead of browser OAuth',
        },
        {
          name: '--token-login',
          summary: 'Legacy alias for `--gitlab-token-login`',
        },
        {
          name: '--gitlab-url <url>',
          summary: 'Target a self-hosted GitLab base URL',
        },
      ],
      writeLine
    );
  }

  writeLine(`  ${dim('See also: ccs help providers | ccs cliproxy --help')}`);
  writeLine('');
}

async function showKiroHelp(writeLine: HelpWriter): Promise<void> {
  await initUI();
  writeLine(header('CCS Kiro Help'));
  writeLine('');
  writeLine('  Kiro supports Builder ID, IDC, and management-only social OAuth flows.');
  writeLine('');
  writeCommandTable(
    'Authentication Methods',
    [
      { name: 'ccs kiro --auth', summary: 'Default AWS Builder ID device-code flow' },
      {
        name: 'ccs kiro --auth --kiro-auth-method aws-authcode',
        summary: 'AWS Builder ID auth-code flow via local callback server',
      },
      {
        name: 'ccs kiro --auth --kiro-auth-method idc',
        summary: 'IAM Identity Center flow; requires IDC start URL',
      },
      {
        name: 'ccs config',
        summary: 'Dashboard flow for GitHub OAuth and account management',
      },
    ],
    writeLine
  );
  writeCommandTable(
    'Kiro Flags',
    [
      {
        name: '--kiro-auth-method <aws|aws-authcode|google|github|idc>',
        summary: 'Select the Kiro auth method',
      },
      { name: '--kiro-idc-start-url <url>', summary: 'Required IDC start URL when using `idc`' },
      { name: '--kiro-idc-region <region>', summary: 'Optional IDC region override' },
      { name: '--kiro-idc-flow <authcode|device>', summary: 'IDC flow type; defaults to authcode' },
      {
        name: '--paste-callback',
        summary: 'Paste the final callback URL for callback-based CLI auth flows',
      },
      { name: '--import', summary: 'Import an existing Kiro IDE token instead of starting OAuth' },
    ],
    writeLine
  );
  writeCommandTable(
    'Examples',
    [
      { name: 'ccs kiro --auth', summary: 'Start the default Builder ID device flow' },
      {
        name: 'ccs kiro --auth --kiro-auth-method aws-authcode --paste-callback',
        summary: 'Use auth-code flow and paste the callback URL manually',
      },
      {
        name: 'ccs kiro --auth --kiro-auth-method idc --kiro-idc-start-url https://d-xxx.awsapps.com/start',
        summary: 'Start IDC auth with the default authcode flow',
      },
      {
        name: 'ccs kiro --auth --kiro-auth-method idc --kiro-idc-start-url https://d-xxx.awsapps.com/start --kiro-idc-flow device',
        summary: 'Use IDC device-code flow instead of authcode',
      },
    ],
    writeLine
  );
  writeLine(
    `  ${dim('GitHub OAuth is dashboard-only: ccs config -> Accounts -> Add Kiro account')}`
  );
  writeLine('');
}

async function showTargetsHelp(writeLine: HelpWriter): Promise<void> {
  await initUI();
  writeLine(header('CCS Targets Help'));
  writeLine('');
  writeCommandTable('Target Routing', ROOT_COMPATIBLE_ALIAS_EXAMPLES, writeLine);
  writeCommandTable(
    'Examples',
    [
      { name: 'ccs glm --target droid', summary: 'Run a profile on Droid instead of Claude' },
      {
        name: 'ccs --target codex',
        summary: 'Open a native Codex session with your current setup',
      },
      { name: 'ccs codex-api --target codex', summary: 'Run a routed API bridge on native Codex' },
    ],
    writeLine
  );
}

export async function handleHelpCommand(writeLine: HelpWriter = console.log): Promise<void> {
  await initUI();

  writeLine(header(`CCS CLI v${packageJson.version}`));
  writeLine('');
  writeLine('  Claude profile switching, provider routing, runtime bridges, and browser tooling.');
  writeLine('');

  writeLine(subheader('Usage'));
  writeLine(`  ${color('ccs <profile> [claude-args...]', 'command')}`);
  writeLine(`  ${color('ccs <command> [options]', 'command')}`);
  writeLine(`  ${color('ccs help <topic>', 'command')}`);
  writeLine('');

  writeGroupedCommands('start', writeLine);
  writeGroupedCommands('manage', writeLine);
  writeGroupedCommands('runtime', writeLine);
  writeGroupedCommands('operations', writeLine);

  writeCommandTable(
    'OAuth Provider Shortcuts',
    BUILTIN_PROVIDER_SHORTCUTS.map((entry) => ({
      name: `ccs ${entry.name}`,
      summary: entry.summary,
    })),
    writeLine
  );

  writeCommandTable('Examples', ROOT_PROFILE_EXAMPLES, writeLine);
  writeCommandTable('Targets and Aliases', ROOT_COMPATIBLE_ALIAS_EXAMPLES, writeLine);
  writeCommandTable(
    'More Help',
    [
      { name: 'ccs help profiles', summary: getTopicSummary('profiles') },
      { name: 'ccs help providers', summary: getTopicSummary('providers') },
      { name: 'ccs help browser', summary: getTopicSummary('browser') },
      { name: 'ccs help completion', summary: getTopicSummary('completion') },
      { name: 'ccs help targets', summary: getTopicSummary('targets') },
      { name: 'ccs api --help', summary: 'Deep help for API profile lifecycle commands' },
      {
        name: 'ccs cliproxy --help',
        summary: 'Deep help for variants, routing, quota, and lifecycle',
      },
      { name: 'ccs proxy --help', summary: 'Deep help for the OpenAI-compatible local proxy' },
      { name: 'ccs docker --help', summary: 'Deep help for Docker deployment commands' },
      { name: 'ccs cursor --help', summary: 'Deep help for Cursor runtime/admin commands' },
      { name: 'ccs copilot --help', summary: 'Deep help for deprecated GitHub Copilot commands' },
    ],
    writeLine
  );

  writeLine(`  ${dim('Flags: -h/--help, -v/--version, -sc/--shell-completion, --target <cli>')}`);
  writeLine('');
}

function listHelpTargets(): string {
  return ROOT_HELP_TOPICS.map((topic) => topic.name).join(', ');
}

export async function handleHelpRoute(
  args: string[],
  writeLine: HelpWriter = console.log
): Promise<void> {
  const topic = args[0] as HelpTopicName | undefined;
  if (!topic) {
    await handleHelpCommand(writeLine);
    return;
  }

  if (topic === 'profiles') {
    await showProfilesHelp(writeLine);
    return;
  }
  if (topic === 'providers') {
    await showProvidersHelp(writeLine);
    return;
  }
  if (topic === 'kiro') {
    await showKiroHelp(writeLine);
    return;
  }
  if (topic === 'targets') {
    await showTargetsHelp(writeLine);
    return;
  }
  if (topic === 'browser') {
    await (await import('./browser-command')).showBrowserHelp(writeLine);
    return;
  }
  if (topic === 'completion') {
    const { showShellCompletionHelp } = await import('./shell-completion-command');
    showShellCompletionHelp(writeLine);
    return;
  }

  const commandHandlers: Partial<Record<string, () => Promise<void>>> = {
    api: async () => (await import('./api-command/help')).showApiCommandHelp(writeLine),
    auth: async () => {
      const authModule = await import('../auth/auth-commands');
      const AuthCommands = authModule.default;
      await new AuthCommands().showHelp();
    },
    cleanup: async () => (await import('./cleanup-command')).handleCleanupCommand(['--help']),
    browser: async () => (await import('./browser-command')).showBrowserHelp(writeLine),
    cliproxy: async () => (await import('./cliproxy/help-subcommand')).showHelp(),
    copilot: async () =>
      process.exit(await (await import('./copilot-command')).handleCopilotCommand(['--help'])),
    cursor: async () => await showProviderShortcutHelp('cursor', writeLine),
    proxy: async () =>
      process.exit(await (await import('./proxy-command')).handleProxyCommand(['--help'])),
    docker: async () => (await import('./docker/help-subcommand')).showHelp(),
    migrate: async () => (await import('./migrate-command')).printMigrateHelp(),
    setup: async () => (await import('./setup-command')).handleSetupCommand(['--help']),
    tokens: async () =>
      process.exit(await (await import('./tokens-command')).handleTokensCommand(['--help'])),
  };

  const handler = commandHandlers[topic];
  if (handler) {
    await handler();
    return;
  }

  await initUI();
  writeLine(color(`Unknown help topic or command: ${topic}`, 'error'));
  writeLine('');
  writeLine(`  ${dim(`Available help topics: ${listHelpTargets()}`)}`);
  writeLine('');
  process.exitCode = 1;
}

export function getRootHelpVisibleCommands(): string[] {
  return getPublicRootCommands().map((entry) => entry.name);
}

export function getRootHelpCatalogEntries(): readonly RootCommandEntry[] {
  return ROOT_COMMAND_CATALOG;
}
