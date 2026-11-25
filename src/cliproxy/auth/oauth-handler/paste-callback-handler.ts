/**
 * Paste-Callback OAuth Mode Handler
 *
 * Manages manual paste-callback OAuth flows for headless/remote environments.
 */

import * as path from 'path';
import { fail, info, ok } from '../../../utils/ui';
import { getCcsDir } from '../../../utils/config-manager';
import { OAUTH_CALLBACK_PORTS as OAUTH_PORTS } from '../../../management/oauth-port-diagnostics';
import { CLIProxyProvider } from '../../types';
import { AccountInfo } from '../../accounts/account-manager';
import {
  checkNewAccountConflict,
  warnNewAccountConflict,
  warnPossible403Ban,
} from '../../accounts/account-safety';
import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
} from '../../proxy/proxy-target-resolver';
import {
  CLIPROXY_CALLBACK_PROVIDER_MAP,
  getManagementOAuthCallbackPath,
  getPasteCallbackStartPath,
  OAuthOptions,
  ProviderOAuthConfig,
} from '../auth-types';
import { listProviderTokenSnapshots, registerAccountFromToken } from '../token-manager';
import {
  buildOAuthStartFailureGuidance,
  formatOAuthStartFailureForCli,
} from '../oauth-start-failure-guidance';
import { generateSessionId } from '../project-selection-handler';
import { createFileSink } from '../oauth-trace/sink-file';
import { createOAuthTraceRecorder, OAuthTracePhase, type OAuthTraceRecorder } from '../oauth-trace';
import { diagnoseFailure, formatErrorMessage } from '../oauth-trace/diagnose-failure';
import { redactString } from '../oauth-trace/redactor';
import { getGeminiAuthUrlCredentialError, normalizeGitLabBaseUrl } from './credential-validation';
import {
  findNewTokenSnapshotForManualAuth,
  PASTE_CALLBACK_AUTH_URL_POLL_INTERVAL_MS,
  parseAuthUrlState,
  type PasteCallbackStartData,
  promptForPasteCallbackUrl,
  requestPasteCallbackStart,
  resolvePasteCallbackAuthUrl,
  waitForManualCallbackToken,
} from './paste-callback-helpers';

export {
  requestPasteCallbackStart,
  findNewTokenSnapshotForManualAuth,
  resolvePasteCallbackAuthUrl,
};

interface PasteCallbackTraceOptions {
  trace?: OAuthTraceRecorder;
  promptForCallbackUrl?: (timeoutMs: number) => Promise<string | null>;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

function createPasteCallbackTraceRecorder(
  provider: CLIProxyProvider,
  verbose: boolean
): OAuthTraceRecorder {
  const fileSink =
    process.env['CCS_OAUTH_LOG_FILE'] === '1'
      ? createFileSink({ dir: path.join(getCcsDir(), 'logs') })
      : undefined;
  return createOAuthTraceRecorder({
    sessionId: generateSessionId(),
    provider,
    verbose,
    fileSink,
  });
}

function printPasteCallbackTraceDiagnosis(
  trace: OAuthTraceRecorder,
  provider: CLIProxyProvider,
  verbose: boolean
): void {
  const diagnosis = diagnoseFailure(trace.snapshot());
  if (diagnosis.branchId === 'UNKNOWN') {
    return;
  }
  const callbackPort = OAUTH_PORTS[provider] ?? null;
  for (const line of formatErrorMessage(diagnosis, {
    verbose,
    platform: process.platform,
    callbackPort,
    provider,
  })) {
    console.log(line);
  }
}

async function recordFailureAndDiagnose(
  trace: OAuthTraceRecorder,
  provider: CLIProxyProvider,
  verbose: boolean,
  phase: OAuthTracePhase,
  data: Record<string, unknown>,
  error?: { code?: string; message: string } | Error
): Promise<null> {
  trace.record(phase, data, error);
  await trace.flush();
  printPasteCallbackTraceDiagnosis(trace, provider, verbose);
  return null;
}

/**
 * Handle paste-callback mode: show auth URL, prompt for callback paste
 * Uses proxy target resolver to connect to correct CLIProxyAPI instance (local or remote)
 */
export async function handlePasteCallbackMode(
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
  } & PasteCallbackTraceOptions
): Promise<AccountInfo | null> {
  const target = getProxyTarget();
  const OAUTH_STATE_TIMEOUT_MS = options?.timeoutMs ?? 10 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? PASTE_CALLBACK_AUTH_URL_POLL_INTERVAL_MS;
  const trace = options?.trace ?? createPasteCallbackTraceRecorder(provider, verbose);

  console.log('');
  console.log(info(`Starting ${oauthConfig.displayName} OAuth (paste-callback mode)...`));

  try {
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
      return recordFailureAndDiagnose(
        trace,
        provider,
        verbose,
        OAuthTracePhase.Error,
        { startPath },
        { message: startError }
      );
    }

    const authUrl = await resolvePasteCallbackAuthUrl(
      target,
      startData,
      OAUTH_STATE_TIMEOUT_MS,
      pollIntervalMs
    );

    if (!authUrl) {
      console.log(fail('No authorization URL received'));
      return recordFailureAndDiagnose(
        trace,
        provider,
        verbose,
        OAuthTracePhase.Error,
        {},
        { message: 'No authorization URL received' }
      );
    }

    const authUrlCredentialError = getGeminiAuthUrlCredentialError(provider, authUrl);
    if (authUrlCredentialError) {
      console.log(fail(authUrlCredentialError));
      return recordFailureAndDiagnose(
        trace,
        provider,
        verbose,
        OAuthTracePhase.Error,
        {},
        { code: 'GEMINI_PLUS_MISSING_CRED', message: authUrlCredentialError }
      );
    }

    const oauthState = startData.state || parseAuthUrlState(authUrl);
    const knownTokenFiles = listProviderTokenSnapshots(provider, tokenDir);

    console.log('');
    console.log('  +--------------------------------------------------------------+');
    console.log('  |  Open this URL in any browser:                               |');
    console.log('  +--------------------------------------------------------------+');
    console.log('');
    console.log(`    ${authUrl}`);
    console.log('');
    trace.record(OAuthTracePhase.AuthUrlDisplayed, { authUrl });

    trace.record(OAuthTracePhase.PasteCallbackPrompted, { timeoutMs: OAUTH_STATE_TIMEOUT_MS });
    const callbackUrl = await (options?.promptForCallbackUrl ?? promptForPasteCallbackUrl)(
      OAUTH_STATE_TIMEOUT_MS
    );

    if (!callbackUrl) {
      console.log(info('Cancelled'));
      return recordFailureAndDiagnose(trace, provider, verbose, OAuthTracePhase.Cancelled, {
        reason: 'empty_callback',
      });
    }
    trace.record(OAuthTracePhase.PasteCallbackReceived, { callbackUrl });

    let code: string | undefined;
    try {
      const parsed = new URL(callbackUrl);
      code = parsed.searchParams.get('code') || undefined;
    } catch {
      console.log(fail('Invalid URL format'));
      return recordFailureAndDiagnose(
        trace,
        provider,
        verbose,
        OAuthTracePhase.PasteCallbackInvalid,
        { reason: 'invalid_url' }
      );
    }

    if (!code) {
      console.log(fail('Invalid callback URL: missing code parameter'));
      return recordFailureAndDiagnose(
        trace,
        provider,
        verbose,
        OAuthTracePhase.PasteCallbackInvalid,
        { reason: 'missing_code' }
      );
    }

    console.log(info('Submitting callback...'));

    const callbackProvider = CLIPROXY_CALLBACK_PROVIDER_MAP[provider] || provider;
    trace.record(OAuthTracePhase.PasteCallbackSubmitted, { provider: callbackProvider });

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
      const redactedCallbackError = redactString(callbackError);
      console.log(fail(redactedCallbackError));
      warnPossible403Ban(provider, redactedCallbackError);
      return recordFailureAndDiagnose(
        trace,
        provider,
        verbose,
        OAuthTracePhase.Error,
        { status: callbackResponse.status },
        { code: 'CALLBACK_REJECTED', message: callbackError }
      );
    }

    console.log(info('Callback submitted. Waiting for token exchange...'));
    trace.record(OAuthTracePhase.TokenExchangePending, { state: oauthState ?? undefined });
    const { tokenSnapshot, error: tokenWaitError } = await waitForManualCallbackToken(
      provider,
      target,
      tokenDir,
      oauthState,
      knownTokenFiles,
      expectedAccountId,
      OAUTH_STATE_TIMEOUT_MS,
      pollIntervalMs
    );

    if (tokenWaitError) {
      const redactedTokenWaitError = redactString(tokenWaitError);
      console.log(fail(redactedTokenWaitError));
      warnPossible403Ban(provider, redactedTokenWaitError);
      return recordFailureAndDiagnose(
        trace,
        provider,
        verbose,
        OAuthTracePhase.Error,
        {},
        { code: 'CALLBACK_REJECTED', message: tokenWaitError }
      );
    }

    if (!tokenSnapshot) {
      console.log(
        fail(
          'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.'
        )
      );
      return recordFailureAndDiagnose(
        trace,
        provider,
        verbose,
        OAuthTracePhase.TokenFileMissing,
        {}
      );
    }
    trace.record(OAuthTracePhase.TokenFileAppeared, {});

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
      return recordFailureAndDiagnose(trace, provider, verbose, OAuthTracePhase.TokenFileMissing, {
        reason: 'account_match_failed',
      });
    }
    await trace.flush();

    console.log(ok('Authentication successful!'));

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
    return recordFailureAndDiagnose(
      trace,
      provider,
      verbose,
      OAuthTracePhase.Error,
      {},
      error as Error
    );
  }
}
