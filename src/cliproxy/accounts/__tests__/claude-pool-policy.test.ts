import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ClaudePoolPolicyController,
  type ClaudePoolPolicyDependencies,
} from '../claude-pool-policy';
import {
  CLAUDE_POOL_CLASS_MAX_AGE_MS,
  claudePoolClassPriority,
  confirmClaudePoolClass,
  effectiveClaudePoolClass,
  readClaudePoolPolicyState,
  writeClaudePoolPolicyState,
} from '../claude-pool-policy-state';
import type { AccountInfo, DrainOrderConfig } from '../types';
import type { ClaudeQuotaResult } from '../../quota/quota-types';

const disposableHomes: string[] = [];
const stops: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const home of disposableHomes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

function quota(
  fiveHour: boolean,
  weekly: boolean,
  timestamp: number,
  accountId = 'synthetic-a'
): ClaudeQuotaResult {
  return {
    success: true,
    windows: [],
    lastUpdated: timestamp,
    accountId,
    generalWindowPresence: {
      fiveHour: fiveHour ? 'present' : 'absent',
      weekly: weekly ? 'present' : 'absent',
    },
  };
}

function harness() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-pool-policy-test-'));
  disposableHomes.push(home);
  const file = path.join(home, 'state.json');
  let now = Date.UTC(2026, 9, 1);
  let drain: DrainOrderConfig | undefined = {
    mode: 'manual',
    orderedIds: ['synthetic-b', 'synthetic-a'],
  };
  let enabled = true;
  let failPatch = '';
  let applyThenFail = false;
  let verify = true;
  let capability = true;
  let remote = false;
  let beforePatch: ((name: string) => void) | undefined;
  const accounts: AccountInfo[] = ['a', 'b', 'c', 'd'].map((letter) => ({
    id: `synthetic-${letter}`,
    tokenFile: `${letter}.json`,
    provider: 'claude',
    isDefault: letter === 'a',
    createdAt: '2026-01-01',
  }));
  const priorities = new Map<string, number | null>([
    ['a.json', null],
    ['b.json', 9],
    ['c.json', 2],
    ['d.json', null],
  ]);
  const quotas = new Map<string, ClaudeQuotaResult>([
    ['synthetic-a', quota(true, false, now)],
    ['synthetic-b', quota(true, true, now, 'synthetic-b')],
    ['synthetic-c', quota(false, true, now, 'synthetic-c')],
    ['synthetic-d', quota(false, false, now, 'synthetic-d')],
  ]);
  const writes: Array<[string, number | null]> = [];
  const deps: ClaudePoolPolicyDependencies = {
    file,
    now: () => now,
    target: () => ({ host: '127.0.0.1', port: 8317, protocol: 'http', isRemote: remote }),
    accounts: () => accounts,
    quota: async (id) =>
      quotas.get(id) ?? { success: false, windows: [], lastUpdated: now, accountId: id },
    poolEnabled: () => enabled,
    drainOrder: () => drain,
    saveDrainOrder: (value) => {
      drain = value ?? undefined;
    },
    verifyProxy: async () => verify,
    management: () => ({
      checkCapabilities: async () => {
        if (!capability) throw new Error('unsupported');
      },
      listCredentials: async () => [...priorities].map(([name, priority]) => ({ name, priority })),
      setPriority: async (name, priority, expectedPriority) => {
        writes.push([name, priority]);
        beforePatch?.(name);
        if (priorities.get(name) !== expectedPriority)
          throw new Error('synthetic compare-and-swap conflict');
        if (name === failPatch) {
          if (applyThenFail) priorities.set(name, priority);
          throw new Error('synthetic lost response');
        }
        priorities.set(name, priority);
      },
    }),
    regenerate: async () => {},
  };
  const controller = new ClaudePoolPolicyController(deps);
  function registerOwner() {
    fs.writeFileSync(
      `${file}.controller.owner`,
      JSON.stringify({
        owner: 'synthetic-owner',
        pid: process.pid,
        hostname: os.hostname(),
        target: 'http://127.0.0.1:8317',
        updatedAt: now,
      })
    );
  }
  registerOwner();
  return {
    controller,
    deps,
    file,
    priorities,
    quotas,
    writes,
    accounts,
    drain: () => drain,
    state: () => readClaudePoolPolicyState(file),
    advance: (milliseconds: number) => {
      now += milliseconds;
      registerOwner();
    },
    now: () => now,
    fail: (name: string, afterApply = false) => {
      failPatch = name;
      applyThenFail = afterApply;
    },
    pool: (value: boolean) => {
      enabled = value;
    },
    verified: (value: boolean) => {
      verify = value;
    },
    capability: (value: boolean) => {
      capability = value;
    },
    remote: (value: boolean) => {
      remote = value;
    },
    beforePatch: (callback: (name: string) => void) => {
      beforePatch = callback;
    },
  };
}

describe('Claude pool class confirmation', () => {
  for (const fiveHour of [false, true]) {
    for (const weekly of [false, true]) {
      for (const fable of [false, true]) {
        it(`classifies general ${fiveHour}/${weekly} independently of Fable ${fable}`, () => {
          const timestamp = 1000;
          const value = quota(fiveHour, weekly, timestamp);
          if (fable)
            value.windows.push({
              rateLimitType: 'seven_day_fable',
              scope: 'model',
              cadence: 'weekly',
              modelLabel: 'Fable',
              label: 'Fable',
              usedPercent: 100,
              remainingPercent: 0,
              utilization: 1,
              status: 'rejected',
              resetAt: null,
            });
          const confirmed = confirmClaudePoolClass(
            { class: 'unknown', confirmedAt: null },
            value,
            timestamp
          );
          expect(confirmed.class).toBe(
            fiveHour
              ? weekly
                ? 'five-hour-weekly'
                : 'five-hour-only'
              : weekly
                ? 'weekly-only'
                : 'unknown'
          );
        });
      }
    }
  }

  it('keeps source age and never renews it using cache or stale reads', () => {
    const previous = { class: 'five-hour-weekly' as const, confirmedAt: 1000 };
    const cached = quota(true, true, 1000);
    expect(confirmClaudePoolClass(previous, cached, 5000).confirmedAt).toBe(1000);
    expect(
      confirmClaudePoolClass(previous, { ...quota(true, false, 5000), stale: true }, 5000)
    ).toEqual(previous);
    expect(
      confirmClaudePoolClass(previous, { ...quota(true, false, 5000), success: false }, 5000)
    ).toEqual(previous);
    expect(effectiveClaudePoolClass(previous, 1000 + CLAUDE_POOL_CLASS_MAX_AGE_MS - 1)).toBe(
      'five-hour-weekly'
    );
    expect(effectiveClaudePoolClass(previous, 1000 + CLAUDE_POOL_CLASS_MAX_AGE_MS)).toBe('unknown');
  });

  it('does not replace known class from malformed or absent metadata', () => {
    const previous = { class: 'weekly-only' as const, confirmedAt: 1000 };
    const invalid = quota(true, false, 2000);
    invalid.generalWindowPresence = { fiveHour: 'present', weekly: 'unknown' };
    expect(confirmClaudePoolClass(previous, invalid, 2000)).toEqual(previous);
    delete invalid.generalWindowPresence;
    expect(confirmClaudePoolClass(previous, invalid, 2000)).toEqual(previous);
    expect(claudePoolClassPriority('five-hour-only')).toBeGreaterThan(
      claudePoolClassPriority('five-hour-weekly')
    );
    expect(claudePoolClassPriority('five-hour-weekly')).toBeGreaterThan(
      claudePoolClassPriority('weekly-only')
    );
    expect(claudePoolClassPriority('unknown')).toBe(1);
  });
});

describe('Claude pool policy reconciliation', () => {
  it('preserves ownership when restore or manual handoff targets another local proxy', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    const state = h.state()!;
    state.target = 'http://127.0.0.1:9999';
    writeClaudePoolPolicyState(state, h.file);
    const count = h.writes.length;
    await expect(h.controller.setEnabled(false)).rejects.toThrow('original local proxy target');
    await expect(h.controller.relinquishForManualOrder()).rejects.toThrow(
      'original local proxy target'
    );
    expect(h.writes.length).toBe(count);
    expect(h.drain()?.mode).toBe('quota');
    expect(h.state()?.entries['synthetic-a'].ownsPriority).toBe(true);
  });

  it('applies equal class buckets, verifies writes and preserves original priorities', async () => {
    const h = harness();
    const status = await h.controller.setEnabled(true);
    expect(status.status).toBe('active');
    expect([...h.priorities.values()]).toEqual([4, 3, 2, 1]);
    expect(h.state()?.entries['synthetic-a'].originalPriority).toBeNull();
    expect(h.state()?.entries['synthetic-b'].originalPriority).toBe(9);
    const count = h.writes.length;
    await h.controller.reconcile();
    expect(h.writes.length).toBe(count);
    const disabled = await h.controller.setEnabled(false);
    expect(disabled.status).toBe('inactive');
    expect(h.drain()?.mode).toBe('manual');
    expect([...h.priorities.values()]).toEqual([null, 9, 2, null]);
  });

  it('retains confirmed classes for failures and expires them at exactly six hours', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.quotas.clear();
    h.advance(CLAUDE_POOL_CLASS_MAX_AGE_MS - 1);
    await h.controller.reconcile();
    expect(h.priorities.get('a.json')).toBe(4);
    h.advance(1);
    await h.controller.reconcile();
    expect([...h.priorities.values()]).toEqual([1, 1, 1, 1]);
    expect(h.state()?.entries['synthetic-a'].confirmedAt).toBe(
      h.now() - CLAUDE_POOL_CLASS_MAX_AGE_MS
    );
  });

  it('preserves confirmation timestamps and ownership after a controller restart', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.advance(60_000);
    const restarted = new ClaudePoolPolicyController(h.deps);
    await restarted.reconcile();
    expect(restarted.getStatus().accounts[0].confirmedAt).toBe(h.now() - 60_000);
    await restarted.setEnabled(false);
    expect(h.priorities.get('b.json')).toBe(9);
  });

  it('recovers a successful PATCH whose response was lost, without losing original values', async () => {
    const h = harness();
    h.fail('b.json', true);
    const pending = await h.controller.setEnabled(true);
    expect(pending.status).toBe('pending');
    expect(h.state()?.entries['synthetic-b'].pendingPriority).toBe(3);
    h.fail('');
    await new ClaudePoolPolicyController(h.deps).reconcile();
    expect(h.controller.getStatus().status).toBe('active');
    await h.controller.setEnabled(false);
    expect(h.priorities.get('b.json')).toBe(9);
  });

  it('acknowledges a lost write before journaling a different failed target', async () => {
    const h = harness();
    h.fail('a.json', true);
    await h.controller.setEnabled(true);
    expect(h.priorities.get('a.json')).toBe(4);
    h.advance(1);
    h.quotas.set('synthetic-a', quota(false, true, h.now()));
    h.fail('a.json', false);
    await h.controller.reconcile();
    expect(h.state()?.entries['synthetic-a'].lastAppliedPriority).toBe(4);
    expect(h.state()?.entries['synthetic-a'].pendingPriority).toBe(2);
    h.fail('');
    await h.controller.reconcile();
    expect(h.priorities.get('a.json')).toBe(2);
    expect(h.controller.getStatus().status).toBe('active');
    await h.controller.setEnabled(false);
    expect(h.priorities.get('a.json')).toBeNull();
  });

  it('preserves externally changed priorities and surfaces drift per account', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.priorities.set('a.json', 77);
    const count = h.writes.length;
    await h.controller.reconcile();
    expect(h.writes.length).toBe(count);
    expect(h.controller.getStatus().status).toBe('degraded');
    expect(h.controller.getStatus().accounts[0].state).toBe('drift');
    await h.controller.setEnabled(false);
    expect(h.priorities.get('a.json')).toBe(77);
    expect(h.priorities.get('b.json')).toBe(9);
  });

  it('does not overwrite an external edit racing the final read before an atomic PATCH', async () => {
    const h = harness();
    h.beforePatch((name) => {
      if (name === 'a.json') h.priorities.set(name, 77);
    });
    const status = await h.controller.setEnabled(true);
    expect(status.status).toBe('pending');
    expect(h.priorities.get('a.json')).toBe(77);
    await h.controller.reconcile();
    expect(h.controller.getStatus().status).toBe('degraded');
    expect(h.priorities.get('a.json')).toBe(77);
  });

  it('reports an externally removed priority as absent instead of the last applied number', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.priorities.set('a.json', null);
    await h.controller.reconcile();
    expect(h.controller.getStatus().accounts[0].effectivePriority).toBeNull();
    expect(h.controller.getStatus().accounts[0].state).toBe('drift');
  });

  it('does not classify a different same-email identity from another account result', async () => {
    const h = harness();
    h.quotas.set('synthetic-a', quota(true, false, h.now(), 'synthetic-b'));
    await h.controller.setEnabled(true);
    expect(h.priorities.get('a.json')).toBeNull();
    expect(h.controller.getStatus().status).toBe('degraded');
  });

  it('skips paused accounts, captures new accounts, and surfaces missing runtime entries', async () => {
    const h = harness();
    h.accounts[0].paused = true;
    await h.controller.setEnabled(true);
    expect(h.priorities.get('a.json')).toBeNull();
    expect(h.controller.getStatus().accounts[0].state).toBe('paused');
    h.accounts[0].paused = false;
    await h.controller.reconcile();
    expect(h.priorities.get('a.json')).toBe(4);
    h.priorities.delete('b.json');
    await h.controller.reconcile();
    expect(h.controller.getStatus().status).toBe('pending');
    expect(h.controller.getStatus().accounts[1].state).toBe('missing');
  });

  it('keeps failed restoration visible and resumes it while the policy is disabled', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.fail('b.json');
    await expect(h.controller.setEnabled(false)).rejects.toThrow('synthetic');
    expect(h.controller.getStatus().enabled).toBe(false);
    expect(h.controller.getStatus().status).toBe('degraded');
    h.fail('');
    await h.controller.reconcile();
    expect(h.controller.getStatus().status).toBe('inactive');
    expect(h.priorities.get('b.json')).toBe(9);
  });

  it('reconciles a lost restoration response including absent original priority', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.fail('a.json', true);
    await expect(h.controller.setEnabled(false)).rejects.toThrow('synthetic');
    expect(h.priorities.get('a.json')).toBeNull();
    h.fail('');
    await h.controller.reconcile();
    expect(h.controller.getStatus().status).toBe('inactive');
    expect(h.state()?.entries['synthetic-a'].ownsPriority).toBe(false);
  });

  it('restores explicit zero and negative priorities distinctly from absence', async () => {
    const h = harness();
    h.priorities.set('a.json', 0);
    h.priorities.set('b.json', -7);
    await h.controller.setEnabled(true);
    await h.controller.setEnabled(false);
    expect(h.priorities.get('a.json')).toBe(0);
    expect(h.priorities.get('b.json')).toBe(-7);
    expect(h.priorities.get('d.json')).toBeNull();
  });

  it('restores owned priorities and removes quota mode when pool routing is disabled', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.pool(false);
    await h.controller.reconcile();
    expect(h.drain()?.mode).toBe('manual');
    expect(h.priorities.get('a.json')).toBeNull();
    expect(h.controller.getStatus().status).toBe('inactive');
  });

  it('does not wait forever to restore an account removed from both registry and runtime', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.accounts.splice(0, 1);
    h.priorities.delete('a.json');
    const status = await h.controller.setEnabled(false);
    expect(status.status).toBe('inactive');
    expect(h.state()?.entries['synthetic-a'].ownsPriority).toBe(false);
  });

  it('relinquishes ownership for an explicit manual order without replaying old priorities', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    const count = h.writes.length;
    await h.controller.relinquishForManualOrder();
    expect(h.writes.length).toBe(count);
    expect(h.drain()).toBeUndefined();
    expect(h.state()?.entries['synthetic-a'].ownsPriority).toBe(false);
    h.priorities.set('a.json', 99);
    await h.controller.reconcile();
    expect(h.priorities.get('a.json')).toBe(99);
  });

  it('holds the mutation mutex through an explicit manual priority/configuration commit', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    let entered = () => {};
    let finish = () => {};
    const changing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const manual = h.controller.withManualOrder(async () => {
      await h.controller.relinquishForManualOrder();
      entered();
      await blocked;
      h.priorities.set('a.json', 88);
      h.deps.saveDrainOrder({ mode: 'manual', orderedIds: ['synthetic-a'] });
    });
    await changing;
    const pendingCycle = new ClaudePoolPolicyController(h.deps).reconcile();
    finish();
    await Promise.all([manual, pendingCycle]);
    expect(h.priorities.get('a.json')).toBe(88);
    expect(h.drain()?.mode).toBe('manual');
  });

  it('refuses remote, unsupported, unverified, disabled-pool and ownerless activation without writes', async () => {
    const h = harness();
    h.remote(true);
    await expect(h.controller.setEnabled(true)).rejects.toThrow('host running');
    h.remote(false);
    h.capability(false);
    await expect(h.controller.setEnabled(true)).rejects.toThrow('unsupported');
    h.capability(true);
    h.verified(false);
    await expect(h.controller.setEnabled(true)).rejects.toThrow('verified');
    h.verified(true);
    h.pool(false);
    await expect(h.controller.setEnabled(true)).rejects.toThrow('pool routing');
    h.pool(true);
    fs.unlinkSync(`${h.file}.controller.owner`);
    await expect(h.controller.setEnabled(true)).rejects.toThrow('persistent');
    expect(h.writes).toEqual([]);
  });

  it('preserves a corrupt journal and refuses any mutation instead of inventing a baseline', async () => {
    const h = harness();
    fs.writeFileSync(h.file, 'invalid state');
    await expect(h.controller.setEnabled(true)).rejects.toThrow('ownership state is invalid');
    expect(fs.readFileSync(h.file, 'utf8')).toBe('invalid state');
    expect(h.writes).toEqual([]);
  });

  it('records degradation when a previously verified proxy becomes unavailable', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.verified(false);
    await expect(h.controller.reconcile()).rejects.toThrow('verified');
    expect(h.state()?.status).toBe('degraded');
    expect(h.controller.getStatus().status).toBe('degraded');
  });

  it('serializes two process owners and permits follower takeover after stop', async () => {
    const h = harness();
    fs.unlinkSync(`${h.file}.controller.owner`);
    const first = new ClaudePoolPolicyController(h.deps);
    const second = new ClaudePoolPolicyController(h.deps);
    stops.push(first.start());
    await first.wake();
    const originalOwner = JSON.parse(fs.readFileSync(`${h.file}.controller.owner`, 'utf8')).owner;
    stops.push(second.start());
    await second.wake();
    expect(JSON.parse(fs.readFileSync(`${h.file}.controller.owner`, 'utf8')).owner).toBe(
      originalOwner
    );
    await first.stop();
    expect(fs.existsSync(`${h.file}.controller.owner`)).toBe(false);
    await second.wake();
    expect(JSON.parse(fs.readFileSync(`${h.file}.controller.owner`, 'utf8')).owner).not.toBe(
      originalOwner
    );
    await second.stop();
    expect(fs.existsSync(`${h.file}.controller.lock`)).toBe(false);
  });

  it('awaits an in-flight fetch before releasing leadership and makes no late priority write', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    let entered = () => {};
    let finish: (value: ClaudeQuotaResult) => void = () => {};
    const blocked = new Promise<ClaudeQuotaResult>((resolve) => {
      finish = resolve;
    });
    const fetching = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const owner = new ClaudePoolPolicyController({
      ...h.deps,
      quota: async () => {
        entered();
        return blocked;
      },
    });
    fs.unlinkSync(`${h.file}.controller.owner`);
    stops.push(owner.start());
    await fetching;
    const writes = h.writes.length;
    const stopping = owner.stop();
    expect(fs.existsSync(`${h.file}.controller.owner`)).toBe(true);
    finish(quota(false, true, h.now()));
    await stopping;
    expect(h.writes.length).toBe(writes);
    expect(fs.existsSync(`${h.file}.controller.owner`)).toBe(false);
    expect(fs.existsSync(`${h.file}.controller.lock`)).toBe(false);
  });

  it('aborts cooperative in-flight quota work and releases locks within five seconds', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    let entered = () => {};
    const fetching = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const owner = new ClaudePoolPolicyController({
      ...h.deps,
      quota: async (_id, signal) => {
        entered();
        return new Promise<ClaudeQuotaResult>((_resolve, reject) => {
          const abort = () => reject(new DOMException('Stopped', 'AbortError'));
          if (signal?.aborted) abort();
          else signal?.addEventListener('abort', abort, { once: true });
        });
      },
    });
    fs.unlinkSync(`${h.file}.controller.owner`);
    stops.push(owner.start());
    await fetching;
    const started = performance.now();
    await owner.stop();
    expect(performance.now() - started).toBeLessThan(5000);
    expect(fs.existsSync(`${h.file}.controller.owner`)).toBe(false);
    expect(fs.existsSync(`${h.file}.controller.lock`)).toBe(false);
  });

  it('stops before priority writes when controller ownership is lost during a fetch', async () => {
    const h = harness();
    await h.controller.setEnabled(true);
    h.advance(CLAUDE_POOL_CLASS_MAX_AGE_MS);
    h.quotas.clear();
    const count = h.writes.length;
    await expect(h.controller.reconcile(() => false)).rejects.toThrow('changed');
    expect(h.writes.length).toBe(count);
  });
});
