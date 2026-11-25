/**
 * OAuth Process Stdout/Stderr I/O & Manual Callback Replay
 */

import { ChildProcess } from 'child_process';
import { ok, fail, info } from '../../../utils/ui';
import { killWithEscalation } from '../../../utils/process-utils';
import {
  parseProjectList,
  parseDefaultProject,
  isProjectSelectionPrompt,
  isProjectList,
  requestProjectSelection,
  type ProjectSelectionPrompt,
} from '../project-selection-handler';
import { ProviderOAuthConfig } from '../auth-types';
import { showStep } from '../environment-detector';
import {
  deviceCodeEvents,
  DEVICE_CODE_TIMEOUT_MS,
  type DeviceCodePrompt,
} from '../device-code-handler';
import type { OAuthProcessOptions, ProcessState } from './types';
import {
  extractDeviceCodePrompt,
  extractLikelyOAuthAuthorizationUrl,
  getKiroBuilderIdSelectionInput,
  resolveAuthFlowType,
  resolveDeviceCodeVerificationUrl,
  validateManualCallbackUrl,
} from './output-parser';

async function handleProjectSelection(
  output: string,
  state: ProcessState,
  options: OAuthProcessOptions,
  authProcess: ChildProcess,
  log: (msg: string) => void
): Promise<void> {
  const defaultProjectId = parseDefaultProject(output) || '';

  if (state.parsedProjects.length > 0 && !options.isCLI) {
    log(`Requesting project selection from UI (session: ${state.sessionId})`);

    const prompt: ProjectSelectionPrompt = {
      sessionId: state.sessionId,
      provider: options.provider,
      projects: state.parsedProjects,
      defaultProjectId,
      supportsAll: output.includes('ALL'),
    };

    try {
      const selectedId = await requestProjectSelection(prompt);
      const response = selectedId || '';
      log(`User selected: ${response || '(default)'}`);
      authProcess.stdin?.write(response + '\n');
    } catch {
      log('Project selection failed, using default');
      authProcess.stdin?.write('\n');
    }
  } else {
    log('CLI mode or no projects, auto-selecting default');
    authProcess.stdin?.write('\n');
  }
}

async function promptManualCallbackUrl(
  displayName: string,
  state: ProcessState,
  timeoutMs: number
): Promise<string | null> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (value: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      state.cancelManualCallbackPrompt = null;
      resolve(value);
    };

    state.cancelManualCallbackPrompt = () => {
      if (!settled) {
        rl.close();
        finish(null);
      }
    };

    rl.on('close', () => {
      finish(null);
    });

    console.log('');
    console.log(info(`${displayName} is waiting for the OAuth callback.`));
    console.log('Paste the full callback URL after you finish the login in your browser.');
    rl.question('> ', (answer) => {
      rl.close();
      finish(answer.trim() || null);
    });

    timeout = setTimeout(() => {
      if (!settled) {
        console.log('');
        console.log(fail('Timed out waiting for callback URL'));
        rl.close();
      }
    }, timeoutMs);
  });
}

export async function replayManualCallback(
  oauthConfig: ProviderOAuthConfig,
  authProcess: ChildProcess,
  authUrl: string,
  verbose: boolean,
  state: ProcessState,
  timeoutMs: number
): Promise<boolean> {
  if (!authUrl.includes('http://') && !authUrl.includes('https://')) {
    return false;
  }

  const callbackUrl = await promptManualCallbackUrl(oauthConfig.displayName, state, timeoutMs);
  if (!callbackUrl) {
    console.log(info('Cancelled'));
    killWithEscalation(authProcess);
    return true;
  }

  const validationError = validateManualCallbackUrl(callbackUrl, authUrl);
  if (validationError) {
    console.log(fail(validationError));
    killWithEscalation(authProcess);
    return true;
  }

  console.log(info('Replaying callback to the local auth server...'));

  try {
    const response = await fetch(callbackUrl);
    if (!response.ok && response.status >= 400) {
      console.log(fail(`OAuth callback failed with status ${response.status}`));
      killWithEscalation(authProcess);
      return true;
    }
    console.log(ok('Callback submitted. Waiting for token exchange...'));
  } catch (error) {
    if (verbose) {
      console.log(fail(`Failed to replay callback: ${(error as Error).message}`));
    } else {
      console.log(fail('Failed to replay callback to the local auth server'));
    }
    killWithEscalation(authProcess);
  }

  return true;
}

/**
 * Handle stdout data from OAuth process
 */
export async function handleStdout(
  output: string,
  state: ProcessState,
  options: OAuthProcessOptions,
  authProcess: ChildProcess,
  log: (msg: string) => void
): Promise<void> {
  log(`stdout: ${output.trim()}`);
  state.accumulatedOutput += output;

  const flowType = resolveAuthFlowType(options);
  const isDeviceCodeFlow = flowType === 'device_code';

  if (
    options.provider === 'kiro' &&
    options.kiroMethod === 'aws' &&
    !state.kiroMethodSelectionHandled &&
    state.accumulatedOutput.includes('Select login method')
  ) {
    const builderIdSelection = getKiroBuilderIdSelectionInput(state.accumulatedOutput);
    if (builderIdSelection) {
      state.kiroMethodSelectionHandled = true;
      authProcess.stdin?.write(builderIdSelection);
      log(`Auto-selected Kiro Builder ID flow (${builderIdSelection.trim()})`);
    }
  }

  if (isProjectList(state.accumulatedOutput) && state.parsedProjects.length === 0) {
    state.parsedProjects = parseProjectList(state.accumulatedOutput);
    log(`Parsed ${state.parsedProjects.length} projects`);
  }

  if (!isDeviceCodeFlow && !state.projectPromptHandled && isProjectSelectionPrompt(output)) {
    state.projectPromptHandled = true;
    await handleProjectSelection(output, state, options, authProcess, log);
  }

  if (isDeviceCodeFlow && !state.deviceCodeDisplayed) {
    const devicePrompt = extractDeviceCodePrompt(state.accumulatedOutput);

    if (devicePrompt) {
      state.userCode = devicePrompt.userCode;
      state.deviceCodeDisplayed = true;
      log(`Parsed device code: ${state.userCode}`);

      const verificationUrl = resolveDeviceCodeVerificationUrl(
        options.provider,
        state.userCode,
        devicePrompt.verificationUrl
      );

      const deviceCodePrompt: DeviceCodePrompt = {
        sessionId: state.sessionId,
        provider: options.provider,
        userCode: state.userCode,
        verificationUrl,
        expiresAt: Date.now() + DEVICE_CODE_TIMEOUT_MS,
      };
      deviceCodeEvents.emit('deviceCode:received', deviceCodePrompt);

      console.log('');
      console.log('  ╔══════════════════════════════════════════════════════╗');
      console.log(`  ║  Enter this code: ${state.userCode.padEnd(35)}║`);
      console.log('  ╚══════════════════════════════════════════════════════╝');
      console.log('');
      console.log(info(`Open: ${verificationUrl}`));
      console.log('');

      process.stdout.write('\x1b[1A\x1b[2K');
      showStep(2, 4, 'ok', 'Device code received');
      showStep(3, 4, 'progress', 'Waiting for authorization...');
    }
  }

  if (
    !isDeviceCodeFlow &&
    !state.browserOpened &&
    (output.includes('listening') || output.includes('http'))
  ) {
    process.stdout.write('\x1b[1A\x1b[2K');
    showStep(2, 4, 'ok', `Callback server listening on port ${options.callbackPort}`);
    showStep(3, 4, 'progress', 'Opening browser...');
    state.browserOpened = true;
  }

  if (!isDeviceCodeFlow && !state.urlDisplayed) {
    const authUrl = extractLikelyOAuthAuthorizationUrl(state.accumulatedOutput);
    if (authUrl) {
      console.log('');
      console.log(info(`${options.oauthConfig.displayName} OAuth URL:`));
      console.log(`    ${authUrl}`);
      console.log('');
      state.urlDisplayed = true;

      if (options.manualCallback && !state.manualCallbackPrompted) {
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
  }
}

/** Display OAuth URL from stderr if in headless mode */
export function displayUrlFromStderr(
  output: string,
  state: ProcessState,
  oauthConfig: ProviderOAuthConfig
): void {
  const authUrl = extractLikelyOAuthAuthorizationUrl(output);
  if (authUrl) {
    console.log('');
    console.log(info(`${oauthConfig.displayName} OAuth URL:`));
    console.log(`    ${authUrl}`);
    console.log('');
    state.urlDisplayed = true;
  }
}
