/**
 * OAuth Interactive Flow Orchestration
 *
 * Coordinates CLI/dashboard OAuth trigger and cached-authentication checks.
 */

import { fail, info, warn, color } from '../../../utils/ui';
import { createLogger } from '../../../services/logging';
import { getConfiguredBackend } from '../../binary-manager';
import { CLIProxyProvider } from '../../types';
import {
  AccountInfo,
  getProviderAccounts,
  getDefaultAccount,
  touchAccount,
  findAccountNameMatch,
} from '../../accounts/account-manager';
import { OAUTH_CALLBACK_PORTS as OAUTH_PORTS } from '../../../management/oauth-port-diagnostics';
import {
  OAuthOptions,
  DEFAULT_KIRO_AUTH_METHOD,
  DEFAULT_KIRO_IDC_FLOW,
  getKiroCallbackPort,
  isKiroDeviceCodeMethod,
  getOAuthConfig,
  normalizeKiroAuthMethod,
  normalizeKiroIDCFlow,
  isKiroCLIAuthMethod,
} from '../auth-types';
import { isHeadlessEnvironment, killProcessOnPort, showStep } from '../environment-detector';
import { getProviderTokenDir, isAuthenticated, registerAccountFromToken } from '../token-manager';
import { executeOAuthProcess } from '../oauth-process';
import { importKiroToken } from '../kiro-import';
import {
  getOAuthFlagCandidatesForProvider,
  selectAdvertisedAuthFlag,
} from '../oauth-cli-capabilities';
import { buildOAuthArgs } from '../oauth-cli-args';
import { getProxyTarget } from '../../proxy/proxy-target-resolver';
import {
  checkNewAccountConflict,
  warnNewAccountConflict,
  warnOAuthBanRisk,
} from '../../accounts/account-safety';
import { maybeOfferPoolRouting } from '../../routing/pool-opt-in-prompt';
import { checkCrossLaneEmailOverlap } from '../../accounts/account-safety-cross-lane';
import { ensureCliAntigravityResponsibility } from '../antigravity-responsibility';
import { getUnsupportedAuthStartReason } from '../../provider-capabilities';
import {
  getCliAuthNicknameError,
  getGeminiOriginalBackendOAuthMessage,
  getGeminiPlusOAuthCredentialError,
  normalizeGitLabBaseUrl,
  usesKiroLocalCallbackReplay,
} from './credential-validation';
import { handlePasteCallbackMode } from './paste-callback-handler';
import {
  formatOAuthRuntimePreparationError,
  handleGitLabPatLogin,
  prepareOAuthRuntime,
  promptAddAccount,
  promptOAuthModeChoice,
  runPreflightChecks,
} from './interactive-prompts';

const logger = createLogger('cliproxy:auth:oauth');

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
  const unsupportedReason = getUnsupportedAuthStartReason(provider);
  if (unsupportedReason) {
    console.log(fail(unsupportedReason));
    return null;
  }

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

  const existingAccounts = getProviderAccounts(provider);
  const accountCountBeforeAdd = existingAccounts.length;
  const existingNameMatch = nickname ? findAccountNameMatch(existingAccounts, nickname) : null;
  const targetAccountId = options.expectedAccountId || existingNameMatch?.id;
  const nicknameError = !fromUI
    ? getCliAuthNicknameError(provider, nickname, existingAccounts, targetAccountId)
    : null;
  if (nicknameError) {
    console.log(fail(nicknameError));
    return null;
  }

  if (options.import && provider === 'kiro') {
    const tokenDir = getProviderTokenDir(provider);
    const success = await importKiroToken(verbose);
    if (success) {
      return registerAccountFromToken(provider, tokenDir, nickname, verbose, targetAccountId);
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

  if (headless && !selectedPasteCallback && !options.portForward && !isDeviceCodeFlow) {
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
  const activeBackend = getConfiguredBackend();

  if (!(selectedPasteCallback && !useSelectedKiroDirectCliFlow)) {
    const credentialError = getGeminiPlusOAuthCredentialError(provider, activeBackend);
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
      targetAccountId,
      {
        gitlabBaseUrl: resolvedGitLabBaseUrl,
        gitlabPersonalAccessToken: options.gitlabPersonalAccessToken,
      }
    );
  }

  if (selectedPasteCallback && !useSelectedKiroDirectCliFlow) {
    const target = getProxyTarget();
    let tokenDir = getProviderTokenDir(provider);
    if (provider === 'gemini' && activeBackend === 'original' && !target.isRemote) {
      try {
        const runtime = await prepareOAuthRuntime(provider, verbose, activeBackend);
        tokenDir = runtime.tokenDir;
        const selectedFlag = selectAdvertisedAuthFlag(
          getOAuthFlagCandidatesForProvider(provider),
          runtime.advertisedFlags
        );
        if (!selectedFlag) {
          console.log(fail(getGeminiOriginalBackendOAuthMessage()));
          return null;
        }
      } catch (error) {
        console.log(fail(formatOAuthRuntimePreparationError(error)));
        return null;
      }
    }

    return handlePasteCallbackMode(
      provider,
      oauthConfig,
      verbose,
      tokenDir,
      nickname,
      targetAccountId,
      {
        kiroMethod: provider === 'kiro' ? resolvedKiroMethod : undefined,
        gitlabBaseUrl: provider === 'gitlab' ? resolvedGitLabBaseUrl : undefined,
        add,
      }
    );
  }

  if (!isDeviceCodeFlow && !(await runPreflightChecks(provider, oauthConfig))) {
    return null;
  }

  console.log('');

  let runtime;
  let advertisedFlags: ReadonlySet<string>;
  try {
    runtime = await prepareOAuthRuntime(provider, verbose, activeBackend);
    advertisedFlags = runtime.advertisedFlags;
  } catch (error) {
    console.log(fail(formatOAuthRuntimePreparationError(error)));
    return null;
  }
  const { binaryPath, tokenDir, configPath } = runtime;

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
      advertisedFlags,
      backend: activeBackend,
      kiroMethod: provider === 'kiro' ? resolvedKiroMethod : undefined,
      kiroIDCStartUrl: options.kiroIDCStartUrl,
      kiroIDCRegion: options.kiroIDCRegion,
      kiroIDCFlow: provider === 'kiro' ? resolvedKiroIDCFlow : undefined,
    });
  } catch (error) {
    console.log(fail((error as Error).message));
    return null;
  }

  if (isDeviceCodeFlow) {
    showStep(2, 4, 'progress', `Starting ${oauthConfig.displayName} Device Code flow...`);
    console.log('');
    console.log(info('Device Code Flow - follow the instructions below'));
  } else {
    showStep(2, 4, 'progress', `Starting callback server on port ${callbackPort}...`);

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
    expectedAccountId: targetAccountId,
    authFlowType: isDeviceCodeFlow ? 'device_code' : 'authorization_code',
    kiroMethod: provider === 'kiro' ? resolvedKiroMethod : undefined,
    manualCallback: useSelectedKiroLocalPasteCallback,
  });

  if (account && provider === 'kiro' && !noIncognito) {
    console.log('');
    console.log(info('Tip: To save your AWS login credentials for future sessions:'));
    console.log('       Use: ccs kiro --no-incognito');
    console.log('       Or enable "Kiro: Use normal browser" in: ccs config');
  }

  if (account?.email) {
    const conflicts = checkNewAccountConflict(provider, account.email);
    if (conflicts) {
      warnNewAccountConflict(account.email, conflicts);
    }
  }

  if (account) {
    if (account.email) {
      checkCrossLaneEmailOverlap(provider, account.email);
    }

    if (!fromUI) {
      try {
        await maybeOfferPoolRouting(provider, accountCountBeforeAdd);
      } catch (promptErr) {
        logger.stage(
          'auth',
          'cliproxy.pool-prompt.error',
          'Pool routing prompt failed (non-fatal)',
          { provider },
          { level: 'warn' }
        );
        if (process.env.CCS_DEBUG) {
          console.error('[!] Pool routing prompt error (non-fatal):', promptErr);
        }
      }
    }

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
