import { ConfigError } from '../../errors/error-types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ClaudePoolQuotaClass,
  ClaudePoolPolicyStatus,
  ClaudePoolPolicyAccount,
} from '../../shared/claude-pool-policy';
import type { ClaudeQuotaResult } from '../quota/quota-types';
import type { DrainOrderConfig, AccountInfo } from './types';
import { getCcsDir } from '../../utils/config-manager';

export const CLAUDE_POOL_CLASS_MAX_AGE_MS = 6 * 60 * 60_000;
export const CLAUDE_POOL_RECONCILE_MS = 60_000;

export interface ClaudePoolPolicyEntry {
  tokenFile: string;
  originalPriority: number | null;
  lastAppliedPriority: number | null;
  ownsPriority: boolean;
  pendingPriority?: number | null;
  class: ClaudePoolQuotaClass;
  confirmedAt: number | null;
  effectivePriority?: number | null;
  state?: 'applied' | 'pending' | 'drift' | 'paused' | 'missing';
}

export interface ClaudePoolPolicyState {
  version: 1;
  target: string;
  previousDrainOrder: DrainOrderConfig | null;
  entries: Record<string, ClaudePoolPolicyEntry>;
  lastReconciledAt: number | null;
  status: ClaudePoolPolicyStatus['status'];
  error?: string;
  restoring?: boolean;
}

export function getClaudePoolPolicyStatePath(): string {
  return path.join(getCcsDir(), 'cache', 'claude-pool-order.json');
}

export function createClaudePoolPolicyState(target: string): ClaudePoolPolicyState {
  return {
    version: 1,
    target,
    previousDrainOrder: null,
    entries: {},
    lastReconciledAt: null,
    status: 'inactive',
  };
}

/** Corrupt ownership records must never be silently replaced before mutation. */
export function readClaudePoolPolicyState(
  file = getClaudePoolPolicyStatePath()
): ClaudePoolPolicyState | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new ConfigError('Cannot read Claude pool ownership state. Check its file permissions.');
  }
  try {
    const state = JSON.parse(raw) as ClaudePoolPolicyState;
    if (
      state.version !== 1 ||
      typeof state.target !== 'string' ||
      !['inactive', 'pending', 'active', 'degraded'].includes(state.status) ||
      (state.lastReconciledAt !== null && !Number.isFinite(state.lastReconciledAt)) ||
      (state.restoring !== undefined && typeof state.restoring !== 'boolean') ||
      !state.entries ||
      typeof state.entries !== 'object' ||
      Array.isArray(state.entries)
    ) {
      throw new ConfigError('invalid state');
    }
    for (const entry of Object.values(state.entries)) {
      if (
        !entry ||
        typeof entry.tokenFile !== 'string' ||
        !['five-hour-only', 'five-hour-weekly', 'weekly-only', 'unknown'].includes(entry.class) ||
        typeof entry.ownsPriority !== 'boolean' ||
        !isPriority(entry.originalPriority) ||
        !isPriority(entry.lastAppliedPriority) ||
        (entry.pendingPriority !== undefined && !isPriority(entry.pendingPriority)) ||
        (entry.confirmedAt !== null && !Number.isFinite(entry.confirmedAt))
      ) {
        throw new ConfigError('invalid entry');
      }
    }
    return state;
  } catch {
    throw new ConfigError(
      'Claude pool ownership state is invalid. Preserve it and repair it before changing priorities.'
    );
  }
}

function isPriority(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value));
}

export function writeClaudePoolPolicyState(
  state: ClaudePoolPolicyState,
  file = getClaudePoolPolicyStatePath()
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // A successful rename has already removed the temporary file.
    }
  }
}

export function claudePoolClassPriority(value: ClaudePoolQuotaClass): number {
  switch (value) {
    case 'five-hour-only':
      return 4;
    case 'five-hour-weekly':
      return 3;
    case 'weekly-only':
      return 2;
    default:
      return 1;
  }
}

export function effectiveClaudePoolClass(
  entry: Pick<ClaudePoolPolicyEntry, 'class' | 'confirmedAt'>,
  now: number
): ClaudePoolQuotaClass {
  return entry.confirmedAt !== null &&
    entry.confirmedAt <= now &&
    now - entry.confirmedAt < CLAUDE_POOL_CLASS_MAX_AGE_MS
    ? entry.class
    : 'unknown';
}

/** Only fresh, complete provider observations confirm shape, never filtered stale windows. */
export function confirmClaudePoolClass(
  previous: Pick<ClaudePoolPolicyEntry, 'class' | 'confirmedAt'>,
  quota: ClaudeQuotaResult,
  now: number
): Pick<ClaudePoolPolicyEntry, 'class' | 'confirmedAt'> {
  const presence = quota.generalWindowPresence;
  if (
    !quota.success ||
    quota.stale ||
    !presence ||
    !['present', 'absent', 'unknown'].includes(presence.fiveHour) ||
    !['present', 'absent', 'unknown'].includes(presence.weekly) ||
    presence.fiveHour === 'unknown' ||
    presence.weekly === 'unknown' ||
    !Number.isFinite(quota.lastUpdated) ||
    quota.lastUpdated > now ||
    now - quota.lastUpdated >= CLAUDE_POOL_CLASS_MAX_AGE_MS ||
    (previous.confirmedAt !== null && quota.lastUpdated < previous.confirmedAt)
  )
    return previous;
  const hasFiveHour = presence.fiveHour === 'present';
  const hasWeekly = presence.weekly === 'present';
  const quotaClass: ClaudePoolQuotaClass = hasFiveHour
    ? hasWeekly
      ? 'five-hour-weekly'
      : 'five-hour-only'
    : hasWeekly
      ? 'weekly-only'
      : 'unknown';
  return { class: quotaClass, confirmedAt: quota.lastUpdated };
}

export function buildClaudePoolPolicyStatus(
  enabled: boolean,
  controllerActive: boolean,
  state: ClaudePoolPolicyState | null,
  inputAccounts: AccountInfo[],
  now: number,
  startedAt?: number
): ClaudePoolPolicyStatus {
  const accounts: ClaudePoolPolicyAccount[] = inputAccounts.map((account) => {
    const entry =
      state && Object.prototype.hasOwnProperty.call(state.entries, account.id)
        ? state.entries[account.id]
        : undefined;
    const quotaClass = entry ? effectiveClaudePoolClass(entry, now) : 'unknown';
    return {
      accountId: account.id,
      class: quotaClass,
      confirmedAt: entry?.confirmedAt ?? null,
      desiredPriority: claudePoolClassPriority(quotaClass),
      effectivePriority:
        entry?.effectivePriority !== undefined
          ? entry.effectivePriority
          : (entry?.lastAppliedPriority ?? null),
      state: account.paused
        ? 'paused'
        : (entry?.state ?? (entry?.ownsPriority ? 'applied' : 'pending')),
    };
  });
  let status = enabled
    ? !controllerActive
      ? 'pending'
      : (state?.status ?? 'pending')
    : state?.restoring || state?.status === 'degraded'
      ? 'degraded'
      : 'inactive';
  if (enabled && status === 'active') {
    if (
      state?.lastReconciledAt === null ||
      (startedAt !== undefined && (state?.lastReconciledAt ?? 0) < startedAt) ||
      accounts.some(
        (account) =>
          account.state !== 'paused' && account.effectivePriority !== account.desiredPriority
      )
    )
      status = 'pending';
  }
  return {
    enabled,
    status,
    controllerActive,
    lastReconciledAt: state?.lastReconciledAt ?? null,
    ...(state?.error ? { error: state.error } : {}),
    ...(!controllerActive && enabled
      ? {
          error:
            'No persistent CCS controller is available. Run the dashboard or integrated Docker service.',
        }
      : {}),
    accounts,
  };
}
