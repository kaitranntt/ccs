import { detectShell, formatExportLine } from './env-command';
import { getSettingsPath } from '../utils/config-manager';
import { expandPath } from '../utils/helpers';
import { fail, info, ok } from '../utils/ui';
import {
  buildOpenAICompatProxyEnv,
  getOpenAICompatProxyStatus,
  listOpenAICompatProxyStatuses,
  resolveOpenAICompatProfileConfig,
  startOpenAICompatProxy,
  stopOpenAICompatProxy,
} from '../proxy';
import { loadConfigSafe, loadSettings } from '../config/config-loader-facade';
import { ProfileError } from '../errors';

function parseOptionValue(args: string[], key: string): string | undefined {
  const exactIndex = args.findIndex((arg) => arg === key);
  if (exactIndex !== -1 && args[exactIndex + 1]) {
    return args[exactIndex + 1];
  }

  const prefix = `${key}=`;
  const withEquals = args.find((arg) => arg.startsWith(prefix));
  return withEquals ? withEquals.slice(prefix.length) : undefined;
}

function hasHelpFlag(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

export function findPositionalArg(
  args: string[],
  optionsWithValues: string[] = [],
  flagOptions: string[] = []
): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      return i + 1 < args.length ? args[i + 1] : undefined;
    }
    if (arg.startsWith('-')) {
      if (flagOptions.includes(arg)) {
        continue;
      }
      if (optionsWithValues.includes(arg)) {
        i += 1;
      }
      continue;
    }
    return arg;
  }
  return undefined;
}

function showHelp(): number {
  console.log('OpenAI-Compatible Proxy');
  console.log('');
  console.log('Usage: ccs proxy <start|stop|status|activate> [profile] [options]');
  console.log('');
  console.log('Commands:');
  console.log(
    '  start <profile>   Start the local proxy for an OpenAI-compatible settings profile'
  );
  console.log('  stop [profile]    Stop the running proxy (or all proxies when omitted)');
  console.log('  status [profile]  Show daemon status');
  console.log('  activate [profile] Print shell exports for the running proxy');
  console.log('');
  console.log('Options:');
  console.log('  --port <n>        Pin an exact local proxy port for this launch');
  console.log('  --host <addr>     Bind the proxy server to a specific host (default: 127.0.0.1)');
  console.log('  --shell <name>    activate only: auto|bash|zsh|fish|powershell');
  console.log('  --fish            activate only: shorthand for --shell fish');
  console.log('  --insecure        Disable upstream TLS verification');
  console.log('');
  console.log('Examples:');
  console.log('  ccs proxy start hf');
  console.log('  eval "$(ccs proxy activate)"');
  console.log('  ccs proxy activate --fish');
  console.log('  ccs proxy status');
  console.log('  ccs proxy stop');
  console.log('');
  return 0;
}

function resolveProfile(profileName: string) {
  // Pre-check profile in config to avoid the generic error() + npm-install hint from getSettingsPath.
  const config = loadConfigSafe();
  if (!config.profiles[profileName]) {
    throw new ProfileError(
      `Profile "${profileName}" is not configured for an OpenAI-compatible endpoint`,
      profileName
    );
  }
  const settingsPath = expandPath(getSettingsPath(profileName));
  const settings = loadSettings(settingsPath);
  const profile = resolveOpenAICompatProfileConfig(profileName, settingsPath, settings.env || {});
  if (!profile) {
    throw new ProfileError(
      `Profile "${profileName}" is not configured for an OpenAI-compatible endpoint`,
      profileName
    );
  }
  return profile;
}

async function handleStart(args: string[]): Promise<number> {
  if (hasHelpFlag(args)) {
    return showHelp();
  }
  const profileName = findPositionalArg(args, ['--port', '--host'], ['--insecure']);
  if (!profileName) {
    console.error(
      fail('Usage: ccs proxy start <profile> [--port <n>] [--host <addr>] [--insecure]')
    );
    return 1;
  }

  const portValue = parseOptionValue(args, '--port');
  const host = parseOptionValue(args, '--host');
  const parsedPort = portValue ? Number(portValue) : undefined;
  if (
    portValue &&
    (parsedPort === undefined ||
      !/^\d+$/.test(portValue) ||
      !Number.isInteger(parsedPort) ||
      parsedPort < 1 ||
      parsedPort > 65535)
  ) {
    console.error(fail(`Invalid port: ${portValue}`));
    return 1;
  }
  const port = parsedPort;
  let profile;
  try {
    profile = resolveProfile(profileName);
  } catch (error) {
    console.error(fail((error as Error).message));
    return 1;
  }

  const result = await startOpenAICompatProxy(profile, {
    ...(port ? { port } : {}),
    ...(host ? { host } : {}),
    insecure: args.includes('--insecure'),
  });

  if (!result.success) {
    console.error(fail(result.error || 'Failed to start proxy'));
    return 1;
  }

  console.log(
    result.alreadyRunning
      ? info(`Proxy already running on port ${result.port}`)
      : ok(`Proxy started on port ${result.port}`)
  );
  return 0;
}

async function handleStatus(args: string[] = []): Promise<number> {
  if (hasHelpFlag(args)) {
    return showHelp();
  }
  const profileName = findPositionalArg(args);
  const printStatus = (status: Awaited<ReturnType<typeof getOpenAICompatProxyStatus>>) => {
    console.log(
      status.running
        ? ok(`Proxy running on port ${status.port ?? 'unknown'}`)
        : info(`Proxy is not running${status.port ? ` (last known port ${status.port})` : ''}`)
    );
    if (status.host && status.port) {
      console.log(`  Host: ${status.host}`);
      console.log(`  Local URL: http://${status.host}:${status.port}`);
    }
    if (status.profileName) {
      console.log(`  Profile: ${status.profileName}`);
    }
    if (status.baseUrl) {
      console.log(`  Base URL: ${status.baseUrl}`);
    }
    if (status.model) {
      console.log(`  Model: ${status.model}`);
    }
    if (status.pid) {
      console.log(`  PID: ${status.pid}`);
    }
  };

  if (profileName) {
    const status = await getOpenAICompatProxyStatus(profileName);
    if (!status.running && !status.profileName) {
      console.log(info('Proxy is not running'));
      return 0;
    }
    printStatus(status);
    return 0;
  }

  const status = await getOpenAICompatProxyStatus();
  if (!status.running && !status.profileName) {
    console.log(info('Proxy is not running'));
    return 0;
  }

  if (status.running && !status.profileName) {
    const running = (await listOpenAICompatProxyStatuses()).filter((entry) => entry.running);
    for (const entry of running) {
      printStatus(entry);
    }
    return 0;
  }

  printStatus(status);
  return 0;
}

async function handleActivate(args: string[]): Promise<number> {
  if (hasHelpFlag(args)) {
    return showHelp();
  }
  const profileName = findPositionalArg(args, ['--shell']);
  if (!profileName) {
    const running = (await listOpenAICompatProxyStatuses()).filter((entry) => entry.running);
    if (running.length > 1) {
      console.error(
        fail('Multiple proxies are running. Specify a profile: ccs proxy activate <profile>')
      );
      return 1;
    }
  }
  const status = await getOpenAICompatProxyStatus(profileName);
  if (!status.running || !status.profileName || !status.port || !status.authToken) {
    console.error(fail('Proxy is not running. Start it with: ccs proxy start <profile>'));
    return 1;
  }

  const shell = detectShell(args.includes('--fish') ? 'fish' : parseOptionValue(args, '--shell'));
  let profile;
  try {
    profile = resolveProfile(status.profileName);
  } catch (error) {
    console.error(fail((error as Error).message));
    return 1;
  }

  const env = buildOpenAICompatProxyEnv(
    profile,
    status.port,
    status.authToken,
    undefined,
    status.host || '127.0.0.1'
  );
  Object.entries(env).forEach(([key, value]) => {
    console.log(formatExportLine(shell, key, value));
  });
  return 0;
}

export async function handleProxyCommand(args: string[]): Promise<number> {
  const subcommand = args[0];
  switch (subcommand) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return showHelp();
    case 'start':
      return handleStart(args.slice(1));
    case 'stop': {
      if (hasHelpFlag(args.slice(1))) {
        return showHelp();
      }
      const profileName = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
      const result = await stopOpenAICompatProxy(profileName);
      if (!result.success) {
        console.error(fail(result.error || 'Failed to stop proxy'));
        return 1;
      }
      console.log(ok(profileName ? `Proxy stopped for profile ${profileName}` : 'Proxy stopped'));
      return 0;
    }
    case 'status':
      return handleStatus(args.slice(1));
    case 'activate':
      return handleActivate(args.slice(1));
    default:
      console.error(fail(`Unknown proxy subcommand: ${subcommand}`));
      return 1;
  }
}
