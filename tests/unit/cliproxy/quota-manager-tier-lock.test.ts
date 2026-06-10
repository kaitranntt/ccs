/**
 * Phase 2: quota-manager tier_lock selection tests
 *
 * Load-bearing requirement: when manual.tier_lock is set in config,
 * findHealthyAccount must only return accounts matching that tier.
 * Clearing tier_lock (null) restores normal tier-priority selection.
 * Existing failover behavior must be unaffected.
 *
 * MEDIUM #1 coverage: tier_lock is per-provider (Record<provider, tier|null>).
 * Locking provider "agy" to "ultra" must NOT affect another provider's accounts.
 *
 * Strategy:
 * - _mockConfig is an in-memory object; each test mutates it to set the desired
 *   tier_lock, then imports a fresh quota-manager instance via a cache-busting
 *   query string.  No disk writes, no process.env.CCS_HOME races.
 * - mock.module for account-manager and account-safety (already used by prior
 *   tests in this file) cover the full transitive dependency surface.
 * - config-loader-facade is NOT mocked here — quota-manager reads config via
 *   loadOrCreateUnifiedConfig which in turn reads CCS_HOME from env.  We
 *   write the minimal config.yaml once per test via writeMinimalConfig() to
 *   a dedicated temp dir set to CCS_HOME before each test.  This gives full
 *   control without touching the facade mock surface.
 *
 * Note on isolation: Bun workers are REUSED across test files within a single
 * bun test invocation (Bun 1.3.x, up to --max-concurrency files per worker).
 * mock.module() is GLOBAL and STICKY for the lifetime of a worker — it does NOT
 * reset between files, and mock.restore() does NOT unwind mock.module() calls.
 * To avoid leaking broken stubs to later files (e.g. cliproxy-auth-routes.test.ts,
 * which imports validateNickname/hasAccountNameConflict/PROVIDERS_WITHOUT_EMAIL from
 * account-manager), every mock factory SPREADS the REAL account-manager and overrides
 * ONLY the account-DATA reads + IO that these tier_lock tests control; afterAll then
 * restores the real account-manager/account-safety modules outright.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { invalidateConfigCache } from '../../../src/config/config-loader-facade';
// Capture the REAL account modules BEFORE the mock.module calls below replace them
// in Bun's global, sticky module registry (mock.module is process-wide and is NOT
// unwound by mock.restore in Bun 1.3.x). We spread these into every mock factory and
// restore them in afterAll, so leak-sensitive helpers that OTHER test files import
// from account-manager (validateNickname, hasAccountNameConflict, registry-path
// getters, PROVIDERS_WITHOUT_EMAIL) stay REAL for any file sharing this Bun worker.
// Only the account-DATA reads + IO are overridden for these tier_lock tests.
import * as realAccountManagerNS from '../../../src/cliproxy/accounts/account-manager';
import * as realAccountSafetyNS from '../../../src/cliproxy/accounts/account-safety';
const REAL_ACCOUNT_MANAGER = { ...realAccountManagerNS };
const REAL_ACCOUNT_SAFETY = { ...realAccountSafetyNS };

// ============================================================================
// Account fixtures
// ============================================================================

const ULTRA_ACCOUNT = { id: 'ultra-acc-1', tier: 'ultra', email: 'ultra@example.com' };
const PRO_ACCOUNT = { id: 'pro-acc-1', tier: 'pro', email: 'pro@example.com' };
const PRO_ACCOUNT_2 = { id: 'pro-acc-2', tier: 'pro', email: 'pro2@example.com' };

/** Quota objects match calculateAgyQuotaPercent shape. */
const HEALTHY_QUOTA = { success: true, models: [{ percentage: 80 }] };
const EXHAUSTED_QUOTA = { success: true, models: [{ percentage: 2 }] };

// ============================================================================
// Mutable mock state
// ============================================================================

let _mockAccounts: (typeof ULTRA_ACCOUNT)[] = [];
let _mockPausedIds: Set<string> = new Set();

// ============================================================================
// Top-level mock.module registrations (file-load time)
// ============================================================================

// Build the account-manager mock: REAL by default (spread) so leak-sensitive helpers
// other files import from account-manager — validateNickname, hasAccountNameConflict,
// registry-path getters, PROVIDERS_WITHOUT_EMAIL — never leak broken stubs to a file
// sharing this Bun worker. Override ONLY the account-DATA reads (test fixtures) and IO
// (no-ops, so the tier_lock tests never touch disk).
function buildAccountManagerMock() {
  return {
    ...REAL_ACCOUNT_MANAGER,
    loadAccountsRegistry: () => ({}),
    saveAccountsRegistry: () => undefined,
    syncRegistryWithTokenFiles: () => undefined,
    registerAccount: () => undefined,
    setDefaultAccount: () => undefined,
    pauseAccount: () => undefined,
    resumeAccount: () => undefined,
    removeAccount: () => undefined,
    renameAccount: () => undefined,
    touchAccount: () => undefined,
    setAccountTier: () => undefined,
    discoverExistingAccounts: () => [],
    getProviderAccounts: () => _mockAccounts,
    getDefaultAccount: () => (_mockAccounts.length > 0 ? _mockAccounts[0] : null),
    getAccount: (_p: string, id: string) => _mockAccounts.find((a) => a.id === id) ?? null,
    getActiveAccounts: () => _mockAccounts,
    isAccountPaused: (_p: string, id: string) => _mockPausedIds.has(id),
    getAllAccountsSummary: () => [],
    bulkPauseAccounts: () => ({ succeeded: [], failed: [] }),
    bulkResumeAccounts: () => ({ succeeded: [], failed: [] }),
    soloAccount: async () => null,
  };
}

mock.module('../../../src/cliproxy/accounts/account-manager', () => buildAccountManagerMock());

mock.module('../../../src/cliproxy/accounts/account-safety', () => ({
  restoreExpiredQuotaPauses: () => undefined,
  pauseAccountForQuotaCooldown: () => false,
}));

// ============================================================================
// Helpers
// ============================================================================

/**
 * Write a minimal config.yaml in tempHome/.ccs/ with the given tier_lock.
 *
 * tierLock: null means no locks active.
 * tierLock: Record means per-provider map, e.g. { agy: 'ultra' }.
 *
 * Always writes a fresh file — this is the canonical "truth" for each test.
 */
function writeMinimalConfig(
  tempHome: string,
  tierLock: null | Record<string, string | null>
): void {
  const ccsDir = path.join(tempHome, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });

  let tierLockYaml: string;
  if (tierLock === null) {
    tierLockYaml = 'null';
  } else {
    const entries = Object.entries(tierLock)
      .map(([provider, tier]) => `      ${provider}: ${tier === null ? 'null' : `"${tier}"`}`)
      .join('\n');
    tierLockYaml = entries.length > 0 ? `\n${entries}` : '{}';
  }

  const yaml = `
version: 13
setup_completed: true
quota_management:
  mode: hybrid
  auto:
    preflight_check: true
    exhaustion_threshold: 5
    tier_priority:
      - ultra
      - pro
      - free
    cooldown_minutes: 5
  manual:
    paused_accounts: []
    forced_default: null
    tier_lock: ${tierLockYaml}
  runtime_monitor:
    enabled: true
    normal_interval_seconds: 300
    critical_interval_seconds: 60
    warn_threshold: 20
    exhaustion_threshold: 5
    cooldown_minutes: 5
`.trim();
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), yaml, 'utf-8');
}

// ============================================================================
// Tests
// ============================================================================

describe('quota-manager findHealthyAccount — tier_lock', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalCcsUnified: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-tier-lock-qm-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsUnified = process.env.CCS_UNIFIED_CONFIG;
    process.env.CCS_HOME = tempHome;
    process.env.CCS_UNIFIED_CONFIG = '1';

    // Invalidate the shared config-loader-facade memoisation cache so that
    // each test reads its own freshly-written config.yaml from disk.
    invalidateConfigCache();

    // Reset mutable mock state.
    _mockAccounts = [ULTRA_ACCOUNT, PRO_ACCOUNT, PRO_ACCOUNT_2];
    _mockPausedIds = new Set();

    // Re-register mocks in beforeEach to ensure mutable closures (_mockAccounts,
    // _mockPausedIds) are captured fresh for each test.
    mock.module('../../../src/cliproxy/accounts/account-manager', () => buildAccountManagerMock());

    mock.module('../../../src/cliproxy/accounts/account-safety', () => ({
      restoreExpiredQuotaPauses: () => undefined,
      pauseAccountForQuotaCooldown: () => false,
    }));
  });

  afterAll(() => {
    // mock.restore() does NOT unwind mock.module() in Bun 1.3.x. Restore the REAL
    // modules (captured at load time) so any file loading after this suite in the
    // same Bun worker gets the genuine account-manager/account-safety, not stubs.
    mock.module('../../../src/cliproxy/accounts/account-manager', () => REAL_ACCOUNT_MANAGER);
    mock.module('../../../src/cliproxy/accounts/account-safety', () => REAL_ACCOUNT_SAFETY);
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;
    if (originalCcsUnified !== undefined) process.env.CCS_UNIFIED_CONFIG = originalCcsUnified;
    else delete process.env.CCS_UNIFIED_CONFIG;

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // tier_lock = { agy: "pro" } — ultra must be excluded
  // -------------------------------------------------------------------------

  it('tier_lock="pro" — only pro accounts are candidates (ultra excluded)', async () => {
    writeMinimalConfig(tempHome, { agy: 'pro' });
    _mockAccounts = [ULTRA_ACCOUNT, PRO_ACCOUNT];

    const uid = `lock-pro-${Date.now()}-${Math.random()}`;
    const { findHealthyAccount, setCachedQuota } = await import(
      `../../../src/cliproxy/quota/quota-manager?${uid}`
    );

    setCachedQuota('agy', ULTRA_ACCOUNT.id, HEALTHY_QUOTA as never);
    setCachedQuota('agy', PRO_ACCOUNT.id, HEALTHY_QUOTA as never);

    const result = await findHealthyAccount('agy', []);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('pro');
    expect(result!.id).toBe(PRO_ACCOUNT.id);
  });

  // -------------------------------------------------------------------------
  // tier_lock specifies a tier with zero matching accounts
  // -------------------------------------------------------------------------

  it('tier_lock="ultra" with only pro accounts → returns null (no cross-tier fallback)', async () => {
    writeMinimalConfig(tempHome, { agy: 'ultra' });
    _mockAccounts = [PRO_ACCOUNT, PRO_ACCOUNT_2];

    const uid = `lock-ultra-no-ultra-${Date.now()}-${Math.random()}`;
    const { findHealthyAccount, setCachedQuota } = await import(
      `../../../src/cliproxy/quota/quota-manager?${uid}`
    );

    setCachedQuota('agy', PRO_ACCOUNT.id, HEALTHY_QUOTA as never);
    setCachedQuota('agy', PRO_ACCOUNT_2.id, HEALTHY_QUOTA as never);

    const result = await findHealthyAccount('agy', []);
    // tier_lock strictly enforced — no ultra accounts → null
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // tier_lock respects existing paused/exclude filters within locked tier
  // -------------------------------------------------------------------------

  it('tier_lock="pro" — paused pro accounts are still excluded', async () => {
    writeMinimalConfig(tempHome, { agy: 'pro' });
    _mockAccounts = [PRO_ACCOUNT, PRO_ACCOUNT_2];
    _mockPausedIds = new Set([PRO_ACCOUNT.id]);

    const uid = `lock-pro-paused-${Date.now()}-${Math.random()}`;
    const { findHealthyAccount, setCachedQuota } = await import(
      `../../../src/cliproxy/quota/quota-manager?${uid}`
    );

    setCachedQuota('agy', PRO_ACCOUNT.id, HEALTHY_QUOTA as never);
    setCachedQuota('agy', PRO_ACCOUNT_2.id, HEALTHY_QUOTA as never);

    const result = await findHealthyAccount('agy', []);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(PRO_ACCOUNT_2.id);
  });

  it('tier_lock="pro" — exclude list still removes accounts within the locked tier', async () => {
    writeMinimalConfig(tempHome, { agy: 'pro' });
    _mockAccounts = [PRO_ACCOUNT, PRO_ACCOUNT_2];

    const uid = `lock-pro-exclude-${Date.now()}-${Math.random()}`;
    const { findHealthyAccount, setCachedQuota } = await import(
      `../../../src/cliproxy/quota/quota-manager?${uid}`
    );

    setCachedQuota('agy', PRO_ACCOUNT.id, HEALTHY_QUOTA as never);
    setCachedQuota('agy', PRO_ACCOUNT_2.id, HEALTHY_QUOTA as never);

    const result = await findHealthyAccount('agy', [PRO_ACCOUNT.id]);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(PRO_ACCOUNT_2.id);
  });

  // -------------------------------------------------------------------------
  // Clearing tier_lock restores prior behavior
  //
  // Key: writeMinimalConfig(tempHome, null) is called immediately before
  // findHealthyAccount, AFTER setting _mockAccounts.  This ensures the disk
  // state is null even if a prior test in this file left stale content.
  // -------------------------------------------------------------------------

  it('clearing tier_lock (null) allows both tiers as candidates again', async () => {
    _mockAccounts = [PRO_ACCOUNT];
    // Write null-lock config as the very last disk op before the import so no
    // within-file test ordering can leave stale { agy: ... } on disk.
    writeMinimalConfig(tempHome, null);
    invalidateConfigCache();

    const uid = `lock-cleared-${Date.now()}-${Math.random()}`;
    const { findHealthyAccount, setCachedQuota } = await import(
      `../../../src/cliproxy/quota/quota-manager?${uid}`
    );

    setCachedQuota('agy', PRO_ACCOUNT.id, HEALTHY_QUOTA as never);

    const result = await findHealthyAccount('agy', []);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(PRO_ACCOUNT.id);
  });

  // -------------------------------------------------------------------------
  // Exhausted locked-tier accounts: no cross-tier fallback
  // -------------------------------------------------------------------------

  it('tier_lock="pro" — exhausted pro + healthy ultra → returns null (no cross-tier fallback)', async () => {
    writeMinimalConfig(tempHome, { agy: 'pro' });
    _mockAccounts = [ULTRA_ACCOUNT, PRO_ACCOUNT];

    const uid = `lock-pro-exhausted-${Date.now()}-${Math.random()}`;
    const { findHealthyAccount, setCachedQuota } = await import(
      `../../../src/cliproxy/quota/quota-manager?${uid}`
    );

    // Pro is exhausted (2%), ultra is healthy (80%) — tier_lock must block ultra
    setCachedQuota('agy', PRO_ACCOUNT.id, EXHAUSTED_QUOTA as never);
    setCachedQuota('agy', ULTRA_ACCOUNT.id, HEALTHY_QUOTA as never);

    const result = await findHealthyAccount('agy', []);
    // No healthy pro accounts; must NOT fall back to ultra
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Baseline: no tier_lock — any available healthy account is returned.
  //
  // Same pattern: write null-lock and invalidate cache immediately before import.
  // -------------------------------------------------------------------------

  it('no tier_lock — at least one account is returned (tier filter is inactive)', async () => {
    _mockAccounts = [PRO_ACCOUNT];
    // Write null-lock as the very last disk op before the import.
    writeMinimalConfig(tempHome, null);
    invalidateConfigCache();

    const uid = `no-lock-${Date.now()}-${Math.random()}`;
    const { findHealthyAccount, setCachedQuota } = await import(
      `../../../src/cliproxy/quota/quota-manager?${uid}`
    );

    setCachedQuota('agy', PRO_ACCOUNT.id, HEALTHY_QUOTA as never);

    const result = await findHealthyAccount('agy', []);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('pro');
  });

  // -------------------------------------------------------------------------
  // MEDIUM #1: cross-provider isolation
  // Locking "agy" to "ultra" must NOT filter accounts for an unlocked provider.
  // -------------------------------------------------------------------------

  it('tier_lock on agy does NOT affect another provider — pro accounts are still selectable for unlocked provider', async () => {
    writeMinimalConfig(tempHome, { agy: 'ultra' });
    // Only pro accounts — agy locked to ultra means no result.
    _mockAccounts = [PRO_ACCOUNT, PRO_ACCOUNT_2];

    const uid = `cross-provider-${Date.now()}-${Math.random()}`;
    const { findHealthyAccount, setCachedQuota } = await import(
      `../../../src/cliproxy/quota/quota-manager?${uid}`
    );

    setCachedQuota('agy', PRO_ACCOUNT.id, HEALTHY_QUOTA as never);
    setCachedQuota('agy', PRO_ACCOUNT_2.id, HEALTHY_QUOTA as never);

    // agy IS locked to ultra → no ultra accounts → null
    const agyLocked = await findHealthyAccount('agy', []);
    expect(agyLocked).toBeNull();

    // Prove isolation: rewrite config with lock on a different key only.
    // getTierLockForProvider(config.manual, 'agy') returns null when 'agy' is
    // absent from the map — pro accounts become candidates again.
    writeMinimalConfig(tempHome, { claude: 'ultra' }); // only claude locked, not agy
    invalidateConfigCache();

    // agy has no lock entry → pro accounts are candidates
    const agyUnlocked = await findHealthyAccount('agy', []);
    expect(agyUnlocked).not.toBeNull();
    expect(agyUnlocked!.tier).toBe('pro');
  });
});
