import { COPILOT_SUBCOMMANDS } from '../copilot/constants';
import { CLIPROXY_PROVIDER_IDS } from '../cliproxy/provider-capabilities';

export type HelpTopicName =
  | 'profiles'
  | 'providers'
  | 'kiro'
  | 'browser'
  | 'completion'
  | 'targets';

export interface HelpTopicEntry {
  name: HelpTopicName;
  summary: string;
}

export interface RootCommandEntry {
  name: string;
  summary: string;
  group: 'start' | 'manage' | 'runtime' | 'operations';
  visibility: 'public' | 'hidden';
  aliases?: readonly string[];
}

export interface ShortcutEntry {
  name: string;
  summary: string;
}

export const ROOT_HELP_TOPICS: readonly HelpTopicEntry[] = [
  { name: 'profiles', summary: 'Account profiles, API profiles, and CLIProxy variants' },
  { name: 'providers', summary: 'Built-in OAuth providers and runtime shortcuts' },
  { name: 'kiro', summary: 'Kiro auth methods, IDC flags, and callback guidance' },
  { name: 'browser', summary: 'Claude Browser Attach and Codex Browser Tools guidance' },
  { name: 'completion', summary: 'Shell completion install, refresh, and testing' },
  { name: 'targets', summary: 'Claude, Droid, and Codex target routing' },
] as const;

export const ROOT_COMMAND_CATALOG: readonly RootCommandEntry[] = [
  {
    name: 'help',
    summary: 'Show root help or help for a topic/command',
    group: 'start',
    aliases: ['--help', '-h'],
    visibility: 'public',
  },
  {
    name: 'version',
    summary: 'Show version and install details',
    group: 'start',
    aliases: ['--version', '-v'],
    visibility: 'public',
  },
  {
    name: 'setup',
    summary: 'Run the first-time setup wizard',
    group: 'start',
    aliases: ['--setup'],
    visibility: 'public',
  },
  {
    name: 'config',
    summary: 'Open the dashboard and config subcommands',
    group: 'start',
    visibility: 'public',
  },
  {
    name: 'doctor',
    summary: 'Run health checks and diagnostics',
    group: 'start',
    aliases: ['--doctor'],
    visibility: 'public',
  },
  {
    name: 'auth',
    summary: 'Manage concurrent Claude accounts',
    group: 'manage',
    visibility: 'public',
  },
  {
    name: 'api',
    summary: 'Create, discover, copy, export, and import API profiles',
    group: 'manage',
    visibility: 'public',
  },
  {
    name: 'cliproxy',
    summary: 'Manage CLIProxy variants, quota, and local lifecycle',
    group: 'manage',
    visibility: 'public',
  },
  {
    name: 'env',
    summary: 'Export profile env for third-party tools',
    group: 'manage',
    visibility: 'public',
  },
  {
    name: 'persist',
    summary: 'Write profile setup to ~/.claude/settings.json',
    group: 'manage',
    visibility: 'public',
  },
  { name: 'tokens', summary: 'Manage CLIProxy auth tokens', group: 'manage', visibility: 'public' },
  {
    name: 'migrate',
    summary: 'Move legacy JSON config to unified YAML config',
    group: 'manage',
    aliases: ['--migrate'],
    visibility: 'public',
  },
  {
    name: 'cursor',
    summary: 'Run Cursor via CLIProxy or manage Cursor provider auth',
    group: 'runtime',
    visibility: 'public',
  },
  {
    name: 'proxy',
    summary: 'Start or inspect the OpenAI-compatible local proxy',
    group: 'runtime',
    visibility: 'public',
  },
  {
    name: 'browser',
    summary: 'Set up, inspect, and control Claude Browser Attach and Codex Browser Tools',
    group: 'runtime',
    visibility: 'public',
  },
  {
    name: 'copilot',
    summary: 'Run or manage the deprecated GitHub Copilot bridge',
    group: 'runtime',
    visibility: 'public',
  },
  {
    name: 'docker',
    summary: 'Deploy or operate the bundled Docker stack',
    group: 'operations',
    visibility: 'public',
  },
  {
    name: 'sync',
    summary: 'Sync delegation commands and skills',
    group: 'operations',
    aliases: ['--sync'],
    visibility: 'public',
  },
  {
    name: 'update',
    summary: 'Update CCS to the latest version',
    group: 'operations',
    aliases: ['--update'],
    visibility: 'public',
  },
  {
    name: 'cleanup',
    summary: 'Remove old CCS and CLIProxy logs',
    group: 'operations',
    aliases: ['--cleanup'],
    visibility: 'public',
  },
  {
    name: '--shell-completion',
    summary: 'Install shell completion',
    group: 'operations',
    aliases: ['-sc'],
    visibility: 'hidden',
  },
  {
    name: '--install',
    summary: 'Post-install bootstrap hook',
    group: 'operations',
    visibility: 'hidden',
  },
  {
    name: '--uninstall',
    summary: 'Post-uninstall cleanup hook',
    group: 'operations',
    visibility: 'hidden',
  },
  {
    name: '__complete',
    summary: 'Hidden shell completion backend',
    group: 'operations',
    visibility: 'hidden',
  },
] as const;

export const BUILTIN_PROVIDER_SHORTCUTS: readonly ShortcutEntry[] = CLIPROXY_PROVIDER_IDS.map(
  (name) => ({
    name,
    summary:
      {
        gemini: 'Google Gemini via CLIProxy OAuth',
        codex: 'OpenAI Codex via CLIProxy OAuth',
        agy: 'Antigravity via CLIProxy OAuth',
        qwen: 'Qwen Code via CLIProxy OAuth',
        iflow: 'iFlow via CLIProxy OAuth',
        kiro: 'Kiro via CLIProxy OAuth',
        ghcp: 'Deprecated GitHub Copilot via CLIProxy OAuth',
        claude: 'Claude via CLIProxy OAuth',
        kimi: 'Kimi via CLIProxy OAuth',
        cursor: 'Cursor via CLIProxy OAuth',
        gitlab: 'GitLab Duo via CLIProxy OAuth',
        codebuddy: 'CodeBuddy via CLIProxy OAuth',
        kilo: 'Kilo AI via CLIProxy OAuth',
      }[name] || 'CLIProxy OAuth provider',
  })
);

export const ROOT_PROFILE_EXAMPLES: readonly ShortcutEntry[] = [
  { name: 'ccs auth create work', summary: 'Create a concurrent Claude account profile' },
  {
    name: 'ccs --effort high "debug this"',
    summary: 'Use a native Claude effort override for one session',
  },
  { name: 'ccs api create --preset glm', summary: 'Create a GLM-backed API profile' },
  {
    name: 'ccs api create --preset anthropic --1m',
    summary: 'Create a Claude API profile with explicit [1m]',
  },
  {
    name: 'ccs env <profile> --format claude-extension --ide vscode',
    summary: 'Export IDE extension settings',
  },
] as const;

export const ROOT_COMPATIBLE_ALIAS_EXAMPLES: readonly ShortcutEntry[] = [
  { name: '--target claude|droid|codex', summary: 'Route a profile to the target runtime' },
  { name: 'ccs-droid / ccsd', summary: 'Explicit Droid runtime aliases' },
  {
    name: 'ccs-codex / ccsx / ccsxp',
    summary: 'Codex runtime aliases plus the cliproxy shortcut',
  },
] as const;

export const ROOT_COMMAND_FLAGS = [
  '--help',
  '-h',
  '--version',
  '-v',
  '--shell-completion',
  '-sc',
] as const;
export const AUTH_SUBCOMMANDS = [
  'create',
  'backup',
  'list',
  'show',
  'remove',
  'default',
  'reset-default',
] as const;
export const API_SUBCOMMANDS = [
  'create',
  'list',
  'discover',
  'copy',
  'export',
  'import',
  'remove',
] as const;
export const CLIPROXY_SUBCOMMANDS = [
  'create',
  'edit',
  'list',
  'remove',
  'routing',
  'catalog',
  'sync',
  'quota',
  'start',
  'restart',
  'status',
  'stop',
  'doctor',
  'default',
  'pause',
  'resume',
] as const;
export const CONFIG_SUBCOMMANDS = ['auth', 'channels', 'image-analysis', 'thinking'] as const;
export const DOCKER_SUBCOMMANDS = ['up', 'down', 'status', 'update', 'logs', 'config'] as const;
export const PROXY_SUBCOMMANDS = ['start', 'stop', 'status', 'activate'] as const;
export const TOKENS_FLAGS = [
  '--show',
  '--api-key',
  '--secret',
  '--regenerate-secret',
  '--variant',
  '--reset',
  '--help',
  '-h',
] as const;
export const MIGRATE_FLAGS = ['--dry-run', '--rollback', '--list-backups', '--help'] as const;
export const CLEANUP_FLAGS = [
  '--errors',
  '--days=',
  '--dry-run',
  '--force',
  '--help',
  '-h',
] as const;
export const PROVIDER_FLAGS = [
  '--auth',
  '--add',
  '--paste-callback',
  '--accounts',
  '--use',
  '--config',
  '--thinking',
  '--effort',
  '--1m',
  '--no-1m',
  '--browser',
  '--no-browser',
  '--logout',
  '--headless',
  '--port-forward',
  '--help',
  '-h',
] as const;

export const COMMAND_FLAG_SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  '--shell-completion': ['--bash', '--zsh', '--fish', '--powershell', '--force', '-f'],
  auth: ['--help', '-h'],
  api: ['--help', '-h'],
  cleanup: CLEANUP_FLAGS,
  config: ['--help', '-h', '--port', '-p', '--host', '-H', '--dev'],
  cursor: ['--help', '-h'],
  doctor: ['--fix', '-f', '--help', '-h'],
  browser: ['setup', 'status', 'doctor', 'policy', 'enable', 'disable', '--help', '-h'],
  docker: ['--help', '-h', '--host'],
  env: ['--format', '--shell', '--ide', '--help', '-h'],
  migrate: MIGRATE_FLAGS,
  tokens: TOKENS_FLAGS,
  update: ['--force', '--beta', '--dev', '--help', '-h'],
};

export const CURSOR_COMPLETION_SUBCOMMANDS = [
  '--auth',
  '--accounts',
  '--config',
  '--logout',
  '--help',
  '-h',
] as const;
export const COPILOT_COMPLETION_SUBCOMMANDS = [...COPILOT_SUBCOMMANDS, 'help'] as const;

export function getPublicRootCommands(): readonly RootCommandEntry[] {
  return ROOT_COMMAND_CATALOG.filter((entry) => entry.visibility === 'public');
}

export function getAllRootCommandTokens(): string[] {
  return uniqueStrings(
    ROOT_COMMAND_CATALOG.flatMap((entry) => [entry.name, ...(entry.aliases || [])])
  );
}

export function getPublicRootCommandTokens(): string[] {
  return uniqueStrings(
    ROOT_COMMAND_CATALOG.filter((entry) => entry.visibility === 'public').flatMap((entry) => [
      entry.name,
      ...(entry.aliases || []),
    ])
  );
}

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
