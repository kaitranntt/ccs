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
import { handleBanDetection, warnPossible403Ban } from '../accounts/account-safety';
import { CompositeTierConfig } from '../../config/unified-config-types';
import { createLogger } from '../../services/logging';

const logger = createLogger('cliproxy:executor:retry-handler');

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
  process.stderr.write(String('') + '\n');
  process.stderr.write(String(fail('No network connection detected')) + '\n');
  process.stderr.write(String('') + '\n');
  process.stderr.write(String('CLIProxy binary download requires internet access.') + '\n');
  process.stderr.write(String('Please check your network connection and try again.') + '\n');
  process.stderr.write(String('') + '\n');
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
      const { getDefaultAccount } = await import('../accounts/account-manager');
      const account = getDefaultAccount(provider);
      if (account) {
        handleBanDetection(provider, account.id, tokenResult.error);
      }
      warnPossible403Ban(provider, tokenResult.error);
    }

    // Token expired and refresh failed - trigger re-auth
    process.stderr.write(String(warn('OAuth token expired and refresh failed')) + '\n');
    if (tokenResult.error) {
      process.stderr.write(String(`    ${tokenResult.error}`) + '\n');
    }
    process.stderr.write(String(`    Run "ccs ${provider} --auth" to re-authenticate`) + '\n');
    process.exit(1);
  }

  if (tokenResult.refreshed && verbose) {
    logger.info('token.refreshed', 'Token was refreshed proactively', { provider, verbose });
  }
}

/**
 * Handle quota check and auto-switching for providers with quota-based rotation.
 */
export async function handleQuotaCheck(provider: CLIProxyProvider): Promise<void> {
  const { isManagedQuotaProvider, preflightCheck } = await import('../quota/quota-manager');
  if (!isManagedQuotaProvider(provider)) return;

  const preflight = await preflightCheck(provider);

  if (!preflight.proceed) {
    process.stderr.write(String(fail(`Cannot start session: ${preflight.reason}`)) + '\n');
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

/** Error patterns indicating provider failure */
export const PROVIDER_ERROR_PATTERNS = [
  /Error:\s*4[0-9]{2}/i,
  /Error:\s*5[0-9]{2}/i,
  /overloaded/i,
  /quota.*exceeded/i,
  /ECONNREFUSED/i,
  /rate.?limit/i,
];

/** Detect which composite tier failed from stderr output */
export function detectFailedTier(
  stderr: string,
  tiers: { opus: CompositeTierConfig; sonnet: CompositeTierConfig; haiku: CompositeTierConfig }
): 'opus' | 'sonnet' | 'haiku' | null {
  for (const tier of ['opus', 'sonnet', 'haiku'] as const) {
    // Strip thinking suffix (e.g., "model(high)" → "model") for matching
    const model = tiers[tier].model.replace(/\([^)]+\)$/, '');
    if (stderr.includes(model)) return tier;
  }
  return null;
}

/** Check if Claude exit indicates provider error (vs normal user exit) */
export function isProviderError(exitCode: number, stderr: string): boolean {
  // Exit code 0 means success, even if stderr has error-like output
  // (could be warnings, debug info, etc.)
  if (exitCode === 0) return false;
  return PROVIDER_ERROR_PATTERNS.some((p) => p.test(stderr));
}
