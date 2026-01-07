/**
 * OAuth Handler for CLIProxyAPI
 *
 * Manages OAuth authentication flow for CLIProxy providers (Gemini, Codex, Antigravity, Kiro, Copilot).
 * CLIProxyAPI handles OAuth internally - we just need to:
 * 1. Check if auth exists (token files in CCS auth directory)
 * 2. Trigger OAuth flow by spawning binary with auth flag
 * 3. Auto-detect headless environments (SSH, no DISPLAY)
 * 4. Use --no-browser flag for headless, display OAuth URL for manual auth
 * 5. Handle Device Code flows for Copilot/Qwen (no callback server)
 */

import * as fs from 'fs';
import { fail, info, warn, color } from '../../utils/ui';
import { ensureCLIProxyBinary } from '../binary-manager';
import { generateConfig } from '../config-generator';
import { CLIProxyProvider } from '../types';
import {
  AccountInfo,
  getProviderAccounts,
  getDefaultAccount,
  touchAccount,
  PROVIDERS_WITHOUT_EMAIL,
  validateNickname,
} from '../account-manager';
import {
  enhancedPreflightOAuthCheck,
  OAUTH_CALLBACK_PORTS as OAUTH_PORTS,
} from '../../management/oauth-port-diagnostics';
import { OAuthOptions, OAUTH_CALLBACK_PORTS, getOAuthConfig } from './auth-types';
import { isHeadlessEnvironment, killProcessOnPort, showStep } from './environment-detector';
import { getProviderTokenDir, isAuthenticated, registerAccountFromToken } from './token-manager';
import { executeOAuthProcess } from './oauth-process';
import { importKiroToken } from './kiro-import';

/**
 * Prompt user to add another account
 */
async function promptAddAccount(): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question('[?] Add another account? (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Prompt user for account nickname (required for kiro/ghcp)
 * Returns null if user cancels
 */
async function promptNickname(
  provider: CLIProxyProvider,
  existingAccounts: AccountInfo[]
): Promise<string | null> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const existingNicknames = existingAccounts.map(
    (a) => a.nickname?.toLowerCase() || a.id.toLowerCase()
  );

  console.log('');
  console.log(info(`${provider} accounts require a unique nickname to distinguish them.`));
  if (existingNicknames.length > 0) {
    console.log(`    Existing: ${existingNicknames.join(', ')}`);
  }

  return new Promise<string | null>((resolve) => {
    let resolved = false;

    // Handle Ctrl+C gracefully (only if not already resolved)
    rl.on('close', () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    const askForNickname = () => {
      rl.question('[?] Enter a nickname for this account: ', (answer) => {
        const nickname = answer.trim();

        if (!nickname) {
          console.log(fail('Nickname cannot be empty'));
          askForNickname();
          return;
        }

        const validationError = validateNickname(nickname);
        if (validationError) {
          console.log(fail(validationError));
          askForNickname();
          return;
        }

        if (existingNicknames.includes(nickname.toLowerCase())) {
          console.log(fail(`Nickname "${nickname}" is already in use. Choose a different one.`));
          askForNickname();
          return;
        }

        resolved = true;
        rl.close();
        resolve(nickname);
      });
    };

    askForNickname();
  });
}

/**
 * Run pre-flight OAuth checks
 */
async function runPreflightChecks(
  provider: CLIProxyProvider,
  oauthConfig: { displayName: string }
): Promise<boolean> {
  console.log('');
  console.log(info(`Pre-flight OAuth check for ${oauthConfig.displayName}...`));

  const preflight = await enhancedPreflightOAuthCheck(provider);

  for (const check of preflight.checks) {
    const icon = check.status === 'ok' ? '[OK]' : check.status === 'warn' ? '[!]' : '[X]';
    console.log(`  ${icon} ${check.name}: ${check.message}`);
    if (check.fixCommand && check.status !== 'ok') {
      console.log(`      Fix: ${check.fixCommand}`);
    }
  }

  if (preflight.firewallWarning) {
    console.log('');
    console.log(warn('Windows Firewall may block OAuth callback'));
    console.log('    If auth hangs, run as Administrator:');
    console.log(`    ${color(preflight.firewallFixCommand || '', 'command')}`);
  }

  if (!preflight.ready) {
    console.log('');
    console.log(fail('Pre-flight check failed. Resolve issues above and retry.'));
    return false;
  }

  return true;
}

/**
 * Prepare OAuth binary and config
 */
async function prepareBinary(
  provider: CLIProxyProvider,
  verbose: boolean
): Promise<{ binaryPath: string; tokenDir: string; configPath: string } | null> {
  showStep(1, 4, 'progress', 'Preparing CLIProxy binary...');

  try {
    const binaryPath = await ensureCLIProxyBinary(verbose);
    process.stdout.write('\x1b[1A\x1b[2K');
    showStep(1, 4, 'ok', 'CLIProxy binary ready');

    const tokenDir = getProviderTokenDir(provider);
    fs.mkdirSync(tokenDir, { recursive: true, mode: 0o700 });

    const configPath = generateConfig(provider);
    if (verbose) {
      console.error(`[auth] Config generated: ${configPath}`);
    }

    return { binaryPath, tokenDir, configPath };
  } catch (error) {
    process.stdout.write('\x1b[1A\x1b[2K');
    showStep(1, 4, 'fail', 'Failed to prepare CLIProxy binary');
    console.error(fail((error as Error).message));
    throw error;
  }
}

/**
 * Trigger OAuth flow for provider
 * Auto-detects headless environment and uses --no-browser flag accordingly
 * Shows real-time step-by-step progress for better user feedback
 * Handles both Authorization Code (callback server) and Device Code (polling) flows
 */
export async function triggerOAuth(
  provider: CLIProxyProvider,
  options: OAuthOptions = {}
): Promise<AccountInfo | null> {
  const oauthConfig = getOAuthConfig(provider);
  const { verbose = false, add = false, fromUI = false, noIncognito = true } = options;
  let { nickname } = options;

  // Check for existing accounts
  const existingAccounts = getProviderAccounts(provider);

  // For kiro/ghcp: require nickname if not provided (CLI only, not fromUI)
  if (PROVIDERS_WITHOUT_EMAIL.includes(provider) && !nickname && !fromUI) {
    const promptedNickname = await promptNickname(provider, existingAccounts);
    if (!promptedNickname) {
      console.log(info('Cancelled'));
      return null;
    }
    nickname = promptedNickname;
  }

  // Handle --import flag: skip OAuth and import from Kiro IDE directly
  if (options.import && provider === 'kiro') {
    const tokenDir = getProviderTokenDir(provider);
    const success = await importKiroToken(verbose);
    if (success) {
      return registerAccountFromToken(provider, tokenDir, nickname);
    }
    return null;
  }

  const callbackPort = OAUTH_PORTS[provider];
  const isCLI = !fromUI;
  const headless = options.headless ?? isHeadlessEnvironment();
  const isDeviceCodeFlow = callbackPort === null;

  if (existingAccounts.length > 0 && !add) {
    console.log('');
    console.log(
      info(
        `${existingAccounts.length} account(s) already authenticated for ${oauthConfig.displayName}`
      )
    );

    if (!(await promptAddAccount())) {
      console.log(info('Cancelled'));
      return null;
    }
  }

  // Pre-flight checks (skip for device code flows which don't need callback ports)
  if (!isDeviceCodeFlow && !(await runPreflightChecks(provider, oauthConfig))) {
    return null;
  }

  console.log('');

  // Prepare binary
  const prepared = await prepareBinary(provider, verbose);
  if (!prepared) return null;

  const { binaryPath, tokenDir, configPath } = prepared;

  // Free callback port if needed (only for authorization code flows)
  const localCallbackPort = OAUTH_CALLBACK_PORTS[provider];
  if (localCallbackPort) {
    const killed = killProcessOnPort(localCallbackPort, verbose);
    if (killed && verbose) {
      console.error(`[auth] Freed port ${localCallbackPort} for OAuth callback`);
    }
  }

  // Build args
  const args = ['--config', configPath, oauthConfig.authFlag];
  if (headless) {
    args.push('--no-browser');
  }
  // Kiro-specific: --no-incognito to use normal browser (saves login credentials)
  if (provider === 'kiro' && noIncognito) {
    args.push('--no-incognito');
  }

  // Show step based on flow type
  if (isDeviceCodeFlow) {
    showStep(2, 4, 'progress', `Starting ${oauthConfig.displayName} Device Code flow...`);
    console.log('');
    console.log(info('Device Code Flow - follow the instructions below'));
  } else {
    showStep(2, 4, 'progress', `Starting callback server on port ${callbackPort}...`);

    // Show headless instructions (only for authorization code flows)
    if (headless) {
      console.log('');
      console.log(warn('PORT FORWARDING REQUIRED'));
      console.log(`    OAuth callback uses localhost:${callbackPort} which must be reachable.`);
      console.log('    Run this on your LOCAL machine:');
      console.log(
        `    ${color(`ssh -L ${callbackPort}:localhost:${callbackPort} <USER>@<HOST>`, 'command')}`
      );
      console.log('');
    }
  }

  // Execute OAuth process
  const account = await executeOAuthProcess({
    provider,
    binaryPath,
    args,
    tokenDir,
    oauthConfig,
    callbackPort,
    headless,
    verbose,
    isCLI,
    nickname,
  });

  // Show hint for Kiro users about --no-incognito option (first-time auth only)
  if (account && provider === 'kiro' && !noIncognito) {
    console.log('');
    console.log(info('Tip: To save your AWS login credentials for future sessions:'));
    console.log('       Use: ccs kiro --no-incognito');
    console.log('       Or enable "Kiro: Use normal browser" in: ccs config');
  }

  return account;
}

/**
 * Ensure provider is authenticated
 * Triggers OAuth flow if not authenticated
 */
export async function ensureAuth(
  provider: CLIProxyProvider,
  options: { verbose?: boolean; headless?: boolean; account?: string } = {}
): Promise<boolean> {
  if (isAuthenticated(provider)) {
    if (options.verbose) {
      console.error(`[auth] ${provider} already authenticated`);
    }
    const defaultAccount = getDefaultAccount(provider);
    if (defaultAccount) {
      touchAccount(provider, options.account || defaultAccount.id);
    }
    return true;
  }

  const oauthConfig = getOAuthConfig(provider);
  console.log(info(`${oauthConfig.displayName} authentication required`));

  const account = await triggerOAuth(provider, options);
  return account !== null;
}
