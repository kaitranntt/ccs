/**
 * OAuth Process Execution for CLIProxyAPI
 *
 * Handles the spawning and monitoring of CLIProxy OAuth process.
 * Separated from oauth-handler.ts for modularity.
 */

import { spawn, ChildProcess } from 'child_process';
import { ok, fail, info, warn } from '../../utils/ui';
import { killWithEscalation } from '../../utils/process-utils';
import { tryKiroImport } from './kiro-import';
import { CLIProxyProvider } from '../types';
import { AccountInfo } from '../accounts/account-manager';
import {
  parseProjectList,
  parseDefaultProject,
  isProjectSelectionPrompt,
  isProjectList,
  generateSessionId,
  requestProjectSelection,
  cancelProjectSelection,
  type GCloudProject,
  type ProjectSelectionPrompt,
} from '../auth/project-selection-handler';
import { KiroAuthMethod, ProviderOAuthConfig } from './auth-types';
import { getTimeoutTroubleshooting, showStep } from './environment-detector';
import {
  type ProviderTokenSnapshot,
  findNewTokenSnapshot,
  listProviderTokenSnapshots,
  registerAccountFromToken,
} from './token-manager';
import {
  deviceCodeEvents,
  DEVICE_CODE_TIMEOUT_MS,
  type DeviceCodePrompt,
} from '../auth/device-code-handler';
import { getOAuthFlowType } from '../provider-capabilities';
import {
  registerAuthSession,
  attachProcessToSession,
  unregisterAuthSession,
  authSessionEvents,
} from '../auth/auth-session-manager';
import { createOAuthTraceRecorder, OAuthTracePhase, type OAuthTraceRecorder } from './oauth-trace';
import { redactString } from './oauth-trace/redactor';
import { createFileSink } from './oauth-trace/sink-file';
import { diagnoseFailure, formatErrorMessage } from './oauth-trace/diagnose-failure';
import * as path from 'path';
import { getCcsDir } from '../../utils/config-manager';

/** Options for OAuth process execution */
export interface OAuthProcessOptions {
  provider: CLIProxyProvider;
  binaryPath: string;
  args: string[];
  tokenDir: string;
  oauthConfig: ProviderOAuthConfig;
  callbackPort: number | null;
  headless: boolean;
  verbose: boolean;
  isCLI: boolean;
  nickname?: string;
  expectedAccountId?: string;
  authFlowType?: 'device_code' | 'authorization_code';
  kiroMethod?: KiroAuthMethod;
  manualCallback?: boolean;
}

/** Internal state for OAuth process */
interface ProcessState {
  stderrData: string;
  urlDisplayed: boolean;
  browserOpened: boolean;
  projectPromptHandled: boolean;
  accumulatedOutput: string;
  parsedProjects: GCloudProject[];
  sessionId: string;
  /** Device code displayed to user (for Device Code Flow) */
  deviceCodeDisplayed: boolean;
  /** The user code to enter at verification URL */
  userCode: string | null;
  kiroMethodSelectionHandled: boolean;
  manualCallbackPrompted: boolean;
  cancelManualCallbackPrompt: (() => void) | null;
}

/**
 * Handle project selection prompt
 */
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

function resolveAuthFlowType(options: OAuthProcessOptions): 'device_code' | 'authorization_code' {
  return options.authFlowType || getOAuthFlowType(options.provider) || 'authorization_code';
}

export function extractDeviceCodePrompt(output: string): {
  userCode: string;
  verificationUrl: string | null;
} | null {
  const codeMatch = output.match(
    /(?:enter\s+)?(?:this\s+)?(?:user\s+)?code[:\s]+["']?([A-Z0-9]{4,8}[-\s]?[A-Z0-9]{4,8})["']?/i
  );
  if (!codeMatch) return null;

  const urlMatch = output.match(/(https?:\/\/[^\s]+device[^\s]*)/i);
  return {
    userCode: codeMatch[1].toUpperCase(),
    verificationUrl: urlMatch?.[1] ?? null,
  };
}

export function resolveDeviceCodeVerificationUrl(
  provider: CLIProxyProvider,
  userCode: string,
  parsedUrl: string | null
): string {
  if (parsedUrl) {
    return parsedUrl;
  }
  if (provider === 'xai') {
    return `https://accounts.x.ai/oauth2/device?user_code=${encodeURIComponent(userCode)}`;
  }
  return 'https://github.com/login/device';
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1'
  );
}

export function getExpectedLocalCallback(authUrl: string): {
  origin: string;
  pathname: string;
  state: string | null;
} | null {
  try {
    const parsedAuthUrl = new URL(authUrl);
    const redirectUriRaw = parsedAuthUrl.searchParams.get('redirect_uri');
    if (!redirectUriRaw) {
      return null;
    }

    const redirectUri = new URL(redirectUriRaw);
    if (!isLoopbackHost(redirectUri.hostname)) {
      return null;
    }

    return {
      origin: redirectUri.origin,
      pathname: redirectUri.pathname,
      state: parsedAuthUrl.searchParams.get('state'),
    };
  } catch {
    return null;
  }
}

export function validateManualCallbackUrl(callbackUrl: string, authUrl: string): string | null {
  let parsedCallback: URL;
  try {
    parsedCallback = new URL(callbackUrl);
  } catch {
    return 'Invalid callback URL format';
  }

  if (!parsedCallback.searchParams.get('code')) {
    return 'Invalid callback URL: missing code parameter';
  }

  const expectedCallback = getExpectedLocalCallback(authUrl);
  if (!expectedCallback) {
    return 'Unable to determine the expected local callback target';
  }

  if (!isLoopbackHost(parsedCallback.hostname)) {
    return 'Callback URL must target the local OAuth callback server';
  }

  if (
    parsedCallback.origin !== expectedCallback.origin ||
    parsedCallback.pathname !== expectedCallback.pathname
  ) {
    return 'Callback URL does not match the expected local OAuth callback target';
  }

  if (expectedCallback.state) {
    const callbackState = parsedCallback.searchParams.get('state');
    if (callbackState !== expectedCallback.state) {
      return 'Callback URL state does not match the active OAuth session';
    }
  }

  return null;
}

export function getKiroBuilderIdSelectionInput(output: string): string | null {
  const promptMatch = /Select login method/i.exec(output);
  if (!promptMatch || promptMatch.index === undefined) {
    return null;
  }

  const promptWindow = output.slice(promptMatch.index, promptMatch.index + 600);
  const optionMatch = /(?:^|\n)\s*(\d+)\s*[\).:-]?\s*.*\bBuilder ID\b/im.exec(promptWindow);
  if (!optionMatch) {
    return null;
  }

  return `${optionMatch[1]}\n`;
}

export function extractLikelyOAuthAuthorizationUrl(output: string): string | null {
  const urls = Array.from(output.matchAll(/https?:\/\/[^\s]+/g), (match) => match[0]);
  let selectedUrl: string | null = null;
  let selectedScore = 0;

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      let score = 0;
      if (parsed.searchParams.has('redirect_uri')) score += 4;
      if (parsed.searchParams.has('state')) score += 2;
      if (parsed.searchParams.has('code_challenge')) score += 1;
      if (parsed.pathname.includes('/authorize')) score += 1;
      if (isLoopbackHost(parsed.hostname)) score -= 3;

      if (score >= selectedScore && score > 0) {
        selectedUrl = url;
        selectedScore = score;
      }
    } catch {
      continue;
    }
  }

  return selectedUrl;
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

async function replayManualCallback(
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
async function handleStdout(
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

  // Parse project list when available
  if (isProjectList(state.accumulatedOutput) && state.parsedProjects.length === 0) {
    state.parsedProjects = parseProjectList(state.accumulatedOutput);
    log(`Parsed ${state.parsedProjects.length} projects`);
  }

  // Handle project selection prompt (Authorization Code flows only - Device Code has no stdin pipe)
  if (!isDeviceCodeFlow && !state.projectPromptHandled && isProjectSelectionPrompt(output)) {
    state.projectPromptHandled = true;
    await handleProjectSelection(output, state, options, authProcess, log);
  }

  // Handle Device Code Flow: parse and display user code
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

      // Emit device code event for WebSocket broadcast to UI
      const deviceCodePrompt: DeviceCodePrompt = {
        sessionId: state.sessionId,
        provider: options.provider,
        userCode: state.userCode,
        verificationUrl,
        expiresAt: Date.now() + DEVICE_CODE_TIMEOUT_MS,
      };
      deviceCodeEvents.emit('deviceCode:received', deviceCodePrompt);

      // Display device code prominently in CLI
      console.log('');
      console.log('  ╔══════════════════════════════════════════════════════╗');
      console.log(`  ║  Enter this code: ${state.userCode.padEnd(35)}║`);
      console.log('  ╚══════════════════════════════════════════════════════╝');
      console.log('');
      console.log(info(`Open: ${verificationUrl}`));
      console.log('');

      // Update step display for device code flow
      process.stdout.write('\x1b[1A\x1b[2K');
      showStep(2, 4, 'ok', 'Device code received');
      showStep(3, 4, 'progress', 'Waiting for authorization...');
    }
  }

  // Detect callback server / browser (for Authorization Code flows only)
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

  // Display OAuth URL for all modes (enables VS Code terminal URL detection popup)
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
function displayUrlFromStderr(
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

const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*m/g;

export function extractLikelyAuthFailureFromLogs(
  provider: CLIProxyProvider,
  logData: string
): string | null {
  if (!logData.trim()) {
    return null;
  }

  const normalizedLines = logData
    .split('\n')
    .map((line) => line.replace(ANSI_ESCAPE_REGEX, '').trim())
    .filter(Boolean)
    .map((line) => {
      const messageIndex = line.indexOf('msg="');
      if (messageIndex >= 0) {
        const message = line
          .slice(messageIndex + 5)
          .replace(/"$/, '')
          .trim();
        if (message) {
          return message;
        }
      }
      return line;
    });

  const providerPatterns: Partial<Record<CLIProxyProvider, RegExp[]>> = {
    xai: [/xai authentication failed:\s*(.+)/i],
    ghcp: [
      /github copilot authentication failed:\s*(.+)/i,
      /failed to verify copilot access[^:]*:\s*(.+)/i,
    ],
    kiro: [
      /kiro idc authentication failed:\s*(.+)/i,
      /kiro authentication failed:\s*(.+)/i,
      /login failed:\s*(.+)/i,
      /failed to register client:\s*(.+)/i,
    ],
  };

  const prioritizedPatterns = [
    ...(providerPatterns[provider] || []),
    /^authentication failed:\s*(.+)/i,
    /^failed to save auth:\s*(.+)/i,
  ];

  for (let i = normalizedLines.length - 1; i >= 0; i--) {
    const line = normalizedLines[i];
    for (const pattern of prioritizedPatterns) {
      const match = line.match(pattern);
      if (match?.[1]?.trim()) {
        return match[1].trim().slice(0, 240);
      }
    }
  }

  return null;
}

export function extractLikelyAuthFailureFromStderr(
  provider: CLIProxyProvider,
  stderrData: string
): string | null {
  return extractLikelyAuthFailureFromLogs(provider, stderrData);
}

export function analyzeSuccessfulAuthExit(options: {
  provider: CLIProxyProvider;
  knownTokenFiles: ProviderTokenSnapshot[];
  currentTokenFiles: ProviderTokenSnapshot[];
  expectedAccountId?: string;
  stdoutData: string;
  stderrData: string;
}): { tokenSnapshot: ProviderTokenSnapshot | null; failureReason: string | null } {
  const tokenSnapshot = findNewTokenSnapshot(
    options.currentTokenFiles,
    options.knownTokenFiles,
    options.expectedAccountId
  );
  const failureReason = extractLikelyAuthFailureFromLogs(
    options.provider,
    [options.stdoutData, options.stderrData].filter(Boolean).join('\n')
  );

  return { tokenSnapshot, failureReason };
}

/** Handle token not found after successful process exit */
async function handleTokenNotFound(
  provider: CLIProxyProvider,
  callbackPort: number | null,
  tokenDir: string,
  nickname: string | undefined,
  expectedAccountId: string | undefined,
  verbose: boolean,
  failureReason?: string,
  trace?: OAuthTraceRecorder
): Promise<AccountInfo | null> {
  console.log('');

  if (failureReason) {
    // Sanitize internal URLs/paths from failure reason to avoid leaking infrastructure details
    const sanitizedReason = failureReason
      .replace(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[^\s]*/gi, '[internal-url]')
      .replace(/\/(?:root|home|opt|tmp|var)\/[^\s]*/g, '[path]');
    console.log(fail('Authentication failed before a usable token was saved'));
    console.log(`    ${sanitizedReason}`);
    console.log('');
    console.log(`Try: ccs ${provider} --auth --verbose`);
    return null;
  }

  // Kiro-specific: Try auto-import from Kiro IDE
  if (provider === 'kiro') {
    console.log(warn('Callback redirected to Kiro IDE. Attempting to import token...'));

    const result = await tryKiroImport(tokenDir, verbose);

    if (result.success) {
      const providerInfo = result.provider ? ` (Provider: ${result.provider})` : '';
      console.log(ok(`Imported Kiro token from IDE${providerInfo}`));
      return registerAccountFromToken(provider, tokenDir, nickname, verbose, expectedAccountId);
    }

    console.log(fail(`Auto-import failed: ${result.error}`));
    console.log('');
    console.log('To manually import from Kiro IDE:');
    console.log('  1. Ensure you are logged into Kiro IDE');
    console.log('  2. Run: ccs kiro --import');
    return null;
  }

  // Branch-specific diagnosis when trace recorder is wired (Phase 7).
  if (trace) {
    const diagnosis = diagnoseFailure(trace.snapshot());
    if (diagnosis.branchId !== 'UNKNOWN') {
      console.log(fail('Authentication failed'));
      const lines = formatErrorMessage(diagnosis, {
        verbose,
        platform: process.platform,
        callbackPort,
        provider,
      });
      for (const line of lines) console.log(line);
      return null;
    }
  }

  console.log(fail('Token not found after authentication'));
  console.log('');
  console.log('The browser showed success but callback was not received.');
  console.log('');
  console.log('Common causes:');
  console.log('  1. OAuth session timed out (sessions expire after ~10 minutes)');
  console.log('  2. Callback server could not receive the redirect');
  console.log('  3. Browser did not redirect to localhost properly');

  if (process.platform === 'win32') {
    console.log('');
    console.log('On Windows, this usually means:');
    console.log('  1. Windows Firewall blocked the callback');
    console.log('  2. Antivirus software blocked the connection');
    console.log('');
    console.log('Try running as Administrator:');
    console.log(
      `  netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=${callbackPort}`
    );
  }

  console.log('');
  console.log('If you copied the OAuth URL to a different browser:');
  console.log('  - Complete authentication within the timeout window');
  console.log('  - Ensure you are on the same machine (localhost callback)');
  console.log('  - Copy the entire URL including all parameters');
  console.log('');
  console.log(`Try: ccs ${provider} --auth --verbose`);
  return null;
}

/** Handle process exit with error */
function handleProcessError(code: number | null, state: ProcessState, headless: boolean): void {
  console.log('');
  console.log(fail(`CLIProxy auth exited with code ${code}`));
  if (state.stderrData && !state.urlDisplayed) {
    console.log(`    ${state.stderrData.trim().split('\n')[0]}`);
  }
  if (headless && !state.urlDisplayed) {
    console.log('');
    console.log(info('No OAuth URL was displayed. Try with --verbose for details.'));
  }
}

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

    // Device-code flows can usually inherit stdin, but Kiro's default AWS flow now
    // prints an intermediate Builder ID vs IDC selector that CCS auto-answers.
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

    // H7: Mutable ref for stdin keepalive interval (set later, needed in cleanup)
    let stdinKeepalive: ReturnType<typeof setInterval> | null = null;

    // Mutable ref so cleanup/handleCancel can flush trace even though `trace`
    // is assigned after them. DEFERRED: per-event syscall throttling.
    let traceRef: OAuthTraceRecorder | null = null;

    // H5: Signal handling - properly kill child process on SIGINT/SIGTERM
    // H8: Also clear stdinKeepalive interval to prevent memory leak
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

    // OAuth trace recorder — opt-in file sink via CCS_OAUTH_LOG_FILE=1
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
    traceRef = trace; // wire late-binding ref for cleanup/handleCancel
    trace.record(OAuthTracePhase.BinarySpawn, {
      callbackPort,
      headless,
      manualCallback: !!options.manualCallback,
      flowType,
    });

    // Register session for cancellation support
    registerAuthSession(state.sessionId, provider);
    attachProcessToSession(state.sessionId, authProcess);

    // Listen for external cancel signal
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

    // H7: Stdin keepalive for Authorization Code flows
    // CLIProxyAPIPlus has a 15-second timer that prompts for manual URL paste.
    // If the user completes browser auth after this timer fires but before the
    // non-blocking check, the prompt blocks forever on stdin.
    // Workaround: Send newline every 16s to skip the manual prompt and continue polling.
    if (!isDeviceCodeFlow && stdinMode === 'pipe') {
      stdinKeepalive = setInterval(() => {
        if (authProcess.stdin && !authProcess.stdin.destroyed) {
          authProcess.stdin.write('\n');
          log('Sent stdin keepalive (skip manual URL prompt)');
        }
      }, 16000);
    }

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
        // CLIProxyAPI emits "Callback server listening" when bind succeeds; treat as
        // best-available signal that the loopback path is reachable. This is a heuristic.
        trace.record(OAuthTracePhase.CallbackObservedHeuristic, { port: callbackPort });
      }
      // Capture redacted snippet (cap at 200 chars; high-frequency lines accepted as data).
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

    // Show waiting message after delay
    setTimeout(() => {
      if (isDeviceCodeFlow) {
        // Device Code Flow: show polling message
        if (!state.deviceCodeDisplayed) {
          // Code not yet displayed, show generic waiting message
          showStep(3, 4, 'progress', 'Waiting for device code...');
        }
        showStep(4, 4, 'progress', 'Polling for authorization...');
        console.log('');
        console.log(
          info('Complete the login in your browser. This page will update automatically.')
        );
      } else {
        // Authorization Code Flow: show callback server message
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

    // Timeout handling
    // Device code flows need longer timeout to match CLIProxy binary's polling window (60 attempts × 5s = 300s)
    const timeoutMs = options.manualCallback
      ? 10 * 60 * 1000
      : headless || isDeviceCodeFlow
        ? 300000
        : 120000;
    const timeout = setTimeout(() => {
      // H7: Clear stdin keepalive interval
      if (stdinKeepalive) clearInterval(stdinKeepalive);
      state.cancelManualCallbackPrompt?.();
      // H5: Remove signal handlers before killing process
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
      authSessionEvents.removeListener('session:cancelled', handleCancel);
      unregisterAuthSession(state.sessionId);
      cancelProjectSelection(state.sessionId);
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
      // H7: Clear stdin keepalive interval
      if (stdinKeepalive) clearInterval(stdinKeepalive);
      state.cancelManualCallbackPrompt?.();
      // H5: Remove signal handlers to prevent memory leaks
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
      authSessionEvents.removeListener('session:cancelled', handleCancel);
      unregisterAuthSession(state.sessionId);
      cancelProjectSelection(state.sessionId);
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

          // Emit device code completion event for UI
          if (isDeviceCodeFlow && state.deviceCodeDisplayed) {
            deviceCodeEvents.emit('deviceCode:completed', state.sessionId);
          }

          resolve(
            registerAccountFromToken(provider, tokenDir, nickname, verbose, expectedAccountId)
          );
        } else {
          // Emit device code failure event for UI
          if (isDeviceCodeFlow && state.deviceCodeDisplayed) {
            deviceCodeEvents.emit('deviceCode:failed', {
              sessionId: state.sessionId,
              error: exitAnalysis.failureReason || 'Token not found after authentication',
            });
          }

          trace.record(OAuthTracePhase.TokenFileMissing, {});
          await trace.flush();
          // Try auto-import for Kiro, show error for others
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
        // Emit device code failure event for UI
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
      // H7: Clear stdin keepalive interval
      if (stdinKeepalive) clearInterval(stdinKeepalive);
      state.cancelManualCallbackPrompt?.();
      // H5: Remove signal handlers to prevent memory leaks
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
      authSessionEvents.removeListener('session:cancelled', handleCancel);
      unregisterAuthSession(state.sessionId);
      cancelProjectSelection(state.sessionId);
      trace.record(OAuthTracePhase.Error, {}, error);
      void trace.flush();
      console.log('');
      console.log(fail(`Failed to start auth process: ${error.message}`));
      resolve(null);
    });
  });
}
