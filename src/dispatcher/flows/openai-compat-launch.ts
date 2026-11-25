import * as fs from 'fs';
import { fail, info } from '../../utils/ui';
import {
  isClaudeSubcommandInvocation,
  stripClaudeSubcommandSessionArgs,
} from '../../utils/claude-subcommand-detector';
import { createOpenAICompatLaunchSettings } from '../../utils/openai-compat-launch-settings';
import {
  buildOpenAICompatProxyEnv,
  resolveOpenAICompatProfileConfig,
  startOpenAICompatProxy,
  type OpenAICompatProfileConfig,
  type OpenAICompatProfileEnv,
  type StartOpenAICompatProxyResult,
} from '../../proxy';
import { isSettings, type Settings } from '../../types/config';

export interface PrepareOpenAICompatLaunchOptions {
  profileName: string;
  settingsPath: string;
  settings: Settings;
  settingsEnv: OpenAICompatProfileEnv;
  baseEnv: NodeJS.ProcessEnv;
  claudeConfigDir?: string;
  args: string[];
  transformArgs?: (args: string[]) => string[];
}

export interface PreparedOpenAICompatLaunch {
  profile: OpenAICompatProfileConfig;
  proxyStart: StartOpenAICompatProxyResult;
  envVars: NodeJS.ProcessEnv;
  launchArgs: string[];
  cleanup: () => void;
}

/**
 * Safely load an optional settings.json file without aborting the CLI on
 * missing or non-standard files (used by account instances whose settings.json
 * may be absent or empty).
 */
export function loadOptionalSettingsFile(settingsPath: string): Settings | null {
  try {
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return isSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolve and start the local OpenAI-compatible shaping proxy when the target
 * settings file configures an OpenAI-compatible upstream endpoint. Returns null
 * when the profile targets native Anthropic / Claude OAuth.
 */
export async function prepareOpenAICompatLaunch(
  options: PrepareOpenAICompatLaunchOptions
): Promise<PreparedOpenAICompatLaunch | null> {
  const openAICompatProfile = resolveOpenAICompatProfileConfig(
    options.profileName,
    options.settingsPath,
    options.settingsEnv
  );
  if (!openAICompatProfile) {
    return null;
  }

  const proxyStart = await startOpenAICompatProxy(openAICompatProfile, {
    insecure: openAICompatProfile.insecure,
  });
  if (!proxyStart.success) {
    process.stderr.write(
      String(fail(proxyStart.error || 'Failed to start local OpenAI-compatible proxy')) + '\n'
    );
    process.exit(1);
  }

  process.stderr.write(
    String(
      info(
        `Using local OpenAI-compatible proxy for "${options.profileName}" on port ${proxyStart.port}`
      )
    ) + '\n'
  );

  const proxyEnv: NodeJS.ProcessEnv = {
    ...options.baseEnv,
    ...buildOpenAICompatProxyEnv(
      openAICompatProfile,
      proxyStart.port,
      proxyStart.authToken || '',
      options.claudeConfigDir
    ),
  };
  delete proxyEnv.ANTHROPIC_API_KEY;

  // Claude subcommands reject `--settings` (it flips `agents` to list mode).
  // Routing env vars still flow via proxyEnv. Issue #1218.
  const isSubcommand = isClaudeSubcommandInvocation(options.args);
  const subcommandArgs = isSubcommand
    ? stripClaudeSubcommandSessionArgs(options.args)
    : options.args;

  const launchSettings = isSubcommand
    ? { settingsPath: options.settingsPath, cleanup: () => {} }
    : createOpenAICompatLaunchSettings(options.settingsPath, options.settings, { durable: true });

  const withTransforms = options.transformArgs
    ? options.transformArgs(isSubcommand ? subcommandArgs : options.args)
    : isSubcommand
      ? subcommandArgs
      : options.args;

  const launchArgs = isSubcommand
    ? withTransforms
    : ['--settings', launchSettings.settingsPath, ...withTransforms];

  return {
    profile: openAICompatProfile,
    proxyStart,
    envVars: proxyEnv,
    launchArgs,
    cleanup: launchSettings.cleanup,
  };
}
