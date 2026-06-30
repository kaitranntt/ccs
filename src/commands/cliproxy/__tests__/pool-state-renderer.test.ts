/**
 * Tests for the CLI pool-state renderer helpers: state labels (the three
 * account states must be NAMED differently because they map to different client
 * failure modes), reset formatting, and drain-order mode labels.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describeAccountState, formatCooldownReset, modeLabel } from '../pool-state-renderer';
import type { PoolAccountState } from '../../../cliproxy/accounts/pool-state';

function state(
  partial: Partial<PoolAccountState> & { state: PoolAccountState['state'] }
): PoolAccountState {
  return {
    accountId: 'a@x.com',
    tokenFile: 'a.json',
    isDefault: false,
    ...partial,
  } as PoolAccountState;
}

describe('describeAccountState', () => {
  it('names available, cooling, and paused states distinctly', () => {
    const now = 1_000_000;
    const available = describeAccountState(state({ state: 'available' }), now);
    const paused = describeAccountState(state({ state: 'paused' }), now);
    const cooling = describeAccountState(
      state({ state: 'cooling', cooldownUntil: now + 5 * 60 * 1000, cooldownSource: 'persisted' }),
      now
    );

    expect(available.label).toBe('available');
    expect(available.tone).toBe('available');
    // The pause label must NOT claim "manual" - a pause can be automatic (ban
    // detection, cross-provider isolation, expired-but-unrestored cooldown).
    expect(paused.label).toBe('paused (manual or safety)');
    expect(paused.label).not.toBe('paused (manual)');
    expect(paused.tone).toBe('paused');
    expect(cooling.label).toContain('cooling until');
    expect(cooling.tone).toBe('cooling');

    // The three labels must be mutually distinct (no conflation).
    const labels = new Set([available.label, paused.label, cooling.label]);
    expect(labels.size).toBe(3);
  });

  it('annotates an in-process (memory) cooldown source', () => {
    const now = 1_000_000;
    const cooling = describeAccountState(
      state({ state: 'cooling', cooldownUntil: now + 60_000, cooldownSource: 'memory' }),
      now
    );
    expect(cooling.label).toContain('[in-process]');
  });

  it('shows unknown when a cooling account has no reset time', () => {
    const cooling = describeAccountState(state({ state: 'cooling' }), 1_000_000);
    expect(cooling.label).toContain('unknown');
  });
});

describe('formatCooldownReset', () => {
  it('returns now for a non-positive delta', () => {
    expect(formatCooldownReset(1_000_000, 1_000_000)).toContain('now');
  });

  it('uses minute granularity within the hour', () => {
    const now = 1_000_000;
    expect(formatCooldownReset(now + 5 * 60 * 1000, now)).toContain('5m');
  });

  it('uses hour granularity within the day', () => {
    const now = 1_000_000;
    expect(formatCooldownReset(now + 3 * 3600 * 1000, now)).toContain('3h');
  });
});

describe('modeLabel', () => {
  it('maps each drain order mode to a stable label', () => {
    expect(modeLabel('manual')).toBe('manual (--set)');
    expect(modeLabel('tier')).toBe('tier-derived (--by-tier)');
    expect(modeLabel('file')).toBe('file order');
  });
});

// ---------------------------------------------------------------------------
// renderProviderPoolSection - integration (resume hint, file-mode drift copy,
// pool-on cooling honesty note). Uses an isolated CCS_HOME and captures console.
// ---------------------------------------------------------------------------

describe('renderProviderPoolSection', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let logSpy: ReturnType<typeof spyOn>;
  let lines: string[];

  function writeAuthFile(fileName: string, fields: Record<string, unknown> = {}): void {
    const authDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(authDir, fileName),
      JSON.stringify({ type: 'claude', ...fields }, null, 2),
      { mode: 0o600 }
    );
  }

  const SETTINGS_OFF = {
    poolEnabled: false,
    strategy: 'round-robin',
    sessionAffinityEnabled: false,
    sessionAffinityTtl: '1h',
  } as const;

  const SETTINGS_ON = {
    poolEnabled: true,
    strategy: 'fill-first',
    sessionAffinityEnabled: true,
    sessionAffinityTtl: '1h',
  } as const;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-pool-renderer-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    process.exitCode = 0;
    lines = [];
    logSpy = spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string') lines.push(msg);
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.exitCode = 0;
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('emits a resume hint pointing at the real command when an account is paused', async () => {
    writeAuthFile('claude-a.json', { email: 'a@x.com' });
    writeAuthFile('claude-b.json', { email: 'b@x.com' });

    const { registerAccount, pauseAccount } = await import(
      `../../../cliproxy/accounts/registry?renderer-resume=${Date.now()}`
    );
    registerAccount('claude', 'claude-a.json', 'a@x.com');
    registerAccount('claude', 'claude-b.json', 'b@x.com');
    pauseAccount('claude', 'a@x.com');

    const { renderProviderPoolSection } = await import(
      `../pool-state-renderer?renderer-resume=${Date.now()}`
    );
    await renderProviderPoolSection('claude', SETTINGS_OFF, 1_000_000);

    const output = lines.join('\n');
    // The hint names the actual resume subcommand (ccs cliproxy resume <account>).
    expect(output).toContain('Resume:');
    expect(output).toContain('ccs cliproxy resume <account>');
  });

  it('does NOT emit a resume hint when no account is paused', async () => {
    writeAuthFile('claude-a.json', { email: 'a@x.com' });
    const { registerAccount } = await import(
      `../../../cliproxy/accounts/registry?renderer-no-resume=${Date.now()}`
    );
    registerAccount('claude', 'claude-a.json', 'a@x.com');

    const { renderProviderPoolSection } = await import(
      `../pool-state-renderer?renderer-no-resume=${Date.now()}`
    );
    await renderProviderPoolSection('claude', SETTINGS_OFF, 1_000_000);

    expect(lines.join('\n')).not.toContain('Resume:');
  });

  it('uses honest file-mode drift copy (no "stored order") when residual priorities exist', async () => {
    // Residual on-disk priorities, but no stored drain config -> file mode drift.
    writeAuthFile('claude-a.json', { email: 'a@x.com', priority: 1 });
    writeAuthFile('claude-b.json', { email: 'b@x.com', priority: 5 });

    const { registerAccount } = await import(
      `../../../cliproxy/accounts/registry?renderer-drift=${Date.now()}`
    );
    registerAccount('claude', 'claude-a.json', 'a@x.com');
    registerAccount('claude', 'claude-b.json', 'b@x.com');

    const { renderProviderPoolSection } = await import(
      `../pool-state-renderer?renderer-drift=${Date.now()}`
    );
    await renderProviderPoolSection('claude', SETTINGS_OFF, 1_000_000);

    const output = lines.join('\n');
    expect(output).toContain('Drift:');
    // File mode has no stored order, so the copy must not claim one nor tell the
    // user to "re-apply with --set/--by-tier" (which re-adopts managed ordering).
    expect(output).toContain('residual priorities');
    expect(output).toContain('--reset');
    expect(output).not.toContain('stored order does not match');
    expect(output).not.toContain('re-apply with --set/--by-tier');
  });

  it('prints the in-proxy-cooldown honesty note when pool is ON but no proxy data is available', async () => {
    writeAuthFile('claude-a.json', { email: 'a@x.com' });
    const { registerAccount } = await import(
      `../../../cliproxy/accounts/registry?renderer-note=${Date.now()}`
    );
    registerAccount('claude', 'claude-a.json', 'a@x.com');

    const { renderProviderPoolSection } = await import(
      `../pool-state-renderer?renderer-note=${Date.now()}`
    );
    // No proxy is running in the test home, so the fetch degrades to no data and
    // the honesty note must be printed instead of implying every account is fine.
    await renderProviderPoolSection('claude', SETTINGS_ON, 1_000_000);

    expect(lines.join('\n')).toContain('live in-proxy 429 cooldowns are not shown here');
  });
});
