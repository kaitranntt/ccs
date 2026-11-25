/**
 * OAuth Process Launcher & Lifecycle Manager
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { ok, fail, info } from '../../../utils/ui';
import { killWithEscalation } from '../../../utils/process-utils';
import { getCcsDir } from '../../../utils/config-manager';
import { AccountInfo } from '../../accounts/account-manager';
import { generateSessionId, cancelProjectSelection } from '../project-selection-handler';
import { getTimeoutTroubleshooting, showStep } from '../environment-detector';
import { listProviderTokenSnapshots, registerAccountFromToken } from '../token-manager';
import { deviceCodeEvents } from '../device-code-handler';
import {
  registerAuthSession,
  attachProcessToSession,
  unregisterAuthSession,
  authSessionEvents,
} from '../auth-session-manager';
import { createOAuthTraceRecorder, OAuthTracePhase, type OAuthTraceRecorder } from '../oauth-trace';
import { redactString } from '../oauth-trace/redactor';
import { createFileSink } from '../oauth-trace/sink-file';
import type { OAuthProcessOptions, ProcessState } from './types';
import {
  analyzeSuccessfulAuthExit,
  extractLikelyOAuthAuthorizationUrl,
  resolveAuthFlowType,
} from './output-parser';
import { displayUrlFromStderr, handleStdout, replayManualCallback } from './process-io';
import { handleProcessError, handleTokenNotFound } from './error-and-timeout';

/**
 * Execute OAuth process and wait for completion
 */
export function executeOAuthProcess(options: OAuthProcessOptions): Promise<AccountInfo | null> {
  const {
    provider,
    binaryPath,
    args,
    tokenDir,
    oauthConfig,
    callbackPort,
    headless,
    verbose,
    nickname,
    expectedAccountId,
  } = options;

  const log = (msg: string) => {
    if (verbose) console.error(`[auth] ${msg}`);
  };

  return new Promise<AccountInfo | null>((resolve) => {
    const flowType = resolveAuthFlowType(options);
    const isDeviceCodeFlow = flowType === 'device_code';
    const knownTokenFiles = listProviderTokenSnapshots(provider, tokenDir);

    const stdinMode =
      isDeviceCodeFlow &&
      process.stdin.isTTY &&
      !(provider === 'kiro' && options.kiroMethod === 'aws')
        ? 'inherit'
        : 'pipe';

    const authProcess = spawn(binaryPath, args, {
      stdio: [stdinMode, 'pipe', 'pipe'],
      env: { ...process.env, CLI_PROXY_AUTH_DIR: tokenDir },
    });

    let stdinKeepalive: ReturnType<typeof setInterval> | null = null;
    let traceRef: OAuthTraceRecorder | null = null;

    const cleanup = () => {
      if (stdinKeepalive) clearInterval(stdinKeepalive);
      if (traceRef) {
        try {
          traceRef.record(OAuthTracePhase.Cancelled, { reason: 'signal' });
          void traceRef.flush();
        } catch {
          // never block shutdown on trace errors
        }
      }
      if (authProcess && authProcess.exitCode === null) {
        killWithEscalation(authProcess);
      }
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    const state: ProcessState = {
      stderrData: '',
      urlDisplayed: false,
      browserOpened: false,
      projectPromptHandled: false,
      accumulatedOutput: '',
      parsedProjects: [],
      sessionId: generateSessionId(),
      deviceCodeDisplayed: false,
      userCode: null,
      kiroMethodSelectionHandled: false,
      manualCallbackPrompted: false,
      cancelManualCallbackPrompt: null,
    };

    const fileSink =
      process.env['CCS_OAUTH_LOG_FILE'] === '1'
        ? createFileSink({ dir: path.join(getCcsDir(), 'logs') })
        : undefined;
    const trace = createOAuthTraceRecorder({
      sessionId: state.sessionId,
      provider,
      verbose,
      fileSink,
    });
    traceRef = trace;
    trace.record(OAuthTracePhase.BinarySpawn, {
      callbackPort,
      headless,
      manualCallback: !!options.manualCallback,
      flowType,
    });

    registerAuthSession(state.sessionId, provider);
    attachProcessToSession(state.sessionId, authProcess);

    const handleCancel = (cancelledSessionId: string) => {
      if (cancelledSessionId === state.sessionId && authProcess && authProcess.exitCode === null) {
        log('Session cancelled externally');
        if (traceRef) {
          try {
            traceRef.record(OAuthTracePhase.Cancelled, { reason: 'external' });
            void traceRef.flush();
          } catch {
            // never block shutdown on trace errors
          }
        }
        killWithEscalation(authProcess);
      }
    };
    authSessionEvents.on('session:cancelled', handleCancel);

    const startTime = Date.now();

    if (!isDeviceCodeFlow && stdinMode === 'pipe') {
      stdinKeepalive = setInterval(() => {
        if (authProcess.stdin && !authProcess.stdin.destroyed) {
          authProcess.stdin.write('\n');
          log('Sent stdin keepalive (skip manual URL prompt)');
        }
      }, 16000);
    }

    const releaseSessionResources = () => {
      if (stdinKeepalive) clearInterval(stdinKeepalive);
      state.cancelManualCallbackPrompt?.();
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
      authSessionEvents.removeListener('session:cancelled', handleCancel);
      unregisterAuthSession(state.sessionId);
      cancelProjectSelection(state.sessionId);
    };

    authProcess.stdout?.on('data', async (data: Buffer) => {
      const out = data.toString();
      const wasUrlDisplayed = state.urlDisplayed;
      const wasBrowserOpened = state.browserOpened;
      await handleStdout(out, state, options, authProcess, log);
      if (!wasUrlDisplayed && state.urlDisplayed) {
        trace.record(OAuthTracePhase.AuthUrlDisplayed, {});
      }
      if (!wasBrowserOpened && state.browserOpened) {
        trace.record(OAuthTracePhase.BrowserOpened, { port: callbackPort });
        trace.record(OAuthTracePhase.CallbackObservedHeuristic, { port: callbackPort });
      }
      const snippet = redactString(out.trim().slice(0, 200));
      if (snippet) trace.record(OAuthTracePhase.BinaryStdout, { snippet });
    });

    authProcess.stderr?.on('data', async (data: Buffer) => {
      const output = data.toString();
      state.stderrData += output;
      log(`stderr: ${output.trim()}`);
      const snippet = redactString(output.trim().slice(0, 200));
      if (snippet) trace.record(OAuthTracePhase.BinaryStderr, { snippet });
      if (headless && !state.urlDisplayed) {
        displayUrlFromStderr(output, state, oauthConfig);
      }
      if (options.manualCallback && !state.manualCallbackPrompted) {
        const authUrl =
          extractLikelyOAuthAuthorizationUrl(output) ?? output.match(/https?:\/\/[^\s]+/)?.[0];
        if (authUrl) {
          state.manualCallbackPrompted = true;
          await replayManualCallback(
            options.oauthConfig,
            authProcess,
            authUrl,
            options.verbose,
            state,
            10 * 60 * 1000
          );
        }
      }
    });

    setTimeout(() => {
      if (isDeviceCodeFlow) {
        if (!state.deviceCodeDisplayed) {
          showStep(3, 4, 'progress', 'Waiting for device code...');
        }
        showStep(4, 4, 'progress', 'Polling for authorization...');
        console.log('');
        console.log(
          info('Complete the login in your browser. This page will update automatically.')
        );
      } else {
        if (!state.browserOpened) {
          process.stdout.write('\x1b[1A\x1b[2K');
          showStep(2, 4, 'ok', `Callback server ready (port ${callbackPort})`);
          showStep(3, 4, 'ok', 'Browser opened');
          state.browserOpened = true;
        }
        showStep(4, 4, 'progress', 'Waiting for OAuth callback...');
        console.log('');
        console.log(
          info('Complete the login in your browser. This page will update automatically.')
        );
      }
      if (!verbose) console.log(info('If stuck, try: ccs ' + provider + ' --auth --verbose'));
    }, 2000);

    const timeoutMs = options.manualCallback
      ? 10 * 60 * 1000
      : headless || isDeviceCodeFlow
        ? 300000
        : 120000;
    const timeout = setTimeout(() => {
      releaseSessionResources();
      trace.record(OAuthTracePhase.Timeout, { timeoutMs });
      void trace.flush();
      killWithEscalation(authProcess);
      console.log('');
      console.log(fail(`OAuth timed out after ${timeoutMs / 60000} minutes`));
      for (const line of getTimeoutTroubleshooting(provider, callbackPort ?? null)) {
        console.log(line);
      }
      resolve(null);
    }, timeoutMs);

    authProcess.on('exit', async (code) => {
      clearTimeout(timeout);
      releaseSessionResources();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      trace.record(OAuthTracePhase.BinaryExit, {
        code,
        stderrTail: redactString(state.stderrData.trim().split('\n').pop() ?? ''),
      });

      if (code === 0) {
        const exitAnalysis = analyzeSuccessfulAuthExit({
          provider,
          knownTokenFiles,
          currentTokenFiles: listProviderTokenSnapshots(provider, tokenDir),
          expectedAccountId,
          stdoutData: state.accumulatedOutput,
          stderrData: state.stderrData,
        });

        if (exitAnalysis.tokenSnapshot) {
          trace.record(OAuthTracePhase.TokenFileAppeared, {});
          await trace.flush();
          console.log('');
          console.log(ok(`Authentication successful (${elapsed}s)`));

          if (isDeviceCodeFlow && state.deviceCodeDisplayed) {
            deviceCodeEvents.emit('deviceCode:completed', state.sessionId);
          }

          resolve(
            registerAccountFromToken(provider, tokenDir, nickname, verbose, expectedAccountId)
          );
        } else {
          if (isDeviceCodeFlow && state.deviceCodeDisplayed) {
            deviceCodeEvents.emit('deviceCode:failed', {
              sessionId: state.sessionId,
              error: exitAnalysis.failureReason || 'Token not found after authentication',
            });
          }

          trace.record(OAuthTracePhase.TokenFileMissing, {});
          await trace.flush();
          const account = await handleTokenNotFound(
            provider,
            callbackPort,
            tokenDir,
            nickname,
            expectedAccountId,
            verbose,
            exitAnalysis.failureReason || undefined,
            trace
          );
          resolve(account);
        }
      } else {
        if (isDeviceCodeFlow && state.deviceCodeDisplayed) {
          deviceCodeEvents.emit('deviceCode:failed', {
            sessionId: state.sessionId,
            error: `Auth process exited with code ${code}`,
          });
        }

        handleProcessError(code, state, headless);
        resolve(null);
      }
    });

    authProcess.on('error', (error) => {
      clearTimeout(timeout);
      releaseSessionResources();
      trace.record(OAuthTracePhase.Error, {}, error);
      void trace.flush();
      console.log('');
      console.log(fail(`Failed to start auth process: ${error.message}`));
      resolve(null);
    });
  });
}
