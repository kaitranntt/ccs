/**
 * Provider Token Refreshers
 *
 * Exports refresh functions for each OAuth provider.
 *
 * Refresh responsibility:
 * - CCS-managed: gemini (CCS refreshes tokens directly via Google OAuth)
 * - CLIProxy-delegated: codex, agy, kiro, ghcp, qwen, iflow
 *   (CLIProxyAPIPlus handles refresh automatically in background)
 * - Not implemented: claude
 */

import { CLIProxyProvider } from '../../types';
import { refreshGeminiToken } from '../gemini-token-refresh';

/** Token refresh result */
export interface ProviderRefreshResult {
  success: boolean;
  error?: string;
  expiresAt?: number;
  /** True if refresh is delegated to CLIProxy (not handled by CCS) */
  delegated?: boolean;
}

/**
 * Providers where CLIProxyAPIPlus owns token refresh.
 * CLIProxyAPIPlus runs background refresh automatically (e.g. kiro: every 1 min).
 * CCS should not attempt to refresh these — just trust CLIProxy.
 */
const CLIPROXY_DELEGATED_REFRESH: CLIProxyProvider[] = [
  'codex',
  'agy',
  'kiro',
  'ghcp',
  'qwen',
  'iflow',
];

/**
 * Check if a provider's token refresh is delegated to CLIProxy
 */
export function isRefreshDelegated(provider: CLIProxyProvider): boolean {
  return CLIPROXY_DELEGATED_REFRESH.includes(provider);
}

/**
 * Refresh token for a specific provider and account
 * @param provider Provider to refresh
 * @param _accountId Account ID (currently unused, multi-account not yet implemented)
 * @returns Refresh result with success status and optional error
 */
export async function refreshToken(
  provider: CLIProxyProvider,
  _accountId: string
): Promise<ProviderRefreshResult> {
  switch (provider) {
    case 'gemini':
      return await refreshGeminiTokenWrapper();

    case 'codex':
    case 'agy':
    case 'qwen':
    case 'iflow':
    case 'kiro':
    case 'ghcp':
      // CLIProxyAPIPlus handles refresh for these providers automatically.
      // No action needed from CCS — report success with delegated flag.
      return { success: true, delegated: true };

    case 'claude':
      return {
        success: false,
        error: `Token refresh not yet implemented for ${provider}`,
      };

    default:
      return {
        success: false,
        error: `Unknown provider: ${provider}`,
      };
  }
}

/**
 * Wrapper for Gemini token refresh
 * Converts gemini-token-refresh.ts format to provider-refreshers format
 */
async function refreshGeminiTokenWrapper(): Promise<ProviderRefreshResult> {
  const result = await refreshGeminiToken();

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    expiresAt: result.expiresAt,
  };
}
