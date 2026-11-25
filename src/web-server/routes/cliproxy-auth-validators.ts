/**
 * Validation, parsing, and account-targeting helpers for CLIProxy auth routes.
 */

import {
  PROVIDERS_WITHOUT_EMAIL,
  hasAccountNameConflict,
  validateNickname,
} from '../../cliproxy/accounts/account-manager';
import {
  extractAccountVariantFromAccountId,
  extractCanonicalEmailFromAccountId,
  extractEmailAccountVariantKey,
} from '../../cliproxy/accounts/email-account-identity';
import {
  isKiroAuthMethod,
  isKiroIDCFlow,
  isKiroDeviceCodeMethod,
  KiroIDCFlow,
  KiroAuthMethod,
  normalizeKiroIDCFlow,
  normalizeKiroAuthMethod,
} from '../../cliproxy/auth/auth-types';
import {
  getOAuthFlowType,
  getUnsupportedAuthStartReason,
  isBrowserUrlAuthProvider,
} from '../../cliproxy/provider-capabilities';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { CLIPROXY_PROFILES } from '../../auth/profile-detector';

/** Valid providers list derived from canonical CLIPROXY_PROFILES */
export const validProviders: CLIProxyProvider[] = [...CLIPROXY_PROFILES];

export function parseKiroMethod(raw: unknown): { method: KiroAuthMethod; invalid: boolean } {
  if (raw === undefined || raw === null) {
    return { method: normalizeKiroAuthMethod(), invalid: false };
  }
  if (typeof raw !== 'string') {
    return { method: normalizeKiroAuthMethod(), invalid: true };
  }
  if (raw.trim() === '') {
    return { method: normalizeKiroAuthMethod(), invalid: false };
  }
  const normalized = raw.trim().toLowerCase();
  if (!isKiroAuthMethod(normalized)) {
    return { method: normalizeKiroAuthMethod(), invalid: true };
  }
  return { method: normalizeKiroAuthMethod(normalized), invalid: false };
}

export function parseKiroIDCFlow(raw: unknown): { flow: KiroIDCFlow; invalid: boolean } {
  if (raw === undefined || raw === null || raw === '') {
    return { flow: normalizeKiroIDCFlow(), invalid: false };
  }
  if (typeof raw !== 'string') {
    return { flow: normalizeKiroIDCFlow(), invalid: true };
  }
  const normalized = raw.trim().toLowerCase();
  if (!isKiroIDCFlow(normalized)) {
    return { flow: normalizeKiroIDCFlow(), invalid: true };
  }
  return { flow: normalizeKiroIDCFlow(normalized), invalid: false };
}

export function parseGitLabAuthMode(raw: unknown): { mode: 'oauth' | 'pat'; invalid: boolean } {
  if (raw === undefined || raw === null || raw === '') {
    return { mode: 'oauth', invalid: false };
  }
  if (typeof raw !== 'string') {
    return { mode: 'oauth', invalid: true };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'oauth' || normalized === 'pat') {
    return { mode: normalized, invalid: false };
  }
  return { mode: 'oauth', invalid: true };
}

export function getKiroStartIDCValidationError(options: {
  kiroMethod: KiroAuthMethod;
  kiroIDCStartUrl?: string;
  invalidKiroIDCFlow?: boolean;
}): { error: string; code: string } | null {
  if (options.kiroMethod !== 'idc') {
    return null;
  }
  if (options.invalidKiroIDCFlow) {
    return {
      error: 'Invalid kiroIDCFlow. Supported: authcode, device',
      code: 'INVALID_KIRO_IDC_FLOW',
    };
  }
  if (!options.kiroIDCStartUrl) {
    return {
      error: 'Kiro IDC login requires kiroIDCStartUrl',
      code: 'MISSING_KIRO_IDC_START_URL',
    };
  }
  return null;
}

export function getStartUrlUnsupportedReason(
  provider: CLIProxyProvider,
  options?: { kiroMethod?: KiroAuthMethod }
): string | null {
  const unsupportedAuthStartReason = getStartAuthUnsupportedReason(provider);
  if (unsupportedAuthStartReason) {
    return unsupportedAuthStartReason;
  }

  if (provider === 'kiro') {
    const kiroMethod = options?.kiroMethod ?? normalizeKiroAuthMethod();
    if (kiroMethod === 'idc') {
      return "Kiro method 'idc' uses CLI auth flow. Use /api/cliproxy/auth/kiro/start instead.";
    }
    if (kiroMethod === 'aws-authcode') {
      return "Kiro method 'aws-authcode' uses CLI auth flow. Use /api/cliproxy/auth/kiro/start instead.";
    }
    if (isKiroDeviceCodeMethod(kiroMethod)) {
      return "Kiro method 'aws' uses Device Code flow. Use /api/cliproxy/auth/kiro/start instead.";
    }
    return null;
  }

  if (isBrowserUrlAuthProvider(provider)) {
    return null;
  }

  if (getOAuthFlowType(provider) === 'device_code') {
    return `Provider '${provider}' uses Device Code flow. Use /api/cliproxy/auth/${provider}/start instead.`;
  }
  return null;
}

export function getStartAuthFailureMessage(provider: CLIProxyProvider): string {
  if (provider === 'ghcp') {
    return 'Authentication failed, was cancelled, or GitHub Copilot verification did not complete. Ensure the account has an active Copilot subscription and retry.';
  }
  return 'Authentication failed or was cancelled';
}

export function getStartAuthUnsupportedReason(provider: CLIProxyProvider): string | null {
  return getUnsupportedAuthStartReason(provider);
}

export function getManualCallbackRegistrationError(provider: CLIProxyProvider): string {
  if (PROVIDERS_WITHOUT_EMAIL.includes(provider)) {
    return 'Authenticated token could not be matched to a new account. Retry the flow and choose a different nickname if needed.';
  }
  return 'Authenticated token could not be registered. Retry the flow.';
}

export function getStartAuthNicknameError(
  provider: CLIProxyProvider,
  nickname: string | undefined,
  existingAccounts: Array<{ id: string; nickname?: string }>,
  allowExistingAccountId?: string
): { error: string; code: 'INVALID_NICKNAME' | 'NICKNAME_EXISTS' } | null {
  if (!PROVIDERS_WITHOUT_EMAIL.includes(provider) || !nickname) {
    return null;
  }

  const validationError = validateNickname(nickname);
  if (validationError) {
    return {
      error: validationError,
      code: 'INVALID_NICKNAME',
    };
  }

  if (hasAccountNameConflict(existingAccounts, nickname, allowExistingAccountId)) {
    return {
      error: `Nickname "${nickname}" is already in use. Choose a different one.`,
      code: 'NICKNAME_EXISTS',
    };
  }

  return null;
}

export function getReauthAccountTarget<
  TAccount extends { id: string; nickname?: string; email?: string; tokenFile?: string },
>(
  accountId: string | undefined,
  existingAccounts: TAccount[]
): { account?: TAccount; error?: string } {
  if (!accountId) {
    return {};
  }

  const account = existingAccounts.find((candidate) => candidate.id === accountId);
  if (account) {
    return { account };
  }

  const canonicalEmail = extractCanonicalEmailFromAccountId(accountId);
  if (canonicalEmail) {
    const normalizedEmail = canonicalEmail.toLowerCase();
    const expectedVariant = extractAccountVariantFromAccountId(accountId)?.toLowerCase() ?? null;
    const emailMatches = existingAccounts.filter((candidate) => {
      const candidateEmail =
        candidate.email?.trim() || extractCanonicalEmailFromAccountId(candidate.id) || '';
      return candidateEmail.toLowerCase() === normalizedEmail;
    });

    if (emailMatches.length === 1) {
      const candidate = emailMatches[0];
      const candidateVariant = extractAccountVariantFromAccountId(candidate.id)?.toLowerCase();
      let variantMatches =
        !expectedVariant || !candidateVariant || candidateVariant === expectedVariant;
      if (variantMatches && expectedVariant && candidate.tokenFile) {
        for (const provider of ['claude', 'codex'] as const) {
          if (candidate.tokenFile.toLowerCase().startsWith(`${provider}-`)) {
            const fileVariant = extractEmailAccountVariantKey(
              provider,
              candidate.tokenFile,
              canonicalEmail
            );
            if (fileVariant && fileVariant.toLowerCase() !== expectedVariant) {
              variantMatches = false;
            }
          }
        }
      }
      if (variantMatches) {
        return { account: candidate };
      }
    }
  }

  return {
    error: `Account '${accountId}' not found for this provider`,
  };
}

export function parseCallbackUrl(url: string): { code?: string; state?: string } {
  try {
    const parsed = new URL(url);
    return {
      code: parsed.searchParams.get('code') || undefined,
      state: parsed.searchParams.get('state') || undefined,
    };
  } catch {
    return {};
  }
}

export function parseAuthUrlState(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).searchParams.get('state');
  } catch {
    return null;
  }
}
