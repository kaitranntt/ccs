/**
 * Pending manual-callback OAuth state store and token-snapshot matching helpers.
 */

import { getProviderAccounts } from '../../cliproxy/accounts/account-manager';
import { ensureManagedModelPrefixes } from '../../cliproxy/ai-providers/managed-model-prefixes';
import {
  type ProviderTokenSnapshot,
  findNewTokenSnapshot,
  getProviderTokenDir,
  listProviderTokenSnapshots,
  registerAccountFromToken,
} from '../../cliproxy/auth/token-manager';
import { invalidateQuotaCache } from '../../cliproxy/quota/quota-response-cache';
import type { CLIProxyProvider } from '../../cliproxy/types';

const MANUAL_AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const POLLED_AUTH_LOCAL_TOKEN_GRACE_MS = 15 * 1000;
const MAX_PENDING_MANUAL_AUTH_STATE = 200;

export interface PendingManualAuthState {
  nickname?: string;
  expectedAccountId?: string;
  expectedTokenFile?: string;
  createdAt: number;
  upstreamCompletedAt?: number;
  knownTokenFiles: ProviderTokenSnapshot[];
}

export interface AuthAccountSummary {
  id: string;
  email?: string;
  nickname?: string;
  provider: CLIProxyProvider;
  isDefault: boolean;
}

const pendingManualAuthState = new Map<string, PendingManualAuthState>();

function pruneExpiredManualAuthState(now = Date.now()): void {
  for (const [state, pending] of pendingManualAuthState.entries()) {
    const authExpired = now - pending.createdAt > MANUAL_AUTH_STATE_TTL_MS;
    const withinLocalTokenGrace =
      pending.upstreamCompletedAt !== undefined &&
      now - pending.upstreamCompletedAt < POLLED_AUTH_LOCAL_TOKEN_GRACE_MS;

    if (authExpired && !withinLocalTokenGrace) {
      pendingManualAuthState.delete(state);
    }
  }
}

function evictOldestManualAuthState(now = Date.now()): void {
  while (pendingManualAuthState.size >= MAX_PENDING_MANUAL_AUTH_STATE) {
    let keyToEvict: string | undefined;
    for (const [candidateKey, candidate] of pendingManualAuthState.entries()) {
      const withinLocalTokenGrace =
        candidate.upstreamCompletedAt !== undefined &&
        now - candidate.upstreamCompletedAt < POLLED_AUTH_LOCAL_TOKEN_GRACE_MS;
      if (!withinLocalTokenGrace) {
        keyToEvict = candidateKey;
        break;
      }
    }

    if (keyToEvict === undefined) {
      keyToEvict = pendingManualAuthState.keys().next().value;
    }
    if (keyToEvict === undefined) {
      break;
    }
    pendingManualAuthState.delete(keyToEvict);
  }
}

export function rememberManualAuthState(
  state: string,
  pending: Omit<PendingManualAuthState, 'createdAt'>
): void {
  const now = Date.now();
  pruneExpiredManualAuthState(now);
  if (pendingManualAuthState.has(state)) {
    pendingManualAuthState.delete(state);
  } else {
    evictOldestManualAuthState(now);
  }
  pendingManualAuthState.set(state, {
    ...pending,
    createdAt: now,
  });
}

export function getManualAuthState(state: string | undefined): PendingManualAuthState | null {
  if (!state) {
    return null;
  }

  pruneExpiredManualAuthState();
  const pending = pendingManualAuthState.get(state);
  if (!pending) {
    return null;
  }

  return {
    nickname: pending.nickname,
    expectedAccountId: pending.expectedAccountId,
    expectedTokenFile: pending.expectedTokenFile,
    createdAt: pending.createdAt,
    upstreamCompletedAt: pending.upstreamCompletedAt,
    knownTokenFiles: pending.knownTokenFiles,
  };
}

export function deleteManualAuthState(state: string): void {
  pendingManualAuthState.delete(state);
}

function markManualAuthUpstreamCompleted(state: string, now = Date.now()): number | null {
  pruneExpiredManualAuthState(now);
  const pending = pendingManualAuthState.get(state);
  if (!pending) {
    return null;
  }

  if (pending.upstreamCompletedAt !== undefined) {
    return pending.upstreamCompletedAt;
  }

  pending.upstreamCompletedAt = now;
  pendingManualAuthState.set(state, pending);
  return now;
}

export function findNewTokenSnapshotForPendingAuth(
  provider: CLIProxyProvider,
  pending: Pick<
    PendingManualAuthState,
    'expectedAccountId' | 'expectedTokenFile' | 'knownTokenFiles'
  >
): ProviderTokenSnapshot | null {
  const expectedTokenFile =
    pending.expectedTokenFile ||
    (pending.expectedAccountId
      ? getProviderAccounts(provider).find((account) => account.id === pending.expectedAccountId)
          ?.tokenFile
      : undefined);

  return findNewTokenSnapshot(
    listProviderTokenSnapshots(provider),
    pending.knownTokenFiles,
    pending.expectedAccountId,
    expectedTokenFile
  );
}

export function shouldKeepWaitingForLocalToken(
  state: string,
  pending: Pick<PendingManualAuthState, 'upstreamCompletedAt'>,
  now = Date.now()
): boolean {
  const upstreamCompletedAt =
    pending.upstreamCompletedAt ?? markManualAuthUpstreamCompleted(state, now);

  return (
    upstreamCompletedAt !== null && now - upstreamCompletedAt < POLLED_AUTH_LOCAL_TOKEN_GRACE_MS
  );
}

export function invalidateQuotaForRegisteredAccount(account: {
  provider: CLIProxyProvider;
  id: string;
}): void {
  invalidateQuotaCache(account.provider, account.id);
}

export function formatAuthAccountSummary(account: {
  id: string;
  email?: string;
  nickname?: string;
  provider: CLIProxyProvider;
  isDefault: boolean;
}): AuthAccountSummary {
  return {
    id: account.id,
    email: account.email,
    nickname: account.nickname,
    provider: account.provider,
    isDefault: account.isDefault,
  };
}

export async function finalizeAccountRegistration(options: {
  provider: CLIProxyProvider;
  nickname?: string;
  targetAccountId?: string;
  repairManagedPrefixes?: boolean;
  invalidateQuota?: boolean;
}): Promise<AuthAccountSummary | null> {
  const account = registerAccountFromToken(
    options.provider,
    getProviderTokenDir(options.provider),
    options.nickname,
    false,
    options.targetAccountId
  );
  if (!account) {
    return null;
  }

  if (options.repairManagedPrefixes !== false) {
    try {
      await ensureManagedModelPrefixes([account.provider]);
    } catch {
      // Keep auth success path non-fatal when prefix repair cannot run.
    }
  }

  if (options.invalidateQuota) {
    invalidateQuotaForRegisteredAccount(account);
  }

  return formatAuthAccountSummary(account);
}
