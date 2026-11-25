/**
 * OAuth Credential & Parameter Validation Helpers
 *
 * Generalized Plus OAuth client-credential guards, nickname validation,
 * GitLab base URL normalization, and Kiro callback replay checks.
 */

import { ConfigError } from '../../../errors/error-types';
import { CLIProxyBackend, CLIProxyProvider } from '../../types';
import {
  AccountInfo,
  hasAccountNameConflict,
  PROVIDERS_WITHOUT_EMAIL,
  validateNickname,
} from '../../accounts/account-manager';
import { OAuthOptions, normalizeKiroAuthMethod, normalizeKiroIDCFlow } from '../auth-types';

const GEMINI_PLUS_CLIENT_ID_ENV = 'CLIPROXY_GEMINI_OAUTH_CLIENT_ID';
const GEMINI_PLUS_CLIENT_SECRET_ENV = 'CLIPROXY_GEMINI_OAUTH_CLIENT_SECRET';

/**
 * Table of providers that require Google OAuth client credentials when running
 * against CLIProxy Plus. Keyed by CLIProxyProvider value.
 *
 * Used by the generalized helpers so the dashboard handler can guard any
 * table-listed provider without duplicating env-var names.
 */
export const PLUS_OAUTH_ENV_BY_PROVIDER: Partial<
  Record<CLIProxyProvider, { idEnv: string; secretEnv: string; displayName: string }>
> = {
  gemini: {
    idEnv: GEMINI_PLUS_CLIENT_ID_ENV,
    secretEnv: GEMINI_PLUS_CLIENT_SECRET_ENV,
    displayName: 'Gemini',
  },
  agy: {
    idEnv: 'CLIPROXY_ANTIGRAVITY_OAUTH_CLIENT_ID',
    secretEnv: 'CLIPROXY_ANTIGRAVITY_OAUTH_CLIENT_SECRET',
    displayName: 'Antigravity',
  },
};

/**
 * Build a human-readable error message for a provider whose Plus OAuth client
 * credentials are missing.
 */
function buildPlusOAuthCredentialMessage(
  displayName: string,
  idEnv: string,
  secretEnv: string,
  missing?: string[],
  options?: { originalFallbackSupported?: boolean }
): string {
  const missingText = missing?.length ? ` Missing: ${missing.join(', ')}.` : '';
  const fallbackText =
    options?.originalFallbackSupported === false
      ? ' Current `cliproxy.backend: original` releases do not advertise Gemini login, so switching back to original will not restore Gemini OAuth.'
      : ` or switch \`cliproxy.backend\` to \`original\` for ${displayName}.`;
  return (
    `${displayName} OAuth from CLIProxy Plus is missing Google OAuth client credentials.` +
    missingText +
    ` Set ${idEnv} and ${secretEnv} before starting CLIProxy Plus,` +
    fallbackText
  );
}

export function getGeminiOriginalBackendOAuthMessage(): string {
  return (
    'Installed CLIProxy binary does not advertise Google Gemini login support (--login). ' +
    'The active `cliproxy.backend: original` runtime cannot start Gemini OAuth from CCS. ' +
    `To use Gemini OAuth, switch \`cliproxy.backend\` to \`plus\`, set ${GEMINI_PLUS_CLIENT_ID_ENV} and ${GEMINI_PLUS_CLIENT_SECRET_ENV} before starting CLIProxy Plus, reinstall the maintained Plus fork, and retry auth.`
  );
}

/**
 * Generalized credential-missing guard for any provider in PLUS_OAUTH_ENV_BY_PROVIDER.
 */
export function getPlusOAuthCredentialError(
  provider: CLIProxyProvider,
  backend: CLIProxyBackend,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const entry = PLUS_OAUTH_ENV_BY_PROVIDER[provider];
  if (!entry || backend !== 'plus') {
    return null;
  }

  const missing = [entry.idEnv, entry.secretEnv].filter((name) => !env[name]?.trim());
  return missing.length > 0
    ? buildPlusOAuthCredentialMessage(entry.displayName, entry.idEnv, entry.secretEnv, missing, {
        originalFallbackSupported: provider !== 'gemini',
      })
    : null;
}

/**
 * Generalized auth-URL guard for any provider in PLUS_OAUTH_ENV_BY_PROVIDER.
 */
export function getPlusAuthUrlCredentialError(
  provider: CLIProxyProvider,
  authUrl: string
): string | null {
  const entry = PLUS_OAUTH_ENV_BY_PROVIDER[provider];
  if (!entry) {
    return null;
  }

  try {
    const parsed = new URL(authUrl);
    const clientId = parsed.searchParams.get('client_id')?.trim();
    return clientId
      ? null
      : buildPlusOAuthCredentialMessage(
          entry.displayName,
          entry.idEnv,
          entry.secretEnv,
          undefined,
          {
            originalFallbackSupported: provider !== 'gemini',
          }
        );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini-specific aliases — kept for backward-compat with PR #1131's callers.
// These lock the provider to 'gemini' and delegate to the generalized helpers.
// ---------------------------------------------------------------------------

export function getGeminiPlusOAuthCredentialError(
  provider: CLIProxyProvider,
  backend: CLIProxyBackend,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (provider !== 'gemini') {
    return null;
  }
  return getPlusOAuthCredentialError(provider, backend, env);
}

export function getGeminiAuthUrlCredentialError(
  provider: CLIProxyProvider,
  authUrl: string
): string | null {
  if (provider !== 'gemini') {
    return null;
  }
  return getPlusAuthUrlCredentialError(provider, authUrl);
}

export function getCliAuthNicknameError(
  provider: CLIProxyProvider,
  nickname: string | undefined,
  existingAccounts: Array<Pick<AccountInfo, 'id' | 'nickname'>>,
  allowExistingAccountId?: string
): string | null {
  if (!nickname || !PROVIDERS_WITHOUT_EMAIL.includes(provider)) {
    return null;
  }

  const validationError = validateNickname(nickname);
  if (validationError) {
    return validationError;
  }

  if (hasAccountNameConflict(existingAccounts, nickname, allowExistingAccountId)) {
    return `Nickname "${nickname}" is already in use. Choose a different one.`;
  }

  return null;
}

export function normalizeGitLabBaseUrl(baseUrl: string | undefined): string | undefined {
  const normalized = baseUrl?.trim();
  if (!normalized) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ConfigError('GitLab URL must be a valid http:// or https:// URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError('GitLab URL must use http:// or https://');
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.username = '';
  parsed.password = '';

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  return normalizedPath ? `${parsed.origin}${normalizedPath}` : parsed.origin;
}

export function usesKiroLocalCallbackReplay(
  method: OAuthOptions['kiroMethod'],
  idcFlow: OAuthOptions['kiroIDCFlow']
): boolean {
  const normalizedMethod = normalizeKiroAuthMethod(method);
  if (normalizedMethod === 'aws-authcode') {
    return true;
  }
  return normalizedMethod === 'idc' && normalizeKiroIDCFlow(idcFlow) === 'authcode';
}
