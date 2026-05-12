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
import { createLogger } from '../../services/logging';
import { ensureCLIProxyBinary, getStoredConfiguredBackend } from '../binary-manager';
import { generateConfig } from '../config/config-generator';
import { CLIProxyBackend, CLIProxyProvider } from '../types';
import {
  AccountInfo,
  getProviderAccounts,
  getDefaultAccount,
  touchAccount,
  hasAccountNameConflict,
  findAccountNameMatch,
  PROVIDERS_WITHOUT_EMAIL,
  validateNickname,
} from '../accounts/account-manager';
import {
  enhancedPreflightOAuthCheck,
  OAUTH_CALLBACK_PORTS as OAUTH_PORTS,
} from '../../management/oauth-port-diagnostics';
import {
  OAuthOptions,
  DEFAULT_KIRO_AUTH_METHOD,
  DEFAULT_KIRO_IDC_FLOW,
  getKiroCallbackPort,
  getKiroCLIAuthArgs,
  isKiroCLIAuthMethod,
  isKiroDeviceCodeMethod,
  getOAuthConfig,
  ProviderOAuthConfig,
  CLIPROXY_CALLBACK_PROVIDER_MAP,
  getPasteCallbackStartPath,
  getManagementOAuthCallbackPath,
  normalizeKiroAuthMethod,
  normalizeKiroIDCFlow,
} from './auth-types';
import { isHeadlessEnvironment, killProcessOnPort, showStep } from './environment-detector';
import {
  ProviderTokenSnapshot,
  findNewTokenSnapshotForAuthAttempt,
  getProviderTokenDir,
  isAuthenticated,
  listProviderTokenSnapshots,
  registerAccountFromToken,
} from './token-manager';
import { executeOAuthProcess } from './oauth-process';
import { importKiroToken } from './kiro-import';
import { parseGitLabPatAuthResponse } from './gitlab-pat-response';
import {
  buildOAuthStartFailureGuidance,
  formatOAuthStartFailureForCli,
} from './oauth-start-failure-guidance';
import {
  getProxyTarget,
  buildProxyUrl,
  buildManagementHeaders,
  type ProxyTarget,
} from '../proxy/proxy-target-resolver';
import {
  checkNewAccountConflict,
  warnNewAccountConflict,
  warnOAuthBanRisk,
  warnPossible403Ban,
} from '../accounts/account-safety';
import { ensureCliAntigravityResponsibility } from '../auth/antigravity-responsibility';
import { InteractivePrompt } from '../../utils/prompt';

interface PasteCallbackStartData {
  url?: string;
  auth_url?: string;
  state?: string;
  status?: string;
}

const PASTE_CALLBACK_AUTH_URL_POLL_INTERVAL_MS = 3000;
const POLLED_AUTH_LOCAL_TOKEN_GRACE_MS = 15 * 1000;
const GEMINI_PLUS_CLIENT_ID_ENV = 'CLIPROXY_GEMINI_OAUTH_CLIENT_ID';
const GEMINI_PLUS_CLIENT_SECRET_ENV = 'CLIPROXY_GEMINI_OAUTH_CLIENT_SECRET';

const logger = createLogger('cliproxy:auth:oauth');

/**
 * Table of providers that require Google OAuth client credentials when running
 * against CLIProxy Plus. Keyed by CLIProxyProvider value.
 *
 * Used by the generalized helpers so the dashboard handler can guard any
 * table-listed provider without duplicating env-var names.
 */
export const PLUS_OAUTH_ENV_BY_PROVIDER: Partial<
  Record<CLIProxyProvider, { idEnv: string; secretEnv: string; displayName: string }>
> = {
  gemini: {
    idEnv: GEMINI_PLUS_CLIENT_ID_ENV,
    secretEnv: GEMINI_PLUS_CLIENT_SECRET_ENV,
    displayName: 'Gemini',
  },
  agy: {
    idEnv: 'CLIPROXY_ANTIGRAVITY_OAUTH_CLIENT_ID',
    secretEnv: 'CLIPROXY_ANTIGRAVITY_OAUTH_CLIENT_SECRET',
    displayName: 'Antigravity',
  },
};

/**
 * Build a human-readable error message for a provider whose Plus OAuth client
 * credentials are missing.
 *
 * @param displayName - Human-readable provider name (e.g. "Gemini", "Antigravity")
 * @param idEnv       - Name of the client-ID env var
 * @param secretEnv   - Name of the client-secret env var
 * @param missing     - Which of the two vars are absent (omit to suppress the "Missing:" prefix)
 */
function buildPlusOAuthCredentialMessage(
  displayName: string,
  idEnv: string,
  secretEnv: string,
  missing?: string[]
): string {
  const missingText = missing?.length ? ` Missing: ${missing.join(', ')}.` : '';
  return (
    `${displayName} OAuth from CLIProxy Plus is missing Google OAuth client credentials.` +
    missingText +
    ` Set ${idEnv} and ${secretEnv} before starting CLIProxy Plus,` +
    ` or switch \`cliproxy.backend\` to \`original\` for ${displayName}.`
  );
}

/**
 * Generalized credential-missing guard for any provider in PLUS_OAUTH_ENV_BY_PROVIDER.
 *
 * Returns null when:
 *   - provider is not in the table (not a Plus-credentialed provider)
 *   - backend is not 'plus'
 *   - both credential env vars are set and non-empty
 *
 * Returns an error string when Plus is active and one or both vars are missing.
 */
export function getPlusOAuthCredentialError(
  provider: CLIProxyProvider,
  backend: CLIProxyBackend,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const entry = PLUS_OAUTH_ENV_BY_PROVIDER[provider];
  if (!entry || backend !== 'plus') {
    return null;
  }

  const missing = [entry.idEnv, entry.secretEnv].filter((name) => !env[name]?.trim());
  return missing.length > 0
    ? buildPlusOAuthCredentialMessage(entry.displayName, entry.idEnv, entry.secretEnv, missing)
    : null;
}

/**
 * Generalized auth-URL guard for any provider in PLUS_OAUTH_ENV_BY_PROVIDER.
 *
 * Returns null when:
 *   - provider is not in the table
 *   - authUrl cannot be parsed as a URL (ignore malformed upstream responses)
 *   - client_id query param is present and non-empty
 *
 * Returns an error string when client_id is absent or empty.
 */
export function getPlusAuthUrlCredentialError(
  provider: CLIProxyProvider,
  authUrl: string
): string | null {
  const entry = PLUS_OAUTH_ENV_BY_PROVIDER[provider];
  if (!entry) {
    return null;
  }

  try {
    const parsed = new URL(authUrl);
    const clientId = parsed.searchParams.get('client_id')?.trim();
    return clientId
      ? null
      : buildPlusOAuthCredentialMessage(entry.displayName, entry.idEnv, entry.secretEnv);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini-specific aliases — kept for backward-compat with PR #1131's callers.
// These lock the provider to 'gemini' and delegate to the generalized helpers.
// ---------------------------------------------------------------------------

export function getGeminiPlusOAuthCredentialError(
  provider: CLIProxyProvider,
  backend: CLIProxyBackend,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (provider !== 'gemini') {
    return null;
  }
  return getPlusOAuthCredentialError(provider, backend, env);
}

export function getGeminiAuthUrlCredentialError(
  provider: CLIProxyProvider,
  authUrl: string
): string | null {
  if (provider !== 'gemini') {
    return null;
  }
  return getPlusAuthUrlCredentialError(provider, authUrl);
}

export async function requestPasteCallbackStart(
  provider: CLIProxyProvider,
  target: ProxyTarget,
  options?: {
    kiroMethod?: OAuthOptions['kiroMethod'];
    gitlabBaseUrl?: OAuthOptions['gitlabBaseUrl'];
  }
): Promise<PasteCallbackStartData> {
  let startPath = getPasteCallbackStartPath(provider, {
    kiroMethod: options?.kiroMethod,
  });
  if (!startPath) {
    throw new Error(
      `Paste-callback start is not available for ${provider} with the selected method`
    );
  }
  const normalizedGitLabBaseUrl =
    provider === 'gitlab' ? normalizeGitLabBaseUrl(options?.gitlabBaseUrl) : undefined;
  if (normalizedGitLabBaseUrl) {
    startPath += `&base_url=${encodeURIComponent(normalizedGitLabBaseUrl)}`;
  }
  const response = await fetch(buildProxyUrl(target, startPath), {
    headers: buildManagementHeaders(target),
  });

  if (!response.ok) {
    throw new Error(`OAuth start failed with status ${response.status}`);
  }

  return (await response.json()) as PasteCallbackStartData;
}

export function getCliAuthNicknameError(
  provider: CLIProxyProvider,
  nickname: string | undefined,
  existingAccounts: Array<Pick<AccountInfo, 'id' | 'nickname'>>,
  allowExistingAccountId?: string
): string | null {
  if (!nickname || !PROVIDERS_WITHOUT_EMAIL.includes(provider)) {
    return null;
  }

  const validationError = validateNickname(nickname);
  if (validationError) {
    return validationError;
  }

  if (hasAccountNameConflict(existingAccounts, nickname, allowExistingAccountId)) {
    return `Nickname "${nickname}" is already in use. Choose a different one.`;
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAuthUrlState(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).searchParams.get('state');
  } catch {
    return null;
  }
}

export function normalizeGitLabBaseUrl(baseUrl: string | undefined): string | undefined {
  const normalized = baseUrl?.trim();
  if (!normalized) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('GitLab URL must be a valid http:// or https:// URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('GitLab URL must use http:// or https://');
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.username = '';
  parsed.password = '';

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  return normalizedPath ? `${parsed.origin}${normalizedPath}` : parsed.origin;
}

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

export function findNewTokenSnapshotForManualAuth(
  provider: CLIProxyProvider,
  tokenDir: string,
  knownTokenFiles: ProviderTokenSnapshot[],
  expectedAccountId?: string
): ProviderTokenSnapshot | null {
  return findNewTokenSnapshotForAuthAttempt(provider, tokenDir, knownTokenFiles, expectedAccountId);
}

async function waitForManualCallbackToken(
  provider: CLIProxyProvider,
  target: ProxyTarget,
  tokenDir: string,
  oauthState: string | null,
  knownTokenFiles: ProviderTokenSnapshot[],
  expectedAccountId: string | undefined,
  timeoutMs: number,
  pollIntervalMs: number = PASTE_CALLBACK_AUTH_URL_POLL_INTERVAL_MS
): Promise<{ tokenSnapshot: ProviderTokenSnapshot | null; error?: string }> {
  const deadline = Date.now() + timeoutMs;
  let upstreamCompletedAt: number | null = null;

  while (Date.now() < deadline) {
    const tokenSnapshot = findNewTokenSnapshotForManualAuth(
      provider,
      tokenDir,
      knownTokenFiles,
      expectedAccountId
    );
    if (tokenSnapshot) {
      return { tokenSnapshot };
    }

    if (oauthState) {
      const response = await fetch(
        buildProxyUrl(
          target,
          `/v0/management/get-auth-status?state=${encodeURIComponent(oauthState)}`
        ),
        { headers: buildManagementHeaders(target) }
      );

      if (response.ok) {
        const data = (await response.json()) as { status?: string; error?: string };
        if (data.status === 'error') {
          return {
            tokenSnapshot: null,
            error: data.error || 'Authentication failed while waiting for local token persistence',
          };
        }
        if (data.status === 'ok' && upstreamCompletedAt === null) {
          upstreamCompletedAt = Date.now();
        }
      }
    }

    if (
      upstreamCompletedAt !== null &&
      Date.now() - upstreamCompletedAt >= POLLED_AUTH_LOCAL_TOKEN_GRACE_MS
    ) {
      break;
    }

    if (Date.now() + pollIntervalMs >= deadline) {
      break;
    }

    await sleep(pollIntervalMs);
  }

  return { tokenSnapshot: null };
}

export async function resolvePasteCallbackAuthUrl(
  target: ProxyTarget,
  startData: PasteCallbackStartData,
  timeoutMs: number,
  pollIntervalMs: number = PASTE_CALLBACK_AUTH_URL_POLL_INTERVAL_MS
): Promise<string | null> {
  const authUrl = startData.url || startData.auth_url;
  if (authUrl) {
    return authUrl;
  }

  const state = startData.state;
  if (!state) {
    return null;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(
      buildProxyUrl(target, `/v0/management/get-auth-status?state=${encodeURIComponent(state)}`),
      { headers: buildManagementHeaders(target) }
    );

    if (response.ok) {
      const statusData = (await response.json()) as PasteCallbackStartData;
      const polledAuthUrl = statusData.url || statusData.auth_url;

      if (polledAuthUrl) {
        return polledAuthUrl;
      }

      if (statusData.status === 'error' || statusData.status === 'device_code') {
        return null;
      }
    }

    if (Date.now() + pollIntervalMs >= deadline) {
      break;
    }

    await sleep(pollIntervalMs);
  }

  return null;
}

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
    const binaryPath = await ensureCLIProxyBinary(verbose, { skipAutoUpdate: true });
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

function buildOAuthArgs(
  provider: CLIProxyProvider,
  configPath: string,
  headless: boolean,
  noIncognito: boolean,
  options: {
    kiroMethod?: OAuthOptions['kiroMethod'];
    kiroIDCStartUrl?: string;
    kiroIDCRegion?: string;
    kiroIDCFlow?: OAuthOptions['kiroIDCFlow'];
  } = {}
): string[] {
  const args = ['--config', configPath];

  if (provider === 'kiro') {
    const method = normalizeKiroAuthMethod(options.kiroMethod);
    if (!isKiroCLIAuthMethod(method)) {
      throw new Error(`Kiro auth method '${method}' is not supported by CLI flow.`);
    }
    args.push(
      ...getKiroCLIAuthArgs(method, {
        idcStartUrl: options.kiroIDCStartUrl,
        idcRegion: options.kiroIDCRegion,
        idcFlow: options.kiroIDCFlow,
      })
    );
  } else {
    args.push(getOAuthConfig(provider).authFlag);
  }

  if (headless) {
    args.push('--no-browser');
  }
  if (provider === 'kiro' && noIncognito) {
    args.push('--no-incognito');
  }

  return args;
}

export function usesKiroLocalCallbackReplay(
  method: OAuthOptions['kiroMethod'],
  idcFlow: OAuthOptions['kiroIDCFlow']
): boolean {
  const normalizedMethod = normalizeKiroAuthMethod(method);
  if (normalizedMethod === 'aws-authcode') {
    return true;
  }
  return normalizedMethod === 'idc' && normalizeKiroIDCFlow(idcFlow) === 'authcode';
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
  nickname?: string,
  expectedAccountId?: string,
  options?: {
    kiroMethod?: OAuthOptions['kiroMethod'];
    gitlabBaseUrl?: OAuthOptions['gitlabBaseUrl'];
    add?: boolean;
  }
): Promise<AccountInfo | null> {
  // Resolve CLIProxyAPI target (local or remote based on config)
  const target = getProxyTarget();
  // OAuth state timeout (10 minutes, matches CLIProxyAPI state TTL)
  const OAUTH_STATE_TIMEOUT_MS = 10 * 60 * 1000;

  console.log('');
  console.log(info(`Starting ${oauthConfig.displayName} OAuth (paste-callback mode)...`));

  try {
    // Request auth URL from CLIProxyAPI management endpoints when the selected
    // provider/method supports the manual start-url contract.
    let startData: PasteCallbackStartData;
    let startPath = getPasteCallbackStartPath(provider, {
      kiroMethod: options?.kiroMethod,
    });
    const normalizedGitLabBaseUrl =
      provider === 'gitlab' ? normalizeGitLabBaseUrl(options?.gitlabBaseUrl) : undefined;
    if (startPath && normalizedGitLabBaseUrl) {
      startPath += `&base_url=${encodeURIComponent(normalizedGitLabBaseUrl)}`;
    }
    try {
      startData = await requestPasteCallbackStart(provider, target, {
        kiroMethod: options?.kiroMethod,
        gitlabBaseUrl: options?.gitlabBaseUrl,
      });
    } catch (error) {
      const startError = (error as Error).message;
      console.log(fail('Failed to start OAuth flow'));
      if (startPath) {
        const guidance = buildOAuthStartFailureGuidance(provider, {
          target,
          startPath,
          cause: error,
          addAccount: options?.add,
        });
        for (const line of formatOAuthStartFailureForCli(guidance)) {
          console.log(`    ${line}`);
        }
      }
      warnPossible403Ban(provider, startError);
      return null;
    }

    const authUrl = await resolvePasteCallbackAuthUrl(target, startData, OAUTH_STATE_TIMEOUT_MS);

    if (!authUrl) {
      console.log(fail('No authorization URL received'));
      return null;
    }

    const authUrlCredentialError = getGeminiAuthUrlCredentialError(provider, authUrl);
    if (authUrlCredentialError) {
      console.log(fail(authUrlCredentialError));
      return null;
    }

    const oauthState = startData.state || parseAuthUrlState(authUrl);
    const knownTokenFiles = listProviderTokenSnapshots(provider, tokenDir);

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

    const callbackResponse = await fetch(buildProxyUrl(target, getManagementOAuthCallbackPath()), {
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
      const callbackError =
        callbackData.error || `OAuth callback failed with status ${callbackResponse.status}`;
      console.log(fail(callbackError));
      warnPossible403Ban(provider, callbackError);
      return null;
    }

    console.log(info('Callback submitted. Waiting for token exchange...'));
    const { tokenSnapshot, error: tokenWaitError } = await waitForManualCallbackToken(
      provider,
      target,
      tokenDir,
      oauthState,
      knownTokenFiles,
      expectedAccountId,
      OAUTH_STATE_TIMEOUT_MS
    );

    if (tokenWaitError) {
      console.log(fail(tokenWaitError));
      warnPossible403Ban(provider, tokenWaitError);
      return null;
    }

    if (!tokenSnapshot) {
      console.log(
        fail(
          'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.'
        )
      );
      return null;
    }

    const account = registerAccountFromToken(
      provider,
      tokenDir,
      nickname,
      verbose,
      tokenSnapshot.file
    );

    if (!account) {
      console.log(
        fail('Authenticated token could not be matched to the requested account. Retry the flow.')
      );
      return null;
    }

    console.log(ok('Authentication successful!'));

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

async function handleGitLabPatLogin(
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
  const personalAccessToken =
    suppliedToken || process.env['GITLAB_PERSONAL_ACCESS_TOKEN']?.trim() || undefined;

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
  warnOAuthBanRisk(provider);
  const oauthStartedAt = Date.now();
  logger.stage('auth', 'cliproxy.oauth.start', 'Triggering OAuth flow', {
    provider,
    add: options.add === true,
    fromUI: options.fromUI === true,
  });
  const { verbose = false, add = false, fromUI = false, noIncognito = true } = options;
  const acceptAgyRisk = options.acceptAgyRisk === true;
  const { nickname } = options;
  const resolvedKiroMethod =
    provider === 'kiro' ? normalizeKiroAuthMethod(options.kiroMethod) : DEFAULT_KIRO_AUTH_METHOD;
  const resolvedKiroIDCFlow =
    provider === 'kiro' ? normalizeKiroIDCFlow(options.kiroIDCFlow) : DEFAULT_KIRO_IDC_FLOW;
  const resolvedGitLabAuthMode =
    provider === 'gitlab' && options.gitlabAuthMode === 'pat' ? 'pat' : 'oauth';
  let resolvedGitLabBaseUrl: string | undefined;
  if (provider === 'gitlab') {
    try {
      resolvedGitLabBaseUrl = normalizeGitLabBaseUrl(options.gitlabBaseUrl);
    } catch (error) {
      console.log(fail((error as Error).message));
      return null;
    }
  }

  if (provider === 'agy') {
    if (fromUI && !acceptAgyRisk) {
      console.log(fail('Antigravity OAuth blocked: responsibility acknowledgement is missing.'));
      return null;
    }

    if (!fromUI) {
      const acknowledged = await ensureCliAntigravityResponsibility({
        context: 'oauth',
        acceptedByFlag: acceptAgyRisk,
      });
      if (!acknowledged) {
        console.log(info('Cancelled'));
        return null;
      }
    }
  }

  // Check for existing accounts
  const existingAccounts = getProviderAccounts(provider);
  const existingNameMatch = nickname ? findAccountNameMatch(existingAccounts, nickname) : null;
  const nicknameError = !fromUI
    ? getCliAuthNicknameError(provider, nickname, existingAccounts, existingNameMatch?.id)
    : null;
  if (nicknameError) {
    console.log(fail(nicknameError));
    return null;
  }

  // Handle --import flag: skip OAuth and import from Kiro IDE directly
  if (options.import && provider === 'kiro') {
    const tokenDir = getProviderTokenDir(provider);
    const success = await importKiroToken(verbose);
    if (success) {
      return registerAccountFromToken(provider, tokenDir, nickname, verbose, existingNameMatch?.id);
    }
    return null;
  }

  if (provider === 'kiro' && resolvedKiroMethod === 'github') {
    console.log(fail('Kiro GitHub login is only available in Dashboard management OAuth flow.'));
    console.log('    Use: ccs config -> Accounts -> Add Kiro account -> Method: GitHub OAuth');
    return null;
  }

  const callbackPort =
    provider === 'kiro'
      ? getKiroCallbackPort(resolvedKiroMethod, { idcFlow: resolvedKiroIDCFlow })
      : OAUTH_PORTS[provider];
  const isCLI = !fromUI;
  const headless = options.headless ?? isHeadlessEnvironment();
  const isDeviceCodeFlow =
    provider === 'kiro'
      ? isKiroDeviceCodeMethod(resolvedKiroMethod, { idcFlow: resolvedKiroIDCFlow })
      : callbackPort === null;
  let selectedPasteCallback = options.pasteCallback === true;

  if (provider === 'kiro' && !isKiroCLIAuthMethod(resolvedKiroMethod)) {
    console.log(fail(`Kiro auth method '${resolvedKiroMethod}' is not supported by CLI flow.`));
    console.log('    Use Dashboard management OAuth for this method.');
    return null;
  }

  // Interactive mode selection for headless environments
  // Skip if explicit mode flag provided or device code flow (no callback needed)
  if (headless && !selectedPasteCallback && !options.portForward && !isDeviceCodeFlow) {
    // Non-interactive environment (piped input) - default to paste mode
    if (!process.stdin.isTTY) {
      selectedPasteCallback = true;
    } else {
      const mode = await promptOAuthModeChoice(callbackPort);
      if (mode === 'paste') {
        selectedPasteCallback = true;
      }
    }
  }

  if (provider === 'gitlab' && resolvedGitLabBaseUrl && !selectedPasteCallback) {
    selectedPasteCallback = true;
    console.log('');
    console.log(
      info('GitLab custom base URL selected. Switching to paste-callback mode for OAuth.')
    );
  }

  const useSelectedKiroLocalPasteCallback =
    selectedPasteCallback &&
    provider === 'kiro' &&
    usesKiroLocalCallbackReplay(resolvedKiroMethod, resolvedKiroIDCFlow);
  const useSelectedKiroDirectCliFlow =
    provider === 'kiro' && (isDeviceCodeFlow || useSelectedKiroLocalPasteCallback);

  if (!(selectedPasteCallback && !useSelectedKiroDirectCliFlow)) {
    const credentialError = getGeminiPlusOAuthCredentialError(
      provider,
      getStoredConfiguredBackend()
    );
    if (credentialError) {
      console.log(fail(credentialError));
      return null;
    }
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

  if (provider === 'gitlab' && resolvedGitLabAuthMode === 'pat') {
    const tokenDir = getProviderTokenDir(provider);
    return handleGitLabPatLogin(
      provider,
      oauthConfig,
      verbose,
      tokenDir,
      nickname,
      existingNameMatch?.id,
      {
        gitlabBaseUrl: resolvedGitLabBaseUrl,
        gitlabPersonalAccessToken: options.gitlabPersonalAccessToken,
      }
    );
  }

  if (selectedPasteCallback && !useSelectedKiroDirectCliFlow) {
    const tokenDir = getProviderTokenDir(provider);
    return handlePasteCallbackMode(
      provider,
      oauthConfig,
      verbose,
      tokenDir,
      nickname,
      existingNameMatch?.id,
      {
        kiroMethod: provider === 'kiro' ? resolvedKiroMethod : undefined,
        gitlabBaseUrl: provider === 'gitlab' ? resolvedGitLabBaseUrl : undefined,
        add,
      }
    );
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
  const localCallbackPort = callbackPort;
  if (localCallbackPort) {
    const killed = killProcessOnPort(localCallbackPort, verbose);
    if (killed && verbose) {
      console.error(`[auth] Freed port ${localCallbackPort} for OAuth callback`);
    }
  }

  const processHeadless = selectedPasteCallback && provider === 'kiro' ? true : headless;
  let args: string[];
  try {
    args = buildOAuthArgs(provider, configPath, processHeadless, noIncognito, {
      kiroMethod: provider === 'kiro' ? resolvedKiroMethod : undefined,
      kiroIDCStartUrl: options.kiroIDCStartUrl,
      kiroIDCRegion: options.kiroIDCRegion,
      kiroIDCFlow: provider === 'kiro' ? resolvedKiroIDCFlow : undefined,
    });
  } catch (error) {
    console.log(fail((error as Error).message));
    return null;
  }

  // Show step based on flow type
  if (isDeviceCodeFlow) {
    showStep(2, 4, 'progress', `Starting ${oauthConfig.displayName} Device Code flow...`);
    console.log('');
    console.log(info('Device Code Flow - follow the instructions below'));
  } else {
    showStep(2, 4, 'progress', `Starting callback server on port ${callbackPort}...`);

    // Show headless instructions (only for authorization code flows)
    if (useSelectedKiroLocalPasteCallback) {
      console.log('');
      console.log(info('Paste-callback mode enabled for Kiro CLI auth.'));
      console.log(
        '    CCS will print the authorization URL and wait for you to paste the final callback URL.'
      );
      console.log('');
    } else if (headless) {
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
    headless: processHeadless,
    verbose,
    isCLI,
    nickname,
    expectedAccountId: existingNameMatch?.id,
    authFlowType: isDeviceCodeFlow ? 'device_code' : 'authorization_code',
    kiroMethod: provider === 'kiro' ? resolvedKiroMethod : undefined,
    manualCallback: useSelectedKiroLocalPasteCallback,
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

  if (account) {
    logger.stage(
      'auth',
      'cliproxy.oauth.success',
      'OAuth flow completed successfully',
      { provider, accountId: account.id },
      { latencyMs: Date.now() - oauthStartedAt }
    );
  } else {
    logger.stage(
      'cleanup',
      'cliproxy.oauth.failed',
      'OAuth flow failed or was cancelled',
      { provider },
      { level: 'warn', latencyMs: Date.now() - oauthStartedAt }
    );
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
    logger.stage('auth', 'cliproxy.auth.cached', 'Provider already authenticated', {
      provider,
    });
    if (options.verbose) {
      console.error(`[auth] ${provider} already authenticated`);
    }
    const defaultAccount = getDefaultAccount(provider);
    if (defaultAccount) {
      touchAccount(provider, options.account || defaultAccount.id);
    }
    return true;
  }

  logger.stage('auth', 'cliproxy.auth.required', 'Provider needs authentication', {
    provider,
  });

  const oauthConfig = getOAuthConfig(provider);
  console.log(info(`${oauthConfig.displayName} authentication required`));

  const account = await triggerOAuth(provider, options);
  return account !== null;
}
