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
import { fail, info, warn, color, ok } from '../../utils/ui';
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
import {
  OAuthOptions,
  OAUTH_CALLBACK_PORTS,
  getOAuthConfig,
  ProviderOAuthConfig,
  CLIPROXY_CALLBACK_PROVIDER_MAP,
} from './auth-types';
import { isHeadlessEnvironment, killProcessOnPort, showStep } from './environment-detector';
import { getProviderTokenDir, isAuthenticated, registerAccountFromToken } from './token-manager';
import { executeOAuthProcess } from './oauth-process';
import { importKiroToken } from './kiro-import';
import { getProxyTarget, buildProxyUrl, buildManagementHeaders } from '../proxy-target-resolver';
import { checkNewAccountConflict, warnNewAccountConflict } from '../account-safety';

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
 * Prompt user to choose OAuth mode for headless environment
 * Returns 'paste' for paste-callback mode or 'forward' for port-forwarding
 */
async function promptOAuthModeChoice(callbackPort: number | null): Promise<'paste' | 'forward'> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log(info('Headless environment detected (SSH session)'));
  console.log('    OAuth requires choosing a mode:');
  console.log('');
  console.log('    [1] Paste-callback (recommended for VPS)');
  console.log('        Open URL in any browser, paste redirect URL back');
  console.log('');
  console.log('    [2] Port forwarding (advanced)');
  if (callbackPort) {
    console.log(`        Requires: ssh -L ${callbackPort}:localhost:${callbackPort} <USER>@<HOST>`);
  } else {
    console.log('        Requires SSH tunnel to callback port');
  }
  console.log('');

  return new Promise<'paste' | 'forward'>((resolve) => {
    let resolved = false;

    // Handle Ctrl+C gracefully
    rl.on('close', () => {
      if (!resolved) {
        resolved = true;
        resolve('paste'); // Safe default on cancel
      }
    });

    rl.question('[?] Which mode? (1/2): ', (answer) => {
      const choice = answer.trim();
      if (choice !== '1' && choice !== '2') {
        console.log(info('Invalid choice, using paste-callback mode'));
      }
      resolved = true;
      rl.close();
      resolve(choice === '2' ? 'forward' : 'paste');
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
 * Handle paste-callback mode: show auth URL, prompt for callback paste
 * Uses proxy target resolver to connect to correct CLIProxyAPI instance (local or remote)
 */
async function handlePasteCallbackMode(
  provider: CLIProxyProvider,
  oauthConfig: ProviderOAuthConfig,
  verbose: boolean,
  tokenDir: string,
  nickname?: string
): Promise<AccountInfo | null> {
  // Resolve CLIProxyAPI target (local or remote based on config)
  const target = getProxyTarget();
  // OAuth state timeout (10 minutes, matches CLIProxyAPI state TTL)
  const OAUTH_STATE_TIMEOUT_MS = 10 * 60 * 1000;

  console.log('');
  console.log(info(`Starting ${oauthConfig.displayName} OAuth (paste-callback mode)...`));

  try {
    // Request auth URL from CLIProxyAPI
    // Note: Uses /oauth/${provider}/start endpoint (different from web-server routes which use
    // /v0/management/${provider}-auth-url). Both start OAuth flows but this endpoint is simpler
    // for CLI paste-callback mode as it directly returns the auth URL without is_webui param.
    const startResponse = await fetch(buildProxyUrl(target, `/oauth/${provider}/start`), {
      method: 'POST',
      headers: buildManagementHeaders(target, { 'Content-Type': 'application/json' }),
    });

    if (!startResponse.ok) {
      console.log(fail('Failed to start OAuth flow'));
      return null;
    }

    const startData = (await startResponse.json()) as {
      url?: string;
      auth_url?: string;
      status?: string;
    };
    const authUrl = startData.url || startData.auth_url;

    if (!authUrl) {
      console.log(fail('No authorization URL received'));
      return null;
    }

    // Display auth URL in box
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════════╗');
    console.log('  ║  Open this URL in any browser:                               ║');
    console.log('  ╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`    ${authUrl}`);
    console.log('');

    // Prompt for callback URL
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const callbackUrl = await new Promise<string | null>((resolve) => {
      let resolved = false;

      rl.on('close', () => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      console.log(info('After completing authentication, paste the callback URL here:'));
      rl.question('> ', (answer) => {
        resolved = true;
        rl.close();
        resolve(answer.trim() || null);
      });

      // Timeout after 10 minutes (match state TTL)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          rl.close();
          console.log('');
          console.log(fail('Timed out waiting for callback URL (10 minutes)'));
          resolve(null);
        }
      }, OAUTH_STATE_TIMEOUT_MS);
    });

    if (!callbackUrl) {
      console.log(info('Cancelled'));
      return null;
    }

    // Validate callback URL
    let code: string | undefined;
    try {
      const parsed = new URL(callbackUrl);
      code = parsed.searchParams.get('code') || undefined;
    } catch {
      console.log(fail('Invalid URL format'));
      return null;
    }

    if (!code) {
      console.log(fail('Invalid callback URL: missing code parameter'));
      return null;
    }

    // Submit callback to CLIProxyAPI
    console.log(info('Submitting callback...'));

    const callbackProvider = CLIPROXY_CALLBACK_PROVIDER_MAP[provider] || provider;

    // Note: /oauth-callback is a CLIProxyAPI endpoint (not /v0/management prefix)
    const callbackResponse = await fetch(buildProxyUrl(target, '/oauth-callback'), {
      method: 'POST',
      headers: buildManagementHeaders(target, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        provider: callbackProvider,
        redirect_url: callbackUrl,
      }),
    });

    const callbackData = (await callbackResponse.json()) as {
      status?: string;
      error?: string;
    };

    if (!callbackResponse.ok || callbackData.status === 'error') {
      console.log(fail(callbackData.error || 'OAuth callback failed'));
      return null;
    }

    console.log(ok('Authentication successful!'));
    const account = registerAccountFromToken(provider, tokenDir, nickname);

    // Account safety: check for cross-provider conflicts
    if (account?.email) {
      const conflicts = checkNewAccountConflict(provider, account.email);
      if (conflicts) {
        warnNewAccountConflict(account.email, conflicts);
      }
    }

    return account;
  } catch (error) {
    if (verbose) {
      console.log(fail(`Error: ${(error as Error).message}`));
    } else {
      console.log(fail('OAuth failed. Use --verbose for details.'));
    }
    return null;
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

  // Handle paste-callback mode
  if (options.pasteCallback) {
    const tokenDir = getProviderTokenDir(provider);
    return handlePasteCallbackMode(provider, oauthConfig, verbose, tokenDir, nickname);
  }

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

  // Interactive mode selection for headless environments
  // Skip if explicit mode flag provided or device code flow (no callback needed)
  if (headless && !options.pasteCallback && !options.portForward && !isDeviceCodeFlow) {
    // Non-interactive environment (piped input) - default to paste mode
    if (!process.stdin.isTTY) {
      const tokenDir = getProviderTokenDir(provider);
      return handlePasteCallbackMode(provider, oauthConfig, verbose, tokenDir, nickname);
    }
    const mode = await promptOAuthModeChoice(callbackPort);
    if (mode === 'paste') {
      const tokenDir = getProviderTokenDir(provider);
      return handlePasteCallbackMode(provider, oauthConfig, verbose, tokenDir, nickname);
    }
    // mode === 'forward' continues to existing port-forwarding flow below
  }

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

  // Account safety: check for cross-provider conflicts
  if (account?.email) {
    const conflicts = checkNewAccountConflict(provider, account.email);
    if (conflicts) {
      warnNewAccountConflict(account.email, conflicts);
    }
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
