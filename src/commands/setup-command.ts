/**
 * Setup Command Handler
 *
 * Interactive first-time setup wizard for CCS.
 * Guides users through initial configuration including:
 * - Local vs Remote CLIProxy mode selection
 * - Remote proxy configuration (host, port, auth token)
 * - Default profile selection
 *
 * Usage: ccs setup
 *
 * Related: Issue #142 - remote CLIProxyAPI configuration
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { initUI, header, ok, info, warn } from '../utils/ui';

import { DEFAULT_CLIPROXY_SERVER_CONFIG } from '../config/unified-config-types';

import { CLIPROXY_DEFAULT_PORT } from '../cliproxy/config/port-manager';
import {
  getCcsDir,
  hasUnifiedConfig,
  loadOrCreateUnifiedConfig,
  loadUnifiedConfig,
  mutateConfig,
} from '../config/config-loader-facade';

/** Custom error for user cancellation (Ctrl+C) */
class UserCancelledError extends Error {
  constructor() {
    super('Setup cancelled by user');
    this.name = 'UserCancelledError';
  }
}

/**
 * Create readline interface for interactive prompts
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input with optional default value
 * Handles Ctrl+C gracefully by rejecting with UserCancelledError
 */
async function prompt(
  rl: readline.Interface,
  question: string,
  defaultValue?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const displayQuestion = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;

    const onClose = () => {
      reject(new UserCancelledError());
    };

    rl.once('close', onClose);
    rl.question(displayQuestion, (answer) => {
      rl.removeListener('close', onClose);
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Prompt user for yes/no confirmation
 */
async function confirm(
  rl: readline.Interface,
  question: string,
  defaultYes: boolean = true
): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await prompt(rl, `${question} ${hint}`);

  if (answer === '') return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/**
 * Prompt user to select from numbered options
 */
async function selectOption(
  rl: readline.Interface,
  question: string,
  options: { label: string; value: string; description?: string }[]
): Promise<string> {
  console.log('');
  console.log(question);
  console.log('');

  options.forEach((opt, idx) => {
    const desc = opt.description ? ` - ${opt.description}` : '';
    console.log(`  ${idx + 1}) ${opt.label}${desc}`);
  });

  console.log('');
  const answer = await prompt(rl, 'Enter choice (number)', '1');
  const idx = parseInt(answer, 10) - 1;

  if (idx >= 0 && idx < options.length) {
    return options[idx].value;
  }

  // Invalid selection, default to first
  console.log(warn(`Invalid selection, using default: ${options[0].label}`));
  return options[0].value;
}

/**
 * Check if this is a first-time install (config exists but is empty/unconfigured).
 * Returns true if user should be prompted to run setup wizard.
 *
 * Detection priority:
 * 1. setup_completed flag (explicit wizard completion)
 * 2. Unified config content (profiles, accounts, variants, oauth_accounts, remote proxy)
 * 3. Legacy config.json profiles (GLM, Kimi)
 * 4. Legacy profiles.json accounts
 */
export function isFirstTimeInstall(): boolean {
  // Check unified config first (config.yaml)
  if (hasUnifiedConfig()) {
    let loaded: ReturnType<typeof loadUnifiedConfig>;
    try {
      loaded = loadUnifiedConfig();
    } catch {
      // Config exists but is corrupted/unparseable — treat as not first-time so we
      // don't run the setup wizard; the YAML error was already printed by loadUnifiedConfig.
      console.log(warn('Warning: ~/.ccs/config.yaml exists but appears corrupted'));
      console.log(info('  Run `ccs setup --force` to reset, or `ccs doctor` to diagnose'));
      return false;
    }

    // Config exists but is corrupted/invalid - don't treat as first-time
    if (loaded === null) {
      console.log(warn('Warning: ~/.ccs/config.yaml exists but appears corrupted'));
      console.log(info('  Run `ccs setup --force` to reset, or `ccs doctor` to diagnose'));
      return false;
    }

    // If setup wizard was completed, NOT first-time install
    if (loaded.setup_completed) {
      return false;
    }

    // Check for any meaningful configuration in unified config
    const hasProfiles = Object.keys(loaded.profiles || {}).length > 0;
    const hasAccounts = Object.keys(loaded.accounts || {}).length > 0;
    const hasVariants = Object.keys(loaded.cliproxy?.variants || {}).length > 0;
    const hasOAuthAccounts = Object.keys(loaded.cliproxy?.oauth_accounts || {}).length > 0;
    const hasRemoteProxy =
      loaded.cliproxy_server?.remote?.enabled && loaded.cliproxy_server?.remote?.host;

    // If any of these exist in unified config, user has configured something
    if (hasProfiles || hasAccounts || hasVariants || hasOAuthAccounts || hasRemoteProxy) {
      return false;
    }
  }

  // Also check legacy config.json for existing profiles
  // This prevents treating users with GLM/Kimi in config.json as "first-time installs"
  const ccsDir = getCcsDir();
  const legacyConfigPath = path.join(ccsDir, 'config.json');

  if (fs.existsSync(legacyConfigPath)) {
    try {
      const content = fs.readFileSync(legacyConfigPath, 'utf8');
      const legacyConfig = JSON.parse(content) as { profiles?: Record<string, string> };

      if (legacyConfig.profiles && Object.keys(legacyConfig.profiles).length > 0) {
        // Has legacy profiles - NOT first time
        return false;
      }
    } catch {
      // Legacy config exists but is invalid - ignore and continue
    }
  }

  // Also check profiles.json for existing accounts
  const legacyProfilesPath = path.join(ccsDir, 'profiles.json');

  if (fs.existsSync(legacyProfilesPath)) {
    try {
      const content = fs.readFileSync(legacyProfilesPath, 'utf8');
      const legacyProfiles = JSON.parse(content) as { profiles?: Record<string, unknown> };

      if (legacyProfiles.profiles && Object.keys(legacyProfiles.profiles).length > 0) {
        // Has legacy accounts - NOT first time
        return false;
      }
    } catch {
      // Legacy profiles exists but is invalid - ignore and continue
    }
  }

  // No meaningful configuration found anywhere
  return true;
}

/**
 * Configure remote CLIProxy settings interactively
 */
async function configureRemoteProxy(rl: readline.Interface): Promise<{
  host: string;
  port?: number;
  protocol: 'http' | 'https';
  authToken: string;
}> {
  console.log('');
  console.log(info('Configure Remote CLIProxyAPI Connection'));
  console.log('');
  console.log('  Enter the details for your remote CLIProxyAPI server.');
  console.log('  Example: your-server.example.com');
  console.log('');

  // Host - with protocol stripping
  let host = await prompt(rl, 'Remote host (hostname or IP)');
  if (!host) {
    throw new Error('Host is required for remote proxy mode');
  }
  // Strip protocol if user included it (common mistake)
  host = host.replace(/^https?:\/\//, '');
  // Strip trailing slashes
  host = host.replace(/\/+$/, '');

  // Protocol
  const protocol = (await selectOption(rl, 'Protocol:', [
    { label: 'HTTPS', value: 'https', description: 'Secure connection (recommended)' },
    { label: 'HTTP', value: 'http', description: 'Unencrypted connection' },
  ])) as 'http' | 'https';

  // Port (optional) - with validation
  const defaultPort = protocol === 'https' ? '443' : String(CLIPROXY_DEFAULT_PORT);
  const portStr = await prompt(rl, `Port (leave empty for default ${defaultPort})`);
  let port: number | undefined;
  if (portStr) {
    const parsed = parseInt(portStr, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535 || !Number.isInteger(parsed)) {
      console.log(warn(`Invalid port "${portStr}", using default: ${defaultPort}`));
      port = undefined; // Use default
    } else {
      port = parsed;
    }
  }

  // Auth token
  console.log('');
  console.log(info('Authentication'));
  console.log('  The auth token is configured in your CLIProxyAPI config.yaml');
  console.log('  under api-keys section. Example: "ccs-internal-managed"');
  console.log('');

  const authToken = await prompt(rl, 'Auth token', 'ccs-internal-managed');

  return { host, port, protocol, authToken };
}

/**
 * Main setup wizard
 */
async function runSetupWizard(force: boolean = false): Promise<void> {
  const rl = createReadline();

  try {
    console.log('');
    console.log(header('CCS First-Time Setup'));
    console.log('');

    // Check if already configured
    if (!force && !isFirstTimeInstall()) {
      console.log(info('CCS is already configured.'));
      console.log('  Use --force to reconfigure, or run `ccs config` for the dashboard.');
      console.log('');
      rl.close();
      return;
    }

    console.log('Welcome to CCS (Claude Code Switch)!');
    console.log('This wizard will help you configure CCS for first-time use.');
    console.log('');

    // Step 1: Local vs Remote mode
    const proxyMode = await selectOption(
      rl,
      'How do you want to use CLIProxy providers (gemini, codex, agy)?',
      [
        {
          label: 'Local (Recommended)',
          value: 'local',
          description: 'CCS auto-starts CLIProxyAPI binary on your machine',
        },
        {
          label: 'Remote Server',
          value: 'remote',
          description: 'Connect to a remote CLIProxyAPI instance (Issue #142)',
        },
        {
          label: 'Skip CLIProxy',
          value: 'skip',
          description: 'Only use API profiles (GLM, Kimi) or Claude accounts',
        },
      ]
    );

    // Load or create config
    const config = loadOrCreateUnifiedConfig();

    if (proxyMode === 'remote') {
      // Configure remote proxy
      const remoteConfig = await configureRemoteProxy(rl);

      config.cliproxy_server = {
        remote: {
          enabled: true,
          host: remoteConfig.host,
          port: remoteConfig.port,
          protocol: remoteConfig.protocol,
          auth_token: remoteConfig.authToken,
        },
        fallback: {
          enabled: true,
          auto_start: false,
        },
        local: {
          port: CLIPROXY_DEFAULT_PORT,
          auto_start: false, // Disable local auto-start when using remote
        },
      };

      console.log('');
      console.log(ok('Remote proxy configured successfully!'));
      console.log('');
      console.log(
        `  URL: ${remoteConfig.protocol}://${remoteConfig.host}${remoteConfig.port ? `:${remoteConfig.port}` : ''}`
      );
      console.log(`  Auth: ${remoteConfig.authToken ? '[configured]' : '[none]'}`);
    } else if (proxyMode === 'local') {
      // Ensure local mode is configured
      config.cliproxy_server = {
        ...DEFAULT_CLIPROXY_SERVER_CONFIG,
        remote: {
          enabled: false,
          host: '',
          protocol: 'http',
          auth_token: '',
        },
        local: {
          port: CLIPROXY_DEFAULT_PORT,
          auto_start: true,
        },
      };

      console.log('');
      console.log(ok('Local proxy mode configured!'));
      console.log('  CLIProxyAPI will auto-start when you use gemini/codex/agy profiles.');
    } else {
      // Skip CLIProxy - just use local config
      console.log('');
      console.log(ok('CLIProxy skipped.'));
      console.log('  You can still use API profiles (GLM, Kimi) or Claude accounts.');
    }

    // Step 2: Ask about API profiles
    console.log('');
    const wantsApiProfile = await confirm(
      rl,
      'Do you want to set up an API profile (GLM, Kimi, custom)?',
      false
    );

    if (wantsApiProfile) {
      console.log('');
      console.log(info('Creating API profiles...'));
      console.log('  Use the following commands to create profiles:');
      console.log('');
      console.log('    ccs api create glm --preset glm');
      console.log('    ccs api create km --preset km');
      console.log('    ccs api create custom --prompt');
      console.log('');
      console.log('  After creating, edit the settings file to add your API key.');
    }

    mutateConfig((currentConfig) => {
      currentConfig.setup_completed = true;
      currentConfig.cliproxy_server = config.cliproxy_server;
    });

    // Final summary
    console.log('');
    console.log(header('Setup Complete!'));
    console.log('');
    console.log('Quick start commands:');
    console.log('');

    if (proxyMode !== 'skip') {
      console.log('  ccs gemini          # Use Gemini via CLIProxy (OAuth)');
      console.log('  ccs codex           # Use Codex via CLIProxy (OAuth)');
      console.log('  ccs agy             # Use Antigravity via CLIProxy (OAuth)');
    }

    console.log('  ccs                 # Use default Claude CLI');
    console.log('  ccs config          # Open web dashboard');
    console.log('  ccs doctor          # Check configuration health');
    console.log('');

    if (proxyMode === 'remote') {
      console.log(info('Remote proxy tip:'));
      console.log('  If connection fails, CCS will offer to start local proxy as fallback.');
      console.log('  Edit ~/.ccs/config.yaml to adjust remote settings.');
      console.log('');
    }

    console.log(info('Configuration saved to: ~/.ccs/config.yaml'));
    console.log('');
  } catch (err) {
    // Handle user cancellation gracefully
    if (err instanceof UserCancelledError) {
      console.log('');
      console.log(info('Setup cancelled.'));
      console.log('  Run `ccs setup` when ready to configure.');
      console.log('');
      return;
    }
    // Handle other errors with user-friendly message
    const message = err instanceof Error ? err.message : String(err);
    console.log('');
    console.log(warn(`Setup failed: ${message}`));
    console.log(info('  Run `ccs setup` to try again.'));
    console.log('');
  } finally {
    rl.close();
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { force: boolean; help: boolean } {
  return {
    force: args.includes('--force') || args.includes('-f'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log('');
  console.log('Usage: ccs setup [options]');
  console.log('');
  console.log('Interactive first-time setup wizard for CCS.');
  console.log('');
  console.log('Options:');
  console.log('  --force, -f     Force setup even if already configured');
  console.log('  --help, -h      Show this help message');
  console.log('');
  console.log('This wizard helps you configure:');
  console.log('  - Local vs Remote CLIProxy mode');
  console.log('  - Remote proxy connection (host, port, auth token)');
  console.log('  - API profile creation');
  console.log('');
  console.log('Examples:');
  console.log('  ccs setup           Run setup wizard');
  console.log('  ccs setup --force   Force reconfiguration');
  console.log('');
}

/**
 * Handle setup command
 */
export async function handleSetupCommand(args: string[]): Promise<void> {
  await initUI();

  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    return;
  }

  await runSetupWizard(options.force);
}
