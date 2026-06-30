/**
 * Tests for drain order priority computation, write path, and attribution stability.
 */
import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runWithScopedCcsHome } from '../../../utils/config-manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function withIsolatedHome<T>(fn: (homeDir: string) => Promise<T> | T): Promise<T> {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-drain-order-'));
  try {
    return await runWithScopedCcsHome(homeDir, () => fn(homeDir));
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

/** Create a minimal auth JSON file in the auth dir. */
function writeAuthFile(
  authDir: string,
  fileName: string,
  fields: Record<string, unknown> = {}
): void {
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
  const content = JSON.stringify({ type: 'antigravity', email: fileName, ...fields }, null, 2);
  fs.writeFileSync(path.join(authDir, fileName), content, { mode: 0o600 });
}

function readAuthFile(authDir: string, fileName: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(authDir, fileName), 'utf-8')) as Record<
    string,
    unknown
  >;
}

// ---------------------------------------------------------------------------
// Import helpers (avoid module-level imports that capture paths at load time)
// ---------------------------------------------------------------------------

async function loadDrainOrder() {
  return import(`../drain-order?drain-order=${Date.now()}`);
}

async function loadRegistry() {
  return import(`../registry?drain-order-registry=${Date.now()}`);
}

async function loadStatsTransformer() {
  return import(`../../../cliproxy/services/stats-fetcher?drain-order-stats-fetcher=${Date.now()}`);
}

async function loadOrderSubcommand() {
  return import(
    `../../../commands/cliproxy/order-subcommand?drain-order-order-subcommand=${Date.now()}`
  );
}

// ---------------------------------------------------------------------------
// Priority computation tests
// ---------------------------------------------------------------------------

describe('rankToPriority', () => {
  it('maps rank 0 (highest) to total priority', async () => {
    const { rankToPriority } = await loadDrainOrder();
    expect(rankToPriority(0, 3)).toBe(3);
  });

  it('maps last rank to MIN_PRIORITY (1)', async () => {
    const { rankToPriority, MIN_PRIORITY } = await loadDrainOrder();
    expect(rankToPriority(2, 3)).toBe(MIN_PRIORITY);
    expect(rankToPriority(2, 3)).toBeGreaterThanOrEqual(1);
  });

  it('never returns 0', async () => {
    const { rankToPriority } = await loadDrainOrder();
    for (let total = 1; total <= 5; total++) {
      for (let rank = 0; rank < total; rank++) {
        expect(rankToPriority(rank, total)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('single account gets priority 1', async () => {
    const { rankToPriority } = await loadDrainOrder();
    expect(rankToPriority(0, 1)).toBe(1);
  });
});

describe('computeManualDrainOrder', () => {
  it('assigns descending priorities to specified accounts', async () => {
    const { computeManualDrainOrder } = await loadDrainOrder();
    const accounts = [
      { accountId: 'a@x.com', tokenFile: 'a.json' },
      { accountId: 'b@x.com', tokenFile: 'b.json' },
      { accountId: 'c@x.com', tokenFile: 'c.json' },
    ];
    const entries = computeManualDrainOrder(['a@x.com', 'b@x.com', 'c@x.com'], accounts);
    const byId = new Map(
      entries.map((e: { accountId: string; priority: number }) => [e.accountId, e.priority])
    );
    expect(byId.get('a@x.com')).toBeGreaterThan(byId.get('b@x.com'));
    expect(byId.get('b@x.com')).toBeGreaterThan(byId.get('c@x.com'));
    expect(byId.get('c@x.com')).toBeGreaterThanOrEqual(1);
  });

  it('throws for unknown account ID', async () => {
    const { computeManualDrainOrder } = await loadDrainOrder();
    const accounts = [{ accountId: 'a@x.com', tokenFile: 'a.json' }];
    expect(() => computeManualDrainOrder(['z@x.com'], accounts)).toThrow();
  });

  it('throws for duplicate account ID in the order list', async () => {
    const { computeManualDrainOrder } = await loadDrainOrder();
    const accounts = [
      { accountId: 'a@x.com', tokenFile: 'a.json' },
      { accountId: 'b@x.com', tokenFile: 'b.json' },
    ];
    expect(() => computeManualDrainOrder(['a@x.com', 'b@x.com', 'a@x.com'], accounts)).toThrow(
      /[Dd]uplicate/
    );
  });

  it('unspecified accounts get MIN_PRIORITY', async () => {
    const { computeManualDrainOrder, MIN_PRIORITY } = await loadDrainOrder();
    const accounts = [
      { accountId: 'a@x.com', tokenFile: 'a.json' },
      { accountId: 'b@x.com', tokenFile: 'b.json' },
    ];
    const entries = computeManualDrainOrder(['a@x.com'], accounts);
    const bEntry = entries.find((e: { accountId: string }) => e.accountId === 'b@x.com');
    expect(bEntry?.priority).toBe(MIN_PRIORITY);
  });

  it('is idempotent - same inputs produce same priorities', async () => {
    const { computeManualDrainOrder } = await loadDrainOrder();
    const accounts = [
      { accountId: 'a@x.com', tokenFile: 'a.json' },
      { accountId: 'b@x.com', tokenFile: 'b.json' },
    ];
    const entries1 = computeManualDrainOrder(['a@x.com', 'b@x.com'], accounts);
    const entries2 = computeManualDrainOrder(['a@x.com', 'b@x.com'], accounts);
    expect(JSON.stringify(entries1)).toBe(JSON.stringify(entries2));
  });

  it('partial --set: every specified account has strictly higher priority than every unspecified account', async () => {
    // Regression for the tie at priority 1 when last specified == MIN_PRIORITY == unspecified.
    // With a pool of 5, specifying 2 should give the last specified priority > 1.
    const { computeManualDrainOrder, MIN_PRIORITY } = await loadDrainOrder();
    const accounts = [
      { accountId: 'a@x.com', tokenFile: 'a.json' },
      { accountId: 'b@x.com', tokenFile: 'b.json' },
      { accountId: 'c@x.com', tokenFile: 'c.json' },
      { accountId: 'd@x.com', tokenFile: 'd.json' },
      { accountId: 'e@x.com', tokenFile: 'e.json' },
    ];
    const entries = computeManualDrainOrder(['a@x.com', 'b@x.com'], accounts);
    const byId = new Map(
      entries.map((e: { accountId: string; priority: number }) => [e.accountId, e.priority])
    );
    const specifiedPriorities = ['a@x.com', 'b@x.com'].map((id) => byId.get(id) as number);
    const unspecifiedPriorities = ['c@x.com', 'd@x.com', 'e@x.com'].map(
      (id) => byId.get(id) as number
    );
    const minSpecified = Math.min(...specifiedPriorities);
    const maxUnspecified = Math.max(...unspecifiedPriorities);
    expect(minSpecified).toBeGreaterThan(maxUnspecified);
    // Unspecified accounts still get MIN_PRIORITY
    for (const p of unspecifiedPriorities) {
      expect(p).toBe(MIN_PRIORITY);
    }
  });
});

describe('computeTierDrainOrder', () => {
  it('ultra > pro > free priority ordering', async () => {
    const { computeTierDrainOrder } = await loadDrainOrder();
    const accounts = [
      { accountId: 'free@x.com', tokenFile: 'free.json', tier: 'free' as const },
      { accountId: 'ultra@x.com', tokenFile: 'ultra.json', tier: 'ultra' as const },
      { accountId: 'pro@x.com', tokenFile: 'pro.json', tier: 'pro' as const },
    ];
    const entries = computeTierDrainOrder(accounts);
    const byId = new Map(
      entries.map((e: { accountId: string; priority: number }) => [e.accountId, e.priority])
    );
    expect(byId.get('ultra@x.com')).toBeGreaterThan(byId.get('pro@x.com'));
    expect(byId.get('pro@x.com')).toBeGreaterThan(byId.get('free@x.com'));
    expect(byId.get('free@x.com')).toBeGreaterThanOrEqual(1);
  });

  it('unknown tier gets lowest priority (MIN_PRIORITY)', async () => {
    const { computeTierDrainOrder, MIN_PRIORITY } = await loadDrainOrder();
    const accounts = [
      { accountId: 'ultra@x.com', tokenFile: 'ultra.json', tier: 'ultra' as const },
      { accountId: 'unknown@x.com', tokenFile: 'unknown.json', tier: 'unknown' as const },
    ];
    const entries = computeTierDrainOrder(accounts);
    const unknownEntry = entries.find(
      (e: { accountId: string }) => e.accountId === 'unknown@x.com'
    );
    expect(unknownEntry?.priority).toBe(MIN_PRIORITY);
  });

  it('accounts with same tier get equal priority', async () => {
    const { computeTierDrainOrder } = await loadDrainOrder();
    const accounts = [
      { accountId: 'a@x.com', tokenFile: 'a.json', tier: 'pro' as const },
      { accountId: 'b@x.com', tokenFile: 'b.json', tier: 'pro' as const },
    ];
    const entries = computeTierDrainOrder(accounts);
    const [a, b] = entries as Array<{ accountId: string; priority: number }>;
    expect(a.priority).toBe(b.priority);
  });

  it('tie-break by tokenFile (plain byte order, not locale) matches selector contract', async () => {
    // The upstream Go selector breaks priority ties by Auth.ID asc (lowercased file path).
    // For the agy prefix-named fleet, file names differ from emails, so verify we sort
    // by tokenFile not accountId.
    const { computeTierDrainOrder } = await loadDrainOrder();
    const accounts = [
      { accountId: 'z@x.com', tokenFile: 'antigravity-aaa.json', tier: 'pro' as const },
      { accountId: 'a@x.com', tokenFile: 'antigravity-zzz.json', tier: 'pro' as const },
    ];
    // Both same tier -> same priority; sort by tokenFile should put 'aaa' before 'zzz'
    const entries = computeTierDrainOrder(accounts) as Array<{
      accountId: string;
      tokenFile: string;
      priority: number;
    }>;
    // Confirm equal priorities
    expect(entries[0].priority).toBe(entries[1].priority);
    // Sort as the display layer does: priority desc, tokenFile lowercase asc
    const sorted = entries
      .slice()
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          (a.tokenFile.toLowerCase() < b.tokenFile.toLowerCase() ? -1 : 1)
      );
    // antigravity-aaa.json sorts before antigravity-zzz.json (byte/file order)
    expect(sorted[0].tokenFile).toBe('antigravity-aaa.json');
    expect(sorted[1].tokenFile).toBe('antigravity-zzz.json');
    // accountId order is the reverse, confirming file order != email order for this fleet
    expect(sorted[0].accountId).toBe('z@x.com');
    expect(sorted[1].accountId).toBe('a@x.com');
  });

  it('tierDerived is true only for accounts with a real tier rank', async () => {
    const { computeTierDrainOrder } = await loadDrainOrder();
    const accounts = [
      { accountId: 'ultra@x.com', tokenFile: 'ultra.json', tier: 'ultra' as const },
      { accountId: 'unknown@x.com', tokenFile: 'unknown.json', tier: 'unknown' as const },
    ];
    const entries = computeTierDrainOrder(accounts) as Array<{
      accountId: string;
      tierDerived: boolean;
    }>;
    const ultraEntry = entries.find((e) => e.accountId === 'ultra@x.com');
    const unknownEntry = entries.find((e) => e.accountId === 'unknown@x.com');
    expect(ultraEntry?.tierDerived).toBe(true);
    expect(unknownEntry?.tierDerived).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tie-break key (platform-conditional, mirrors upstream synthesizer)
// ---------------------------------------------------------------------------

describe('tieBreakKey', () => {
  it('preserves case on non-Windows (byte order, upper before lower)', async () => {
    const { tieBreakKey } = await loadOrderSubcommand();
    // On non-Windows the selector compares raw Auth.ID bytes: 'B' (0x42) < 'a' (0x61).
    const files = ['antigravity-aaa.json', 'antigravity-Bbb.json'];
    const sorted = files
      .slice()
      .sort((a, b) => (tieBreakKey(a, 'linux') < tieBreakKey(b, 'linux') ? -1 : 1));
    expect(sorted).toEqual(['antigravity-Bbb.json', 'antigravity-aaa.json']);
  });

  it('lowercases on Windows so mixed case sorts case-insensitively', async () => {
    const { tieBreakKey } = await loadOrderSubcommand();
    const files = ['antigravity-aaa.json', 'antigravity-Bbb.json'];
    const sorted = files
      .slice()
      .sort((a, b) => (tieBreakKey(a, 'win32') < tieBreakKey(b, 'win32') ? -1 : 1));
    expect(sorted).toEqual(['antigravity-aaa.json', 'antigravity-Bbb.json']);
  });
});

// ---------------------------------------------------------------------------
// Direct file write tests
// ---------------------------------------------------------------------------

describe('writeAuthFilePriorityDirect', () => {
  it('writes priority field to auth JSON', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'test.json', { email: 'test@x.com' });

      const { writeAuthFilePriorityDirect } = await loadDrainOrder();
      writeAuthFilePriorityDirect('test.json', 3);

      const data = readAuthFile(authDir, 'test.json');
      expect(data.priority).toBe(3);
    });
  });

  it('preserves all other fields', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'test.json', { email: 'test@x.com', token: 'abc123' });

      const { writeAuthFilePriorityDirect } = await loadDrainOrder();
      writeAuthFilePriorityDirect('test.json', 2);

      const data = readAuthFile(authDir, 'test.json');
      expect(data.email).toBe('test@x.com');
      expect(data.token).toBe('abc123');
      expect(data.priority).toBe(2);
    });
  });

  it('rejects priority 0 (management layer treats 0 as delete)', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'test.json');

      const { writeAuthFilePriorityDirect } = await loadDrainOrder();
      expect(() => writeAuthFilePriorityDirect('test.json', 0)).toThrow();
    });
  });

  it('rejects negative priority', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'test.json');

      const { writeAuthFilePriorityDirect } = await loadDrainOrder();
      expect(() => writeAuthFilePriorityDirect('test.json', -1)).toThrow();
    });
  });

  it('throws when file does not exist', async () => {
    await withIsolatedHome(async (_homeDir) => {
      const { writeAuthFilePriorityDirect } = await loadDrainOrder();
      expect(() => writeAuthFilePriorityDirect('nonexistent.json', 1)).toThrow();
    });
  });
});

describe('readAuthFilePriority', () => {
  it('returns the priority from a file that has one', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'test.json', { priority: 5 });

      const { readAuthFilePriority } = await loadDrainOrder();
      expect(readAuthFilePriority('test.json')).toBe(5);
    });
  });

  it('returns undefined for file with no priority', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'test.json', { email: 'x@y.com' });

      const { readAuthFilePriority } = await loadDrainOrder();
      expect(readAuthFilePriority('test.json')).toBeUndefined();
    });
  });

  it('returns undefined for missing file', async () => {
    await withIsolatedHome(async (_homeDir) => {
      const { readAuthFilePriority } = await loadDrainOrder();
      expect(readAuthFilePriority('ghost.json')).toBeUndefined();
    });
  });

  it('returns undefined for priority 0 (invalid sentinel)', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'test.json', { priority: 0 });

      const { readAuthFilePriority } = await loadDrainOrder();
      expect(readAuthFilePriority('test.json')).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// applyDrainOrder (direct write path, proxy stopped)
// ---------------------------------------------------------------------------

describe('applyDrainOrder - direct write path (proxy stopped)', () => {
  it('writes priorities to all files when proxy stopped', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'a.json', { email: 'a@x.com' });
      writeAuthFile(authDir, 'b.json', { email: 'b@x.com' });

      const { applyDrainOrder } = await loadDrainOrder();
      const entries = [
        {
          accountId: 'a@x.com',
          tokenFile: 'a.json',
          priority: 2,
          tierDerived: false,
          currentPriority: undefined,
        },
        {
          accountId: 'b@x.com',
          tokenFile: 'b.json',
          priority: 1,
          tierDerived: false,
          currentPriority: undefined,
        },
      ];
      const result = await applyDrainOrder(entries, false);

      expect(result.usedManagementApi).toBe(false);
      expect(result.written).toHaveLength(2);
      expect(result.failed).toHaveLength(0);

      const a = readAuthFile(authDir, 'a.json');
      const b = readAuthFile(authDir, 'b.json');
      expect(a.priority).toBe(2);
      expect(b.priority).toBe(1);
    });
  });

  it('skips entries where priority already matches (idempotency)', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'a.json', { email: 'a@x.com', priority: 3 });

      const { applyDrainOrder } = await loadDrainOrder();
      const entries = [
        {
          accountId: 'a@x.com',
          tokenFile: 'a.json',
          priority: 3,
          tierDerived: false,
          currentPriority: undefined,
        },
      ];
      const result = await applyDrainOrder(entries, false);

      expect(result.skipped).toHaveLength(1);
      expect(result.written).toHaveLength(0);
    });
  });

  it('records failures for missing files', async () => {
    await withIsolatedHome(async (_homeDir) => {
      const { applyDrainOrder } = await loadDrainOrder();
      const entries = [
        {
          accountId: 'ghost@x.com',
          tokenFile: 'ghost.json',
          priority: 2,
          tierDerived: false,
          currentPriority: undefined,
        },
      ];
      const result = await applyDrainOrder(entries, false);
      expect(result.failed).toHaveLength(1);
      expect(result.written).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Registry drain order persistence
// ---------------------------------------------------------------------------

describe('registry drain order persistence', () => {
  it('saveDrainOrderConfig persists and loadDrainOrderConfig retrieves', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'antigravity-a.json', { email: 'a@x.com', type: 'antigravity' });

      const { registerAccount } = await loadRegistry();
      registerAccount('agy', 'antigravity-a.json', 'a@x.com');

      const { saveDrainOrderConfig, loadDrainOrderConfig } = await loadRegistry();
      const config = { mode: 'manual' as const, orderedIds: ['a@x.com'] };
      const saved = saveDrainOrderConfig('agy', config);
      expect(saved).toBe(true);

      const loaded = loadDrainOrderConfig('agy');
      expect(loaded?.mode).toBe('manual');
      expect(loaded?.orderedIds).toEqual(['a@x.com']);
    });
  });

  it('clearDrainOrderConfig removes persisted config', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'antigravity-a.json', { email: 'a@x.com', type: 'antigravity' });

      const { registerAccount } = await loadRegistry();
      registerAccount('agy', 'antigravity-a.json', 'a@x.com');

      const { saveDrainOrderConfig, loadDrainOrderConfig, clearDrainOrderConfig } =
        await loadRegistry();
      saveDrainOrderConfig('agy', { mode: 'tier' });
      const cleared = clearDrainOrderConfig('agy');
      expect(cleared).toBe(true);

      expect(loadDrainOrderConfig('agy')).toBeUndefined();
    });
  });

  it('returns false for saveDrainOrderConfig when provider not in registry', async () => {
    await withIsolatedHome(async (_homeDir) => {
      const { saveDrainOrderConfig } = await loadRegistry();
      // No accounts registered for 'gemini' -> returns false
      const result = saveDrainOrderConfig('gemini', { mode: 'tier' });
      expect(result).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Attribution stability: auth_index ordering survives priority rewrite
// ---------------------------------------------------------------------------

describe('attribution stability - auth_index unaffected by priority rewrite', () => {
  it('buildAuthIndexToAccountMap produces stable output regardless of priority values', async () => {
    // Simulate the auth files list returned by /v0/management/auth-files with various priorities.
    // auth_index is assigned by CLIProxy at load time based on file discovery order,
    // NOT by priority. So priority rewrites must not change auth_index values.
    const { buildAuthIndexToAccountMap } = await loadStatsTransformer();

    const authFilesBeforeRewrite = [
      { auth_index: 0, email: 'a@x.com', provider: 'antigravity' },
      { auth_index: 1, email: 'b@x.com', provider: 'antigravity' },
      { auth_index: 2, email: 'c@x.com', provider: 'antigravity' },
    ];

    const authFilesAfterRewrite = [
      // Priority changed but auth_index values are assigned by CLIProxy independently
      { auth_index: 0, email: 'a@x.com', provider: 'antigravity', priority: 3 },
      { auth_index: 1, email: 'b@x.com', provider: 'antigravity', priority: 2 },
      { auth_index: 2, email: 'c@x.com', provider: 'antigravity', priority: 1 },
    ];

    const mapBefore = buildAuthIndexToAccountMap(authFilesBeforeRewrite);
    const mapAfter = buildAuthIndexToAccountMap(authFilesAfterRewrite);

    // auth_index -> email mapping must be identical after priority rewrite
    expect(mapBefore.get('0')).toBe('a@x.com');
    expect(mapBefore.get('1')).toBe('b@x.com');
    expect(mapBefore.get('2')).toBe('c@x.com');

    expect(mapAfter.get('0')).toBe(mapBefore.get('0'));
    expect(mapAfter.get('1')).toBe(mapBefore.get('1'));
    expect(mapAfter.get('2')).toBe(mapBefore.get('2'));
  });

  it('buildAuthIndexToAccountMap skips entries without auth_index', async () => {
    const { buildAuthIndexToAccountMap } = await loadStatsTransformer();

    const authFiles = [
      { email: 'no-index@x.com', provider: 'antigravity' }, // no auth_index
      { auth_index: 5, email: 'has-index@x.com', provider: 'antigravity' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);
    expect(map.size).toBe(1);
    expect(map.get('5')).toBe('has-index@x.com');
    expect(map.has('undefined')).toBe(false);
  });

  it('buildAuthIndexToAccountMap handles both numeric and string auth_index keys', async () => {
    const { buildAuthIndexToAccountMap } = await loadStatsTransformer();

    const authFiles = [
      { auth_index: 0, email: 'numeric@x.com', provider: 'antigravity' },
      { auth_index: '1', email: 'string@x.com', provider: 'antigravity' },
    ];

    const map = buildAuthIndexToAccountMap(authFiles);
    // Both stored as String(auth_index)
    expect(map.get('0')).toBe('numeric@x.com');
    expect(map.get('1')).toBe('string@x.com');
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveDrainOrder - shared effective-order resolver
// (consumed by `accounts order` show AND the quota pool section)
// ---------------------------------------------------------------------------

describe('resolveEffectiveDrainOrder', () => {
  it('returns empty file-order result for no active accounts', async () => {
    await withIsolatedHome(async () => {
      const { resolveEffectiveDrainOrder } = await loadDrainOrder();
      const result = resolveEffectiveDrainOrder('claude', []);
      expect(result.mode).toBe('file');
      expect(result.entries).toEqual([]);
      expect(result.hasDrift).toBe(false);
    });
  });

  it('uses stable file order (tieBreakKey) and reports no drift when no config stored', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'claude-b.json', { email: 'b@x.com' });
      writeAuthFile(authDir, 'claude-a.json', { email: 'a@x.com' });

      const { resolveEffectiveDrainOrder } = await loadDrainOrder();
      const result = resolveEffectiveDrainOrder('claude', [
        { accountId: 'b@x.com', tokenFile: 'claude-b.json' },
        { accountId: 'a@x.com', tokenFile: 'claude-a.json' },
      ]);
      expect(result.mode).toBe('file');
      expect(result.entries.map((e: { accountId: string }) => e.accountId)).toEqual([
        'a@x.com',
        'b@x.com',
      ]);
      expect(result.hasDrift).toBe(false);
    });
  });

  it('file-order: residual on-disk priorities reorder display to match the selector and flag drift', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      // No drain order config stored -> file mode. But residual priorities are
      // left on disk (e.g. after `order --reset` did not strip the attribute).
      // The selector follows the file, so b (priority 5) must sort before a
      // (priority 1) even though tieBreakKey alone would put a first, and drift
      // is flagged so the user knows the file disagrees with "plain file order".
      writeAuthFile(authDir, 'claude-a.json', { email: 'a@x.com', priority: 1 });
      writeAuthFile(authDir, 'claude-b.json', { email: 'b@x.com', priority: 5 });

      const { resolveEffectiveDrainOrder } = await loadDrainOrder();
      const result = resolveEffectiveDrainOrder('claude', [
        { accountId: 'a@x.com', tokenFile: 'claude-a.json' },
        { accountId: 'b@x.com', tokenFile: 'claude-b.json' },
      ]);
      expect(result.mode).toBe('file');
      expect(result.entries.map((e: { accountId: string }) => e.accountId)).toEqual([
        'b@x.com',
        'a@x.com',
      ]);
      expect(result.hasDrift).toBe(true);
    });
  });

  it('sorts manual order by ON-DISK priority, not computed config, and flags drift', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      // Two registered accounts; manual config says a then b (a > b computed).
      writeAuthFile(authDir, 'antigravity-a.json', { email: 'a@x.com', type: 'antigravity' });
      writeAuthFile(authDir, 'antigravity-b.json', { email: 'b@x.com', type: 'antigravity' });

      const { registerAccount, saveDrainOrderConfig } = await loadRegistry();
      registerAccount('agy', 'antigravity-a.json', 'a@x.com');
      registerAccount('agy', 'antigravity-b.json', 'b@x.com');
      saveDrainOrderConfig('agy', { mode: 'manual', orderedIds: ['a@x.com', 'b@x.com'] });

      // On disk, re-auth/--reset left b with a HIGHER priority than a. The
      // selector follows the file, so b should come first and drift is flagged.
      const { writeAuthFilePriorityDirect, resolveEffectiveDrainOrder } = await loadDrainOrder();
      writeAuthFilePriorityDirect('antigravity-a.json', 1);
      writeAuthFilePriorityDirect('antigravity-b.json', 5);

      const result = resolveEffectiveDrainOrder('agy', [
        { accountId: 'a@x.com', tokenFile: 'antigravity-a.json' },
        { accountId: 'b@x.com', tokenFile: 'antigravity-b.json' },
      ]);
      expect(result.mode).toBe('manual');
      // b@x.com first because its ON-DISK priority (5) beats a@x.com (1).
      expect(result.entries.map((e: { accountId: string }) => e.accountId)).toEqual([
        'b@x.com',
        'a@x.com',
      ]);
      expect(result.hasDrift).toBe(true);
    });
  });

  it('reports no drift when on-disk priorities match the computed manual config', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'antigravity-a.json', { email: 'a@x.com', type: 'antigravity' });
      writeAuthFile(authDir, 'antigravity-b.json', { email: 'b@x.com', type: 'antigravity' });

      const { registerAccount, saveDrainOrderConfig } = await loadRegistry();
      registerAccount('agy', 'antigravity-a.json', 'a@x.com');
      registerAccount('agy', 'antigravity-b.json', 'b@x.com');
      saveDrainOrderConfig('agy', { mode: 'manual', orderedIds: ['a@x.com', 'b@x.com'] });

      // Apply the computed config to disk first, then resolve: no drift.
      const { computeManualDrainOrder, applyDrainOrder, resolveEffectiveDrainOrder } =
        await loadDrainOrder();
      const entries = computeManualDrainOrder(
        ['a@x.com', 'b@x.com'],
        [
          { accountId: 'a@x.com', tokenFile: 'antigravity-a.json' },
          { accountId: 'b@x.com', tokenFile: 'antigravity-b.json' },
        ]
      );
      await applyDrainOrder(entries, false);

      const result = resolveEffectiveDrainOrder('agy', [
        { accountId: 'a@x.com', tokenFile: 'antigravity-a.json' },
        { accountId: 'b@x.com', tokenFile: 'antigravity-b.json' },
      ]);
      expect(result.mode).toBe('manual');
      expect(result.entries.map((e: { accountId: string }) => e.accountId)).toEqual([
        'a@x.com',
        'b@x.com',
      ]);
      expect(result.hasDrift).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// clearAuthFilePriorityDirect + clearDrainOrderPriorities
// (the missing half of `order --reset`: actually strip residual priorities)
// ---------------------------------------------------------------------------

describe('clearAuthFilePriorityDirect', () => {
  it('removes the priority field and preserves all other fields', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'a.json', { email: 'a@x.com', priority: 4, keep: 'me' });

      const { clearAuthFilePriorityDirect } = await loadDrainOrder();
      const removed = clearAuthFilePriorityDirect('a.json');

      expect(removed).toBe(true);
      const data = readAuthFile(authDir, 'a.json');
      expect('priority' in data).toBe(false);
      expect(data.keep).toBe('me');
      expect(data.email).toBe('a@x.com');
    });
  });

  it('returns false (no-op) when the file has no priority field', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'a.json', { email: 'a@x.com' });

      const { clearAuthFilePriorityDirect } = await loadDrainOrder();
      expect(clearAuthFilePriorityDirect('a.json')).toBe(false);
    });
  });

  it('throws when the file does not exist', async () => {
    await withIsolatedHome(async () => {
      const { clearAuthFilePriorityDirect } = await loadDrainOrder();
      expect(() => clearAuthFilePriorityDirect('ghost.json')).toThrow();
    });
  });
});

describe('clearDrainOrderPriorities - direct path (proxy stopped)', () => {
  it('clears residual priorities from all files via direct write', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'a.json', { email: 'a@x.com', priority: 3 });
      writeAuthFile(authDir, 'b.json', { email: 'b@x.com' }); // already clear

      const { clearDrainOrderPriorities } = await loadDrainOrder();
      const result = await clearDrainOrderPriorities(['a.json', 'b.json'], false);

      expect(result.usedManagementApi).toBe(false);
      expect(result.cleared).toEqual(['a.json']);
      expect(result.alreadyClear).toEqual(['b.json']);
      expect(result.failed).toHaveLength(0);
      expect('priority' in readAuthFile(authDir, 'a.json')).toBe(false);
    });
  });

  it('records a failure for a missing file', async () => {
    await withIsolatedHome(async () => {
      const { clearDrainOrderPriorities } = await loadDrainOrder();
      const result = await clearDrainOrderPriorities(['ghost.json'], false);
      expect(result.failed).toHaveLength(1);
      expect(result.cleared).toHaveLength(0);
    });
  });
});

describe('clearDrainOrderPriorities - management API path (proxy running)', () => {
  it('PATCHes priority:0 (delete) for files with a residual priority and skips clear ones', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'a.json', { email: 'a@x.com', priority: 3 });
      writeAuthFile(authDir, 'b.json', { email: 'b@x.com' }); // already clear -> no API call

      const calls: Array<{ url: string; body: unknown }> = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
        return new Response('{}', { status: 200 });
      }) as typeof fetch;

      try {
        const { clearDrainOrderPriorities } = await loadDrainOrder();
        const result = await clearDrainOrderPriorities(['a.json', 'b.json'], true);

        expect(result.usedManagementApi).toBe(true);
        expect(result.cleared).toEqual(['a.json']);
        expect(result.alreadyClear).toEqual(['b.json']);
        expect(result.failed).toHaveLength(0);

        // Only a.json (which had a residual priority) triggered an API call,
        // and it patched priority:0 (the delete sentinel).
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain('/v0/management/auth-files/fields');
        expect(calls[0].body).toEqual({ name: 'a.json', priority: 0 });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  it('records a failure when the PATCH returns a non-ok status', async () => {
    await withIsolatedHome(async (homeDir) => {
      const authDir = path.join(homeDir, '.ccs', 'cliproxy', 'auth');
      writeAuthFile(authDir, 'a.json', { email: 'a@x.com', priority: 3 });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;

      try {
        const { clearDrainOrderPriorities } = await loadDrainOrder();
        const result = await clearDrainOrderPriorities(['a.json'], true);
        expect(result.cleared).toHaveLength(0);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0].tokenFile).toBe('a.json');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ---------------------------------------------------------------------------
// fetchProxyAuthCooldowns - live in-proxy 429 cooldowns
// ---------------------------------------------------------------------------

describe('fetchProxyAuthCooldowns', () => {
  it('classifies unavailable entries as cooldowns and parses next_retry_after', async () => {
    await withIsolatedHome(async () => {
      const next = '2026-06-11T12:00:00.000Z';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            files: [
              { name: 'cooling.json', unavailable: true, next_retry_after: next },
              { name: 'no-retry.json', unavailable: true },
              { name: 'healthy.json', unavailable: false },
            ],
          }),
          { status: 200 }
        )) as typeof fetch;

      try {
        const { fetchProxyAuthCooldowns } = await loadDrainOrder();
        const cooldowns = await fetchProxyAuthCooldowns();

        // Only the two unavailable entries are returned; healthy.json is excluded.
        expect(cooldowns.map((c: { tokenFile: string }) => c.tokenFile).sort()).toEqual([
          'cooling.json',
          'no-retry.json',
        ]);
        const cooling = cooldowns.find(
          (c: { tokenFile: string }) => c.tokenFile === 'cooling.json'
        );
        expect(cooling?.cooldownUntil).toBe(Date.parse(next));
        const noRetry = cooldowns.find(
          (c: { tokenFile: string }) => c.tokenFile === 'no-retry.json'
        );
        expect(noRetry?.cooldownUntil).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  it('degrades silently to [] on a non-ok response', async () => {
    await withIsolatedHome(async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response('err', { status: 404 })) as typeof fetch;
      try {
        const { fetchProxyAuthCooldowns } = await loadDrainOrder();
        expect(await fetchProxyAuthCooldowns()).toEqual([]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  it('degrades silently to [] on a network error', async () => {
    await withIsolatedHome(async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new TypeError('network down');
      }) as typeof fetch;
      try {
        const { fetchProxyAuthCooldowns } = await loadDrainOrder();
        expect(await fetchProxyAuthCooldowns()).toEqual([]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  it('degrades silently to [] on an unexpected response shape', async () => {
    await withIsolatedHome(async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ unexpected: 'shape' }), { status: 200 })) as typeof fetch;
      try {
        const { fetchProxyAuthCooldowns } = await loadDrainOrder();
        expect(await fetchProxyAuthCooldowns()).toEqual([]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
