/**
 * OAuth Interactive Prompts, Preflight Checks, Runtime Preparation & GitLab PAT Login
 */

import * as fs from 'fs';
import { fail, info, ok, warn, color } from '../../../utils/ui';
import { InteractivePrompt } from '../../../utils/prompt';
import { BinaryError } from '../../../errors/error-types';
import { ensureCLIProxyBinary } from '../../binary-manager';
import { generateConfig } from '../../config/config-generator';
import { CLIProxyBackend, CLIProxyProvider } from '../../types';
import { AccountInfo } from '../../accounts/account-manager';
import { enhancedPreflightOAuthCheck } from '../../../management/oauth-port-diagnostics';
import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
} from '../../proxy/proxy-target-resolver';
import { OAuthOptions, ProviderOAuthConfig } from '../auth-types';
import { showStep } from '../environment-detector';
import {
  findNewTokenSnapshotForAuthAttempt,
  getProviderTokenDir,
  listProviderTokenSnapshots,
  registerAccountFromToken,
} from '../token-manager';
import { parseGitLabPatAuthResponse } from '../gitlab-pat-response';
import { probeCliProxyAdvertisedFlags } from '../oauth-cli-capabilities';
import { normalizeGitLabBaseUrl } from './credential-validation';

export async function promptGitLabPersonalAccessToken(): Promise<string | null> {
  try {
    const token = (await InteractivePrompt.password('GitLab Personal Access Token')).trim();
    return token.length > 0 ? token : null;
  } catch (error) {
    if ((error as Error).message.includes('TTY')) {
      console.log(
        fail(
          'GitLab Personal Access Token prompt requires an interactive TTY. Set the token explicitly or use Browser OAuth.'
        )
      );
      return null;
    }
    throw error;
  }
}

/**
 * Prompt user to add another account
 */
export async function promptAddAccount(): Promise<boolean> {
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
export async function promptOAuthModeChoice(
  callbackPort: number | null
): Promise<'paste' | 'forward'> {
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

    rl.on('close', () => {
      if (!resolved) {
        resolved = true;
        resolve('paste');
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
 * Run pre-flight OAuth checks
 */
export async function runPreflightChecks(
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
  verbose: boolean,
  backend: CLIProxyBackend
): Promise<{
  binaryPath: string;
  tokenDir: string;
  configPath: string;
  backend: CLIProxyBackend;
} | null> {
  showStep(1, 4, 'progress', 'Preparing CLIProxy binary...');

  try {
    const binaryPath = await ensureCLIProxyBinary(verbose, {
      backend,
      skipAutoUpdate: true,
    });
    process.stdout.write('\x1b[1A\x1b[2K');
    showStep(1, 4, 'ok', 'CLIProxy binary ready');

    const tokenDir = getProviderTokenDir(provider);
    fs.mkdirSync(tokenDir, { recursive: true, mode: 0o700 });

    const configPath = generateConfig(provider);
    if (verbose) {
      console.error(`[auth] Config generated: ${configPath}`);
    }

    return { binaryPath, tokenDir, configPath, backend };
  } catch (error) {
    process.stdout.write('\x1b[1A\x1b[2K');
    showStep(1, 4, 'fail', 'Failed to prepare CLIProxy binary');
    console.error(fail((error as Error).message));
    throw error;
  }
}

export async function prepareOAuthRuntime(
  provider: CLIProxyProvider,
  verbose: boolean,
  backend: CLIProxyBackend
): Promise<{
  advertisedFlags: ReadonlySet<string>;
  backend: CLIProxyBackend;
  binaryPath: string;
  configPath: string;
  tokenDir: string;
}> {
  const prepared = await prepareBinary(provider, verbose, backend);
  if (!prepared) {
    throw new BinaryError('CLIProxy binary preparation returned no runtime');
  }

  return {
    ...prepared,
    advertisedFlags: probeCliProxyAdvertisedFlags(prepared.binaryPath),
  };
}

export function formatOAuthRuntimePreparationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Unable to prepare CLIProxy OAuth runtime: ${message}`;
}

export async function handleGitLabPatLogin(
  provider: CLIProxyProvider,
  oauthConfig: ProviderOAuthConfig,
  verbose: boolean,
  tokenDir: string,
  nickname?: string,
  expectedAccountId?: string,
  options?: {
    gitlabBaseUrl?: OAuthOptions['gitlabBaseUrl'];
    gitlabPersonalAccessToken?: OAuthOptions['gitlabPersonalAccessToken'];
  }
): Promise<AccountInfo | null> {
  const target = getProxyTarget();
  const baseUrl = normalizeGitLabBaseUrl(options?.gitlabBaseUrl);
  const knownTokenFiles = listProviderTokenSnapshots(provider, tokenDir);
  const suppliedToken = options?.gitlabPersonalAccessToken?.trim();
  const envPersonalAccessToken = process.env['GITLAB_PERSONAL_ACCESS_TOKEN']?.trim() || undefined;
  const personalAccessToken = suppliedToken || envPersonalAccessToken;

  let token = personalAccessToken;
  if (!token) {
    console.log('');
    console.log(info(`Starting ${oauthConfig.displayName} PAT login...`));
    console.log('Paste a Personal Access Token with api and read_user scopes.');
    token = (await promptGitLabPersonalAccessToken()) || undefined;
  }

  if (!token) {
    console.log(info('Cancelled'));
    return null;
  }

  if (!suppliedToken && envPersonalAccessToken) {
    delete process.env['GITLAB_PERSONAL_ACCESS_TOKEN'];
  }

  const response = await fetch(buildProxyUrl(target, '/v0/management/gitlab-auth-url'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildManagementHeaders(target),
    },
    body: JSON.stringify({
      ...(baseUrl ? { base_url: baseUrl } : {}),
      personal_access_token: token,
    }),
  });

  const responseBody = await response.text();
  const parsedResponse = parseGitLabPatAuthResponse(
    response.ok,
    response.status,
    responseBody,
    token
  );

  if (!parsedResponse.ok) {
    console.log(fail(parsedResponse.errorMessage));
    return null;
  }

  const tokenSnapshot = findNewTokenSnapshotForAuthAttempt(
    provider,
    tokenDir,
    knownTokenFiles,
    expectedAccountId
  );
  if (!tokenSnapshot) {
    console.log(fail('GitLab PAT login completed, but CCS could not find the saved token file.'));
    return null;
  }

  const account = registerAccountFromToken(
    provider,
    tokenDir,
    nickname,
    verbose,
    expectedAccountId || tokenSnapshot.file
  );

  if (!account) {
    console.log(fail('Authenticated GitLab token could not be registered as a CCS account.'));
    return null;
  }

  console.log(ok('Authentication successful!'));
  return account;
}
