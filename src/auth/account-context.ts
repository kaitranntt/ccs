/**
 * Account context policy helpers.
 *
 * Controls whether account instances keep project context isolated, or share
 * project workspace context with other accounts in the same context group.
 */

export type AccountContextMode = 'isolated' | 'shared';
export type AccountContinuityMode = 'standard' | 'deeper';

export interface AccountContextMetadata {
  context_mode?: AccountContextMode;
  context_group?: string;
  continuity_mode?: AccountContinuityMode;
}

export interface AccountContextPolicy {
  mode: AccountContextMode;
  group?: string;
  continuityMode?: AccountContinuityMode;
}

export interface CreateAccountContextInput {
  shareContext: boolean;
  contextGroup?: string;
  deeperContinuity?: boolean;
}

export interface ResolvedCreateAccountContext {
  policy: AccountContextPolicy;
  error?: string;
}

export const DEFAULT_ACCOUNT_CONTEXT_MODE: AccountContextMode = 'isolated';
export const DEFAULT_ACCOUNT_CONTEXT_GROUP = 'default';
export const DEFAULT_ACCOUNT_CONTINUITY_MODE: AccountContinuityMode = 'standard';
export const MAX_CONTEXT_GROUP_LENGTH = 64;
export const ACCOUNT_PROFILE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const RESERVED_ACCOUNT_PROFILE_NAMES = new Set(['default']);

const CONTEXT_GROUP_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Normalize context group names so paths and config stay consistent.
 */
export function normalizeContextGroupName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Validate context group naming constraints.
 */
export function isValidContextGroupName(value: string): boolean {
  return value.length <= MAX_CONTEXT_GROUP_LENGTH && CONTEXT_GROUP_PATTERN.test(value);
}

/**
 * Validate account profile naming constraints.
 */
export function isValidAccountProfileName(value: string): boolean {
  return (
    ACCOUNT_PROFILE_NAME_PATTERN.test(value) &&
    !RESERVED_ACCOUNT_PROFILE_NAMES.has(value.toLowerCase())
  );
}

/**
 * Runtime type guard for account context metadata payloads.
 */
export function isAccountContextMetadata(value: unknown): value is AccountContextMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const mode = candidate['context_mode'];
  const group = candidate['context_group'];
  const continuity = candidate['continuity_mode'];

  const modeValid = mode === undefined || mode === 'isolated' || mode === 'shared';
  const groupValid = group === undefined || typeof group === 'string';
  const continuityValid =
    continuity === undefined || continuity === 'standard' || continuity === 'deeper';

  if (!modeValid || !groupValid || !continuityValid) {
    return false;
  }

  if (mode !== 'shared' && continuity !== undefined) {
    return false;
  }

  return true;
}

/**
 * Resolve create-command flags into a valid context policy.
 */
export function resolveCreateAccountContext(
  input: CreateAccountContextInput
): ResolvedCreateAccountContext {
  const hasGroupFlag = input.contextGroup !== undefined;
  const continuityMode: AccountContinuityMode = input.deeperContinuity ? 'deeper' : 'standard';

  if (input.deeperContinuity && !input.shareContext && !hasGroupFlag) {
    return {
      policy: { mode: 'isolated' },
      error:
        'Advanced deeper continuity requires shared context (--share-context or --context-group).',
    };
  }

  if (hasGroupFlag) {
    if (!input.contextGroup || input.contextGroup.trim().length === 0) {
      return {
        policy: { mode: 'isolated' },
        error: 'Context group name is required after --context-group',
      };
    }

    const normalizedGroup = normalizeContextGroupName(input.contextGroup);
    if (!isValidContextGroupName(normalizedGroup)) {
      return {
        policy: { mode: 'isolated' },
        error: `Invalid context group. Use letters/numbers/dash/underscore, start with a letter, max ${MAX_CONTEXT_GROUP_LENGTH} chars.`,
      };
    }

    return {
      policy: {
        mode: 'shared',
        group: normalizedGroup,
        continuityMode,
      },
    };
  }

  if (input.shareContext) {
    return {
      policy: {
        mode: 'shared',
        group: DEFAULT_ACCOUNT_CONTEXT_GROUP,
        continuityMode,
      },
    };
  }

  return {
    policy: { mode: DEFAULT_ACCOUNT_CONTEXT_MODE },
  };
}

/**
 * Resolve persisted metadata into runtime policy with safe defaults.
 */
export function resolveAccountContextPolicy(
  metadata?: AccountContextMetadata | null
): AccountContextPolicy {
  const mode: AccountContextMode = metadata?.context_mode === 'shared' ? 'shared' : 'isolated';

  if (mode === 'shared') {
    const continuityMode: AccountContinuityMode =
      metadata?.continuity_mode === 'deeper' ? 'deeper' : 'standard';
    const rawGroup = metadata?.context_group;
    if (rawGroup && rawGroup.trim().length > 0) {
      const normalized = normalizeContextGroupName(rawGroup);
      if (isValidContextGroupName(normalized)) {
        return { mode: 'shared', group: normalized, continuityMode };
      }
    }

    return {
      mode: 'shared',
      group: DEFAULT_ACCOUNT_CONTEXT_GROUP,
      continuityMode,
    };
  }

  return { mode: 'isolated' };
}

/**
 * Convert runtime policy back to persisted metadata.
 */
export function policyToAccountContextMetadata(
  policy: AccountContextPolicy
): AccountContextMetadata {
  if (policy.mode === 'shared') {
    return {
      context_mode: 'shared',
      context_group: policy.group || DEFAULT_ACCOUNT_CONTEXT_GROUP,
      continuity_mode:
        policy.continuityMode === 'deeper' ? 'deeper' : DEFAULT_ACCOUNT_CONTINUITY_MODE,
    };
  }

  return {
    context_mode: 'isolated',
  };
}

/**
 * User-facing summary for display/help output.
 */
export function formatAccountContextPolicy(policy: AccountContextPolicy): string {
  if (policy.mode === 'shared') {
    const continuity = policy.continuityMode === 'deeper' ? 'deeper continuity' : 'standard';
    return `shared (${policy.group || DEFAULT_ACCOUNT_CONTEXT_GROUP}, ${continuity})`;
  }

  return 'isolated';
}
