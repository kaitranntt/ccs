/**
 * Tests for the pool state resolver: per-account state classification
 * (available / cooling / paused), drain order modes, and the cooling-vs-paused
 * distinction driven by the persisted quota-cooldown store.
 */
import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runWithScopedCcsHome } from '../../../utils/config-manager';
import type { AccountInfo } from '../types';
import type { PoolRoutingSettings } from '../pool-state';

const SETTINGS_OFF: PoolRoutingSettings = {
  poolEnabled: false,
  strategy: 'round-robin',
  sessionAffinityEnabled: false,
  sessionAffinityTtl: '1h',
};

function account(partial: Partial<AccountInfo> & { id: string }): AccountInfo {
  return {
    provider: 'claude',
    isDefault: false,
    tokenFile: `${partial.id}.json`,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as AccountInfo;
}

async function withIsolatedHome<T>(fn: (homeDir: string) => Promise<T> | T): Promise<T> {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-pool-state-'));
  try {
    return await runWithScopedCcsHome(homeDir, () => fn(homeDir));
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

const SETTINGS_ON: PoolRoutingSettings = {
  poolEnabled: true,
  strategy: 'fill-first',
  sessionAffinityEnabled: true,
  sessionAffinityTtl: '1h',
};

async function loadPoolState() {
  return import(`../pool-state?pool-state=${Date.now()}`);
}

describe('resolvePoolState - account state classification', () => {
  it('labels an unpaused, non-cooling account as available', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_OFF,
        accounts: [account({ id: 'a@x.com' })],
        now: 1_000_000,
      });
      expect(pool.states[0].state).toBe('available');
    });
  });

  it('labels a manually paused account (no cooldown record) as paused', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_OFF,
        accounts: [account({ id: 'a@x.com', paused: true, pausedAt: '2026-06-01T00:00:00.000Z' })],
        now: 1_000_000,
      });
      expect(pool.states[0].state).toBe('paused');
      expect(pool.states[0].pausedAt).toBe('2026-06-01T00:00:00.000Z');
    });
  });

  it('labels a paused account with a matching quota-cooldown record as cooling', async () => {
    await withIsolatedHome(async (homeDir) => {
      const pausedAt = '2026-06-10T12:00:00.000Z';
      const until = 2_000_000;
      const quotaPausedPath = path.join(homeDir, '.ccs', 'cliproxy', 'quota-paused.json');
      fs.mkdirSync(path.dirname(quotaPausedPath), { recursive: true });
      fs.writeFileSync(
        quotaPausedPath,
        JSON.stringify({
          entries: [
            {
              provider: 'claude',
              accountId: 'a@x.com',
              pausedAt,
              until,
              reason: 'quota_exhausted',
            },
          ],
        })
      );

      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_OFF,
        accounts: [account({ id: 'a@x.com', paused: true, pausedAt })],
        now: 1_000_000,
      });
      expect(pool.states[0].state).toBe('cooling');
      expect(pool.states[0].cooldownUntil).toBe(until);
      expect(pool.states[0].cooldownSource).toBe('persisted');
    });
  });

  it('treats a manual pause layered over a stale cooldown record as paused (pausedAt mismatch)', async () => {
    await withIsolatedHome(async (homeDir) => {
      const quotaPausedPath = path.join(homeDir, '.ccs', 'cliproxy', 'quota-paused.json');
      fs.mkdirSync(path.dirname(quotaPausedPath), { recursive: true });
      fs.writeFileSync(
        quotaPausedPath,
        JSON.stringify({
          entries: [
            {
              provider: 'claude',
              accountId: 'a@x.com',
              pausedAt: '2026-06-10T12:00:00.000Z',
              until: 2_000_000,
              reason: 'quota_exhausted',
            },
          ],
        })
      );

      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_OFF,
        // Different pausedAt -> not the same pause the cooldown record describes.
        accounts: [account({ id: 'a@x.com', paused: true, pausedAt: '2026-06-11T09:00:00.000Z' })],
        now: 1_000_000,
      });
      expect(pool.states[0].state).toBe('paused');
    });
  });

  it('does not treat an expired persisted cooldown as cooling', async () => {
    await withIsolatedHome(async (homeDir) => {
      const quotaPausedPath = path.join(homeDir, '.ccs', 'cliproxy', 'quota-paused.json');
      fs.mkdirSync(path.dirname(quotaPausedPath), { recursive: true });
      fs.writeFileSync(
        quotaPausedPath,
        JSON.stringify({
          entries: [
            {
              provider: 'claude',
              accountId: 'a@x.com',
              pausedAt: '2026-06-10T12:00:00.000Z',
              until: 500_000, // already past relative to now below
              reason: 'quota_exhausted',
            },
          ],
        })
      );

      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_OFF,
        accounts: [account({ id: 'a@x.com' })],
        now: 1_000_000,
      });
      expect(pool.states[0].state).toBe('available');
    });
  });
});

describe('resolvePoolState - drain order', () => {
  it('uses stable file order when no drain config is stored', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_OFF,
        accounts: [
          account({ id: 'b@x.com', tokenFile: 'claude-b.json' }),
          account({ id: 'a@x.com', tokenFile: 'claude-a.json' }),
        ],
        now: 1_000_000,
      });
      expect(pool.drainOrder.mode).toBe('file');
      // Token-file byte order: claude-a.json before claude-b.json.
      expect(pool.drainOrder.order).toEqual(['a@x.com', 'b@x.com']);
    });
  });

  it('excludes paused accounts from the drain order but keeps them in states', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_OFF,
        accounts: [
          account({ id: 'a@x.com', tokenFile: 'claude-a.json' }),
          account({
            id: 'b@x.com',
            tokenFile: 'claude-b.json',
            paused: true,
            pausedAt: '2026-06-01T00:00:00.000Z',
          }),
        ],
        now: 1_000_000,
      });
      expect(pool.drainOrder.order).toEqual(['a@x.com']);
      expect(pool.states.map((s) => s.accountId).sort()).toEqual(['a@x.com', 'b@x.com']);
    });
  });

  it('reports no drift in plain file-order mode', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_OFF,
        accounts: [
          account({ id: 'a@x.com', tokenFile: 'claude-a.json' }),
          account({ id: 'b@x.com', tokenFile: 'claude-b.json' }),
        ],
        now: 1_000_000,
      });
      expect(pool.drainOrder.hasDrift).toBe(false);
    });
  });

  it('follows on-disk priority and surfaces drift when the stored order diverges', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
      // Auth files on disk with priorities that contradict the stored manual order:
      // config says a then b, but disk gives b the higher priority (re-auth/--reset trap).
      fs.writeFileSync(
        path.join(authDir, 'antigravity-a.json'),
        JSON.stringify({ type: 'antigravity', email: 'a@x.com', priority: 1 })
      );
      fs.writeFileSync(
        path.join(authDir, 'antigravity-b.json'),
        JSON.stringify({ type: 'antigravity', email: 'b@x.com', priority: 5 })
      );

      const { registerAccount, saveDrainOrderConfig } = await import(
        `../registry?pool-state-drift=${Date.now()}`
      );
      registerAccount('agy', 'antigravity-a.json', 'a@x.com');
      registerAccount('agy', 'antigravity-b.json', 'b@x.com');
      saveDrainOrderConfig('agy', { mode: 'manual', orderedIds: ['a@x.com', 'b@x.com'] });

      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'agy',
        settings: SETTINGS_OFF,
        accounts: [
          account({ provider: 'agy', id: 'a@x.com', tokenFile: 'antigravity-a.json' }),
          account({ provider: 'agy', id: 'b@x.com', tokenFile: 'antigravity-b.json' }),
        ],
        now: 1_000_000,
      });
      // Selector follows the on-disk priority: b (5) before a (1).
      expect(pool.drainOrder.order).toEqual(['b@x.com', 'a@x.com']);
      expect(pool.drainOrder.hasDrift).toBe(true);
    });
  });
});

describe('resolvePoolState - in-proxy cooldown classification', () => {
  it('classifies an injected proxy cooldown as cooling with source "proxy"', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolState } = await loadPoolState();
      const until = 2_000_000;
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_ON,
        accounts: [account({ id: 'a@x.com', tokenFile: 'claude-a.json' })],
        proxyCooldowns: [{ tokenFile: 'claude-a.json', cooldownUntil: until }],
        now: 1_000_000,
      });
      expect(pool.states[0].state).toBe('cooling');
      expect(pool.states[0].cooldownUntil).toBe(until);
      expect(pool.states[0].cooldownSource).toBe('proxy');
    });
  });

  it('treats a proxy cooldown with no next_retry_after as cooling (no reset time)', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_ON,
        accounts: [account({ id: 'a@x.com', tokenFile: 'claude-a.json' })],
        proxyCooldowns: [{ tokenFile: 'claude-a.json' }],
        now: 1_000_000,
      });
      expect(pool.states[0].state).toBe('cooling');
      expect(pool.states[0].cooldownUntil).toBeUndefined();
      expect(pool.states[0].cooldownSource).toBe('proxy');
    });
  });

  it('proxy cooldown wins over a persisted quota cooldown for the same account', async () => {
    await withIsolatedHome(async (homeDir) => {
      const quotaPausedPath = path.join(homeDir, '.ccs', 'cliproxy', 'quota-paused.json');
      fs.mkdirSync(path.dirname(quotaPausedPath), { recursive: true });
      fs.writeFileSync(
        quotaPausedPath,
        JSON.stringify({
          entries: [
            {
              provider: 'claude',
              accountId: 'a@x.com',
              pausedAt: '2026-06-10T12:00:00.000Z',
              until: 1_500_000,
              reason: 'quota_exhausted',
            },
          ],
        })
      );

      const { resolvePoolState } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_ON,
        accounts: [account({ id: 'a@x.com', tokenFile: 'claude-a.json' })],
        proxyCooldowns: [{ tokenFile: 'claude-a.json', cooldownUntil: 9_000_000 }],
        now: 1_000_000,
      });
      // Proxy (live routing truth) wins: source 'proxy', its reset time, not the
      // persisted quota-paused.json one.
      expect(pool.states[0].cooldownSource).toBe('proxy');
      expect(pool.states[0].cooldownUntil).toBe(9_000_000);
    });
  });

  it('leaves accounts available when no proxy cooldown is provided (graceful degradation)', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolState, hasProxySourcedCooling } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_ON,
        accounts: [account({ id: 'a@x.com', tokenFile: 'claude-a.json' })],
        // proxyCooldowns omitted -> CCS-side view only.
        now: 1_000_000,
      });
      expect(pool.states[0].state).toBe('available');
      expect(hasProxySourcedCooling(pool)).toBe(false);
    });
  });

  it('hasProxySourcedCooling reports true only when a proxy-sourced cooling exists', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolState, hasProxySourcedCooling } = await loadPoolState();
      const pool = resolvePoolState({
        provider: 'claude',
        settings: SETTINGS_ON,
        accounts: [
          account({ id: 'a@x.com', tokenFile: 'claude-a.json' }),
          account({ id: 'b@x.com', tokenFile: 'claude-b.json' }),
        ],
        proxyCooldowns: [{ tokenFile: 'claude-b.json', cooldownUntil: 2_000_000 }],
        now: 1_000_000,
      });
      expect(hasProxySourcedCooling(pool)).toBe(true);
    });
  });
});

describe('resolvePoolStateWithProxyCooldowns - fetch + degradation', () => {
  it('skips the proxy fetch and stays available when pool routing is OFF', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolStateWithProxyCooldowns } = await loadPoolState();
      let fetched = false;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        fetched = true;
        return new Response('{}', { status: 200 });
      }) as typeof fetch;
      try {
        const pool = await resolvePoolStateWithProxyCooldowns({
          provider: 'claude',
          settings: SETTINGS_OFF,
          accounts: [account({ id: 'a@x.com', tokenFile: 'claude-a.json' })],
          now: 1_000_000,
        });
        expect(pool.states[0].state).toBe('available');
        // Pool OFF -> no management API call at all.
        expect(fetched).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  it('honours injected proxyCooldowns without fetching, even when pool is ON', async () => {
    await withIsolatedHome(async () => {
      const { resolvePoolStateWithProxyCooldowns } = await loadPoolState();
      let fetched = false;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        fetched = true;
        return new Response('{}', { status: 200 });
      }) as typeof fetch;
      try {
        const pool = await resolvePoolStateWithProxyCooldowns({
          provider: 'claude',
          settings: SETTINGS_ON,
          accounts: [account({ id: 'a@x.com', tokenFile: 'claude-a.json' })],
          proxyCooldowns: [{ tokenFile: 'claude-a.json', cooldownUntil: 2_000_000 }],
          now: 1_000_000,
        });
        expect(pool.states[0].cooldownSource).toBe('proxy');
        // Injected cooldowns short-circuit the fetch.
        expect(fetched).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
