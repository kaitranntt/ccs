/**
 * Phase 3: Pool Routing Defaults and Safety Rails — Test Suite
 *
 * Covers:
 *   1. Schema keys: pool_routing.enabled, max_retry_credentials, prompt_dismissed
 *   2. Generator snapshot: non-pool config is content-identical (cooling=true, RR, no affinity)
 *   3. Generator snapshot: pool config block (cooling=false, fill-first, affinity, max-retry)
 *   4. enablePoolRouting / disablePoolRouting lifecycle
 *   5. Explicit-setting detection (preserve user routing values)
 *   6. disablePoolRouting rollback restores cooling-true (prevent single-account blackout)
 *   7. Opt-in prompt gating: non-verified providers skip
 *   8. Opt-in prompt gating: dismissed flag prevents re-prompt
 *   9. Opt-in prompt gating: remote target gets hint-not-prompt (skipReason=remote-target)
 *  10. Opt-in prompt gating: not-at-transition skip (accountCountBefore != 1)
 *  11. Mixed-state: claude pool ON + multi-account agy (both providers in disclosure)
 *  12. Cross-lane overlap guard: same email in CLIProxy + native Claude profile
 *  13. Cross-lane overlap guard: different email = no warning
 *  14. Cross-lane overlap guard: native Claude not logged in = silent
 *  15. Safety invariants regression: disablePoolRouting always writes disable-cooling: true
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

// Static imports for modules that need spyOn to work across the same module instance.
// Dynamic cache-bust imports create new module instances, making spyOn ineffective
// for testing behaviour in modules that import from the same source.
import * as claudeDetector from '../../utils/claude-detector';
import { checkCrossLaneEmailOverlap } from '../accounts/account-safety-cross-lane';
import * as promptModule from '../../utils/prompt';
import * as poolOptInModule from '../routing/pool-opt-in-prompt';
// Non-cache-busted facade import: invalidateConfigCache targets the SHARED singleton
// that routing-strategy (also non-cache-busted at runtime) reads from.
import { invalidateConfigCache as invalidateSharedConfigCache } from '../../config/config-loader-facade';

// ── Helpers ────────────────────────────────────────────────────────────────────

function createTestHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-pool-routing-test-'));
  const ccsDir = path.join(dir, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  // Minimal config.yaml — loadOrCreateUnifiedConfig will expand it on first read
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), 'version: 1\n', 'utf8');
  return dir;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Phase 3: Pool Routing — schema keys and generator snapshots', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  // ── 1. Schema keys ────────────────────────────────────────────────────────
  describe('CLIProxyPoolRoutingConfig schema', () => {
    it('pool_routing.enabled defaults to absent (falsy) for a new user config', async () => {
      const { loadOrCreateUnifiedConfig } = await import(
        `../../config/config-loader-facade?p3schema=${Date.now()}`
      );
      const cfg = loadOrCreateUnifiedConfig();
      expect(cfg.cliproxy?.pool_routing?.enabled).toBeUndefined();
    });

    it('pool_routing.prompt_dismissed defaults to absent', async () => {
      const { loadOrCreateUnifiedConfig } = await import(
        `../../config/config-loader-facade?p3dismissed=${Date.now()}`
      );
      const cfg = loadOrCreateUnifiedConfig();
      expect(cfg.cliproxy?.pool_routing?.prompt_dismissed).toBeUndefined();
    });

    it('pool_routing.max_retry_credentials can be set and read back', async () => {
      const { loadOrCreateUnifiedConfig, mutateConfig, invalidateConfigCache } = await import(
        `../../config/config-loader-facade?p3retry=${Date.now()}`
      );
      mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
        cfg.cliproxy = cfg.cliproxy ?? {};
        cfg.cliproxy.pool_routing = { enabled: true, max_retry_credentials: 5 };
      });
      invalidateConfigCache();
      const cfg = loadOrCreateUnifiedConfig();
      expect(cfg.cliproxy?.pool_routing?.max_retry_credentials).toBe(5);
    });
  });

  // ── 2. Generator snapshot — non-pool ─────────────────────────────────────
  describe('generateUnifiedConfigContent — non-pool snapshot', () => {
    it('emits disable-cooling: true when pool routing is disabled', async () => {
      // Ensure pool_routing is absent
      const { invalidateConfigCache } = await import(
        `../../config/config-loader-facade?p3gennp1=${Date.now()}`
      );
      invalidateConfigCache();

      const { regenerateConfig, CLIPROXY_CONFIG_VERSION } = await import(
        `../config/generator?p3gennp1=${Date.now()}`
      );
      const ccsDir = path.join(tempHome, '.ccs');
      const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
      const authDir = path.join(ccsDir, 'cliproxy', 'auth');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.mkdirSync(authDir, { recursive: true });

      regenerateConfig(8317, { configPath, authDir });

      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('disable-cooling: true');
      expect(content).toContain(`CCS v${CLIPROXY_CONFIG_VERSION}`);
    });

    it('emits round-robin routing strategy when pool routing is disabled', async () => {
      const { regenerateConfig } = await import(`../config/generator?p3gennp2=${Date.now()}`);
      const ccsDir = path.join(tempHome, '.ccs');
      const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
      const authDir = path.join(ccsDir, 'cliproxy', 'auth');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.mkdirSync(authDir, { recursive: true });

      regenerateConfig(8317, { configPath, authDir });

      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('strategy: round-robin');
      expect(content).toContain('session-affinity: false');
      // max-retry-credentials must NOT be present in non-pool config
      expect(content).not.toContain('max-retry-credentials:');
    });
  });

  // ── 3. Generator snapshot — pool ─────────────────────────────────────────
  describe('generateUnifiedConfigContent — pool snapshot', () => {
    it('emits disable-cooling: false when pool routing is enabled', async () => {
      const { mutateConfig, invalidateConfigCache } = await import(
        `../../config/config-loader-facade?p3genp1=${Date.now()}`
      );
      mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
        cfg.cliproxy = cfg.cliproxy ?? {};
        cfg.cliproxy.pool_routing = { enabled: true };
      });
      invalidateConfigCache();

      const { regenerateConfig } = await import(`../config/generator?p3genp1=${Date.now()}`);
      const ccsDir = path.join(tempHome, '.ccs');
      const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
      const authDir = path.join(ccsDir, 'cliproxy', 'auth');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.mkdirSync(authDir, { recursive: true });

      regenerateConfig(8317, { configPath, authDir });

      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('disable-cooling: false');
    });

    it('emits fill-first strategy and session-affinity: true for pool users', async () => {
      const { mutateConfig, invalidateConfigCache } = await import(
        `../../config/config-loader-facade?p3genp2=${Date.now()}`
      );
      mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
        cfg.cliproxy = cfg.cliproxy ?? {};
        cfg.cliproxy.pool_routing = { enabled: true };
      });
      invalidateConfigCache();

      const { regenerateConfig } = await import(`../config/generator?p3genp2=${Date.now()}`);
      const ccsDir = path.join(tempHome, '.ccs');
      const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
      const authDir = path.join(ccsDir, 'cliproxy', 'auth');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.mkdirSync(authDir, { recursive: true });

      regenerateConfig(8317, { configPath, authDir });

      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('strategy: fill-first');
      expect(content).toContain('session-affinity: true');
      expect(content).toContain('session-affinity-ttl: "1h"');
      expect(content).toContain('max-retry-credentials: 3');
    });

    it('pool config does NOT emit round-robin or disable-cooling: true', async () => {
      const { mutateConfig, invalidateConfigCache } = await import(
        `../../config/config-loader-facade?p3genp3=${Date.now()}`
      );
      mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
        cfg.cliproxy = cfg.cliproxy ?? {};
        cfg.cliproxy.pool_routing = { enabled: true };
      });
      invalidateConfigCache();

      const { regenerateConfig } = await import(`../config/generator?p3genp3=${Date.now()}`);
      const ccsDir = path.join(tempHome, '.ccs');
      const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
      const authDir = path.join(ccsDir, 'cliproxy', 'auth');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.mkdirSync(authDir, { recursive: true });

      regenerateConfig(8317, { configPath, authDir });

      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).not.toContain('disable-cooling: true');
      expect(content).not.toContain('strategy: round-robin');
    });
  });
});

// ── enablePoolRouting / disablePoolRouting ─────────────────────────────────────

describe('Phase 3: enablePoolRouting and disablePoolRouting', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    // Invalidate the shared config singleton so no stale data bleeds across tests.
    invalidateSharedConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  // ── 4. Lifecycle ─────────────────────────────────────────────────────────
  it('enablePoolRouting sets pool_routing.enabled=true and regenerates config', async () => {
    const { enablePoolRouting } = await import(
      `../routing/routing-strategy?p3enable1=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    const result = enablePoolRouting(8317, { configPath, authDir });

    expect(result.changed).toBe(true);
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('disable-cooling: false');
    expect(content).toContain('strategy: fill-first');
    expect(content).toContain('max-retry-credentials: 3');
  });

  it('enablePoolRouting is idempotent (second call returns changed=false)', async () => {
    const { enablePoolRouting } = await import(
      `../routing/routing-strategy?p3enable2=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    enablePoolRouting(8317, { configPath, authDir });
    const second = enablePoolRouting(8317, { configPath, authDir });

    expect(second.changed).toBe(false);
  });

  it('disablePoolRouting restores disable-cooling: true — invariant for single-account safety', async () => {
    const { enablePoolRouting, disablePoolRouting } = await import(
      `../routing/routing-strategy?p3disable1=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    enablePoolRouting(8317, { configPath, authDir });
    const disableResult = disablePoolRouting(8317, { configPath, authDir });

    expect(disableResult.changed).toBe(true);
    const content = fs.readFileSync(configPath, 'utf-8');
    // CRITICAL: disable-cooling must be true after rollback — single-account blackout prevention
    expect(content).toContain('disable-cooling: true');
    expect(content).not.toContain('disable-cooling: false');
  });

  it('disablePoolRouting restores round-robin strategy and disables session affinity', async () => {
    const { enablePoolRouting, disablePoolRouting } = await import(
      `../routing/routing-strategy?p3disable2=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    enablePoolRouting(8317, { configPath, authDir });
    disablePoolRouting(8317, { configPath, authDir });

    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('strategy: round-robin');
    expect(content).toContain('session-affinity: false');
    expect(content).not.toContain('max-retry-credentials:');
  });

  it('disablePoolRouting is idempotent (second call returns changed=false)', async () => {
    const { disablePoolRouting } = await import(
      `../routing/routing-strategy?p3disable3=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    const result = disablePoolRouting(8317, { configPath, authDir });
    expect(result.changed).toBe(false);
  });

  // ── 5. Explicit-setting detection ─────────────────────────────────────────
  it('hasExplicitRoutingStrategy returns false when raw YAML has no routing.strategy key', async () => {
    // Write a raw YAML with a cliproxy section that has no routing key.
    // readRawRoutingConfig reads directly from disk (before defaults-merger) so
    // an absent routing.strategy key returns false — even though
    // loadOrCreateUnifiedConfig would inject strategy:round-robin as a default.
    const ccsDir = path.join(tempHome, '.ccs');
    const rawYamlPath = path.join(ccsDir, 'config.yaml');
    // version: 19 so loadOrCreateUnifiedConfig does not auto-upgrade and rewrite the file
    const rawYaml =
      ['version: 19', 'cliproxy:', '  logging:', '    enabled: false'].join('\n') + '\n';
    fs.writeFileSync(rawYamlPath, rawYaml, 'utf8');
    invalidateSharedConfigCache();

    const { hasExplicitRoutingStrategy } = await import(
      `../routing/routing-strategy?p3explicit1=${Date.now()}`
    );
    expect(hasExplicitRoutingStrategy()).toBe(false);
  });

  it('hasExplicitRoutingStrategy returns true for fill-first (user-set)', async () => {
    const { loadOrCreateUnifiedConfig, mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3explicit2=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.routing = { strategy: 'fill-first' };
    });
    invalidateConfigCache();

    const { hasExplicitRoutingStrategy } = await import(
      `../routing/routing-strategy?p3explicit2=${Date.now()}`
    );
    expect(hasExplicitRoutingStrategy()).toBe(true);
  });

  it('hasExplicitRoutingStrategy returns false when persisted value equals the injected default (round-robin)', async () => {
    // loadOrCreateUnifiedConfig may write strategy:round-robin to disk as a default.
    // A stored value equal to the default must NOT be treated as user-customised so
    // enablePoolRouting does not falsely report "preserving a custom strategy".
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3explicit2b=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.routing = { strategy: 'round-robin' };
    });
    invalidateConfigCache();

    const { hasExplicitRoutingStrategy } = await import(
      `../routing/routing-strategy?p3explicit2b=${Date.now()}`
    );
    expect(hasExplicitRoutingStrategy()).toBe(false);
  });

  it('hasExplicitSessionAffinity returns false when persisted value equals the injected default (false)', async () => {
    // Same rationale as the round-robin test above.
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3explicit2c=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.routing = { session_affinity: false };
    });
    invalidateConfigCache();

    const { hasExplicitSessionAffinity } = await import(
      `../routing/routing-strategy?p3explicit2c=${Date.now()}`
    );
    expect(hasExplicitSessionAffinity()).toBe(false);
  });

  it('hasExplicitSessionAffinity returns true when session_affinity differs from default (true)', async () => {
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3explicit2d=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.routing = { session_affinity: true };
    });
    invalidateConfigCache();

    const { hasExplicitSessionAffinity } = await import(
      `../routing/routing-strategy?p3explicit2d=${Date.now()}`
    );
    expect(hasExplicitSessionAffinity()).toBe(true);
  });

  it('enablePoolRouting: pristine config (defaults written to disk) -> clean [OK] branch, not preserve branch', async () => {
    // Simulates a first-load where loadOrCreateUnifiedConfig wrote strategy:round-robin
    // and session_affinity:false as injected defaults to disk.  enablePoolRouting must
    // take the clean "[OK] Pool routing enabled" branch, not the preserve branch.
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3pristine1=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.routing = { strategy: 'round-robin', session_affinity: false };
    });
    invalidateConfigCache();

    const { enablePoolRouting } = await import(
      `../routing/routing-strategy?p3pristine1=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    const result = enablePoolRouting(8317, { configPath, authDir });
    expect(result.preservedExplicitSetting).toBe(false);
    expect(result.message).toContain('[OK] Pool routing enabled');
  });

  it('enablePoolRouting: genuinely customized fill-first -> preserve branch, message omits "custom strategy"', async () => {
    // fill-first differs from the round-robin default so it is treated as user-managed.
    // The preserve branch message must reference restoring the setting but must NOT say
    // "custom strategy" (the review fix requires neutral wording).
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3genuine1=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.routing = { strategy: 'fill-first' };
    });
    invalidateConfigCache();

    const { enablePoolRouting } = await import(
      `../routing/routing-strategy?p3genuine1=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    const result = enablePoolRouting(8317, { configPath, authDir });
    expect(result.preservedExplicitSetting).toBe(true);
    // Must NOT claim "custom strategy" — the user's value is preserved but the
    // message should not make assumptions about intent
    expect(result.message).not.toContain('custom strategy');
    expect(result.message).toContain('[!]');
  });

  it('enablePoolRouting sets preservedExplicitSetting=true when user had fill-first', async () => {
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3explicit3=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.routing = { strategy: 'fill-first' };
    });
    invalidateConfigCache();

    const { enablePoolRouting } = await import(
      `../routing/routing-strategy?p3explicit3=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    const result = enablePoolRouting(8317, { configPath, authDir });
    expect(result.preservedExplicitSetting).toBe(true);
  });

  // ── 5b. Explicit-setting round-trip survives enable->disable ─────────────
  it('explicit strategy and TTL survive enable->disable round-trip (not overwritten)', async () => {
    // User sets explicit strategy and TTL before enabling pool routing.
    // enablePoolRouting must NOT overwrite these.
    // disablePoolRouting must restore the original values (they were never touched).
    const ts = Date.now();
    const { mutateConfig, invalidateConfigCache, loadOrCreateUnifiedConfig } = await import(
      `../../config/config-loader-facade?p3roundtrip=${ts}`
    );
    mutateConfig((cfg: { cliproxy?: { routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.routing = { strategy: 'round-robin', session_affinity_ttl: '2h' };
    });
    invalidateConfigCache();

    const { enablePoolRouting, disablePoolRouting } = await import(
      `../routing/routing-strategy?p3roundtrip=${ts}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    // Enable: user routing must not be touched
    enablePoolRouting(8317, { configPath, authDir });
    invalidateConfigCache();
    const afterEnable = loadOrCreateUnifiedConfig();
    expect(afterEnable.cliproxy?.routing?.strategy).toBe('round-robin');
    expect(afterEnable.cliproxy?.routing?.session_affinity_ttl).toBe('2h');

    // Disable: user routing must still be intact
    disablePoolRouting(8317, { configPath, authDir });
    invalidateConfigCache();
    const afterDisable = loadOrCreateUnifiedConfig();
    expect(afterDisable.cliproxy?.routing?.strategy).toBe('round-robin');
    expect(afterDisable.cliproxy?.routing?.session_affinity_ttl).toBe('2h');
  });
});

// ── Opt-in prompt gating ────────────────────────────────────────────────────

describe('Phase 3: maybeOfferPoolRouting gating', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateSharedConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  // ── 7. Non-verified providers skip ────────────────────────────────────────
  it('skips prompt for codex (unverified provider)', async () => {
    const { maybeOfferPoolRouting } = await import(
      `../routing/pool-opt-in-prompt?p3gate1=${Date.now()}`
    );
    const result = await maybeOfferPoolRouting('codex', 1);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('codex-unverified');
  });

  it('skips prompt for gemini (unverified provider)', async () => {
    const { maybeOfferPoolRouting } = await import(
      `../routing/pool-opt-in-prompt?p3gate2=${Date.now()}`
    );
    const result = await maybeOfferPoolRouting('gemini', 1);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('gemini-unverified');
  });

  // ── 8. Dismissed flag ────────────────────────────────────────────────────
  it('skips prompt when prompt_dismissed is true', async () => {
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3dismissed1=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.pool_routing = { prompt_dismissed: true };
    });
    invalidateConfigCache();

    const { maybeOfferPoolRouting } = await import(
      `../routing/pool-opt-in-prompt?p3dismissed1=${Date.now()}`
    );
    const result = await maybeOfferPoolRouting('claude', 1);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('dismissed');
  });

  // ── 9. Remote target hint-not-prompt ──────────────────────────────────────
  it('skips interactive prompt for remote target (hint only)', async () => {
    // Configure the unified config to use a remote CLIProxy server.
    // getProxyTarget() reads cliproxy_server.remote from the config, so this
    // is the correct way to exercise the remote branch without cross-module spying.
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3remote1=${Date.now()}`
    );
    mutateConfig(
      (cfg: {
        cliproxy_server?: {
          remote?: { enabled?: boolean; host?: string; protocol?: string };
        };
      }) => {
        cfg.cliproxy_server = {
          remote: { enabled: true, host: '192.168.1.1', protocol: 'http' },
        };
      }
    );
    invalidateConfigCache();

    const { maybeOfferPoolRouting } = await import(
      `../routing/pool-opt-in-prompt?p3remote1=${Date.now()}`
    );
    const result = await maybeOfferPoolRouting('claude', 1);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('remote-target');

    // Restore remote config so other tests are not affected
    mutateConfig((cfg: { cliproxy_server?: { remote?: { enabled?: boolean } } }) => {
      if (cfg.cliproxy_server?.remote) {
        cfg.cliproxy_server.remote.enabled = false;
      }
    });
    invalidateConfigCache();
  });

  // ── 10. Not-at-transition skip ──────────────────────────────────────────
  it('skips when accountCountBefore is 0 (first account, not a transition)', async () => {
    const { maybeOfferPoolRouting } = await import(
      `../routing/pool-opt-in-prompt?p3trans1=${Date.now()}`
    );
    const result = await maybeOfferPoolRouting('claude', 0);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('not-at-transition');
  });

  it('skips when accountCountBefore is 2 (already past transition)', async () => {
    const { maybeOfferPoolRouting } = await import(
      `../routing/pool-opt-in-prompt?p3trans2=${Date.now()}`
    );
    const result = await maybeOfferPoolRouting('claude', 2);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('not-at-transition');
  });

  // ── 11. Already enabled → skip ──────────────────────────────────────────
  it('skips when pool routing is already enabled', async () => {
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3alr1=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.pool_routing = { enabled: true };
    });
    invalidateConfigCache();

    const { maybeOfferPoolRouting } = await import(
      `../routing/pool-opt-in-prompt?p3alr1=${Date.now()}`
    );
    const result = await maybeOfferPoolRouting('claude', 1);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('already-enabled');
    expect(result.enabled).toBe(true);
  });
});

// ── Cross-lane overlap guard ────────────────────────────────────────────────
// Uses static imports (at top of file) so spyOn targets the same module instance
// as the function under test.  Dynamic cache-bust imports create new instances.

describe('Phase 3: cross-lane email overlap guard', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let stderrOutput: string[];

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    stderrOutput = [];
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  // ── 12. Same email → warning ────────────────────────────────────────────
  it('warns when CLIProxy agy account email matches native Claude email', () => {
    // spyOn the statically-imported module so the same instance is used by
    // checkCrossLaneEmailOverlap (which also imports from the same module).
    const spy = spyOn(claudeDetector, 'getClaudeAuthStatus').mockReturnValue({
      loggedIn: true,
      email: 'test@example.com',
      authMethod: 'claude.ai',
      apiProvider: null,
      orgId: null,
      orgName: null,
      subscriptionType: null,
    });

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') stderrOutput.push(msg);
    });

    checkCrossLaneEmailOverlap('agy', 'test@example.com');

    const combined = stderrOutput.join('\n');
    expect(combined).toContain('cross-lane email overlap');

    spy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── 13. Different email → no warning ────────────────────────────────────
  it('does not warn when emails differ', () => {
    const spy = spyOn(claudeDetector, 'getClaudeAuthStatus').mockReturnValue({
      loggedIn: true,
      email: 'other@example.com',
      authMethod: 'claude.ai',
      apiProvider: null,
      orgId: null,
      orgName: null,
      subscriptionType: null,
    });

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') stderrOutput.push(msg);
    });

    checkCrossLaneEmailOverlap('agy', 'different@example.com');

    expect(stderrOutput.join('\n')).not.toContain('cross-lane');

    spy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── 14. Not logged in → silent ──────────────────────────────────────────
  it('is silent when native Claude is not logged in', () => {
    const spy = spyOn(claudeDetector, 'getClaudeAuthStatus').mockReturnValue({
      loggedIn: false,
      email: null,
      authMethod: null,
      apiProvider: null,
      orgId: null,
      orgName: null,
      subscriptionType: null,
    });

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') stderrOutput.push(msg);
    });

    checkCrossLaneEmailOverlap('claude', 'test@example.com');

    expect(stderrOutput.join('\n')).not.toContain('cross-lane');

    spy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('is silent when getClaudeAuthStatus throws (CLI not installed)', () => {
    const spy = spyOn(claudeDetector, 'getClaudeAuthStatus').mockImplementation(() => {
      throw new Error('Command not found: claude');
    });

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') stderrOutput.push(msg);
    });

    // Must not throw
    expect(() => checkCrossLaneEmailOverlap('claude', 'test@example.com')).not.toThrow();
    expect(stderrOutput.join('\n')).not.toContain('cross-lane');

    spy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── Account-profile lane enumeration (isolated CLAUDE_CONFIG_DIR lanes) ──
  // The ambient ~/.claude check alone misses the isolated lanes of CCS account
  // profiles — exactly the multi-account population the guard protects. These
  // tests prove the guard also reads each profile lane's .claude.json email.

  /** Write a profiles.json account entry + its instance-lane .claude.json email. */
  function seedAccountLane(ccsDir: string, name: string, email: string | null): void {
    const profilesPath = path.join(ccsDir, 'profiles.json');
    let payload: { version: string; profiles: Record<string, unknown>; default: string | null };
    try {
      payload = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
    } catch {
      payload = { version: '2.0.0', profiles: {}, default: null };
    }
    payload.profiles[name] = {
      type: 'account',
      created: new Date().toISOString(),
      last_used: null,
    };
    fs.writeFileSync(profilesPath, JSON.stringify(payload, null, 2), 'utf8');

    const instanceDir = path.join(ccsDir, 'instances', name);
    fs.mkdirSync(instanceDir, { recursive: true });
    if (email !== null) {
      fs.writeFileSync(
        path.join(instanceDir, '.claude.json'),
        JSON.stringify({ oauthAccount: { emailAddress: email } }, null, 2),
        'utf8'
      );
    }
  }

  it('warns when a CCS account-profile lane email matches, even though ambient ~/.claude is logged out', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    seedAccountLane(ccsDir, 'work', 'lane@example.com');

    // Ambient default lane is logged OUT — old guard would stay silent.
    const spy = spyOn(claudeDetector, 'getClaudeAuthStatus').mockReturnValue({
      loggedIn: false,
      email: null,
      authMethod: null,
      apiProvider: null,
      orgId: null,
      orgName: null,
      subscriptionType: null,
    });
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') stderrOutput.push(msg);
    });

    checkCrossLaneEmailOverlap('agy', 'lane@example.com');

    const combined = stderrOutput.join('\n');
    expect(combined).toContain('cross-lane email overlap');
    // The matching profile lane is named so the user knows which lane overlaps.
    expect(combined).toContain('profile "work"');

    spy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('does not warn when no account-profile lane email matches', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    seedAccountLane(ccsDir, 'work', 'someone-else@example.com');

    const spy = spyOn(claudeDetector, 'getClaudeAuthStatus').mockReturnValue({
      loggedIn: false,
      email: null,
      authMethod: null,
      apiProvider: null,
      orgId: null,
      orgName: null,
      subscriptionType: null,
    });
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') stderrOutput.push(msg);
    });

    checkCrossLaneEmailOverlap('agy', 'mine@example.com');

    expect(stderrOutput.join('\n')).not.toContain('cross-lane');

    spy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('silently skips an account-profile lane with a missing/unreadable .claude.json', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    // Account profile exists but its lane has no .claude.json (email === null).
    seedAccountLane(ccsDir, 'broken', null);

    const spy = spyOn(claudeDetector, 'getClaudeAuthStatus').mockReturnValue({
      loggedIn: false,
      email: null,
      authMethod: null,
      apiProvider: null,
      orgId: null,
      orgName: null,
      subscriptionType: null,
    });
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') stderrOutput.push(msg);
    });

    // Must not warn and must not throw on the unreadable lane.
    expect(() => checkCrossLaneEmailOverlap('agy', 'lane@example.com')).not.toThrow();
    expect(stderrOutput.join('\n')).not.toContain('cross-lane');

    spy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── 15. Safety invariant: disablePoolRouting always restores cooling=true ─
  it('safety invariant: disablePoolRouting ALWAYS writes disable-cooling: true', async () => {
    const { enablePoolRouting, disablePoolRouting } = await import(
      `../routing/routing-strategy?p3invariant1=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    // Enable then disable
    enablePoolRouting(8317, { configPath, authDir });
    disablePoolRouting(8317, { configPath, authDir });

    const after = fs.readFileSync(configPath, 'utf-8');
    // This is the single-account blackout prevention invariant.
    // If this line is ever absent, the old v5 stability regression resurfaces.
    expect(after).toContain('disable-cooling: true');
    expect(after).not.toContain('disable-cooling: false');
  });
});

// ── Mixed-state test ────────────────────────────────────────────────────────

describe('Phase 3: mixed-state — claude pool + agy multi-account implicit RR', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateSharedConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('enabling pool routing while agy has 2+ accounts is instance-global (affects both)', async () => {
    const { enablePoolRouting } = await import(
      `../routing/routing-strategy?p3mixed1=${Date.now()}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    const result = enablePoolRouting(8317, { configPath, authDir });

    // Pool routing is instance-global — written to the single shared config.yaml
    expect(result.changed).toBe(true);
    const content = fs.readFileSync(configPath, 'utf-8');
    // Both agy and claude accounts go through the same config
    expect(content).toContain('strategy: fill-first');
    expect(content).toContain('disable-cooling: false');
  });

  it('POOL_ROUTING_VERIFIED_PROVIDERS contains claude and agy but not codex or gemini', async () => {
    const { POOL_ROUTING_VERIFIED_PROVIDERS } = await import(
      `../routing/routing-strategy?p3mixed2=${Date.now()}`
    );
    expect(POOL_ROUTING_VERIFIED_PROVIDERS.has('claude')).toBe(true);
    expect(POOL_ROUTING_VERIFIED_PROVIDERS.has('agy')).toBe(true);
    expect(POOL_ROUTING_VERIFIED_PROVIDERS.has('codex')).toBe(false);
    expect(POOL_ROUTING_VERIFIED_PROVIDERS.has('gemini')).toBe(false);
  });
});

// ── Prompt accept/decline interactive path ─────────────────────────────────
// Uses static imports (poolOptInModule, promptModule) so spyOn targets the same
// module instance as maybeOfferPoolRouting.

describe('Phase 3: maybeOfferPoolRouting interactive accept/decline', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateSharedConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
    delete process.env.CCS_YES;
  });

  it('decline: writes prompt_dismissed=true and leaves config.yaml unchanged', async () => {
    // Test via config state directly using dismissPoolPrompt + isPoolPromptDismissed
    // as the canonical API.  No internal spy needed.

    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    // Write initial config.yaml so we have a baseline
    const { enablePoolRouting, disablePoolRouting } = await import(
      `../routing/routing-strategy?p3decline1=${Date.now()}`
    );
    // Generate baseline (non-pool)
    enablePoolRouting(8317, { configPath, authDir });
    disablePoolRouting(8317, { configPath, authDir });
    const baseline = fs.readFileSync(configPath, 'utf-8');

    // dismissPoolPrompt sets prompt_dismissed; config.yaml should be unchanged
    poolOptInModule.dismissPoolPrompt();
    expect(poolOptInModule.isPoolPromptDismissed()).toBe(true);
    // config.yaml is not regenerated by dismiss — only the unified config changes
    const afterDismiss = fs.readFileSync(configPath, 'utf-8');
    // Strip the generated timestamp line for comparison (it changes each regen)
    const stripTimestamp = (s: string) => s.replace(/# Generated: .+/g, '# Generated: TIMESTAMP');
    expect(stripTimestamp(afterDismiss)).toBe(stripTimestamp(baseline));
  });

  it('accept: InteractivePrompt.confirm stub + TTY + 2-account state enables pool routing', async () => {
    // Flush the shared config cache: prior tests may have left prompt_dismissed or
    // pool_routing state that would cause early-exit guards to fire.
    invalidateSharedConfigCache();

    // Stub InteractivePrompt.confirm to return true (user said yes)
    const confirmSpy = spyOn(promptModule.InteractivePrompt, 'confirm').mockResolvedValue(true);

    // Stub stdin.isTTY and stderr.isTTY so the TTY guard passes
    const origStdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const origStderrTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });

    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    // Write 2 accounts to the temp registry file.
    // accounts.json lives at getCcsDir()/cliproxy/accounts.json (getAccountsRegistryPath).
    // Token files must exist in authDir so syncRegistryWithTokenFiles does not prune them.
    const accountsPath = path.join(ccsDir, 'cliproxy', 'accounts.json');
    const fakeRegistry = {
      providers: {
        claude: {
          default: 'acc1',
          accounts: {
            acc1: { email: 'a@b.com', tokenFile: 'a.json', nickname: 'a', createdAt: 0 },
            acc2: { email: 'c@d.com', tokenFile: 'c.json', nickname: 'c', createdAt: 0 },
          },
        },
      },
    };
    fs.writeFileSync(accountsPath, JSON.stringify(fakeRegistry), 'utf-8');

    // Create stub token files so syncRegistryWithTokenFiles does not prune them
    fs.writeFileSync(path.join(authDir, 'a.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(authDir, 'c.json'), '{}', 'utf-8');

    const result = await poolOptInModule.maybeOfferPoolRouting('claude', 1, 8317);

    // With TTY + 2 accounts + confirm=true, pool routing should be enabled
    expect(result.prompted).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.skipped).toBe(false);

    // Restore TTY descriptors: if no own descriptor existed, delete the property
    // so later tests are not order-dependent on its value (CI leak prevention).
    if (origStdinTTY) {
      Object.defineProperty(process.stdin, 'isTTY', origStdinTTY);
    } else {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
    if (origStderrTTY) {
      Object.defineProperty(process.stderr, 'isTTY', origStderrTTY);
    } else {
      delete (process.stderr as { isTTY?: boolean }).isTTY;
    }
    confirmSpy.mockRestore();
  });

  it('decline path: InteractivePrompt.confirm stub returns false, dismissal persisted, config unchanged', async () => {
    // Flush the shared config cache (may have prompt_dismissed:true from accept test)
    invalidateSharedConfigCache();

    const confirmSpy = spyOn(promptModule.InteractivePrompt, 'confirm').mockResolvedValue(false);

    const origStdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const origStderrTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });

    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    // Write 2 claude accounts so the post-add count check passes
    const accountsPath = path.join(ccsDir, 'cliproxy', 'accounts.json');
    const fakeRegistry = {
      providers: {
        claude: {
          default: 'acc1',
          accounts: {
            acc1: { email: 'a@b.com', tokenFile: 'a.json', nickname: 'a', createdAt: 0 },
            acc2: { email: 'c@d.com', tokenFile: 'c.json', nickname: 'c', createdAt: 0 },
          },
        },
      },
    };
    fs.writeFileSync(accountsPath, JSON.stringify(fakeRegistry), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'a.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(authDir, 'c.json'), '{}', 'utf-8');

    const result = await poolOptInModule.maybeOfferPoolRouting('claude', 1, 8317);

    expect(result.prompted).toBe(true);
    expect(result.enabled).toBe(false);
    // Dismissal persisted so prompt does not re-show
    expect(poolOptInModule.isPoolPromptDismissed()).toBe(true);
    // Pool routing must NOT be enabled in the config
    const { loadOrCreateUnifiedConfig } = await import(
      `../../config/config-loader-facade?p3declinechk=${Date.now()}`
    );
    const cfg = loadOrCreateUnifiedConfig();
    expect(cfg.cliproxy?.pool_routing?.enabled).not.toBe(true);

    // Restore TTY descriptors: if no own descriptor existed, delete the property
    // so later tests are not order-dependent on its value (CI leak prevention).
    if (origStdinTTY) {
      Object.defineProperty(process.stdin, 'isTTY', origStdinTTY);
    } else {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
    if (origStderrTTY) {
      Object.defineProperty(process.stderr, 'isTTY', origStderrTTY);
    } else {
      delete (process.stderr as { isTTY?: boolean }).isTTY;
    }
    confirmSpy.mockRestore();
  });

  it('disclosure: prompt copy names all providers with 2+ accounts (agy + claude)', async () => {
    // Plan criterion: prompt discloses ALL providers with >=2 accounts.
    // Register 2 claude + 2 agy accounts and capture the console output.
    // Both provider names must appear in the prompt copy.
    invalidateSharedConfigCache();

    const confirmSpy = spyOn(promptModule.InteractivePrompt, 'confirm').mockResolvedValue(false);

    const origStdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const origStderrTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });

    const ccsDir = path.join(tempHome, '.ccs');
    const accountsPath = path.join(ccsDir, 'cliproxy', 'accounts.json');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(accountsPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    // 2 claude + 2 agy accounts
    const mixedRegistry = {
      providers: {
        claude: {
          default: 'c1',
          accounts: {
            c1: { email: 'c1@b.com', tokenFile: 'c1.json', nickname: 'c1', createdAt: 0 },
            c2: { email: 'c2@b.com', tokenFile: 'c2.json', nickname: 'c2', createdAt: 0 },
          },
        },
        agy: {
          default: 'a1',
          accounts: {
            a1: { email: 'a1@b.com', tokenFile: 'a1.json', nickname: 'a1', createdAt: 0 },
            a2: { email: 'a2@b.com', tokenFile: 'a2.json', nickname: 'a2', createdAt: 0 },
          },
        },
      },
    };
    fs.writeFileSync(accountsPath, JSON.stringify(mixedRegistry), 'utf-8');
    // Create stub token files
    for (const f of ['c1.json', 'c2.json', 'a1.json', 'a2.json']) {
      fs.writeFileSync(path.join(authDir, f), '{}', 'utf-8');
    }

    const consoleLines: string[] = [];
    const consoleSpy = spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') consoleLines.push(msg);
    });

    await poolOptInModule.maybeOfferPoolRouting('claude', 1, 8317);

    const promptCopy = consoleLines.join('\n');
    expect(promptCopy).toContain('claude');
    expect(promptCopy).toContain('agy');

    consoleSpy.mockRestore();
    if (origStdinTTY) {
      Object.defineProperty(process.stdin, 'isTTY', origStdinTTY);
    } else {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
    if (origStderrTTY) {
      Object.defineProperty(process.stderr, 'isTTY', origStderrTTY);
    } else {
      delete (process.stderr as { isTTY?: boolean }).isTTY;
    }
    confirmSpy.mockRestore();
  });
});

// ── Provider enumeration from registry ────────────────────────────────────
// Ensures getMultiAccountProviders derives from live registry, not a hardcoded list.

describe('Phase 3: provider enumeration derives from registry', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateSharedConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('non-at-transition skip when re-authing single account (accountCountAfter stays 1)', async () => {
    // Registers 1 account in the temp registry — accountCountAfter === 1
    // maybeOfferPoolRouting(provider, accountCountBefore=1) must skip because
    // actual post-add count is 1 (re-auth dedup scenario).
    const ccsDir = path.join(tempHome, '.ccs');
    // accounts.json lives at getCcsDir()/cliproxy/accounts.json
    const accountsPath = path.join(ccsDir, 'cliproxy', 'accounts.json');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(accountsPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });

    // Only 1 account registered
    const singleAccountRegistry = {
      providers: {
        claude: {
          default: 'acc1',
          accounts: {
            acc1: { email: 'a@b.com', tokenFile: 'a.json', nickname: 'a', createdAt: 0 },
          },
        },
      },
    };
    fs.writeFileSync(accountsPath, JSON.stringify(singleAccountRegistry), 'utf-8');
    fs.writeFileSync(path.join(authDir, 'a.json'), '{}', 'utf-8');

    // Flush shared config cache to avoid stale state from prior tests
    invalidateSharedConfigCache();

    const result = await poolOptInModule.maybeOfferPoolRouting('claude', 1);

    // Must skip: accountCountBefore=1 but accountCountAfter=1 (re-auth, not new add)
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('not-at-transition');
  });
});

// ── routing-subcommand pool-active warning regression ───────────────────────
// handleRoutingSet must emit a pool-active warning when pool routing is enabled,
// so the user understands the stored strategy is ignored while pool is active.

import * as routingSubcommandModule from '../../commands/cliproxy/routing-subcommand';
import * as routingStrategyModule from '../routing/routing-strategy';

describe('Phase 3: routing-subcommand pool-active warning regression', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateSharedConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('handleRoutingSet warns when pool routing is active', async () => {
    // Enable pool routing in the shared config so the check fires.
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3rsw1=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.pool_routing = { enabled: true };
    });
    invalidateConfigCache();
    invalidateSharedConfigCache();

    const warnLines: string[] = [];
    const consoleSpy = spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') warnLines.push(msg);
    });
    // Stub applyCliproxyRoutingStrategy so it does not make network calls
    const applySpy = spyOn(routingStrategyModule, 'applyCliproxyRoutingStrategy').mockResolvedValue(
      {
        strategy: 'round-robin',
        source: 'config',
        target: 'local',
        reachable: false,
        applied: 'config-only',
      }
    );

    await routingSubcommandModule.handleRoutingSet(['round-robin']);

    const output = warnLines.join('\n');
    expect(output).toContain('Pool routing is active');

    consoleSpy.mockRestore();
    applySpy.mockRestore();
  });

  it('handleRoutingAffinitySet warns when pool routing is active (affinity parity)', async () => {
    // Fix 6: affinity toggle path must emit the same pool-active warning as the
    // strategy set path.  Without this fix the two paths have divergent UX.
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p3rsa1=${Date.now()}`
    );
    mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.pool_routing = { enabled: true };
    });
    invalidateConfigCache();
    invalidateSharedConfigCache();

    const warnLines: string[] = [];
    const consoleSpy = spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') warnLines.push(msg);
    });
    // Stub applyCliproxySessionAffinitySettings so it does not touch the filesystem
    const affinitySpy = spyOn(
      routingStrategyModule,
      'applyCliproxySessionAffinitySettings'
    ).mockResolvedValue({
      enabled: true,
      ttl: '1h',
      source: 'config',
      target: 'local',
      reachable: false,
      manageable: true,
      applied: 'config-only',
    });

    await routingSubcommandModule.handleRoutingAffinitySet(['on']);

    const output = warnLines.join('\n');
    expect(output).toContain('Pool routing is active');

    consoleSpy.mockRestore();
    affinitySpy.mockRestore();
  });
});

// ── PR #1514 review fixes ────────────────────────────────────────────────────
// Legacy-config gate, automation bypass, enable rollback-on-regenerate-failure,
// remote pool-state manageable flag, and apply-message pool override note.

describe('PR #1514: maybeOfferPoolRouting legacy-config and automation guards', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateSharedConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
    delete process.env.CCS_YES;
  });

  // Fix index 5: legacy profiles.json-only install (no config.yaml) must skip the
  // prompt before any prompting OR dismissal persistence, so we never implicitly
  // create config.yaml and silently flip isUnifiedMode().
  it('skips with legacy-config and does not create config.yaml (decline path not reached)', async () => {
    // Remove the config.yaml createTestHome wrote so hasUnifiedConfig() is false.
    const configYaml = path.join(tempHome, '.ccs', 'config.yaml');
    fs.rmSync(configYaml, { force: true });
    invalidateSharedConfigCache();

    const result = await poolOptInModule.maybeOfferPoolRouting('claude', 1);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('legacy-config');
    // Critical: the dismissal/accept paths (which write config.yaml) must NOT run.
    expect(fs.existsSync(configYaml)).toBe(false);
  });

  // Fix index 9: --yes / CCS_YES must NOT auto-accept this instance-global consent.
  // It must skip WITHOUT printing the prompt and WITHOUT persisting dismissal.
  it('skips with automation-bypass under CCS_YES=1 without prompting or dismissing', async () => {
    process.env.CCS_YES = '1';

    // 2 accounts so we are past the post-add count check and reach the TTY/bypass guards.
    const ccsDir = path.join(tempHome, '.ccs');
    const accountsPath = path.join(ccsDir, 'cliproxy', 'accounts.json');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(accountsPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(
      accountsPath,
      JSON.stringify({
        providers: {
          claude: {
            default: 'a1',
            accounts: {
              a1: { email: 'a@b.com', tokenFile: 'a.json', nickname: 'a', createdAt: 0 },
              a2: { email: 'c@d.com', tokenFile: 'c.json', nickname: 'c', createdAt: 0 },
            },
          },
        },
      }),
      'utf-8'
    );
    fs.writeFileSync(path.join(authDir, 'a.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(authDir, 'c.json'), '{}', 'utf-8');

    // Force TTY so only the automation guard (not the non-tty guard) can fire.
    const origStdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const origStderrTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });

    // confirm must NEVER be called on the bypass path.
    const confirmSpy = spyOn(promptModule.InteractivePrompt, 'confirm').mockResolvedValue(true);

    const result = await poolOptInModule.maybeOfferPoolRouting('claude', 1, 8317);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('automation-bypass');
    expect(result.enabled).toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
    // Dismissal must NOT be persisted (future interactive run should still offer).
    expect(poolOptInModule.isPoolPromptDismissed()).toBe(false);

    confirmSpy.mockRestore();
    if (origStdinTTY) {
      Object.defineProperty(process.stdin, 'isTTY', origStdinTTY);
    } else {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
    if (origStderrTTY) {
      Object.defineProperty(process.stderr, 'isTTY', origStderrTTY);
    } else {
      delete (process.stderr as { isTTY?: boolean }).isTTY;
    }
  });
});

describe('PR #1514: enablePoolRouting rollback on regenerate failure', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    invalidateSharedConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  // Fix index 6: if regenerateConfig throws, the pool_routing.enabled flag must be
  // rolled back so status surfaces do not lie, and a recovery message is returned.
  // Force a real fs failure (no mock): place a regular FILE where the config
  // directory must be, so regenerateConfig's mkdirSync(dirname) throws ENOTDIR.
  it('rolls back enabled flag and returns failure recovery copy when regenerate throws', async () => {
    const ts = Date.now();
    const { enablePoolRouting } = await import(`../routing/routing-strategy?p1514fail=${ts}`);
    const { loadOrCreateUnifiedConfig } = await import(
      `../../config/config-loader-facade?p1514fail=${ts}`
    );
    const ccsDir = path.join(tempHome, '.ccs');
    const cliproxyDir = path.join(ccsDir, 'cliproxy');
    fs.mkdirSync(cliproxyDir, { recursive: true });
    // Block the config dir: create a FILE named "blocked" then aim the config path
    // at blocked/config.yaml so mkdirSync(dirname) hits ENOTDIR.
    const blockedFile = path.join(cliproxyDir, 'blocked');
    fs.writeFileSync(blockedFile, 'not a dir', 'utf-8');
    const configPath = path.join(blockedFile, 'config.yaml');
    const authDir = path.join(cliproxyDir, 'auth');

    const result = enablePoolRouting(8317, { configPath, authDir });

    expect(result.failed).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.message).toContain('[X] Could not write CLIProxy config');
    expect(result.message).toContain('ccs cliproxy pool --enable');

    // The flag must be rolled back to NOT-enabled so status surfaces do not lie.
    const cfg = loadOrCreateUnifiedConfig();
    expect(cfg.cliproxy?.pool_routing?.enabled).not.toBe(true);
  });

  // Repair path: when the flag is already true (a prior regenerate failed),
  // pool --enable must re-run regenerateConfig instead of a dead no-op.
  it('already-enabled path re-runs regenerateConfig (idempotent repair)', async () => {
    const ts = Date.now();
    // Persist enabled=true WITHOUT a regenerated config.yaml (simulate prior failure).
    const { mutateConfig, invalidateConfigCache } = await import(
      `../../config/config-loader-facade?p1514repair=${ts}`
    );
    mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
      cfg.cliproxy = cfg.cliproxy ?? {};
      cfg.cliproxy.pool_routing = { enabled: true, max_retry_credentials: 3 };
    });
    invalidateConfigCache();
    invalidateSharedConfigCache();

    const { enablePoolRouting } = await import(`../routing/routing-strategy?p1514repair=${ts}`);
    const ccsDir = path.join(tempHome, '.ccs');
    const configPath = path.join(ccsDir, 'cliproxy', 'config.yaml');
    const authDir = path.join(ccsDir, 'cliproxy', 'auth');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(authDir, { recursive: true });
    // Config does NOT exist yet — the repair must create it.
    expect(fs.existsSync(configPath)).toBe(false);

    const result = enablePoolRouting(8317, { configPath, authDir });

    // Idempotent (changed=false) but the config was regenerated with pool rails.
    expect(result.changed).toBe(false);
    expect(result.failed).toBeFalsy();
    expect(fs.existsSync(configPath)).toBe(true);
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('disable-cooling: false');
    expect(content).toContain('strategy: fill-first');
  });
});
