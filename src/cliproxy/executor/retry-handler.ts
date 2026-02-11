/**
 * Retry Handler - Error recovery and retry logic
 *
 * Handles:
 * - Network error detection
 * - Token expiration handling
 * - Quota management
 * - Account switching
 */

import { fail, warn, info } from '../../utils/ui';
import { CLIProxyProvider } from '../types';
import { handleBanDetection } from '../account-safety';

/**
 * Check if error is network-related
 */
export function isNetworkError(error: Error): boolean {
  const networkErrors = [
    'getaddrinfo',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENETUNREACH',
    'EAI_AGAIN',
  ];
  return networkErrors.some((errCode) => error.message.includes(errCode));
}

/**
 * Handle network error with user-friendly message
 */
export function handleNetworkError(_error: Error): never {
  console.error('');
  console.error(fail('No network connection detected'));
  console.error('');
  console.error('CLIProxy binary download requires internet access.');
  console.error('Please check your network connection and try again.');
  console.error('');
  process.exit(1);
}

/**
 * Handle token expiration
 */
export async function handleTokenExpiration(
  provider: CLIProxyProvider,
  verbose: boolean
): Promise<void> {
  const { ensureTokenValid } = await import('../auth/token-manager');
  const tokenResult = await ensureTokenValid(provider, verbose);

  if (!tokenResult.valid) {
    // Check if this is an account ban/disable before generic error
    if (tokenResult.error) {
      const { getDefaultAccount } = await import('../account-manager');
      const account = getDefaultAccount(provider);
      if (account) {
        handleBanDetection(provider, account.id, tokenResult.error);
      }
    }

    // Token expired and refresh failed - trigger re-auth
    console.error(warn('OAuth token expired and refresh failed'));
    if (tokenResult.error) {
      console.error(`    ${tokenResult.error}`);
    }
    console.error(`    Run "ccs ${provider} --auth" to re-authenticate`);
    process.exit(1);
  }

  if (tokenResult.refreshed && verbose) {
    console.error('[cliproxy] Token was refreshed proactively');
  }
}

/**
 * Handle quota check and auto-switching for Antigravity
 */
export async function handleQuotaCheck(provider: CLIProxyProvider): Promise<void> {
  if (provider !== 'agy') return;

  const { preflightCheck } = await import('../quota-manager');
  const preflight = await preflightCheck(provider);

  if (!preflight.proceed) {
    console.error(fail(`Cannot start session: ${preflight.reason}`));
    process.exit(1);
  }

  if (preflight.switchedFrom) {
    console.log(info(`Auto-switched to ${preflight.accountId}`));
    console.log(`    Reason: ${preflight.reason}`);
    if (preflight.quotaPercent !== undefined && preflight.quotaPercent !== null) {
      console.log(`    New account quota: ${preflight.quotaPercent.toFixed(1)}%`);
    } else {
      console.log(`    New account quota: N/A (fetch unavailable)`);
    }
  }
}
