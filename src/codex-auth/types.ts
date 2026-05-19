export interface CodexProfileMetadata {
  type: 'codex';
  created: string;
  last_used: string | null;
  email?: string;
  plan_type?: string | null;
  account_id?: string;
}

export interface CodexProfileData {
  version: string;
  default: string | null;
  profiles: Record<string, CodexProfileMetadata>;
}

export interface CodexAccountIdentity {
  email?: string;
  plan_type?: string;
  account_id?: string;
}

export const CODEX_PROFILE_SCHEMA_VERSION = '1.0';

const RESERVED_CODEX_PROFILE_NAMES = new Set(['default', 'current']);

/**
 * Profile name must match /^[a-z0-9][a-z0-9_-]{0,63}$/ and not be reserved.
 * Rejects uppercase, path separators, leading dash/underscore, length >64.
 */
export function isValidCodexProfileName(name: string): boolean {
  if (!name || name.length > 64) return false;
  if (RESERVED_CODEX_PROFILE_NAMES.has(name)) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(name);
}

export function getCodexProfileNameError(name: string): string | null {
  if (!name) return 'Profile name is required.';
  if (RESERVED_CODEX_PROFILE_NAMES.has(name)) return `Profile name "${name}" is reserved.`;
  if (name.includes('/') || name.includes('\\'))
    return 'Profile name must not contain path separators.';
  if (name.length > 64) return 'Profile name must be 64 characters or fewer.';
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name))
    return 'Profile name must match [a-z0-9][a-z0-9_-]{0,63}.';
  return null;
}
