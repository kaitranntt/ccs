/**
 * OAuth Process Error, Timeout & Token-Missing Handlers
 */

import { ok, fail, info, warn } from '../../../utils/ui';
import { tryKiroImport } from '../kiro-import';
import { CLIProxyProvider } from '../../types';
import { AccountInfo } from '../../accounts/account-manager';
import { registerAccountFromToken } from '../token-manager';
import { type OAuthTraceRecorder } from '../oauth-trace';
import { diagnoseFailure, formatErrorMessage } from '../oauth-trace/diagnose-failure';
import type { ProcessState } from './types';

/** Handle token not found after successful process exit */
export async function handleTokenNotFound(
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
    const sanitizedReason = failureReason
      .replace(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[^\s]*/gi, '[internal-url]')
      .replace(/\/(?:root|home|opt|tmp|var)\/[^\s]*/g, '[path]');
    console.log(fail('Authentication failed before a usable token was saved'));
    console.log(`    ${sanitizedReason}`);
    console.log('');
    console.log(`Try: ccs ${provider} --auth --verbose`);
    return null;
  }

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
export function handleProcessError(
  code: number | null,
  state: ProcessState,
  headless: boolean
): void {
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
