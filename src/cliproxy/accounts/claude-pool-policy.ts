import { ConfigError } from '../../errors/error-types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as lockfile from 'proper-lockfile';
import type { ClaudePoolPolicyStatus } from '../../shared/claude-pool-policy';
import type { ProxyTarget } from '../proxy/proxy-target-resolver';
import { type ClaudePoolManagementApi } from './claude-pool-policy-api';
import {
  CLAUDE_POOL_RECONCILE_MS,
  buildClaudePoolPolicyStatus,
  getClaudePoolPolicyStatePath,
  createClaudePoolPolicyState,
  readClaudePoolPolicyState,
  writeClaudePoolPolicyState,
  type ClaudePoolPolicyState,
} from './claude-pool-policy-state';

import {
  createClaudePoolPolicyDependencies,
  type ClaudePoolPolicyDependencies,
} from './claude-pool-policy-runtime';
import {
  reconcileClaudePoolPriorities,
  restoreClaudePoolPriorities,
  type ReconciliationContext,
} from './claude-pool-policy-reconciliation';
export type { ClaudePoolPolicyDependencies } from './claude-pool-policy-runtime';

import {
  readActiveClaudePoolControllerLease,
  writeClaudePoolControllerLease,
  type ClaudePoolControllerLease,
} from './claude-pool-policy-lease';

const LEASE_STALE_MS = 30_000;
const HEARTBEAT_MS = 5000;

function targetKey(target: ProxyTarget): string {
  return `${target.protocol}://${target.host}:${target.port}`;
}

function ensureLockTarget(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

/** A controller lease and a separate mutation mutex coordinate different CCS processes. */
export class ClaudePoolPolicyController {
  private readonly deps: ClaudePoolPolicyDependencies;
  private readonly owner = randomUUID();
  private releaseLeadership: (() => Promise<void>) | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private compromised = false;
  private busy = false;
  private activeCycle: Promise<void> | null = null;
  private readonly activeMutations = new Set<Promise<void>>();
  private startedAt = 0;
  private lifecycleAbort = new AbortController();
  private readonly manualMutation = new AsyncLocalStorage<boolean>();

  constructor(overrides: Partial<ClaudePoolPolicyDependencies> = {}) {
    this.deps = createClaudePoolPolicyDependencies(overrides);
  }

  private get leaseFile(): string {
    return `${this.deps.file}.controller`;
  }
  private get ownerFile(): string {
    return `${this.leaseFile}.owner`;
  }
  private get mutationFile(): string {
    return `${this.deps.file}.mutation`;
  }

  private readState(): ClaudePoolPolicyState | null {
    return readClaudePoolPolicyState(this.deps.file);
  }

  private writeState(state: ClaudePoolPolicyState): void {
    writeClaudePoolPolicyState(state, this.deps.file);
  }

  private reconciliationContext(): ReconciliationContext {
    return {
      deps: this.deps,
      readState: () => this.readState(),
      writeState: (state) => this.writeState(state),
      signal: this.lifecycleAbort.signal,
    };
  }

  private controllerActive(): boolean {
    return (
      readActiveClaudePoolControllerLease(
        this.ownerFile,
        targetKey(this.deps.target()),
        this.deps.now(),
        LEASE_STALE_MS
      ) !== null
    );
  }

  private renewLease(): void {
    if (!this.releaseLeadership || this.compromised) return;
    const lease: ClaudePoolControllerLease = {
      owner: this.owner,
      pid: process.pid,
      hostname: os.hostname(),
      target: targetKey(this.deps.target()),
      updatedAt: this.deps.now(),
      startedAt: this.startedAt,
    };
    writeClaudePoolControllerLease(this.ownerFile, lease);
  }

  private async withMutation<T>(operation: (valid: () => boolean) => Promise<T>): Promise<T> {
    let complete = () => {};
    const completion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    this.activeMutations.add(completion);
    try {
      ensureLockTarget(this.mutationFile);
      let compromised = false;
      const release = await lockfile
        .lock(this.mutationFile, {
          realpath: false,
          stale: LEASE_STALE_MS,
          update: HEARTBEAT_MS,
          retries: { retries: 50, minTimeout: 100, maxTimeout: 100 },
          onCompromised: () => {
            compromised = true;
          },
        })
        .catch(() => {
          throw new ConfigError(
            'Another CCS process is updating Claude pool order. Retry after the current operation finishes.'
          );
        });
      try {
        if (compromised)
          throw new ConfigError('Claude pool mutation ownership was lost. Retry the operation.');
        return await operation(() => !compromised);
      } finally {
        await release().catch(() => {});
      }
    } finally {
      complete();
      this.activeMutations.delete(completion);
    }
  }

  private async verifiedApi(): Promise<{ api: ClaudePoolManagementApi; target: ProxyTarget }> {
    const target = this.deps.target();
    if (target.isRemote || !['127.0.0.1', 'localhost', '::1'].includes(target.host)) {
      throw new ConfigError(
        'Claude quota ordering must be configured on the host running the local proxy.'
      );
    }
    if (!(await this.deps.verifyProxy(target))) {
      throw new ConfigError(
        'The local proxy must be running and verified before changing Claude quota ordering.'
      );
    }
    const api = this.deps.management(target, this.lifecycleAbort.signal);
    await api.checkCapabilities();
    return { api, target };
  }

  getStatus(): ClaudePoolPolicyStatus {
    const enabled = this.deps.drainOrder()?.mode === 'quota';
    const controllerActive = this.controllerActive();
    try {
      const lease = readActiveClaudePoolControllerLease(
        this.ownerFile,
        targetKey(this.deps.target()),
        this.deps.now(),
        LEASE_STALE_MS
      );
      return buildClaudePoolPolicyStatus(
        enabled,
        controllerActive,
        this.readState(),
        this.deps.accounts(),
        this.deps.now(),
        lease?.startedAt
      );
    } catch (error) {
      return {
        enabled,
        status: 'degraded',
        controllerActive,
        lastReconciledAt: null,
        error: (error as Error).message,
        accounts: [],
      };
    }
  }

  async setEnabled(enabled: boolean): Promise<ClaudePoolPolicyStatus> {
    await this.withMutation(async (valid) => {
      const { api, target } = await this.verifiedApi();
      if (enabled) {
        if (!this.deps.poolEnabled())
          throw new ConfigError('Enable pool routing before enabling Claude quota ordering.');
        if (!this.controllerActive())
          throw new ConfigError(
            'Start a persistent CCS dashboard or integrated Docker service before enabling quota ordering.'
          );
        if (this.deps.drainOrder()?.mode !== 'quota') {
          const retained = this.readState();
          if (retained?.restoring)
            throw new ConfigError(
              'Previous Claude priority restoration is pending. Resolve it before enabling the policy.'
            );
          const state = createClaudePoolPolicyState(targetKey(target));
          state.previousDrainOrder = this.deps.drainOrder() ?? null;
          state.status = 'pending';
          // Commit the ownership snapshot before enabling the config or writing any priority.
          this.writeState(state);
          this.deps.saveDrainOrder({ mode: 'quota' });
          try {
            await this.deps.regenerate(target);
          } catch (error) {
            this.deps.saveDrainOrder(state.previousDrainOrder);
            state.status = 'degraded';
            state.error =
              'Could not regenerate proxy configuration. The quota policy was not enabled.';
            this.writeState(state);
            throw error;
          }
        }
        await reconcileClaudePoolPriorities(this.reconciliationContext(), api, target, valid);
      } else {
        const state = this.readState();
        if (!state) {
          if (this.deps.drainOrder()?.mode === 'quota')
            throw new ConfigError(
              'Claude quota ownership state is missing. Preserve priorities and repair state before disabling.'
            );
          return;
        }
        if (state.target !== targetKey(target))
          throw new ConfigError(
            'Restore the original local proxy target before restoring Claude pool priorities.'
          );
        if (this.deps.drainOrder()?.mode === 'quota')
          this.deps.saveDrainOrder(state.previousDrainOrder);
        state.restoring = true;
        this.writeState(state);
        await this.deps.regenerate(target);
        await restoreClaudePoolPriorities(this.reconciliationContext(), state, api, valid);
      }
    });
    return this.getStatus();
  }

  /** Explicit manual changes supersede this policy without restoring over the chosen order. */
  async relinquishForManualOrder(): Promise<void> {
    const relinquish = async () => {
      if (this.deps.drainOrder()?.mode !== 'quota' && !this.readState()?.restoring) return;
      const state = this.readState();
      if (state && state.target !== targetKey(this.deps.target()))
        throw new ConfigError(
          'Restore the original local proxy target before changing Claude pool ownership.'
        );
      this.deps.saveDrainOrder(null);
      if (state) {
        for (const entry of Object.values(state.entries)) {
          entry.ownsPriority = false;
          delete entry.pendingPriority;
        }
        state.restoring = false;
        state.status = 'inactive';
        delete state.error;
        this.writeState(state);
      }
      await this.deps.regenerate(this.deps.target());
    };
    if (this.manualMutation.getStore()) await relinquish();
    else await this.withMutation(relinquish);
  }

  /** Keep the mutex through validation, priority application and manual-config commit. */
  async withManualOrder<T>(operation: () => Promise<T>): Promise<T> {
    return this.withMutation(async () => this.manualMutation.run(true, operation));
  }

  /** Public deterministic cycle used by lifecycle hooks and synthetic tests. */
  async reconcile(valid: () => boolean = () => true): Promise<void> {
    await this.withMutation(async (mutationValid) => {
      if (this.deps.drainOrder()?.mode !== 'quota' && !this.readState()?.restoring) return;
      try {
        const { api, target } = await this.verifiedApi();
        await reconcileClaudePoolPriorities(
          this.reconciliationContext(),
          api,
          target,
          () => valid() && mutationValid()
        );
      } catch (error) {
        const state = this.readState();
        if (state) {
          state.status = 'degraded';
          state.error = (error as Error).message;
          this.writeState(state);
        }
        throw error;
      }
    });
  }

  private async release(): Promise<void> {
    const release = this.releaseLeadership;
    this.releaseLeadership = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    try {
      const owner = JSON.parse(
        fs.readFileSync(this.ownerFile, 'utf8')
      ) as ClaudePoolControllerLease;
      if (owner.owner === this.owner) fs.unlinkSync(this.ownerFile);
    } catch {
      /* Another owner or process cleanup already removed the lease. */
    }
    if (release) await release().catch(() => {});
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.busy) return;
    this.busy = true;
    try {
      if (this.deps.target().isRemote) {
        await this.release();
        return;
      }
      if (!this.releaseLeadership) {
        ensureLockTarget(this.leaseFile);
        try {
          this.compromised = false;
          this.releaseLeadership = await lockfile.lock(this.leaseFile, {
            realpath: false,
            stale: LEASE_STALE_MS,
            update: HEARTBEAT_MS,
            retries: 0,
            onCompromised: () => {
              this.compromised = true;
            },
          });
        } catch {
          return;
        }
        this.renewLease();
        this.heartbeat = setInterval(() => {
          try {
            this.renewLease();
          } catch {
            this.compromised = true;
          }
        }, HEARTBEAT_MS);
        this.heartbeat.unref();
      }
      const valid = () => !this.stopped && !this.compromised && this.releaseLeadership !== null;
      if (valid()) await this.reconcile(valid);
    } catch {
      // The persisted status carries the actionable error; the next cycle retries safely.
    } finally {
      this.busy = false;
      if (this.stopped || this.compromised) await this.release();
    }
  }

  private launchTick(): void {
    if (this.activeCycle) return;
    this.activeCycle = this.tick().finally(() => {
      this.activeCycle = null;
    });
  }

  /** Wake a running controller without overlapping its current cycle. */
  async wake(): Promise<void> {
    if (this.stopped) return;
    this.launchTick();
    if (this.activeCycle) await this.activeCycle;
  }

  start(): () => Promise<void> {
    if (!this.stopped) return () => this.stop();
    this.stopped = false;
    if (this.lifecycleAbort.signal.aborted) this.lifecycleAbort = new AbortController();
    this.startedAt = this.deps.now();
    this.launchTick();
    this.interval = setInterval(() => {
      this.launchTick();
    }, CLAUDE_POOL_RECONCILE_MS);
    this.interval.unref();
    return () => this.stop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.lifecycleAbort.abort();
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (this.activeCycle) await this.activeCycle;
    while (this.activeMutations.size > 0) await Promise.all([...this.activeMutations]);
    await this.release();
  }
}

const controllers = new Map<string, ClaudePoolPolicyController>();

export function getClaudePoolPolicyController(): ClaudePoolPolicyController {
  const file = getClaudePoolPolicyStatePath();
  let controller = controllers.get(file);
  if (!controller) {
    controller = new ClaudePoolPolicyController({ file });
    controllers.set(file, controller);
  }
  return controller;
}

export function startClaudePoolPolicyController(): () => Promise<void> {
  return getClaudePoolPolicyController().start();
}
