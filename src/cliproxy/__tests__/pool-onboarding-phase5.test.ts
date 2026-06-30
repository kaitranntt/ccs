/**
 * Phase 5: Pool Onboarding Hint - Test Suite
 *
 * Covers:
 *   1. Non-TTY: hint is silent
 *   2. Pool already enabled: hint is silent
 *   3. Dismissed flag: hint is silent
 *   4. Fewer than 2 profiles: hint is silent
 *   5. Exactly 2 profiles, TTY, not dismissed, pool off: hint prints (single [i] marker)
 *   6. After dismiss, second call is silent
 *   7. Pre-computed count avoids double registry read
 *   8. isOnboardingHintDismissed / dismissOnboardingHint roundtrip
 *   9. countNativeClaudeProfiles returns only account-type profiles
 *  10. Doctor site (simulation): maybeShowPoolOnboardingHint callable after report phase
 *  10b. Doctor wiring (static): doctor.ts imports and calls the hint symbol
 *  11. Create-command suggestion: hint fires with count=2 when 1 existing profile present
 *  12. Legacy-only install: dismissOnboardingHint does not create config.yaml
 *  13. Hint copy includes 'ccs claude' entry point and quota trade-off language
 *  14. Legacy-only install: hasUnifiedConfig() returns false, enforcing call-site gate
 *  15. Malformed config (with count): hint swallows the error, never throws, prints nothing
 *  16. Malformed config (no count, doctor path): hint never throws
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

// Non-cache-busted facade import so mutateConfig targets the SHARED singleton
import { invalidateConfigCache as invalidateSharedConfigCache } from '../../config/config-loader-facade';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createTestHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-pool-onboarding-test-'));
  const ccsDir = path.join(dir, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), 'version: 1\n', 'utf8');
  return dir;
}

/** Create a legacy-only home: has profiles.json but NO config.yaml */
function createLegacyTestHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-pool-onboarding-legacy-'));
  const ccsDir = path.join(dir, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  // Intentionally no config.yaml - legacy install
  return dir;
}

/** Write a minimal profiles.json with N account-type entries */
function writeProfiles(ccsDir: string, names: string[]): void {
  const profiles: Record<string, unknown> = {};
  for (const n of names) {
    profiles[n] = { type: 'account', created: new Date().toISOString(), last_used: null };
  }
  fs.writeFileSync(
    path.join(ccsDir, 'profiles.json'),
    JSON.stringify({ version: '2.0.0', profiles, default: null }, null, 2),
    'utf8'
  );
}

/** Write a minimal profiles.json with mixed types */
function writeProfilesMixed(ccsDir: string): void {
  const profiles: Record<string, unknown> = {
    acct1: { type: 'account', created: new Date().toISOString(), last_used: null },
    settings1: { type: 'settings', created: new Date().toISOString(), last_used: null },
  };
  fs.writeFileSync(
    path.join(ccsDir, 'profiles.json'),
    JSON.stringify({ version: '2.0.0', profiles, default: null }, null, 2),
    'utf8'
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Phase 5: Pool Onboarding Hint', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    tempHome = createTestHome();
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    // Default: treat stdout as TTY for hint to fire
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    invalidateSharedConfigCache();
  });

  // ── 1. Non-TTY ──────────────────────────────────────────────────────────
  it('returns skipReason non-tty when stdout.isTTY is false', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work', 'personal']);
    const { maybeShowPoolOnboardingHint } = await import(
      `../routing/pool-onboarding-hint?p5nontty=${Date.now()}`
    );
    const result = maybeShowPoolOnboardingHint();
    expect(result.printed).toBe(false);
    expect(result.skipReason).toBe('non-tty');
  });

  // ── 2. Pool already enabled ─────────────────────────────────────────────
  it('returns skipReason pool-already-enabled when pool routing is on', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work', 'personal']);
    // Enable pool routing first
    const { mutateConfig } = await import(`../../config/config-loader-facade?p5pool=${Date.now()}`);
    mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
      if (!cfg.cliproxy) return;
      cfg.cliproxy.pool_routing = { ...(cfg.cliproxy.pool_routing ?? {}), enabled: true };
    });
    invalidateSharedConfigCache();

    const { maybeShowPoolOnboardingHint } = await import(
      `../routing/pool-onboarding-hint?p5pool2=${Date.now()}`
    );
    const result = maybeShowPoolOnboardingHint();
    expect(result.printed).toBe(false);
    expect(result.skipReason).toBe('pool-already-enabled');
  });

  // ── 3. Dismissed ────────────────────────────────────────────────────────
  it('returns skipReason dismissed when onboarding_hint_dismissed is true', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work', 'personal']);

    const { mutateConfig } = await import(`../../config/config-loader-facade?p5dis=${Date.now()}`);
    mutateConfig((cfg: { cliproxy?: { pool_routing?: Record<string, unknown> } }) => {
      if (!cfg.cliproxy) return;
      cfg.cliproxy.pool_routing = {
        ...(cfg.cliproxy.pool_routing ?? {}),
        onboarding_hint_dismissed: true,
      };
    });
    invalidateSharedConfigCache();

    const { maybeShowPoolOnboardingHint } = await import(
      `../routing/pool-onboarding-hint?p5dis2=${Date.now()}`
    );
    const result = maybeShowPoolOnboardingHint();
    expect(result.printed).toBe(false);
    expect(result.skipReason).toBe('dismissed');
  });

  // ── 4. Fewer than 2 profiles ────────────────────────────────────────────
  it('returns skipReason fewer-than-2-profiles when only 1 profile exists', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work']);
    const { maybeShowPoolOnboardingHint } = await import(
      `../routing/pool-onboarding-hint?p5few=${Date.now()}`
    );
    const result = maybeShowPoolOnboardingHint();
    expect(result.printed).toBe(false);
    expect(result.skipReason).toBe('fewer-than-2-profiles');
  });

  it('returns skipReason fewer-than-2-profiles when no profiles exist', async () => {
    const { maybeShowPoolOnboardingHint } = await import(
      `../routing/pool-onboarding-hint?p5zero=${Date.now()}`
    );
    const result = maybeShowPoolOnboardingHint();
    expect(result.printed).toBe(false);
    expect(result.skipReason).toBe('fewer-than-2-profiles');
  });

  // ── 5. Hint prints when 2 profiles, TTY, not dismissed, pool off ────────
  it('prints hint and returns printed=true when conditions are met', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work', 'personal']);

    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { maybeShowPoolOnboardingHint } = await import(
        `../routing/pool-onboarding-hint?p5print=${Date.now()}`
      );
      const result = maybeShowPoolOnboardingHint();
      expect(result.printed).toBe(true);
      expect(result.skipReason).toBeUndefined();
      // Verify output: exactly one [i] marker (no double-prefix from info() + literal)
      expect(consoleSpy.mock.calls.length).toBeGreaterThan(0);
      const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(allOutput).toContain('2 Claude profiles');
      const iMarkerCount = (allOutput.match(/\[i\]/g) ?? []).length;
      expect(iMarkerCount).toBe(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // ── 6. After dismiss, second call is silent ─────────────────────────────
  it('is silent on the second call because hint auto-dismisses after first print', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work', 'personal']);

    // Use the same module instance for both calls so the dismissed flag persists
    const { maybeShowPoolOnboardingHint } = await import(
      `../routing/pool-onboarding-hint?p5once=${Date.now()}`
    );

    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const first = maybeShowPoolOnboardingHint();
      expect(first.printed).toBe(true);

      invalidateSharedConfigCache();

      const second = maybeShowPoolOnboardingHint();
      expect(second.printed).toBe(false);
      expect(second.skipReason).toBe('dismissed');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // ── 7. Pre-computed count skips internal registry read ─────────────────
  it('uses the pre-computed count when provided', async () => {
    // No profiles.json — but we pass count=3 directly so it should still print
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { maybeShowPoolOnboardingHint } = await import(
        `../routing/pool-onboarding-hint?p5precount=${Date.now()}`
      );
      const result = maybeShowPoolOnboardingHint(3);
      expect(result.printed).toBe(true);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // ── 8. isOnboardingHintDismissed / dismissOnboardingHint roundtrip ─────
  it('dismissOnboardingHint persists and isOnboardingHintDismissed reads it', async () => {
    const { isOnboardingHintDismissed, dismissOnboardingHint } = await import(
      `../routing/pool-onboarding-hint?p5dismiss=${Date.now()}`
    );
    expect(isOnboardingHintDismissed()).toBe(false);
    dismissOnboardingHint();
    invalidateSharedConfigCache();
    expect(isOnboardingHintDismissed()).toBe(true);
  });

  // ── 9. countNativeClaudeProfiles counts only account-type profiles ───────
  it('countNativeClaudeProfiles ignores non-account type profiles', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfilesMixed(ccsDir); // 1 account + 1 settings
    const { countNativeClaudeProfiles } = await import(
      `../routing/pool-onboarding-hint?p5count=${Date.now()}`
    );
    expect(countNativeClaudeProfiles()).toBe(1);
  });

  it('countNativeClaudeProfiles returns 0 when no profiles.json exists', async () => {
    const { countNativeClaudeProfiles } = await import(
      `../routing/pool-onboarding-hint?p5count2=${Date.now()}`
    );
    expect(countNativeClaudeProfiles()).toBe(0);
  });

  // ── 10. Doctor site: maybeShowPoolOnboardingHint is exported and callable ─
  it('maybeShowPoolOnboardingHint is callable after the doctor report phase', async () => {
    // NOTE: This is a SIMULATION of the doctor post-checks call site, not the
    // real Doctor pipeline. The hint fires from Doctor's private displayResults()
    // method, which has no cheap standalone entry point - exercising it directly
    // would require constructing Doctor and running the full async check pipeline
    // (system / OAuth / CLIProxy / Docker), which is heavy and environment-fragile.
    // Instead we call the exact exported symbol the doctor imports
    // (maybeShowPoolOnboardingHint, see doctor.ts import) under the same
    // preconditions: 2 profiles, TTY, not dismissed. The wiring itself - that
    // doctor.ts imports this symbol - is asserted in the companion test below.
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work', 'personal']);

    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { maybeShowPoolOnboardingHint } = await import(
        `../routing/pool-onboarding-hint?p5doc=${Date.now()}`
      );
      // doctor calls maybeShowPoolOnboardingHint() with no pre-computed count
      const result = maybeShowPoolOnboardingHint();
      expect(result.printed).toBe(true);
      const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(allOutput).toContain('2 Claude profiles');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // ── 10b. Doctor wiring: doctor.ts imports and calls the hint symbol ───────
  it('doctor.ts wires maybeShowPoolOnboardingHint as the doctor hint site', () => {
    // Cheap static wiring assertion: confirms the real doctor call site imports
    // and invokes the same symbol the simulation above exercises, without
    // executing the heavy Doctor pipeline. If the doctor stops importing or
    // calling the hint, this fails - catching a broken hint site that a pure
    // simulation test could not.
    const doctorSrc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'management', 'doctor.ts'),
      'utf8'
    );
    expect(doctorSrc).toContain(
      "import { maybeShowPoolOnboardingHint } from '../cliproxy/routing/pool-onboarding-hint'"
    );
    expect(doctorSrc).toContain('maybeShowPoolOnboardingHint();');
  });

  // ── 11. Create-command suggestion: hint fires with post-create count ──────
  it('hint fires with count 2 after a successful 2nd-profile create (post-create call site)', async () => {
    // NOTE: SIMULATION of the create-command call site, not the real command.
    // create-command shows the hint only AFTER profile creation succeeds (a
    // pre-create hint would burn the once-per-install dismissal on a failed
    // create).  At that point the registry already contains the new profile,
    // so the call is maybeShowPoolOnboardingHint(countNativeClaudeProfiles()).
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work', 'personal']); // post-create state: 2 profiles

    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { maybeShowPoolOnboardingHint, countNativeClaudeProfiles } = await import(
        `../routing/pool-onboarding-hint?p5create=${Date.now()}`
      );
      const count = countNativeClaudeProfiles();
      expect(count).toBe(2);
      const result = maybeShowPoolOnboardingHint(count);
      expect(result.printed).toBe(true);
      const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(allOutput).toContain('2 Claude profiles');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // ── 12. Legacy-only install: dismissal does not create config.yaml ────────
  it('dismissOnboardingHint does not create config.yaml for legacy profiles.json-only installs', async () => {
    // Override tempHome with a legacy-only home (no config.yaml)
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    const legacyHome = createLegacyTestHome();
    process.env.CCS_HOME = legacyHome;
    invalidateSharedConfigCache();

    try {
      const ccsDir = path.join(legacyHome, '.ccs');
      writeProfiles(ccsDir, ['work', 'personal']);
      const configYamlPath = path.join(ccsDir, 'config.yaml');

      const { dismissOnboardingHint, isOnboardingHintDismissed } = await import(
        `../routing/pool-onboarding-hint?p5legacy=${Date.now()}`
      );

      // Sanity: config.yaml does not exist yet
      expect(fs.existsSync(configYamlPath)).toBe(false);

      // isOnboardingHintDismissed returns false (reads empty config, no persist)
      expect(isOnboardingHintDismissed()).toBe(false);

      // dismissOnboardingHint must NOT create config.yaml
      dismissOnboardingHint();
      expect(fs.existsSync(configYamlPath)).toBe(false);
    } finally {
      fs.rmSync(legacyHome, { recursive: true, force: true });
      invalidateSharedConfigCache();
    }
  });

  // ── 13. Hint copy is opt-in framed and names the enable command ──────────
  it("hint copy mentions 'ccs claude' and the opt-in enable command", async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work', 'personal']);

    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { maybeShowPoolOnboardingHint } = await import(
        `../routing/pool-onboarding-hint?p5copy=${Date.now()}`
      );
      const result = maybeShowPoolOnboardingHint();
      expect(result.printed).toBe(true);
      const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(allOutput).toContain('ccs claude');
      // Copy must be opt-in (not declarative "already pools") and name the
      // actual enable command so the user has an actionable next step.
      expect(allOutput).toContain('ccs cliproxy pool --enable');
      expect(allOutput.toLowerCase()).toContain('can auto-continue');
      // Must NOT read as already-active behavior.
      expect(allOutput).not.toContain('pool auto-continues');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // ── 14. Legacy-only install: hasUnifiedConfig() is false at account-flow / create-command sites ──
  it('hasUnifiedConfig returns false for legacy profiles.json-only installs (call-site gate)', async () => {
    // Verifies that the guard used in account-flow.ts and create-command.ts
    // (hasUnifiedConfig()) correctly reports false for a profiles.json-only home,
    // meaning those call sites silently skip the hint and legacy users receive
    // the hint exclusively from ccs doctor.
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    const legacyHome = createLegacyTestHome();
    process.env.CCS_HOME = legacyHome;
    invalidateSharedConfigCache();

    try {
      const ccsDir = path.join(legacyHome, '.ccs');
      writeProfiles(ccsDir, ['work', 'personal']);

      const { hasUnifiedConfig } = await import(
        `../../config/config-loader-facade?p5gate=${Date.now()}`
      );

      // The call-site guard must return false - legacy install has no config.yaml
      expect(hasUnifiedConfig()).toBe(false);
    } finally {
      fs.rmSync(legacyHome, { recursive: true, force: true });
      invalidateSharedConfigCache();
    }
  });

  // ── 15. Malformed config: hint never throws and prints nothing ────────────
  it('does not throw or print when config.yaml is malformed (hint must not break launch)', async () => {
    // A pre-computed profileCount (passed by the launch / create call sites)
    // clears the cheap gates, so the decision reaches the single config load.
    // A malformed config.yaml makes loadOrCreateUnifiedConfig throw; the
    // try/catch in maybeShowPoolOnboardingHint must swallow it - returning
    // printed=false with skipReason 'error' and emitting no hint - so an account
    // launch is never broken by a bad config.
    const ccsDir = path.join(tempHome, '.ccs');
    // Overwrite the valid config.yaml from createTestHome() with invalid YAML.
    fs.writeFileSync(path.join(ccsDir, 'config.yaml'), 'cliproxy: [unclosed\n', 'utf8');
    invalidateSharedConfigCache();

    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { maybeShowPoolOnboardingHint } = await import(
        `../routing/pool-onboarding-hint?p5malformed=${Date.now()}`
      );
      let result: { printed: boolean; skipReason?: string } | undefined;
      // Must not throw. Pass count=2 to bypass the registry (which itself loads
      // config) and drive the decision into the explicit config load + try/catch.
      expect(() => {
        result = maybeShowPoolOnboardingHint(2);
      }).not.toThrow();
      expect(result?.printed).toBe(false);
      expect(result?.skipReason).toBe('error');
      // No hint line printed.
      const hintLines = consoleSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.includes('Claude profiles'));
      expect(hintLines.length).toBe(0);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  // ── 16. Malformed config via doctor path (no count): still no throw ───────
  it('does not throw when config is malformed and no profileCount is passed (doctor path)', async () => {
    // The doctor site calls maybeShowPoolOnboardingHint() with no count. With a
    // malformed config, countNativeClaudeProfiles() swallows the registry error
    // and returns 0, short-circuiting at fewer-than-2-profiles. Either way the
    // call must never throw - this guards the doctor call site specifically.
    const ccsDir = path.join(tempHome, '.ccs');
    writeProfiles(ccsDir, ['work', 'personal']);
    fs.writeFileSync(path.join(ccsDir, 'config.yaml'), 'cliproxy: [unclosed\n', 'utf8');
    invalidateSharedConfigCache();

    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { maybeShowPoolOnboardingHint } = await import(
        `../routing/pool-onboarding-hint?p5malformed2=${Date.now()}`
      );
      let result: { printed: boolean } | undefined;
      expect(() => {
        result = maybeShowPoolOnboardingHint();
      }).not.toThrow();
      expect(result?.printed).toBe(false);
      const hintLines = consoleSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.includes('Claude profiles'));
      expect(hintLines.length).toBe(0);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
