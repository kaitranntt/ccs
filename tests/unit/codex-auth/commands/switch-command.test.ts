/**
 * Tests for codex-auth switch command.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tempDir: string;
let ccsHome: string;
const ORIG_CCS_HOME = process.env.CCS_HOME;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-switch-test-'));
  ccsHome = path.join(tempDir, 'ccs');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true });
  process.env.CCS_HOME = ccsHome;
});

afterEach(() => {
  if (ORIG_CCS_HOME === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = ORIG_CCS_HOME;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function makeCtxWithProfiles(...names: string[]) {
  const { CodexProfileRegistry } = await import(
    '../../../../src/codex-auth/codex-profile-registry'
  );
  const reg = new CodexProfileRegistry();
  for (const n of names) {
    reg.createProfile(n, { created: new Date().toISOString(), last_used: null });
  }
  return { registry: reg, version: '0.0.0-test' };
}

describe('handleSwitchCodex — sets default', () => {
  it('switches default to named profile', async () => {
    const { handleSwitchCodex } = await import(
      '../../../../src/codex-auth/commands/switch-command'
    );
    const ctx = await makeCtxWithProfiles('alpha', 'beta');

    const out: string[] = [];
    const origLog = console.log;
    console.log = (...a: unknown[]) => out.push(a.join(' '));
    try {
      await handleSwitchCodex(ctx, ['beta']);
    } finally {
      console.log = origLog;
    }

    expect(ctx.registry.getDefault()).toBe('beta');
    expect(out.some((l) => l.includes('beta'))).toBe(true);
  });
});

describe('handleSwitchCodex — unknown profile', () => {
  it('exits non-zero for unknown profile name', async () => {
    const { handleSwitchCodex } = await import(
      '../../../../src/codex-auth/commands/switch-command'
    );
    const ctx = await makeCtxWithProfiles('alpha');

    let exitCode = -1;
    const origExit = process.exit;
    process.exit = (code?: number) => {
      exitCode = code ?? 0;
      throw new Error('exit');
    };
    try {
      await handleSwitchCodex(ctx, ['doesnotexist']);
    } catch {
      /* expected */
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBeGreaterThan(0);
  });
});

describe('handleSwitchCodex — output format', () => {
  it('includes [OK] in output on success', async () => {
    const { handleSwitchCodex } = await import(
      '../../../../src/codex-auth/commands/switch-command'
    );
    const ctx = await makeCtxWithProfiles('myprofile');

    const out: string[] = [];
    const origLog = console.log;
    console.log = (...a: unknown[]) => out.push(a.join(' '));
    try {
      await handleSwitchCodex(ctx, ['myprofile']);
    } finally {
      console.log = origLog;
    }

    const combined = out.join('\n');
    expect(combined).toContain('myprofile');
    // Should mention persistent default note
    expect(combined).toContain('persistent default');
  });
});
