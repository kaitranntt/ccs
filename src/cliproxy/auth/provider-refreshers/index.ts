/**
 * Provider Token Refreshers
 *
 * Exports refresh functions for each OAuth provider.
 *
 * Refresh responsibility:
 * - CLIProxy-delegated: gemini, codex, agy, kiro, ghcp, iflow, kimi
 *   (CLIProxyAPIPlus handles refresh automatically in background)
 * - Unsupported account linking: qwen
 * - Not implemented: claude
 */

import { CLIProxyProvider } from '../../types';
import { getProviderAccounts } from '../../accounts/account-manager';
import {
  getTokenRefreshOwnership,
  isRefreshDelegatedToCLIProxy,
} from '../../provider-capabilities';
import { AuthError } from '../../../errors/error-types';

/** Token refresh result */
export interface ProviderRefreshResult {
  success: boolean;
  error?: string;
  expiresAt?: number;
  /** True if refresh is delegated to CLIProxy (not handled by CCS) */
  delegated?: boolean;
}

function assertNever(value: never): never {
  throw new AuthError(`Unhandled token refresh ownership: ${String(value)}`);
}

/**
 * Check if a provider's token refresh is delegated to CLIProxy
 */
export function isRefreshDelegated(provider: CLIProxyProvider): boolean {
  return isRefreshDelegatedToCLIProxy(provider);
}

/**
 * Refresh token for a specific provider and account
 * @param provider Provider to refresh
 * @param accountId Account ID used to refresh the correct provider token
 * @returns Refresh result with success status and optional error
 */
export async function refreshToken(
  provider: CLIProxyProvider,
  accountId: string
): Promise<ProviderRefreshResult> {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    return {
      success: false,
      error: 'Account ID is required for token refresh',
    };
  }

  const hasAccount = getProviderAccounts(provider).some(
    (account) => account.id === normalizedAccountId
  );
  if (!hasAccount) {
    return {
      success: false,
      error: `Account not found for ${provider}: ${normalizedAccountId}`,
    };
  }

  const ownership = getTokenRefreshOwnership(provider);
  switch (ownership) {
    case 'cliproxy':
      // CLIProxyAPIPlus handles refresh for these providers automatically.
      // No action needed from CCS — report success with delegated flag.
      return { success: true, delegated: true };
    case 'ccs':
      return {
        success: false,
        error: `Token refresh not yet implemented for ${provider}`,
      };
    case 'unsupported':
      return {
        success: false,
        error: `Token refresh not yet implemented for ${provider}`,
      };
    default:
      return assertNever(ownership);
  }
}
