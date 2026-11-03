import { ConfigError } from '../../errors/error-types';
import type { ProxyTarget } from '../proxy/proxy-target-resolver';
import type { ClaudePoolManagementApi } from './claude-pool-policy-api';
import type { ClaudePoolPolicyDependencies } from './claude-pool-policy-runtime';
import type { ClaudeQuotaResult } from '../quota/quota-types';
import {
  claudePoolClassPriority,
  confirmClaudePoolClass,
  effectiveClaudePoolClass,
  type ClaudePoolPolicyEntry,
  type ClaudePoolPolicyState,
} from './claude-pool-policy-state';

export interface ReconciliationContext {
  deps: ClaudePoolPolicyDependencies;
  readState: () => ClaudePoolPolicyState | null;
  writeState: (state: ClaudePoolPolicyState) => void;
  signal: AbortSignal;
}

function targetKey(target: ProxyTarget): string {
  return `${target.protocol}://${target.host}:${target.port}`;
}

export async function restoreClaudePoolPriorities(
  context: ReconciliationContext,
  state: ClaudePoolPolicyState,
  api: ClaudePoolManagementApi,
  valid: () => boolean
): Promise<void> {
  const credentials = new Map(
    (await api.listCredentials()).map((entry) => [entry.name, entry.priority])
  );
  const registeredFiles = new Set(context.deps.accounts().map((account) => account.tokenFile));
  let pending = false;
  let drift = false;
  for (const entry of Object.values(state.entries)) {
    if (!entry.ownsPriority && entry.pendingPriority === undefined) continue;
    if (!valid()) throw new ConfigError('Claude pool controller ownership was lost.');
    if (!credentials.has(entry.tokenFile)) {
      if (registeredFiles.has(entry.tokenFile)) pending = true;
      else {
        // Deleted accounts no longer have a runtime field to restore.
        entry.ownsPriority = false;
        delete entry.pendingPriority;
      }
      continue;
    }
    const current = credentials.get(entry.tokenFile) ?? null;
    entry.effectivePriority = current;
    if (current !== entry.lastAppliedPriority && current !== entry.pendingPriority) {
      // A user or external manager changed this field: preserve their value.
      drift = true;
      entry.state = 'drift';
      entry.ownsPriority = false;
      delete entry.pendingPriority;
      context.writeState(state);
      continue;
    }
    if (current !== entry.originalPriority) {
      entry.pendingPriority = entry.originalPriority;
      context.writeState(state);
      await api.setPriority(entry.tokenFile, entry.originalPriority, current);
      const readback = (await api.listCredentials()).find(
        (credential) => credential.name === entry.tokenFile
      );
      if (!readback || readback.priority !== entry.originalPriority) {
        pending = true;
        continue;
      }
    }
    entry.ownsPriority = false;
    entry.lastAppliedPriority = entry.originalPriority;
    entry.effectivePriority = entry.originalPriority;
    entry.state = 'applied';
    delete entry.pendingPriority;
    context.writeState(state);
  }
  state.restoring = pending;
  state.status = pending || drift ? 'degraded' : 'inactive';
  state.lastReconciledAt = context.deps.now();
  if (pending) state.error = 'Priority restoration is pending for unavailable credentials.';
  else if (drift) state.error = 'External priority changes were preserved during restoration.';
  else delete state.error;
  context.writeState(state);
}

export async function reconcileClaudePoolPriorities(
  context: ReconciliationContext,
  api: ClaudePoolManagementApi,
  target: ProxyTarget,
  valid: () => boolean
): Promise<void> {
  const state = context.readState();
  if (!state) return;
  if (state.target !== targetKey(target))
    throw new ConfigError(
      'The local proxy target differs from the captured Claude pool ownership state.'
    );
  if (context.deps.drainOrder()?.mode !== 'quota' || !context.deps.poolEnabled()) {
    if (context.deps.drainOrder()?.mode === 'quota') {
      context.deps.saveDrainOrder(state.previousDrainOrder);
      await context.deps.regenerate(target);
      state.restoring = true;
      context.writeState(state);
    }
    if (state.restoring) await restoreClaudePoolPriorities(context, state, api, valid);
    return;
  }
  const accounts = context.deps.accounts();
  const credentials = new Map(
    (await api.listCredentials()).map((entry) => [entry.name, entry.priority])
  );
  const observations = new Map<string, ClaudeQuotaResult>();
  const candidates = accounts.filter(
    (account) => !account.paused && credentials.has(account.tokenFile)
  );
  for (let index = 0; index < candidates.length; index += 2) {
    if (!valid() || context.deps.drainOrder()?.mode !== 'quota' || !context.deps.poolEnabled())
      throw new ConfigError('Claude pool policy changed during reconciliation.');
    await Promise.all(
      candidates.slice(index, index + 2).map(async (account) => {
        try {
          observations.set(account.id, await context.deps.quota(account.id, context.signal));
        } catch {
          observations.set(account.id, {
            success: false,
            windows: [],
            lastUpdated: context.deps.now(),
          });
        }
      })
    );
  }
  let degraded = false;
  let pending = false;
  for (const account of accounts) {
    if (!valid() || context.deps.drainOrder()?.mode !== 'quota' || !context.deps.poolEnabled())
      throw new ConfigError('Claude pool policy changed during reconciliation.');
    if (account.paused) continue;
    if (!credentials.has(account.tokenFile)) {
      const missing = state.entries[account.id];
      if (missing) missing.state = 'missing';
      pending = true;
      continue;
    }
    const current = credentials.get(account.tokenFile) ?? null;
    let entry: ClaudePoolPolicyEntry | undefined = Object.prototype.hasOwnProperty.call(
      state.entries,
      account.id
    )
      ? state.entries[account.id]
      : undefined;
    if (!entry) {
      entry = {
        tokenFile: account.tokenFile,
        originalPriority: current,
        lastAppliedPriority: current,
        ownsPriority: false,
        class: 'unknown',
        confirmedAt: null,
      };
      Object.defineProperty(state.entries, account.id, {
        value: entry,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      context.writeState(state);
    }
    entry.effectivePriority = current;
    if (
      entry.tokenFile !== account.tokenFile ||
      ((entry.ownsPriority || entry.pendingPriority !== undefined) &&
        current !== entry.lastAppliedPriority &&
        current !== entry.pendingPriority)
    ) {
      degraded = true;
      entry.state = 'drift';
      continue;
    }
    if (entry.pendingPriority !== undefined && current === entry.pendingPriority) {
      // A previous PATCH succeeded but its acknowledgement was lost. Claim it before
      // journaling a different target, so a second lost response is not mistaken for drift.
      entry.lastAppliedPriority = current;
      entry.ownsPriority = true;
      delete entry.pendingPriority;
      context.writeState(state);
    }
    const quota = observations.get(account.id) ?? {
      success: false,
      windows: [],
      lastUpdated: context.deps.now(),
    };
    if (quota.accountId !== undefined && quota.accountId !== account.id) {
      degraded = true;
      continue;
    }
    Object.assign(entry, confirmClaudePoolClass(entry, quota, context.deps.now()));
    const desired = claudePoolClassPriority(effectiveClaudePoolClass(entry, context.deps.now()));
    if (!valid() || context.deps.drainOrder()?.mode !== 'quota' || !context.deps.poolEnabled())
      throw new ConfigError('Claude pool policy changed during reconciliation.');
    if (current !== desired) {
      const beforeWrite = (await api.listCredentials()).find(
        (credential) => credential.name === account.tokenFile
      );
      if (!beforeWrite || beforeWrite.priority !== current) {
        degraded = true;
        entry.state = 'drift';
        entry.effectivePriority = beforeWrite?.priority ?? null;
        continue;
      }
      // Persist intent before PATCH: a crash or lost response is recovered by readback.
      entry.pendingPriority = desired;
      entry.state = 'pending';
      context.writeState(state);
      try {
        await api.setPriority(account.tokenFile, desired, current);
      } catch {
        pending = true;
        continue;
      }
      const readback = (await api.listCredentials()).find(
        (credential) => credential.name === account.tokenFile
      );
      if (!readback || readback.priority !== desired) {
        pending = true;
        continue;
      }
    }
    entry.lastAppliedPriority = desired;
    entry.effectivePriority = desired;
    entry.state = 'applied';
    entry.ownsPriority = true;
    delete entry.pendingPriority;
    context.writeState(state);
  }
  state.status = degraded ? 'degraded' : pending ? 'pending' : 'active';
  state.lastReconciledAt = context.deps.now();
  if (degraded)
    state.error =
      'External priority or account identity changes were preserved. Disable and re-enable quota ordering to accept a new baseline, or choose a manual order.';
  else if (pending)
    state.error = 'Some priorities are pending application or runtime verification.';
  else delete state.error;
  context.writeState(state);
}
