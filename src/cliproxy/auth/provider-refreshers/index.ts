/**
 * Provider Token Refreshers
 *
 * Exports refresh functions for each OAuth provider.
 * Currently only Gemini is implemented; others return placeholder errors.
 */

import { CLIProxyProvider } from '../../types';
import { refreshGeminiToken } from '../gemini-token-refresh';

/** Token refresh result */
export interface ProviderRefreshResult {
  success: boolean;
  error?: string;
  expiresAt?: number;
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
